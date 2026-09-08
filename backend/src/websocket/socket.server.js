const { Server } = require('socket.io');
const logger = require('../config/logger');

let ioInstance = null;

function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected [${socket.id}]`);

    socket.on('error', (err) => {
      if (['ECONNABORTED', 'ECONNRESET', 'EPIPE'].includes(err.code)) {
        logger.warn(`WebSocket client connection reset [${socket.id}]: ${err.message}`);
      } else {
        logger.error(`WebSocket error on client [${socket.id}]:`, { error: err.message });
      }
    });

    if (socket.conn) {
      socket.conn.on('error', (err) => {
        logger.warn(`WebSocket engine transport error [${socket.id}]: ${err.message}`);
      });
    }

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected [${socket.id}], reason: ${reason}`);
    });
  });

  io.engine.on('connection_error', (err) => {
    logger.warn('Socket.IO connection engine error:', { code: err.code, message: err.message });
  });

  ioInstance = io;
  return io;
}

function broadcastEvent(eventName, payload) {
  if (ioInstance) {
    ioInstance.emit(eventName, {
      timestamp: new Date().toISOString(),
      ...payload
    });
    logger.debug(`[Socket.IO Event Broadcasted] -> ${eventName}`, payload);
  }
}

module.exports = { initSocketServer, broadcastEvent };
