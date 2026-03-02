// ============================================================
// SCOUT AGENT - Zoekt Solana Memecoin Kansen
// Van: Ignition Scalper SMA/momentum + nieuwe token detection
// ============================================================

const axios = require('axios');
const Logger = require('../utils/logger');

class ScoutAgent {
  constructor(connection, memory) {
    this.connection = connection;
    this.memory = memory;
    this.logger = Logger.create('SCOUT');
    this.name = 'scout';
    this.status = 'IDLE';
    this.scanCount = 0;

    // Geconfigureerde tokens om te monitoren (van originele scalpingbot)
    this.watchlist = [
      { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL' },
      { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' },
    ];

    this.priceHistory = {}; // token -> [prices]
    this.volumeHistory = {}; // token -> [volumes]
    this.opportunities = [];
  }

  async initialize() {
    this.logger.info('Scout Agent initialiseren...');
    // Laad eerder gescoutde tokens uit memory
    const savedWatchlist = await this.memory.get('scout_watchlist');
    if (savedWatchlist) {
      this.watchlist = [...this.watchlist, ...savedWatchlist];
    }
    this.status = 'READY';
    this.logger.info(`Scout klaar - ${this.watchlist.length} tokens op watchlist`);
  }

  // Hoofdscan functie - zoekt kansen via DexScreener API
  async scan() {
    this.status = 'SCANNING';
    this.scanCount++;
    const opportunities = [];

    try {
      // 1. Haal trending Solana tokens op via DexScreener
      const trending = await this.fetchTrendingTokens();

      // 2. Check volume spikes op watchlist
      const watchlistOpps = await this.checkWatchlist();

      // 3. Combineer en filter
      const allOpps = [...trending, ...watchlistOpps];
      const filtered = this.filterOpportunities(allOpps);

      // 4. Sorteer op score
      filtered.sort((a, b) => b.score - a.score);
      this.opportunities = filtered;

      this.logger.info(`Scan #${this.scanCount}: ${filtered.length} kansen gevonden`);
      this.status = 'IDLE';
      return filtered;

    } catch (error) {
      this.logger.error('Scout scan fout:', error.message);
      this.status = 'ERROR';
      return this.generateMockOpportunities(); // Fallback naar mock data
    }
  }

  async fetchTrendingTokens() {
    try {
      const response = await axios.get(
        'https://api.dexscreener.com/latest/dex/tokens/trending?chainId=solana',
        { timeout: 5000 }
      );

      if (!response.data || !response.data.pairs) return [];

      return response.data.pairs
        .filter(pair => pair.chainId === 'solana')
        .filter(pair => parseFloat(pair.volume?.h1 || 0) > 50000) // $50k volume
        .filter(pair => parseFloat(pair.liquidity?.usd || 0) > 10000) // $10k liquiditeit
        .map(pair => ({
          token: pair.baseToken.address,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          price: parseFloat(pair.priceUsd || 0),
          priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
          priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
          volume1h: parseFloat(pair.volume?.h1 || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          liquidity: parseFloat(pair.liquidity?.usd || 0),
          txns1h: (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),
          buyTxns1h: pair.txns?.h1?.buys || 0,
          sellTxns1h: pair.txns?.h1?.sells || 0,
          dexId: pair.dexId,
          pairAddress: pair.pairAddress,
          source: 'dexscreener_trending',
          score: this.calculateScore(pair),
        }));
    } catch (error) {
      this.logger.warn('DexScreener API fout, gebruik mock data');
      return [];
    }
  }

  async checkWatchlist() {
    const opportunities = [];
    for (const token of this.watchlist) {
      try {
        const data = await this.fetchTokenData(token.address);
        if (data && this.isOpportunity(data)) {
          opportunities.push({ ...data, source: 'watchlist' });
        }
      } catch (e) { /* Skip */ }
    }
    return opportunities;
  }

  async fetchTokenData(address) {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${address}`,
        { timeout: 5000 }
      );
      if (!response.data?.pairs?.[0]) return null;
      const pair = response.data.pairs[0];
      return {
        token: address,
        symbol: pair.baseToken.symbol,
        price: parseFloat(pair.priceUsd || 0),
        priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
        priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
        volume1h: parseFloat(pair.volume?.h1 || 0),
        liquidity: parseFloat(pair.liquidity?.usd || 0),
        buyTxns1h: pair.txns?.h1?.buys || 0,
        sellTxns1h: pair.txns?.h1?.sells || 0,
        score: this.calculateScore(pair),
      };
    } catch (e) { return null; }
  }

  isOpportunity(data) {
    return (
      data.volume1h > 50000 &&
      data.liquidity > 10000 &&
      data.priceChange5m > 0.5 && // Positief momentum (van Ignition Scalper)
      data.buyTxns1h > data.sellTxns1h * 1.2 // Meer kopers dan verkopers
    );
  }

  calculateScore(pair) {
    let score = 0;
    const vol1h = parseFloat(pair.volume?.h1 || 0);
    const liq = parseFloat(pair.liquidity?.usd || 0);
    const change5m = parseFloat(pair.priceChange?.m5 || 0);
    const change1h = parseFloat(pair.priceChange?.h1 || 0);
    const buyRatio = (pair.txns?.h1?.buys || 0) / Math.max(1, (pair.txns?.h1?.sells || 1));

    score += Math.min(vol1h / 10000, 30); // Max 30 punten voor volume
    score += Math.min(liq / 5000, 20); // Max 20 punten voor liquiditeit
    score += change5m > 0 ? Math.min(change5m * 2, 20) : 0; // Momentum
    score += change1h > 0 ? Math.min(change1h, 15) : 0; // Trend
    score += Math.min(buyRatio * 5, 15); // Buy/sell ratio

    return Math.min(score, 100);
  }

  filterOpportunities(opps) {
    const seen = new Set();
    return opps.filter(opp => {
      if (seen.has(opp.token)) return false;
      seen.add(opp.token);
      return opp.score > 30 && opp.volume1h > 10000;
    });
  }

  // Mock data voor paper trading / backtest zonder internet
  generateMockOpportunities() {
    const tokens = [
      { symbol: 'BONK', price: 0.000023, change: 3.5 },
      { symbol: 'WIF', price: 2.45, change: 1.8 },
      { symbol: 'POPCAT', price: 0.87, change: 5.2 },
      { symbol: 'MEW', price: 0.0089, change: 2.1 },
      { symbol: 'MYRO', price: 0.15, change: -0.8 },
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
        score: 40 + Math.random() * 50,
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
    };
  }
}

module.exports = ScoutAgent;
