// ==================================================================
// AUTONOMOUS SOLANA TRADE AGENCY - FULLY INTEGRATED
// Scout → Sentiment → Analyst → Risk → Execution (CONTINUOUS LOOP)
// ==================================================================

const Logger = require('./utils/logger');
const DexScreenerService = require('./services/dexScreenerService');
const DataCollector = require('./services/dataCollector');
const EnhancedScoutAgent = require('./agents/scout-enhanced');
const EnhancedSentimentAgent = require('./agents/sentiment-enhanced');
const EnhancedAnalystAgent = require('./agents/analyst');
const EnhancedRiskManagerAgent = require('./agents/risk-manager-enhanced');
const EnhancedExecutionAgent = require('./agents/execution-enhanced');
const MemorySystem = require('./memory/memorySystem');

class AutonomousTradingAgency {
  constructor(config = {}) {
    this.logger = new Logger('Agency');
    this.config = {
      mode: config.mode || 'paper', // 'paper' or 'live'
      monitoringInterval: config.monitoringInterval || 30000, // 30s
      minLiquidity: config.minLiquidity || 5000,
      minVolume24h: config.minVolume24h || 10000,
      ...config
    };
    
    // Initialize services
    this.dexScreener = new DexScreenerService();
    this.dataCollector = new DataCollector();
    this.memory = new MemorySystem();
    
    // Initialize agents
    this.state = {
      portfolio: {
        balance: 1.0, // Start with 1 SOL in paper mode
        positions: []
      },
      activeSignals: [],
      monitoringActive: false
    };
    
    this.scout = new EnhancedScoutAgent(this.dexScreener);
    this.sentiment = new EnhancedSentimentAgent();
    this.analyst = new EnhancedAnalystAgent(this.memory);
    this.riskManager = new EnhancedRiskManagerAgent(this.state, this.memory);
    this.execution = new EnhancedExecutionAgent(null, null, this.config.mode);
    
    this.logger.info(`Agency initialized in ${this.config.mode} mode`);
  }

  // Start the autonomous trading loop
  async start() {
    try {
      this.logger.info('Starting autonomous trading agency...');
      this.state.monitoringActive = true;
      
      // Start data collection
      // this.dataCollector.startCollection([], 60000);
      
      // Start main monitoring loop
      await this.monitoringLoop();
      
    } catch (error) {
      this.logger.error('Failed to start agency:', error);
      throw error;
    }
  }

  // Stop the agency
  stop() {
    this.logger.info('Stopping autonomous trading agency...');
    this.state.monitoringActive = false;
    this.dexScreener.stopMonitoring();
    this.dataCollector.stopCollection();
  }

  // Main monitoring and trading loop
  async monitoringLoop() {
    const cycle = async () => {
      if (!this.state.monitoringActive) return;
      
      try {
        this.logger.info('=== Starting trading cycle ==');
        
        // STEP 1: Scout for opportunities
        const candidates = await this.scout.scanMemecoins({
          minLiquidity: this.config.minLiquidity,
          minVolume24h: this.config.minVolume24h
        });
        
        this.logger.info(`Scout found ${candidates.length} candidates`);
        
        // STEP 2: Process each candidate through the pipeline
        for (const candidate of candidates) {
          try {
            // Sentiment analysis
            const sentimentData = await this.sentiment.analyzeSentiment(candidate);
            
            if (sentimentData.score < 0.3) {
              this.logger.info(`${candidate.tokenSymbol}: Low sentiment (${sentimentData.score}), skipping`);
              continue;
            }
            
            // Technical analysis
            const analysis = await this.analyst.analyze({
              ...candidate,
              sentiment: sentimentData.score,
              socialMetrics: sentimentData.metrics
            });
            
            if (!analysis.recommendation || analysis.recommendation === 'HOLD') {
              this.logger.info(`${candidate.tokenSymbol}: No buy signal, skipping`);
              continue;
            }
            
            // Create trading signal
            const signal = {
              action: analysis.recommendation,
              token: candidate.tokenAddress,
              tokenSymbol: candidate.tokenSymbol,
              tokenName: candidate.tokenName,
              entryPrice: candidate.price,
              confidence: analysis.confidence,
              sentiment: sentimentData.score,
              volatility: candidate.volatility || 0.05,
              strategy: this.selectStrategy(candidate, analysis),
              reason: analysis.reason,
              timestamp: Date.now()
            };
            
            this.logger.info(`${signal.tokenSymbol}: Signal generated - ${signal.action} (confidence: ${signal.confidence})`);
            
            // STEP 3: Risk assessment
            const riskAssessment = await this.riskManager.assessRisk(signal);
            
            if (!riskAssessment.approved) {
              this.logger.warn(`${signal.tokenSymbol}: Risk rejected - ${riskAssessment.reason}`);
              continue;
            }
            
            this.logger.info(`${signal.tokenSymbol}: Risk approved (score: ${riskAssessment.riskScore})`);
            
            // STEP 4: Execute trade
            const result = await this.execution.executeTrade(signal, riskAssessment);
            
            if (result.success) {
              this.logger.info(`${signal.tokenSymbol}: Trade executed successfully`);
              
              // Update state
              this.state.portfolio = result.portfolio || this.state.portfolio;
              
              // Store in memory
              await this.memory.store('trade', {
                signal,
                riskAssessment,
                result,
                timestamp: Date.now()
              });
              
              // Add to data collector watchlist
              this.dataCollector.addToWatchlist(candidate.tokenAddress);
            } else {
              this.logger.error(`${signal.tokenSymbol}: Trade failed - ${result.error}`);
            }
            
          } catch (error) {
            this.logger.error(`Error processing ${candidate.tokenSymbol}:`, error.message);
          }
        }
        
        // STEP 5: Monitor existing positions
        await this.monitorPositions();
        
        // STEP 6: Log cycle stats
        this.logCycleStats();
        
      } catch (error) {
        this.logger.error('Monitoring cycle failed:', error);
      }
      
      // Schedule next cycle
      if (this.state.monitoringActive) {
        setTimeout(cycle, this.config.monitoringInterval);
      }
    };
    
    // Start first cycle
    await cycle();
  }

  // Monitor and manage existing positions
  async monitorPositions() {
    try {
      const positions = this.execution.paperPortfolio.positions.filter(p => p.status === 'open');
      
      if (positions.length === 0) return;
      
      this.logger.info(`Monitoring ${positions.length} open positions`);
      
      for (const position of positions) {
        try {
          // Get current price
          const data = await this.dexScreener.getTokenPairs(position.token);
          
          if (!data.pairs || data.pairs.length === 0) continue;
          
          const currentPrice = parseFloat(data.pairs[0].priceUsd);
          const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          
          this.logger.info(`${position.token}: Price $${currentPrice} (P&L: ${pnlPercent.toFixed(2)}%)`);
          
          // Check exit conditions
          if (currentPrice <= position.stopLoss) {
            await this.closePosition(position, currentPrice, 'stop_loss');
          } else if (currentPrice >= position.takeProfit) {
            await this.closePosition(position, currentPrice, 'take_profit');
          }
          
        } catch (error) {
          this.logger.error(`Failed to monitor position ${position.token}:`, error.message);
        }
      }
      
    } catch (error) {
      this.logger.error('Position monitoring failed:', error);
    }
  }

  // Close a position
  async closePosition(position, exitPrice, reason) {
    try {
      const signal = {
        action: 'SELL',
        token: position.token,
        tokenSymbol: position.tokenSymbol || position.token,
        strategy: position.strategy,
        exitPrice,
        reason
      };
      
      const riskAssessment = { approved: true, positionSize: 0 };
      const result = await this.execution.executeTrade(signal, riskAssessment);
      
      if (result.success) {
        const pnl = result.pnl || 0;
        const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
        
        this.logger.info(`Position closed: ${position.token} | P&L: ${pnl.toFixed(4)} SOL (${pnlPercent.toFixed(2)}%) | Reason: ${reason}`);
        
        // Update state
        this.state.portfolio = result.portfolio || this.state.portfolio;
        
        // Remove from data collector
        this.dataCollector.removeFromWatchlist(position.token);
      }
      
    } catch (error) {
      this.logger.error(`Failed to close position ${position.token}:`, error);
    }
  }

  // Select trading strategy based on token characteristics
  selectStrategy(candidate, analysis) {
    // High volatility + high volume = aggressive scalping
    if (candidate.volatility > 0.1 && candidate.volume24h > 50000) {
      return 'MEME_MICRO_SCALP';
    }
    
    // Medium volatility + momentum = swing trading
    if (analysis.momentum > 5 && candidate.volatility > 0.05) {
      return 'MOMENTUM_SWING';
    }
    
    // Low volatility + established = conservative hold
    return 'CONSERVATIVE_HOLD';
  }

  // Log cycle statistics
  logCycleStats() {
    const portfolio = this.execution.getPortfolio();
    const pnl = this.execution.calculatePnL();
    
    this.logger.info('=== Cycle Stats ===');
    this.logger.info(`Portfolio Balance: ${portfolio.balance.toFixed(4)} SOL`);
    this.logger.info(`Open Positions: ${portfolio.openPositions}`);
    this.logger.info(`Total Trades: ${pnl.trades}`);
    this.logger.info(`Win Rate: ${pnl.winRate.toFixed(2)}%`);
    this.logger.info(`Total P&L: ${pnl.total.toFixed(4)} SOL`);
    this.logger.info('===================');
  }

  // Get agency status
  getStatus() {
    const portfolio = this.execution.getPortfolio();
    const pnl = this.execution.calculatePnL();
    const dexStats = this.dexScreener.getStats();
    const dataStats = this.dataCollector.getStats();
    
    return {
      active: this.state.monitoringActive,
      mode: this.config.mode,
      portfolio: {
        balance: portfolio.balance,
        openPositions: portfolio.openPositions,
        totalTrades: portfolio.totalTrades
      },
      performance: {
        totalPnL: pnl.total,
        winRate: pnl.winRate,
        winners: pnl.winners,
        losers: pnl.losers
      },
      services: {
        dexScreener: dexStats,
        dataCollector: dataStats
      }
    };
  }
}

module.exports = AutonomousTradingAgency;
