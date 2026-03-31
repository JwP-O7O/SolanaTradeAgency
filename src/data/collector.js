const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class DataCollector {
  constructor(bus) {
    this.bus = bus;
    this.historyPath = path.join(__dirname, '../../data/historical');
    this.ensureDir();
    this.setup();
  }

  ensureDir() {
    if (!fs.existsSync(this.historyPath)) {
      fs.mkdirSync(this.historyPath, { recursive: true });
    }
  }

  setup() {
    this.bus.on('MEMECOIN_HIT', (data) => {
      this.savePricePoint(data);
    });
  }

  savePricePoint(data) {
    const filename = `${data.symbol}_${new Date().toISOString().split('T')[0]}.json`;
    const filePath = path.join(this.historyPath, filename);
    
    let history = [];
    if (fs.existsSync(filePath)) {
      try { history = JSON.parse(fs.readFileSync(filePath)); } catch(e) { history = []; }
    }

    history.push({
      timestamp: new Date().toISOString(),
      price: data.price,
      liquidity: data.liquidity,
      volume: data.volume
    });

    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    logger.info(`Data verzameld voor ${data.symbol}`);
  }
}

module.exports = DataCollector;
