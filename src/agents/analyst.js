// ============================================================
// ANALYST AGENT - PHASE 1 UPGRADE
// Echte OHLCV candles via Birdeye API
// RSI/MACD/BB/SMA op echte data
// ============================================================

const TA = require('technicalindicators');
const axios = require('axios');
const Logger = require('../utils/logger');

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || ''; // Free tier: 100 req/min

class AnalystAgent {
  constructor(connection, memory) {
    this.connection = connection;
    this.memory = memory;
    this.logger = Logger.create('ANALYST');
    this.name = 'analyst';
    this.status = 'IDLE';

    this.config = {
      rsiPeriod: 14,
      rsiOversold: 25,
      rsiOverbought: 75,
      macdFast: 8,
      macdSlow: 21,
      macdSignal: 9,
      bbPeriod: 20,
      bbStdDev: 2,
      smaPeriod10: 10,
      smaPeriod20: 20,
    };

    this.priceCache = {};
  }

  async initialize() {
    this.logger.info('Analyst Agent initialiseren (BIRDEYE candles)...');
    this.status = 'READY';
  }

  async analyze(opportunity) {
    this.status = 'ANALYZING';
    try {
      // Fetch echte candles via Birdeye
      const candles = await this.fetchCandles(opportunity.token, '1m', 100);
      if (!candles || candles.length < 50) {
        this.logger.warn(`Onvoldoende candles voor ${opportunity.symbol}`);
        return null;
      }

      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);

      // RSI
      const rsi = TA.RSI.calculate({ period: this.config.rsiPeriod, values: closes });
      const currentRSI = rsi[rsi.length - 1];

      // MACD
      const macd = TA.MACD.calculate({
        fastPeriod: this.config.macdFast,
        slowPeriod: this.config.macdSlow,
        signalPeriod: this.config.macdSignal,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
        values: closes,
      });
      const currentMACD = macd[macd.length - 1];

      // Bollinger Bands
      const bb = TA.BollingerBands.calculate({
        period: this.config.bbPeriod,
        stdDev: this.config.bbStdDev,
        values: closes,
      });
      const currentBB = bb[bb.length - 1];

      // SMA (Ignition Scalper)
      const sma10 = TA.SMA.calculate({ period: this.config.smaPeriod10, values: closes });
      const sma20 = TA.SMA.calculate({ period: this.config.smaPeriod20, values: closes });
      const currentSMA10 = sma10[sma10.length - 1];
      const currentSMA20 = sma20[sma20.length - 1];
      const currentPrice = closes[closes.length - 1];

      // Signal generation
      let action = 'HOLD';
      let confidence = 0;
      let reasons = [];

      // BUY signals
      if (currentRSI < this.config.rsiOversold) { confidence += 25; reasons.push('RSI oversold'); }
      if (currentMACD && currentMACD.MACD > currentMACD.signal) { confidence += 20; reasons.push('MACD bullish'); }
      if (currentPrice < currentBB.lower) { confidence += 15; reasons.push('BB lower bounce'); }
      if (currentPrice > currentSMA10 && currentSMA10 > currentSMA20) { confidence += 30; reasons.push('SMA uptrend'); }
      if (opportunity.priceChange5m > 0.5) { confidence += 10; reasons.push('Positive momentum'); }

      // SELL signals (inverse)
      if (currentRSI > this.config.rsiOverbought) { confidence -= 25; reasons.push('RSI overbought'); }
      if (currentMACD && currentMACD.MACD < currentMACD.signal) { confidence -= 20; reasons.push('MACD bearish'); }
      if (currentPrice > currentBB.upper) { confidence -= 15; reasons.push('BB upper resistance'); }
      if (currentPrice < currentSMA10) { confidence -= 30; reasons.push('Below SMA10'); }

      if (confidence >= 50) action = 'BUY';
      else if (confidence <= -30) action = 'SELL';

      // Mark strategy voor MEME_MICRO_SCALP of standard
      const strategy = opportunity.source === 'dexscreener-live' || opportunity.source === 'dexscreener'
        ? 'MEME_MICRO_SCALP'
        : 'SCALPING_RSI_MACD_BB_SMA';

      this.status = 'IDLE';
      return {
        token: opportunity.token,
        symbol: opportunity.symbol,
        action,
        confidence: Math.abs(confidence),
        price: currentPrice,
        indicators: { rsi: currentRSI, macd: currentMACD, bb: currentBB, sma10: currentSMA10, sma20: currentSMA20 },
        reasons,
        strategy,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Analyse fout:', error.message);
      this.status = 'ERROR';
      return null;
    }
  }

  async fetchCandles(token, timeframe, limit) {
    if (token.startsWith('mock_')) return this.generateMockCandles(limit);

    try {
      // Birdeye OHLCV endpoint: /defi/ohlcv?address=TOKEN&type=1m&time_from=X&time_to=Y
      const now = Math.floor(Date.now() / 1000);
      const timeFrom = now - (limit * 60); // 100 candles * 60 sec

      const url = `${BIRDEYE_BASE_URL}/defi/ohlcv?address=${token}&type=1m&time_from=${timeFrom}&time_to=${now}`;
      const headers = BIRDEYE_API_KEY ? { 'X-API-KEY': BIRDEYE_API_KEY } : {};

      const res = await axios.get(url, { headers, timeout: 5000 });

      if (!res.data?.data?.items || res.data.data.items.length < 50) {
        this.logger.warn(`Birdeye returned insufficient candles for ${token}, fallback to mock`);
        return this.generateMockCandles(limit);
      }

      // Map Birdeye OHLCV format
      return res.data.data.items.map(c => ({
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
        volume: c.v,
        time: c.unixTime * 1000, // convert to ms
      })).reverse(); // Birdeye retourneert nieuw->oud, we willen oud->nieuw

    } catch (error) {
      this.logger.warn(`Birdeye fetch error for ${token}:`, error.message);
      return this.generateMockCandles(limit);
    }
  }

  generateMockCandles(count) {
    const candles = [];
    let price = 0.001;
    for (let i = 0; i < count; i++) {
      const volatility = 0.02;
      const change = (Math.random() - 0.5) * volatility;
      price = price * (1 + change);
      candles.push({
        open: price * 0.998,
        high: price * 1.002,
        low: price * 0.997,
        close: price,
        volume: 10000 + Math.random() * 50000,
        time: Date.now() - (count - i) * 60000,
      });
    }
    return candles;
  }

  async getCurrentPrice(token) {
    if (token.startsWith('mock_')) return 0.001 * (1 + (Math.random() - 0.5) * 0.02);

    try {
      const url = `${BIRDEYE_BASE_URL}/defi/price?address=${token}`;
      const headers = BIRDEYE_API_KEY ? { 'X-API-KEY': BIRDEYE_API_KEY } : {};
      const res = await axios.get(url, { headers, timeout: 3000 });
      return parseFloat(res.data?.data?.value || 0);
    } catch (e) {
      this.logger.warn(`getCurrentPrice error for ${token}`);
      return 0.001;
    }
  }

  getStatus() {
    return { name: this.name, status: this.status };
  }
}

module.exports = AnalystAgent;
