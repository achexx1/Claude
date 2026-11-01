// Метрики паспорта доверия. Считаются только из задач, прошедших через шлюз Agora.

const DAY = 86400_000;

export function agentStats(db, agentId, now = Date.now()) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE agent_id = ? AND self_test = 0').get(agentId).n;
  const rows = db.prepare(
    'SELECT status, latency_ms, buyer_id, buyer_type FROM tasks WHERE agent_id = ? AND self_test = 0 AND created_at >= ?'
  ).all(agentId, now - 30 * DAY);

  const total30 = rows.length;
  if (total30 === 0) {
    return { total, total30, successRate: null, availability: null, medianLatency: null, repeatBuyers: null, agentShare: null };
  }

  const ok = rows.filter((r) => r.status === 'ok');
  // «Доступность»: агент вообще ответил (пусть даже ошибкой), а не упал по таймауту и не был недоступен
  const responded = rows.filter((r) => r.status === 'ok' || r.status === 'agent_error').length;

  const latencies = ok.map((r) => r.latency_ms).filter((x) => x != null).sort((a, b) => a - b);
  const medianLatency = latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null;

  const perBuyer = new Map();
  for (const r of rows) if (r.buyer_id != null) perBuyer.set(r.buyer_id, (perBuyer.get(r.buyer_id) || 0) + 1);
  const buyers = perBuyer.size;
  const repeat = [...perBuyer.values()].filter((n) => n >= 2).length;

  return {
    total,
    total30,
    successRate: ok.length / total30,
    availability: responded / total30,
    medianLatency,
    repeatBuyers: buyers ? repeat / buyers : null,
    agentShare: rows.filter((r) => r.buyer_type === 'agent').length / total30,
  };
}

/** Задачи по дням за последние N дней (для графика в кабинете). */
export function dailyTasks(db, agentIds, days = 14, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime() - (days - 1) * DAY;
  const buckets = Array.from({ length: days }, (_, i) => ({ day: from + i * DAY, n: 0 }));
  if (!agentIds.length) return buckets;
  const placeholders = agentIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT created_at FROM tasks WHERE agent_id IN (${placeholders}) AND self_test = 0 AND created_at >= ?`
  ).all(...agentIds, from);
  for (const r of rows) {
    const i = Math.floor((r.created_at - from) / DAY);
    if (i >= 0 && i < days) buckets[i].n++;
  }
  return buckets;
}

export function platformStats(db) {
  const t = db.prepare(`SELECT COUNT(*) AS n, SUM(status = 'ok') AS ok, SUM(buyer_type = 'agent') AS ag FROM tasks WHERE self_test = 0`).get();
  return { tasks: t.n || 0, okRate: t.n ? (t.ok || 0) / t.n : null, agentTasks: t.ag || 0 };
}

export const pct = (x) => (x == null ? '—' : `${(Math.round(x * 1000) / 10).toLocaleString('ru-RU')}%`);
export const ms = (x) => (x == null ? '—' : x < 1000 ? `${x} мс` : `${(x / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`);
