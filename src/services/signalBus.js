// ============================================================
// SIGNAL BUS
// Central event hub between Scout → Analyst → Risk → Execution
// Usage:  bus.emit('SIGNAL', payload)
//         bus.on('SIGNAL', handler)
// ============================================================

const EventEmitter = require('events');

// Signal types
const SIGNALS = {
  // Scout → Analyst
  MEMECOIN_HIT:   'MEMECOIN_HIT',    // Scout found a hot token
  WATCHLIST_ADD:  'WATCHLIST_ADD',   // Token added to watchlist

  // Analyst → Risk
  TRADE_SIGNAL:   'TRADE_SIGNAL',    // BUY/SELL with confidence

  // Risk → Execution
  TRADE_APPROVED: 'TRADE_APPROVED',  // Approved with size/sl/tp
  TRADE_REJECTED: 'TRADE_REJECTED',  // Rejected with reason

  // Execution → All
  TRADE_EXECUTED: 'TRADE_EXECUTED',  // Trade filled
  TRADE_CLOSED:   'TRADE_CLOSED',    // Position closed

  // General
  ALERT:          'ALERT',           // Informational alert
};

class SignalBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.history = [];       // Last 500 signals
    this.MAX_HISTORY = 500;
  }

  /**
   * Emit a typed signal with a standard envelope.
   * @param {string} type   - One of SIGNALS.*
   * @param {object} payload
   * @param {string} source - Agent name emitting the signal
   */
  signal(type, payload, source = 'unknown') {
    const envelope = {
      id:        `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      source,
      payload,
      timestamp: Date.now(),
      datetime:  new Date().toISOString(),
    };

    // Store history
    this.history.unshift(envelope);
    if (this.history.length > this.MAX_HISTORY) this.history.pop();

    // Emit both specific type and generic 'SIGNAL' for catch-all listeners
    this.emit(type, envelope);
    this.emit('SIGNAL', envelope);

    return envelope;
  }

  /** Get recent signals, optionally filtered by type */
  getHistory(type = null, limit = 50) {
    const list = type ? this.history.filter(s => s.type === type) : this.history;
    return list.slice(0, limit);
  }
}

module.exports = { SignalBus, SIGNALS };
