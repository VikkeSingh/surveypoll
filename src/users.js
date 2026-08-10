const crypto = require('crypto');
const { promisify } = require('util');
const { users } = require('./db');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);

const KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const MIN_PASSWORD = 8;

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, KEYLEN, SCRYPT_OPTS);
  return { salt, hash: derived.toString('hex') };
}

async function verifyPassword(password, user) {
  if (!user || !user.salt || !user.hash) {
    return false;
  }
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Identifies a session against the current password. Embedding it in the cookie
 * means changing a password invalidates that user's other sessions.
 */
function sessionToken(user) {
  return crypto.createHash('sha256').update(user.hash).digest('hex').slice(0, 16);
}

/**
 * First run has no users, so seed one from ADMIN_USERNAME / ADMIN_PASSWORD —
 * the same credentials the app used before users were stored in the database.
 */
async function ensureSeeded() {
  const col = await users();
  if (await col.countDocuments({}, { limit: 1 })) {
    return;
  }
  const username = config.adminUsername;
  const { salt, hash } = await hashPassword(config.adminPassword);
  await col.insertOne({
    username,
    usernameLower: username.toLowerCase(),
    salt,
    hash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`[surveypoll] seeded initial user "${username}" from environment`);
}

async function findByUsername(username) {
  const col = await users();
  return col.findOne({ usernameLower: String(username || '').toLowerCase() });
}

async function authenticate(username, password) {
  await ensureSeeded();
  const user = await findByUsername(username);
  if (!user) {
    // Spend the same work as a real check so timing doesn't reveal valid names.
    await hashPassword(String(password || ''), 'decoy');
    return null;
  }
  return (await verifyPassword(String(password || ''), user)) ? user : null;
}

async function listUsers() {
  const col = await users();
  return col.find({}, { projection: { salt: 0, hash: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
}

function validate(username, password, confirm) {
  if (!USERNAME_RE.test(String(username || ''))) {
    return 'Username must be 3–32 characters, letters/digits/dot/underscore/hyphen only.';
  }
  if (String(password || '').length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters.`;
  }
  if (password !== confirm) {
    return 'Passwords do not match.';
  }
  return null;
}

/** Returns an error string, or null on success. */
async function createUser(username, password, confirm) {
  const invalid = validate(username, password, confirm);
  if (invalid) {
    return invalid;
  }
  if (await findByUsername(username)) {
    return `User "${username}" already exists.`;
  }
  const { salt, hash } = await hashPassword(password);
  const col = await users();
  try {
    await col.insertOne({
      username,
      usernameLower: username.toLowerCase(),
      salt,
      hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      return `User "${username}" already exists.`; // lost the race on the unique index
    }
    throw err;
  }
  return null;
}

/** Returns { error } or { user } with the updated record. */
async function changePassword(username, current, next, confirm) {
  const user = await findByUsername(username);
  if (!user || !(await verifyPassword(String(current || ''), user))) {
    return { error: 'Current password is incorrect.' };
  }
  if (String(next || '').length < MIN_PASSWORD) {
    return { error: `New password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (next !== confirm) {
    return { error: 'New passwords do not match.' };
  }
  if (await verifyPassword(String(next), user)) {
    return { error: 'New password must be different from the current one.' };
  }
  const { salt, hash } = await hashPassword(next);
  const col = await users();
  await col.updateOne({ _id: user._id }, { $set: { salt, hash, updatedAt: new Date() } });
  return { user: { ...user, salt, hash } };
}

module.exports = {
  authenticate,
  ensureSeeded,
  findByUsername,
  listUsers,
  createUser,
  changePassword,
  sessionToken,
  MIN_PASSWORD,
};
