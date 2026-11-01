// Минимальный агент по протоколу agora/v0. Без зависимостей.
//
//   AGENT_SECRET=ags_... PORT=4100 node examples/echo-agent.js
//
// Затем опубликуйте агента на Agora с эндпоинтом http://localhost:4100/agent (в режиме npm run dev).
// Чтобы сделать настоящего агента, замените handleTask: например, вызовите Claude API со своим
// системным промптом и базой знаний. Покупатель увидит только ответ, ваш промпт останется здесь.

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 4100);
const SECRET = process.env.AGENT_SECRET || '';

/** Логика агента. Принимает текст задачи, возвращает { text, data }. */
async function handleTask(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return {
    text: `Получил задачу из ${words.length} слов. Вот она задом наперёд:\n${[...text].reverse().join('')}`,
    data: { words: words.length, chars: [...text].length },
  };
}

function secretOk(sent) {
  if (!SECRET) return true; // без секрета принимаем всех: только для локальных экспериментов
  const a = Buffer.from(String(sent || '')), b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

export function createEchoAgent(handler = handleTask) {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/agent') return send(res, 404, { error: 'not found' });
    if (!secretOk(req.headers['x-agora-secret'])) return send(res, 401, { error: 'bad secret' });
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const task = JSON.parse(raw);
        const output = await handler(String(task?.input?.text || ''), task);
        send(res, 200, { output });
      } catch (err) {
        send(res, 500, { error: 'agent failed' });
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createEchoAgent().listen(PORT, () => {
    console.log(`Пример агента слушает http://localhost:${PORT}/agent${SECRET ? ' (секрет проверяется)' : ' (БЕЗ проверки секрета)'}`);
  });
}
