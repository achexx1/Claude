// HTTP-сервер агента по протоколу agora/v0.
//   POST /agent   — задача от Agora: { protocol, task_id, input: { text }, context: { locale, ... } }
//   GET  /health  — проверка, что агент жив
// Отвечает { "output": { "text": "...", "data": {...} } }.

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { answerTask, buildSystemPrompt, safeLocale, Anthropic } from './claude.js';

const MAX_BODY = 1024 * 1024;
const MAX_TASK_CHARS = 20_000;

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function secretOk(config, sent) {
  if (!config.secret) return config.allowNoSecret;
  const a = Buffer.from(String(sent || '')), b = Buffer.from(config.secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Ошибка Claude API → HTTP-ответ агента. Agora засчитает его как ошибку, поэтому важно понятно логировать причину. */
function apiErrorResponse(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return [500, 'claude_auth', 'Claude API отклонил ключ: проверьте ANTHROPIC_API_KEY'];
  }
  if (err instanceof Anthropic.RateLimitError) return [503, 'claude_rate_limited', 'Claude API: превышен лимит запросов'];
  if (err instanceof Anthropic.APIConnectionTimeoutError) return [504, 'claude_timeout', 'Claude API не ответил вовремя'];
  if (err instanceof Anthropic.APIConnectionError) return [502, 'claude_unreachable', 'нет связи с Claude API'];
  if (err instanceof Anthropic.BadRequestError) return [500, 'claude_bad_request', `Claude API: некорректный запрос: ${err.message}`];
  if (err instanceof Anthropic.APIError) return [502, 'claude_error', `Claude API: ошибка ${err.status}`];
  return [500, 'agent_error', err.message];
}

/**
 * Создаёт сервер. client — клиент Anthropic (в тестах можно подставить свой),
 * prompt/knowledge — содержимое prompt.md и папки knowledge/.
 */
export function createAgentServer({ config, client, prompt, knowledge, log = console }) {
  if (!config.secret && !config.allowNoSecret) {
    throw new Error('Не задан AGORA_SECRET. Скопируйте секрет агента из кабинета Agora (или ALLOW_NO_SECRET=1 для локальных опытов).');
  }
  const system = buildSystemPrompt(prompt, knowledge);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://agent');
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, model: config.model, knowledge_files: knowledge.length });
    }
    if (url.pathname !== '/agent') return send(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    if (!secretOk(config, req.headers['x-agora-secret'])) return send(res, 401, { error: 'bad_secret' });

    let task;
    try {
      task = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, err.status || 400, { error: err.status === 413 ? 'too_large' : 'bad_json' });
    }
    const text = task?.input?.text;
    if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'empty_task' });
    if (text.length > MAX_TASK_CHARS) return send(res, 400, { error: 'task_too_long' });
    // Берём из контекста только язык. Остальные служебные поля в Claude не передаём: модель не может раскрыть то, чего не видела.
    const locale = safeLocale(task?.context?.locale);

    const started = Date.now();
    try {
      const output = await answerTask(client, config, system, { text, locale });
      log.info?.(`task ${task.task_id || '?'} ok in ${Date.now() - started} ms (${locale})`);
      send(res, 200, { output });
    } catch (err) {
      const [status, code, message] = apiErrorResponse(err);
      // Содержимое задачи в лог не пишем: оно принадлежит покупателю
      log.error?.(`task ${task.task_id || '?'} failed: ${message}`);
      send(res, status, { error: code });
    }
  });
}
