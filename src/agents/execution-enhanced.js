// ==================================================================
// EXECUTION AGENT - ENHANCED VERSION
// Executes trades on Solana blockchain with micro-trade support
// ==================================================================

const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const Logger = require('../utils/logger');
const strategies = require('../../config/strategies.json');

class EnhancedExecutionAgent {
  constructor(connection, wallet, mode = 'paper') {
    this.connection = connection;
    this.wallet = wallet;
    this.mode = mode; // 'paper' or 'live'
    this.logger = new Logger('Execution');
    this.strategies = strategies;
    
    // Paper trading state
    this.paperPortfolio = {
      balance: 1.0, // Start with 1 SOL
      positions: [],
      trades: []
    };
    
    // Live trading limits
    this.maxSlippage = 0.01; // 1% max slippage
  }

  // CORE: Execute trade with strategy-based parameters
  async executeTrade(signal, riskAssessment) {
    try {
      const strategyName = signal.strategy || 'MEME_MICRO_SCALP';
      const strategy = this.strategies[strategyName];
      
      if (!strategy) {
        this.logger.error(`Strategy ${strategyName} not found`);
        return {
          success: false,
          error: 'Unknown strategy'
        };
      }

      this.logger.info(`Executing ${signal.action} for ${signal.token} using ${strategyName}`);

      // Check if risk approved
      if (!riskAssessment.approved) {
        this.logger.warn('Trade rejected by risk manager:', riskAssessment.reason);
        return {
          success: false,
          error: riskAssessment.reason
        };
      }

      // Execute based on mode
      if (this.mode === 'paper') {
        return await this.executePaperTrade(signal, riskAssessment, strategy);
      } else {
        return await this.executeLiveTrade(signal, riskAssessment, strategy);
      }

    } catch (error) {
      this.logger.error('Trade execution failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Execute paper trade (simulated)
  async executePaperTrade(signal, riskAssessment, strategy) {
    try {
      const positionSize = riskAssessment.positionSize;
      const entryPrice = signal.entryPrice;
      const stopLoss = riskAssessment.stopLoss;
      const takeProfit = riskAssessment.takeProfit;

      if (signal.action === 'BUY') {
        // Calculate trade amount
        const tradeAmount = this.paperPortfolio.balance * positionSize;
        
        // Check if enough balance
        if (tradeAmount > this.paperPortfolio.balance) {
          return {
            success: false,
            error: 'Insufficient balance'
          };
        }

        // Create position
        const position = {
          token: signal.token,
          strategy: signal.strategy,
          entryPrice,
          size: tradeAmount,
          stopLoss,
          takeProfit,
          entryTime: Date.now(),
          status: 'open'
        };

        // Update portfolio
        this.paperPortfolio.balance -= tradeAmount;
        this.paperPortfolio.positions.push(position);
        
        // Log trade
        const trade = {
          type: 'OPEN',
          token: signal.token,
          strategy: signal.strategy,
          entryPrice,
          size: tradeAmount,
          timestamp: Date.now()
        };
        this.paperPortfolio.trades.push(trade);

        this.logger.info('Paper trade executed:', {
          token: signal.token,
          strategy: signal.strategy,
          amount: tradeAmount.toFixed(4),
          entry: entryPrice,
          sl: stopLoss,
          tp: takeProfit
        });

        return {
          success: true,
          mode: 'paper',
          position,
          portfolio: this.paperPortfolio
        };

      } else if (signal.action === 'SELL') {
        // Find and close position
        const position = this.paperPortfolio.positions.find(p => 
          p.token === signal.token && p.status === 'open'
        );

        if (!position) {
          return {
            success: false,
            error: 'No open position found'
          };
        }

        // Calculate P&L
        const exitPrice = signal.exitPrice || signal.entryPrice;
        const pnl = (exitPrice - position.entryPrice) * position.size / position.entryPrice;
        
        // Update portfolio
        this.paperPortfolio.balance += position.size + pnl;
        position.status = 'closed';
        position.exitPrice = exitPrice;
        position.exitTime = Date.now();
        position.pnl = pnl;

        // Log trade
        const trade = {
          type: 'CLOSE',
          token: signal.token,
          strategy: signal.strategy,
          exitPrice,
          pnl,
          timestamp: Date.now()
        };
        this.paperPortfolio.trades.push(trade);

        this.logger.info('Paper position closed:', {
          token: signal.token,
          pnl: pnl.toFixed(4),
          exit: exitPrice,
          duration: (position.exitTime - position.entryTime) / 1000 + 's'
        });

        return {
          success: true,
          mode: 'paper',
          pnl,
          position,
          portfolio: this.paperPortfolio
        };
      }

    } catch (error) {
      this.logger.error('Paper trade execution failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Execute live trade on Solana blockchain
  async executeLiveTrade(signal, riskAssessment, strategy) {
    try {
      this.logger.warn('Live trading not fully implemented yet');
      
      // TODO: Implement real Solana DEX trading
      // - Get token account addresses
      // - Calculate optimal route (Jupiter aggregator)
      // - Build and send transaction
      // - Monitor transaction confirmation
      // - Handle slippage and errors
      
      return {
        success: false,
        error: 'Live trading not implemented'
      };

    } catch (error) {
      this.logger.error('Live trade execution failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get current portfolio state
  getPortfolio() {
    if (this.mode === 'paper') {
      return {
        mode: 'paper',
        balance: this.paperPortfolio.balance,
        positions: this.paperPortfolio.positions.filter(p => p.status === 'open'),
        totalTrades: this.paperPortfolio.trades.length,
        openPositions: this.paperPortfolio.positions.filter(p => p.status === 'open').length
      };
    } else {
      // TODO: Implement live portfolio fetching
      return {
        mode: 'live',
        balance: 0,
        positions: []
      };
    }
  }

  // Calculate total P&L
  calculatePnL() {
    const closedPositions = this.paperPortfolio.positions.filter(p => p.status === 'closed');
    const totalPnL = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    
    return {
      total: totalPnL,
      trades: closedPositions.length,
      winners: closedPositions.filter(p => p.pnl > 0).length,
      losers: closedPositions.filter(p => p.pnl <= 0).length,
      winRate: closedPositions.length > 0 
        ? (closedPositions.filter(p => p.pnl > 0).length / closedPositions.length * 100)
        : 0
    };
  }

  // Monitor open positions and check for exits
  async monitorPositions(currentPrices) {
    const openPositions = this.paperPortfolio.positions.filter(p => p.status === 'open');
    const signals = [];

    for (const position of openPositions) {
      const currentPrice = currentPrices[position.token];
      
      if (!currentPrice) continue;

      // Check stop loss
      if (currentPrice <= position.stopLoss) {
        signals.push({
          action: 'SELL',
          token: position.token,
          strategy: position.strategy,
          exitPrice: currentPrice,
          reason: 'stop_loss'
        });
      }
      
      // Check take profit
      else if (currentPrice >= position.takeProfit) {
        signals.push({
          action: 'SELL',
          token: position.token,
          strategy: position.strategy,
          exitPrice: currentPrice,
          reason: 'take_profit'
        });
      }
    }

    return signals;
  }

  // Reset paper portfolio (for backtesting)
  resetPaperPortfolio(initialBalance = 1.0) {
    this.paperPortfolio = {
      balance: initialBalance,
      positions: [],
      trades: []
    };
    this.logger.info('Paper portfolio reset:', { balance: initialBalance });
  }

  // Get trade history
  getTradeHistory() {
    return {
      trades: this.paperPortfolio.trades,
      positions: this.paperPortfolio.positions
    };
  }
}

module.exports = EnhancedExecutionAgent;
