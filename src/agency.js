// ============================================================
// SOLANA TRADE AGENCY - Hoofd Orchestrator
// Versie 2.0 | Autonoom Multi-Agent Trading Systeem
// Combineert: ScalpingBot + Ignition Scalper + Nieuwe Agents
// ============================================================

require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// Agents importeren
const ScoutAgent = require('./agents/scout');
const AnalystAgent = require('./agents/analyst');
const RiskManagerAgent = require('./agents/riskManager');
const ExecutionAgent = require('./agents/execution');
const SentimentAgent = require('./agents/sentiment');
const MemorySystem = require('./memory/memorySystem');
const DashboardServer = require('./dashboard/server');
const Logger = require('./utils/logger');

const MODE = process.env.MODE || 'paper'; // 'backtest', 'paper', 'live'

class SolanaTradeAgency {
  constructor() {
    this.logger = Logger.create('AGENCY');
    this.mode = MODE;
    this.connection = null;
    this.wallet = null;
    this.agents = {};
    this.memory = new MemorySystem();
    this.isRunning = false;
    this.cycleCount = 0;
    this.startTime = Date.now();

    // Agency-brede state
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
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        profitFactor: 0,
      },
      agents: {},
      lastUpdate: new Date().toISOString(),
    };
  }

  async initialize() {
    this.logger.info(chalk.cyan('== SOLANA TRADE AGENCY v2.0 OPSTARTEN =='));
    this.logger.info(chalk.yellow(`Modus: ${this.mode.toUpperCase()}`));

    // Solana verbinding
    this.connection = new Connection(
      process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    // Wallet laden
    if (this.mode === 'live') {
      const keyData = JSON.parse(await fs.readFile('./config/wallet.json', 'utf-8'));
      this.wallet = Keypair.fromSecretKey(new Uint8Array(keyData));
      this.logger.info(chalk.green(`Wallet: ${this.wallet.publicKey.toString()}`));
    } else {
      this.wallet = Keypair.generate();
      this.logger.info(chalk.blue('Paper/Backtest wallet gegenereerd'));
    }

    // Memory systeem initialiseren
    await this.memory.initialize();

    // Agents initialiseren
    this.agents.scout = new ScoutAgent(this.connection, this.memory);
    this.agents.analyst = new AnalystAgent(this.connection, this.memory);
    this.agents.riskManager = new RiskManagerAgent(this.state, this.memory);
    this.agents.execution = new ExecutionAgent(this.connection, this.wallet, this.mode);
    this.agents.sentiment = new SentimentAgent(this.memory);

    // Alle agents initialiseren
    for (const [name, agent] of Object.entries(this.agents)) {
      await agent.initialize();
      this.logger.info(chalk.green(`Agent [${name}] gereed`));
    }

    // Dashboard starten
    this.dashboard = new DashboardServer(this.state, this.agents);
    await this.dashboard.start();

    this.logger.info(chalk.green('== AGENCY VOLLEDIG OPERATIONEEL =='));
  }

  async runCycle() {
    this.cycleCount++;
    this.logger.info(chalk.blue(`Cyclus #${this.cycleCount} starten...`));

    try {
      // STAP 1: Scout - Zoek tokens met potentieel
      const opportunities = await this.agents.scout.scan();
      if (opportunities.length === 0) {
        this.logger.info('Scout: Geen kansen gevonden deze cyclus');
        return;
      }

      this.logger.info(`Scout: ${opportunities.length} kansen gevonden`);

      // STAP 2: Sentiment check op top opportuniteiten
      const topOpps = opportunities.slice(0, 5);
      for (const opp of topOpps) {
        opp.sentiment = await this.agents.sentiment.analyze(opp.token);
      }

      // STAP 3: Analyst - Technische analyse op gefilterde kansen
      const signals = [];
      for (const opp of topOpps) {
        if (opp.sentiment && opp.sentiment.score < 0.3) continue; // Slechte sentiment skippen
        const signal = await this.agents.analyst.analyze(opp);
        if (signal && signal.action !== 'HOLD') {
          signals.push(signal);
        }
      }

      if (signals.length === 0) {
        this.logger.info('Analyst: Geen sterke signalen');
        return;
      }

      // STAP 4: Risk Manager - Goedkeuring & positiegrootte
      const approvedSignals = [];
      for (const signal of signals) {
        const approval = await this.agents.riskManager.evaluate(signal, this.state.portfolio);
        if (approval.approved) {
          signal.positionSize = approval.positionSize;
          signal.stopLoss = approval.stopLoss;
          signal.takeProfit = approval.takeProfit;
          approvedSignals.push(signal);
        } else {
          this.logger.info(`Risk Manager: Trade afgewezen - ${approval.reason}`);
        }
      }

      // STAP 5: Executie van goedgekeurde trades
      for (const signal of approvedSignals) {
        const result = await this.agents.execution.execute(signal);
        if (result.success) {
          this.recordTrade(signal, result);
          await this.memory.saveTrade(signal, result);
          this.logger.info(chalk.green(`Trade uitgevoerd: ${signal.token} ${signal.action}`));
        }
      }

      // STAP 6: Open posities monitoren & exiteren indien nodig
      await this.monitorOpenPositions();

      // Stats updaten
      this.updatePerformanceStats();
      this.state.lastUpdate = new Date().toISOString();

    } catch (error) {
      this.logger.error('Fout in cyclus:', error.message);
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

      if (pnlPct >= pos.takeProfitPct) { shouldExit = true; exitReason = 'TAKE_PROFIT'; }
      else if (pnlPct <= -pos.stopLossPct) { shouldExit = true; exitReason = 'STOP_LOSS'; }
      else if (Date.now() - pos.entryTime > pos.maxHoldMs) { shouldExit = true; exitReason = 'MAX_HOLD_TIME'; }

      // Trailing stop
      if (pos.trailingStop && pnlPct > pos.trailingActivation) {
        const newStop = currentPrice * (1 - pos.trailingDistance);
        if (!pos.highestPrice || currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
        if (currentPrice <= pos.highestPrice * (1 - pos.trailingDistance)) {
          shouldExit = true; exitReason = 'TRAILING_STOP';
        }
      }

      if (shouldExit) {
        await this.agents.execution.closePosition(pos, currentPrice, exitReason);
        const closedTrade = { ...pos, exitPrice: currentPrice, exitReason, pnlPct, closedAt: Date.now() };
        this.state.portfolio.closedTrades.push(closedTrade);
        positions.splice(i, 1);
        await this.memory.saveTrade(closedTrade, { type: 'EXIT' });
        this.logger.info(chalk.yellow(`Positie gesloten: ${exitReason} | PnL: ${pnlPct.toFixed(2)}%`));
      }
    }
  }

  recordTrade(signal, result) {
    const position = {
      id: `T-${Date.now()}`,
      token: signal.token,
      symbol: signal.symbol,
      action: signal.action,
      entryPrice: result.price,
      entryTime: Date.now(),
      positionSize: signal.positionSize,
      takeProfitPct: signal.takeProfit,
      stopLossPct: signal.stopLoss,
      maxHoldMs: 15 * 60 * 1000,
      trailingStop: true,
      trailingActivation: 0.8,
      trailingDistance: 0.004,
      strategy: signal.strategy,
      confidence: signal.confidence,
    };
    this.state.portfolio.openPositions.push(position);
    this.state.performance.totalTrades++;
  }

  updatePerformanceStats() {
    const trades = this.state.portfolio.closedTrades;
    if (trades.length === 0) return;
    const winners = trades.filter(t => t.pnlPct > 0);
    const losers = trades.filter(t => t.pnlPct <= 0);
    const perf = this.state.performance;
    perf.winningTrades = winners.length;
    perf.losingTrades = losers.length;
    perf.winRate = (winners.length / trades.length * 100).toFixed(1);
    perf.avgWin = winners.length > 0 ? (winners.reduce((s, t) => s + t.pnlPct, 0) / winners.length).toFixed(2) : 0;
    perf.avgLoss = losers.length > 0 ? (losers.reduce((s, t) => s + t.pnlPct, 0) / losers.length).toFixed(2) : 0;
    const totalPnL = trades.reduce((s, t) => s + (t.pnlPct / 100 * t.positionSize), 0);
    this.state.portfolio.totalPnL = totalPnL.toFixed(2);
    this.state.portfolio.currentCapital = (this.state.portfolio.initialCapital + totalPnL).toFixed(2);
  }

  async start() {
    await this.initialize();
    this.isRunning = true;
    const intervalMs = parseInt(process.env.CYCLE_INTERVAL_MS || '5000');
    this.logger.info(chalk.cyan(`Trading cyclus elke ${intervalMs / 1000}s`));

    const loop = async () => {
      if (!this.isRunning) return;
      await this.runCycle();
      setTimeout(loop, intervalMs);
    };
    loop();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      this.logger.info(chalk.red('Shutdown signaal ontvangen...'));
      this.isRunning = false;
      await this.memory.save();
      this.logger.info(chalk.green('Agency veilig afgesloten.'));
      process.exit(0);
    });
  }
}

// Start de agency
const agency = new SolanaTradeAgency();
agency.start().catch(err => {
  console.error('KRITIEKE FOUT:', err);
  process.exit(1);
});
