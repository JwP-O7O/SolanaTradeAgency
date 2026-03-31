const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const logger = require('../utils/logger');

class DashboardServer {
  constructor(agency) {
    this.agency = agency;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, { cors: { origin: "*" } });
    this.port = process.env.DASHBOARD_PORT || 3000;
    this.setup();
  }

  setup() {
    this.app.use(cors());
    this.app.use(express.static(path.join(__dirname, 'public')));

    this.io.on('connection', (socket) => {
      logger.info('Dashboard client verbonden');
      socket.emit('init', {
        portfolio: this.agency.state.portfolio,
        stats: this.agency.state.stats,
        signals: this.agency.state.signals || []
      });
    });
  }

  broadcast(event, data) {
    this.io.emit(event, data);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🚀 Dashboard op http://localhost:${this.port}`);
    });
  }
}

module.exports = DashboardServer;
