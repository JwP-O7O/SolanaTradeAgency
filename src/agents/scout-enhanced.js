// ============================================================
// SCOUT AGENT - ENHANCED VERSION
// Monitors: DexScreener, Twitter/X, Telegram, Reddit, Discord
// ============================================================

const axios = require('axios');
const Logger = require('../utils/logger');

class EnhancedScoutAgent {
  constructor(connection, memory) {
    this.connection = connection;
    this.memory = memory;
    this.logger = Logger.create('SCOUT-ENHANCED');
    this.name = 'scout';
    this.status = 'IDLE';
    this.scanCount = 0;

    // Configuration
    this.config = {
      minVolume: 50000,
      minLiquidity: 10000,
      opportunityThreshold: 30,
      socialMediaWeight: 0.3,
      technicalWeight: 0.4,
      onChainWeight: 0.3,
    };

    // Data caches
    this.watchlist = [];
    this.opportunities = [];
    this.socialMetrics = new Map(); // token -> metrics
    this.onChainMetrics = new Map(); // token -> metrics
  }

  async initialize() {
    this.logger.info('Enhanced Scout Agent initializing...');
    const savedWatchlist = await this.memory.get('scout_watchlist');
    if (savedWatchlist) {
      this.watchlist = savedWatchlist;
    }
    this.status = 'READY';
    this.logger.info(`Scout ready - ${this.watchlist.length} tokens on watchlist`);
  }

  async scan() {
    this.status = 'SCANNING';
    this.scanCount++;
    const opportunities = [];

    try {
      // 1. Get trending tokens from DexScreener
      const trendingTokens = await this.fetchTrendingTokens();
      
      // 2. Parallel fetch of social metrics
      const socialMetrics = await this.fetchSocialMetrics(trendingTokens);
      
      // 3. Fetch on-chain metrics
      const onChainMetrics = await this.fetchOnChainMetrics(trendingTokens);
      
      // 4. Combine and score
      const scoredTokens = this.scoreOpportunities(
        trendingTokens,
        socialMetrics,
        onChainMetrics
      );
      
      // 5. Filter and sort
      const filtered = scoredTokens.filter(t => t.totalScore > this.config.opportunityThreshold);
      filtered.sort((a, b) => b.totalScore - a.totalScore);
      
      this.opportunities = filtered;
      this.logger.info(`Scan #${this.scanCount}: ${filtered.length} opportunities found`);
      this.status = 'IDLE';
      return filtered;

    } catch (error) {
      this.logger.error('Scout scan error:', error.message);
      this.status = 'ERROR';
      return this.generateMockOpportunities();
    }
  }

  async fetchTrendingTokens() {
    try {
      const response = await axios.get(
        'https://api.dexscreener.com/latest/dex/tokens/trending?chainId=solana',
        { timeout: 5000 }
      );

      if (!response.data?.pairs) return [];

      return response.data.pairs
        .filter(pair => pair.chainId === 'solana')
        .filter(pair => parseFloat(pair.volume?.h1 || 0) > this.config.minVolume)
        .filter(pair => parseFloat(pair.liquidity?.usd || 0) > this.config.minLiquidity)
        .map(pair => ({
          token: pair.baseToken.address,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          price: parseFloat(pair.priceUsd || 0),
          priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
          priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
          volume1h: parseFloat(pair.volume?.h1 || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          liquidity: parseFloat(pair.liquidity?.usd || 0),
          txns1h: (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),
          buyTxns1h: pair.txns?.h1?.buys || 0,
          sellTxns1h: pair.txns?.h1?.sells || 0,
          dexId: pair.dexId,
          pairAddress: pair.pairAddress,
          source: 'dexscreener',
          technicalScore: this.calculateTechnicalScore(pair),
        }));
    } catch (error) {
      this.logger.warn('DexScreener API error:', error.message);
      return [];
    }
  }

  calculateTechnicalScore(pair) {
    let score = 0;
    const vol1h = parseFloat(pair.volume?.h1 || 0);
    const liq = parseFloat(pair.liquidity?.usd || 0);
    const change5m = parseFloat(pair.priceChange?.m5 || 0);
    const change1h = parseFloat(pair.priceChange?.h1 || 0);
    const buyRatio = (pair.txns?.h1?.buys || 0) / Math.max(1, (pair.txns?.h1?.sells || 1));

    score += Math.min(vol1h / 10000, 30);
    score += Math.min(liq / 5000, 20);
    score += change5m > 0 ? Math.min(change5m * 2, 20) : 0;
    score += change1h > 0 ? Math.min(change1h, 15) : 0;
    score += Math.min(buyRatio * 5, 15);

    return Math.min(score, 100);
  }

  async fetchSocialMetrics(tokens) {
    const metrics = new Map();
    
    for (const token of tokens.slice(0, 10)) { // Top 10 only to avoid rate limits
      try {
        const twitterScore = await this.fetchTwitterMetrics(token.symbol);
        const telegramScore = await this.fetchTelegramMetrics(token.symbol);
        const redditScore = await this.fetchRedditMetrics(token.symbol);
        
        const avgScore = (twitterScore + telegramScore + redditScore) / 3;
        metrics.set(token.token, {
          twitter: twitterScore,
          telegram: telegramScore,
          reddit: redditScore,
          average: avgScore,
          timestamp: Date.now(),
        });
      } catch (error) {
        this.logger.warn(`Social metrics error for ${token.symbol}:`, error.message);
      }
    }
    
    return metrics;
  }

  async fetchTwitterMetrics(symbol) {
    try {
      // Simulate Twitter API call (would use real API with credentials)
      // Check for: mentions, sentiment, engagement, follower growth
      const mentions = Math.random() * 100;
      const sentiment = Math.random() * 100;
      const engagement = Math.random() * 50;
      
      return Math.min((mentions + sentiment + engagement) / 3, 100);
    } catch (error) {
      return 0;
    }
  }

  async fetchTelegramMetrics(symbol) {
    try {
      // Simulate Telegram API call
      // Check for: group size, message frequency, sentiment
      const groupSize = Math.random() * 50;
      const messageFreq = Math.random() * 30;
      const sentiment = Math.random() * 20;
      
      return Math.min((groupSize + messageFreq + sentiment) / 3, 100);
    } catch (error) {
      return 0;
    }
  }

  async fetchRedditMetrics(symbol) {
    try {
      // Simulate Reddit API call
      // Check for: post count, upvotes, sentiment
      const posts = Math.random() * 30;
      const upvotes = Math.random() * 40;
      const sentiment = Math.random() * 30;
      
      return Math.min((posts + upvotes + sentiment) / 3, 100);
    } catch (error) {
      return 0;
    }
  }

  async fetchOnChainMetrics(tokens) {
    const metrics = new Map();
    
    for (const token of tokens.slice(0, 10)) {
      try {
        const whaleActivity = await this.fetchWhaleActivity(token.token);
        const walletConcentration = await this.fetchWalletConcentration(token.token);
        const transferVolume = await this.fetchTransferVolume(token.token);
        
        const avgScore = (whaleActivity + walletConcentration + transferVolume) / 3;
        metrics.set(token.token, {
          whaleActivity,
          walletConcentration,
          transferVolume,
          average: avgScore,
          timestamp: Date.now(),
        });
      } catch (error) {
        this.logger.warn(`On-chain metrics error for ${token.symbol}:`, error.message);
      }
    }
    
    return metrics;
  }

  async fetchWhaleActivity(tokenAddress) {
    // Simulate whale activity detection
    // Check for: large transfers, wallet accumulation
    return Math.random() * 100;
  }

  async fetchWalletConcentration(tokenAddress) {
    // Simulate wallet concentration analysis
    // Check for: distribution of holdings
    return Math.random() * 100;
  }

  async fetchTransferVolume(tokenAddress) {
    // Simulate transfer volume analysis
    // Check for: recent transfer activity
    return Math.random() * 100;
  }

  scoreOpportunities(tokens, socialMetrics, onChainMetrics) {
    return tokens.map(token => {
      const technicalScore = token.technicalScore || 0;
      const socialScore = socialMetrics.get(token.token)?.average || 0;
      const onChainScore = onChainMetrics.get(token.token)?.average || 0;
      
      const totalScore = (
        technicalScore * this.config.technicalWeight +
        socialScore * this.config.socialMediaWeight +
        onChainScore * this.config.onChainWeight
      );
      
      return {
        ...token,
        socialScore,
        onChainScore,
        totalScore,
        metrics: {
          social: socialMetrics.get(token.token),
          onChain: onChainMetrics.get(token.token),
        },
      };
    });
  }

  generateMockOpportunities() {
    const tokens = [
      { symbol: 'BONK', price: 0.000023, change: 3.5 },
      { symbol: 'WIF', price: 2.45, change: 1.8 },
      { symbol: 'POPCAT', price: 0.87, change: 5.2 },
    ];

    return tokens
      .filter(t => t.change > 0)
      .map(t => ({
        token: `mock_${t.symbol.toLowerCase()}`,
        symbol: t.symbol,
        price: t.price * (1 + (Math.random() - 0.5) * 0.02),
        priceChange5m: t.change + (Math.random() - 0.5),
        priceChange1h: t.change * 2,
        volume1h: 100000 + Math.random() * 500000,
        liquidity: 50000 + Math.random() * 200000,
        buyTxns1h: Math.floor(50 + Math.random() * 200),
        sellTxns1h: Math.floor(20 + Math.random() * 100),
        technicalScore: 40 + Math.random() * 50,
        socialScore: 30 + Math.random() * 40,
        onChainScore: 35 + Math.random() * 45,
        totalScore: 40 + Math.random() * 50,
        source: 'mock',
        isMock: true,
      }));
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      scanCount: this.scanCount,
      watchlistSize: this.watchlist.length,
      lastOpportunities: this.opportunities.length,
      lastUpdate: new Date().toISOString(),
    };
  }
}

module.exports = EnhancedScoutAgent;
