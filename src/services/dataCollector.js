// ==================================================================
// DATA COLLECTOR - Historical Price Data & Market Analysis
// Collect and store historical data for backtesting
// ==================================================================

const Logger = require('../utils/logger');
const DexScreenerService = require('./dexScreenerService');

class DataCollector {
  constructor() {
    this.logger = new Logger('DataCollector');
    this.dexScreener = new DexScreenerService();
    
    // In-memory storage (in production: use database)
    this.historicalData = new Map();
    this.collectionActive = false;
  }

  // Collect current data point for a token
  async collectDataPoint(tokenAddress) {
    try {
      const data = await this.dexScreener.getTokenPairs(tokenAddress);
      
      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }
      
      const pair = data.pairs[0]; // Use first pair (typically highest liquidity)
      
      const dataPoint = {
        token: tokenAddress,
        timestamp: Date.now(),
        price: parseFloat(pair.priceUsd) || 0,
        volume24h: pair.volume?.h24 || 0,
        volumeChange24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        priceChange1h: pair.priceChange?.h1 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        txns24h: {
          buys: pair.txns?.h24?.buys || 0,
          sells: pair.txns?.h24?.sells || 0
        },
        marketCap: pair.fdv || 0,
        pairAddress: pair.pairAddress,
        dex: pair.dexId
      };
      
      // Calculate momentum (simple price change)
      dataPoint.momentum = dataPoint.priceChange1h;
      
      // Calculate sentiment based on buy/sell ratio
      const totalTxns = dataPoint.txns24h.buys + dataPoint.txns24h.sells;
      dataPoint.sentiment = totalTxns > 0 
        ? dataPoint.txns24h.buys / totalTxns 
        : 0.5;
      
      // Calculate volatility (based on 24h change)
      dataPoint.volatility = Math.abs(dataPoint.priceChange24h) / 100;
      
      // Store in historical data
      if (!this.historicalData.has(tokenAddress)) {
        this.historicalData.set(tokenAddress, []);
      }
      this.historicalData.get(tokenAddress).push(dataPoint);
      
      this.logger.info(`Collected data for ${tokenAddress}: $${dataPoint.price}`);
      return dataPoint;
      
    } catch (error) {
      this.logger.error(`Failed to collect data for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  // Collect data for multiple tokens
  async collectBatch(tokenAddresses) {
    const results = [];
    
    for (const address of tokenAddresses) {
      const dataPoint = await this.collectDataPoint(address);
      if (dataPoint) {
        results.push(dataPoint);
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }

  // Start continuous data collection
  startCollection(tokenAddresses, interval = 60000) {
    if (this.collectionActive) {
      this.logger.warn('Collection already active');
      return;
    }
    
    this.collectionActive = true;
    this.logger.info(`Started data collection for ${tokenAddresses.length} tokens (interval: ${interval}ms)`);
    
    const collect = async () => {
      if (!this.collectionActive) return;
      
      try {
        await this.collectBatch(tokenAddresses);
      } catch (error) {
        this.logger.error('Collection cycle failed:', error);
      }
      
      if (this.collectionActive) {
        setTimeout(collect, interval);
      }
    };
    
    collect();
  }

  // Stop collection
  stopCollection() {
    this.collectionActive = false;
    this.logger.info('Stopped data collection');
  }

  // Get historical data for a token
  getHistoricalData(tokenAddress, limit = null) {
    const data = this.historicalData.get(tokenAddress) || [];
    
    if (limit) {
      return data.slice(-limit);
    }
    
    return data;
  }

  // Get all collected data
  getAllData() {
    const allData = {};
    
    for (const [token, data] of this.historicalData.entries()) {
      allData[token] = data;
    }
    
    return allData;
  }

  // Export data to JSON
  exportData(tokenAddress = null) {
    if (tokenAddress) {
      return {
        token: tokenAddress,
        dataPoints: this.historicalData.get(tokenAddress) || [],
        timestamp: Date.now()
      };
    }
    
    return {
      tokens: Object.fromEntries(this.historicalData),
      timestamp: Date.now()
    };
  }

  // Import data from JSON
  importData(data) {
    try {
      if (data.tokens) {
        // Bulk import
        for (const [token, points] of Object.entries(data.tokens)) {
          this.historicalData.set(token, points);
        }
        this.logger.info(`Imported data for ${Object.keys(data.tokens).length} tokens`);
      } else if (data.token && data.dataPoints) {
        // Single token import
        this.historicalData.set(data.token, data.dataPoints);
        this.logger.info(`Imported ${data.dataPoints.length} data points for ${data.token}`);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Import failed:', error);
      return false;
    }
  }

  // Calculate statistics for a token
  getStatistics(tokenAddress) {
    const data = this.historicalData.get(tokenAddress);
    
    if (!data || data.length === 0) {
      return null;
    }
    
    const prices = data.map(d => d.price);
    const volumes = data.map(d => d.volume24h);
    
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    // Calculate volatility (standard deviation of prices)
    const variance = prices.reduce((sum, price) => {
      return sum + Math.pow(price - avgPrice, 2);
    }, 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volatility = avgPrice > 0 ? (stdDev / avgPrice) * 100 : 0;
    
    return {
      token: tokenAddress,
      dataPoints: data.length,
      avgPrice,
      maxPrice,
      minPrice,
      priceRange: maxPrice - minPrice,
      avgVolume,
      volatility: volatility.toFixed(2) + '%',
      firstTimestamp: data[0].timestamp,
      lastTimestamp: data[data.length - 1].timestamp,
      duration: data[data.length - 1].timestamp - data[0].timestamp
    };
  }

  // Clear old data (keep only recent)
  clearOldData(maxAgeMs = 86400000) { // Default: 24 hours
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    
    for (const [token, data] of this.historicalData.entries()) {
      const filtered = data.filter(d => d.timestamp >= cutoff);
      removed += data.length - filtered.length;
      
      if (filtered.length > 0) {
        this.historicalData.set(token, filtered);
      } else {
        this.historicalData.delete(token);
      }
    }
    
    this.logger.info(`Cleared ${removed} old data points`);
    return removed;
  }

  // Get collection stats
  getStats() {
    const tokens = Array.from(this.historicalData.keys());
    const totalPoints = Array.from(this.historicalData.values())
      .reduce((sum, data) => sum + data.length, 0);
    
    return {
      active: this.collectionActive,
      tokensTracked: tokens.length,
      totalDataPoints: totalPoints,
      averagePointsPerToken: tokens.length > 0 ? totalPoints / tokens.length : 0,
      tokens
    };
  }
}

module.exports = DataCollector;
