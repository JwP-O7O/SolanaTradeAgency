// ============================================================
// MEMORY SYSTEM - FASE 1.5
// Persisteert trades, cooldowns en performance naar JSON
// Zodat data herstart overleeft voor backtesting/auto-tune
// ============================================================

const fs = require('fs-extra');
const path = require('path');

class MemorySystem {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.tradesFile = path.join(this.dataDir, 'trades.json');
    this.memoryFile = path.join(this.dataDir, 'memory.json');
    this.cooldownsFile = path.join(this.dataDir, 'cooldowns.json');
    
    this.memory = {};
    this.trades = [];
    this.cooldowns = {};
  }

  async initialize() {
    await fs.ensureDir(this.dataDir);
    
    // Load existing data
    if (await fs.pathExists(this.memoryFile)) {
      this.memory = await fs.readJson(this.memoryFile);
    }
    if (await fs.pathExists(this.tradesFile)) {
      this.trades = await fs.readJson(this.tradesFile);
    }
    if (await fs.pathExists(this.cooldownsFile)) {
      this.cooldowns = await fs.readJson(this.cooldownsFile);
    }
  }

  async save() {
    await Promise.all([
      fs.writeJson(this.memoryFile, this.memory, { spaces: 2 }),
      fs.writeJson(this.tradesFile, this.trades, { spaces: 2 }),
      fs.writeJson(this.cooldownsFile, this.cooldowns, { spaces: 2 }),
    ]);
  }

  async set(key, value) {
    this.memory[key] = value;
    // Auto-save on critical keys
    if (key.startsWith('cooldown:')) {
      this.cooldowns[key.replace('cooldown:', '')] = value;
      await fs.writeJson(this.cooldownsFile, this.cooldowns);
    }
    return value;
  }

  async get(key) {
    if (key === 'scout_cooldowns') return this.cooldowns;
    return this.memory[key];
  }

  async saveTrade(signal, result) {
    const trade = {
      id: result.tradeId || `T-${Date.now()}`,
      timestamp: Date.now(),
      token: signal.token,
      symbol: signal.symbol,
      action: signal.action,
      strategy: signal.strategy,
      entryPrice: result.price || signal.price,
      exitPrice: result.exitPrice,
      pnlPct: result.pnlPct,
      exitReason: result.exitReason,
      confidence: signal.confidence,
      positionSize: signal.positionSize,
      mode: result.mode || 'paper',
    };
    
    this.trades.push(trade);
    
    // Keep last 1000 trades in memory, rest in file
    if (this.trades.length > 1000) {
      const archived = this.trades.slice(0, this.trades.length - 1000);
      const archiveFile = path.join(this.dataDir, `trades-archive-${Date.now()}.json`);
      await fs.writeJson(archiveFile, archived);
      this.trades = this.trades.slice(-1000);
    }
    
    await fs.writeJson(this.tradesFile, this.trades, { spaces: 2 });
    return trade;
  }

  async getClosedTrades(strategy = null, limit = 100) {
    let filtered = this.trades.filter(t => t.exitPrice !== undefined);
    if (strategy) filtered = filtered.filter(t => t.strategy === strategy);
    return filtered.slice(-limit);
  }

  async getPerformanceStats(strategy = null) {
    const trades = await this.getClosedTrades(strategy, 500);
    if (!trades.length) return null;

    const winners = trades.filter(t => t.pnlPct > 0);
    const losers = trades.filter(t => t.pnlPct <= 0);

    return {
      totalTrades: trades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: (winners.length / trades.length * 100).toFixed(2),
      avgWin: winners.length ? (winners.reduce((s, t) => s + t.pnlPct, 0) / winners.length).toFixed(2) : 0,
      avgLoss: losers.length ? (losers.reduce((s, t) => s + t.pnlPct, 0) / losers.length).toFixed(2) : 0,
      profitFactor: this.calculateProfitFactor(winners, losers),
      strategy,
    };
  }

  calculateProfitFactor(winners, losers) {
    const totalWin = winners.reduce((s, t) => s + Math.abs(t.pnlPct), 0);
    const totalLoss = losers.reduce((s, t) => s + Math.abs(t.pnlPct), 0);
    return totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : 0;
  }
}

module.exports = MemorySystem;
