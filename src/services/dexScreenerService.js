// ============================================================
// DEX SCREENER SERVICE - Continuous Monitoring
// Covers all public DEX Screener API endpoints
// Rate limit: 60 req/min per endpoint
// ============================================================

const axios = require('axios');

const BASE_URL = 'https://api.dexscreener.com';

// Interval presets (ms) – stay well below 60 req/min limit
const INTERVALS = {
  tokenProfiles:     60_000,  //  1x / min
  communityTakeovers: 60_000,
  ads:               60_000,
  tokenBoostsLatest: 30_000,  //  2x / min
  tokenBoostsTop:    30_000,
  pairs:             10_000,  //  6x / min  (per watched pair)
  search:            15_000,
  tokenPairs:        15_000,
  tokens:            15_000,
};

class DexScreenerService {
  constructor(eventEmitter) {
    this.emitter    = eventEmitter; // pass an EventEmitter to subscribe to updates
    this.timers     = {};
    this.cache      = {};           // last known data per endpoint
    this.watchedPairs   = [];       // [{ chainId, pairId }]
    this.watchedTokens  = [];       // [{ chainId, tokenAddress }]
    this.searchQueries  = [];       // strings
    this._running   = false;
  }

  // ── Public API ──────────────────────────────────────────────

  /** Start all polling loops */
  start() {
    if (this._running) return;
    this._running = true;

    this._poll('tokenProfiles',      () => this.fetchTokenProfiles());
    this._poll('communityTakeovers', () => this.fetchCommunityTakeovers());
    this._poll('ads',                () => this.fetchAds());
    this._poll('tokenBoostsLatest',  () => this.fetchTokenBoostsLatest());
    this._poll('tokenBoostsTop',     () => this.fetchTokenBoostsTop());
    this._poll('search',             () => this.pollSearchQueries());
    this._poll('tokenPairs',         () => this.pollTokenPairs());
    this._poll('tokens',             () => this.pollTokens());
    this._poll('pairs',              () => this.pollPairs());

    console.log('[DexScreener] Continuous monitoring started');
  }

  /** Stop all polling loops */
  stop() {
    Object.values(this.timers).forEach(clearInterval);
    this.timers  = {};
    this._running = false;
    console.log('[DexScreener] Monitoring stopped');
  }

  /** Watch a specific trading pair */
  addPair(chainId, pairId) {
    if (!this.watchedPairs.find(p => p.chainId === chainId && p.pairId === pairId)) {
      this.watchedPairs.push({ chainId, pairId });
    }
  }

  removePair(chainId, pairId) {
    this.watchedPairs = this.watchedPairs.filter(
      p => !(p.chainId === chainId && p.pairId === pairId)
    );
  }

  /** Watch a token address for pair data */
  addToken(chainId, tokenAddress) {
    if (!this.watchedTokens.find(t => t.chainId === chainId && t.tokenAddress === tokenAddress)) {
      this.watchedTokens.push({ chainId, tokenAddress });
    }
  }

  removeToken(chainId, tokenAddress) {
    this.watchedTokens = this.watchedTokens.filter(
      t => !(t.chainId === chainId && t.tokenAddress === tokenAddress)
    );
  }

  /** Add a search query to poll */
  addSearchQuery(query) {
    if (!this.searchQueries.includes(query)) this.searchQueries.push(query);
  }

  /** Get cached data snapshot */
  getCache(key) {
    return this.cache[key] ?? null;
  }

  // ── Fetch helpers ────────────────────────────────────────────

  async fetchTokenProfiles() {
    const data = await this._get('/token-profiles/latest/v1');
    this._emit('tokenProfiles', data);
    return data;
  }

  async fetchCommunityTakeovers() {
    const data = await this._get('/community-takeovers/latest/v1');
    this._emit('communityTakeovers', data);
    return data;
  }

  async fetchAds() {
    const data = await this._get('/ads/latest/v1');
    this._emit('ads', data);
    return data;
  }

  async fetchTokenBoostsLatest() {
    const data = await this._get('/token-boosts/latest/v1');
    this._emit('tokenBoostsLatest', data);
    return data;
  }

  async fetchTokenBoostsTop() {
    const data = await this._get('/token-boosts/top/v1');
    this._emit('tokenBoostsTop', data);
    return data;
  }

  async fetchOrders(chainId, tokenAddress) {
    const data = await this._get(`/orders/v1/${chainId}/${tokenAddress}`);
    this._emit('orders', { chainId, tokenAddress, data });
    return data;
  }

  async fetchPair(chainId, pairId) {
    const data = await this._get(`/latest/dex/pairs/${chainId}/${pairId}`);
    this._emit('pair', { chainId, pairId, data });
    return data;
  }

  async fetchSearch(query) {
    const data = await this._get('/latest/dex/search', { q: query });
    this._emit('search', { query, data });
    return data;
  }

  async fetchTokenPairs(chainId, tokenAddress) {
    const data = await this._get(`/token-pairs/v1/${chainId}/${tokenAddress}`);
    this._emit('tokenPairs', { chainId, tokenAddress, data });
    return data;
  }

  async fetchTokens(chainId, tokenAddresses) {
    // tokenAddresses is a comma-separated string or array
    const addresses = Array.isArray(tokenAddresses)
      ? tokenAddresses.join(',')
      : tokenAddresses;
    const data = await this._get(`/tokens/v1/${chainId}/${addresses}`);
    this._emit('tokens', { chainId, tokenAddresses: addresses, data });
    return data;
  }

  // ── Poll group handlers ──────────────────────────────────────

  async pollPairs() {
    for (const { chainId, pairId } of this.watchedPairs) {
      await this.fetchPair(chainId, pairId);
    }
  }

  async pollTokenPairs() {
    for (const { chainId, tokenAddress } of this.watchedTokens) {
      await this.fetchTokenPairs(chainId, tokenAddress);
    }
  }

  async pollTokens() {
    if (this.watchedTokens.length === 0) return;
    // Group by chainId, max 30 addresses per request
    const byChain = {};
    for (const { chainId, tokenAddress } of this.watchedTokens) {
      (byChain[chainId] = byChain[chainId] || []).push(tokenAddress);
    }
    for (const [chainId, addresses] of Object.entries(byChain)) {
      const chunks = this._chunk(addresses, 30);
      for (const chunk of chunks) {
        await this.fetchTokens(chainId, chunk);
      }
    }
  }

  async pollSearchQueries() {
    for (const query of this.searchQueries) {
      await this.fetchSearch(query);
    }
  }

  // ── Internal helpers ─────────────────────────────────────────

  _poll(name, fn) {
    const interval = INTERVALS[name] ?? 60_000;
    // Run immediately, then on interval
    fn().catch(e => console.error(`[DexScreener] ${name} error:`, e.message));
    this.timers[name] = setInterval(() => {
      fn().catch(e => console.error(`[DexScreener] ${name} error:`, e.message));
    }, interval);
  }

  _emit(event, data) {
    this.cache[event] = { data, timestamp: Date.now() };
    if (this.emitter) this.emitter.emit(`dex:${event}`, data);
  }

  async _get(path, params = {}) {
    const response = await axios.get(`${BASE_URL}${path}`, {
      params,
      timeout: 8000,
      headers: { 'Accept': 'application/json' },
    });
    return response.data;
  }

  _chunk(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}

module.exports = DexScreenerService;
