// ============================================================
// EXECUTION AGENT - ENHANCED VERSION
// Executes trades on Solana blockchain with micro-trade support
// ============================================================

const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const Logger = require('../utils/logger');

class EnhancedExecutionAgent {
  constructor(connection, wallet, mode = 'paper') {
    this.connection = connection;
    this.wallet = wallet;
    this.mode = mode; // 'backtest', 'paper', 'live'
    this.logger = Logger.create('EXECUTION');
    this.name = 'execution';
    this.status = 'IDLE';
    this.executionCount = 0;
    this.failureCount = 0;

    // Configuration
    this.config = {
      slippageTolerance: 0.01, // 1%
      maxRetries: 3,
      retryDelayMs: 1000,
      confirmationTimeout: 30000, // 30 seconds
      microTradeThreshold: 100, // Execute if position < $100
    };

    // Tracking
    this.executedTrades = [];
    this.failedTrades = [];
  }

  async initialize() {
    this.logger.info(`Execution Agent initializing in ${this.mode.toUpperCase()} mode...`);
    this.status = 'READY';
  }

  async execute(signal) {
    this.status = 'EXECUTING';
    this.executionCount++;

    try {
      // Validate signal
      if (!this.validateSignal(signal)) {
        throw new Error('Invalid signal format');
      }

      // Determine trade type
      const tradeType = this.determineTradeType(signal);
      this.logger.info(`Executing ${tradeType} trade: ${signal.symbol}`);

      let result;
      
      if (this.mode === 'live') {
        result = await this.executeLiveTradeWithRetry(signal);
      } else if (this.mode === 'paper') {
        result = await this.executePaperTrade(signal);
      } else {
        result = await this.executeBacktestTrade(signal);
      }

      if (result.success) {
        this.executedTrades.push(result);
        this.logger.info(`Trade executed: ${result.tradeId}`);
      } else {
        this.failureCount++;
        this.failedTrades.push(result);
        this.logger.warn(`Trade failed: ${result.error}`);
      }

      this.status = 'IDLE';
      return result;

    } catch (error) {
      this.logger.error('Execution error:', error.message);
      this.status = 'ERROR';
      this.failureCount++;
      
      return {
        success: false,
        error: error.message,
        tradeId: `FAILED-${Date.now()}`,
        timestamp: Date.now(),
      };
    }
  }

  validateSignal(signal) {
    return (
      signal.token &&
      signal.symbol &&
      signal.action &&
      signal.positionSize !== undefined &&
      signal.stopLoss !== undefined &&
      signal.takeProfit !== undefined
    );
  }

  determineTradeType(signal) {
    if (signal.positionSize < this.config.microTradeThreshold) {
      return 'MICRO_TRADE';
    }
    return 'STANDARD_TRADE';
  }

  async executeLiveTradeWithRetry(signal) {
    let lastError;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        this.logger.info(`Live trade attempt ${attempt + 1}/${this.config.maxRetries}`);
        
        // Create and sign transaction
        const tx = await this.createTransaction(signal);
        
        // Send transaction
        const signature = await this.connection.sendTransaction(tx, [this.wallet], {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        // Wait for confirmation
        const confirmed = await this.confirmTransaction(signature);
        
        if (confirmed) {
          return {
            success: true,
            tradeId: signature,
            signature,
            token: signal.token,
            symbol: signal.symbol,
            action: signal.action,
            price: signal.price,
            positionSize: signal.positionSize,
            timestamp: Date.now(),
            mode: 'live',
          };
        }
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt < this.config.maxRetries - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelayMs * (attempt + 1))
          );
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Transaction failed after retries',
      tradeId: `FAILED-${Date.now()}`,
      timestamp: Date.now(),
    };
  }

  async createTransaction(signal) {
    // In production: Create actual Solana transaction
    // This is a placeholder for the transaction creation logic
    const transaction = new Transaction();
    // Add instructions based on signal
    return transaction;
  }

  async confirmTransaction(signature) {
    try {
      const startTime = Date.now();
      
      while (Date.now() - startTime < this.config.confirmationTimeout) {
        const status = await this.connection.getSignatureStatus(signature);
        
        if (status.value?.confirmationStatus === 'confirmed' || 
            status.value?.confirmationStatus === 'finalized') {
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return false;
    } catch (error) {
      this.logger.error('Confirmation check error:', error.message);
      return false;
    }
  }

  async executePaperTrade(signal) {
    // Simulate paper trade execution
    return {
      success: true,
      tradeId: `PAPER-${Date.now()}`,
      token: signal.token,
      symbol: signal.symbol,
      action: signal.action,
      price: parseFloat(signal.price),
      positionSize: signal.positionSize,
      timestamp: Date.now(),
      mode: 'paper',
      simulated: true,
    };
  }

  async executeBacktestTrade(signal) {
    // Simulate backtest trade execution
    return {
      success: true,
      tradeId: `BACKTEST-${Date.now()}`,
      token: signal.token,
      symbol: signal.symbol,
      action: signal.action,
      price: parseFloat(signal.price),
      positionSize: signal.positionSize,
      timestamp: Date.now(),
      mode: 'backtest',
      simulated: true,
    };
  }

  async closePosition(position, currentPrice, exitReason) {
    this.status = 'CLOSING';

    try {
      const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      
      let result;
      
      if (this.mode === 'live') {
        result = await this.executeLiveTradeWithRetry({
          token: position.token,
          symbol: position.symbol,
          action: position.action === 'BUY' ? 'SELL' : 'BUY',
          price: currentPrice,
          positionSize: position.positionSize,
          stopLoss: 0,
          takeProfit: 0,
        });
      } else {
        result = {
          success: true,
          tradeId: `CLOSE-${Date.now()}`,
          token: position.token,
          symbol: position.symbol,
          exitPrice: currentPrice,
          pnlPct,
          exitReason,
          timestamp: Date.now(),
          mode: this.mode,
        };
      }

      this.logger.info(`Position closed: ${exitReason} | P&L: ${pnlPct.toFixed(2)}%`);
      this.status = 'IDLE';
      return result;

    } catch (error) {
      this.logger.error('Close position error:', error.message);
      this.status = 'ERROR';
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      mode: this.mode,
      executionCount: this.executionCount,
      failureCount: this.failureCount,
      successRate: this.executionCount > 0 
        ? (((this.executionCount - this.failureCount) / this.executionCount) * 100).toFixed(2)
        : 0,
      lastUpdate: new Date().toISOString(),
    };
  }
}

module.exports = EnhancedExecutionAgent;
