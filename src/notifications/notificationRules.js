/**
 * Notification Rules voor JwP Solana Trading Agency
 * Definieert wanneer notificaties verstuurd worden
 */

const { getTelegramNotifier } = require('./telegramBot');

class NotificationManager {
  constructor() {
    this.notifier = getTelegramNotifier();
    this.stats = {
      hourly: { trades: 0, pnl: 0, signals: 0 },
      daily: {
        totalTrades: 0,
        winningTrades: 0,
        totalPnL: 0,
        bestTrade: 0,
        worstTrade: 0,
        activePositions: 0,
        portfolioValue: 1 // SOL
      }
    };

    this.lastHourlyUpdate = Date.now();
    this.lastDailyUpdate = Date.now();

    // Start schedulers
    this.startSchedulers();
  }

  startSchedulers() {
    // Hourly summary elk uur
    setInterval(() => {
      this.sendHourlyUpdate();
    }, 60 * 60 * 1000); // 1 uur

    // Daily summary om 00:00
    this.scheduleDailyUpdate();
  }

  scheduleDailyUpdate() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow - now;

    setTimeout(() => {
      this.sendDailyUpdate();
      // Schedule next day
      setInterval(() => {
        this.sendDailyUpdate();
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  // === TRADE NOTIFICATIONS ===
  
  onTradeEntry(trade) {
    // Altijd notificeren bij trade entry
    this.notifier.notifyTradeEntry(trade);

    // Update stats
    this.stats.hourly.trades++;
    this.stats.daily.totalTrades++;
    this.stats.daily.activePositions++;
  }

  onTradeExit(trade) {
    const { pnl, pnlPercent } = trade;

    // Altijd notificeren bij trade exit
    this.notifier.notifyTradeExit(trade);

    // Update stats
    this.stats.hourly.pnl += pnl;
    this.stats.daily.totalPnL += pnl;
    this.stats.daily.activePositions--;

    if (pnl > 0) {
      this.stats.daily.winningTrades++;
    }

    // Track best/worst
    if (pnl > this.stats.daily.bestTrade) {
      this.stats.daily.bestTrade = pnl;
    }
    if (pnl < this.stats.daily.worstTrade) {
      this.stats.daily.worstTrade = pnl;
    }

    this.stats.daily.portfolioValue += pnl;

    // Extra notificatie bij grote winst/verlies
    if (Math.abs(pnlPercent) > 10) {
      const emoji = pnl > 0 ? '🚀' : '⚠️';
      const message = pnl > 0
        ? `Grote winst op ${trade.token}: +${pnlPercent.toFixed(1)}%!`
        : `Groot verlies op ${trade.token}: ${pnlPercent.toFixed(1)}%`;
      
      this.notifier.notifyInfo(emoji + ' Significant Trade', message);
    }
  }

  // === SIGNAL NOTIFICATIONS ===
  
  onSignal(signal) {
    this.stats.hourly.signals++;

    // Alleen notificeren bij high confidence (>80%)
    if (signal.confidence > 0.80) {
      this.notifier.notifyHighConfidenceSignal(signal);
    }
  }

  // === RISK ALERTS ===
  
  onRiskAlert(alert) {
    // Altijd notificeren bij risk alerts
    this.notifier.notifyRiskAlert(alert);
  }

  checkPortfolioRisk(portfolioValue, maxDrawdown) {
    const drawdownPercent = (maxDrawdown / portfolioValue) * 100;

    if (drawdownPercent > 20) {
      this.onRiskAlert({
        type: 'Portfolio Drawdown',
        message: `Portfolio heeft ${drawdownPercent.toFixed(1)}% drawdown!`,
        severity: 'high',
        data: { portfolioValue, maxDrawdown }
      });
    } else if (drawdownPercent > 10) {
      this.onRiskAlert({
        type: 'Portfolio Drawdown',
        message: `Portfolio heeft ${drawdownPercent.toFixed(1)}% drawdown`,
        severity: 'medium',
        data: { portfolioValue, maxDrawdown }
      });
    }
  }

  checkConsecutiveLosses(lossStreak) {
    if (lossStreak >= 5) {
      this.onRiskAlert({
        type: 'Losing Streak',
        message: `${lossStreak} verliestrades op rij - overweeg pauze`,
        severity: 'high',
        data: { lossStreak }
      });
    } else if (lossStreak >= 3) {
      this.onRiskAlert({
        type: 'Losing Streak',
        message: `${lossStreak} verliestrades op rij`,
        severity: 'medium',
        data: { lossStreak }
      });
    }
  }

  // === ERROR HANDLING ===
  
  onError(error) {
    // Alleen notificeren bij kritische errors
    if (this.isCriticalError(error)) {
      this.notifier.notifyError(error);
    }
  }

  isCriticalError(error) {
    const criticalPatterns = [
      /network/i,
      /timeout/i,
      /api/i,
      /wallet/i,
      /insufficient/i,
      /transaction failed/i
    ];

    return criticalPatterns.some(pattern => 
      pattern.test(error.message)
    );
  }

  // === SUMMARY UPDATES ===
  
  async sendHourlyUpdate() {
    await this.notifier.sendHourlySummary(this.stats.hourly);

    // Reset hourly stats
    this.stats.hourly = { trades: 0, pnl: 0, signals: 0 };
  }

  async sendDailyUpdate() {
    const winRate = this.stats.daily.totalTrades > 0
      ? (this.stats.daily.winningTrades / this.stats.daily.totalTrades) * 100
      : 0;

    await this.notifier.sendDailySummary({
      ...this.stats.daily,
      winRate
    });

    // Reset daily stats (behoud portfolio value)
    const currentPortfolio = this.stats.daily.portfolioValue;
    this.stats.daily = {
      totalTrades: 0,
      winningTrades: 0,
      totalPnL: 0,
      bestTrade: 0,
      worstTrade: 0,
      activePositions: this.stats.daily.activePositions,
      portfolioValue: currentPortfolio
    };
  }

  // === MANUAL TRIGGERS ===
  
  async sendCustomNotification(title, message) {
    await this.notifier.notifyInfo(title, message);
  }

  async sendPerformanceUpdate() {
    const winRate = this.stats.daily.totalTrades > 0
      ? (this.stats.daily.winningTrades / this.stats.daily.totalTrades) * 100
      : 0;

    await this.notifier.sendDailySummary({
      ...this.stats.daily,
      winRate
    });
  }

  // === GETTERS ===
  
  getStats() {
    return {
      hourly: { ...this.stats.hourly },
      daily: { ...this.stats.daily }
    };
  }

  updatePortfolioValue(value) {
    this.stats.daily.portfolioValue = value;
  }
}

// Singleton instance
let manager = null;

function getNotificationManager() {
  if (!manager) {
    manager = new NotificationManager();
  }
  return manager;
}

module.exports = {
  getNotificationManager,
  NotificationManager
};
