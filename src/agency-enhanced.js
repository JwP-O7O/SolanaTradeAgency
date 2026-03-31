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
const { SignalBus, SIGNALS } = require('./services/signalBus');

const bus = new SignalBus();

class AutonomousAgency {
  constructor() {
    this.state = {
      portfolio: { balance: 1.0, initialBalance: 1.0, positions: [] },
      stats: { totalTrades: 0, winrate: 0, profit: 0 },
      activeSignals: []
    };

    // Initialize Components
    this.memory = new MemorySystem();
    this.notifications = new NotificationManager();
    this.optimizer = new StrategyOptimizer();
    this.collector = new DataCollector(bus);
    this.dashboard = new DashboardServer(this);

    // Initialize Agents
    this.scout = new EnhancedScoutAgent(null, this.memory, bus);
    this.sentiment = new EnhancedSentimentAgent(null, this.memory, bus);
    this.analyst = new EnhancedAnalystAgent(null, this.memory, bus);
    this.risk = new EnhancedRiskManagerAgent({ bus });
    this.execution = new EnhancedExecutionAgent(null, null, 'paper');

    this.setupBus();
  }

  setupBus() {
    // 1. Scout -> Analyst
    bus.on(SIGNALS.MEMECOIN_HIT, async (envelope) => {
      const hit = envelope.payload;
      this.dashboard.broadcast('signal', { type: 'SCOUT_HIT', symbol: hit.symbol, score: hit.totalScore });
      
      logger.info(`[AGENCY] Nieuwe memecoin gedetecteerd: ${hit.symbol}. Analyseren...`);
      const analysis = await this.analyst.analyze(hit);
      
      if (analysis && analysis.action === 'BUY' && analysis.confidence > 60) {
        bus.signal(SIGNALS.TRADE_SIGNAL, analysis, 'agency');
      }
    });

    // 2. Analyst -> Risk
    bus.on(SIGNALS.TRADE_SIGNAL, async (envelope) => {
      const signal = envelope.payload;
      logger.info(`[AGENCY] Trade signaal voor ${signal.symbol}: ${signal.action}. Risico beoordelen...`);
      
      const assessment = await this.risk.assessRisk(signal, this.state.portfolio);
      
      if (assessment.approved) {
        bus.signal(SIGNALS.TRADE_APPROVED, { signal, assessment }, 'agency');
      } else {
        bus.signal(SIGNALS.TRADE_REJECTED, { signal, reason: assessment.reason }, 'agency');
      }
    });

    // 3. Risk -> Execution
    bus.on(SIGNALS.TRADE_APPROVED, async (envelope) => {
      const { signal, assessment } = envelope.payload;
      logger.info(`[AGENCY] Trade goedgekeurd! Uitvoeren: ${signal.action} ${signal.symbol}...`);
      
      const result = await this.execution.executeTrade(signal, assessment);
      
      if (result.success) {
        bus.signal(SIGNALS.TRADE_EXECUTED, { signal, result, assessment }, 'agency');
      }
    });

    // 4. Execution -> UI
    bus.on(SIGNALS.TRADE_EXECUTED, (envelope) => {
      const trade = envelope.payload;
      this.state.stats.totalTrades++;
      
      if (trade.result.position) {
        this.state.portfolio.positions.push(trade.result.position);
        this.state.portfolio.balance = trade.result.portfolio.balance;
      }
      
      this.dashboard.broadcast('trade', trade);
      this.notifications.send(`✅ Trade uitgevoerd: ${trade.signal.action} ${trade.signal.symbol}`);
    });
  }

  async run() {
    logger.info('🚀 JwP Solana Trading Agency v2.0 Start...');
    
    await this.memory.initialize();
    await this.scout.initialize();
    await this.analyst.initialize();
    
    this.dashboard.start();
    
    logger.info('🤖 Agents zijn actief en monitoren de markt autonoom...');
  }
}

const agency = new AutonomousAgency();
agency.run().catch(err => logger.error(`FATAL ERROR: ${err.message}`));
