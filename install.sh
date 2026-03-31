#!/bin/bash

# ==================================================================
# INSTALLATION SCRIPT - JwP Trading Agency
# Automated setup voor Solana Trading Agency
# ==================================================================

echo "====================================="
echo "JwP Trading Agency - Installation"
echo "====================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js niet gevonden!"
    echo "Installeer Node.js eerst: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js versie: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm niet gevonden!"
    exit 1
fi

echo "✓ npm versie: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installeren van dependencies..."
echo ""

npm install --save \
  axios \
  dotenv \
  chalk \
  @solana/web3.js \
  fs-extra

if [ $? -ne 0 ]; then
    echo "❌ Dependency installatie mislukt!"
    exit 1
fi

echo ""
echo "✓ Dependencies succesvol geïnstalleerd!"
echo ""

# Create necessary directories
echo "📁 Aanmaken van directories..."
mkdir -p logs
mkdir -p data
mkdir -p data/backtest
mkdir -p data/memory

echo "✓ Directories aangemaakt!"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Aanmaken van .env file..."
    cat > .env << EOF
# JwP Trading Agency Configuration

# Operating Mode
MODE=paper

# Monitoring Settings
MONITORING_INTERVAL=30000

# DEX Screener Filters
MIN_LIQUIDITY=5000
MIN_VOLUME_24H=10000

# Solana RPC (optional - for live trading)
# SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Wallet (optional - for live trading)
# WALLET_PRIVATE_KEY=your_private_key_here

# Logging
LOG_LEVEL=info
EOF
    echo "✓ .env file aangemaakt!"
else
    echo "✓ .env file bestaat al"
fi

echo ""

# Create utils/logger.js if it doesn't exist
if [ ! -f src/utils/logger.js ]; then
    echo "📝 Aanmaken van logger utility..."
    mkdir -p src/utils
    cat > src/utils/logger.js << 'EOF'
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class Logger {
  constructor(prefix = 'APP') {
    this.prefix = prefix;
    this.logDir = path.join(__dirname, '../../logs');
    
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.prefix}] [${level}] ${message}`;
    
    // Console output with colors
    let coloredMessage;
    switch(level) {
      case 'ERROR':
        coloredMessage = chalk.red(logMessage);
        break;
      case 'WARN':
        coloredMessage = chalk.yellow(logMessage);
        break;
      case 'INFO':
        coloredMessage = chalk.blue(logMessage);
        break;
      default:
        coloredMessage = logMessage;
    }
    
    console.log(coloredMessage);
    if (data) {
      console.log(data);
    }
    
    // File output
    const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    const fileMessage = data ? `${logMessage} ${JSON.stringify(data)}\n` : `${logMessage}\n`;
    fs.appendFileSync(logFile, fileMessage);
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  warn(message, data) {
    this.log('WARN', message, data);
  }

  error(message, data) {
    this.log('ERROR', message, data);
  }
}

module.exports = Logger;
EOF
    echo "✓ Logger utility aangemaakt!"
else
    echo "✓ Logger utility bestaat al"
fi

echo ""
echo "====================================="
echo "✅ Installatie compleet!"
echo "====================================="
echo ""
echo "Volgende stappen:"
echo "1. Pas .env aan met jouw settings (optioneel)"
echo "2. Start de agency: ./start.sh"
echo ""
echo "Voor meer info: zie README.md"
echo ""
