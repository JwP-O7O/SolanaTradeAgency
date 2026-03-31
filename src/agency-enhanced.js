const logger = require('./utils/logger');
const DexScreenerService = require('./services/dexScreenerService');
const DataCollector = require('./data/collector');
const DashboardServer = require('./dashboard/server');
const EnhancedScoutAgent = require('./agents/scout-enhanced');
const EnhancedSentimentAgent = require('./agents/sentiment-enhanced');
const EnhancedAnalystAgent = require('./agents/analyst');
const EnhancedRiskManagerAgent = require('./agents/risk-manager-enhanced');
const EnhancedExecutionAgent = require('./agents/execution-enhanced');
const MemorySystem = require('./memory/memorySystem');
const NotificationManager = require('./notifications/notificationManager');
const StrategyOptimizer = require('./optimization/strategyOptimizer');
const signalBus = require('./services/signalBus');

class AutonomousAgency {
  constructor() {
    this.state = {
      portfolio: { balance: 10.0, positions: [] },
      stats: { totalTrades: 0, winrate: 0, profit: 0 },
      activeSignals: []
    };

    // Initialize Components
    this.memory = new MemorySystem();
    this.notifications = new NotificationManager();
    this.optimizer = new StrategyOptimizer();
    this.collector = new DataCollector(signalBus);
    this.dashboard = new DashboardServer(this);

    // Initialize Agents
    this.scout = new EnhancedScoutAgent(signalBus);
    this.sentiment = new EnhancedSentimentAgent(signalBus);
    this.analyst = new EnhancedAnalystAgent(signalBus);
    this.risk = new EnhancedRiskManagerAgent(signalBus);
    this.execution = new EnhancedExecutionAgent(signalBus);

    this.setupBus();
  }

  setupBus() {
    signalBus.on('TRADE_EXECUTED', (trade) => {
      this.state.stats.totalTrades++;
      this.dashboard.broadcast('trade', trade);
      this.notifications.send(`✅ Trade uitgevoerd: ${trade.side} ${trade.symbol}`);
    });

    signalBus.on('MEMECOIN_HIT', (hit) => {
      this.dashboard.broadcast('signal', { type: 'SCOUT_HIT', symbol: hit.symbol });
    });
  }

  async run() {
    logger.info('🚀 JwP Solana Trading Agency v2.0 Start...');
    this.dashboard.start();
    const dexService = new DexScreenerService(signalBus);
    dexService.startMonitoring(['solana', 'pump']);
    logger.info('🤖 Agents zijn actief en monitoren de markt...');
  }
}

const agency = new AutonomousAgency();
agency.run().catch(err => logger.error(`FATAL ERROR: ${err.message}`));
