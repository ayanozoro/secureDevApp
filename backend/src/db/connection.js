/**
 * MongoDB Connection Manager (Mongoose)
 */

const mongoose = require('mongoose');

let connected = false;
let lastError = null;
let dbName = process.env.MONGODB_DB_NAME || 'securedevops';

function getMongoUri() {
  return (process.env.MONGODB_URI || process.env.mongodb_uri || '').trim();
}

async function connectDB() {
  const uri = getMongoUri();
  if (!uri) {
    lastError = 'mongodb_uri is not configured in .env';
    console.warn('[MongoDB] No mongodb_uri configured in .env — running in in-memory mode.');
    return false;
  }

  try {
    mongoose.set('strictQuery', false);

    mongoose.connection.on('connected', () => {
      connected = true;
      lastError = null;
      console.log(`[MongoDB] Connected successfully to database "${dbName}"`);
    });

    mongoose.connection.on('disconnected', () => {
      connected = false;
      console.warn('[MongoDB] Disconnected from database');
    });

    mongoose.connection.on('error', (err) => {
      connected = false;
      lastError = err.message;
      console.error('[MongoDB] Connection error:', err.message);
    });

    await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    });

    connected = mongoose.connection.readyState === 1;
    return connected;
  } catch (err) {
    connected = false;
    lastError = err.message;
    console.error('[MongoDB] Failed to connect:', err.message);
    return false;
  }
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function getDbStatus() {
  return {
    configured: Boolean(getMongoUri()),
    connected: isDbConnected(),
    dbName,
    error: isDbConnected() ? null : lastError,
  };
}

module.exports = {
  connectDB,
  isDbConnected,
  getDbStatus,
};
