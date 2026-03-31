// ============================================================
// SOLANA TRADE AGENCY - ENHANCED ORCHESTRATOR
// Scout → (SignalBus: MEMECOIN_HIT) → Analyst → Risk → Execution
// ============================================================

require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const fs   = require('fs-extra');
const chalk = require('chalk');

// Core
const { SignalBus, SIGNALS } = require('./services/signalBus');
const MemorySystem  = require('./memory/memorySystem');
const Logger        = require('./utils/logger');

// Enhanced agents
const EnhancedScoutAgent    = require('./agents/scout-enhanced');
const AnalystAgent          = require('./agents/analyst');
const EnhancedRiskManager   = require('./agents/risk-manager-enhanced');
const EnhancedExecutionAgent = require('./agents/execution-enhanced');
const EnhancedSentimentAgent = require('./agents/sentiment-enhanced');

const MODE = process.env.MODE || 'paper';

class EnhancedSolanaTradeAgency {
  constructor() {
    this.logger  = Logger.create('AGENCY-ENHANCED');
    this.mode    = MODE;
    this.bus     = new SignalBus();   // ← Central signal bus
    this.memory  = new MemorySystem();
    this.agents  = {};
    this.isRunning  = false;
    this.cycleCount = 0;
    this.startTime  = Date.now();

    this.state = {
      mode: this.mode,
      portfolio: {
        initialCapital: parseFloat(process.env.INITIAL_CAPITAL || '1000'),
        currentCapital: parseFloat(process.env.INITIAL_CAPITAL || '1000'),
        totalPnL: 0,
        dailyPnL: 0,
        openPositions: [],
        closedTrades: [],
      },
      performance: {
        totalTrades: 0, winningTrades: 0, losingTrades: 0,
        winRate: 0, avgWin: 0, avgLoss: 0,
        sharpeRatio: 0, maxDrawdown: 0, profitFactor: 0,
      },
      agents: {},
      lastUpdate: new Date().toISOString(),
    };
  }

  async initialize() {
    this.logger.info(chalk.cyan('== SOLANA TRADE AGENCY ENHANCED OPSTARTEN =='));
    this.logger.info(chalk.yellow(`Modus: ${this.mode.toUpperCase()}`));

    this.connection = new Connection(
      process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    if (this.mode === 'live') {
      const keyData = JSON.parse(await fs.readFile('./config/wallet.json', 'utf-8'));
      this.wallet = Keypair.fromSecretKey(new Uint8Array(keyData));
      this.logger.info(chalk.green(`Wallet: ${this.wallet.publicKey.toString()}`));
    } else {
      this.wallet = Keypair.generate();
      this.logger.info(chalk.blue('Paper/Backtest wallet gegenereerd'));
    }

    await this.memory.initialize();

    // ── Create agents, pass SignalBus to Scout ──────────────
    this.agents.scout     = new EnhancedScoutAgent(this.connection, this.memory, this.bus);
    this.agents.analyst   = new AnalystAgent(this.connection, this.memory);
    this.agents.risk      = new EnhancedRiskManager(this.state, this.memory);
    this.agents.execution = new EnhancedExecutionAgent(this.connection, this.wallet, this.mode);
    this.agents.sentiment = new EnhancedSentimentAgent(this.memory);

    for (const [name, agent] of Object.entries(this.agents)) {
      await agent.initialize();
      this.logger.info(chalk.green(`Agent [${name}] gereed`));
    }

    // ── Wire SignalBus listeners ────────────────────────────
    this._wireSignalHandlers();

    this.logger.info(chalk.green('== AGENCY VOLLEDIG OPERATIONEEL =='));
    this.logger.info(chalk.cyan('SignalBus actief – Scout monitort DEX Screener continu'));
  }

  // ── Signal pipeline ──────────────────────────────────────

  _wireSignalHandlers() {

    // 1. Scout → Analyst: when a memecoin hit is detected
    this.bus.on(SIGNALS.MEMECOIN_HIT, async (envelope) => {
      const opp = envelope.payload;
      this.logger.info(chalk.magenta(
        `📡 SIGNAL [MEMECOIN_HIT] ${opp.symbol} score=${opp.totalScore?.toFixed(1)} ` +
        `Δ5m=${opp.priceChange5m?.toFixed(2)}%`
      ));

      try {
        // Step 1: Quick sentiment gate
        const sentiment = await this.agents.sentiment.analyze(opp.token);
        if (sentiment && sentiment.score < 0.25) {
          this.logger.info(`Sentiment te laag voor ${opp.symbol} (${sentiment.score.toFixed(2)}) – skip`);
          this.bus.signal(SIGNALS.ALERT, { reason: 'sentiment_too_low', token: opp.token, symbol: opp.symbol }, 'agency');
          return;
        }

        // Step 2: Technical analysis
        const signal = await this.agents.analyst.analyze(opp);
        if (!signal || signal.action === 'HOLD') {
          this.logger.info(`Analyst: HOLD voor ${opp.symbol}`);
          return;
        }

        this.bus.signal(SIGNALS.TRADE_SIGNAL, {
          ...signal,
          originalHit: opp,
        }, 'analyst');

      } catch (err) {
        this.logger.error(`Signal pipeline fout (${opp.symbol}):`, err.message);
      }
    });

    // 2. Analyst → Risk Manager
    this.bus.on(SIGNALS.TRADE_SIGNAL, async (envelope) => {
      const signal = envelope.payload;
      this.logger.info(chalk.blue(
        `📡 SIGNAL [TRADE_SIGNAL] ${signal.symbol} ${signal.action} conf=${signal.confidence}`
      ));

      try {
        const approval = await this.agents.risk.evaluate(signal, this.state.portfolio);

        if (approval.approved) {
          signal.positionSize = approval.positionSize;
          signal.stopLoss     = approval.stopLoss;
          signal.takeProfit   = approval.takeProfit;
          this.bus.signal(SIGNALS.TRADE_APPROVED, signal, 'risk');
        } else {
          this.bus.signal(SIGNALS.TRADE_REJECTED, { signal, reason: approval.reason }, 'risk');
          this.logger.info(chalk.yellow(`Risk: Afgewezen – ${approval.reason}`));
        }
      } catch (err) {
        this.logger.error('Risk evaluation fout:', err.message);
      }
    });

    // 3. Risk → Execution
    this.bus.on(SIGNALS.TRADE_APPROVED, async (envelope) => {
      const signal = envelope.payload;
      this.logger.info(chalk.green(
        `📡 SIGNAL [TRADE_APPROVED] ${signal.symbol} ${signal.action} ` +
        `size=$${signal.positionSize} sl=${signal.stopLoss}% tp=${signal.takeProfit}%`
      ));

      try {
        const result = await this.agents.execution.execute(signal);
        if (result.success) {
          this._recordTrade(signal, result);
          await this.memory.saveTrade(signal, result);
          this.bus.signal(SIGNALS.TRADE_EXECUTED, { signal, result }, 'execution');
          this.logger.info(chalk.green(
            `✅ TRADE UITGEVOERD: ${signal.symbol} ${signal.action} @ $${result.price}`
          ));
        }
      } catch (err) {
        this.logger.error('Execution fout:', err.message);
      }
    });

    // 4. Log rejected signals
    this.bus.on(SIGNALS.TRADE_REJECTED, (envelope) => {
      const { signal, reason } = envelope.payload;
      this.logger.info(chalk.yellow(`❌ Trade afgewezen: ${signal.symbol} – ${reason}`));
    });

    // 5. Log all signals to memory (catch-all)
    this.bus.on('SIGNAL', async (envelope) => {
      if ([SIGNALS.MEMECOIN_HIT, SIGNALS.TRADE_EXECUTED, SIGNALS.TRADE_REJECTED].includes(envelope.type)) {
        try { await this.memory.set(`signal:${envelope.id}`, envelope); } catch (_) {}
      }
    });
  }

  // ── Periodic cycle: monitor open positions + update stats ─

  async runCycle() {
    this.cycleCount++;
    try {
      await this.monitorOpenPositions();
      this.updatePerformanceStats();
      this.state.lastUpdate = new Date().toISOString();
      if (this.cycleCount % 12 === 0) { // every ~60s at 5s cycle
        this.logger.info(
          `Cyclus #${this.cycleCount} | Posities: ${this.state.portfolio.openPositions.length} ` +
          `| Signals in bus: ${this.bus.history.length} | Opps: ${this.agents.scout.opportunities.length}`
        );
      }
    } catch (err) {
      this.logger.error('Cyclus fout:', err.message);
    }
  }

  async monitorOpenPositions() {
    const positions = this.state.portfolio.openPositions;
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i];
      const currentPrice = await this.agents.analyst.getCurrentPrice(pos.token);
      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

      let shouldExit = false;
      let exitReason = '';

      if (pnlPct >= pos.takeProfitPct)                         { shouldExit = true; exitReason = 'TAKE_PROFIT'; }
      else if (pnlPct <= -pos.stopLossPct)                     { shouldExit = true; exitReason = 'STOP_LOSS'; }
      else if (Date.now() - pos.entryTime > pos.maxHoldMs)     { shouldExit = true; exitReason = 'MAX_HOLD_TIME'; }

      if (pos.trailingStop && pnlPct > pos.trailingActivation) {
        if (!pos.highestPrice || currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
        if (currentPrice <= pos.highestPrice * (1 - pos.trailingDistance)) {
          shouldExit = true; exitReason = 'TRAILING_STOP';
        }
      }

      if (shouldExit) {
        await this.agents.execution.closePosition(pos, currentPrice, exitReason);
        const closed = { ...pos, exitPrice: currentPrice, exitReason, pnlPct, closedAt: Date.now() };
        this.state.portfolio.closedTrades.push(closed);
        positions.splice(i, 1);
        await this.memory.saveTrade(closed, { type: 'EXIT' });
        this.bus.signal(SIGNALS.TRADE_CLOSED, closed, 'execution');
        this.logger.info(chalk.yellow(`Positie gesloten: ${exitReason} | PnL: ${pnlPct.toFixed(2)}%`));
      }
    }
  }

    // FASE 1.3: maxHoldMs uit strategy halen i.p.v. hardcoded
  getMaxHoldMs(strategy) {
    if (strategy === 'MEME_MICRO_SCALP') {
      return parseInt(process.env.MICRO_MAX_HOLD_MS) || 180000; // 3 min default
    }
    return 15 * 60_000; // 15 min voor andere strategies
  }

  _recordTrade(signal, result) {
    this.state.portfolio.openPositions.push({
      id:                `T-${Date.now()}`,
      token:             signal.token,
      symbol:            signal.symbol,
      action:            signal.action,
      entryPrice:        result.price,
      entryTime:         Date.now(),
      positionSize:      signal.positionSize,
      takeProfitPct:     signal.takeProfit,
      stopLossPct:       signal.stopLoss,
      trailingStop:      true,
      trailingActivation: 0.8,
      trailingDistance:  0.004,
      maxHoldMs:       this.getMaxHoldMs(signal.strategy),      confidence:        signal.confidence,
    });
    this.state.performance.totalTrades++;
  }

  updatePerformanceStats() {
    const trades = this.state.portfolio.closedTrades;
    if (!trades.length) return;
    const winners = trades.filter(t => t.pnlPct > 0);
    const losers  = trades.filter(t => t.pnlPct <= 0);
    const perf    = this.state.performance;
    perf.winningTrades = winners.length;
    perf.losingTrades  = losers.length;
    perf.winRate       = (winners.length / trades.length * 100).toFixed(1);
    perf.avgWin  = winners.length ? (winners.reduce((s, t) => s + t.pnlPct, 0) / winners.length).toFixed(2) : 0;
    perf.avgLoss = losers.length  ? (losers.reduce((s, t)  => s + t.pnlPct, 0) / losers.length).toFixed(2)  : 0;
    const totalPnL = trades.reduce((s, t) => s + (t.pnlPct / 100 * t.positionSize), 0);
    this.state.portfolio.totalPnL        = totalPnL.toFixed(2);
    this.state.portfolio.currentCapital  = (this.state.portfolio.initialCapital + totalPnL).toFixed(2);
  }

  async start() {
    await this.initialize();
    this.isRunning = true;
    const intervalMs = parseInt(process.env.CYCLE_INTERVAL_MS || '5000');
    this.logger.info(chalk.cyan(`Monitoring cyclus elke ${intervalMs / 1000}s`));

    const loop = async () => {
      if (!this.isRunning) return;
      await this.runCycle();
      setTimeout(loop, intervalMs);
    };
    loop();

    process.on('SIGINT', async () => {
      this.logger.info(chalk.red('Shutdown...'));
      this.isRunning = false;
      await this.agents.scout.stop();
      await this.memory.save();
      this.logger.info(chalk.green('Agency veilig afgesloten.'));
      process.exit(0);
    });
  }
}

const agency = new EnhancedSolanaTradeAgency();
agency.start().catch(err => {
  console.error('KRITIEKE FOUT:', err);
  process.exit(1);
});
