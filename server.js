/**
 * Miner Cat 2 — standalone server
 *
 * Express + SQLite backend for the Miner Cat 2 digging game.
 * - Accounts: username + bcrypt-hashed password + display name
 * - Cookie sessions (httpOnly)
 * - Server-side game saves, coins leaderboard
 * - Admin: the FIRST registered account automatically becomes admin/owner
 *          and gets a "developer" tag. Admin-only powers via /api/admin.
 *
 * Env vars:
 *   PORT     - port to listen on (Render sets this automatically)
 *   DB_PATH  - SQLite file location (default: ./data.sqlite)
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
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const SESSION_COOKIE = 'mc2_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SAVE_BYTES = 200 * 1024;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
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
`);

// Prepared statements
const stmtGetUserById = db.prepare('SELECT id, username, display_name, is_admin, coins FROM users WHERE id = ?');
const stmtGetUserAuthByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const stmtCountUsers = db.prepare('SELECT COUNT(*) AS n FROM users');
const stmtInsertUser = db.prepare(
  'INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)'
);
const stmtUpdateUserCoins = db.prepare('UPDATE users SET coins = ? WHERE id = ?');
const stmtUpdateAccount = db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?');
const stmtUpdatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const stmtGetSave = db.prepare('SELECT save_json, updated_at FROM saves WHERE user_id = ?');
const stmtUpsertSave = db.prepare(`
  INSERT INTO saves (user_id, save_json, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(user_id) DO UPDATE SET save_json = excluded.save_json, updated_at = datetime('now')
`);
const stmtInsertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
const stmtGetSession = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
const stmtDeleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const stmtDeleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const stmtLeaderboard = db.prepare(
  'SELECT display_name, coins, is_admin FROM users ORDER BY coins DESC, created_at ASC LIMIT 50'
);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1); // needed behind Render's proxy for secure cookies
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const isProd = process.env.NODE_ENV === 'production';
function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd, // Render serves over HTTPS
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

function createSession(res, userId) {
  const token = newSessionToken();
  stmtInsertSession.run(token, userId, Date.now() + SESSION_TTL_MS);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

// Attach req.user (public profile fields only) when a valid session exists.
app.use((req, res, next) => {
  req.user = null;
  const token = req.cookies[SESSION_COOKIE];
  if (typeof token === 'string' && token.length === 64) {
    const row = stmtGetSession.get(token);
    if (row && row.expires_at > Date.now()) {
      const user = stmtGetUserById.get(row.user_id);
      if (user) req.user = user;
    } else if (row) {
      stmtDeleteSession.run(token); // expired
    }
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
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
    coins: u.coins,
  };
}

// --- validation helpers -----------------------------------------------------
function validUsername(v) {
  return typeof v === 'string' && /^[A-Za-z0-9._-]{3,32}$/.test(v);
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

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post('/api/signup', rateLimit(20, 10 * 60 * 1000), (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, . _ -).' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!validDisplayName(displayName)) return res.status(400).json({ error: 'Display name must be 1-24 characters.' });
  if (stmtGetUserAuthByUsername.get(username)) {
    return res.status(409).json({ error: 'That username is taken.' });
  }
  const isFirst = stmtCountUsers.get().n === 0;
  const hash = bcrypt.hashSync(password, 10);
  const info = stmtInsertUser.run(username, hash, displayName.trim(), isFirst ? 1 : 0);
  const user = stmtGetUserById.get(Number(info.lastInsertRowid));
  createSession(res, user.id);
  res.status(201).json({ user: publicProfile(user) });
});

app.post('/api/signin', rateLimit(30, 10 * 60 * 1000), (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const row = stmtGetUserAuthByUsername.get(username);
  // Constant-time-ish failure path: always run a bcrypt compare.
  const ok = row ? bcrypt.compareSync(password, row.password_hash) : false;
  if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });
  createSession(res, row.id);
  res.json({ user: publicProfile(stmtGetUserById.get(row.id)) });
});

app.post('/api/signout', (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (typeof token === 'string') stmtDeleteSession.run(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: publicProfile(req.user) });
});

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------
app.get('/api/save', requireAuth, (req, res) => {
  const row = stmtGetSave.get(req.user.id);
  if (!row) return res.status(404).json({ error: 'No save yet.' });
  res.json({ save: JSON.parse(row.save_json), updatedAt: row.updated_at });
});

app.post('/api/save', requireAuth, (req, res) => {
  const { save } = req.body || {};
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    return res.status(400).json({ error: 'Invalid save data.' });
  }
  const json = JSON.stringify(save);
  if (json.length > MAX_SAVE_BYTES) {
    return res.status(413).json({ error: 'Save data too large.' });
  }
  stmtUpsertSave.run(req.user.id, json);
  stmtUpdateUserCoins.run(coinsFromSave(save), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Leaderboard — ranked by coins, shows display names (+ developer tag)
// ---------------------------------------------------------------------------
app.get('/api/leaderboard', (req, res) => {
  const rows = stmtLeaderboard.all();
  res.json({
    leaderboard: rows.map((r) => ({
      displayName: r.display_name,
      coins: r.coins,
      developer: !!r.is_admin,
    })),
  });
});

// ---------------------------------------------------------------------------
// Account settings — change username / display name / password
// ---------------------------------------------------------------------------
app.patch('/api/account', requireAuth, (req, res) => {
  const { currentPassword, username, displayName, newPassword } = req.body || {};
  const full = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!full || !bcrypt.compareSync(String(currentPassword || ''), full.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const nextUsername = username !== undefined ? username : full.username;
  const nextDisplay = displayName !== undefined ? displayName : full.display_name;
  if (!validUsername(nextUsername)) return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, . _ -).' });
  if (!validDisplayName(nextDisplay)) return res.status(400).json({ error: 'Display name must be 1-24 characters.' });
  if (newPassword !== undefined && newPassword !== '' && !validPassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  if (nextUsername !== full.username && stmtGetUserAuthByUsername.get(nextUsername)) {
    return res.status(409).json({ error: 'That username is taken.' });
  }
  stmtUpdateAccount.run(nextUsername, nextDisplay.trim(), req.user.id);
  if (newPassword) {
    stmtUpdatePassword.run(bcrypt.hashSync(newPassword, 10), req.user.id);
    stmtDeleteUserSessions.run(req.user.id); // force re-login everywhere
  }
  const user = stmtGetUserById.get(req.user.id);
  if (newPassword) createSession(res, user.id); // keep this device signed in
  res.json({ user: publicProfile(user) });
});

// ---------------------------------------------------------------------------
// Admin powers — server-enforced, admin accounts only
// ---------------------------------------------------------------------------
app.post('/api/admin', requireAuth, requireAdmin, (req, res) => {
  const { command, amount, pick, armor, bag } = req.body || {};
  const row = stmtGetSave.get(req.user.id);
  const save = row ? JSON.parse(row.save_json) : {};
  const clamp = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : dflt;
  };
  switch (command) {
    case 'coins':
      save.coins = clamp((save.coins || 0) + (amount || 0), 0, 1e9, 0);
      break;
    case 'heal':
      save.health = 100;
      break;
    case 'upgrades':
      if (pick !== undefined) save.pickLevel = clamp(pick, 1, 50, save.pickLevel || 1);
      if (armor !== undefined) save.armorLevel = clamp(armor, 1, 50, save.armorLevel || 1);
      if (bag !== undefined) save.bagLevel = clamp(bag, 1, 50, save.bagLevel || 1);
      break;
    case 'stage25':
      save.stage = 25;
      save.depth = 0;
      save.playerX = 10;
      save.playerY = 0;
      break;
    default:
      return res.status(400).json({ error: 'Unknown admin command.' });
  }
  const json = JSON.stringify(save);
  stmtUpsertSave.run(req.user.id, json);
  stmtUpdateUserCoins.run(coinsFromSave(save), req.user.id);
  res.json({ ok: true, save });
});

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// SPA fallback: unknown non-API routes serve the game.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Miner Cat 2 listening on port ${PORT} (db: ${DB_PATH})`);
});
