# 🚀 JwP Solana Trading Agency

**Autonomous AI Trading Agency voor Solana Memecoins**

Volautomatische trading bot die 24/7 Solana memecoins scant, analyseert en tradet met AI-agents.

---

## ⚡ ONE-COMMAND INSTALL & START

```bash
curl -fsSL https://raw.githubusercontent.com/JwP-O7O/SolanaTradeAgency/main/setup.sh | bash
```

Dat is alles! De script doet:
✅ Installeert alle dependencies
✅ Maakt configuratie files aan  
✅ Start de trading agency

---

## 📖 Manual Install (als je meer controle wilt)

### Vereisten
- Node.js 16+ ([download](https://nodejs.org/))
- Git

### Stappen

```bash
# 1. Clone repo
git clone https://github.com/JwP-O7O/SolanaTradeAgency.git
cd SolanaTradeAgency

# 2. Installeer alles
chmod +x install.sh
./install.sh

# 3. Start!
npm start
```

---

## 🎯 Wat doet het?

De agency draait een continuous loop die:

1. **Scout Agent** → Scant DEX Screener voor nieuwe memecoins
2. **Sentiment Agent** → Analyseert social metrics & buy/sell ratio
3. **Analyst Agent** → Doet technische analyse (RSI, MACD, momentum)
4. **Risk Manager** → Beoordeelt risico per strategie
5. **Execution Agent** → Voert paper trades uit
6. **Monitoring** → Checkt open posities voor SL/TP exits

**Elke 30 seconden** een nieuwe scan! 🔄

---

## 📊 Trading Strategieën

De agency gebruikt 3 strategieën (automatisch gekozen):

### 1. MEME_MICRO_SCALP (Agressief)
- 1% position size
- 1% stop loss  
- 2% take profit
- Voor high-volume, volatile memecoins

### 2. MOMENTUM_SWING (Medium)
- 2% position size
- 2% stop loss
- 5% take profit  
- Voor trending tokens met momentum

### 3. CONSERVATIVE_HOLD (Veilig)
- 0.5% position size
- 3% stop loss
- 10% take profit
- Voor gevestigde tokens

---

## ⚙️ Configuratie

Pas `.env` aan (wordt auto-aangemaakt):

```env
# Trading Mode
MODE=paper                    # paper of live

# Monitoring
MONITORING_INTERVAL=30000     # milliseconden (30s default)

# Filters  
MIN_LIQUIDITY=5000            # $5000 minimum liquidity
MIN_VOLUME_24H=10000          # $10k minimum 24h volume

# Voor live trading (optioneel)
# SOLANA_RPC_URL=your_rpc_url
# WALLET_PRIVATE_KEY=your_key
```

---

## 📈 Output Example

```
==========================================
JwP TRADING AGENCY - AUTONOMOUS MODE
==========================================

[Agency] Agency initialized in paper mode
[DexScreener] Scanning for new Solana memecoins...
[Scout] Found 5 memecoin candidates

[$BONK]: Signal generated - BUY (confidence: 0.85)
[$BONK]: Risk approved (score: 4)
[$BONK]: Trade executed successfully

=== Cycle Stats ===
Portfolio Balance: 1.0234 SOL
Open Positions: 2
Total Trades: 15
Win Rate: 66.67%
Total P&L: +0.0234 SOL (+2.34%)
===================
```

---

## 🛑 Stoppen

Druk op `Ctrl+C` of:

```bash
pkill -f "node.*index.js"
```

---

## 📂 Project Structuur

```
SolanaTradeAgency/
├── config/
│   └── strategies.json      # Trading strategieën
├── src/
│   ├── agents/              # AI agents
│   │   ├── scout-enhanced.js
│   │   ├── sentiment-enhanced.js
│   │   ├── analyst.js
│   │   ├── risk-manager-enhanced.js
│   │   └── execution-enhanced.js
│   ├── services/
│   │   ├── dexScreenerService.js  # DEX API
│   │   └── dataCollector.js       # Data verzameling
│   ├── memory/
│   │   └── memorySystem.js        # Leren van trades
│   └── agency-enhanced.js         # Main orchestrator
├── install.sh               # Installatie script
├── setup.sh                 # One-command installer
├── package.json
└── .env                     # Config (auto-generated)
```

---

## 🔧 Commands

```bash
# Start agency
npm start

# Test zonder DEX (mock data)
npm run test

# Check logs
tail -f logs/$(date +%Y-%m-%d).log

# Reset paper portfolio
rm -rf data/*
```

---

## 🎓 Hoe werkt het?

### Paper Trading Mode (Default)
- ✅ Geen echt geld nodig
- ✅ Test strategieën risk-free
- ✅ Verzamelt performance data
- ✅ Perfect voor fine-tuning

### Live Trading Mode
⚠️ **LET OP:** Alleen voor ervaren traders!

1. Zet `MODE=live` in `.env`
2. Voeg Solana RPC URL toe
3. Voeg wallet private key toe  
4. Start met kleine amounts!

---

## 📊 Performance Tracking

De agency tracked automatisch:
- Total P&L
- Win rate
- Best/worst performing strategy
- Avg trade duration
- Max drawdown

Alles wordt opgeslagen in `data/` voor backtesting.

---

## 🚧 Roadmap

- [x] Multi-agent architecture
- [x] Paper trading
- [x] Real-time DEX Screener monitoring
- [x] 3 Trading strategieën
- [x] Risk management
- [ ] Backtesting UI
- [ ] Live trading (careful!)
- [ ] Telegram notifications
- [ ] Web dashboard
- [ ] More exchanges (Raydium, Orca)

---

## ⚠️ Disclaimer

**BELANGRIJK:**
- Dit is experimentele software
- Gebruik op eigen risico
- Start ALTIJD met paper trading
- Geen financieel advies
- Test grondig voor live trading
- Verlies meer dan je kunt missen = BAD



## 📡 Monitoring & Notifications

### Telegram Bot Setup (Optioneel)

Ontvang real-time notifications op je telefoon!

**Stappen:**

1. Open Telegram en zoek naar `@BotFather`
2. Stuur `/newbot` en volg de instructies
3. Kopieer de bot token
4. Zoek naar `@userinfobot` en stuur `/start` om je chat ID te krijgen
5. Voeg toe aan `.env`:

```env
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here
```

**Wat ontvang je:**
- 🟢 Trade entries/exits met P&L
- 🎯 High-confidence signals (>80%)
- ⚠️ Risk alerts (drawdown, losing streaks)
- 📈 Hourly/daily performance summaries
- 🔴 Critical errors

### Enhanced Logging

De agency gebruikt Winston voor gestructureerde logs:

**Log Files:**
```
logs/
├── combined-YYYY-MM-DD.log    # Alle logs
├── error-YYYY-MM-DD.log       # Alleen errors  
├── trades-YYYY-MM-DD.log      # Trade history
├── exceptions.log             # Uncaught exceptions
└── rejections.log             # Unhandled promises
```

**Log Levels:**
- `error` - Alleen fouten
- `warn` - Waarschuwingen en errors
- `info` - Normale operaties (default)
- `debug` - Gedetailleerde debug info

**Aanpassen:**
```env
LOG_LEVEL=debug  # Voor meer detail
```

**View logs:**
```bash
# Real-time
tail -f logs/combined-*.log

# Only trades
tail -f logs/trades-*.log

# Only errors
tail -f logs/error-*.log
```

---

## 🤝 Support

Vragen? Issues? 
- Open een [GitHub Issue](https://github.com/JwP-O7O/SolanaTradeAgency/issues)
- Check de [Wiki](https://github.com/JwP-O7O/SolanaTradeAgency/wiki)

---

## 📜 License

MIT License - Doe ermee wat je wilt!

---

**Made with ❤️ by JwP**

*Happy Trading! 🚀💰*
