// RISK MANAGER AGENT
const Logger = require('../utils/logger');

class RiskManagerAgent {
  constructor(state, memory) {
    this.mory = memory; this.logger = Logger.create('RISK'); this.state = state;
    this.config = {
      maxPositionSizePercentage: 0.005, maxDailyLossPercentage: 0.02,
      takeProfitPercentage: 0.015, stopLossPercentage: 0.01,
      trailingStopActivation: 0.008, trailingStopDistance: 0.004,
      maxConcurrentTrades: 3, minConfidence: 40
    };
  }

  async initialize() { this.logger.info('Risk Manager initialiseren...'); }

  async evaluate(signal, portfolio) {
    const reasons = [];
    // Check daily loss
    if (portfolio.dailyPnL <= -portfolio.initialCapital * this.config.maxDailyLossPercentage) {
      return { approved: false, reason: 'Daily loss limit bereikt' };
    }
    // Max concurrent
    if (portfolio.openPositions.length >= this.config.maxConcurrentTrades) {
      return { approved: false, reason: 'Max concurrent trades' };
    }
    // Confidence
    if (signal.confidence < this.config.minConfidence) {
      return { approved: false, reason: 'Confidence te laag' };
    }
    // Approved - calculate position
    const positionSize = portfolio.currentCapital * this.config.maxPositionSizePercentage;
    return {
      approved: true,
      positionSize,
      takeProfit: this.config.takeProfitPercentage,
      stopLoss: this.config.stopLossPercentage,
      trailingStop: true
    };
  }

  getStatus() { return { name: 'riskManager', status: 'READY' }; }
}

module.exports = RiskManagerAgent;">
