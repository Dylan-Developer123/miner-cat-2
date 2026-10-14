/**
 * Miner Cat 2 — standalone server
 *
 * Express backend for the Miner Cat 2 digging game.
 * - Accounts: username + bcrypt-hashed password + display name
 * - Cookie sessions (httpOnly)
 * - Server-side game saves, coins leaderboard
 * - Admin: the FIRST registered account automatically becomes admin/owner
 *          and gets a "developer" tag. Admin-only powers via /api/admin.
 *
 * Database: uses Postgres when DATABASE_URL is set (e.g. Neon on Render),
 * otherwise falls back to a local SQLite file via sql.js (WebAssembly, so it
 * runs on any Node version with zero native dependencies).
 *
 * Env vars:
 *   PORT         - port to listen on (hosts set this automatically)
 *   DATABASE_URL - Postgres connection string (persistent storage)
 *   DB_PATH      - SQLite file location for local fallback (default: ./data.sqlite)
 *
 * Security notes:
 * - Passwords are only ever handled as bcrypt hashes; raw passwords and
 *   hashes are never logged and never sent to clients.
 */
'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const SESSION_COOKIE = 'mc2_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SAVE_BYTES = 200 * 1024;
const USE_PG = DATABASE_URL.length > 0;

// ---------------------------------------------------------------------------
// Database wrappers — both expose the same tiny async API:
//   db.exec(sql)
//   db.prepare(sql) -> { get(...params), all(...params), run(...params) }
// SQL uses `?` placeholders; the pg wrapper translates them to $1, $2, ...
// ---------------------------------------------------------------------------
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

function createPgDb(pool) {
  return {
    async exec(sql) {
      await pool.query(toPg(sql));
    },
    prepare(sql) {
      const text = toPg(sql);
      return {
        async get(...params) {
          const r = await pool.query(text, params);
          return r.rows[0];
        },
        async all(...params) {
          const r = await pool.query(text, params);
          return r.rows;
        },
        async run(...params) {
          const r = await pool.query(text, params);
          return { changes: r.rowCount || 0 };
        },
      };
    },
  };
}

function createSqlJsDb(SQL) {
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    sqlDb = new SQL.Database();
  }

  function persist() {
    fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));
  }

  return {
    exec(sql) {
      sqlDb.exec(sql);
    },
    prepare(sql) {
      return {
        get(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = sqlDb.prepare(sql);
          const rows = [];
          try {
            if (params.length) stmt.bind(params);
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            stmt.step();
          } finally {
            stmt.free();
          }
          persist();
          return { changes: sqlDb.getRowsModified() };
        },
      };
    },
  };
}

const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_owner      INTEGER NOT NULL DEFAULT 0,
    is_moderator  INTEGER NOT NULL DEFAULT 0,
    is_developer  INTEGER NOT NULL DEFAULT 0,
    banned        INTEGER NOT NULL DEFAULT 0,
    coins         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS saves (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    save_json  TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_coins ON users (coins DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  CREATE TABLE IF NOT EXISTS broadcasts (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    message    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO broadcasts (id, message) VALUES (1, '');
`;

const SCHEMA_PG = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_owner      INTEGER NOT NULL DEFAULT 0,
    is_moderator  INTEGER NOT NULL DEFAULT 0,
    is_developer  INTEGER NOT NULL DEFAULT 0,
    banned        INTEGER NOT NULL DEFAULT 0,
    coins         INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS saves (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    save_json  TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_coins ON users (coins DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  CREATE TABLE IF NOT EXISTS broadcasts (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    message    TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO broadcasts (id, message) VALUES (1, '') ON CONFLICT (id) DO NOTHING;
`;

async function main() {
  let db;
  if (USE_PG) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required by Neon and similar hosts
    });
    db = createPgDb(pool);
    await db.exec(SCHEMA_PG);
    console.log('Using Postgres database');
  } else {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    db = createSqlJsDb(SQL);
    db.exec(SCHEMA_SQLITE);
    console.log('Using local SQLite database at ' + DB_PATH);
  }

  // Migrations for existing databases
  try { await db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN is_moderator INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN is_developer INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN hide_tags INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec(`CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    message TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`); } catch (e) { /* already exists */ }

  const NOW = USE_PG ? 'NOW()' : "datetime('now')";

  // Prepared statements
  const stmtGetUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const stmtGetUserAuthByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const stmtCountUsers = db.prepare('SELECT COUNT(*) AS n FROM users');
  const stmtInsertUser = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)'
  );
  const stmtUpdateUserCoins = db.prepare('UPDATE users SET coins = ? WHERE id = ?');
  const stmtUpdateAccount = db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?');
  const stmtUpdatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const stmtGetSave = db.prepare('SELECT save_json, updated_at FROM saves WHERE user_id = ?');
  const stmtUpsertSave = db.prepare(
    'INSERT INTO saves (user_id, save_json, updated_at) VALUES (?, ?, ' + NOW + ')' +
    ' ON CONFLICT(user_id) DO UPDATE SET save_json = excluded.save_json, updated_at = ' + NOW
  );
  const stmtInsertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
  const stmtGetSession = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
  const stmtDeleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const stmtDeleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const stmtLeaderboard = db.prepare(
    'SELECT display_name, coins, is_admin, is_owner, is_moderator, is_developer FROM users ORDER BY coins DESC, created_at ASC LIMIT 50'
  );

  // -------------------------------------------------------------------------
  // App setup
  // -------------------------------------------------------------------------
  const app = express();
  app.set('trust proxy', 1); // needed behind a hosting proxy for secure cookies
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const isProd = process.env.NODE_ENV === 'production';
  function sessionCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // hosts serve over HTTPS
      maxAge: SESSION_TTL_MS,
      path: '/',
    };
  }

  // Very light in-memory rate limiter for auth endpoints (per IP).
  const attempts = new Map();
  function rateLimit(max, windowMs) {
    return (req, res, next) => {
      const key = req.ip || 'unknown';
      const now = Date.now();
      const entry = attempts.get(key) || { count: 0, resetAt: now + windowMs };
      if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + windowMs;
      }
      entry.count += 1;
      attempts.set(key, entry);
      if (entry.count > max) {
        return res.status(429).json({ error: 'Too many attempts, try again later.' });
      }
      next();
    };
  }

  function newSessionToken() {
    return crypto.randomBytes(32).toString('hex'); // 64 chars
  }

  async function createSession(res, userId) {
    const token = newSessionToken();
    await stmtInsertSession.run(token, userId, Date.now() + SESSION_TTL_MS);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  }

  // Attach req.user (public profile fields only) when a valid session exists.
  app.use(async (req, res, next) => {
    req.user = null;
    try {
      const token = req.cookies[SESSION_COOKIE];
      if (typeof token === 'string' && token.length === 64) {
        const row = await stmtGetSession.get(token);
        if (row && Number(row.expires_at) > Date.now()) {
          const user = await stmtGetUserById.get(row.user_id);
          if (user) req.user = user;
        } else if (row) {
          await stmtDeleteSession.run(token); // expired
        }
      }
    } catch (e) {
      console.error('session lookup failed:', e.message);
    }
    next();
  });

  function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    next();
  }

  function requireAdmin(req, res, next) {
    const u = req.user;
    if (!u || !(u.is_admin || u.is_moderator || u.is_developer || u.is_owner)) {
      return res.status(403).json({ error: 'Admin only.' });
    }
    next();
  }

  // Public profile shape — never includes password_hash.
  function publicProfile(u) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      isAdmin: !!u.is_admin,
      isOwner: !!u.is_owner || !!u.is_admin,
      isModerator: !!u.is_moderator || !!u.is_admin,
      isDeveloper: !!u.is_developer || !!u.is_admin,
      hideTags: !!u.hide_tags,
      coins: u.coins,
    };
  }
  async function isOriginalOwner(userId) {
    const r = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    return r && r.id === userId;
  }

  // --- validation helpers ---------------------------------------------------
  function validUsername(v) {
    if (typeof v !== 'string') return false;
    const t = v.trim();
    return t.length >= 3 && t.length <= 32 && /^[A-Za-z0-9._\- ]+$/.test(t);
  }
  function validPassword(v) {
    return typeof v === 'string' && v.length >= 6 && v.length <= 128;
  }
  function validDisplayName(v) {
    return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 24;
  }
  function coinsFromSave(save) {
    const c = Number(save && save.coins);
    return Number.isFinite(c) ? Math.max(0, Math.min(1e12, Math.floor(c))) : 0;
  }

  // -------------------------------------------------------------------------
  // Auth routes
  // -------------------------------------------------------------------------
  app.post('/api/signup', rateLimit(20, 10 * 60 * 1000), async (req, res) => {
    let { username, password, displayName } = req.body || {};
    if (typeof username === 'string') username = username.trim();
    if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, spaces, . _ -).' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!validDisplayName(displayName)) return res.status(400).json({ error: 'Display name must be 1-24 characters.' });
    if (await stmtGetUserAuthByUsername.get(username)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    const countRow = await stmtCountUsers.get();
    const isFirst = Number(countRow.n) === 0;
    const hash = bcrypt.hashSync(password, 10);
    await stmtInsertUser.run(username, hash, displayName.trim(), isFirst ? 1 : 0);
    const authRow = await stmtGetUserAuthByUsername.get(username);
    const user = await stmtGetUserById.get(authRow.id);
    await createSession(res, user.id);
    const profile = publicProfile(user);
    profile.canGiveTags = await isOriginalOwner(user.id);
    res.status(201).json({ user: profile });
  });

  app.post('/api/signin', rateLimit(30, 10 * 60 * 1000), async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const row = await stmtGetUserAuthByUsername.get(username.trim());
    // Constant-time-ish failure path: always run a bcrypt compare.
    const ok = row ? bcrypt.compareSync(password, row.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });
    if (row.banned) return res.status(403).json({ error: 'This account has been banned.' });
    await createSession(res, row.id);
    const userRow = await stmtGetUserById.get(row.id);
    const signinProfile = publicProfile(userRow);
    signinProfile.canGiveTags = await isOriginalOwner(row.id);
    res.json({ user: signinProfile });
  });

  app.post('/api/signout', async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (typeof token === 'string') await stmtDeleteSession.run(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    const meProfile = publicProfile(req.user);
    meProfile.canGiveTags = await isOriginalOwner(req.user.id);
    res.json({ user: meProfile });
  });

  // -------------------------------------------------------------------------
  // Saves
  // -------------------------------------------------------------------------
  app.get('/api/save', requireAuth, async (req, res) => {
    const row = await stmtGetSave.get(req.user.id);
    if (!row) return res.status(404).json({ error: 'No save yet.' });
    res.json({ save: JSON.parse(row.save_json), updatedAt: row.updated_at });
  });

  app.post('/api/save', requireAuth, async (req, res) => {
    const { save } = req.body || {};
    if (!save || typeof save !== 'object' || Array.isArray(save)) {
      return res.status(400).json({ error: 'Invalid save data.' });
    }
    const json = JSON.stringify(save);
    if (json.length > MAX_SAVE_BYTES) {
      return res.status(413).json({ error: 'Save data too large.' });
    }
    await stmtUpsertSave.run(req.user.id, json);
    await stmtUpdateUserCoins.run(coinsFromSave(save), req.user.id);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Leaderboard — ranked by coins, shows display names (+ developer tag)
  // -------------------------------------------------------------------------
  app.get('/api/leaderboard', async (req, res) => {
    const rows = await stmtLeaderboard.all();
    res.json({
      leaderboard: rows.map((r) => ({
        displayName: r.display_name,
        coins: r.coins,
        tags: r.hide_tags ? {} : {
          owner: !!r.is_owner || !!r.is_admin,
          admin: !!r.is_admin,
          moderator: !!r.is_moderator || !!r.is_admin,
          developer: !!r.is_developer || !!r.is_admin,
        },
      })),
    });
  });

  app.get('/api/broadcast', async (req, res) => {
    const row = await db.prepare('SELECT message FROM broadcasts WHERE id = 1').get();
    res.json({ message: row ? row.message : '' });
  });

  // -------------------------------------------------------------------------
  // Account settings — change username / display name / password
  // -------------------------------------------------------------------------
  app.patch('/api/account', requireAuth, async (req, res) => {
    let { currentPassword, username, displayName, newPassword } = req.body || {};
    if (typeof username === 'string') username = username.trim();
    const full = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const nextUsername = username !== undefined ? username : full.username;
    const nextDisplay = displayName !== undefined ? displayName : full.display_name;
    const changingSensitive = nextUsername !== full.username || (newPassword !== undefined && newPassword !== '');
    // Only require current password when changing username or password
    if (changingSensitive) {
      if (!full || !bcrypt.compareSync(String(currentPassword || ''), full.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }
    if (!validUsername(nextUsername)) return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, spaces, . _ -).' });
    if (!validDisplayName(nextDisplay)) return res.status(400).json({ error: 'Display name must be 1-24 characters.' });
    if (newPassword !== undefined && newPassword !== '' && !validPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    if (nextUsername !== full.username && await stmtGetUserAuthByUsername.get(nextUsername)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    await stmtUpdateAccount.run(nextUsername, nextDisplay.trim(), req.user.id);
    if (newPassword) {
      await stmtUpdatePassword.run(bcrypt.hashSync(newPassword, 10), req.user.id);
      await stmtDeleteUserSessions.run(req.user.id); // force re-login everywhere
    }
    const user = await stmtGetUserById.get(req.user.id);
    if (newPassword) await createSession(res, user.id); // keep this device signed in
    const updatedProfile = publicProfile(user);
    updatedProfile.canGiveTags = await isOriginalOwner(user.id);
    res.json({ user: updatedProfile });
  });

  app.post('/api/toggle-tags', requireAuth, async (req, res) => {
    const hide = !!req.body.hide;
    await db.prepare('UPDATE users SET hide_tags = ? WHERE id = ?').run(hide ? 1 : 0, req.user.id);
    const user = await stmtGetUserById.get(req.user.id);
    const profile = publicProfile(user);
    profile.canGiveTags = await isOriginalOwner(user.id);
    res.json({ user: profile });
  });

  // -------------------------------------------------------------------------
  // Admin powers — server-enforced, admin accounts only
  // -------------------------------------------------------------------------
  app.post('/api/admin', requireAuth, requireAdmin, async (req, res) => {
    const { command, amount, pick, armor, bag } = req.body || {};
    const row = await stmtGetSave.get(req.user.id);
    const save = row ? JSON.parse(row.save_json) : {};
    const clamp = (v, lo, hi, dflt) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : dflt;
    };
    switch (command) {
      case 'coins':
        save.coins = clamp((save.coins || 0) + (amount || 0), 0, 1e9, 0);
        break;
      case 'gems':
        save.gems = clamp((save.gems || 0) + (amount || 0), 0, 1e9, 0);
        break;
      case 'god':
        save.god = !save.god;
        break;
      case 'achievements':
        save.achievements = ['rock-rookie', 'block-buster', 'mining-mogul', 'deep-paws', 'deep-diver', 'stage-explorer', 'big-swing', 'maxed-out', 'coin-starter', 'coin-tycoon', 'gem-hunter'];
        break;
      case 'heal':
        save.health = 100;
        break;
      case 'upgrades':
        if (pick !== undefined) save.pickLevel = clamp(pick, 1, 50, save.pickLevel || 1);
        if (armor !== undefined) save.armorLevel = clamp(armor, 1, 50, save.armorLevel || 1);
        if (bag !== undefined) save.bagLevel = clamp(bag, 1, 50, save.bagLevel || 1);
        save.enchants = { swift: 5, bouncy: 5, lucky: 5, hardy: 4, lava: 5 };
        break;
      case 'stage100':
        save.stage = 100;
        save.depth = 0;
        save.playerX = 10;
        save.playerY = 0;
        break;
      case 'wipe':
        // Delete ALL accounts, sessions, and saves. Next registration becomes admin.
        await db.prepare('DELETE FROM sessions').run();
        await db.prepare('DELETE FROM saves').run();
        await db.prepare('DELETE FROM users').run();
        return res.json({ ok: true, wiped: true });
      case 'ban':
      case 'unban': {
        const target = String(req.body.target || '').trim();
        if (!target) return res.status(400).json({ error: 'Username required.' });
        const victim = await db.prepare('SELECT id, is_admin, is_owner FROM users WHERE username = ?').get(target);
        if (!victim) return res.status(404).json({ error: 'Account not found.' });
        if (victim.id === req.user.id) return res.status(400).json({ error: 'You cannot ban yourself.' });
        if (victim.is_owner) return res.status(400).json({ error: 'Cannot ban the owner.' });
        if (victim.is_admin) return res.status(400).json({ error: 'Cannot ban an admin.' });
        const bannedVal = command === 'ban' ? 1 : 0;
        await db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(bannedVal, victim.id);
        if (bannedVal) await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(victim.id); // kick them out
        return res.json({ ok: true, banned: !!bannedVal, username: target });
      }
      case 'broadcast': {
        const msg = String(req.body.message || '').slice(0, 500);
        if (USE_PG) {
          await db.prepare('UPDATE broadcasts SET message = $1, updated_at = NOW() WHERE id = 1').run(msg);
        } else {
          await db.prepare("UPDATE broadcasts SET message = ?, updated_at = datetime('now') WHERE id = 1").run(msg);
        }
        return res.json({ ok: true, message: msg });
      }
      case 'gift': {
        const target = String(req.body.target || '').trim();
        if (!target) return res.status(400).json({ error: 'Username required.' });
        const giftCoins = clamp(req.body.coins, 0, 1e9, 0);
        const giftGems = clamp(req.body.gems, 0, 1e9, 0);
        if (!giftCoins && !giftGems) return res.status(400).json({ error: 'Enter an amount.' });
        const targetUser = await db.prepare('SELECT id FROM users WHERE username = ?').get(target);
        if (!targetUser) return res.status(404).json({ error: 'Account not found.' });
        const srow = await stmtGetSave.get(targetUser.id);
        const tsave = srow ? JSON.parse(srow.save_json) : {};
        tsave.coins = clamp((tsave.coins || 0) + giftCoins, 0, 1e9, 0);
        tsave.gems = clamp((tsave.gems || 0) + giftGems, 0, 1e9, 0);
        await stmtUpsertSave.run(targetUser.id, JSON.stringify(tsave));
        await stmtUpdateUserCoins.run(coinsFromSave(tsave), targetUser.id);
        return res.json({ ok: true, username: target, coins: giftCoins, gems: giftGems });
      }
      case 'reset': {
        const target = String(req.body.target || '').trim();
        if (!target) return res.status(400).json({ error: 'Username required.' });
        const targetUser = await db.prepare('SELECT id, is_admin, is_owner FROM users WHERE username = ?').get(target);
        if (!targetUser) return res.status(404).json({ error: 'Account not found.' });
        if (targetUser.is_owner && targetUser.id !== req.user.id) {
          return res.status(400).json({ error: 'Cannot reset the owner.' });
        }
        if (targetUser.is_admin && targetUser.id !== req.user.id) {
          return res.status(400).json({ error: 'Cannot reset another admin.' });
        }
        await db.prepare('DELETE FROM saves WHERE user_id = ?').run(targetUser.id);
        await db.prepare('UPDATE users SET coins = 0 WHERE id = ?').run(targetUser.id);
        await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUser.id); // force re-login
        return res.json({ ok: true, username: target, self: targetUser.id === req.user.id });
      }
      case 'tag': {
        // Only the original owner (first registered account) can give tags.
        const ownerRow = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
        if (!ownerRow || ownerRow.id !== req.user.id) {
          return res.status(403).json({ error: 'Only the owner can give tags.' });
        }
        const target = String(req.body.target || '').trim();
        const tag = String(req.body.tag || '').toLowerCase();
        const grant = req.body.grant !== false; // default to granting
        const validTags = { admin: 'is_admin', moderator: 'is_moderator', developer: 'is_developer' };
        if (!target) return res.status(400).json({ error: 'Username required.' });
        if (!validTags[tag]) return res.status(400).json({ error: 'Invalid tag. Use admin, moderator, or developer.' });
        const targetUser = await db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get(target);
        if (!targetUser) return res.status(404).json({ error: 'Account not found.' });
        if (targetUser.id === req.user.id) return res.status(400).json({ error: 'You already have all tags.' });
        const col = validTags[tag];
        await db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(grant ? 1 : 0, targetUser.id);
        // Notify the user live via WebSocket if they're online
        const onlineUser = online.get(targetUser.id);
        if (onlineUser && onlineUser.ws.readyState === WebSocket.OPEN) {
          const updated = await stmtGetUserById.get(targetUser.id);
          const profile = publicProfile(updated);
          onlineUser.ws.send(JSON.stringify({ t: 'tags-updated', user: profile }));
          // Update their tags in the online map too
          onlineUser.tags = updated.hide_tags ? {} : {
            owner: !!updated.is_owner || !!updated.is_admin,
            admin: !!updated.is_admin,
            moderator: !!updated.is_moderator || !!updated.is_admin,
            developer: !!updated.is_developer || !!updated.is_admin,
          };
        }
        // Refresh everyone's leaderboard
        broadcast({ t: 'leaderboard-refresh' });
        return res.json({ ok: true, username: target, tag, granted: grant });
      }
      default:
        return res.status(400).json({ error: 'Unknown admin command.' });
    }
    const json = JSON.stringify(save);
    await stmtUpsertSave.run(req.user.id, json);
    await stmtUpdateUserCoins.run(coinsFromSave(save), req.user.id);
    res.json({ ok: true, save });
  });

  // -------------------------------------------------------------------------
  // Static frontend
  // -------------------------------------------------------------------------
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
  // SPA fallback: unknown non-API routes serve the game.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const httpServer = app.listen(PORT, () => {
    console.log(`Miner Cat 2 listening on port ${PORT} (${USE_PG ? 'Postgres' : 'local SQLite'})`);
  });

  // -------------------------------------------------------------------------
  // Multiplayer — WebSocket server for live player positions and block breaks
  // -------------------------------------------------------------------------
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
  const online = new Map(); // userId -> { ws, username, displayName, x, y, stage, tags }

  function broadcast(msg, exceptId) {
    const data = JSON.stringify(msg);
    for (const [id, p] of online) {
      if (id === exceptId) continue;
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
    }
  }

  wss.on('connection', async (ws, req) => {
    // Auth via session cookie
    let userId = null;
    try {
      const cookies = (req.headers.cookie || '').split(';').map((c) => c.trim());
      const sessCookie = cookies.find((c) => c.startsWith(SESSION_COOKIE + '='));
      if (sessCookie) {
        const token = sessCookie.slice(SESSION_COOKIE.length + 1);
        const srow = await stmtGetSession.get(token);
        if (srow && Number(srow.expires_at) > Date.now()) {
          const u = await stmtGetUserById.get(srow.user_id);
          if (u && !u.banned) userId = u.id;
        }
      }
    } catch (e) {}
    if (!userId) { ws.close(4001, 'Not authenticated'); return; }

    const user = await stmtGetUserById.get(userId);
    const player = {
      ws,
      id: userId,
      username: user.username,
      displayName: user.display_name,
      x: 10.5, y: -0.5, stage: 1,
      tags: user.hide_tags ? {} : {
        owner: !!user.is_owner || !!user.is_admin,
        admin: !!user.is_admin,
        moderator: !!user.is_moderator || !!user.is_admin,
        developer: !!user.is_developer || !!user.is_admin,
      },
    };
    // Replace old connection if re-connecting
    if (online.has(userId)) { try { online.get(userId).ws.close(); } catch (e) {} }
    online.set(userId, player);
    console.log(`[ws] ${player.username} joined (${online.size} online)`);

    // Send current players to the newcomer
    const others = [...online.values()].filter((p) => p.id !== userId).map((p) => ({
      id: p.id, username: p.username, displayName: p.displayName,
      x: p.x, y: p.y, stage: p.stage, tags: p.tags,
    }));
    ws.send(JSON.stringify({ t: 'welcome', id: userId, players: others }));
    // Announce to others
    broadcast({ t: 'join', player: { id: player.id, username: player.username, displayName: player.displayName, x: player.x, y: player.y, stage: player.stage, tags: player.tags } }, userId);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      const p = online.get(userId);
      if (!p) return;
      if (msg.t === 'pos' && typeof msg.x === 'number' && typeof msg.y === 'number') {
        p.x = msg.x; p.y = msg.y; p.stage = msg.stage | 0;
        // Broadcast to others on the same stage
        broadcast({ t: 'pos', id: userId, x: p.x, y: p.y, stage: p.stage }, userId);
      } else if (msg.t === 'break' && Number.isInteger(msg.x) && Number.isInteger(msg.y)) {
        // Relay block break to others on the same stage
        broadcast({ t: 'break', stage: msg.stage | 0, x: msg.x, y: msg.y, by: player.username }, userId);
      } else if (msg.t === 'voice-join' || msg.t === 'voice-leave') {
        // Voice presence — tell others in the lounge
        broadcast({ t: msg.t, from: userId, username: player.username }, userId);
      } else if ((msg.t === 'voice-offer' || msg.t === 'voice-answer' || msg.t === 'voice-ice') && msg.to) {
        // Direct signaling messages
        const target = online.get(msg.to);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({ ...msg, from: userId }));
        }
      }
    });

    ws.on('close', () => {
      if (online.get(userId)?.ws === ws) {
        online.delete(userId);
        broadcast({ t: 'leave', id: userId });
        console.log(`[ws] ${player.username} left (${online.size} online)`);
      }
    });
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { createPgDb, createSqlJsDb, toPg, SCHEMA_PG, SCHEMA_SQLITE };
