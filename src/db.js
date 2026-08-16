const { MongoClient } = require('mongodb');
const config = require('./config');

const COLLECTION = 'survey_records';
const USERS = 'users';

// On Vercel each warm invocation reuses the same Node process, so the client is
// cached on globalThis to avoid opening a new connection pool per request.
const cache = globalThis.__surveypollMongo || (globalThis.__surveypollMongo = {
  promise: null,
});

/**
 * Unique index over the documents where `field` is a string, so documents that
 * predate the field are exempt.
 *
 * If the build fails — duplicates already landed, or an index with different
 * options exists from an earlier version — fall back to a plain index and carry
 * on. The pre-insert check in surveys.js still rejects duplicates; only the
 * narrow concurrent-race guarantee is lost, and that beats refusing to boot.
 */
async function uniqueWhenPresent(col, field) {
  try {
    await col.createIndex({ [field]: 1 }, {
      unique: true,
      partialFilterExpression: { [field]: { $type: 'string' } },
    });
  } catch (err) {
    console.error(
      `\n[surveypoll] Could not build the unique index on "${field}": ${err.message.split('\n')[0]}\n`
      + '  Duplicates are still rejected before insert, but two simultaneous\n'
      + `  hits sharing a ${field} could both be stored.\n`,
    );
    await col.createIndex({ [field]: 1 }).catch(() => {});
  }
}

function connect() {
  const client = new MongoClient(config.mongoUri, {
    // Keep the pool small: many concurrent lambdas each hold their own pool.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
  });

  return client.connect().then(async (connected) => {
    const db = connected.db(config.mongoDb);
    const survey = db.collection(COLLECTION);

    // Idempotent. createAt backs the default "newest first" listing.
    await survey.createIndex({ createAt: -1 });

    // Deliberately NOT unique: data written before the duplicate rules existed
    // may already contain repeated IPs and uids, and a failing index build here
    // would take the whole connection down.
    await survey.createIndex({ ipAddress: 1 });
    await survey.createIndex({ username: 1 });

    // usernameLower and fingerprint are only ever written by this version, so a
    // *partial* unique index over just the rows that carry them is safe to build
    // even on a collection full of legacy records. This is what makes the uid
    // and device rules hold when two hits race each other.
    await uniqueWhenPresent(survey, 'usernameLower');
    await uniqueWhenPresent(survey, 'fingerprint');
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
