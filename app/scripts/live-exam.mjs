// Живой прогон экзамена с настоящим Claude API:
//   агент из templates/claude-agent (отвечает Claude) + Agora с моделью-судьёй (тоже Claude).
// Ничего не публикует наружу: всё работает локально, база в памяти.
//
//   ANTHROPIC_API_KEY=... node --disable-warning=ExperimentalWarning scripts/live-exam.mjs
//
// Печатает задачи судьи, ответы агента, оценки и примерную стоимость; полный отчёт сохраняет в data/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createUser } from '../src/auth.js';
import { createAgent, getOwnAgent } from '../src/agents.js';
import { startExam } from '../src/exam.js';
import { trustPassport } from '../src/trust.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Нужен ANTHROPIC_API_KEY в окружении.');
  process.exit(1);
}

// Цены Claude Opus 5.5 за 1 млн токенов (на ноябрь 2026): ввод $4, вывод $20, чтение кэша $0,20, запись в кэш ~$5
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const usage = {};
function trackingFetch(label) {
  usage[label] = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ms: 0 };
  return async (url, init) => {
    const started = Date.now();
    const res = await fetch(url, init);
    const u = usage[label];
    u.calls++;
    u.ms += Date.now() - started;
    try {
      const body = await res.clone().json();
      u.input += body.usage?.input_tokens || 0;
      u.output += body.usage?.output_tokens || 0;
      u.cacheRead += body.usage?.cache_read_input_tokens || 0;
      u.cacheWrite += body.usage?.cache_creation_input_tokens || 0;
    } catch { /* не JSON */ }
    return res;
  };
}
const cost = (u) => (u.input * PRICE.input + u.output * PRICE.output + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1e6;

// ---------- Агент из шаблона ----------
const TEMPLATE = fileURLToPath(new URL('../../templates/claude-agent/', import.meta.url));
const tpl = {
  config: await import(new URL('src/config.js', `file://${TEMPLATE}`)),
  server: await import(new URL('src/server.js', `file://${TEMPLATE}`)),
};
const agentConfig = tpl.config.loadConfig({ ...process.env, AGORA_SECRET: 'pending' }, TEMPLATE);
const agentServer = tpl.server.createAgentServer({
  config: agentConfig,
  client: new Anthropic({ fetch: trackingFetch('agent'), timeout: agentConfig.timeoutMs, maxRetries: 0 }),
  prompt: tpl.config.loadPrompt(agentConfig.promptPath),
  knowledge: tpl.config.loadKnowledge(agentConfig.knowledgeDir),
  log: {},
});
await new Promise((r) => agentServer.listen(0, '127.0.0.1', r));
const agentUrl = `http://127.0.0.1:${agentServer.address().port}/agent`;

// ---------- Agora с настоящим судьёй ----------
const config = { ...loadConfig({ ...process.env, AGORA_DEV_ENDPOINTS: '1' }), dbPath: ':memory:', seed: false };
config.judgeClient = new Anthropic({ fetch: trackingFetch('judge'), timeout: config.judge.timeoutMs, maxRetries: 2 });
const { db } = createApp(config);

const ownerId = createUser(db, { username: 'lex_lab', display_name: 'Lex Lab', password: 'password123' });
const id = createAgent(db, ownerId, {
  slug: 'arenda', icon: '⚖️', name: 'Помощник по договорам аренды', category: 'law', tags: 'аренда, договоры',
  tagline: 'Находит рискованные пункты в договоре аренды жилья и предлагает правки',
  description: 'Читает договор аренды квартиры (целиком или кусок) или вопрос о нём. Находит пункты, которые играют против арендатора: потеря залога, одностороннее повышение цены, доступ хозяина без предупреждения, штрафы, износ. Объясняет простыми словами и предлагает формулировки правок. В конце даёт итог: подписывать, подписывать после правок или нет. Не заменяет юриста.',
  input_hint: 'Вставьте пункт договора или вопрос', example_input: 'В договоре: «Залог не возвращается при досрочном выезде». Это нормально?',
  endpoint: agentUrl, price_note: '', version: '1.0', primary_lang: 'ru', languages: ['ru', 'en'], region: 'RU', i18n: {}, i18n_text: '',
});
const agent = getOwnAgent(db, id, ownerId);
agentConfig.secret = agent.secret; // секрет из «кабинета» Agora

console.log(`Модели: агент ${agentConfig.model} (effort ${agentConfig.effort}), судья ${config.judge.model} (effort ${config.judge.effort})`);
console.log('Экзамен идёт: 9 технических задач + 4 задачи от судьи. Обычно это несколько минут...\n');
const started = Date.now();
await startExam(db, config, agent).done;
const exam = db.prepare('SELECT * FROM exams WHERE agent_id = ?').get(id);
const results = JSON.parse(exam.results);
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

console.log(`Статус: ${exam.status}, проверка по существу: ${exam.substance_status}, время: ${Math.round((Date.now() - started) / 1000)} с`);
console.log(`По существу ${pct(exam.substance_score)} · надёжность ${pct(exam.quality_score)} · безопасность ${pct(exam.safety_score)}\n`);

for (const r of results.filter((x) => x.group === 'substance')) {
  console.log(`── ${r.id} · ${r.task.kind} · ${r.task.language} · оценка ${pct(r.score)} ${r.pass ? '✓' : '✗'}`);
  console.log(`Задача: ${r.task.text}`);
  if (r.answer) console.log(`Ответ агента: ${r.answer.slice(0, 700)}${r.answer.length > 700 ? '…' : ''}`);
  if (r.grade) {
    for (const c of r.grade.criteria) console.log(`  ${c.met ? '✓' : '✗'} ${c.criterion} — ${c.comment}`);
    console.log(`Судья: ${r.grade.summary}`);
  } else if (r.detail) console.log(`Ошибка: ${JSON.stringify(r.detail)}`);
  console.log('');
}
console.log('Технические проверки:');
for (const r of results.filter((x) => x.group !== 'substance')) console.log(`  ${r.pass ? '✓' : '✗'} ${r.group}/${r.id}${r.detail ? ` ${JSON.stringify(r.detail)}` : ''}`);

const p = trustPassport(db, agent);
console.log(`\nКомпонент «Экзамен» в индексе: ${pct(p.components.exam)}, «Безопасность»: ${pct(p.components.safety)}`);

console.log('\nРасход Claude API (примерно):');
for (const [label, u] of Object.entries(usage)) {
  console.log(`  ${label === 'agent' ? 'агент' : 'судья'}: ${u.calls} запросов, ввод ${u.input}, вывод ${u.output}, кэш: чтение ${u.cacheRead} / запись ${u.cacheWrite} токенов, ~$${cost(u).toFixed(3)}, в среднем ${u.calls ? Math.round(u.ms / u.calls / 100) / 10 : 0} с на запрос`);
}
console.log(`  всего: ~$${(cost(usage.agent) + cost(usage.judge)).toFixed(3)}`);

const out = fileURLToPath(new URL('../data/', import.meta.url));
mkdirSync(out, { recursive: true });
const file = `${out}live-exam-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ exam: { ...exam, results }, usage, models: { agent: agentConfig.model, judge: config.judge.model } }, null, 2));
console.log(`\nПолный отчёт: ${file}`);
agentServer.close();
