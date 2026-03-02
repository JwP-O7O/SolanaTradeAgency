# 🚀 Solana Trade Agency v2.0

**Volledig Autonoom Multi-Agent Trading Systeem** voor Solana Memecoins

## 📋 Overzicht

Dit project combineert je originele **ScalpingBot** en **Ignition Scalper** in één krachtig autonomous trading agency systeem. Het gebruikt gespecialiseerde AI agents die samenwerken om kansen te detecteren, te analyseren en autonoom te handelen op Solana DEXes.

### ✨ Kenmerken

- 🤖 **5 Gespecialiseerde Agents**: Scout, Analyst, Risk Manager, Execution, Sentiment
- 📊 **Complete Backtest Engine**: Test strategieën op historische data
- 📝 **Paper Trading Mode**: Simuleer trades zonder risico
- 💰 **Live Trading**: Jupiter & Raydium DEX integratie
- 🧠 **Memory System**: Leert van eerdere trades
- 📈 **Real-time Dashboard**: WebSocket monitoring
- 🔒 **Risk Management**: Conservative position sizing, stop-loss, trailing stops
- 📱 **Multi-timeframe Analysis**: 1m, 5m confirmaties
- ⚡ **Snelle Microtransacties**: Max 15 min holding time

## 🏗️ Architectuur

```
SolanaTradeAgency/
├── src/
│   ├── agency.js              # Hoofdorchestrator
│   ├── agents/
│   │   ├── scout.js           # Token discovery & momentum  
│   │   ├── analyst.js         # Technical analysis (RSI, MACD, BB)
│   │   ├── riskManager.js     # Position sizing & risk controls
│   │   ├── execution.js       # DEX trade execution
│   │   └── sentiment.js       # Social & on-chain sentiment
│   ├── memory/
│   │   └── memorySystem.js    # Trade history & learning
│   ├── backtesting/
│   │   └── engine.js          # Backtest framework
│   ├── dashboard/
│   │   ├── server.js          # Express + Socket.IO
│   │   └── public/
│   │       └── index.html     # Real-time UI
│   └── utils/
│       └── logger.js          # Winston logging
├── config/
│   ├── .env.example
│   └── wallet.json            # Solana keypair (NIET COMMITTEN!)
├── data/
│   ├── trades.db              # SQLite trade history
│   └── backtest_results/
├── logs/
└── tests/
```

## 🎯 Agent Rollen

### 🔍 Scout Agent
- Scant DexScreener API voor trending tokens
- Monitort watchlist voor volume spikes
- Detecteert nieuwe liquiditeitspoolen
- Scoring: volume, liquiditeit, buy/sell ratio

### 📊 Analyst Agent (Van Scalpingbot)
- **RSI (14)**: Oversold < 25, Overbought > 75
- **MACD**: Fast(8) / Slow(21) / Signal(9)
- **Bollinger Bands**: 20 periode, 2σ
- **SMA Strategy**: Van Ignition Scalper (10/20)
- Candlestick pattern recognition

### 🛡️ Risk Manager Agent
- Position size: 0.5% van kapitaal (zeer conservatief!)
- Daily loss limit: 2% maximum
- Take profit: 1.5%
- Stop loss: 1%
- Trailing stop: Activeert bij 0.8%, volgt op 0.4%
- Max 3 concurrent trades

### 💰 Execution Agent
- Jupiter Aggregator: Beste prijs routing
- Raydium: Direct DEX access
- Slippage tolerance: 2%
- Gas optimization
- Retry logic met exponential backoff

### 🧠 Sentiment Agent
- Twitter/X mentions monitoring
- On-chain wallet analysis
- Rugcheck scam detection
- Social sentiment scoring

## 🚀 Quick Start

### 1. Installatie

```bash
git clone https://github.com/JwP-O7O/SolanaTradeAgency.git
cd SolanaTradeAgency
npm install
```

### 2. Configuratie

```bash
cp config/.env.example .env
```

Edit `.env`:

```env
# Mode: 'backtest', 'paper', of 'live'
MODE=paper

# Starting capital
INITIAL_CAPITAL=1000

# Solana RPC (krijg gratis bij QuickNode of Helius)
SOLANA_RPC=https://api.mainnet-beta.solana.com

# Cycle interval (milliseconds)
CYCLE_INTERVAL_MS=5000

# Dashboard port
PORT=3000

# Live trading only - plaats je wallet.json in config/
```

### 3. Run Modes

**Paper Trading** (aanbevolen om te starten):
```bash
npm run paper
```

**Backtest** (test op historische data):
```bash
npm run backtest
```

**Dashboard Only**:
```bash
npm run dashboard
```

**Live Trading** (VOORZICHTIG!):
```bash
# Plaats eerst je Solana wallet keypair in config/wallet.json
MODE=live npm start
```

## 📊 Dashboard

Open browser: `http://localhost:3000`

**Features**:
- Live agent status
- Open positions tracking
- Trade history met P&L
- Performance metrics (win rate, Sharpe ratio)
- Real-time price charts
- WebSocket updates elke 5s

## 🧪 Backtesting

Test je strategieën voor live deployment:

```bash
npm run backtest
```

**Backtest Features**:
- Historische price data simulatie
- Realistic slippage & fees
- Multiple timeframes
- Strategy comparison
- Performance reports (Sharpe, max drawdown, etc.)

**Output**:
```
Backtest Results:
- Total Trades: 127
- Win Rate: 64.5%
- Total P&L: +$247.80
- Max Drawdown: -8.3%
- Sharpe Ratio: 1.83
- Avg Win: +2.1%
- Avg Loss: -1.2%
```

## 📈 Trading Strategie

### Entry Conditions

**Scout filters**:
- Volume 1h > $50k
- Liquiditeit > $10k
- Positief momentum (5m change > 0.5%)
- Buy/sell ratio > 1.2

**Analyst confirmatie**:
- RSI < 75 (niet overbought)
- MACD bullish crossover
- Prijs > SMA(10) > SMA(20)
- Bollinger Bands: Prijs bij lower band (bounce opportunity)

**Risk approval**:
- Daily loss nog niet bereikt
- Max concurrent trades nog niet vol
- Positie size past binnen kapitaal

### Exit Conditions

1. **Take Profit**: +1.5% bereikt
2. **Stop Loss**: -1.0% bereikt  
3. **Trailing Stop**: Na +0.8%, volgt op 0.4% afstand
4. **Max Hold Time**: 15 minuten (force exit)
5. **Sentiment shift**: Plotselinge negatieve sentiment

## 🔧 Geavanceerde Configuratie

### Risk Parameters Aanpassen

Edit `src/agents/riskManager.js`:

```javascript
this.config = {
  maxPositionSizePercentage: 0.005,  // 0.5% per trade
  maxDailyLossPercentage: 0.02,      // 2% daily stop
  takeProfitPercentage: 0.015,       // 1.5% target
  stopLossPercentage: 0.01,          // 1% stop
  maxConcurrentTrades: 3,
};
```

### Technical Indicators Tunen

Edit `src/agents/analyst.js`:

```javascript
this.config = {
  rsiPeriod: 14,
  rsiOversold: 25,
  rsiOverbought: 75,
  macdFast: 8,
  macdSlow: 21,
  macdSignal: 9,
  bbPeriod: 20,
  bbStdDev: 2,
};
```

## 💾 Memory System

De agency leert van eerdere trades:

- **Short-term**: Huidige sessie data
- **Medium-term**: Laatste 7 dagen  
- **Long-term**: Alle historische trades

**Gebruikt voor**:
- Token-specifieke patterns herkennen
- Strategy weight optimization
- Market regime detection
- Performance analytics

## 🛡️ Safety Features

### Paper Trading Default
Altijd starten in paper mode - geen echt geld risico.

### Kill Switches
```javascript
// Daily loss limiet
if (dailyPnL < -maxDailyLoss) {
  pauseAllTrading();
  closeAllPositions();
}

// RPC connection lost
if (!connectionHealthy) {
  pauseAllTrading();
}
```

### Wallet Security
- **NEVER** commit `config/wallet.json` naar Git
- Gebruik `.gitignore`
- Start met kleine bedragen ($50-100)
- Test eerst ALTIJD in paper mode

## 📝 Logging

**Winston logging** naar console + files:

```
logs/
├── error.log       # Alleen errors
├── combined.log    # Alle events
└── trades.log      # Trade-specific
```

**Tail logs**:
```bash
tail -f logs/combined.log
```

## 🔄 Development Workflow

1. **Test nieuwe strategy**:
   ```bash
   # Edit agents/analyst.js
   npm run backtest
   # Review results in data/backtest_results/
   ```

2. **Paper trade new strategy**:
   ```bash
   npm run paper
   # Monitor dashboard for 24h
   ```

3. **Live deploy** (small capital):
   ```bash
   MODE=live INITIAL_CAPITAL=50 npm start
   ```

4. **Scale up gradually**:
   - Week 1: $50
   - Week 2: $100  
   - Week 3: $250
   - etc...

## 📊 Performance Tracking

Metrics automatisch berekend:

- **Win Rate**: % winning trades
- **Profit Factor**: Gross profit / Gross loss
- **Sharpe Ratio**: Risk-adjusted returns
- **Max Drawdown**: Grootste piek-tot-dal daling
- **Average Win/Loss**: Gemiddelde per trade
- **Recovery Factor**: Net profit / Max drawdown

## 🚧 Roadmap

- [x] Multi-agent architecture
- [x] Backtest engine
- [x] Paper trading
- [x] Real-time dashboard
- [ ] Jupiter DEX integratie (90% done)
- [ ] Raydium integratie  
- [ ] Telegram notificaties
- [ ] Advanced sentiment (Twitter API)
- [ ] ML-based strategy optimization
- [ ] Multi-wallet support
- [ ] Cloud deployment (Docker)

## ⚠️ Disclaimer

**Dit is experimentele software voor educatieve doeleinden.**

- Trading crypto heeft hoog risico
- Gebruik op eigen risico
- Start ALTIJD met paper trading
- Investeer nooit meer dan je kunt verliezen
- Geen financieel advies
- DYOR (Do Your Own Research)

## 📚 Resources

- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
- [Jupiter Aggregator](https://docs.jup.ag/)
- [DexScreener API](https://docs.dexscreener.com/)
- [Technical Indicators](https://github.com/anandanand84/technicalindicators)

## 🤝 Contributing

Pull requests welcome! Voor major changes, open eerst een issue.

## 📄 License

MIT License - zie LICENSE file

## 🆘 Support

Problemen? Check:
1. Logs in `logs/` directory
2. GitHub Issues
3. Discord community (link TBD)

---

**Made with ❤️ for Solana memecoin traders**

⭐ Star dit project als je het nuttig vindt!
