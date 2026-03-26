// ============================================================
// AGENT CONNECTOR SERVICE
// Connects trading agency to dashboard via WebSocket
// ============================================================

const io = require('socket.io-client');
const Logger = require('../utils/logger');

class AgentConnectorService {
  constructor(dashboardUrl = 'http://localhost:3000') {
    this.dashboardUrl = dashboardUrl;
    this.logger = Logger.create('AGENT-CONNECTOR');
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.dashboardUrl, {
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 10000,
          reconnectionAttempts: this.maxReconnectAttempts,
          transports: ['websocket', 'polling'],
        });

        this.socket.on('connect', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.logger.info(`Connected to dashboard at ${this.dashboardUrl}`);
          resolve();
        });

        this.socket.on('disconnect', () => {
          this.isConnected = false;
          this.logger.warn('Disconnected from dashboard');
        });

        this.socket.on('error', (error) => {
          this.logger.error('Socket error:', error);
        });

        this.socket.on('connect_error', (error) => {
          this.reconnectAttempts++;
          this.logger.warn(`Connection error (attempt ${this.reconnectAttempts}):`, error.message);
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(error);
          }
        });

      } catch (error) {
        this.logger.error('Connection setup error:', error.message);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      this.logger.info('Disconnected from dashboard');
    }
  }

  // ============ SIGNAL EVENTS ============
  emitSignal(signal) {
    if (!this.isConnected) {
      this.logger.warn('Not connected to dashboard, buffering signal');
      return false;
    }

    this.socket.emit('signal:new', {
      type: 'signal',
      data: {
        token: signal.token,
        symbol: signal.symbol,
        action: signal.action,
        confidence: signal.confidence,
        price: signal.price,
        rsi: signal.indicators?.rsi,
        macd: signal.indicators?.macd,
        bollingerBands: signal.indicators?.bb,
        sma10: signal.indicators?.sma10,
        sma20: signal.indicators?.sma20,
        reasons: signal.reasons,
        strategy: signal.strategy,
      },
      timestamp: Date.now(),
    });

    return true;
  }

  // ============ TRADE EVENTS ============
  emitTradeExecuted(trade) {
    if (!this.isConnected) return false;

    this.socket.emit('trade:executed', {
      type: 'trade',
      data: {
        tradeId: trade.tradeId,
        token: trade.token,
        symbol: trade.symbol,
        action: trade.action,
        entryPrice: trade.price,
        positionSize: trade.positionSize,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        status: 'OPEN',
      },
      timestamp: Date.now(),
    });

    return true;
  }

  emitTradeClosed(trade, exitPrice, exitReason, pnlPct) {
    if (!this.isConnected) return false;

    this.socket.emit('trade:closed', {
      type: 'trade',
      data: {
        tradeId: trade.tradeId || trade.id,
        token: trade.token,
        symbol: trade.symbol,
        action: trade.action,
        entryPrice: trade.entryPrice,
        exitPrice,
        positionSize: trade.positionSize,
        pnlPct,
        exitReason,
        status: 'CLOSED',
      },
      timestamp: Date.now(),
    });

    return true;
  }

  // ============ PORTFOLIO EVENTS ============
  emitPortfolioUpdate(portfolio, performance) {
    if (!this.isConnected) return false;

    this.socket.emit('portfolio:update', {
      type: 'portfolio',
      data: {
        initialCapital: portfolio.initialCapital,
        currentCapital: portfolio.currentCapital,
        totalPnL: portfolio.totalPnL,
        dailyPnL: portfolio.dailyPnL,
        openPositionsCount: portfolio.openPositions?.length || 0,
        closedTradesCount: portfolio.closedTrades?.length || 0,
        winRate: performance.winRate,
        avgWin: performance.avgWin,
        avgLoss: performance.avgLoss,
        sharpeRatio: performance.sharpeRatio,
        maxDrawdown: performance.maxDrawdown,
        profitFactor: performance.profitFactor,
      },
      timestamp: Date.now(),
    });

    return true;
  }

  // ============ AGENT STATUS EVENTS ============
  emitAgentStatus(agentName, status, metadata = {}) {
    if (!this.isConnected) return false;

    this.socket.emit('agent:status', {
      type: 'agent',
      data: {
        agentName,
        status,
        ...metadata,
      },
      timestamp: Date.now(),
    });

    return true;
  }

  emitScoutStatus(agent) {
    return this.emitAgentStatus('scout', agent.status, {
      scanCount: agent.scanCount,
      watchlistSize: agent.watchlist?.length || 0,
      lastOpportunities: agent.opportunities?.length || 0,
    });
  }

  emitAnalystStatus(agent) {
    return this.emitAgentStatus('analyst', agent.status);
  }

  emitSentimentStatus(agent) {
    return this.emitAgentStatus('sentiment', agent.status, {
      analysisCount: agent.analysisCount,
      cacheSize: agent.sentimentCache?.size || 0,
    });
  }

  emitRiskManagerStatus(agent) {
    return this.emitAgentStatus('riskManager', agent.status, {
      evaluationCount: agent.evaluationCount,
      dailyLosses: agent.dailyLosses,
    });
  }

  emitExecutionStatus(agent) {
    return this.emitAgentStatus('execution', agent.status, {
      executionCount: agent.executionCount,
      failureCount: agent.failureCount,
      mode: agent.mode,
    });
  }

  // ============ OPPORTUNITY EVENTS ============
  emitOpportunities(opportunities) {
    if (!this.isConnected) return false;

    this.socket.emit('opportunities:update', {
      type: 'opportunities',
      data: opportunities.slice(0, 20), // Top 20 opportunities
      timestamp: Date.now(),
    });

    return true;
  }

  // ============ ERROR EVENTS ============
  emitError(agentName, errorMessage, severity = 'warning') {
    if (!this.isConnected) return false;

    this.socket.emit('error:reported', {
      type: 'error',
      data: {
        agentName,
        message: errorMessage,
        severity, // 'info', 'warning', 'error', 'critical'
      },
      timestamp: Date.now(),
    });

    return true;
  }

  // ============ NOTIFICATION EVENTS ============
  emitNotification(title, content, type = 'info') {
    if (!this.isConnected) return false;

    this.socket.emit('notification:send', {
      type: 'notification',
      data: {
        title,
        content,
        notificationType: type, // 'info', 'success', 'warning', 'error'
      },
      timestamp: Date.now(),
    });

    return true;
  }

  // ============ LISTENERS ============
  onConfigurationUpdate(callback) {
    if (this.socket) {
      this.socket.on('config:update', callback);
    }
  }

  onStrategyChange(callback) {
    if (this.socket) {
      this.socket.on('strategy:change', callback);
    }
  }

  onAgentCommand(callback) {
    if (this.socket) {
      this.socket.on('agent:command', callback);
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      dashboardUrl: this.dashboardUrl,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id || null,
    };
  }
}

module.exports = AgentConnectorService;
