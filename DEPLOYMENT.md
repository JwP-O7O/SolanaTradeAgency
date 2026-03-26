# Solana Trade Agency - Deployment Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  SOLANA TRADE AGENCY v3.0                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Scout Agent  │  │ Analyst      │  │ Sentiment    │       │
│  │ (Monitoring) │  │ (Technical)  │  │ (Sentiment)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                   │
│                    ┌──────▼──────┐                           │
│                    │ Risk Manager │                          │
│                    │ (Approval)   │                          │
│                    └──────┬──────┘                           │
│                           │                                   │
│                    ┌──────▼──────┐                           │
│                    │  Execution  │                           │
│                    │  (Trading)   │                          │
│                    └──────┬──────┘                           │
│                           │                                   │
│         ┌─────────────────┼─────────────────┐               │
│         │                 │                 │               │
│    ┌────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐         │
│    │ Database  │    │  Memory   │    │  Connector│         │
│    │ (MySQL)   │    │  (Local)  │    │ (WebSocket)         │
│    └───────────┘    └───────────┘    └──────┬────┘         │
│                                              │               │
│                                       ┌──────▼──────┐       │
│                                       │  Dashboard  │       │
│                                       │  (React)    │       │
│                                       └─────────────┘       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Solana CLI (for live trading)
- MySQL 8.0+ (for production)

### Step 1: Clone Repository
```bash
git clone https://github.com/yourusername/SolanaTradeAgency.git
cd SolanaTradeAgency
```

### Step 2: Install Dependencies
```bash
npm install
# or
yarn install
```

### Step 3: Environment Configuration
Create `.env` file:
```env
# Trading Mode
MODE=paper                          # backtest, paper, or live
INITIAL_CAPITAL=1000                # Starting capital in USD

# Solana RPC
SOLANA_RPC=https://api.mainnet-beta.solana.com

# Dashboard Connection
DASHBOARD_URL=http://localhost:3000

# Cycle Configuration
CYCLE_INTERVAL_MS=5000              # How often to run trading cycle

# Database (optional, for production)
DATABASE_URL=mysql://user:pass@localhost:3306/trading_agency

# Live Trading (only if MODE=live)
WALLET_PATH=./config/wallet.json
```

### Step 4: Run the Agency

**Paper Trading (Recommended for testing)**:
```bash
npm start
```

**Backtest Mode**:
```bash
MODE=backtest npm start
```

**Live Trading** (⚠️ Use with caution):
```bash
MODE=live npm start
```

## Dashboard Integration

### Start Dashboard
```bash
cd ../solana-trade-agency-dashboard
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Real-Time Data Flow
1. Agency emits events via WebSocket
2. Dashboard receives and displays updates
3. User can view:
   - Live trading signals
   - Agent status
   - Portfolio performance
   - Trade history
   - Market opportunities

## Configuration

### Agent Parameters

**Scout Agent** (`src/agents/scout-enhanced.js`):
```javascript
config: {
  minVolume: 50000,              // Minimum 1h volume
  minLiquidity: 10000,           // Minimum USD liquidity
  opportunityThreshold: 30,      // Minimum opportunity score
  socialMediaWeight: 0.3,        // Weight for social metrics
  technicalWeight: 0.4,          // Weight for technical metrics
  onChainWeight: 0.3,            // Weight for on-chain metrics
}
```

**Analyst Agent** (`src/agents/analyst.js`):
```javascript
config: {
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
}
```

**Risk Manager** (`src/agents/risk-manager-enhanced.js`):
```javascript
config: {
  maxPositionSizePct: 0.02,       // 2% per trade
  maxConcurrentPositions: 5,      // Max open positions
  dailyLossLimitPct: 0.05,        // 5% daily loss limit
  maxDrawdownPct: 0.10,           // 10% max drawdown
  defaultStopLossPct: 0.01,       // 1% default stop loss
  defaultTakeProfitPct: 0.015,    // 1.5% default take profit
  riskRewardRatio: 1.5,           // Min risk/reward
}
```

**Execution Agent** (`src/agents/execution-enhanced.js`):
```javascript
config: {
  slippageTolerance: 0.01,        // 1% slippage
  maxRetries: 3,                  // Retry attempts
  retryDelayMs: 1000,             // Delay between retries
  confirmationTimeout: 30000,     // 30s confirmation timeout
  microTradeThreshold: 100,       // Micro-trade threshold
}
```

## Monitoring

### Logs
Check logs in `logs/` directory:
- `agency.log` - Main agency logs
- `agents.log` - Agent-specific logs
- `trades.log` - Trade execution logs

### Dashboard Monitoring
1. Open `http://localhost:3000`
2. View real-time:
   - Agent status (Scout, Analyst, Sentiment, Risk Manager, Execution)
   - Trading signals with confidence scores
   - Open positions and trade history
   - Portfolio performance metrics
   - Daily P&L and win rate

### Health Checks
```bash
# Check if agency is running
curl http://localhost:3000/api/health

# Get agent status
curl http://localhost:3000/api/agents/status

# Get portfolio state
curl http://localhost:3000/api/portfolio/latest
```

## Troubleshooting

### Agency Won't Start
1. Check Node.js version: `node --version` (should be 18+)
2. Verify dependencies: `npm install`
3. Check `.env` file configuration
4. Review logs for errors

### No Trading Signals
1. Check Scout agent is finding opportunities
2. Verify Sentiment agent sentiment score > 0.3
3. Check Analyst agent technical indicators
4. Review Risk Manager approval reasons

### Dashboard Not Receiving Updates
1. Verify WebSocket connection: Check browser console
2. Confirm agency is running: `ps aux | grep node`
3. Check firewall: Port 3000 should be open
4. Review browser console for errors

### Trades Not Executing
1. Check Risk Manager approval (daily loss limit, drawdown)
2. Verify position size calculation
3. Check Execution agent mode (paper/live)
4. Review transaction logs for errors

## Performance Optimization

### Database Optimization
```sql
-- Add indexes for faster queries
CREATE INDEX idx_token ON trading_signals(token);
CREATE INDEX idx_timestamp ON trading_signals(timestamp);
CREATE INDEX idx_status ON executed_trades(status);
```

### Memory Management
- Sentiment cache expires after 5 minutes
- Price history limited to last 100 candles
- Old trades archived to separate table

### Network Optimization
- WebSocket compression enabled
- Event batching for multiple signals
- Connection pooling for database

## Deployment to Production

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t solana-trade-agency .
docker run -e MODE=paper -p 3000:3000 solana-trade-agency
```

### Cloud Deployment (AWS EC2)
1. Launch EC2 instance (t3.medium or larger)
2. Install Node.js and dependencies
3. Clone repository
4. Configure environment variables
5. Set up PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start src/agency-enhanced.js --name "trading-agency"
   pm2 startup
   pm2 save
   ```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: solana-trade-agency
spec:
  replicas: 1
  selector:
    matchLabels:
      app: trading-agency
  template:
    metadata:
      labels:
        app: trading-agency
    spec:
      containers:
      - name: agency
        image: solana-trade-agency:latest
        env:
        - name: MODE
          value: "paper"
        - name: DASHBOARD_URL
          value: "http://dashboard:3000"
        ports:
        - containerPort: 3000
```

## Security Considerations

### Private Key Management
- Store wallet keys in secure vault (AWS Secrets Manager, HashiCorp Vault)
- Never commit `.env` or wallet files to git
- Use separate keys for paper/live trading
- Rotate keys regularly

### API Security
- Use HTTPS/WSS for all connections
- Implement rate limiting
- Add authentication to dashboard
- Monitor for suspicious activity

### Risk Management
- Start with small position sizes
- Use paper trading to validate strategy
- Monitor daily loss limits
- Implement circuit breakers

## Monitoring & Alerts

### Set Up Alerts
1. Email notifications for large wins/losses
2. Slack integration for agent errors
3. PagerDuty for critical failures
4. Custom webhooks for custom logic

### Metrics to Track
- Win rate (target: >55%)
- Sharpe ratio (target: >1.0)
- Max drawdown (limit: 10%)
- Daily P&L (track trends)
- Agent success rates

## Support & Resources

- **Documentation**: See `AGENCY_ARCHITECTURE.md`
- **Integration Guide**: See `INTEGRATION.md`
- **Dashboard Docs**: See `solana-trade-agency-dashboard/README.md`
- **Issues**: Report on GitHub
- **Discussions**: Join Discord community

## License

MIT License - See LICENSE file for details
