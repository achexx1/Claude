// Метрики паспорта доверия. Считаются только из задач, прошедших через шлюз Agora.
// Задачи владельца своему агенту (self_test) не учитываются.

const DAY = 86400_000;
/** Сколько задач одного покупателя учитывается в метриках за 30 дней: защита от накрутки одним аккаунтом. */
export const PER_BUYER_CAP = 10;

export function agentStats(db, agentId, now = Date.now()) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE agent_id = ? AND self_test = 0').get(agentId).n;
  const all = db.prepare(
    `SELECT status, latency_ms, buyer_id, buyer_type FROM tasks
     WHERE agent_id = ? AND self_test = 0 AND created_at >= ? ORDER BY created_at DESC`
  ).all(agentId, now - 30 * DAY);

  // Не больше PER_BUYER_CAP последних задач от каждого покупателя
  const perBuyer = new Map();
  const rows = [];
  for (const r of all) {
    const key = r.buyer_id ?? 'deleted';
    const n = (perBuyer.get(key) || 0) + 1;
    perBuyer.set(key, n);
    if (n <= PER_BUYER_CAP) rows.push(r);
  }
  const buyers = [...perBuyer.keys()].filter((k) => k !== 'deleted').length;
  const repeatCount = [...perBuyer.entries()].filter(([k, n]) => k !== 'deleted' && n >= 2).length;

  const total30 = all.length;
  const counted = rows.length;
  if (counted === 0) {
    return { total, total30, counted, buyers: 0, repeatCount: 0, ok: 0, responded: 0, successRate: null, availability: null, medianLatency: null, repeatBuyers: null, agentShare: null };
  }

  const ok = rows.filter((r) => r.status === 'ok');
  // «Доступность»: агент вообще ответил (пусть даже ошибкой), а не упал по таймауту и не был недоступен
  const responded = rows.filter((r) => r.status === 'ok' || r.status === 'agent_error').length;
  const latencies = ok.map((r) => r.latency_ms).filter((x) => x != null).sort((a, b) => a - b);

  return {
    total,
    total30,
    counted,
    buyers,
    repeatCount,
    ok: ok.length,
    responded,
    successRate: ok.length / counted,
    availability: responded / counted,
    medianLatency: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    repeatBuyers: buyers ? repeatCount / buyers : null,
    agentShare: rows.filter((r) => r.buyer_type === 'agent').length / counted,
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
