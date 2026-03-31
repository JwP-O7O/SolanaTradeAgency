// ============================================================
// DATA COLLECTOR - FASE 1.6
// Slaat MEMECOIN_HIT events op voor backtest replay
// Verzamelt prijsverloop na elke hit voor analyse
// ============================================================

const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');

class DataCollector {
  constructor(signalBus) {
    this.bus = signalBus;
    this.dataDir = path.join(__dirname, '../../data/backtest');
    this.hitsFile = path.join(this.dataDir, 'memecoin-hits.json');
    this.hits = [];
    this.isCollecting = false;
  }

  async initialize() {
    await fs.ensureDir(this.dataDir);
    
    // Load existing hits
    if (await fs.pathExists(this.hitsFile)) {
      this.hits = await fs.readJson(this.hitsFile);
    }

    // Listen to MEMECOIN_HIT signals from SignalBus
    if (this.bus) {
      this.bus.on('MEMECOIN_HIT', async (envelope) => {
        await this.recordHit(envelope.payload);
      });
    }
  }

  async start() {
    this.isCollecting = true;
    console.log('[DataCollector] Started collecting MEMECOIN_HIT data');
  }

  async stop() {
    this.isCollecting = false;
    await this.save();
    console.log('[DataCollector] Stopped and saved data');
  }

  async recordHit(hit) {
    if (!this.isCollecting) return;

    const record = {
      id: `HIT-${Date.now()}-${hit.symbol}`,
      timestamp: Date.now(),
      token: hit.token,
      symbol: hit.symbol,
      price: hit.price,
      priceChange5m: hit.priceChange5m,
      priceChange1h: hit.priceChange1h,
      volume1h: hit.volume1h,
      liquidity: hit.liquidity,
      buyRatio: hit.buyRatio,
      technicalScore: hit.technicalScore,
      totalScore: hit.totalScore,
      source: hit.source,
      dexUrl: hit.dexUrl,
      // Track price evolution for backtest (add via periodic updates)
      priceHistory: [{ t: Date.now(), p: hit.price }],
    };

    this.hits.push(record);

    // Auto-save every 10 hits
    if (this.hits.length % 10 === 0) {
      await this.save();
    }

    // Keep max 5000 hits in memory
    if (this.hits.length > 5000) {
      const archived = this.hits.slice(0, this.hits.length - 5000);
      const archiveFile = path.join(this.dataDir, `hits-archive-${Date.now()}.json`);
      await fs.writeJson(archiveFile, archived, { spaces: 2 });
      this.hits = this.hits.slice(-5000);
    }

    console.log(`[DataCollector] Recorded hit: ${hit.symbol} @ $${hit.price}`);
  }

  async save() {
    await fs.writeJson(this.hitsFile, this.hits, { spaces: 2 });
  }

  async getHits(fromTimestamp = null, limit = 1000) {
    let filtered = this.hits;
    if (fromTimestamp) {
      filtered = this.hits.filter(h => h.timestamp >= fromTimestamp);
    }
    return filtered.slice(-limit);
  }

  getStats() {
    return {
      totalHits: this.hits.length,
      isCollecting: this.isCollecting,
      lastHit: this.hits.length ? this.hits[this.hits.length - 1] : null,
    };
  }
}

module.exports = DataCollector;
