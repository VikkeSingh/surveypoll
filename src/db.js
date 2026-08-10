const { MongoClient } = require('mongodb');
const config = require('./config');

const COLLECTION = 'survey_records';
const USERS = 'users';

// On Vercel each warm invocation reuses the same Node process, so the client is
// cached on globalThis to avoid opening a new connection pool per request.
const cache = globalThis.__surveypollMongo || (globalThis.__surveypollMongo = {
  promise: null,
});

function connect() {
  const client = new MongoClient(config.mongoUri, {
    // Keep the pool small: many concurrent lambdas each hold their own pool.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
  });

  return client.connect().then(async (connected) => {
    const db = connected.db(config.mongoDb);
    // Idempotent. createAt backs the default "newest first" listing; ipAddress
    // backs the duplicate-IP check on every survey hit.
    //
    // Deliberately NOT unique: existing data may already contain repeated IPs,
    // and a failing index build here would take the whole connection down.
    await db.collection(COLLECTION).createIndex({ createAt: -1 });
    await db.collection(COLLECTION).createIndex({ ipAddress: 1 });
    // Dashboard logins. Unique is safe here: the collection is created by this
    // app, so it never holds pre-existing duplicates.
    await db.collection(USERS).createIndex({ usernameLower: 1 }, { unique: true });
    return db;
  });
}

/**
 * Resolve the shared Db handle, connecting on first use.
 */
async function getDb() {
  if (!cache.promise) {
    cache.promise = connect().catch((err) => {
      // Don't cache a failed connection — the next request should retry.
      cache.promise = null;
      throw err;
    });
  }
  return cache.promise;
}

async function records() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function users() {
  const db = await getDb();
  return db.collection(USERS);
}

module.exports = { getDb, records, users, COLLECTION, USERS };
