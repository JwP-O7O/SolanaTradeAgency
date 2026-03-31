// ==================================================================
// RISK MANAGER AGENT - ENHANCED VERSION
// Position sizing, risk limits, portfolio protection, strategy-based
// ==================================================================

const Logger = require('../utils/logger');
const strategies = require('../../config/strategies.json');

class EnhancedRiskManagerAgent {
  constructor(state, memory) {
    this.state = state;
    this.memory = memory;
    this.logger = new Logger('RiskManager');
    
    // Strategy-based risk parameters
    this.strategies = strategies;
    
    // Load default base parameters
    this.baseParams = {
      maxPositionSize: 0.01,      // 1% van portfolio per positie
      maxDailyLoss: 0.05,          // Max 5% verlies per dag
      maxOpenPositions: 5,
      minRiskRewardRatio: 1.5,
      stopLossPercent: 0.01,       // 1% stop loss
      takeProfitPercent: 0.02,     // 2% take profit (2:1 RR)
      trailingStopPercent: 0.005   // 0.5% trailing stop
    };
    
    this.dailyStats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      startBalance: this.state.portfolio?.balance || 0
    };
  }

  // CORE: Assess overall risk voor nieuwe trade
  async assessRisk(signal) {
    try {
      const strategyName = signal.strategy || 'MEME_MICRO_SCALP';
      const strategy = this.strategies[strategyName];
      
      if (!strategy) {
        this.logger.warn(`Strategy ${strategyName} not found, using base params`);
        return this.assessWithBaseParams(signal);
      }

      this.logger.info(`Assessing risk for ${signal.token} using ${strategyName}`);

      // Check daily limits
      const dailyLossCheck = this.checkDailyLoss(strategy);
      if (!dailyLossCheck.safe) {
        return {
          approved: false,
          reason: 'Daily loss limit reached',
          riskScore: 10,
          dailyStats: this.dailyStats
        };
      }

      // Check max open positions
      const openPositions = this.state.portfolio?.positions?.length || 0;
      if (openPositions >= this.baseParams.maxOpenPositions) {
        return {
          approved: false,
          reason: 'Max open positions reached',
          riskScore: 9,
          openPositions
        };
      }

      // Calculate position size based on strategy
      const positionSize = this.calculatePositionSize(signal, strategy);
      
      // Calculate stop loss and take profit
      const stopLoss = this.calculateStopLoss(signal.entryPrice, strategy);
      const takeProfit = this.calculateTakeProfit(signal.entryPrice, strategy);
      
      // Calculate risk/reward ratio
      const riskReward = this.calculateRiskReward(
        signal.entryPrice,
        stopLoss,
        takeProfit
      );

      // Check if R:R meets strategy minimum
      if (riskReward < strategy.risk.minRiskRewardRatio) {
        return {
          approved: false,
          reason: 'Risk/Reward ratio too low',
          riskScore: 8,
          riskReward,
          minRequired: strategy.risk.minRiskRewardRatio
        };
      }

      // Calculate overall risk score (0-10, lower = better)
      const riskScore = this.calculateRiskScore(signal, strategy, riskReward);

      // Approve if risk score is acceptable
      const approved = riskScore <= 6;

      return {
        approved,
        reason: approved ? 'Risk acceptable' : 'Risk score too high',
        riskScore,
        positionSize,
        stopLoss,
        takeProfit,
        riskReward,
        strategy: strategyName,
        params: strategy.risk,
        dailyStats: this.dailyStats
      };

    } catch (error) {
      this.logger.error('Risk assessment failed:', error);
      return {
        approved: false,
        reason: 'Risk assessment error',
        riskScore: 10,
        error: error.message
      };
    }
  }

  // Fallback to base params if strategy not found
  assessWithBaseParams(signal) {
    const positionSize = this.baseParams.maxPositionSize;
    const stopLoss = signal.entryPrice * (1 - this.baseParams.stopLossPercent);
    const takeProfit = signal.entryPrice * (1 + this.baseParams.takeProfitPercent);
    const riskReward = this.calculateRiskReward(signal.entryPrice, stopLoss, takeProfit);
    
    return {
      approved: riskReward >= this.baseParams.minRiskRewardRatio,
      reason: riskReward >= this.baseParams.minRiskRewardRatio ? 'Risk acceptable (base params)' : 'R:R too low',
      riskScore: 5,
      positionSize,
      stopLoss,
      takeProfit,
      riskReward,
      strategy: 'BASE_PARAMS'
    };
  }

  // Calculate position size based on strategy risk
  calculatePositionSize(signal, strategy) {
    const balance = this.state.portfolio?.balance || 0;
    const maxRisk = balance * strategy.risk.maxPositionSize;
    
    // Account for volatility if available
    let adjustedSize = strategy.risk.maxPositionSize;
    
    if (signal.volatility) {
      // Reduce size for high volatility
      if (signal.volatility > 0.1) {
        adjustedSize *= 0.5; // Halveer bij hoge volatiliteit
      }
    }
    
    return Math.min(adjustedSize, this.baseParams.maxPositionSize);
  }

  // Calculate stop loss based on strategy
  calculateStopLoss(entryPrice, strategy) {
    return entryPrice * (1 - strategy.risk.stopLossPercent);
  }

  // Calculate take profit based on strategy
  calculateTakeProfit(entryPrice, strategy) {
    return entryPrice * (1 + strategy.risk.takeProfitPercent);
  }

  // Calculate risk/reward ratio
  calculateRiskReward(entryPrice, stopLoss, takeProfit) {
    const risk = entryPrice - stopLoss;
    const reward = takeProfit - entryPrice;
    return reward / risk;
  }

  // Calculate overall risk score (0-10)
  calculateRiskScore(signal, strategy, riskReward) {
    let score = 5; // Start neutral

    // Adjust based on risk/reward
    if (riskReward > 3) score -= 2;
    else if (riskReward > 2) score -= 1;
    else if (riskReward < 1.5) score += 2;

    // Adjust based on signal confidence
    if (signal.confidence) {
      if (signal.confidence > 0.8) score -= 1;
      else if (signal.confidence < 0.5) score += 2;
    }

    // Adjust based on sentiment
    if (signal.sentiment) {
      if (signal.sentiment > 0.7) score -= 1;
      else if (signal.sentiment < 0.3) score += 1;
    }

    // Adjust based on market conditions
    if (signal.marketCondition === 'trending') score -= 1;
    if (signal.marketCondition === 'choppy') score += 2;

    // Adjust based on daily stats
    if (this.dailyStats.losses > this.dailyStats.wins) score += 1;

    return Math.max(0, Math.min(10, score));
  }

  // Check if daily loss limit is reached
  checkDailyLoss(strategy) {
    const currentBalance = this.state.portfolio?.balance || 0;
    const dailyLoss = this.dailyStats.startBalance - currentBalance;
    const maxDailyLoss = this.dailyStats.startBalance * strategy.risk.maxDailyLoss;

    return {
      safe: dailyLoss < maxDailyLoss,
      dailyLoss,
      maxDailyLoss,
      remaining: maxDailyLoss - dailyLoss
    };
  }

  // Update daily stats after trade
  updateDailyStats(trade) {
    this.dailyStats.trades++;
    
    if (trade.pnl > 0) {
      this.dailyStats.wins++;
    } else {
      this.dailyStats.losses++;
    }
    
    this.dailyStats.totalPnL += trade.pnl;

    this.logger.info('Daily stats updated:', {
      winRate: (this.dailyStats.wins / this.dailyStats.trades * 100).toFixed(2) + '%',
      totalPnL: this.dailyStats.totalPnL.toFixed(4),
      trades: this.dailyStats.trades
    });
  }

  // Monitor active positions and adjust stops
  async monitorPositions() {
    try {
      const positions = this.state.portfolio?.positions || [];
      
      for (const position of positions) {
        // Get strategy for this position
        const strategy = this.strategies[position.strategy] || this.strategies.MEME_MICRO_SCALP;
        
        // Check if trailing stop should be activated
        const currentPrice = await this.getCurrentPrice(position.token);
        const profitPercent = (currentPrice - position.entryPrice) / position.entryPrice;
        
        // Activate trailing stop if profit > take profit / 2
        if (profitPercent > (strategy.risk.takeProfitPercent / 2)) {
          const newStopLoss = currentPrice * (1 - strategy.risk.trailingStopPercent);
          
          if (newStopLoss > position.stopLoss) {
            position.stopLoss = newStopLoss;
            this.logger.info(`Trailing stop activated for ${position.token}: ${newStopLoss}`);
          }
        }
        
        // Check if stop loss or take profit hit
        if (currentPrice <= position.stopLoss) {
          this.logger.warn(`Stop loss hit for ${position.token}`);
          await this.closePosition(position, 'stop_loss');
        } else if (currentPrice >= position.takeProfit) {
          this.logger.info(`Take profit hit for ${position.token}`);
          await this.closePosition(position, 'take_profit');
        }
      }
      
    } catch (error) {
      this.logger.error('Position monitoring failed:', error);
    }
  }

  // Close position
  async closePosition(position, reason) {
    try {
      const currentPrice = await this.getCurrentPrice(position.token);
      const pnl = (currentPrice - position.entryPrice) * position.size;
      
      this.updateDailyStats({
        token: position.token,
        pnl,
        reason
      });
      
      // Remove from portfolio
      const index = this.state.portfolio.positions.indexOf(position);
      if (index > -1) {
        this.state.portfolio.positions.splice(index, 1);
      }
      
      // Update balance
      this.state.portfolio.balance += pnl;
      
      this.logger.info(`Position closed: ${position.token}, PnL: ${pnl}, Reason: ${reason}`);
      
      // Store in memory for learning
      await this.memory.store('trade', {
        token: position.token,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        pnl,
        reason,
        strategy: position.strategy,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.logger.error('Failed to close position:', error);
    }
  }

  // Get current price (placeholder - implement real price fetching)
  async getCurrentPrice(token) {
    // TODO: Implement real-time price fetching from DEX
    return 0;
  }

  // Reset daily stats (call at start of each day)
  resetDailyStats() {
    this.dailyStats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      startBalance: this.state.portfolio?.balance || 0
    };
    this.logger.info('Daily stats reset');
  }
}

module.exports = EnhancedRiskManagerAgent;
