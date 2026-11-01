import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { isBlockedAddress, postJson, parseAgentResponse } from '../src/gateway.js';
import { buildFtsQuery, slugify, validateEndpoint } from '../src/agents.js';
import { runBuiltin } from '../src/builtins.js';
import { html, raw } from '../src/html.js';
import { hashPassword, verifyPassword } from '../src/auth.js';

test('SSRF: внутренние адреса заблокированы', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.5', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isBlockedAddress(ip), false, ip);
});

test('SSRF: postJson не ходит на localhost без режима разработки', async () => {
  const server = http.createServer((req, res) => res.end('{"output":{"text":"leak"}}'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    await assert.rejects(postJson(`http://127.0.0.1:${port}/`, {}), { code: 'EBLOCKED' });
    await assert.rejects(postJson(`http://localhost:${port}/`, {}), { code: 'EBLOCKED' });
    await assert.rejects(postJson(`http://[::ffff:127.0.0.1]:${port}/`, {}), { code: 'EBLOCKED' });
    const ok = await postJson(`http://127.0.0.1:${port}/`, {}, { allowPrivate: true });
    assert.equal(ok.status, 200);
  } finally { server.close(); }
});

test('postJson: лимит размера ответа и без перехода по редиректам', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/big') return res.end('x'.repeat(2048));
    res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(postJson(`${base}/big`, {}, { allowPrivate: true, maxBytes: 1000 }), { code: 'ETOOBIG' });
    const redirect = await postJson(`${base}/r`, {}, { allowPrivate: true });
    assert.equal(redirect.status, 302);
    assert.ok(parseAgentResponse(redirect.status, redirect.body).error);
  } finally { server.close(); }
});

test('проверка ответа агента', () => {
  assert.deepEqual(parseAgentResponse(200, '{"output":{"text":"ок"}}'), { output: { text: 'ок', data: null } });
  assert.ok(parseAgentResponse(200, 'not json').error);
  assert.ok(parseAgentResponse(200, '{"output":{"text":5}}').error);
  assert.ok(parseAgentResponse(500, '{"output":{"text":"x"}}').error);
});

test('эндпоинты: в продакшене только https', () => {
  assert.equal(validateEndpoint('https://api.example.com/a', { devEndpoints: false }), null);
  assert.ok(validateEndpoint('http://api.example.com/a', { devEndpoints: false }));
  assert.equal(validateEndpoint('http://localhost:4100/agent', { devEndpoints: true }), null);
  assert.ok(validateEndpoint('https://user:pass@example.com/', { devEndpoints: false }));
  assert.ok(validateEndpoint('builtin://translit', { devEndpoints: true, allowBuiltin: false }));
});

test('поисковый запрос: основы слов и экранирование', () => {
  assert.equal(buildFtsQuery('проверить договор аренды'), '"провер"* OR "догов"* OR "арен"*');
  assert.equal(buildFtsQuery('"; DROP TABLE agents; --'), '"drop"* OR "table"* OR "agent"*');
  assert.equal(buildFtsQuery('calculating taxes'), '"calculat"* OR "tax"*');
  assert.equal(buildFtsQuery('на и в'), null);
});

test('slugify', () => {
  assert.equal(slugify('Юрист по аренде!'), 'iurist-po-arende');
  assert.equal(slugify('  Hello  World  '), 'hello-world');
});

test('демо-агенты', () => {
  assert.equal(runBuiltin('translit', 'Щукина Юлия').data.result, 'Shchukina Iuliia');
  assert.equal(runBuiltin('translit', 'ИВАНОВ').data.result, 'IVANOV');
  const npd = runBuiltin('npd-calc', 'физ 45 000\nфиз 12 500\nюр 30 000\nИП 10 тыс');
  assert.equal(npd.data.income_individuals, 57500);
  assert.equal(npd.data.income_companies, 40000);
  assert.equal(npd.data.tax, 57500 * 0.04 + 40000 * 0.06);
  const st = runBuiltin('text-stats', 'Раз два три. Четыре пять!');
  assert.equal(st.data.words, 5);
  assert.equal(st.data.sentences, 2);
});

test('шаблоны экранируют подстановки', () => {
  assert.equal(String(html`<p>${'<b>"x"</b>'}</p>`), '<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</p>');
  assert.equal(String(html`<p>${raw('<b>')}${[html`<i>${'&'}</i>`]}</p>`), '<p><b><i>&amp;</i></p>');
});

test('пароли', () => {
  const h = hashPassword('secret-pass');
  assert.ok(verifyPassword('secret-pass', h));
  assert.ok(!verifyPassword('other', h));
  assert.ok(!verifyPassword('x', 'garbage'));
});
