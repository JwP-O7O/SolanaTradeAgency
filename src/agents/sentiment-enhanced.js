// ============================================================
// SENTIMENT AGENT - PHASE 1 UPGRADE
// LunarCrush social scores + Birdeye holder metrics
// Vervangt random Math.random() met echte API data
// ============================================================
const axios = require('axios');
const Logger = require('../utils/logger');

const LUNARCRUSH_API_KEY = process.env.LUNARCRUSH_API_KEY || '';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

class EnhancedSentimentAgent {
  constructor(connection, memory, bus) {
    this.connection = connection;
    this.memory = memory;
    this.bus = bus;
    this.logger = Logger.create('SENTIMENT');
    this.name = 'sentiment';
    this.status = 'IDLE';
    this.analysisCount = 0;
    this.config = {
      twitterWeight: 0.35,
      telegramWeight: 0.25,
      redditWeight: 0.20,
      onChainWeight: 0.20,
      sentimentThreshold: 0.3,
    };
    this.sentimentCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000;
  }

  async initialize() {
    this.logger.info('Enhanced Sentiment Agent initializing (LunarCrush + Birdeye)...');
    this.status = 'READY';
  }

  async analyze(token) {
    this.status = 'ANALYZING';
    this.analysisCount++;
    try {
      const cached = this.sentimentCache.get(token);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.sentiment;
      }
      // Parallel fetch: LunarCrush (Twitter/social) + Birdeye (on-chain)
      const [socialSentiment, onChainSentiment] = await Promise.all([
        this.fetchLunarCrushSentiment(token),
        this.fetchBirdeyeOnChainMetrics(token),
      ]);
      // Mock Telegram/Reddit voor nu (geen goedkope free API's)
      const telegramSentiment = this.generateMockScore();
      const redditSentiment = this.generateMockScore();
      const overallScore = (
        socialSentiment.score * this.config.twitterWeight +
        telegramSentiment * this.config.telegramWeight +
        redditSentiment * this.config.redditWeight +
        onChainSentiment.score * this.config.onChainWeight
      );
      const sentiment = {
        token,
        score: overallScore,
        sources: {
          lunarcrush: socialSentiment,
          telegram: { score: telegramSentiment, source: 'telegram-mock' },
          reddit: { score: redditSentiment, source: 'reddit-mock' },
          onChain: onChainSentiment,
        },
        timestamp: Date.now(),
        analysis: this.generateAnalysis(overallScore),
      };
      this.sentimentCache.set(token, { sentiment, timestamp: Date.now() });
      this.status = 'IDLE';
      return sentiment;
    } catch (error) {
      this.logger.error('Sentiment analysis error:', error.message);
      this.status = 'ERROR';
      return this.generateNeutralSentiment(token);
    }
  }

  async fetchLunarCrushSentiment(token) {
    try {
      if (!LUNARCRUSH_API_KEY) {
        return { score: 0.5, source: 'lunarcrush-no-key' };
      }
      const url = `https://lunarcrush.com/api3/coins/${token}/meta`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${LUNARCRUSH_API_KEY}` },
        timeout: 3000,
      });
      const data = res.data?.data;
      if (!data) return { score: 0.5, source: 'lunarcrush-no-data' };
      const galaxyScore = (data.galaxy_score || 50) / 100;
      const altRank = data.alt_rank ? Math.max(0, 1 - data.alt_rank / 1000) : 0.5;
      const sentiment = data.social_dominance || 0.5;
      return {
        score: (galaxyScore * 0.5 + altRank * 0.3 + sentiment * 0.2),
        galaxyScore,
        altRank: data.alt_rank,
        socialDominance: data.social_dominance,
        source: 'lunarcrush',
      };
    } catch (error) {
      this.logger.warn('LunarCrush fetch error:', error.message);
      return { score: 0.5, source: 'lunarcrush-error' };
    }
  }

  async fetchBirdeyeOnChainMetrics(token) {
    try {
      const url = `https://public-api.birdeye.so/defi/token_overview?address=${token}`;
      const headers = BIRDEYE_API_KEY ? { 'X-API-KEY': BIRDEYE_API_KEY } : {};
      const res = await axios.get(url, { headers, timeout: 3000 });
      const data = res.data?.data;
      if (!data) return { score: 0.5, source: 'birdeye-no-data' };
      const holderScore = Math.min((data.holder || 100) / 10000, 1);
      const liqScore = Math.min((data.liquidity || 10000) / 500000, 1);
      const volScore = Math.min((data.v24hUSD || 50000) / 1000000, 1);
      const onChainScore = holderScore * 0.4 + liqScore * 0.3 + volScore * 0.3;
      return {
        score: onChainScore,
        holders: data.holder,
        liquidity: data.liquidity,
        volume24h: data.v24hUSD,
        source: 'birdeye',
      };
    } catch (error) {
      this.logger.warn('Birdeye onchain fetch error:', error.message);
      return { score: 0.5, source: 'birdeye-error' };
    }
  }

  generateMockScore() {
    return 0.3 + Math.random() * 0.4; // 0.3 - 0.7
  }

  generateAnalysis(overallScore) {
    let sentiment = 'NEUTRAL';
    if (overallScore > 0.65) sentiment = 'VERY_POSITIVE';
    else if (overallScore > 0.55) sentiment = 'POSITIVE';
    else if (overallScore < 0.35) sentiment = 'VERY_NEGATIVE';
    else if (overallScore < 0.45) sentiment = 'NEGATIVE';
    return {
      overall: sentiment,
      average: overallScore,
      recommendation: overallScore > 0.5 ? 'CONSIDER_BUY' : 'CONSIDER_SELL',
    };
  }

  generateNeutralSentiment(token) {
    return {
      token,
      score: 0.5,
      sources: {
        lunarcrush: { score: 0.5, source: 'error' },
        telegram: { score: 0.5, source: 'telegram-mock' },
        reddit: { score: 0.5, source: 'reddit-mock' },
        onChain: { score: 0.5, source: 'error' },
      },
      timestamp: Date.now(),
      analysis: { overall: 'NEUTRAL', average: 0.5, recommendation: 'HOLD' },
    };
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      analysisCount: this.analysisCount,
      cacheSize: this.sentimentCache.size,
      lastUpdate: new Date().toISOString(),
    };
  }
}

module.exports = EnhancedSentimentAgent;
