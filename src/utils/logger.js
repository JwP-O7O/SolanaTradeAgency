/**
 * Enhanced Logger voor JwP Solana Trading Agency
 * Gebruikt Winston voor structured logging met file rotation
 * 
 * Features:
 * - Multiple log levels (error, warn, info, debug)
 * - Daily rotating log files
 * - Colored console output
 * - Structured JSON logging
 * - Performance metrics tracking
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    
    return msg;
  })
);

// JSON format for files
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { service: 'solana-trade-agency' },
  transports: [
    // Error logs - separate file
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    
    // Combined logs - all levels
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    
    // Trade logs - separate for analysis
    new DailyRotateFile({
      filename: path.join(logsDir, 'trades-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
      // Only log trade-related messages
      filter: (info) => info.type === 'trade'
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log') 
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log') 
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
} else {
  // In production, still log to console but less verbose
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'warn'
  }));
}

// === CONVENIENCE METHODS ===

// Trade logging
logger.trade = (action, data) => {
  logger.info(action, { ...data, type: 'trade' });
};

// Agent logging
logger.agent = (agentName, message, data = {}) => {
  logger.info(`[${agentName}] ${message}`, { agent: agentName, ...data });
};

// Performance logging
logger.perf = (operation, duration, data = {}) => {
  logger.info(`Performance: ${operation}`, {
    type: 'performance',
    operation,
    duration,
    ...data
  });
};

// Signal logging
logger.signal = (token, action, confidence, data = {}) => {
  logger.info(`Signal: ${action} ${token}`, {
    type: 'signal',
    token,
    action,
    confidence,
    ...data
  });
};

// Risk logging
logger.risk = (message, severity, data = {}) => {
  const logLevel = severity === 'high' ? 'warn' : 'info';
  logger[logLevel](`Risk Alert: ${message}`, {
    type: 'risk',
    severity,
    ...data
  });
};

// === PERFORMANCE TRACKING ===

class PerformanceTracker {
  constructor(logger) {
    this.logger = logger;
    this.timers = new Map();
  }

  start(operation) {
    this.timers.set(operation, Date.now());
  }

  end(operation, metadata = {}) {
    const startTime = this.timers.get(operation);
    if (!startTime) {
      this.logger.warn(`Performance timer '${operation}' was never started`);
      return;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operation);

    this.logger.perf(operation, duration, metadata);
    return duration;
  }

  measure(operation, fn, ...args) {
    const startTime = Date.now();
    try {
      const result = fn(...args);
      
      // Handle promises
      if (result && typeof result.then === 'function') {
        return result.finally(() => {
          const duration = Date.now() - startTime;
          this.logger.perf(operation, duration);
        });
      }
      
      const duration = Date.now() - startTime;
      this.logger.perf(operation, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.perf(operation, duration, { error: error.message });
      throw error;
    }
  }
}

logger.perf = new PerformanceTracker(logger);

// === ERROR HELPERS ===

logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    stack: error.stack,
    name: error.name,
    ...context
  });
};

// === STARTUP MESSAGE ===

logger.info('='.repeat(60));
logger.info('JwP Solana Trading Agency - Logger Initialized');
logger.info(`Log Level: ${logger.level}`);
logger.info(`Log Directory: ${logsDir}`);
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info('='.repeat(60));

module.exports = logger;
