import { randomToken } from './auth.js';

export const CATEGORIES = [
  { id: 'law', name: 'Право', icon: '⚖️' },
  { id: 'marketing', name: 'Маркетинг', icon: '📈' },
  { id: 'code', name: 'Код', icon: '💻' },
  { id: 'finance', name: 'Финансы', icon: '🧾' },
  { id: 'travel', name: 'Путешествия', icon: '✈️' },
  { id: 'content', name: 'Контент', icon: '🎬' },
  { id: 'text', name: 'Тексты', icon: '📝' },
  { id: 'other', name: 'Другое', icon: '🧩' },
];
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia',
};

export function slugify(name) {
  return String(name).toLowerCase()
    .replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

const len = (s) => [...s].length;

/**
 * Проверка полей формы публикации. allowBuiltin — только для системных демо-агентов.
 * Возвращает { errors, values }.
 */
export function validateAgent(input, { devEndpoints = false, allowBuiltin = false } = {}) {
  const v = {};
  const errors = {};
  const str = (k) => String(input[k] ?? '').trim();

  v.name = str('name');
  v.tagline = str('tagline');
  v.description = str('description').replace(/\r\n/g, '\n');
  v.category = str('category');
  v.icon = str('icon') || '🤖';
  v.endpoint = str('endpoint');
  v.input_hint = str('input_hint');
  v.example_input = str('example_input').replace(/\r\n/g, '\n');
  v.price_note = str('price_note');
  v.version = str('version') || '1.0';
  v.slug = str('slug').toLowerCase() || slugify(v.name);
  v.tags = [...new Set(str('tags').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].join(', ');

  if (len(v.name) < 3 || len(v.name) > 60) errors.name = 'От 3 до 60 символов';
  if (!SLUG_RE.test(v.slug)) errors.slug = 'От 3 до 40 символов: латиница, цифры, дефис';
  if (len(v.tagline) < 10 || len(v.tagline) > 140) errors.tagline = 'От 10 до 140 символов';
  if (len(v.description) < 30 || len(v.description) > 3000) errors.description = 'От 30 до 3000 символов';
  if (!categoryById(v.category)) errors.category = 'Выберите категорию';
  if (len(v.icon) > 8) errors.icon = 'Один эмодзи';
  const tags = v.tags ? v.tags.split(', ') : [];
  if (tags.length > 8 || tags.some((t) => len(t) > 24)) errors.tags = 'До 8 тегов, каждый до 24 символов';
  if (len(v.input_hint) > 200) errors.input_hint = 'До 200 символов';
  if (len(v.example_input) > 2000) errors.example_input = 'До 2000 символов';
  if (len(v.price_note) > 80) errors.price_note = 'До 80 символов';
  if (!/^[0-9a-z.\-]{1,16}$/i.test(v.version)) errors.version = 'Например 1.0 или 2.3-beta';

  const endpointError = validateEndpoint(v.endpoint, { devEndpoints, allowBuiltin });
  if (endpointError) errors.endpoint = endpointError;

  return { errors, values: v };
}

export function validateEndpoint(endpoint, { devEndpoints, allowBuiltin }) {
  if (allowBuiltin && /^builtin:\/\/[a-z0-9-]+$/.test(endpoint)) return null;
  let url;
  try { url = new URL(endpoint); } catch { return 'Некорректный адрес'; }
  if (endpoint.length > 500) return 'Слишком длинный адрес';
  const okProtocol = url.protocol === 'https:' || (devEndpoints && url.protocol === 'http:');
  if (!okProtocol) return devEndpoints ? 'Адрес должен начинаться с http:// или https://' : 'Адрес должен начинаться с https://';
  if (url.username || url.password) return 'Не указывайте логин и пароль в адресе: используйте секрет агента';
  return null;
}

// ---------- Работа с базой ----------

const AGENT_SELECT = `
  SELECT a.*, u.username AS owner_username, u.display_name AS owner_name, u.is_system AS owner_is_system
  FROM agents a JOIN users u ON u.id = a.owner_id`;

export function createAgent(db, ownerId, v) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO agents (owner_id, slug, name, tagline, description, category, tags, icon, endpoint, secret,
                        input_hint, example_input, price_note, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ownerId, v.slug, v.name, v.tagline, v.description, v.category, v.tags, v.icon, v.endpoint,
    `ags_${randomToken(24)}`, v.input_hint, v.example_input, v.price_note, v.version, now, now);
  return Number(info.lastInsertRowid);
}

export function updateAgent(db, agentId, ownerId, v) {
  db.prepare(`
    UPDATE agents SET slug = ?, name = ?, tagline = ?, description = ?, category = ?, tags = ?, icon = ?,
      endpoint = ?, input_hint = ?, example_input = ?, price_note = ?, version = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?`
  ).run(v.slug, v.name, v.tagline, v.description, v.category, v.tags, v.icon, v.endpoint,
    v.input_hint, v.example_input, v.price_note, v.version, Date.now(), agentId, ownerId);
}

export function setAgentStatus(db, agentId, ownerId, status) {
  db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .run(status, Date.now(), agentId, ownerId);
}

export function rotateAgentSecret(db, agentId, ownerId) {
  db.prepare('UPDATE agents SET secret = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .run(`ags_${randomToken(24)}`, Date.now(), agentId, ownerId);
}

export function deleteAgent(db, agentId, ownerId) {
  db.prepare('DELETE FROM agents WHERE id = ? AND owner_id = ?').run(agentId, ownerId);
}

export function slugTaken(db, ownerId, slug, exceptId = 0) {
  return !!db.prepare('SELECT 1 FROM agents WHERE owner_id = ? AND slug = ? AND id != ?').get(ownerId, slug, exceptId);
}

export function getAgentByPath(db, owner, slug) {
  return db.prepare(`${AGENT_SELECT} WHERE u.username = ? AND a.slug = ?`).get(String(owner).toLowerCase(), String(slug)) || null;
}

export function getOwnAgent(db, agentId, ownerId) {
  return db.prepare(`${AGENT_SELECT} WHERE a.id = ? AND a.owner_id = ?`).get(agentId, ownerId) || null;
}

export function listOwnAgents(db, ownerId) {
  return db.prepare(`${AGENT_SELECT} WHERE a.owner_id = ? ORDER BY a.created_at DESC`).all(ownerId);
}

const STOP = new Set(['на', 'и', 'в', 'во', 'с', 'со', 'к', 'по', 'для', 'из', 'от', 'до', 'за', 'о', 'об', 'что', 'как',
  'мне', 'мой', 'моя', 'мои', 'это', 'а', 'но', 'или', 'не', 'the', 'a', 'an', 'of', 'to', 'for', 'and', 'in', 'on']);

/**
 * Превращает запрос пользователя в FTS5-запрос. Русские слова грубо обрезаются до основы,
 * чтобы «договора», «договору» находили «договор». Временное решение до поиска по смыслу.
 */
export function buildFtsQuery(q) {
  const words = (String(q).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .slice(0, 12)
    .map((w) => {
      if (/[а-яё]/.test(w)) {
        if (w.length >= 8) w = w.slice(0, -3);
        else if (w.length >= 6) w = w.slice(0, -2);
        else if (w.length === 5) w = w.slice(0, -1);
      }
      return `"${w.replace(/"/g, '')}"*`;
    });
  return words.length ? words.join(' OR ') : null;
}

/**
 * Поиск по каталогу (только активные агенты).
 * Без запроса: сортировка по числу успешных задач за 30 дней, затем по новизне.
 */
export function searchAgents(db, { q = '', category = '', limit = 30, offset = 0 } = {}) {
  const since = Date.now() - 30 * 86400_000;
  const fts = buildFtsQuery(q);
  const params = [];
  let sql = `
    SELECT a.*, u.username AS owner_username, u.display_name AS owner_name, u.is_system AS owner_is_system,
      (SELECT COUNT(*) FROM tasks t WHERE t.agent_id = a.id AND t.status = 'ok' AND t.self_test = 0 AND t.created_at >= ?) AS ok30
    FROM agents a JOIN users u ON u.id = a.owner_id`;
  params.push(since);
  if (fts) {
    sql += ` JOIN (SELECT rowid, bm25(agents_fts, 10.0, 5.0, 1.0, 3.0) AS rank FROM agents_fts WHERE agents_fts MATCH ?) f ON f.rowid = a.id`;
    params.push(fts);
  }
  sql += ` WHERE a.status = 'active'`;
  if (category) { sql += ' AND a.category = ?'; params.push(category); }
  // bm25 отрицательный: чем меньше, тем релевантнее. Небольшой бонус за реальную работу.
  sql += fts ? ' ORDER BY (f.rank - 0.3 * ln(1 + ok30)) ASC' : ' ORDER BY ok30 DESC, a.created_at DESC';
  sql += ' LIMIT ? OFFSET ?';
  params.push(Math.min(Math.max(Number(limit) || 30, 1), 100), Math.max(Number(offset) || 0, 0));
  return db.prepare(sql).all(...params);
}

export function countActiveAgents(db) {
  return db.prepare(`SELECT COUNT(*) AS n FROM agents WHERE status = 'active'`).get().n;
}

export function categoryCounts(db) {
  const rows = db.prepare(`SELECT category, COUNT(*) AS n FROM agents WHERE status = 'active' GROUP BY category`).all();
  return Object.fromEntries(rows.map((r) => [r.category, r.n]));
}

export const agentPath = (a) => `/a/${a.owner_username}/${a.slug}`;

/** Публичная машиночитаемая карточка агента (по мотивам A2A Agent Card). */
export function agentCard(a, stats, baseUrl) {
  return {
    schema: 'agora.agent-card/v0',
    name: a.name,
    id: `${a.owner_username}/${a.slug}`,
    version: a.version,
    description: a.tagline,
    long_description: a.description,
    category: a.category,
    tags: a.tags ? a.tags.split(', ') : [],
    owner: { username: a.owner_username, display_name: a.owner_name, verified: false },
    status: a.status,
    url: `${baseUrl}${agentPath(a)}`,
    invoke: {
      url: `${baseUrl}/api/v1/agents/${a.owner_username}/${a.slug}/invoke`,
      method: 'POST',
      auth: 'bearer',
      input: { type: 'text', hint: a.input_hint || null, max_chars: 10000 },
      output: { type: 'text+json' },
    },
    pricing: { note: a.price_note || 'бесплатно (этап 1: оплаты ещё нет)' },
    trust: {
      tasks_total: stats.total,
      window_days: 30,
      tasks_30d: stats.total30,
      success_rate_30d: stats.successRate,
      availability_30d: stats.availability,
      median_latency_ms_30d: stats.medianLatency,
      repeat_buyers_30d: stats.repeatBuyers,
      agent_buyers_share_30d: stats.agentShare,
      trust_index: null,
      note: 'Метрики считаются Agora по реальным вызовам через шлюз. Индекс доверия появится на этапе 2.',
    },
  };
}
