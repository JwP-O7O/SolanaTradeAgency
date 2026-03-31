/**
 * Telegram Bot voor JwP Solana Trading Agency
 * Stuurt real-time notific aties over trades, signals en performance
 * 
 * Setup:
 * 1. Maak bot aan via @BotFather op Telegram
 * 2. Voeg TELEGRAM_BOT_TOKEN toe aan .env
 * 3. Voeg TELEGRAM_CHAT_ID toe aan .env (krijg je van @userinfobot)
 */

const TelegramBot = require('node-telegram-bot-api');

class TradingNotifier {
  constructor() {
    this.enabled = false;
    this.bot = null;
    this.chatId = null;
    this.init();
  }

  init() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !this.chatId) {
      console.log('[Telegram] Bot niet geconfigureerd - notifications uitgeschakeld');
      console.log('[Telegram] Voeg TELEGRAM_BOT_TOKEN en TELEGRAM_CHAT_ID toe aan .env om te activeren');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: false });
      this.enabled = true;
      console.log('[Telegram] ✅ Bot geactiveerd');
      this.sendStartupMessage();
    } catch (error) {
      console.error('[Telegram] Fout bij initialiseren:', error.message);
    }
  }

  async sendMessage(message, options = {}) {
    if (!this.enabled) return;

    try {
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        ...options
      });
    } catch (error) {
      console.error('[Telegram] Fout bij versturen:', error.message);
    }
  }

  async sendStartupMessage() {
    const msg = `
🚀 <b>JwP Trading Agency Started</b>

📅 ${new Date().toLocaleString('nl-NL')}
💼 Mode: ${process.env.MODE || 'paper'}
🔄 Monitoring: Actief

✅ Ready to trade!
    `.trim();

    await this.sendMessage(msg);
  }

  // 🎯 TRADE NOTIFICATIONS
  async notifyTradeEntry(trade) {
    const { token, strategy, entryPrice, amount, confidence } = trade;
    
    const msg = `
🟢 <b>TRADE OPENED</b>

💎 Token: <code>${token}</code>
📊 Strategy: ${strategy}
💰 Entry: $${entryPrice.toFixed(8)}
💵 Amount: $${amount.toFixed(2)}
🎯 Confidence: ${(confidence * 100).toFixed(0)}%

⏰ ${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  async notifyTradeExit(trade) {
    const { token, exitPrice, entryPrice, pnl, pnlPercent, reason } = trade;
    const isProfit = pnl > 0;
    const emoji = isProfit ? '✅' : '❌';
    const sign = isProfit ? '+' : '';

    const msg = `
${emoji} <b>TRADE CLOSED</b>

💎 Token: <code>${token}</code>
📈 Entry: $${entryPrice.toFixed(8)}
📉 Exit: $${exitPrice.toFixed(8)}
💰 P&L: ${sign}$${pnl.toFixed(2)} (${sign}${pnlPercent.toFixed(2)}%)
🔍 Reason: ${reason}

⏰ ${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  // 📊 SIGNAL NOTIFICATIONS
  async notifyHighConfidenceSignal(signal) {
    const { token, action, confidence, price, indicators } = signal;

    const msg = `
🎯 <b>HIGH CONFIDENCE SIGNAL</b>

💎 Token: <code>${token}</code>
🔔 Action: ${action.toUpperCase()}
💯 Confidence: ${(confidence * 100).toFixed(0)}%
💰 Price: $${price.toFixed(8)}

📊 Indicators:
${Object.entries(indicators).map(([k, v]) => `  • ${k}: ${v}`).join('\n')}

⏰ ${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  // ⚠️ RISK ALERTS
  async notifyRiskAlert(alert) {
    const { type, message, severity, data } = alert;
    const emoji = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : '🟢';

    const msg = `
${emoji} <b>RISK ALERT</b>

⚠️ Type: ${type}
📝 ${message}
🎚️ Severity: ${severity.toUpperCase()}

${data ? `📊 Data: ${JSON.stringify(data, null, 2)}` : ''}

⏰ ${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  // 📈 PERFORMANCE UPDATES
  async sendDailySummary(stats) {
    const {
      totalTrades,
      winRate,
      totalPnL,
      bestTrade,
      worstTrade,
      activePositions,
      portfolioValue
    } = stats;

    const pnlEmoji = totalPnL >= 0 ? '📈' : '📉';
    const sign = totalPnL >= 0 ? '+' : '';

    const msg = `
📊 <b>DAILY SUMMARY</b>

${pnlEmoji} Total P&L: ${sign}$${totalPnL.toFixed(2)}
📈 Win Rate: ${winRate.toFixed(1)}%
🔢 Total Trades: ${totalTrades}
💼 Active Positions: ${activePositions}
💰 Portfolio: $${portfolioValue.toFixed(2)}

🏆 Best Trade: +$${bestTrade.toFixed(2)}
📉 Worst Trade: -$${Math.abs(worstTrade).toFixed(2)}

📅 ${new Date().toLocaleDateString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  async sendHourlySummary(stats) {
    const { trades, pnl, signals } = stats;

    if (trades === 0 && signals === 0) return; // Skip als er niets gebeurd is

    const sign = pnl >= 0 ? '+' : '';
    const msg = `
⏰ <b>Hourly Update</b>

🔢 Trades: ${trades}
💰 P&L: ${sign}$${pnl.toFixed(2)}
📡 Signals: ${signals}

${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  // 🛑 ERROR NOTIFICATIONS
  async notifyError(error) {
    const msg = `
🔴 <b>ERROR</b>

⚠️ ${error.message}

📍 ${error.stack ? error.stack.split('\n')[1] : 'No stack trace'}

⏰ ${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }

  // 💡 INFO MESSAGES
  async notifyInfo(title, message) {
    const msg = `
💡 <b>${title}</b>

${message}

⏰ ${new Date().toLocaleTimeString('nl-NL')}
    `.trim();

    await this.sendMessage(msg);
  }
}

// Singleton instance
let notifier = null;

function getTelegramNotifier() {
  if (!notifier) {
    notifier = new TradingNotifier();
  }
  return notifier;
}

module.exports = {
  getTelegramNotifier,
  TradingNotifier
};
