// Шлюз Agora: все вызовы агентов проходят здесь.
// 1) проверяет вход и лимиты; 2) защищает от SSRF; 3) вызывает агента с таймаутом и лимитом размера ответа;
// 4) проверяет формат ответа; 5) записывает метаданные задачи (без содержимого) для паспорта доверия.

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { randomToken } from './auth.js';
import { runBuiltin } from './builtins.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- Защита от SSRF: агент не должен указывать на внутреннюю сеть ----------

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
]) blocked.addSubnet(addr, prefix, 'ipv6');

export function isBlockedAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) return blocked.check(ip, 'ipv4');
  if (v === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

function blockedError(host) {
  return Object.assign(new Error(`адрес ${host} ведёт во внутреннюю сеть`), { code: 'EBLOCKED' });
}

/** DNS-поиск, который отбрасывает внутренние адреса. Проверка на этапе соединения защищает от DNS rebinding. */
function safeLookup(allowPrivate) {
  return (hostname, options, cb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = allowPrivate ? addrs : addrs.filter((a) => !isBlockedAddress(a.address));
      if (!list.length) return cb(blockedError(hostname));
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

/**
 * POST JSON на внешний адрес. Без перехода по редиректам, с таймаутом и лимитом размера ответа.
 * Возвращает { status, body } или бросает ошибку с code: EBLOCKED | ETIMEOUT | ETOOBIG | сетевые коды.
 */
export function postJson(urlStr, payload, { headers = {}, timeoutMs = 30_000, maxBytes = 256 * 1024, allowPrivate = false } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch { return reject(Object.assign(new Error('некорректный адрес'), { code: 'EBADURL' })); }
    const lib = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
    if (!lib) return reject(Object.assign(new Error('неподдерживаемый протокол'), { code: 'EBADURL' }));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && net.isIP(host) && isBlockedAddress(host)) return reject(blockedError(host));

    const body = Buffer.from(JSON.stringify(payload));
    let settled = false;
    const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };

    const req = lib.request(url, {
      method: 'POST',
      lookup: safeLookup(allowPrivate),
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
        'user-agent': 'AgoraGateway/0.1',
        accept: 'application/json',
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          finish(reject, Object.assign(new Error('ответ агента слишком большой'), { code: 'ETOOBIG' }));
        } else chunks.push(c);
      });
      res.on('end', () => finish(resolve, { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) => finish(reject, e));
    });
    const timer = setTimeout(() => {
      req.destroy();
      finish(reject, Object.assign(new Error('агент не ответил вовремя'), { code: 'ETIMEOUT' }));
    }, timeoutMs);
    req.on('error', (e) => finish(reject, e));
    req.end(body);
  });
}

// ---------- Вызов агента ----------

const MAX_OUTPUT_CHARS = 50_000;

/** Проверка ответа агента по протоколу Agora v0: { "output": { "text": "...", "data": {...}? } } */
export function parseAgentResponse(status, bodyText) {
  if (status < 200 || status >= 300) return { error: `агент вернул HTTP ${status}` };
  let json;
  try { json = JSON.parse(bodyText); } catch { return { error: 'агент вернул не JSON' }; }
  const out = json?.output;
  if (!out || typeof out !== 'object' || typeof out.text !== 'string') {
    return { error: 'в ответе нет поля output.text (см. протокол в /docs)' };
  }
  if (out.text.length > MAX_OUTPUT_CHARS) return { error: 'output.text длиннее 50 000 символов' };
  const data = out.data && typeof out.data === 'object' ? out.data : null;
  return { output: { text: out.text, data } };
}

function recordTask(db, t) {
  db.prepare(`INSERT INTO tasks (id, agent_id, buyer_id, buyer_type, channel, status, latency_ms, error, self_test, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(t.id, t.agent_id, t.buyer_id, t.buyer_type, t.channel, t.status, t.latency_ms, t.error, t.self_test, t.created_at);
}

/**
 * Поставить задачу агенту.
 * buyer: пользователь-покупатель; channel: 'web' | 'api'.
 * Ошибки покупателя (пустой ввод, лимит) бросаются как HttpError и НЕ портят статистику агента.
 */
export async function invokeAgent(db, config, agent, { input, buyer, channel }) {
  const g = config.gateway;
  if (agent.status !== 'active') throw new HttpError(409, 'agent_paused', 'Агент сейчас на паузе');
  if (typeof input !== 'string' || !input.trim()) throw new HttpError(400, 'empty_input', 'Опишите задачу: поле input пустое');
  if (input.length > g.maxInputChars) throw new HttpError(400, 'input_too_long', `Задача длиннее ${g.maxInputChars} символов`);

  const limit = channel === 'api' ? g.hourlyLimitApi : g.hourlyLimitWeb;
  const used = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE buyer_id = ? AND channel = ? AND created_at >= ?')
    .get(buyer.id, channel, Date.now() - 3600_000).n;
  if (used >= limit) throw new HttpError(429, 'rate_limited', `Лимит ${limit} задач в час. Попробуйте позже.`);

  const task = {
    id: `tsk_${randomToken(12)}`,
    agent_id: agent.id,
    buyer_id: buyer.id,
    buyer_type: channel === 'api' ? 'agent' : 'human',
    channel,
    // Задачи владельца своему агенту выполняются, но не влияют на паспорт (защита от накрутки)
    self_test: buyer.id === agent.owner_id ? 1 : 0,
    created_at: Date.now(),
    status: 'ok',
    latency_ms: null,
    error: null,
  };

  const started = performance.now();
  let output = null;
  try {
    if (agent.endpoint.startsWith('builtin://')) {
      output = runBuiltin(agent.endpoint.slice('builtin://'.length), input);
    } else {
      const res = await postJson(agent.endpoint, {
        protocol: 'agora/v0',
        task_id: task.id,
        input: { text: input },
        context: { buyer_type: task.buyer_type, channel, agent: `${agent.owner_username}/${agent.slug}` },
      }, {
        headers: { 'x-agora-task-id': task.id, 'x-agora-secret': agent.secret },
        timeoutMs: g.timeoutMs,
        maxBytes: g.maxResponseBytes,
        allowPrivate: config.devEndpoints,
      });
      const parsed = parseAgentResponse(res.status, res.body);
      if (parsed.error) { task.status = 'agent_error'; task.error = parsed.error; } else output = parsed.output;
    }
  } catch (err) {
    if (err.code === 'ETIMEOUT') { task.status = 'timeout'; task.error = err.message; }
    else if (err.code === 'ETOOBIG') { task.status = 'agent_error'; task.error = err.message; }
    else if (err.code === 'EBLOCKED') { task.status = 'unreachable'; task.error = err.message; }
    else if (err.code) { task.status = 'unreachable'; task.error = `агент недоступен (${err.code})`; }
    else { task.status = 'agent_error'; task.error = 'внутренняя ошибка агента'; }
  }
  task.latency_ms = Math.round(performance.now() - started);
  recordTask(db, task);

  return {
    task_id: task.id,
    status: task.status,
    self_test: task.self_test === 1,
    latency_ms: task.latency_ms,
    output: task.status === 'ok' ? output : null,
    error: task.error,
  };
}
