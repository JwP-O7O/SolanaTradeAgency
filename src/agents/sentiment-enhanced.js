// ============================================================
// SENTIMENT AGENT - ENHANCED VERSION
// Analyzes: Social media, on-chain metrics, community engagement
// ============================================================

const axios = require('axios');
const Logger = require('../utils/logger');

class EnhancedSentimentAgent {
  constructor(memory) {
    this.memory = memory;
    this.logger = Logger.create('SENTIMENT');
    this.name = 'sentiment';
    this.status = 'IDLE';
    this.analysisCount = 0;

    // Configuration
    this.config = {
      twitterWeight: 0.35,
      telegramWeight: 0.25,
      redditWeight: 0.20,
      onChainWeight: 0.20,
      sentimentThreshold: 0.3, // Reject if sentiment < 0.3
    };

    // Cache
    this.sentimentCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    this.logger.info('Enhanced Sentiment Agent initializing...');
    this.status = 'READY';
  }

  async analyze(token) {
    this.status = 'ANALYZING';
    this.analysisCount++;

    try {
      // Check cache first
      const cached = this.sentimentCache.get(token);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.sentiment;
      }

      // Parallel fetch all sentiment sources
      const [twitterSentiment, telegramSentiment, redditSentiment, onChainSentiment] = 
        await Promise.all([
          this.fetchTwitterSentiment(token),
          this.fetchTelegramSentiment(token),
          this.fetchRedditSentiment(token),
          this.fetchOnChainSentiment(token),
        ]);

      // Weighted average
      const overallScore = (
        twitterSentiment.score * this.config.twitterWeight +
        telegramSentiment.score * this.config.telegramWeight +
        redditSentiment.score * this.config.redditWeight +
        onChainSentiment.score * this.config.onChainWeight
      );

      const sentiment = {
        token,
        score: overallScore,
        sources: {
          twitter: twitterSentiment,
          telegram: telegramSentiment,
          reddit: redditSentiment,
          onChain: onChainSentiment,
        },
        timestamp: Date.now(),
        analysis: this.generateAnalysis(
          twitterSentiment,
          telegramSentiment,
          redditSentiment,
          onChainSentiment
        ),
      };

      // Cache result
      this.sentimentCache.set(token, { sentiment, timestamp: Date.now() });

      this.status = 'IDLE';
      return sentiment;

    } catch (error) {
      this.logger.error('Sentiment analysis error:', error.message);
      this.status = 'ERROR';
      return this.generateNeutralSentiment(token);
    }
  }

  async fetchTwitterSentiment(token) {
    try {
      // Simulate Twitter/X API sentiment analysis
      // In production: Use Twitter API + NLP for sentiment
      const mentions = Math.random() * 100;
      const sentiment = (Math.random() - 0.5) * 2; // -1 to 1
      const engagement = Math.random() * 100;
      const trendingScore = Math.random() * 100;

      const score = (sentiment + 1) / 2; // Normalize to 0-1

      return {
        score: Math.max(0, Math.min(1, score)),
        mentions,
        sentiment,
        engagement,
        trendingScore,
        source: 'twitter',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.warn('Twitter sentiment error:', error.message);
      return { score: 0.5, source: 'twitter', error: true };
    }
  }

  async fetchTelegramSentiment(token) {
    try {
      // Simulate Telegram group sentiment analysis
      // In production: Use Telegram Bot API + message analysis
      const groupSize = Math.random() * 100;
      const messageFrequency = Math.random() * 100;
      const sentiment = (Math.random() - 0.5) * 2; // -1 to 1
      const memberGrowth = Math.random() * 100;

      const score = (sentiment + 1) / 2;

      return {
        score: Math.max(0, Math.min(1, score)),
        groupSize,
        messageFrequency,
        sentiment,
        memberGrowth,
        source: 'telegram',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.warn('Telegram sentiment error:', error.message);
      return { score: 0.5, source: 'telegram', error: true };
    }
  }

  async fetchRedditSentiment(token) {
    try {
      // Simulate Reddit sentiment analysis
      // In production: Use Reddit API + NLP
      const postCount = Math.random() * 100;
      const upvoteRatio = Math.random();
      const sentiment = (Math.random() - 0.5) * 2; // -1 to 1
      const commentSentiment = (Math.random() - 0.5) * 2;

      const score = (sentiment + commentSentiment) / 4 + 0.5;

      return {
        score: Math.max(0, Math.min(1, score)),
        postCount,
        upvoteRatio,
        sentiment,
        commentSentiment,
        source: 'reddit',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.warn('Reddit sentiment error:', error.message);
      return { score: 0.5, source: 'reddit', error: true };
    }
  }

  async fetchOnChainSentiment(token) {
    try {
      // Analyze on-chain metrics for sentiment
      // Check: whale activity, transfer volume, wallet concentration
      const whaleActivity = Math.random() * 100;
      const transferVolume = Math.random() * 100;
      const walletConcentration = Math.random() * 100;
      const largeTransfers = Math.random() * 100;

      // Positive if whales are buying, negative if selling
      const sentiment = (whaleActivity - 50) / 50;

      const score = (sentiment + 1) / 2;

      return {
        score: Math.max(0, Math.min(1, score)),
        whaleActivity,
        transferVolume,
        walletConcentration,
        largeTransfers,
        sentiment,
        source: 'onchain',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.warn('On-chain sentiment error:', error.message);
      return { score: 0.5, source: 'onchain', error: true };
    }
  }

  generateAnalysis(twitter, telegram, reddit, onChain) {
    const scores = [
      twitter.score,
      telegram.score,
      reddit.score,
      onChain.score,
    ];

    const avg = scores.reduce((a, b) => a + b) / scores.length;
    const max = Math.max(...scores);
    const min = Math.min(...scores);

    let sentiment = 'NEUTRAL';
    if (avg > 0.65) sentiment = 'VERY_POSITIVE';
    else if (avg > 0.55) sentiment = 'POSITIVE';
    else if (avg < 0.35) sentiment = 'VERY_NEGATIVE';
    else if (avg < 0.45) sentiment = 'NEGATIVE';

    return {
      overall: sentiment,
      average: avg,
      range: { min, max },
      consensus: max - min < 0.3 ? 'HIGH' : 'LOW',
      recommendation: avg > 0.5 ? 'CONSIDER_BUY' : 'CONSIDER_SELL',
    };
  }

  generateNeutralSentiment(token) {
    return {
      token,
      score: 0.5,
      sources: {
        twitter: { score: 0.5, source: 'twitter', error: true },
        telegram: { score: 0.5, source: 'telegram', error: true },
        reddit: { score: 0.5, source: 'reddit', error: true },
        onChain: { score: 0.5, source: 'onchain', error: true },
      },
      timestamp: Date.now(),
      analysis: {
        overall: 'NEUTRAL',
        average: 0.5,
        consensus: 'LOW',
        recommendation: 'HOLD',
      },
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
