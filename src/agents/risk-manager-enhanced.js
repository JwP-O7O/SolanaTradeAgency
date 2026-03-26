// ============================================================
// RISK MANAGER AGENT - ENHANCED VERSION
// Position sizing, risk limits, portfolio protection
// ============================================================

const Logger = require('../utils/logger');

class EnhancedRiskManagerAgent {
  constructor(state, memory) {
    this.state = state;
    this.memory = memory;
    this.logger = Logger.create('RISK-MANAGER');
    this.name = 'riskManager';
    this.status = 'IDLE';
    this.evaluationCount = 0;

    // Risk configuration
    this.config = {
      maxPositionSizePct: 0.02, // 2% per trade
      maxConcurrentPositions: 5,
      dailyLossLimitPct: 0.05, // 5% daily loss limit
      maxDrawdownPct: 0.10, // 10% max drawdown
      defaultStopLossPct: 0.01, // 1% default stop loss
      defaultTakeProfitPct: 0.015, // 1.5% default take profit
      riskRewardRatio: 1.5, // Min 1:1.5 risk/reward
      correlationThreshold: 0.7, // Max correlation between positions
    };

    // Tracking
    this.dailyLosses = 0;
    this.dailyResets = [];
    this.peakCapital = 0;
  }

  async initialize() {
    this.logger.info('Enhanced Risk Manager Agent initializing...');
    this.peakCapital = this.state.portfolio.currentCapital;
    this.status = 'READY';
  }

  async evaluate(signal, portfolio) {
    this.status = 'EVALUATING';
    this.evaluationCount++;

    try {
      // Reset daily losses if new day
      this.resetDailyLossesIfNeeded();

      // Run all risk checks
      const checks = {
        positionSize: this.checkPositionSize(portfolio),
        dailyLossLimit: this.checkDailyLossLimit(portfolio),
        maxDrawdown: this.checkMaxDrawdown(portfolio),
        concurrentPositions: this.checkConcurrentPositions(portfolio),
        correlation: this.checkCorrelation(signal, portfolio),
        riskReward: this.checkRiskReward(signal),
      };

      // Determine approval
      const approved = Object.values(checks).every(c => c.passed);

      if (!approved) {
        const reasons = Object.entries(checks)
          .filter(([_, c]) => !c.passed)
          .map(([name, c]) => c.reason);
        
        this.logger.info(`Trade rejected: ${reasons.join(', ')}`);
        this.status = 'IDLE';
        return {
          approved: false,
          reason: reasons.join('; '),
          checks,
        };
      }

      // Calculate position parameters
      const positionSize = this.calculatePositionSize(signal, portfolio);
      const { stopLoss, takeProfit } = this.calculateExitLevels(signal, positionSize);

      this.status = 'IDLE';
      return {
        approved: true,
        positionSize,
        stopLoss,
        takeProfit,
        checks,
        riskAmount: positionSize * (stopLoss / 100),
        rewardAmount: positionSize * (takeProfit / 100),
      };

    } catch (error) {
      this.logger.error('Risk evaluation error:', error.message);
      this.status = 'ERROR';
      return {
        approved: false,
        reason: 'Risk evaluation error: ' + error.message,
      };
    }
  }

  resetDailyLossesIfNeeded() {
    const now = new Date();
    const lastReset = this.dailyResets[this.dailyResets.length - 1];
    
    if (!lastReset || new Date(lastReset).getDate() !== now.getDate()) {
      this.dailyLosses = 0;
      this.dailyResets.push(now);
    }
  }

  checkPositionSize(portfolio) {
    const maxSize = portfolio.currentCapital * this.config.maxPositionSizePct;
    return {
      passed: true,
      maxSize,
      reason: `Max position size: $${maxSize.toFixed(2)}`,
    };
  }

  checkDailyLossLimit(portfolio) {
    const dailyLimit = portfolio.initialCapital * this.config.dailyLossLimitPct;
    const passed = this.dailyLosses < dailyLimit;
    
    return {
      passed,
      dailyLosses: this.dailyLosses,
      dailyLimit,
      reason: passed 
        ? `Daily loss: $${this.dailyLosses.toFixed(2)} / $${dailyLimit.toFixed(2)}`
        : `Daily loss limit exceeded: $${this.dailyLosses.toFixed(2)} >= $${dailyLimit.toFixed(2)}`,
    };
  }

  checkMaxDrawdown(portfolio) {
    const currentDrawdown = (this.peakCapital - portfolio.currentCapital) / this.peakCapital;
    const maxDrawdown = this.config.maxDrawdownPct;
    const passed = currentDrawdown < maxDrawdown;

    if (portfolio.currentCapital > this.peakCapital) {
      this.peakCapital = portfolio.currentCapital;
    }

    return {
      passed,
      currentDrawdown: (currentDrawdown * 100).toFixed(2),
      maxDrawdown: (maxDrawdown * 100).toFixed(2),
      reason: passed
        ? `Drawdown: ${(currentDrawdown * 100).toFixed(2)}% / ${(maxDrawdown * 100).toFixed(2)}%`
        : `Max drawdown exceeded: ${(currentDrawdown * 100).toFixed(2)}% >= ${(maxDrawdown * 100).toFixed(2)}%`,
    };
  }

  checkConcurrentPositions(portfolio) {
    const openPositions = portfolio.openPositions?.length || 0;
    const maxPositions = this.config.maxConcurrentPositions;
    const passed = openPositions < maxPositions;

    return {
      passed,
      openPositions,
      maxPositions,
      reason: passed
        ? `Open positions: ${openPositions} / ${maxPositions}`
        : `Max concurrent positions exceeded: ${openPositions} >= ${maxPositions}`,
    };
  }

  checkCorrelation(signal, portfolio) {
    // Simplified correlation check
    // In production: Calculate actual correlation between tokens
    const openPositions = portfolio.openPositions || [];
    const sameTokenPosition = openPositions.find(p => p.token === signal.token);
    
    const passed = !sameTokenPosition;

    return {
      passed,
      reason: passed
        ? 'No correlation issues'
        : `Position already open for ${signal.symbol}`,
    };
  }

  checkRiskReward(signal) {
    // Risk/Reward ratio check
    // Assuming default stop loss and take profit
    const stopLossPct = this.config.defaultStopLossPct;
    const takeProfitPct = this.config.defaultTakeProfitPct;
    const ratio = takeProfitPct / stopLossPct;
    const minRatio = this.config.riskRewardRatio;
    const passed = ratio >= minRatio;

    return {
      passed,
      ratio: ratio.toFixed(2),
      minRatio: minRatio.toFixed(2),
      reason: passed
        ? `Risk/Reward: ${ratio.toFixed(2)} >= ${minRatio.toFixed(2)}`
        : `Risk/Reward too low: ${ratio.toFixed(2)} < ${minRatio.toFixed(2)}`,
    };
  }

  calculatePositionSize(signal, portfolio) {
    const capital = portfolio.currentCapital;
    const confidence = Math.min(signal.confidence / 100, 1); // 0-1
    const baseSize = capital * this.config.maxPositionSizePct;
    
    // Scale position size by confidence
    const scaledSize = baseSize * (0.5 + confidence * 0.5); // 50%-100% of base
    
    return Math.round(scaledSize * 100) / 100; // Round to 2 decimals
  }

  calculateExitLevels(signal, positionSize) {
    // Dynamic stop loss and take profit based on volatility and confidence
    const confidence = Math.min(signal.confidence / 100, 1);
    
    // Tighter stops for high confidence, wider for low confidence
    const stopLossPct = this.config.defaultStopLossPct * (1.5 - confidence);
    const takeProfitPct = this.config.defaultTakeProfitPct * (1 + confidence);

    return {
      stopLoss: Math.round(stopLossPct * 100) / 100,
      takeProfit: Math.round(takeProfitPct * 100) / 100,
    };
  }

  recordTradeLoss(pnlAmount) {
    if (pnlAmount < 0) {
      this.dailyLosses += Math.abs(pnlAmount);
    }
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      evaluationCount: this.evaluationCount,
      dailyLosses: this.dailyLosses.toFixed(2),
      peakCapital: this.peakCapital.toFixed(2),
      lastUpdate: new Date().toISOString(),
    };
  }
}

module.exports = EnhancedRiskManagerAgent;
