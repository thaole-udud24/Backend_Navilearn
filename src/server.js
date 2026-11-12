const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB } = require('./config/db');
const app = require('./app');

// Separated from app.js so tests can import app without opening a real port/DB connection.
async function start() {
  await connectDB();
  const server = app.listen(env.PORT, () => logger.info(`Server listening on port ${env.PORT}`));

  const shutdown = (signal) => () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
