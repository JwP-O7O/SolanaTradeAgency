// ============================================================
// SOLANA TRADE AGENCY - ENHANCED VERSION 3.0
// Multi-agent system with dashboard integration
// ============================================================

require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs-extra');
const chalk = require('chalk');

// Agents
const EnhancedScoutAgent = require('./agents/scout-enhanced');
const AnalystAgent = require('./agents/analyst');
const EnhancedSentimentAgent = require('./agents/sentiment-enhanced');
const EnhancedRiskManagerAgent = require('./agents/risk-manager-enhanced');
const EnhancedExecutionAgent = require('./agents/execution-enhanced');

// Services
const AgentConnectorService = require('./services/agentConnector');
const MemorySystem = require('./memory/memorySystem');
const Logger = require('./utils/logger');

const MODE = process.env.MODE || 'paper';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

class EnhancedSolanaTradeAgency {
  constructor() {
    this.logger = Logger.create('AGENCY');
    this.mode = MODE;
    this.connection = null;
    this.wallet = null;
    this.agents = {};
    this.memory = new MemorySystem();
    this.connector = new AgentConnectorService(DASHBOARD_URL);
    this.isRunning = false;
    this.cycleCount = 0;
    this.startTime = Date.now();

    // Agency state
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
    this.logger.info(chalk.cyan('╔════════════════════════════════════════╗'));
    this.logger.info(chalk.cyan('║  SOLANA TRADE AGENCY v3.0 - ENHANCED   ║'));
    this.logger.info(chalk.cyan('║  Multi-Agent Trading System            ║'));
    this.logger.info(chalk.cyan('╚════════════════════════════════════════╝'));
    this.logger.info(chalk.yellow(`Mode: ${this.mode.toUpperCase()}`));

    // Solana connection
    this.connection = new Connection(
      process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    // Wallet setup
    if (this.mode === 'live') {
      const keyData = JSON.parse(await fs.readFile('./config/wallet.json', 'utf-8'));
      this.wallet = Keypair.fromSecretKey(new Uint8Array(keyData));
      this.logger.info(chalk.green(`Wallet: ${this.wallet.publicKey.toString()}`));
    } else {
      this.wallet = Keypair.generate();
      this.logger.info(chalk.blue('Paper/Backtest wallet generated'));
    }

    // Memory system
    await this.memory.initialize();
    this.logger.info(chalk.green('Memory system initialized'));

    // Initialize agents
    this.agents.scout = new EnhancedScoutAgent(this.connection, this.memory);
    this.agents.analyst = new AnalystAgent(this.connection, this.memory);
    this.agents.sentiment = new EnhancedSentimentAgent(this.memory);
    this.agents.riskManager = new EnhancedRiskManagerAgent(this.state, this.memory);
    this.agents.execution = new EnhancedExecutionAgent(this.connection, this.wallet, this.mode);

    for (const [name, agent] of Object.entries(this.agents)) {
      await agent.initialize();
      this.logger.info(chalk.green(`✓ Agent [${name}] initialized`));
    }

    // Connect to dashboard
    try {
      await this.connector.connect();
      this.logger.info(chalk.green(`✓ Connected to dashboard at ${DASHBOARD_URL}`));
    } catch (error) {
      this.logger.warn(chalk.yellow(`Dashboard connection failed: ${error.message}`));
      this.logger.info(chalk.yellow('Continuing in offline mode...'));
    }

    this.logger.info(chalk.green('═══════════════════════════════════════════'));
    this.logger.info(chalk.green('AGENCY FULLY OPERATIONAL'));
    this.logger.info(chalk.green('═══════════════════════════════════════════'));
  }

  async runCycle() {
    this.cycleCount++;
    const cycleStart = Date.now();

    try {
      this.logger.info(chalk.blue(`\n▶ Cycle #${this.cycleCount} starting...`));

      // STEP 1: Scout - Find opportunities
      this.connector.emitAgentStatus('scout', 'SCANNING');
      const opportunities = await this.agents.scout.scan();
      this.connector.emitScoutStatus(this.agents.scout);

      if (opportunities.length === 0) {
        this.logger.info(chalk.gray('Scout: No opportunities found'));
        return;
      }

      this.logger.info(chalk.cyan(`Scout: ${opportunities.length} opportunities found`));
      this.connector.emitOpportunities(opportunities);

      // STEP 2: Sentiment analysis on top opportunities
      const topOpps = opportunities.slice(0, 5);
      for (const opp of topOpps) {
        opp.sentiment = await this.agents.sentiment.analyze(opp.token);
      }
      this.connector.emitSentimentStatus(this.agents.sentiment);

      // STEP 3: Technical analysis
      this.connector.emitAgentStatus('analyst', 'ANALYZING');
      const signals = [];
      for (const opp of topOpps) {
        if (opp.sentiment && opp.sentiment.score < 0.3) {
          this.logger.info(chalk.yellow(`Skipping ${opp.symbol}: Negative sentiment`));
          continue;
        }
        const signal = await this.agents.analyst.analyze(opp);
        if (signal && signal.action !== 'HOLD') {
          signals.push(signal);
          this.connector.emitSignal(signal);
        }
      }
      this.connector.emitAnalystStatus(this.agents.analyst);

      if (signals.length === 0) {
        this.logger.info(chalk.gray('Analyst: No strong signals generated'));
        return;
      }

      this.logger.info(chalk.cyan(`Analyst: ${signals.length} signals generated`));

      // STEP 4: Risk Manager evaluation
      this.connector.emitAgentStatus('riskManager', 'EVALUATING');
      const approvedSignals = [];
      for (const signal of signals) {
        const approval = await this.agents.riskManager.evaluate(signal, this.state.portfolio);
        if (approval.approved) {
          signal.positionSize = approval.positionSize;
          signal.stopLoss = approval.stopLoss;
          signal.takeProfit = approval.takeProfit;
          approvedSignals.push(signal);
          this.logger.info(chalk.green(`✓ Trade approved: ${signal.symbol} | Size: $${approval.positionSize.toFixed(2)}`));
        } else {
          this.logger.info(chalk.yellow(`✗ Trade rejected: ${signal.symbol} | Reason: ${approval.reason}`));
        }
      }
      this.connector.emitRiskManagerStatus(this.agents.riskManager);

      // STEP 5: Execution
      this.connector.emitAgentStatus('execution', 'EXECUTING');
      for (const signal of approvedSignals) {
        const result = await this.agents.execution.execute(signal);
        if (result.success) {
          this.recordTrade(signal, result);
          await this.memory.saveTrade(signal, result);
          this.connector.emitTradeExecuted(result);
          this.logger.info(chalk.green(`✓ Trade executed: ${signal.symbol} | ID: ${result.tradeId}`));
        } else {
          this.logger.warn(chalk.red(`✗ Trade failed: ${signal.symbol} | Error: ${result.error}`));
          this.connector.emitError('execution', result.error, 'warning');
        }
      }
      this.connector.emitExecutionStatus(this.agents.execution);

      // STEP 6: Monitor open positions
      await this.monitorOpenPositions();

      // Update stats
      this.updatePerformanceStats();
      this.state.lastUpdate = new Date().toISOString();
      this.connector.emitPortfolioUpdate(this.state.portfolio, this.state.performance);

      const cycleDuration = Date.now() - cycleStart;
      this.logger.info(chalk.green(`✓ Cycle completed in ${cycleDuration}ms`));

    } catch (error) {
      this.logger.error(chalk.red('Cycle error:'), error.message);
      this.connector.emitError('agency', error.message, 'error');
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

      if (pnlPct >= pos.takeProfitPct) {
        shouldExit = true;
        exitReason = 'TAKE_PROFIT';
      } else if (pnlPct <= -pos.stopLossPct) {
        shouldExit = true;
        exitReason = 'STOP_LOSS';
      } else if (Date.now() - pos.entryTime > pos.maxHoldMs) {
        shouldExit = true;
        exitReason = 'MAX_HOLD_TIME';
      }

      // Trailing stop
      if (pos.trailingStop && pnlPct > pos.trailingActivation) {
        if (!pos.highestPrice || currentPrice > pos.highestPrice) {
          pos.highestPrice = currentPrice;
        }
        if (currentPrice <= pos.highestPrice * (1 - pos.trailingDistance)) {
          shouldExit = true;
          exitReason = 'TRAILING_STOP';
        }
      }

      if (shouldExit) {
        await this.agents.execution.closePosition(pos, currentPrice, exitReason);
        const closedTrade = {
          ...pos,
          exitPrice: currentPrice,
          exitReason,
          pnlPct,
          closedAt: Date.now(),
        };
        this.state.portfolio.closedTrades.push(closedTrade);
        positions.splice(i, 1);
        await this.memory.saveTrade(closedTrade, { type: 'EXIT' });
        this.connector.emitTradeClosed(closedTrade, currentPrice, exitReason, pnlPct);
        this.logger.info(chalk.yellow(`Position closed: ${exitReason} | P&L: ${pnlPct.toFixed(2)}%`));
      }
    }
  }

  recordTrade(signal, result) {
    const position = {
      id: `T-${Date.now()}`,
      tradeId: result.tradeId,
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
    perf.avgWin = winners.length > 0 
      ? (winners.reduce((s, t) => s + t.pnlPct, 0) / winners.length).toFixed(2) 
      : 0;
    perf.avgLoss = losers.length > 0 
      ? (losers.reduce((s, t) => s + t.pnlPct, 0) / losers.length).toFixed(2) 
      : 0;

    const totalPnL = trades.reduce((s, t) => s + (t.pnlPct / 100 * t.positionSize), 0);
    this.state.portfolio.totalPnL = totalPnL.toFixed(2);
    this.state.portfolio.currentCapital = (this.state.portfolio.initialCapital + totalPnL).toFixed(2);
  }

  async start() {
    await this.initialize();
    this.isRunning = true;

    const intervalMs = parseInt(process.env.CYCLE_INTERVAL_MS || '5000');
    this.logger.info(chalk.cyan(`Trading cycle every ${intervalMs / 1000}s`));

    const loop = async () => {
      if (!this.isRunning) return;
      await this.runCycle();
      setTimeout(loop, intervalMs);
    };

    loop();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      this.logger.info(chalk.red('\n⏹ Shutdown signal received...'));
      this.isRunning = false;
      this.connector.disconnect();
      await this.memory.save();
      this.logger.info(chalk.green('✓ Agency safely shut down'));
      process.exit(0);
    });
  }
}

// Start the agency
const agency = new EnhancedSolanaTradeAgency();
agency.start().catch(err => {
  console.error(chalk.red('CRITICAL ERROR:'), err);
  process.exit(1);
});
