# Surveypoll

A minimal Node.js/Express service that records survey outcomes and shows them on
a single dashboard page. Data is stored in MongoDB. Each incoming call also
captures the caller's **IP address** and resolves the **country** (via the free
`ip-api.com` service).

Deploys to **Vercel** as a single serverless function.

## The four endpoints

All four take `uid` (username) and `pid` (project id) as query params, store one
record with the matching status, and render a **thank-you page** for the
respondent showing UID, PID, status, IP address and device ID:

| Endpoint | Stored status |
|---|---|
| `GET /survey/complete?uid=xxx&pid=xxx` | `completed` |
| `GET /survey/terminate?uid=xxx&pid=xxx` | `terminated` |
| `GET /quotafull?uid=xxx&pid=xxx` | `quotafull` |
| `GET /security-terminate?uid=xxx&pid=xxx` | `security-terminate` |

These stay public so vendor redirects keep working. Everything else requires
login. A bad link (missing `uid`/`pid`) or a database outage renders a plain
notice page rather than a JSON error, since a respondent's browser lands here.

> **These are browser endpoints, not a server-to-server API.** Each one renders
> a short interstitial page that measures the device before the record is
> written (see below), so a bare HTTP client that doesn't run JavaScript will
> never store anything. Panels must redirect a real browser here.

### Duplicate rules

Three rules, checked in this order, each scoped **globally and permanently** —
the first hit to arrive claims the value, across every project and for good. A
match renders a 409 page naming the rule and **stores nothing**; there is no
record of the blocked attempt.

| Rule | Page shown | Notes |
|---|---|---|
| `uid` | Duplicate Response | One respondent ID, once. `pid` is ignored — the same uid on a different project is still a duplicate. Matched case-insensitively. |
| `fingerprint` | Duplicate Device | One device, once. Catches a respondent returning under a fresh uid. |
| `ipAddress` | Duplicate IP Address | One address, once. Checked last so a more precise rule names the reason when one applies. |

`uid` is the strongest of the three and needs nothing from the browser — the
panel hands us the ID in the link. The other two are backstops for a respondent
who comes back under a new ID.

**Two-step exchange.** A device fingerprint can only be measured by the browser,
and none of it exists when the redirect lands. So each endpoint is:

1. `GET /survey/...` — check `uid` and `ipAddress`. If either is already seen,
   reject immediately, with no JavaScript involved. Otherwise render
   `views/collect.ejs`, carrying an HMAC-signed token of what to write.
2. `POST /survey/commit` — verify the token, re-check all three rules including
   the fingerprint, insert, render the thank-you page.

The write only ever happens in step 2, so a respondent who bounces off the
collect page is never recorded and can retry the same link. What gets written
comes only from the signed token, never from the posted fields — otherwise the
endpoint would let anyone record an arbitrary uid/pid/status. The token is
signed with `SESSION_SECRET` and expires after 10 minutes.

**About the fingerprint** (`public/fingerprint.js`, dependency-free ES5, no
build step). It hashes canvas and WebGL rendering output, installed fonts,
screen geometry, timezone and hardware hints into 32 hex characters. Nothing is
stored on the client, so clearing cookies or changing network does not reset it
— which is the point, since an IP address changes and this mostly doesn't.

It is **not** a reliable unique ID, and shouldn't be treated as proof:

- **Collisions.** Two people on the same phone model, OS and browser build
  produce the *same* ID. In a panel where many respondents are on identical
  handsets, this rule will reject some legitimate ones.
- **Drift.** A browser or OS update can change the hash, and Brave/Safari
  randomize canvas output deliberately, so the same device can look new.
- **Absent.** If JavaScript is off, or the page hits its 3-second deadline
  first, the row stores `null` and only the uid and IP rules apply. Blank
  fingerprints never collide with each other.

**The IP rule is the weak one.** Offices, universities and mobile carriers
(CGNAT) put many users behind one address, so the first respondent through such
a network locks out everyone else behind it, for every project, forever — and it
fires even when the uid and device are both fresh. Now that `uid` dedupes
exactly, consider scoping this rule to a time window or dropping it to
flag-only. Its accuracy also depends on the header being trustworthy:
`src/geoip.js` reads `x-vercel-forwarded-for`, then `x-real-ip`, then
`x-forwarded-for`. The first two are written by Vercel and cannot be set by the
caller; `x-forwarded-for` *can* be, so it is only the fallback for local/other
hosting. Set `TRUSTED_IP_HEADER` to pin one header and ignore the rest.

**Concurrency.** Each rule is a lookup before the insert, so two simultaneous
hits could both pass the lookup. `src/db.js` closes that for `uid` and
`fingerprint` with *partial* unique indexes covering only the rows that carry
`usernameLower`/`fingerprint` — fields this version alone writes, so the index
builds cleanly over a collection full of older records. The loser of a race gets
the same 409 page. If the index can't be built the app logs it and keeps
running on the lookup alone. `ipAddress` keeps its plain non-unique index, since
the collection may already hold repeats.

## Dashboard

Open **/** — the single HTML page, behind a login. It supports filtering by
Project ID, Status, Start/End date, and UID, plus a CSV **REPORT** export.

Dashboard data APIs (used by the page, login required):
- `GET /api/records` — filtered JSON list
- `GET /api/records/report` — filtered CSV download

## Layout

```
api/index.js      Vercel entry point (all routes rewrite here)
server.js         local dev server
src/config.js     every deployment setting, with committed defaults
src/app.js        Express app wiring
src/routes/       survey (public), api (JSON/CSV), views (login + dashboard)
src/surveys.js    record + filter — the shared query logic
src/users.js      dashboard accounts, scrypt-hashed passwords
src/auth.js       signed-cookie sessions
src/db.js         cached MongoDB connection + the duplicate-rule indexes
src/geoip.js      client IP extraction + country lookup
src/token.js      HMAC-signed tokens for the fingerprint round trip
src/format.js     timezone-aware timestamps and date boundaries
views/            EJS templates (login, dashboard, thankyou, duplicate,
                  collect, notice)
public/           served statically; fingerprint.js measures the device
```

## Configuration

Defaults live in `src/config.js` and are committed, so nothing has to be set for
the app to run. Each one can be overridden by the matching environment variable
— see `.env.example`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | no | Atlas `cluster0` | Built-in default in `src/db.js`; override to point elsewhere |
| `MONGODB_DB` | no | from URI | Override when the URI has no database |
| `ADMIN_USERNAME` | no | `admin` | Dashboard login |
| `ADMIN_PASSWORD` | no | `admin123` | **Set this in production** |
| `SESSION_SECRET` | no | dev value | Signs the login cookie *and* the `/survey/commit` token — **set this in production** |
| `DISPLAY_TIMEZONE` | no | `UTC` | IANA zone, e.g. `Asia/Kolkata` |
| `TRUSTED_IP_HEADER` | no | — | Pin the client-IP header, e.g. `x-vercel-forwarded-for` |
| `PORT` | no | `8080` | Local dev only |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Run locally

```bash
npm install
cp .env.example .env      # then edit it
npm run dev               # or: npm start
```

`npm run dev` uses `node --watch`. Environment variables are read from the
process, so either export them or run through something that loads `.env`
(e.g. `vercel dev`, or `node --env-file=.env server.js` on Node 20+).

Need a local MongoDB? `docker compose up -d` starts one on
`mongodb://localhost:27017` — then set
`MONGODB_URI=mongodb://localhost:27017/surveypoll`.

## Deploy to Vercel

Push the branch and import it at [vercel.com/new](https://vercel.com/new), or:

```bash
npm i -g vercel
vercel            # first deploy / link the project
vercel --prod
```

**No environment variables are required.** Every setting has a committed default
in `src/config.js`, so a fresh deploy connects to Atlas, seeds the `admin` login
and serves the dashboard as-is. Override any of them in **Project → Settings →
Environment Variables** when you want a value kept out of the repository.

There is no build step — Vercel runs `npm install` and bundles the function.
`vercel.json` rewrites every path to `api/index.js` and bundles `{views,public}/**`
into the function, so both the EJS templates and `/fingerprint.js` resolve at
runtime whether Vercel serves the file statically or the rewrite reaches
`express.static`. `package-lock.json` should be committed so installs are
reproducible.

One thing to check on the MongoDB side: **Atlas Network Access**. Vercel
functions have no fixed egress IPs, so allowlist `0.0.0.0/0` (relying on the
connection credentials), or use an Atlas private endpoint. If this is wrong
every page that touches the database returns 503 with a clear reason in the
function logs.

Connection handling is already serverless-aware: each warm instance keeps its
own pool, so `src/db.js` caches the client on `globalThis` and caps the pool at
10 to stay well inside the cluster's connection limit. Timeouts are tuned to
fit inside Vercel's default function limit even on a cold start.

### Credentials in the repository

The Atlas URI, the seed admin password and the cookie signing secret are all
committed in `src/config.js`. That is what makes the zero-config deploy work,
and it means **anyone who can read the repository can reach the database and
forge a dashboard session**. Keep the repository private, and if that ever
stops being true, move `MONGODB_URI`, `ADMIN_PASSWORD` and `SESSION_SECRET`
into Vercel's environment variables and rotate the Atlas password.

## Try it

Open these in a **browser** — `curl` will only fetch the collect page and stop
there, since it can't run the JavaScript that finishes the write:

```
http://localhost:8080/survey/complete?uid=vmgxhcyutydr3&pid=ZEPR47378_B2C
http://localhost:8080/survey/terminate?uid=user2&pid=ZEPR47378_B2C
http://localhost:8080/quotafull?uid=user3&pid=ZEPR47378_B2C
http://localhost:8080/security-terminate?uid=user4&pid=ZEPR47378_B2C
```

Each should land on a thank-you page after a brief "Saving your response…".
Refresh the dashboard to see the rows, then re-open any of the links to see the
**Duplicate Response** page — the uid rule rejecting the repeat.

To exercise the device rule, open a link with a *fresh* uid in the same browser:
the uid passes, then the fingerprint matches the row you just wrote and you get
**Duplicate Device**. A different browser (not just a private window) gets a
different fingerprint and is recorded normally.

> Note: for `localhost`/private IPs the country resolves to `Unknown`. Real
> public IPs (or a request forwarded with an `X-Forwarded-For` header) resolve
> to an actual country. `ip-api.com`'s free tier is HTTP-only and rate-limited
> to ~45 requests/minute.

## Notes on the port from Spring Boot

- **Sessions → signed cookie.** Serverless instances don't share memory, so the
  Spring Security server-side session was replaced with a stateless HTTP-only
  cookie signed with `SESSION_SECRET` (`SameSite=Lax`, 12h expiry).
- **Filtering moved into MongoDB.** The Java version loaded every record and
  filtered in memory; the query is now sent to the database. Matching is still
  case-insensitive and date ranges are still inclusive on both ends.
- **Timestamps are true UTC instants.** They render — and date filters are
  evaluated — in `DISPLAY_TIMEZONE`. Existing documents written by the Spring
  app are read as-is; if that app ran in a non-UTC timezone, set
  `DISPLAY_TIMEZONE` to match so old rows display the same way.
- **Data is compatible.** Same `survey_records` collection and field names, so
  the existing database works unchanged.
