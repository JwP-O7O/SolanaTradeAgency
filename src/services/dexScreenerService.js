// ==================================================================
// DEX SCREENER SERVICE - ENHANCED WITH REAL-TIME MONITORING
// Continuous monitoring, rate limiting, data caching
// ==================================================================

const axios = require('axios');
const Logger = require('../utils/logger');

class DexScreenerService {
  constructor() {
    this.baseUrl = 'https://api.dexscreener.com/latest/dex';
    this.logger = new Logger('DexScreener');
    
    // Rate limiting: 60 req/min per endpoint (300 total/min)
    this.rateLimit = {
      requestsPerMinute: 60,
      requestsMade: 0,
      windowStart: Date.now()
    };
    
    // Cache for reducing API calls
    this.cache = new Map();
    this.cacheTimeout = 10000; // 10 seconds
    
    // Monitoring state
    this.monitoringActive = false;
    this.watchlist = new Set();
  }

  // Check rate limit before making request
  async checkRateLimit() {
    const now = Date.now();
    const elapsed = now - this.rateLimit.windowStart;
    
    // Reset counter every minute
    if (elapsed >= 60000) {
      this.rateLimit.requestsMade = 0;
      this.rateLimit.windowStart = now;
    }
    
    // Wait if limit exceeded
    if (this.rateLimit.requestsMade >= this.rateLimit.requestsPerMinute) {
      const waitTime = 60000 - elapsed;
      this.logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimit.requestsMade = 0;
      this.rateLimit.windowStart = Date.now();
    }
    
    this.rateLimit.requestsMade++;
  }

  // Get cached data or fetch new
  async getCached(key, fetchFunction) {
    const cached = this.cache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    
    const data = await fetchFunction();
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }

  // Search for tokens
  async searchTokens(query) {
    try {
      await this.checkRateLimit();
      
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { q: query },
        timeout: 10000
      });
      
      this.logger.info(`Search results for "${query}": ${response.data.pairs?.length || 0} pairs found`);
      return response.data;
      
    } catch (error) {
      this.logger.error('Search failed:', error.message);
      return { pairs: [] };
    }
  }

  // Get token pairs by addresses
  async getTokenPairs(addresses) {
    try {
      await this.checkRateLimit();
      
      const addressList = Array.isArray(addresses) ? addresses.join(',') : addresses;
      const cacheKey = `pairs_${addressList}`;
      
      return await this.getCached(cacheKey, async () => {
        const response = await axios.get(`${this.baseUrl}/tokens/${addressList}`, {
          timeout: 10000
        });
        
        this.logger.info(`Fetched ${response.data.pairs?.length || 0} pairs`);
        return response.data;
      });
      
    } catch (error) {
      this.logger.error('Failed to fetch token pairs:', error.message);
      return { pairs: [] };
    }
  }

  // Get pair by address
  async getPair(pairAddress) {
    try {
      await this.checkRateLimit();
      
      const cacheKey = `pair_${pairAddress}`;
      
      return await this.getCached(cacheKey, async () => {
        const response = await axios.get(`${this.baseUrl}/pairs/${pairAddress}`, {
          timeout: 10000
        });
        
        return response.data;
      });
      
    } catch (error) {
      this.logger.error('Failed to fetch pair:', error.message);
      return null;
    }
  }

  // Get latest token profiles (boosted tokens)
  async getLatestProfiles() {
    try {
      await this.checkRateLimit();
      
      const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', {
        timeout: 10000
      });
      
      this.logger.info(`Fetched ${response.data.length || 0} latest profiles`);
      return response.data;
      
    } catch (error) {
      this.logger.error('Failed to fetch latest profiles:', error.message);
      return [];
    }
  }

  // Get top boosted tokens
  async getTopBoosted() {
    try {
      await this.checkRateLimit();
      
      const response = await axios.get('https://api.dexscreener.com/token-boosts/top/v1', {
        timeout: 10000
      });
      
      this.logger.info(`Fetched ${response.data.length || 0} top boosted tokens`);
      return response.data;
      
    } catch (error) {
      this.logger.error('Failed to fetch top boosted:', error.message);
      return [];
    }
  }

  // Scan for new Solana memecoins
  async scanNewMemecoins(minLiquidity = 5000, minVolume24h = 10000) {
    try {
      this.logger.info('Scanning for new Solana memecoins...');
      
      // Get latest profiles (these are typically new/boosted tokens)
      const profiles = await this.getLatestProfiles();
      
      // Filter for Solana tokens
      const solanaProfiles = profiles.filter(p => 
        p.chainId === 'solana' || p.url?.includes('solana')
      );
      
      // Get detailed data for each token
      const candidates = [];
      
      for (const profile of solanaProfiles.slice(0, 10)) { // Limit to avoid rate limits
        try {
          const tokenData = await this.getTokenPairs(profile.tokenAddress);
          
          if (tokenData.pairs && tokenData.pairs.length > 0) {
            for (const pair of tokenData.pairs) {
              // Filter by criteria
              if (pair.chainId === 'solana' &&
                  pair.liquidity?.usd >= minLiquidity &&
                  pair.volume?.h24 >= minVolume24h) {
                
                candidates.push({
                  tokenAddress: pair.baseToken.address,
                  tokenName: pair.baseToken.name,
                  tokenSymbol: pair.baseToken.symbol,
                  pairAddress: pair.pairAddress,
                  dex: pair.dexId,
                  price: pair.priceUsd,
                  liquidity: pair.liquidity?.usd || 0,
                  volume24h: pair.volume?.h24 || 0,
                  priceChange24h: pair.priceChange?.h24 || 0,
                  priceChange1h: pair.priceChange?.h1 || 0,
                  txns24h: pair.txns?.h24 || {},
                  marketCap: pair.fdv || 0,
                  timestamp: Date.now()
                });
              }
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch data for ${profile.tokenAddress}:`, error.message);
        }
      }
      
      this.logger.info(`Found ${candidates.length} memecoin candidates`);
      return candidates;
      
    } catch (error) {
      this.logger.error('Memecoin scan failed:', error.message);
      return [];
    }
  }

  // Add token to watchlist
  addToWatchlist(tokenAddress) {
    this.watchlist.add(tokenAddress);
    this.logger.info(`Added ${tokenAddress} to watchlist (${this.watchlist.size} tokens)`);
  }

  // Remove from watchlist
  removeFromWatchlist(tokenAddress) {
    this.watchlist.delete(tokenAddress);
    this.logger.info(`Removed ${tokenAddress} from watchlist`);
  }

  // Monitor watchlist tokens
  async monitorWatchlist() {
    if (this.watchlist.size === 0) {
      return [];
    }
    
    try {
      const addresses = Array.from(this.watchlist);
      const data = await this.getTokenPairs(addresses);
      
      return data.pairs || [];
      
    } catch (error) {
      this.logger.error('Watchlist monitoring failed:', error.message);
      return [];
    }
  }

  // Start continuous monitoring
  startMonitoring(callback, interval = 30000) {
    if (this.monitoringActive) {
      this.logger.warn('Monitoring already active');
      return;
    }
    
    this.monitoringActive = true;
    this.logger.info(`Started monitoring (interval: ${interval}ms)`);
    
    const monitor = async () => {
      if (!this.monitoringActive) return;
      
      try {
        // Scan for new memecoins
        const candidates = await this.scanNewMemecoins();
        
        // Monitor watchlist
        const watchlistData = await this.monitorWatchlist();
        
        // Callback with data
        if (callback) {
          await callback({
            newCandidates: candidates,
            watchlist: watchlistData,
            timestamp: Date.now()
          });
        }
        
      } catch (error) {
        this.logger.error('Monitoring cycle failed:', error);
      }
      
      // Schedule next cycle
      if (this.monitoringActive) {
        setTimeout(monitor, interval);
      }
    };
    
    // Start first cycle
    monitor();
  }

  // Stop monitoring
  stopMonitoring() {
    this.monitoringActive = false;
    this.logger.info('Stopped monitoring');
  }

  // Get monitoring stats
  getStats() {
    return {
      rateLimit: {
        requestsMade: this.rateLimit.requestsMade,
        requestsPerMinute: this.rateLimit.requestsPerMinute,
        windowStart: this.rateLimit.windowStart
      },
      cache: {
        size: this.cache.size,
        timeout: this.cacheTimeout
      },
      monitoring: {
        active: this.monitoringActive,
        watchlistSize: this.watchlist.size
      }
    };
  }
}

module.exports = DexScreenerService;
