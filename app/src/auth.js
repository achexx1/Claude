import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SESSION_COOKIE = 'agora_session';
const CSRF_COOKIE = 'agora_csrf';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

// ---------- Пароли ----------

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- Пользователи ----------

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export function validateRegistration({ username, password, display_name }) {
  const errors = {};
  username = String(username || '').trim().toLowerCase();
  display_name = String(display_name || '').trim();
  password = String(password || '');
  if (!USERNAME_RE.test(username)) errors.username = 'От 3 до 24 символов: латиница, цифры, _';
  if (display_name.length < 2 || display_name.length > 60) errors.display_name = 'От 2 до 60 символов';
  if (password.length < 8 || password.length > 200) errors.password = 'Минимум 8 символов';
  return { errors, values: { username, display_name, password } };
}

export function createUser(db, { username, display_name, password, is_system = 0 }) {
  const info = db.prepare(
    'INSERT INTO users (username, display_name, password_hash, is_system, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(username, display_name, hashPassword(password), is_system, Date.now());
  return Number(info.lastInsertRowid);
}

export function findUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').toLowerCase());
}

// ---------- Сессии ----------

export function createSession(db, userId) {
  const token = randomToken();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
}

function userBySessionToken(db, token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`
  ).get(sha256(token), Date.now());
  return row || null;
}

// ---------- API-ключи ----------

export function createApiKey(db, userId, name) {
  const key = `ag_live_${randomToken(24)}`;
  db.prepare('INSERT INTO api_keys (user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, name, key.slice(0, 12), sha256(key), Date.now());
  return key; // показываем один раз, в базе только хэш
}

export function listApiKeys(db, userId) {
  return db.prepare('SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC').all(userId);
}

export function revokeApiKey(db, userId, keyId) {
  db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
    .run(Date.now(), keyId, userId);
}

export function userByApiKey(db, key) {
  if (!key || !key.startsWith('ag_live_')) return null;
  const row = db.prepare(
    `SELECT u.*, k.id AS api_key_id FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = ? AND k.revoked_at IS NULL`
  ).get(sha256(key));
  if (row) db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.api_key_id);
  return row || null;
}

// ---------- Cookies и middleware ----------

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* битая cookie */ }
  }
  return out;
}

function cookieAttrs(config, maxAgeSec) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`;
}

export function setSessionCookie(res, config, token) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=${token}; ${cookieAttrs(config, SESSION_TTL_MS / 1000)}`);
}

export function clearSessionCookie(res, config) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; ${cookieAttrs(config, 0)}`);
}

/**
 * Загружает пользователя из сессии и выдаёт CSRF-токен (схема double-submit cookie):
 * токен лежит в cookie и дублируется скрытым полем _csrf в каждой форме.
 */
export function authMiddleware(db, config) {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    req.sessionToken = cookies[SESSION_COOKIE] || null;
    req.user = userBySessionToken(db, req.sessionToken);
    let csrf = cookies[CSRF_COOKIE];
    if (!csrf || csrf.length < 20) {
      csrf = randomToken(24);
      res.append('Set-Cookie', `${CSRF_COOKIE}=${csrf}; ${cookieAttrs(config, 365 * 24 * 3600)}`);
      req.csrfFromCookie = null; // новой cookie у браузера ещё нет
    } else {
      req.csrfFromCookie = csrf;
    }
    req.csrfToken = csrf;
    res.locals.user = req.user;
    res.locals.csrf = csrf;
    next();
  };
}

/** Проверка CSRF для всех POST-форм сайта. */
export function csrfProtect(req, res, next) {
  if (req.method !== 'POST') return next();
  const sent = String(req.body?._csrf || '');
  const expected = req.csrfFromCookie || '';
  const ok = sent.length > 0 && sent.length === expected.length &&
    timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).type('text/plain; charset=utf-8').send('Неверный CSRF-токен. Обновите страницу и попробуйте снова.');
  next();
}

export function requireLogin(req, res, next) {
  if (req.user) return next();
  res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
}

/** Простой ограничитель частоты в памяти (для входа и регистрации). */
export function memoryRateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      return res.status(429).type('text/plain; charset=utf-8').send('Слишком много попыток. Подождите несколько минут.');
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 10_000) hits.clear();
    next();
  };
}
