import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { startApp, browser, validAgent } from './helpers.js';
import { rmSync } from 'node:fs';
import { LOCALES, makeT, pickLocale } from '../src/i18n/index.js';
import { computeTrust, latencyFactor, levelOf, WEIGHTS } from '../src/trust.js';
import { openDb, MIGRATIONS, schemaVersion } from '../src/db.js';
import { runBuiltin } from '../src/builtins.js';

async function listen(server) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/agent`, close: () => new Promise((r) => server.close(r)) };
}

/** Агент, который отвечает по-разному: эхо, утечка всего запроса, выполнение команд из текста. */
function startAgent(behaviour) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const task = JSON.parse(raw || '{}');
      seen.push({ task, headers: req.headers });
      const text = task.input?.text || '';
      let out = `ok: ${text.slice(0, 50)}`;
      if (behaviour === 'leaky') out = `debug: ${req.headers['x-agora-secret']} ${JSON.stringify(task.context)}`;
      if (behaviour === 'obedient') { const m = text.match(/(PWNED[A-Za-z0-9]+)/); if (m) out = m[1]; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ output: { text: out } }));
    });
  });
  return listen(server).then((l) => ({ ...l, seen }));
}

describe('i18n', () => {
  test('в словарях ru и en одинаковые ключи и формы множественного числа', () => {
    const ru = Object.keys(LOCALES.ru).sort(), en = Object.keys(LOCALES.en).sort();
    assert.deepEqual(ru.filter((k) => !en.includes(k)), [], 'есть в ru, нет в en');
    assert.deepEqual(en.filter((k) => !ru.includes(k)), [], 'есть в en, нет в ru');
    for (const [k, v] of Object.entries(LOCALES.ru)) if (typeof v === 'object') assert.ok(v.one && v.few && v.many, k);
    for (const [k, v] of Object.entries(LOCALES.en)) if (typeof v === 'object') assert.ok(v.one && v.other, k);
  });

  test('склонения и форматирование', () => {
    const ru = makeT('ru'), en = makeT('en');
    assert.equal(ru('card.tasks30', { n: 1 }), '1 задача за 30 дн.');
    assert.equal(ru('card.tasks30', { n: 3 }), '3 задачи за 30 дн.');
    assert.equal(ru('card.tasks30', { n: 11 }), '11 задач за 30 дн.');
    assert.equal(en('card.tasks30', { n: 1 }), '1 task in 30 days');
    assert.equal(en('card.tasks30', { n: 1500 }), '1,500 tasks in 30 days');
    assert.equal(ru.lang('ja'), 'японский');
    assert.equal(en.region('global'), 'All countries');
    assert.equal(en('no.such.key'), 'no.such.key');
  });

  test('выбор языка: cookie → Accept-Language → английский', () => {
    const req = (cookie, al) => ({ headers: { cookie, 'accept-language': al } });
    assert.equal(pickLocale(req('agora_lang=ru', 'en-US')), 'ru');
    assert.equal(pickLocale(req('', 'de-DE,de;q=0.9,ru;q=0.8,en;q=0.5')), 'ru');
    assert.equal(pickLocale(req('', 'ja')), 'en');
    assert.equal(pickLocale(req('agora_lang=xx', 'en')), 'en');
  });

  test('демо-агенты отвечают на языке покупателя', () => {
    assert.match(runBuiltin('text-stats', 'One two three.', { locale: 'en' }).text, /^Words: 3/);
    assert.match(runBuiltin('text-stats', 'Раз два три.', { locale: 'ru' }).text, /^Слов: 3/);
    assert.match(runBuiltin('npd-calc', 'company 1000', { locale: 'en' }).text, /6% tax = 60/);
  });
});

describe('сайт на двух языках', () => {
  let app, agent;
  before(async () => { app = await startApp(); agent = await startAgent('echo'); });
  after(async () => { await app.close(); await agent.close(); });

  test('язык по браузеру и переключатель', async () => {
    const en = browser(app.url, { lang: 'en-US' });
    const home = await en.get('/');
    assert.match(home.text, /<html lang="en">/);
    assert.match(home.text, /Find an/);
    assert.match(home.text, /Text analysis/, 'демо-агент показан с переводом');

    const sw = await en.get('/lang/ru?next=/docs');
    assert.equal(sw.location, '/docs');
    assert.match((await en.get('/')).text, /Найди/);
    assert.equal((await en.get('/lang/ru?next=//evil.example')).location, '/');
  });

  test('перевод карточки: англоязычный посетитель видит перевод, поиск находит по-английски', async () => {
    const b = browser(app.url);
    await b.register('polyglot');
    const res = await b.post('/publish', validAgent(agent.url, {
      slug: 'lease', name: 'Юрист по аренде', languages: ['ru', 'en'],
      tr_en_name: 'Lease lawyer', tr_en_tagline: 'Finds risky clauses in lease agreements',
      tr_en_description: 'Reads a lease agreement and explains risky clauses in plain words, with suggested edits.',
    }));
    assert.equal(res.location, '/me?ok=published');

    const enPage = await browser(app.url, { lang: 'en' }).get('/a/polyglot/lease');
    assert.match(enPage.text, /<h1>Lease lawyer<\/h1>/);
    const ruPage = await browser(app.url, { lang: 'ru' }).get('/a/polyglot/lease');
    assert.match(ruPage.text, /<h1>Юрист по аренде<\/h1>/);

    const found = await fetch(`${app.url}/api/v1/agents?q=lease+clauses&locale=en`).then((r) => r.json());
    assert.equal(found.agents[0].id, 'polyglot/lease');
    assert.equal(found.agents[0].name, 'Lease lawyer');
    assert.deepEqual(found.agents[0].languages, ['ru', 'en']);
  });

  test('неполный перевод отклоняется с понятной ошибкой', async () => {
    const b = browser(app.url, { lang: 'en' });
    await b.register('half_tr');
    const res = await b.post('/publish', validAgent(agent.url, { slug: 'half', tr_en_name: 'Only a name' }));
    assert.equal(res.status, 400);
    assert.match(res.text, /From 10 to 140 characters/);
  });

  test('фильтр по языку и предупреждение для чужого языка', async () => {
    const b = browser(app.url);
    await b.register('ru_only');
    await b.post('/publish', validAgent(agent.url, { slug: 'ru-only', name: 'Только русский агент' }));
    const all = await fetch(`${app.url}/api/v1/agents?q=${encodeURIComponent('только русский')}`).then((r) => r.json());
    assert.ok(all.agents.some((a) => a.id === 'ru_only/ru-only'));
    const enOnly = await fetch(`${app.url}/api/v1/agents?q=${encodeURIComponent('только русский')}&lang=en`).then((r) => r.json());
    assert.ok(!enOnly.agents.some((a) => a.id === 'ru_only/ru-only'));

    const page = await browser(app.url, { lang: 'en' }).get('/a/ru_only/ru-only');
    assert.match(page.text, /has not declared support for your language/);
  });

  test('язык покупателя передаётся агенту в context.locale', async () => {
    const owner = browser(app.url);
    await owner.register('loc_owner');
    await owner.post('/publish', validAgent(agent.url, { slug: 'loc', languages: ['ru', 'en'] }));
    const buyer = browser(app.url, { lang: 'en' });
    await buyer.register('loc_buyer');
    await buyer.post('/a/loc_owner/loc/try', { input: 'hello' });
    assert.equal(agent.seen.at(-1).task.context.locale, 'en');
  });
});

describe('паспорт доверия', () => {
  let app, agent;
  before(async () => { app = await startApp({ gateway: { hourlyLimitWeb: 1000 } }); agent = await startAgent('echo'); });
  after(async () => { await app.close(); await agent.close(); });

  const card = (path) => fetch(`${app.url}/a/${path}/agent.json`).then((r) => r.json());
  async function buyers(n, prefix) {
    const list = [];
    for (let i = 0; i < n; i++) { const b = browser(app.url); await b.register(`${prefix}${i}`); list.push(b); }
    return list;
  }

  test('формула: без экзамена максимум 70, сглаживание, уровни', () => {
    assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
    const perfect = { counted: 1000, ok: 1000, responded: 1000, buyers: 500, repeatCount: 500, medianLatency: 100 };
    const reviews = { count: 1000, sum: 5000 };
    assert.equal(computeTrust({ stats: perfect, reviews, exam: null }).raw, 70);
    assert.equal(computeTrust({ stats: perfect, reviews, exam: { quality_score: 1, safety_score: 1 } }).raw, 100);
    const lucky = { counted: 1, ok: 1, responded: 1, buyers: 1, repeatCount: 0, medianLatency: 100 };
    assert.ok(computeTrust({ stats: lucky, reviews: { count: 0, sum: 0 }, exam: null }).components.success < 0.6);
    assert.equal(latencyFactor(1000), 1);
    assert.equal(latencyFactor(30_000), 0.5);
    assert.deepEqual([90, 75, 55, 10, null].map(levelOf), ['high', 'good', 'medium', 'low', null]);
  });

  test('индекс появляется после 5 задач от 3 покупателей, один покупатель не накрутит', async () => {
    const owner = browser(app.url);
    await owner.register('trusty');
    await owner.post('/publish', validAgent(agent.url, { slug: 'trusty' }));

    const [b0, b1, b2] = await buyers(3, 'tb');
    for (let i = 0; i < 15; i++) await b0.post('/a/trusty/trusty/try', { input: `x${i}` });
    let c = await card('trusty/trusty');
    assert.equal(c.trust.trust_index, null, 'один покупатель — индекса нет');
    assert.equal(c.trust.tasks_30d, 15);
    assert.equal(c.trust.distinct_buyers_30d, 1);

    await b1.post('/a/trusty/trusty/try', { input: 'y' });
    await b2.post('/a/trusty/trusty/try', { input: 'z' });
    c = await card('trusty/trusty');
    assert.equal(c.trust.eligible, true);
    assert.ok(c.trust.trust_index > 30 && c.trust.trust_index <= 70, `индекс ${c.trust.trust_index}`);
    assert.equal(c.trust.exam.state, 'none');
    const page = await browser(app.url).get('/a/trusty/trusty');
    assert.match(page.text, /Без экзамена Agora индекс не поднимется выше 70/);
  });

  test('экзамен: честный агент сдаёт, индекс растёт; смена эндпоинта сбрасывает экзамен', async () => {
    const owner = browser(app.url);
    await owner.register('examinee');
    await owner.post('/publish', validAgent(agent.url, { slug: 'good' }));
    const [b0, b1, b2] = await buyers(3, 'eb');
    for (const b of [b0, b1, b2]) { await b.post('/a/examinee/good/try', { input: 'a' }); await b.post('/a/examinee/good/try', { input: 'b' }); }
    const before = (await card('examinee/good')).trust.trust_index;

    const id = app.db.prepare(`SELECT id FROM agents WHERE slug = 'good'`).get().id;
    await owner.post(`/me/agents/${id}/exam`);
    await app.settle();
    const page = await owner.get(`/me/agents/${id}/exam`);
    assert.match(page.text, /Не раскрывает свой секрет/);
    const after = await card('examinee/good');
    assert.equal(after.trust.exam.state, 'valid');
    assert.equal(after.trust.exam.quality, 1);
    assert.equal(after.trust.exam.safety, 1);
    assert.ok(after.trust.trust_index >= before + 25, `${before} → ${after.trust.trust_index}`);

    // Повторный запуск сразу — запрещён (кулдаун)
    await owner.post(`/me/agents/${id}/exam`);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM exams WHERE agent_id = ?').get(id).n, 1);

    // Новый эндпоинт → экзамен устарел
    const other = await startAgent('echo');
    const form = await owner.get(`/me/agents/${id}/edit`);
    assert.equal(form.status, 200);
    await owner.post(`/me/agents/${id}/edit`, validAgent(other.url, { slug: 'good' }));
    assert.equal((await card('examinee/good')).trust.exam.state, 'outdated');
    await other.close();
  });

  test('экзамен ловит утечку секрета, контекста и выполнение чужой команды', async () => {
    const leaky = await startAgent('leaky');
    const obedient = await startAgent('obedient');
    const owner = browser(app.url);
    await owner.register('badagents');
    await owner.post('/publish', validAgent(leaky.url, { slug: 'leaky' }));
    await owner.post('/publish', validAgent(obedient.url, { slug: 'obedient' }));
    for (const slug of ['leaky', 'obedient']) {
      const id = app.db.prepare('SELECT id FROM agents WHERE slug = ?').get(slug).id;
      await owner.post(`/me/agents/${id}/exam`);
    }
    await app.settle();
    const l = (await card('badagents/leaky')).trust.exam;
    assert.deepEqual(l.failed.sort(), ['confidential', 'secret']);
    assert.equal(l.quality, 1);
    const o = (await card('badagents/obedient')).trust.exam;
    assert.deepEqual(o.failed, ['injection']);
    // Экзамен не создаёт задач и не влияет на статистику
    assert.equal((await card('badagents/leaky')).trust.tasks_total, 0);
    await leaky.close(); await obedient.close();
  });

  test('отзывы: только после задачи, не на своего агента, агент может оставить через API', async () => {
    const owner = browser(app.url);
    await owner.register('reviewed');
    await owner.post('/publish', validAgent(agent.url, { slug: 'rev' }));

    const own = await owner.post('/a/reviewed/rev/review', { rating: '5', text: 'я молодец' });
    assert.equal(own.status, 403);

    const buyer = browser(app.url);
    await buyer.register('reviewer');
    assert.match((await buyer.get('/a/reviewed/rev')).text, /сначала поставьте агенту задачу/);
    assert.equal((await buyer.post('/a/reviewed/rev/review', { rating: '4' })).status, 403);

    await buyer.post('/a/reviewed/rev/try', { input: 'test' });
    assert.equal((await buyer.post('/a/reviewed/rev/review', { rating: '9' })).status, 400);
    const ok = await buyer.post('/a/reviewed/rev/review', { rating: '4', text: 'Быстро и <b>по делу</b>' });
    assert.equal(ok.location, '/a/reviewed/rev?review=saved#reviews');
    await buyer.post('/a/reviewed/rev/review', { rating: '5', text: 'Обновил' });
    const page = await buyer.get('/a/reviewed/rev?review=saved');
    assert.match(page.text, /Обновил/);
    assert.match(page.text, /✓ 1 задача/);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n, 1, 'один отзыв на автора');

    // Агент-клиент через API
    const keyPage = await buyer.post('/me/keys', { name: 'bot' });
    const key = keyPage.text.match(/ag_live_[A-Za-z0-9_-]+/)[0];
    const call = (path, body) => fetch(`${app.url}/api/v1/agents/reviewed/rev/${path}`, {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'accept-language': 'en' }, body: JSON.stringify(body),
    });
    const denied = await call('review', { rating: 5 });
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).message, /only review an agent after giving it a task/);
    await call('invoke', { input: 'hi', locale: 'en' });
    assert.equal((await call('review', { rating: 5, text: 'stable JSON' })).status, 200);
    const c = await card('reviewed/rev');
    assert.equal(c.trust.reviews.count, 2);
    assert.equal(c.trust.reviews.average, 5);
    assert.match((await browser(app.url).get('/a/reviewed/rev')).text, /агент-клиент/);
  });

  test('каталог сортирует по индексу доверия', async () => {
    const res = await fetch(`${app.url}/api/v1/agents?limit=100`).then((r) => r.json());
    const idx = res.agents.map((a) => a.trust_index ?? -1);
    assert.deepEqual(idx, [...idx].sort((a, b) => b - a));
  });
});

describe('миграции', () => {
  test('база этапа 1 обновляется без потери данных', () => {
    const path = `/tmp/agora-migrate-${process.pid}.db`;
    const old = new DatabaseSync(path);
    old.exec(MIGRATIONS[0]);
    old.exec(`INSERT INTO users (username, display_name, password_hash, created_at) VALUES ('u', 'U', 'x', 1);
      INSERT INTO agents (owner_id, slug, name, tagline, description, category, endpoint, secret, created_at, updated_at)
      VALUES (1, 'tax', 'Налоговый помощник', 'tagline here', 'description long enough', 'finance', 'https://x', 's', 1, 1);`);
    old.close();
    const db = openDb(path);
    assert.equal(schemaVersion(db), MIGRATIONS.length);
    const a = db.prepare('SELECT * FROM agents').get();
    assert.equal(a.languages, 'ru');
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM agents_fts WHERE agents_fts MATCH 'налог*'`).get().n, 1);
    db.close();
    const again = openDb(path); // повторное открытие ничего не ломает
    assert.equal(schemaVersion(again), MIGRATIONS.length);
    again.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  });
});

