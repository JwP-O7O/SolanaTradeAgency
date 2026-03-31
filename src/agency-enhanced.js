// ----------------------------------------------------------------------------
// AUTONOMOUS SOLANA TRADE AGENCY - FULLY INTEGRATED V4.0
// Scout → Sentiment → Analyst → Risk (Enhanced) → Execution → Optimizer
// ----------------------------------------------------------------------------

const logger = require('./utils/logger');
const DexScreenerService = require('./services/dexScreenerService');
const DataCollector = require('./services/dataCollector');
const EnhancedScoutAgent = require('./agents/scout-enhanced');
const EnhancedSentimentAgent = require('./agents/sentiment-enhanced');
const EnhancedAnalystAgent = require('./agents/analyst');
const EnhancedRiskManagerAgent = require('./agents/risk-manager-enhanced');
const EnhancedExecutionAgent = require('./agents/execution-enhanced');
const MemorySystem = require('./memory/memorySystem');
const strategyOptimizer = require('./optimization/strategyOptimizer');
const { getNotificationManager } = require('./notifications/notificationRules');

class AutonomousAgency {
  constructor() {
    this.state = {
      isTrading: false,
      portfolio: {
        initialBalance: 1.0, 
        currentBalance: 1.0,
        positions: [],
        history: []
      },
      stats: {
        totalTrades: 0,
        wins: 0,
        losses: 0
      }
    };

    this.dexScreener = new DexScreenerService();
    this.dataCollector = new DataCollector();
    this.memory = new MemorySystem();
    this.notifier = getNotificationManager();

    this.scout = new EnhancedScoutAgent();
    this.sentiment = new EnhancedSentimentAgent();
    this.analyst = new EnhancedAnalystAgent();
    this.risk = new EnhancedRiskManagerAgent();
    this.execution = new EnhancedExecutionAgent();

    this.interval = null;
  }

  async start() {
    if (this.state.isTrading) return;
    logger.info('🚀 JwP Solana Trading Agency v4.0 opstarten...');
    this.state.isTrading = true;
    const loopInterval = process.env.MONITORING_INTERVAL || 30000;
    this.runCycle();
    this.interval = setInterval(() => this.runCycle(), loopInterval);
    this.notifier.sendCustomNotification('🚀 Agency Started', 'Trading agency is nu actief.');
  }

  async runCycle() {
    logger.perf.start('cycle');
    try {
      const candidates = await this.scout.findCandidates();
      if (candidates.length === 0) return;

      for (const token of candidates) {
        const tokenData = await this.dataCollector.collect(token.address);
        const sentimentResult = await this.sentiment.analyze(tokenData);
        const analysis = await this.analyst.analyze(tokenData, sentimentResult);
        
        if (analysis.signal === 'BUY') {
          const riskResult = await this.risk.assessRisk({
            token: token.symbol,
            address: token.address,
            confidence: analysis.confidence,
            strategy: analysis.recommendedStrategy,
            sentiment: sentimentResult.score,
            volatility: analysis.volatility
          }, this.state.portfolio);

          if (riskResult.approved) {
            const trade = await this.execution.executeTrade({
              token: token.symbol,
              address: token.address,
              amount: riskResult.positionSize,
              params: riskResult.params
            });
            if (trade.success) this.handleTradeOpened(trade);
          }
        }
      }
      await this.monitorPositions();
    } catch (error) {
      logger.logError(error, { service: 'Agency' });
      this.notifier.onError(error);
    } finally {
      logger.perf.end('cycle');
    }
  }

  async monitorPositions() {
    for (const pos of this.state.portfolio.positions) {
      const currentStatus = await this.dataCollector.getPrice(pos.address);
      const exitResult = await this.execution.checkExit(pos, currentStatus);
      if (exitResult.shouldExit) {
        const closedTrade = await this.execution.closeTrade(pos, exitResult.reason);
        this.handleTradeClosed(closedTrade);
      }
    }
  }

  handleTradeOpened(trade) {
    this.state.portfolio.positions.push(trade);
    this.state.portfolio.currentBalance -= trade.cost;
    this.notifier.onTradeEntry(trade);
    logger.trade('TRADE_OPENED', trade);
  }

  handleTradeClosed(trade) {
    this.state.portfolio.positions = this.state.portfolio.positions.filter(p => p.id !== trade.id);
    this.state.portfolio.currentBalance += (trade.cost + trade.pnl);
    this.state.stats.totalTrades++;
    if (trade.pnl > 0) this.state.stats.wins++; else this.state.stats.losses++;
    this.risk.updateStatus(trade);
    strategyOptimizer.updatePerformance(trade.strategy, {
      pnl: trade.pnl,
      pnlPercent: trade.pnlPercent
    });
    this.notifier.onTradeExit(trade);
    logger.trade('TRADE_CLOSED', trade);
    this.memory.saveTrade(trade);
  }
}

module.exports = AutonomousAgency;
