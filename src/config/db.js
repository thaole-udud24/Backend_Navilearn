const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

// Fix for Node.js on Windows: local ISP/router DNS often refuses SRV queries used by mongodb+srv://
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch {
  // Ignore if setting DNS servers is not allowed in this environment
}

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB connected');
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
