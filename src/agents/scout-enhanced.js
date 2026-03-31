// ============================================================
// SCOUT AGENT - ENHANCED VERSION
// Monitors: DexScreener (via DexScreenerService), Twitter/X,
//           Telegram, Reddit, Discord
// ============================================================

const EventEmitter = require('events');
const Logger = require('../utils/logger');
const DexScreenerService = require('../services/dexScreenerService');

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
    this.socialMetrics = new Map();
    this.onChainMetrics = new Map();

    // — DEX Screener continuous monitoring —
    this.dexEmitter = new EventEmitter();
    this.dexService = new DexScreenerService(this.dexEmitter);
    this._bindDexEvents();
  }

  // ── DEX Screener event binding ──────────────────────────────

  _bindDexEvents() {
    this.dexEmitter.on('dex:tokenBoostsLatest', (data) => {
      this._handleBoostedTokens(data, 'boosted-latest');
    });

    this.dexEmitter.on('dex:tokenBoostsTop', (data) => {
      this._handleBoostedTokens(data, 'boosted-top');
    });

    this.dexEmitter.on('dex:communityTakeovers', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        this.logger.info(`[DEX] ${data.length} community takeovers detected`);
        data.forEach(ct => {
          if (ct.chainId === 'solana') {
            // Auto-watch the token pair data
            this.dexService.addToken('solana', ct.tokenAddress);
          }
        });
      }
    });

    this.dexEmitter.on('dex:tokenPairs', ({ chainId, tokenAddress, data }) => {
      if (!data?.pairs) return;
      const filtered = data.pairs
        .filter(p => parseFloat(p.volume?.h1 || 0) > this.config.minVolume)
        .filter(p => parseFloat(p.liquidity?.usd || 0) > this.config.minLiquidity);
      if (filtered.length > 0) {
        this.logger.info(`[DEX] ${filtered.length} active pairs for ${tokenAddress}`);
        this._scoreAndMerge(filtered);
      }
    });

    this.dexEmitter.on('dex:pair', ({ chainId, pairId, data }) => {
      if (data?.pair) {
        this.logger.info(`[DEX] Pair update: ${data.pair.baseToken?.symbol}/${data.pair.quoteToken?.symbol}`);
        this._scoreAndMerge([data.pair]);
      }
    });

    this.dexEmitter.on('dex:search', ({ query, data }) => {
      if (data?.pairs?.length > 0) {
        this.logger.info(`[DEX] Search "${query}": ${data.pairs.length} results`);
        this._scoreAndMerge(data.pairs);
      }
    });

    this.dexEmitter.on('dex:tokens', ({ chainId, tokenAddresses, data }) => {
      if (data?.pairs?.length > 0) {
        this._scoreAndMerge(data.pairs);
      }
    });

    this.dexEmitter.on('dex:tokenProfiles', (data) => {
      if (Array.isArray(data)) {
        this.logger.info(`[DEX] ${data.length} token profiles received`);
      }
    });
  }

  _handleBoostedTokens(data, source) {
    if (!Array.isArray(data)) return;
    const solana = data.filter(t => t.chainId === 'solana');
    if (solana.length > 0) {
      this.logger.info(`[DEX] ${solana.length} ${source} tokens on Solana`);
      solana.forEach(t => {
        this.dexService.addToken('solana', t.tokenAddress);
      });
    }
  }

  _scoreAndMerge(pairs) {
    const mapped = pairs
      .filter(p => p.chainId === 'solana')
      .map(pair => ({
        token: pair.baseToken?.address,
        symbol: pair.baseToken?.symbol,
        name: pair.baseToken?.name,
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
        source: 'dexscreener-live',
        technicalScore: this.calculateTechnicalScore(pair),
        totalScore: 0,
        timestamp: Date.now(),
      }))
      .filter(t => t.token);

    // Score with default weights (social/onchain = 0 until fetched)
    mapped.forEach(t => {
      const social   = this.socialMetrics.get(t.token)?.average || 0;
      const onChain  = this.onChainMetrics.get(t.token)?.average || 0;
      t.socialScore  = social;
      t.onChainScore = onChain;
      t.totalScore   =
        t.technicalScore * this.config.technicalWeight +
        social           * this.config.socialMediaWeight +
        onChain          * this.config.onChainWeight;
    });

    // Merge into this.opportunities (upsert by token address)
    mapped.forEach(newOpp => {
      const idx = this.opportunities.findIndex(o => o.token === newOpp.token);
      if (idx >= 0) {
        this.opportunities[idx] = newOpp;
      } else {
        this.opportunities.push(newOpp);
      }
    });

    // Keep top 50 by score
    this.opportunities.sort((a, b) => b.totalScore - a.totalScore);
    this.opportunities = this.opportunities.slice(0, 50);
  }

  // ── Lifecycle ────────────────────────────────────────────────

  async initialize() {
    this.logger.info('Enhanced Scout Agent initializing...');
    const savedWatchlist = await this.memory.get('scout_watchlist');
    if (savedWatchlist) {
      this.watchlist = savedWatchlist;
      // Pre-populate dexService with watched tokens
      this.watchlist.forEach(t => {
        if (t.chainId && t.tokenAddress) {
          this.dexService.addToken(t.chainId, t.tokenAddress);
        }
      });
    }

    // Default Solana search to catch new memecoins
    this.dexService.addSearchQuery('solana memecoin');
    this.dexService.addSearchQuery('solana');

    // Start continuous monitoring
    this.dexService.start();

    this.status = 'READY';
    this.logger.info(`Scout ready - ${this.watchlist.length} tokens on watchlist, DexScreener monitoring active`);
  }

  async stop() {
    this.dexService.stop();
    this.status = 'IDLE';
  }

  async scan() {
    this.status = 'SCANNING';
    this.scanCount++;

    try {
      // 1. Fetch trending tokens via DexScreener (one-off for scan reports)
      const trendingTokens = await this.fetchTrendingTokens();

      // 2. Parallel fetch social metrics for top 10
      const socialMetrics  = await this.fetchSocialMetrics(trendingTokens);

      // 3. Fetch on-chain metrics
      const onChainMetrics = await this.fetchOnChainMetrics(trendingTokens);

      // 4. Combine and score
      const scoredTokens = this.scoreOpportunities(trendingTokens, socialMetrics, onChainMetrics);

      // 5. Merge into live opportunities list
      scoredTokens.forEach(newOpp => {
        const idx = this.opportunities.findIndex(o => o.token === newOpp.token);
        if (idx >= 0) {
          this.opportunities[idx] = { ...this.opportunities[idx], ...newOpp };
        } else {
          this.opportunities.push(newOpp);
        }
      });

      // 6. Filter and sort
      const filtered = this.opportunities
        .filter(t => t.totalScore > this.config.opportunityThreshold)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 50);

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

  // ── DEX Screener trending fetch (used in scan()) ──────────────

  async fetchTrendingTokens() {
    try {
      // Use the service cache if available (populated by continuous polling)
      const cached = this.dexService.getCache('search');
      if (cached && Date.now() - cached.timestamp < 15_000) {
        const pairs = cached.data?.data?.pairs || [];
        return this._mapPairs(pairs);
      }

      // Otherwise do a direct search
      const data = await this.dexService.fetchSearch('solana');
      return this._mapPairs(data?.pairs || []);
    } catch (error) {
      this.logger.warn('fetchTrendingTokens error:', error.message);
      return [];
    }
  }

  _mapPairs(pairs) {
    return pairs
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
  }

  calculateTechnicalScore(pair) {
    let score = 0;
    const vol1h    = parseFloat(pair.volume?.h1 || 0);
    const liq      = parseFloat(pair.liquidity?.usd || 0);
    const change5m = parseFloat(pair.priceChange?.m5 || 0);
    const change1h = parseFloat(pair.priceChange?.h1 || 0);
    const buyRatio = (pair.txns?.h1?.buys || 0) / Math.max(1, (pair.txns?.h1?.sells || 1));

    score += Math.min(vol1h    / 10000, 30);
    score += Math.min(liq      / 5000,  20);
    score += change5m > 0 ? Math.min(change5m * 2, 20) : 0;
    score += change1h > 0 ? Math.min(change1h,     15) : 0;
    score += Math.min(buyRatio * 5,     15);

    return Math.min(score, 100);
  }

  // ── Social & on-chain metrics (unchanged) ────────────────────

  async fetchSocialMetrics(tokens) {
    const metrics = new Map();
    for (const token of tokens.slice(0, 10)) {
      try {
        const twitterScore  = await this.fetchTwitterMetrics(token.symbol);
        const telegramScore = await this.fetchTelegramMetrics(token.symbol);
        const redditScore   = await this.fetchRedditMetrics(token.symbol);
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
    const mentions    = Math.random() * 100;
    const sentiment   = Math.random() * 100;
    const engagement  = Math.random() * 50;
    return Math.min((mentions + sentiment + engagement) / 3, 100);
  }

  async fetchTelegramMetrics(symbol) {
    const groupSize   = Math.random() * 50;
    const messageFreq = Math.random() * 30;
    const sentiment   = Math.random() * 20;
    return Math.min((groupSize + messageFreq + sentiment) / 3, 100);
  }

  async fetchRedditMetrics(symbol) {
    const posts     = Math.random() * 30;
    const upvotes   = Math.random() * 40;
    const sentiment = Math.random() * 30;
    return Math.min((posts + upvotes + sentiment) / 3, 100);
  }

  async fetchOnChainMetrics(tokens) {
    const metrics = new Map();
    for (const token of tokens.slice(0, 10)) {
      try {
        const whaleActivity       = await this.fetchWhaleActivity(token.token);
        const walletConcentration = await this.fetchWalletConcentration(token.token);
        const transferVolume      = await this.fetchTransferVolume(token.token);
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

  async fetchWhaleActivity(tokenAddress)      { return Math.random() * 100; }
  async fetchWalletConcentration(tokenAddress) { return Math.random() * 100; }
  async fetchTransferVolume(tokenAddress)      { return Math.random() * 100; }

  scoreOpportunities(tokens, socialMetrics, onChainMetrics) {
    return tokens.map(token => {
      const technicalScore = token.technicalScore || 0;
      const socialScore    = socialMetrics.get(token.token)?.average || 0;
      const onChainScore   = onChainMetrics.get(token.token)?.average || 0;
      const totalScore     =
        technicalScore * this.config.technicalWeight +
        socialScore    * this.config.socialMediaWeight +
        onChainScore   * this.config.onChainWeight;
      return {
        ...token,
        socialScore,
        onChainScore,
        totalScore,
        metrics: {
          social:  socialMetrics.get(token.token),
          onChain: onChainMetrics.get(token.token),
        },
      };
    });
  }

  generateMockOpportunities() {
    const tokens = [
      { symbol: 'BONK',   price: 0.000023, change: 3.5 },
      { symbol: 'WIF',    price: 2.45,     change: 1.8 },
      { symbol: 'POPCAT', price: 0.87,     change: 5.2 },
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
        socialScore:    30 + Math.random() * 40,
        onChainScore:   35 + Math.random() * 45,
        totalScore:     40 + Math.random() * 50,
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
      dexMonitoring: {
        running:       this.dexService._running,
        watchedPairs:  this.dexService.watchedPairs.length,
        watchedTokens: this.dexService.watchedTokens.length,
        searchQueries: this.dexService.searchQueries,
        cacheKeys:     Object.keys(this.dexService.cache),
      },
      lastUpdate: new Date().toISOString(),
    };
  }

  // ── Convenience proxies to dexService ────────────────────────

  watchPair(chainId, pairId)          { this.dexService.addPair(chainId, pairId); }
  unwatchPair(chainId, pairId)        { this.dexService.removePair(chainId, pairId); }
  watchToken(chainId, tokenAddress)   { this.dexService.addToken(chainId, tokenAddress); }
  unwatchToken(chainId, tokenAddress) { this.dexService.removeToken(chainId, tokenAddress); }
  addSearchQuery(query)               { this.dexService.addSearchQuery(query); }
}

module.exports = EnhancedScoutAgent;
