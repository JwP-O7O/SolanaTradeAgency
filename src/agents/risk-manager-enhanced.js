// ----------------------------------------------------------------------------
// RISK MANAGER AGENT - ENHANCED VERSION V4.0
// Portfolio protection, circuit breakers, and advanced risk scoring
// ----------------------------------------------------------------------------
const logger = require('../utils/logger');
const strategies = require('../../config/strategies.json');
const { getNotificationManager } = require('../notifications/notificationRules');

class EnhancedRiskManagerAgent {
  constructor({ bus } = {}) {
    this.bus = bus || null;
    this.notifier = getNotificationManager();

    // Risk settings
    this.config = {
      maxPortfolioDrawdown: 0.15, // 15% max drawdown
      maxExposurePerToken: 0.05, // 5% max per token
      circuitBreakerLosses: 3, // Stop na 3 verliezen op rij
      minConfidence: 60 // Minimum confidence score (out of 100)
    };
    this.consecutiveLosses = 0;
    this.isCircuitBreakerActive = false;
    this.name = 'risk-manager';
    this.status = 'IDLE';
  }

  /**
   * Analyseer een trade request op risico
   */
  async assessRisk(signal, portfolio) {
    logger.agent('RiskManager', `Analyseert risico voor ${signal.token || signal.symbol}...`);

    // 1. Check Circuit Breaker
    if (this.isCircuitBreakerActive) {
      logger.risk('Circuit breaker is actief. Trade geweigerd.', 'high');
      return { approved: false, reason: 'CIRCUIT_BREAKER_ACTIVE' };
    }

    // 2. Check Confidence (signal.confidence is 0-100)
    if (signal.confidence < this.config.minConfidence) {
      return { approved: false, reason: 'CONFIDENCE_TOO_LOW', score: signal.confidence };
    }

    // 3. Portfolio Drawdown Check
    const currentBalance = portfolio.balance || portfolio.currentBalance || 1.0;
    const initialBalance = portfolio.initialBalance || 1.0;
    const drawdown = (initialBalance - currentBalance) / initialBalance;
    if (drawdown > this.config.maxPortfolioDrawdown) {
      this.isCircuitBreakerActive = true;
      logger.risk(`Max portfolio drawdown bereikt (${(drawdown * 100).toFixed(1)}%). Trading gestopt.`, 'high');
      if (this.notifier) {
        this.notifier.notifyRiskAlert({
          type: 'CRITICAL_DRAWDOWN',
          severity: 'high',
          message: 'Trading gepauzeerd vanwege te hoge drawdown.'
        });
      }
      return { approved: false, reason: 'CRITICAL_DRAWDOWN' };
    }

    // 4. Token Exposure Check
    const positions = portfolio.positions || [];
    const currentExposure = positions.filter(p => p.token === signal.token).length;
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
    logger.agent('RiskManager', `✅ Trade goedgekeurd voor ${signal.token || signal.symbol}`, { riskScore, positionSize });

    return {
      approved: true,
      riskScore,
      positionSize,
      params: this.getStrategyParams(signal.strategy)
    };
  }

  calculateRiskScore(signal, portfolio) {
    let score = 5;
    if (signal.sentiment && signal.sentiment < 0.4) score += 2;
    if (signal.sentiment && signal.sentiment > 0.8) score -= 1;
    if (signal.volatility && signal.volatility > 0.1) score += 2;
    return Math.min(10, Math.max(0, score));
  }

  calculatePositionSize(signal, portfolio) {
    const strategy = strategies[signal.strategy] || strategies['MEME_MICRO_SCALP'];
    let size = strategy ? (strategy.positionSize || 1) : 1;
    const confidence = signal.confidence / 100; // normalize 0-100 to 0-1
    if (confidence > 0.9) size *= 1.2;
    if (confidence < 0.8) size *= 0.8;
    return Math.min(size, this.config.maxExposurePerToken * 100);
  }

  getStrategyParams(strategyName) {
    const strategy = strategies[strategyName] || strategies['MEME_MICRO_SCALP'];
    if (!strategy) return { sl: 0.01, tp: 0.015, trailing: false };
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

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      circuitBreakerActive: this.isCircuitBreakerActive,
      consecutiveLosses: this.consecutiveLosses,
    };
  }
}

module.exports = EnhancedRiskManagerAgent;
