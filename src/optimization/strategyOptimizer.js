/**
 * Strategy Optimizer voor JwP Solana Trading Agency
 * Optimaliseert trading strategieën op basis van performance en marktcondities.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class StrategyOptimizer {
  constructor() {
    this.strategiesPath = path.join(process.cwd(), 'config', 'strategies.json');
    this.performanceData = new Map();
    
    // Configuratie voor optimalisatie
    this.config = {
      minTradesForUpdate: 5,
      maxAdjustmentPercent: 0.15
    };
  }

  loadStrategies() {
    try {
      const data = fs.readFileSync(this.strategiesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Fout bij laden strategieën voor optimalisatie:', error.message);
      return {};
    }
  }

  saveStrategies(strategies) {
    try {
      fs.writeFileSync(this.strategiesPath, JSON.stringify(strategies, null, 2));
      logger.info('🚀 Strategieën geüpdatet door Optimizer');
    } catch (error) {
      logger.error('Fout bij opslaan geoptimaliseerde strategieën:', error.message);
    }
  }

  /**
   * Update performance data voor een specifieke strategie
   * @param {string} strategyName 
   * @param {Object} tradeResult { pnl, pnlPercent }
   */
  updatePerformance(strategyName, tradeResult) {
    if (!this.performanceData.has(strategyName)) {
      this.performanceData.set(strategyName, {
        trades: [],
        winRate: 0,
        totalPnL: 0
      });
    }

    const stats = this.performanceData.get(strategyName);
    stats.trades.push(tradeResult);
    
    // Update stats
    const wins = stats.trades.filter(t => t.pnl > 0).length;
    stats.winRate = (wins / stats.trades.length) * 100;
    stats.totalPnL += tradeResult.pnl;

    logger.debug(`[Optimizer] Stats voor ${strategyName}: WR: ${stats.winRate.toFixed(1)}%, PnL: ${stats.totalPnL.toFixed(4)}`);

    // Check of we genoeg data hebben voor een optimalisatie-run
    if (stats.trades.length >= this.config.minTradesForUpdate) {
      this.optimize(strategyName);
    }
  }

  /**
   * Optimaliseer parameters van een strategie
   */
  optimize(name) {
    const strategies = this.loadStrategies();
    const strategy = strategies[name];
    const stats = this.performanceData.get(name);
    
    if (!strategy || !stats) return;

    let changed = false;
    const oldParams = { ...strategy };

    // 1. Stop Loss Optimization
    // Als winrate te laag is (<40%), SL strakker zetten
    if (stats.winRate < 40 && strategy.stopLoss > 0.5) {
      strategy.stopLoss = Math.max(0.5, parseFloat((strategy.stopLoss * 0.95).toFixed(2)));
      changed = true;
    } 
    // Als winrate erg hoog is (>70%), SL iets ruimer voor meer ademruimte
    else if (stats.winRate > 70 && strategy.stopLoss < 5) {
      strategy.stopLoss = Math.min(5, parseFloat((strategy.stopLoss * 1.05).toFixed(2)));
      changed = true;
    }

    // 2. Take Profit Optimization
    // Als winrate hoog is, TP iets verhogen om winst te maximaliseren
    if (stats.winRate > 60 && strategy.takeProfit < 20) {
      strategy.takeProfit = Math.min(20, parseFloat((strategy.takeProfit * 1.05).toFixed(2)));
      changed = true;
    }
    // Als we veel verliezen, TP verlagen voor snellere exits
    else if (stats.winRate < 45 && strategy.takeProfit > 1) {
      strategy.takeProfit = Math.max(1, parseFloat((strategy.takeProfit * 0.95).toFixed(2)));
      changed = true;
    }

    if (changed) {
      logger.info(`🎯 Strategie geoptimaliseerd: ${name}`, {
        from: { sl: oldParams.stopLoss, tp: oldParams.takeProfit },
        to: { sl: strategy.stopLoss, tp: strategy.takeProfit }
      });
      
      this.saveStrategies(strategies);
      // Reset trades voor de volgende cyclus
      stats.trades = []; 
    }
  }
}

module.exports = new StrategyOptimizer();
