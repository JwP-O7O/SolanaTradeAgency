// ----------------------------------------------------------------------------
// RISK MANAGER AGENT - ENHANCED VERSION V4.0
// Portfolio protection, circuit breakers, and advanced risk scoring
// ----------------------------------------------------------------------------

const logger = require('../utils/logger');
const strategies = require('../../config/strategies.json');
const { getNotificationManager } = require('../notifications/notificationRules');

class EnhancedRiskManagerAgent {
  constructor(state = {}) {
    this.state = state;
    this.notifier = getNotificationManager();
    
    // Risk settings
    this.config = {
      maxPortfolioDrawdown: 0.15, // 15% max drawdown
      maxExposurePerToken: 0.05,  // 5% max per token
      circuitBreakerLosses: 3,    // Stop na 3 verliezen op rij
      minConfidence: 0.75         // Minimum confidence score
    };

    this.consecutiveLosses = 0;
    this.isCircuitBreakerActive = false;
  }

  /**
   * Analyseer een trade request op risico
   */
  async assessRisk(signal, portfolio) {
    logger.agent('RiskManager', `Analyseert risico voor ${signal.token}...`);

    // 1. Check Circuit Breaker
    if (this.isCircuitBreakerActive) {
      logger.risk('Circuit breaker is actief. Trade geweigerd.', 'high');
      return { approved: false, reason: 'CIRCUIT_BREAKER_ACTIVE' };
    }

    // 2. Check Confidence
    if (signal.confidence < this.config.minConfidence) {
      return { approved: false, reason: 'CONFIDENCE_TOO_LOW', score: signal.confidence };
    }

    // 3. Portfolio Drawdown Check
    const drawdown = (portfolio.initialBalance - portfolio.currentBalance) / portfolio.initialBalance;
    if (drawdown > this.config.maxPortfolioDrawdown) {
      this.isCircuitBreakerActive = true;
      logger.risk(`Max portfolio drawdown bereikt (${(drawdown * 100).toFixed(1)}%). Trading gestopt.`, 'high');
      this.notifier.notifyRiskAlert({
        type: 'CRITICAL_DRAWDOWN',
        severity: 'high',
        message: 'Trading gepauzeerd vanwege te hoge drawdown.'
      });
      return { approved: false, reason: 'CRITICAL_DRAWDOWN' };
    }

    // 4. Token Exposure Check
    const currentExposure = portfolio.positions.filter(p => p.token === signal.token).length;
    if (currentExposure > 0) {
      return { approved: false, reason: 'ALREADY_EXPOSED' };
    }

    // 5. Risk Score Berekening
    const riskScore = this.calculateRiskScore(signal, portfolio);
    if (riskScore > 7) { 
      return { approved: false, reason: 'RISK_SCORE_TOO_HIGH', score: riskScore };
    }

    // 6. Bepaal Position Size
    const positionSize = this.calculatePositionSize(signal, portfolio);

    logger.agent('RiskManager', `✅ Trade goedgekeurd voor ${signal.token}`, { riskScore, positionSize });
    
    return {
      approved: true,
      riskScore,
      positionSize,
      params: this.getStrategyParams(signal.strategy)
    };
  }

  calculateRiskScore(signal, portfolio) {
    let score = 5;
    if (signal.sentiment < 0.4) score += 2;
    if (signal.sentiment > 0.8) score -= 1;
    if (signal.volatility > 0.1) score += 2;
    return Math.min(10, Math.max(0, score));
  }

  calculatePositionSize(signal, portfolio) {
    const strategy = strategies[signal.strategy] || strategies['MEME_MICRO_SCALP'];
    let size = strategy.positionSize || 1;
    if (signal.confidence > 0.9) size *= 1.2;
    if (signal.confidence < 0.8) size *= 0.8;
    return Math.min(size, this.config.maxExposurePerToken * 100);
  }

  getStrategyParams(strategyName) {
    const strategy = strategies[strategyName] || strategies['MEME_MICRO_SCALP'];
    return {
      sl: strategy.stopLoss,
      tp: strategy.takeProfit,
      trailing: strategy.trailingStop || false
    };
  }

  updateStatus(tradeResult) {
    if (tradeResult.pnl < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= this.config.circuitBreakerLosses) {
        this.isCircuitBreakerActive = true;
        logger.risk(`${this.consecutiveLosses} verliezen op rij. Circuit breaker geactiveerd.`, 'medium');
      }
    } else {
      this.consecutiveLosses = 0;
      this.isCircuitBreakerActive = false;
    }
  }
}

module.exports = EnhancedRiskManagerAgent;
