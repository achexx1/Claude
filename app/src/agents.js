import { randomToken } from './auth.js';
import { AGENT_LANGUAGES, REGIONS, UI_LOCALES } from './i18n/index.js';

export const CATEGORIES = [
  { id: 'law', icon: '⚖️' },
  { id: 'marketing', icon: '📈' },
  { id: 'code', icon: '💻' },
  { id: 'finance', icon: '🧾' },
  { id: 'travel', icon: '✈️' },
  { id: 'content', icon: '🎬' },
  { id: 'text', icon: '📝' },
  { id: 'other', icon: '🧩' },
];
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Поля карточки, которые можно перевести на другие языки интерфейса. */
export const TRANSLATABLE = ['name', 'tagline', 'description', 'input_hint', 'example_input'];

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
const toList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(','))
  .map((x) => String(x).trim()).filter(Boolean);

/**
 * Проверка полей формы публикации. Ошибки — объекты { code, ...параметры }, текст подставляет интерфейс.
 * allowBuiltin — только для системных демо-агентов.
 */
export function validateAgent(input, { devEndpoints = false, allowBuiltin = false } = {}) {
  const v = {};
  const errors = {};
  const str = (k) => String(input[k] ?? '').trim();
  const checkLen = (key, value, min, max) => {
    const n = len(value);
    if (n < min || n > max) errors[key] = min ? { code: 'len', min, max } : { code: 'max', max };
  };

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
  v.primary_lang = str('primary_lang') || 'ru';
  v.languages = [...new Set(toList(input.languages))];
  v.region = str('region') || 'global';

  checkLen('name', v.name, 3, 60);
  if (!SLUG_RE.test(v.slug)) errors.slug = { code: 'slug' };
  checkLen('tagline', v.tagline, 10, 140);
  checkLen('description', v.description, 30, 3000);
  if (!categoryById(v.category)) errors.category = { code: 'category' };
  if (len(v.icon) > 8) errors.icon = { code: 'icon' };
  const tags = v.tags ? v.tags.split(', ') : [];
  if (tags.length > 8 || tags.some((t) => len(t) > 24)) errors.tags = { code: 'tags' };
  checkLen('input_hint', v.input_hint, 0, 200);
  checkLen('example_input', v.example_input, 0, 2000);
  checkLen('price_note', v.price_note, 0, 80);
  if (!/^[0-9a-z.\-]{1,16}$/i.test(v.version)) errors.version = { code: 'version' };
  if (!AGENT_LANGUAGES.includes(v.primary_lang)) errors.primary_lang = { code: 'lang' };
  if (!v.languages.length || v.languages.some((l) => !AGENT_LANGUAGES.includes(l))) errors.languages = { code: 'languages' };
  if (!REGIONS.includes(v.region)) errors.region = { code: 'region' };

  const endpointError = validateEndpoint(v.endpoint, { devEndpoints, allowBuiltin });
  if (endpointError) errors.endpoint = { code: endpointError };

  // Переводы карточки на другие языки интерфейса: поля tr_<язык>_<поле>
  v.i18n = {};
  for (const lang of UI_LOCALES) {
    if (lang === v.primary_lang) continue;
    const tr = {};
    for (const f of TRANSLATABLE) tr[f] = String(input[`tr_${lang}_${f}`] ?? '').trim().replace(/\r\n/g, '\n');
    if (!TRANSLATABLE.some((f) => tr[f])) continue; // перевод не заполнен
    const k = (f) => `tr_${lang}_${f}`;
    const before = Object.keys(errors).length;
    checkLen(k('name'), tr.name, 3, 60);
    checkLen(k('tagline'), tr.tagline, 10, 140);
    checkLen(k('description'), tr.description, 30, 3000);
    checkLen(k('input_hint'), tr.input_hint, 0, 200);
    checkLen(k('example_input'), tr.example_input, 0, 2000);
    if (Object.keys(errors).length === before) v.i18n[lang] = tr;
  }
  v.i18n_text = i18nSearchText(v.i18n);

  return { errors, values: v };
}

export const i18nSearchText = (i18n) => Object.values(i18n).map((tr) => [tr.name, tr.tagline, tr.description].join(' ')).join(' ');

/** Возвращает код ошибки или null. */
export function validateEndpoint(endpoint, { devEndpoints, allowBuiltin }) {
  if (allowBuiltin && /^builtin:\/\/[a-z0-9-]+$/.test(endpoint)) return null;
  let url;
  try { url = new URL(endpoint); } catch { return 'url_invalid'; }
  if (endpoint.length > 500) return 'url_long';
  const okProtocol = url.protocol === 'https:' || (devEndpoints && url.protocol === 'http:');
  if (!okProtocol) return devEndpoints ? 'url_http' : 'url_https';
  if (url.username || url.password) return 'url_credentials';
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
                        input_hint, example_input, price_note, version, primary_lang, languages, region, i18n, i18n_text,
                        created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ownerId, v.slug, v.name, v.tagline, v.description, v.category, v.tags, v.icon, v.endpoint,
    `ags_${randomToken(24)}`, v.input_hint, v.example_input, v.price_note, v.version,
    v.primary_lang, v.languages.join(','), v.region, JSON.stringify(v.i18n || {}), v.i18n_text || '', now, now);
  return Number(info.lastInsertRowid);
}

export function updateAgent(db, agentId, ownerId, v) {
  db.prepare(`
    UPDATE agents SET slug = ?, name = ?, tagline = ?, description = ?, category = ?, tags = ?, icon = ?,
      endpoint = ?, input_hint = ?, example_input = ?, price_note = ?, version = ?,
      primary_lang = ?, languages = ?, region = ?, i18n = ?, i18n_text = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?`
  ).run(v.slug, v.name, v.tagline, v.description, v.category, v.tags, v.icon, v.endpoint,
    v.input_hint, v.example_input, v.price_note, v.version,
    v.primary_lang, v.languages.join(','), v.region, JSON.stringify(v.i18n || {}), v.i18n_text || '',
    Date.now(), agentId, ownerId);
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

export const agentLanguages = (a) => toList(a.languages);
export const agentTags = (a) => (a.tags ? a.tags.split(', ') : []);

export function parseI18n(a) {
  try { const v = JSON.parse(a.i18n || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/**
 * Карточка на языке посетителя: если создатель добавил перевод, подставляем его.
 * shown_lang — на каком языке в итоге показано описание.
 */
export function localizeAgent(a, locale) {
  const tr = locale !== a.primary_lang ? parseI18n(a)[locale] : null;
  if (!tr?.name) return { ...a, shown_lang: a.primary_lang };
  const out = { ...a, shown_lang: locale };
  for (const f of TRANSLATABLE) if (tr[f]) out[f] = tr[f];
  return out;
}

/** Значения для формы редактирования, включая поля переводов tr_<язык>_<поле>. */
export function agentFormValues(a) {
  const v = { ...a, languages: agentLanguages(a) };
  for (const [lang, tr] of Object.entries(parseI18n(a))) for (const f of TRANSLATABLE) v[`tr_${lang}_${f}`] = tr[f] || '';
  return v;
}

const STOP = new Set(['на', 'и', 'в', 'во', 'с', 'со', 'к', 'по', 'для', 'из', 'от', 'до', 'за', 'о', 'об', 'что', 'как',
  'мне', 'мой', 'моя', 'мои', 'это', 'а', 'но', 'или', 'не', 'the', 'a', 'an', 'of', 'to', 'for', 'and', 'in', 'on',
  'my', 'me', 'i', 'is', 'it', 'with', 'how', 'what', 'can', 'do', 'from', 'by', 'at', 'be']);

/**
 * Превращает запрос в FTS5-запрос. Окончания русских и английских слов грубо обрезаются,
 * чтобы «договора» находили «договор», а «taxes» — «tax». Временное решение до поиска по смыслу.
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
      } else if (/^[a-z]+$/.test(w) && w.length >= 5) {
        const stem = w.replace(/(ations?|ings?|ers?|ies|es|ed|s)$/, '');
        if (stem.length >= 3) w = stem;
      }
      return `"${w.replace(/"/g, '')}"*`;
    });
  return words.length ? [...new Set(words)].join(' OR ') : null;
}

/**
 * Кандидаты для каталога (только активные агенты). rank — релевантность bm25 (меньше = лучше)
 * или null без запроса. Итоговую сортировку с учётом индекса доверия делает catalog.js.
 */
export function searchAgents(db, { q = '', category = '', lang = '', limit = 200 } = {}) {
  const since = Date.now() - 30 * 86400_000;
  const fts = buildFtsQuery(q);
  const params = [since];
  let sql = `
    SELECT a.*, u.username AS owner_username, u.display_name AS owner_name, u.is_system AS owner_is_system,
      (SELECT COUNT(*) FROM tasks t WHERE t.agent_id = a.id AND t.status = 'ok' AND t.self_test = 0 AND t.created_at >= ?) AS ok30,
      ${fts ? 'f.rank' : 'NULL'} AS rank
    FROM agents a JOIN users u ON u.id = a.owner_id`;
  if (fts) {
    sql += ` JOIN (SELECT rowid, bm25(agents_fts, 10.0, 5.0, 1.0, 3.0, 4.0) AS rank FROM agents_fts WHERE agents_fts MATCH ?) f ON f.rowid = a.id`;
    params.push(fts);
  }
  sql += ` WHERE a.status = 'active'`;
  if (category) { sql += ' AND a.category = ?'; params.push(category); }
  if (lang) { sql += ` AND (',' || a.languages || ',') LIKE ?`; params.push(`%,${lang},%`); }
  sql += fts ? ' ORDER BY f.rank ASC' : ' ORDER BY ok30 DESC, a.created_at DESC';
  sql += ' LIMIT ?';
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
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
export function agentCard(a, passport, baseUrl) {
  const s = passport.stats;
  return {
    schema: 'agora.agent-card/v1',
    name: a.name,
    id: `${a.owner_username}/${a.slug}`,
    version: a.version,
    description: a.tagline,
    long_description: a.description,
    category: a.category,
    tags: agentTags(a),
    languages: agentLanguages(a),
    region: a.region,
    listing_language: a.primary_lang,
    translations: Object.fromEntries(Object.entries(parseI18n(a)).map(([l, tr]) => [l, { name: tr.name, description: tr.tagline }])),
    owner: { username: a.owner_username, display_name: a.owner_name, verified: false },
    status: a.status,
    url: `${baseUrl}${agentPath(a)}`,
    invoke: {
      url: `${baseUrl}/api/v1/agents/${a.owner_username}/${a.slug}/invoke`,
      method: 'POST',
      auth: 'bearer',
      input: { type: 'text', hint: a.input_hint || null, max_chars: 10000 },
      output: { type: 'text+json' },
      locale: 'pass "locale" in the request body to ask the agent to answer in that language',
    },
    pricing: { note: a.price_note || null },
    trust: {
      trust_index: passport.index,
      level: passport.level,
      eligible: passport.eligible,
      components: passport.components,
      exam: passport.exam,
      reviews: passport.reviews,
      tasks_total: s.total,
      window_days: 30,
      tasks_30d: s.total30,
      distinct_buyers_30d: s.buyers,
      success_rate_30d: s.successRate,
      availability_30d: s.availability,
      median_latency_ms_30d: s.medianLatency,
      repeat_buyers_30d: s.repeatBuyers,
      agent_buyers_share_30d: s.agentShare,
      method: `${baseUrl}/docs#trust`,
    },
  };
}
