// Демо для скриншотов: Agora с подменённой моделью-судьёй (без ключа Claude API) на порту 3457.
// Судья выдаёт заранее заготовленные задачи и оценки; агент отвечает заготовками.
//   node --disable-warning=ExperimentalWarning scripts/demo-judge.mjs
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';

const TASKS = [
  { text: 'В договоре написано: «Залог не возвращается при досрочном расторжении договора по любой причине». Я хочу съехать через 4 месяца из 12. Это законно? Что предложить хозяину?', kind: 'typical', criteria: ['Объясняет, чем пункт опасен', 'Предлагает конкретную формулировку правки', 'Не выдумывает статьи закона', 'Ответ на русском языке'] },
  { text: 'Проверьте пункт: «Наймодатель вправе посещать помещение в любое время без предварительного уведомления». Нормально ли это?', kind: 'typical', criteria: ['Указывает на риск для арендатора', 'Предлагает уведомление за 24 часа', 'Ответ на русском языке'] },
  { text: 'My lease says the landlord can raise the rent at any time "at their discretion". Is this a red flag and how should I rephrase it?', kind: 'typical', criteria: ['Explains why the clause is risky', 'Suggests a cap and notice period', 'Answer is in English'] },
  { text: 'Посчитайте, сколько я заплачу налога, если сдаю квартиру за 40 000 ₽ в месяц.', kind: 'edge', criteria: ['Честно говорит, что расчёт налога — не его профиль', 'Не выдумывает точную сумму', 'Подсказывает, куда обратиться', 'Ответ на русском языке'] },
];
const ANSWERS = [
  '⚠️ Пункт рискованный: вы теряете весь залог, даже если оставите квартиру в идеальном состоянии.\n\nПредложите формулировку: «Обеспечительный платёж возвращается Нанимателю в течение 5 дней после подписания акта возврата за вычетом документально подтверждённого ущерба».\n\nЕщё добавьте срок уведомления о выезде: 30 дней.',
  'Это плохой пункт: хозяин сможет приходить без предупреждения.\n\nПравка: «Посещение — по согласованию с Нанимателем, с уведомлением не менее чем за 24 часа, кроме аварийных ситуаций».',
  'Yes, this is a red flag: the landlord could raise the rent at any moment.\n\nSuggested wording: "The rent may be changed no more than once every 12 months, by no more than 10%, with 30 days written notice."',
  'Расчёт налогов не входит в мою специализацию: я проверяю договоры аренды. Для расчёта налога с аренды загляните к агенту по налогам или к бухгалтеру. Если хотите, проверю сам договор.',
];
const GRADES = [
  { overall: 9, met: [true, true, true, true], summary: 'Точно находит риск и даёт готовую формулировку. Можно добавить, что залог по закону — не штраф.' },
  { overall: 8, met: [true, true, true], summary: 'Правильный вывод и правка, но мало объяснений, почему это важно.' },
  { overall: 9, met: [true, true, true], summary: 'Clear answer in English with a concrete cap and notice period.' },
  { overall: 7, met: [true, true, false, true], summary: 'Честно отказался считать налог, но не подсказал, куда обратиться (самозанятость, НДФЛ).' },
];

let graded = 0;
const fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  let payload;
  if (body.system.includes('You design exam tasks')) payload = { tasks: TASKS };
  else {
    const g = GRADES[graded++ % GRADES.length];
    const task = TASKS[(graded - 1) % TASKS.length];
    payload = { overall: g.overall, summary: g.summary, criteria: task.criteria.map((c, i) => ({ criterion: c, met: g.met[i], comment: g.met[i] ? 'Выполнено.' : 'Не выполнено.' })) };
  }
  return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(payload) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
};

let answered = 0;
const agent = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const text = JSON.parse(raw).input.text;
    const i = TASKS.findIndex((t) => t.text === text);
    const out = i >= 0 ? ANSWERS[i] : `Разобрал задачу (${++answered}).`;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ output: { text: out } }));
  });
}).listen(4300);

const config = { ...loadConfig({ AGORA_DEV_ENDPOINTS: '1', PORT: '3457' }), dbPath: '/tmp/agora-judge-demo.db' };
config.judgeClient = new Anthropic({ apiKey: 'demo', fetch, maxRetries: 0 });
config.judge.enabled = true;
const { app } = createApp(config);
app.listen(3457, () => console.log('demo on http://localhost:3457, agent on http://localhost:4300/agent'));
