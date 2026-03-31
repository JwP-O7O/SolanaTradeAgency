// ============================================================
// SCOUT AGENT - ENHANCED VERSION
// Monitors: DexScreener (continuous), scores tokens,
//           emits MEMECOIN_HIT signals via SignalBus
// ============================================================

const EventEmitter = require('events');
const Logger = require('../utils/logger');
const DexScreenerService = require('../services/dexScreenerService');
const { SIGNALS } = require('../services/signalBus');

// ── Hit criteria (all must pass) ─────────────────────────────
const HIT_CRITERIA = {
  minTechnicalScore:  40,   // out of 100
  minTotalScore:      35,   // weighted composite
  minVolume1h:        50_000,
  minLiquidity:       10_000,
  minBuyRatio:        1.2,  // buys / sells
  maxPriceChange5m:   50,   // ignore already-pumped (>50% in 5m)
  minPriceChange5m:   1.0,  // at least 1% move in 5m
};

class EnhancedScoutAgent {
  constructor(connection, memory, signalBus = null) {
    this.connection  = connection;
    this.memory      = memory;
    this.bus         = signalBus;         // SignalBus (optional, but needed for hit signals)
    this.logger      = Logger.create('SCOUT-ENHANCED');
    this.name        = 'scout';
    this.status      = 'IDLE';
    this.scanCount   = 0;

    this.config = {
      minVolume:             HIT_CRITERIA.minVolume1h,
      minLiquidity:          HIT_CRITERIA.minLiquidity,
      opportunityThreshold:  30,
      socialMediaWeight:     0.3,
      technicalWeight:       0.4,
      onChainWeight:         0.3,
    };

    this.watchlist      = [];
    this.opportunities  = [];
    this.alreadySignaled = new Set(); // token addresses already sent as HIT this session
    this.socialMetrics  = new Map();
    this.onChainMetrics = new Map();

    // DEX Screener continuous monitoring
    this.dexEmitter = new EventEmitter();
    this.dexService = new DexScreenerService(this.dexEmitter);
    this._bindDexEvents();
  }

  // ── DEX Screener event binding ────────────────────────────

  _bindDexEvents() {
    this.dexEmitter.on('dex:tokenBoostsLatest', (data) => {
      this._handleBoostedTokens(data, 'boosted-latest');
    });

    this.dexEmitter.on('dex:tokenBoostsTop', (data) => {
      this._handleBoostedTokens(data, 'boosted-top');
    });

    this.dexEmitter.on('dex:communityTakeovers', (data) => {
      if (!Array.isArray(data)) return;
      data.filter(ct => ct.chainId === 'solana').forEach(ct => {
        this.dexService.addToken('solana', ct.tokenAddress);
      });
      if (data.length) this.logger.info(`[DEX] ${data.length} community takeovers`);
    });

    this.dexEmitter.on('dex:tokenPairs', ({ chainId, tokenAddress, data }) => {
      const pairs = data?.pairs || [];
      const filtered = pairs
        .filter(p => parseFloat(p.volume?.h1 || 0)    > this.config.minVolume)
        .filter(p => parseFloat(p.liquidity?.usd || 0) > this.config.minLiquidity);
      if (filtered.length) this._scoreAndMerge(filtered);
    });

    this.dexEmitter.on('dex:pair', ({ chainId, pairId, data }) => {
      if (data?.pair) this._scoreAndMerge([data.pair]);
    });

    this.dexEmitter.on('dex:search', ({ query, data }) => {
      const pairs = data?.pairs || [];
      if (pairs.length) this._scoreAndMerge(pairs);
    });

    this.dexEmitter.on('dex:tokens', ({ data }) => {
      const pairs = data?.pairs || [];
      if (pairs.length) this._scoreAndMerge(pairs);
    });
  }

  _handleBoostedTokens(data, source) {
    if (!Array.isArray(data)) return;
    const solana = data.filter(t => t.chainId === 'solana');
    if (solana.length) {
      this.logger.info(`[DEX] ${solana.length} ${source} tokens on Solana`);
      solana.forEach(t => this.dexService.addToken('solana', t.tokenAddress));
    }
  }

  _scoreAndMerge(pairs) {
    const mapped = pairs
      .filter(p => p.chainId === 'solana')
      .map(pair => {
        const tech = this.calculateTechnicalScore(pair);
        const social   = this.socialMetrics.get(pair.baseToken?.address)?.average || 0;
        const onChain  = this.onChainMetrics.get(pair.baseToken?.address)?.average || 0;
        const total    =
          tech    * this.config.technicalWeight +
          social  * this.config.socialMediaWeight +
          onChain * this.config.onChainWeight;

        return {
          token:          pair.baseToken?.address,
          symbol:         pair.baseToken?.symbol,
          name:           pair.baseToken?.name,
          price:          parseFloat(pair.priceUsd || 0),
          priceChange5m:  parseFloat(pair.priceChange?.m5 || 0),
          priceChange1h:  parseFloat(pair.priceChange?.h1 || 0),
          volume1h:       parseFloat(pair.volume?.h1 || 0),
          volume24h:      parseFloat(pair.volume?.h24 || 0),
          liquidity:      parseFloat(pair.liquidity?.usd || 0),
          txns1h:         (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),
          buyTxns1h:      pair.txns?.h1?.buys  || 0,
          sellTxns1h:     pair.txns?.h1?.sells || 0,
          buyRatio:       (pair.txns?.h1?.buys || 0) / Math.max(1, pair.txns?.h1?.sells || 1),
          dexId:          pair.dexId,
          pairAddress:    pair.pairAddress,
          source:         'dexscreener-live',
          technicalScore: tech,
          socialScore:    social,
          onChainScore:   onChain,
          totalScore:     total,
          timestamp:      Date.now(),
        };
      })
      .filter(t => t.token);

    // Upsert
    mapped.forEach(t => {
      const idx = this.opportunities.findIndex(o => o.token === t.token);
      if (idx >= 0) this.opportunities[idx] = t;
      else this.opportunities.push(t);
    });

    // Keep top 50
    this.opportunities.sort((a, b) => b.totalScore - a.totalScore);
    this.opportunities = this.opportunities.slice(0, 50);

    // Check for hits and signal
    mapped.forEach(t => this._checkAndSignal(t));
  }

  // ── Hit detection & signalling ────────────────────────────

  _checkAndSignal(token) {
    if (!this.bus) return;
    if (this.alreadySignaled.has(token.token)) return;

    const c = HIT_CRITERIA;
    const isHit =
      token.technicalScore  >= c.minTechnicalScore  &&
      token.totalScore      >= c.minTotalScore       &&
      token.volume1h        >= c.minVolume1h         &&
      token.liquidity       >= c.minLiquidity        &&
      token.buyRatio        >= c.minBuyRatio         &&
      token.priceChange5m   >= c.minPriceChange5m    &&
      token.priceChange5m   <= c.maxPriceChange5m;   // not already pumped

    if (isHit) {
      this.alreadySignaled.add(token.token);
      // Auto-expire signal lock after 10 min so same token can re-trigger
      setTimeout(() => this.alreadySignaled.delete(token.token), 10 * 60_000);

      this.logger.info(
        `🚀 MEMECOIN HIT: ${token.symbol} | score=${token.totalScore.toFixed(1)} ` +
        `vol1h=$${(token.volume1h / 1000).toFixed(0)}k liq=$${(token.liquidity / 1000).toFixed(0)}k ` +
        `Δ5m=${token.priceChange5m.toFixed(2)}% buy/sell=${token.buyRatio.toFixed(2)}`
      );

      this.bus.signal(SIGNALS.MEMECOIN_HIT, {
        token:          token.token,
        symbol:         token.symbol,
        name:           token.name,
        price:          token.price,
        priceChange5m:  token.priceChange5m,
        priceChange1h:  token.priceChange1h,
        volume1h:       token.volume1h,
        liquidity:      token.liquidity,
        buyRatio:       token.buyRatio,
        technicalScore: token.technicalScore,
        totalScore:     token.totalScore,
        pairAddress:    token.pairAddress,
        dexUrl:         `https://dexscreener.com/solana/${token.pairAddress}`,
        source:         token.source,
      }, 'scout');
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────

  async initialize() {
    this.logger.info('Enhanced Scout Agent initializing...');
    const savedWatchlist = await this.memory.get('scout_watchlist');
    if (savedWatchlist) {
      this.watchlist = savedWatchlist;
      this.watchlist.forEach(t => {
        if (t.chainId && t.tokenAddress)
          this.dexService.addToken(t.chainId, t.tokenAddress);
      });
    }

    this.dexService.addSearchQuery('solana memecoin');
    this.dexService.addSearchQuery('solana');
    this.dexService.start();

    this.status = 'READY';
    this.logger.info(
      `Scout ready - ${this.watchlist.length} tokens on watchlist, DEX monitoring active`
    );
  }

  async stop() {
    this.dexService.stop();
    this.status = 'IDLE';
  }

  async scan() {
    this.status = 'SCANNING';
    this.scanCount++;
    try {
      const trendingTokens = await this.fetchTrendingTokens();
      const socialMetrics  = await this.fetchSocialMetrics(trendingTokens);
      const onChainMetrics = await this.fetchOnChainMetrics(trendingTokens);
      const scored = this.scoreOpportunities(trendingTokens, socialMetrics, onChainMetrics);

      scored.forEach(t => {
        const idx = this.opportunities.findIndex(o => o.token === t.token);
        if (idx >= 0) this.opportunities[idx] = { ...this.opportunities[idx], ...t };
        else this.opportunities.push(t);
        this._checkAndSignal(t);
      });

      this.opportunities = this.opportunities
        .filter(t => t.totalScore > this.config.opportunityThreshold)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 50);

      this.logger.info(`Scan #${this.scanCount}: ${this.opportunities.length} opportunities`);
      this.status = 'IDLE';
      return this.opportunities;
    } catch (error) {
      this.logger.error('Scout scan error:', error.message);
      this.status = 'ERROR';
      return this.generateMockOpportunities();
    }
  }

  async fetchTrendingTokens() {
    try {
      const cached = this.dexService.getCache('search');
      if (cached && Date.now() - cached.timestamp < 15_000) {
        return this._mapPairs(cached.data?.data?.pairs || []);
      }
      const data = await this.dexService.fetchSearch('solana');
      return this._mapPairs(data?.pairs || []);
    } catch (e) {
      this.logger.warn('fetchTrendingTokens error:', e.message);
      return [];
    }
  }

  _mapPairs(pairs) {
    return pairs
      .filter(p => p.chainId === 'solana')
      .filter(p => parseFloat(p.volume?.h1 || 0)    > this.config.minVolume)
      .filter(p => parseFloat(p.liquidity?.usd || 0) > this.config.minLiquidity)
      .map(pair => ({
        token:         pair.baseToken.address,
        symbol:        pair.baseToken.symbol,
        name:          pair.baseToken.name,
        price:         parseFloat(pair.priceUsd || 0),
        priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
        priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
        volume1h:      parseFloat(pair.volume?.h1 || 0),
        volume24h:     parseFloat(pair.volume?.h24 || 0),
        liquidity:     parseFloat(pair.liquidity?.usd || 0),
        txns1h:        (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),
        buyTxns1h:     pair.txns?.h1?.buys  || 0,
        sellTxns1h:    pair.txns?.h1?.sells || 0,
        buyRatio:      (pair.txns?.h1?.buys || 0) / Math.max(1, pair.txns?.h1?.sells || 1),
        dexId:         pair.dexId,
        pairAddress:   pair.pairAddress,
        source:        'dexscreener',
        technicalScore: this.calculateTechnicalScore(pair),
      }));
  }

  calculateTechnicalScore(pair) {
    let score = 0;
    const vol1h    = parseFloat(pair.volume?.h1 || 0);
    const liq      = parseFloat(pair.liquidity?.usd || 0);
    const change5m = parseFloat(pair.priceChange?.m5 || 0);
    const change1h = parseFloat(pair.priceChange?.h1 || 0);
    const buyRatio = (pair.txns?.h1?.buys || 0) / Math.max(1, pair.txns?.h1?.sells || 1);

    score += Math.min(vol1h    / 10000, 30);
    score += Math.min(liq      / 5000,  20);
    score += change5m > 0 ? Math.min(change5m * 2, 20) : 0;
    score += change1h > 0 ? Math.min(change1h,     15) : 0;
    score += Math.min(buyRatio * 5,     15);
    return Math.min(score, 100);
  }

  async fetchSocialMetrics(tokens) {
    const metrics = new Map();
    for (const token of tokens.slice(0, 10)) {
      try {
        const t = await this.fetchTwitterMetrics(token.symbol);
        const g = await this.fetchTelegramMetrics(token.symbol);
        const r = await this.fetchRedditMetrics(token.symbol);
        metrics.set(token.token, { twitter: t, telegram: g, reddit: r, average: (t + g + r) / 3, timestamp: Date.now() });
      } catch (e) { /* skip */ }
    }
    return metrics;
  }

  async fetchTwitterMetrics(s)  { return Math.min((Math.random()*100 + Math.random()*100 + Math.random()*50) / 3, 100); }
  async fetchTelegramMetrics(s) { return Math.min((Math.random()*50  + Math.random()*30  + Math.random()*20) / 3, 100); }
  async fetchRedditMetrics(s)   { return Math.min((Math.random()*30  + Math.random()*40  + Math.random()*30) / 3, 100); }

  async fetchOnChainMetrics(tokens) {
    const metrics = new Map();
    for (const token of tokens.slice(0, 10)) {
      try {
        const w = Math.random() * 100;
        const c = Math.random() * 100;
        const v = Math.random() * 100;
        metrics.set(token.token, { whaleActivity: w, walletConcentration: c, transferVolume: v, average: (w + c + v) / 3, timestamp: Date.now() });
      } catch (e) { /* skip */ }
    }
    return metrics;
  }

  scoreOpportunities(tokens, socialMetrics, onChainMetrics) {
    return tokens.map(token => {
      const tech    = token.technicalScore || 0;
      const social  = socialMetrics.get(token.token)?.average  || 0;
      const onChain = onChainMetrics.get(token.token)?.average || 0;
      return {
        ...token,
        socialScore:  social,
        onChainScore: onChain,
        totalScore:   tech * this.config.technicalWeight + social * this.config.socialMediaWeight + onChain * this.config.onChainWeight,
        metrics: { social: socialMetrics.get(token.token), onChain: onChainMetrics.get(token.token) },
      };
    });
  }

  generateMockOpportunities() {
    return [
      { symbol: 'BONK', price: 0.000023, change: 3.5 },
      { symbol: 'WIF',  price: 2.45,     change: 1.8 },
    ].map(t => ({
      token: `mock_${t.symbol.toLowerCase()}`,
      symbol: t.symbol,
      price: t.price,
      priceChange5m: t.change,
      priceChange1h: t.change * 2,
      volume1h: 150000,
      liquidity: 75000,
      buyTxns1h: 100,
      sellTxns1h: 50,
      buyRatio: 2.0,
      technicalScore: 55,
      socialScore: 40,
      onChainScore: 45,
      totalScore: 47,
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
      opportunities: this.opportunities.length,
      signalsEmitted: this.alreadySignaled.size,
      dexMonitoring: {
        running:       this.dexService._running,
        watchedPairs:  this.dexService.watchedPairs.length,
        watchedTokens: this.dexService.watchedTokens.length,
        searchQueries: this.dexService.searchQueries,
      },
      lastUpdate: new Date().toISOString(),
    };
  }

  watchPair(chainId, pairId)          { this.dexService.addPair(chainId, pairId); }
  unwatchPair(chainId, pairId)        { this.dexService.removePair(chainId, pairId); }
  watchToken(chainId, tokenAddress)   { this.dexService.addToken(chainId, tokenAddress); }
  unwatchToken(chainId, tokenAddress) { this.dexService.removeToken(chainId, tokenAddress); }
  addSearchQuery(query)               { this.dexService.addSearchQuery(query); }
}

module.exports = EnhancedScoutAgent;
