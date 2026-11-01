// Отзывы. Оставить можно только после реальной задачи агенту (не своему).
// Человек отзывается через сайт (задачи канала web), агент — через API (задачи канала api).

import { HttpError } from './gateway.js';

const channelFor = (authorType) => (authorType === 'agent' ? 'api' : 'web');

/** Сколько реальных задач автор поставил агенту через свой канал. */
export function authorTaskCount(db, agentId, authorId, authorType) {
  return db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE agent_id = ? AND buyer_id = ? AND channel = ? AND self_test = 0')
    .get(agentId, authorId, channelFor(authorType)).n;
}

/** Можно ли пользователю оставить отзыв: { ok, reason } где reason: own_agent | not_eligible. */
export function reviewEligibility(db, agent, user, authorType = 'human') {
  if (!user) return { ok: false, reason: 'not_eligible' };
  if (agent.owner_id === user.id) return { ok: false, reason: 'own_agent' };
  if (authorTaskCount(db, agent.id, user.id, authorType) < 1) return { ok: false, reason: 'not_eligible' };
  return { ok: true };
}

export function validateReview(input) {
  const rating = Number(input.rating);
  const text = String(input.text ?? '').trim().replace(/\r\n/g, '\n').slice(0, 1000);
  const errors = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = { code: 'rating' };
  return { errors, values: { rating, text } };
}

/** Создать или обновить отзыв. Бросает HttpError, если отзыв оставить нельзя. */
export function upsertReview(db, agent, user, authorType, { rating, text }) {
  const el = reviewEligibility(db, agent, user, authorType);
  if (!el.ok) throw new HttpError(403, el.reason);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'bad_rating');
  const now = Date.now();
  db.prepare(`
    INSERT INTO reviews (agent_id, author_id, author_type, rating, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (agent_id, author_id, author_type) DO UPDATE SET rating = excluded.rating, text = excluded.text, updated_at = excluded.updated_at`
  ).run(agent.id, user.id, authorType, rating, text, now, now);
}

export function getOwnReview(db, agentId, userId, authorType = 'human') {
  return db.prepare('SELECT * FROM reviews WHERE agent_id = ? AND author_id = ? AND author_type = ?').get(agentId, userId, authorType) || null;
}

export function listReviews(db, agentId, limit = 50) {
  return db.prepare(`
    SELECT r.*, u.username, u.display_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.agent_id = r.agent_id AND t.buyer_id = r.author_id AND t.self_test = 0
         AND t.channel = CASE r.author_type WHEN 'agent' THEN 'api' ELSE 'web' END) AS tasks
    FROM reviews r JOIN users u ON u.id = r.author_id
    WHERE r.agent_id = ? ORDER BY r.updated_at DESC LIMIT ?`
  ).all(agentId, limit);
}

export function reviewSummary(db, agentId) {
  const r = db.prepare('SELECT COUNT(*) AS n, SUM(rating) AS sum FROM reviews WHERE agent_id = ?').get(agentId);
  return { count: r.n, sum: r.sum || 0, average: r.n ? (r.sum || 0) / r.n : null };
}
