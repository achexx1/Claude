import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, browser, validAgent } from './helpers.js';
import { createEchoAgent } from '../examples/echo-agent.js';

/** Внешний агент для тестов: ведёт себя по-разному в зависимости от текста задачи. */
async function startTestAgent() {
  const seen = [];
  const server = createEchoAgent(async (text, task) => {
    seen.push(task);
    if (text === 'boom') throw new Error('fail');
    if (text === 'slow') await new Promise((r) => setTimeout(r, 1500));
    return { text: [...text].reverse().join(''), data: { n: text.length } };
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/agent`, seen, close: () => new Promise((r) => server.close(r)) };
}

describe('Agora, этап 1', () => {
  let app, agent;
  before(async () => {
    app = await startApp({ gateway: { timeoutMs: 800, hourlyLimitWeb: 1000 } });
    agent = await startTestAgent();
  });
  after(async () => { await app.close(); await agent.close(); });

  test('главная показывает демо-агентов', async () => {
    const b = browser(app.url);
    const res = await b.get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /Анализ текста/);
    assert.match(res.text, /Налог самозанятого/);
    assert.match(res.headers.get('content-security-policy'), /script-src 'none'/);
  });

  test('поиск понимает разные формы слова', async () => {
    const b = browser(app.url);
    const res = await b.get('/?q=' + encodeURIComponent('налоги самозанятым'));
    assert.match(res.text, /Налог самозанятого/);
    assert.doesNotMatch(res.text, /Транслитерация для загранпаспорта/);

    const api = await fetch(`${app.url}/api/v1/agents?q=${encodeURIComponent('загранпаспорт')}`).then((r) => r.json());
    assert.equal(api.agents[0].id, 'agora/translit-pasport');
  });

  test('регистрация, вход и выход', async () => {
    const b = browser(app.url);
    const reg = await b.register('alice');
    assert.equal(reg.status, 303);
    assert.equal(reg.location, '/me');
    assert.match((await b.get('/me')).text, /Привет, alice/);

    const dup = await browser(app.url).register('ALICE');
    assert.equal(dup.status, 400);
    assert.match(dup.text, /уже занят/);

    await b.post('/logout');
    assert.equal((await b.get('/me')).status, 303);

    const bad = await b.post('/login', { username: 'alice', password: 'wrong-pass' });
    assert.equal(bad.status, 401);
    const ok = await b.post('/login', { username: 'alice', password: 'password123', next: '/publish' });
    assert.equal(ok.location, '/publish');
  });

  test('в системный аккаунт @agora войти нельзя, а next не уводит на чужой сайт', async () => {
    const b = browser(app.url);
    await b.register('bob');
    const r = await b.post('/login', { username: 'bob', password: 'password123', next: '//evil.example' });
    assert.equal(r.location, '/me');
    const sys = await browser(app.url).post('/login', { username: 'agora', password: '' });
    assert.equal(sys.status, 401);
  });

  test('POST без CSRF-токена отклоняется', async () => {
    const b = browser(app.url);
    await b.register('carol');
    const r = await b.post('/publish', validAgent(agent.url), { withCsrf: false });
    assert.equal(r.status, 403);
  });

  test('публикация: проверка полей и экранирование HTML', async () => {
    const b = browser(app.url);
    await b.register('dave');
    const bad = await b.post('/publish', validAgent('ftp://x', { name: 'x', category: 'nope' }));
    assert.equal(bad.status, 400);
    assert.match(bad.text, /Некорректный адрес|http/);
    assert.match(bad.text, /Выберите категорию/);

    const ok = await b.post('/publish', validAgent(agent.url, { name: '<script>alert(1)</script> агент', slug: 'xss-agent' }));
    assert.equal(ok.location, '/me?ok=published');
    const page = await b.get('/a/dave/xss-agent');
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /<script>alert/);
    assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt; агент/);

    const dup = await b.post('/publish', validAgent(agent.url, { slug: 'xss-agent' }));
    assert.match(dup.text, /уже есть агент с таким адресом/);
  });

  test('обычный пользователь не может указать builtin:// эндпоинт', async () => {
    const b = browser(app.url);
    await b.register('mallory');
    const r = await b.post('/publish', validAgent('builtin://npd-calc'));
    assert.equal(r.status, 400);
  });

  test('«Попробовать»: задача доходит до внешнего агента, метрики обновляются', async () => {
    const b = browser(app.url);
    await b.register('erin');
    await b.post('/publish', validAgent(agent.url, { slug: 'reverser' }));

    const anon = await browser(app.url).post('/a/erin/reverser/try', { input: 'hi' });
    assert.equal(anon.status, 303);
    assert.match(anon.location, /^\/login/);

    const buyer = browser(app.url);
    await buyer.register('erin_buyer');
    const res = await buyer.post('/a/erin/reverser/try', { input: 'абв' });
    assert.equal(res.status, 200);
    assert.match(res.text, /вба/);

    const task = agent.seen.at(-1);
    assert.equal(task.protocol, 'agora/v0');
    assert.equal(task.input.text, 'абв');
    assert.equal(task.context.buyer_type, 'human');

    const card = await fetch(`${app.url}/a/erin/reverser/agent.json`).then((r) => r.json());
    assert.equal(card.trust.tasks_total, 1);
    assert.equal(card.trust.success_rate_30d, 1);
    // Содержимое задач не хранится
    const row = app.db.prepare(`SELECT * FROM tasks WHERE agent_id = (SELECT id FROM agents WHERE slug = 'reverser')`).get();
    assert.ok(!Object.values(row).includes('абв'));
  });

  test('ошибки агента и таймауты засчитываются в паспорт', async () => {
    const b = browser(app.url);
    await b.register('frank');
    await b.post('/publish', validAgent(agent.url, { slug: 'flaky' }));
    const buyer = browser(app.url);
    await buyer.register('frank_buyer');
    assert.match((await buyer.post('/a/frank/flaky/try', { input: 'boom' })).text, /HTTP 500/);
    assert.match((await buyer.post('/a/frank/flaky/try', { input: 'slow' })).text, /не ответил вовремя/);
    await buyer.post('/a/frank/flaky/try', { input: 'ok' });

    const card = await fetch(`${app.url}/a/frank/flaky/agent.json`).then((r) => r.json());
    assert.equal(card.trust.tasks_30d, 3);
    assert.equal(Math.round(card.trust.success_rate_30d * 100), 33);
    assert.equal(Math.round(card.trust.availability_30d * 100), 67);
  });

  test('создатель не может накрутить паспорт своему агенту', async () => {
    const b = browser(app.url);
    await b.register('cheater');
    await b.post('/publish', validAgent(agent.url, { slug: 'self-boost' }));
    const res = await b.post('/a/cheater/self-boost/try', { input: 'накрутка' });
    assert.match(res.text, /тестовые задачи не влияют на паспорт/);
    await b.post('/a/cheater/self-boost/try', { input: 'ещё' });
    const card = await fetch(`${app.url}/a/cheater/self-boost/agent.json`).then((r) => r.json());
    assert.equal(card.trust.tasks_total, 0);
    assert.equal(app.db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE self_test = 1 AND agent_id = (SELECT id FROM agents WHERE slug = 'self-boost')`).get().n, 2);
  });

  test('пустая задача не портит статистику агента', async () => {
    const b = browser(app.url);
    await b.register('gina');
    const r = await b.post('/a/agora/analiz-teksta/try', { input: '   ' });
    assert.equal(r.status, 400);
    const card = await fetch(`${app.url}/a/agora/analiz-teksta/agent.json`).then((x) => x.json());
    assert.equal(card.trust.tasks_total, 0);
  });

  test('API: ключ, вызов демо-агента, отзыв ключа', async () => {
    const b = browser(app.url);
    await b.register('henry');
    const page = await b.post('/me/keys', { name: 'мой агент' });
    const key = page.text.match(/ag_live_[A-Za-z0-9_-]+/)[0];
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE key_hash = ?').get(key).n, 0, 'ключ хранится только как хэш');

    const call = (k, body) => fetch(`${app.url}/api/v1/agents/agora/npd-kalkuliator/invoke`, {
      method: 'POST', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const ok = await call(key, { input: 'физ 50 000\nюр 20 000' });
    assert.equal(ok.status, 200);
    const json = await ok.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.output.data.tax, 3200);

    assert.equal((await call('ag_live_wrong', { input: 'x' })).status, 401);
    assert.equal((await call(key, { input: '' })).status, 400);

    const card = await fetch(`${app.url}/api/v1/agents/agora/npd-kalkuliator`).then((r) => r.json());
    assert.equal(card.trust.agent_buyers_share_30d, 1);

    const keyId = app.db.prepare('SELECT id FROM api_keys ORDER BY id DESC LIMIT 1').get().id;
    await b.post(`/me/keys/${keyId}/revoke`);
    assert.equal((await call(key, { input: 'физ 1' })).status, 401);
  });

  test('пауза: агент скрыт из каталога и не принимает задачи', async () => {
    const b = browser(app.url);
    await b.register('ivy');
    await b.post('/publish', validAgent(agent.url, { slug: 'sleepy', name: 'Сонный уникальный агент' }));
    const id = app.db.prepare(`SELECT id FROM agents WHERE slug = 'sleepy'`).get().id;
    await b.post(`/me/agents/${id}/pause`);

    assert.doesNotMatch((await browser(app.url).get('/?q=' + encodeURIComponent('сонный'))).text, /Сонный уникальный агент/);
    assert.equal((await browser(app.url).get('/a/ivy/sleepy')).status, 404);
    assert.equal((await b.get('/a/ivy/sleepy')).status, 200, 'владелец видит своего агента');
    assert.equal((await b.post('/a/ivy/sleepy/try', { input: 'x' })).status, 409);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE agent_id = ?').get(id).n, 0);
  });

  test('чужого агента нельзя изменить или удалить', async () => {
    const owner = browser(app.url);
    await owner.register('jack');
    await owner.post('/publish', validAgent(agent.url, { slug: 'mine' }));
    const id = app.db.prepare(`SELECT id FROM agents WHERE slug = 'mine'`).get().id;

    const other = browser(app.url);
    await other.register('kate');
    assert.equal((await other.post(`/me/agents/${id}/delete`)).status, 404);
    assert.equal((await other.get(`/me/agents/${id}/edit`)).status, 404);
    assert.ok(app.db.prepare('SELECT 1 FROM agents WHERE id = ?').get(id));
  });
});

describe('лимиты', () => {
  test('лимит задач в час на покупателя', async () => {
    const app = await startApp({ gateway: { hourlyLimitWeb: 2 } });
    try {
      const b = browser(app.url);
      await b.register('limit_user');
      for (let i = 0; i < 2; i++) assert.equal((await b.post('/a/agora/translit-pasport/try', { input: 'Иван' })).status, 200);
      const r = await b.post('/a/agora/translit-pasport/try', { input: 'Иван' });
      assert.equal(r.status, 429);
      assert.match(r.text, /Лимит 2 задач в час/);
    } finally { await app.close(); }
  });
});
