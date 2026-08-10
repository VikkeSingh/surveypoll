/**
 * Every deployment setting in one place.
 *
 * The defaults below are committed so the app deploys to Vercel with no
 * environment variables configured at all. Any of them can still be overridden
 * in Vercel → Project → Settings → Environment Variables, which is the right
 * place for anything you don't want living in the repository.
 */
module.exports = {
  port: process.env.PORT || 8080,

  // MongoDB Atlas. Include the database name in the path.
  mongoUri: process.env.MONGODB_URI
    || 'mongodb+srv://dbuser:dbUserPassword@cluster0.kktk8ps.mongodb.net/surveypoll?appName=Cluster0',
  mongoDb: process.env.MONGODB_DB || undefined,

  // Seeds the first dashboard login. Once the users collection exists this is
  // ignored — accounts are managed from the Add User / Change Password pages.
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',

  // Signs the login cookie. Anyone who can read this value can forge a session,
  // so override it in Vercel if the repository is shared.
  sessionSecret: process.env.SESSION_SECRET
    || '2b5ca5039ef41058b9dea8002183edf11f5ac60e161996416ad43614bda04e55',

  // IANA zone for displayed timestamps and date-range filtering, e.g.
  // 'Asia/Kolkata'.
  displayTimezone: process.env.DISPLAY_TIMEZONE || 'UTC',

  // Pin the header the client IP is read from. The duplicate-IP rule is only as
  // trustworthy as this value; on Vercel use 'x-vercel-forwarded-for'.
  trustedIpHeader: process.env.TRUSTED_IP_HEADER || null,

  // Kept under Vercel's default function timeout, even on a cold start where a
  // slow DB handshake and a geo lookup can stack up.
  mongoServerSelectionTimeoutMs: 5000,
  geoLookupTimeoutMs: 2500,
};
