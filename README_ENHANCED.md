# 🚀 Solana Trade Agency v3.0 - Enhanced Multi-Agent Trading System

**Autonomous AI-powered trading agency for Solana memcoins with real-time monitoring, intelligent signal generation, and automated execution.**

## 🎯 Overview

The Solana Trade Agency is a sophisticated multi-agent system designed for high-frequency micro-trading of Solana memcoins. It combines:

- **Scout Agent**: Real-time opportunity detection via DexScreener, social media, Telegram, and on-chain metrics
- **Analyst Agent**: Technical analysis with RSI, MACD, Bollinger Bands, and SMA indicators
- **Sentiment Agent**: Market sentiment analysis from Twitter, Telegram, Reddit, and on-chain data
- **Risk Manager Agent**: Intelligent position sizing, risk limits, and portfolio protection
- **Execution Agent**: Micro-trade execution on Solana blockchain with retry logic

## ✨ Key Features

### Real-Time Monitoring
- **Multi-source opportunity detection**: DexScreener, social media, Telegram, forums
- **Live agent status**: Monitor all agents in real-time
- **WebSocket updates**: Instant dashboard synchronization
- **Performance tracking**: Win rate, Sharpe ratio, max drawdown

### Intelligent Trading
- **Multi-indicator analysis**: RSI, MACD, Bollinger Bands, SMA
- **Confidence scoring**: 0-100% confidence on every signal
- **Risk-adjusted sizing**: Position size scales with confidence
- **Dynamic exits**: Take profit, stop loss, trailing stops

### AI-Powered Analysis
- **Sentiment extraction**: NLP analysis of social media
- **Pattern recognition**: Trade pattern analysis with LLM
- **Strategy optimization**: Automated parameter suggestions
- **Market intelligence**: Whale activity and on-chain metrics

### Risk Management
- **Position limits**: Max 2% per trade, 5 concurrent positions
- **Daily loss limits**: 5% daily loss cap
- **Drawdown protection**: 10% max drawdown
- **Correlation checks**: Avoid correlated positions

## 🏗️ Architecture

```
Scout Agent (Monitoring)
    ↓
Sentiment Agent (Analysis)
    ↓
Analyst Agent (Technical)
    ↓
Risk Manager (Approval)
    ↓
Execution Agent (Trading)
    ↓
Dashboard (Visualization)
```

## 🚀 Quick Start

### Installation
```bash
git clone https://github.com/yourusername/SolanaTradeAgency.git
cd SolanaTradeAgency
npm install
```

### Configuration
Create `.env` file:
```env
MODE=paper
INITIAL_CAPITAL=1000
SOLANA_RPC=https://api.mainnet-beta.solana.com
DASHBOARD_URL=http://localhost:3000
CYCLE_INTERVAL_MS=5000
```

### Run Agency
```bash
# Paper trading (recommended for testing)
npm start

# Backtest mode
MODE=backtest npm start

# Live trading (⚠️ use with caution)
MODE=live npm start
```

### Start Dashboard
```bash
cd ../solana-trade-agency-dashboard
npm install
npm run dev
```

Access dashboard at `http://localhost:3000`

## 📊 Dashboard Features

### Real-Time Monitoring
- **Portfolio Overview**: Capital, P&L, daily P&L, win rate
- **Agent Status Panel**: Live status of all 5 agents
- **Signal Feed**: Trading signals with confidence scores
- **Trade History**: Entry/exit prices, P&L %, exit reasons

### Analytics
- **Performance Charts**: Capital growth, P&L over time
- **Trade Distribution**: Win/loss ratio visualization
- **Risk Metrics**: Sharpe ratio, max drawdown, profit factor
- **Agent Metrics**: Scan count, analysis count, execution rate

### Configuration
- **Parameter Tuning**: Adjust RSI, MACD, position sizing
- **Risk Settings**: Daily loss limit, max drawdown
- **Watchlist Management**: Add/remove tokens to monitor
- **Strategy Selection**: Choose trading strategy

## 🔧 Agent Configuration

### Scout Agent
```javascript
minVolume: 50000              // Minimum 1h volume
minLiquidity: 10000           // Minimum USD liquidity
opportunityThreshold: 30      // Minimum opportunity score
socialMediaWeight: 0.3        // Social metrics weight
technicalWeight: 0.4          // Technical metrics weight
onChainWeight: 0.3            // On-chain metrics weight
```

### Analyst Agent
```javascript
rsiPeriod: 14                 // RSI period
rsiOversold: 25               // RSI oversold threshold
rsiOverbought: 75             // RSI overbought threshold
macdFast: 8                   // MACD fast period
macdSlow: 21                  // MACD slow period
bbPeriod: 20                  // Bollinger Bands period
smaPeriod10: 10               // Short-term SMA
smaPeriod20: 20               // Long-term SMA
```

### Risk Manager
```javascript
maxPositionSizePct: 0.02      // 2% per trade
maxConcurrentPositions: 5     // Max open positions
dailyLossLimitPct: 0.05       // 5% daily loss limit
maxDrawdownPct: 0.10          // 10% max drawdown
defaultStopLossPct: 0.01      // 1% default stop loss
defaultTakeProfitPct: 0.015   // 1.5% default take profit
```

## 📈 Performance Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Win Rate** | % of profitable trades | >55% |
| **Sharpe Ratio** | Risk-adjusted returns | >1.0 |
| **Max Drawdown** | Largest peak-to-trough decline | <10% |
| **Profit Factor** | Gross profit / Gross loss | >1.5 |
| **Average Win** | Mean profit on winning trades | >1.5% |
| **Average Loss** | Mean loss on losing trades | <1% |

## 🔌 Integration Points

### External APIs
- **DexScreener**: Token data and trends
- **Solana RPC**: Blockchain interaction
- **Twitter API**: Social sentiment
- **Reddit API**: Community discussion
- **Telegram API**: Group monitoring

### Database
- **MySQL**: Trade history, signals, agent status
- **Local Memory**: Real-time caching
- **WebSocket**: Real-time dashboard updates

## 🛡️ Risk Management

### Position Sizing
- Scales with signal confidence
- Max 2% of capital per trade
- Adjusted for portfolio volatility

### Stop Loss & Take Profit
- Dynamic based on volatility
- Tighter for high-confidence signals
- Wider for low-confidence signals

### Portfolio Protection
- Daily loss limits
- Max drawdown limits
- Correlation checks
- Liquidity verification

## 📝 Trading Modes

### Backtest Mode
- Historical data simulation
- No real transactions
- Performance analysis
- Strategy optimization

### Paper Trading
- Live data, simulated execution
- Risk-free testing
- Performance tracking
- Parameter tuning

### Live Trading
- Real transactions on Solana
- Actual P&L
- Full risk exposure
- Production monitoring

## 🚨 Monitoring & Alerts

### Real-Time Alerts
- Large wins/losses (>5% P&L)
- Risk limit warnings
- Agent errors
- High-confidence signals

### Metrics Tracking
- Win rate trending
- Sharpe ratio evolution
- Drawdown monitoring
- Daily P&L tracking

## 📚 Documentation

- **[AGENCY_ARCHITECTURE.md](./AGENCY_ARCHITECTURE.md)** - Detailed system architecture
- **[INTEGRATION.md](./INTEGRATION.md)** - Dashboard integration guide
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[Dashboard README](../solana-trade-agency-dashboard/README.md)** - Dashboard documentation

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## ⚠️ Disclaimer

**This software is provided for educational purposes only.** Trading cryptocurrencies involves substantial risk of loss. Past performance does not guarantee future results. Always:
- Start with paper trading
- Use small position sizes
- Monitor your trades carefully
- Never risk more than you can afford to lose

## 📄 License

MIT License - See LICENSE file for details

## 🆘 Support

- **Issues**: Report on GitHub
- **Discussions**: Join Discord community
- **Email**: support@example.com

---

**Made with ❤️ for Solana traders**

⭐ Star this project if you find it useful!
