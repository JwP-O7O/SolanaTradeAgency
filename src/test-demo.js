/**
 * Test Demo Script voor JwP Solana Trading Agency
 * 
 * Dit script demonstreert de volledige werking van de trading agency:
 * - DEX Screener monitoring voor potentiële memecoins
 * - Signal generatie en verwerking
 * - Paper trading simulatie
 * - Agent samenwerking en zelfoptimalisatie
 * 
 * Run: npm run demo
 */

const chalk = require('chalk');

// Simuleer de verschillende agency componenten
class DemoRunner {
  constructor() {
    this.running = false;
    this.signals = [];
    this.trades = [];
  }

  async start() {
    console.log(chalk.cyan('\n🚀 JwP Solana Trading Agency - Demo Mode\n'));
    console.log(chalk.yellow('════════════════════════════════════════\n'));
    
    this.running = true;
    
    // Fase 1: DEX Screener Monitoring
    await this.demoPhase1();
    
    // Fase 2: Signal Generatie
    await this.demoPhase2();
    
    // Fase 3: Trading Simulatie
    await this.demoPhase3();
    
    // Fase 4: Resultaten
    await this.demoPhase4();
    
    console.log(chalk.green('\n✅ Demo voltooid!\n'));
  }

  async demoPhase1() {
    console.log(chalk.blue('📊 Fase 1: DEX Screener Monitoring'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const mockTokens = [
      { symbol: 'BONK', price: 0.00001234, volume24h: 5000000, priceChange24h: 15.5 },
      { symbol: 'WIF', price: 0.892, volume24h: 8500000, priceChange24h: 8.2 },
      { symbol: 'PEPE2', price: 0.00000089, volume24h: 2100000, priceChange24h: 125.7 }
    ];
    
    for (const token of mockTokens) {
      await this.sleep(800);
      console.log(chalk.white(`  Token: ${token.symbol}`));
      console.log(chalk.gray(`  Prijs: $${token.price}`));
      console.log(chalk.gray(`  Volume: $${token.volume24h.toLocaleString()}`));
      console.log(chalk.gray(`  24h Change: ${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h}%`));
      
      if (token.priceChange24h > 50) {
        console.log(chalk.green(`  ✓ Potentiële hit gedetecteerd!\n`));
        this.signals.push({
          token: token.symbol,
          price: token.price,
          strength: 'HIGH',
          timestamp: Date.now()
        });
      } else {
        console.log(chalk.gray(`  - Geen signal\n`));
      }
    }
  }

  async demoPhase2() {
    console.log(chalk.blue('\n🎯 Fase 2: Signal Generatie & Agent Communicatie'));
    console.log(chalk.gray('─'.repeat(50)));
    
    for (const signal of this.signals) {
      await this.sleep(1000);
      console.log(chalk.yellow(`  📡 Signal verzonden naar Trading Agents`));
      console.log(chalk.white(`     Token: ${signal.token}`));
      console.log(chalk.white(`     Strength: ${signal.strength}`));
      console.log(chalk.white(`     Prijs: $${signal.price}`));
      
      await this.sleep(800);
      console.log(chalk.green(`  ✓ Signal ontvangen door Market Maker Agent`));
      console.log(chalk.green(`  ✓ Signal ontvangen door Scalper Agent\n`));
    }
  }

  async demoPhase3() {
    console.log(chalk.blue('\n💰 Fase 3: Paper Trading Simulatie'));
    console.log(chalk.gray('─'.repeat(50)));
    
    for (const signal of this.signals) {
      // Entry
      await this.sleep(1200);
      const entryPrice = signal.price;
      const amount = 10; // $10 instap
      
      console.log(chalk.cyan(`  📍 ENTRY - ${signal.token}`));
      console.log(chalk.gray(`     Prijs: $${entryPrice}`));
      console.log(chalk.gray(`     Amount: $${amount}`));
      console.log(chalk.gray(`     Strategie: Aggressive Scalp`));
      
      // Simuleer prijsbeweging
      await this.sleep(2000);
      const exitPrice = entryPrice * 1.035; // 3.5% winst
      const profit = amount * 0.035;
      
      console.log(chalk.green(`  📍 EXIT - ${signal.token}`));
      console.log(chalk.gray(`     Exit Prijs: $${exitPrice.toFixed(8)}`));
      console.log(chalk.green(`     Profit: +$${profit.toFixed(2)} (+3.5%)\n`));
      
      this.trades.push({
        token: signal.token,
        entry: entryPrice,
        exit: exitPrice,
        profit: profit,
        profitPct: 3.5
      });
      
      // Tweede microtrade
      await this.sleep(1500);
      const entry2 = exitPrice * 1.01;
      const exit2 = entry2 * 1.025; // 2.5% winst
      const profit2 = amount * 0.025;
      
      console.log(chalk.cyan(`  📍 ENTRY #2 - ${signal.token}`));
      console.log(chalk.gray(`     Prijs: $${entry2.toFixed(8)}`));
      
      await this.sleep(1800);
      console.log(chalk.green(`  📍 EXIT #2 - ${signal.token}`));
      console.log(chalk.gray(`     Exit Prijs: $${exit2.toFixed(8)}`));
      console.log(chalk.green(`     Profit: +$${profit2.toFixed(2)} (+2.5%)\n`));
      
      this.trades.push({
        token: signal.token,
        entry: entry2,
        exit: exit2,
        profit: profit2,
        profitPct: 2.5
      });
    }
  }

  async demoPhase4() {
    console.log(chalk.blue('\n📈 Fase 4: Resultaten & Optimalisatie'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
    const avgProfit = totalProfit / this.trades.length;
    const winRate = 100; // Demo: alle trades winst
    
    console.log(chalk.white(`  Total Trades: ${this.trades.length}`));
    console.log(chalk.green(`  Win Rate: ${winRate}%`));
    console.log(chalk.green(`  Total Profit: +$${totalProfit.toFixed(2)}`));
    console.log(chalk.white(`  Avg Profit per Trade: +$${avgProfit.toFixed(2)}\n`));
    
    await this.sleep(1000);
    console.log(chalk.yellow('  🤖 Agent Self-Optimization:'));
    console.log(chalk.gray(`     - Volatility threshold aangepast: 50% -> 45%`));
    console.log(chalk.gray(`     - Exit strategie verfijnd voor snellere exits`));
    console.log(chalk.gray(`     - Position size geoptimaliseerd voor volume\n`));
    
    await this.sleep(800);
    console.log(chalk.cyan('  💾 Backtesting data opgeslagen in data/backtest/'));
    console.log(chalk.cyan('  📝 Trading log opgeslagen in data/logs/\n'));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run demo
if (require.main === module) {
  const demo = new DemoRunner();
  demo.start().catch(err => {
    console.error(chalk.red('\n❌ Demo Error:', err.message));
    process.exit(1);
  });
}

module.exports = DemoRunner;
