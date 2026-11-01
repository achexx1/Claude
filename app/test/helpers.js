import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';

/** Поднимает приложение на случайном порту с базой в памяти. */
export async function startApp(overrides = {}) {
  const base = loadConfig({ AGORA_DEV_ENDPOINTS: '1' });
  const config = { ...base, dbPath: ':memory:', authRateLimit: 10_000, ...overrides, gateway: { ...base.gateway, ...(overrides.gateway || {}) } };
  const { app, db, settle } = createApp(config);
  await settle(); // демо-агенты сдают экзамен при первом запуске
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  config.baseUrl = url;
  return { url, db, config, settle, close: async () => { await settle(); await new Promise((r) => server.close(r)); } };
}

/** Мини-браузер: хранит cookies, умеет доставать CSRF-токен из страниц. */
export function browser(baseUrl, { lang = 'ru' } = {}) {
  const jar = new Map();
  let csrf = null;
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  async function request(path, { method = 'GET', form, headers = {} } = {}) {
    const init = { method, redirect: 'manual', headers: { 'accept-language': lang, ...headers } };
    if (jar.size) init.headers.cookie = cookieHeader();
    if (form) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    }
    const res = await fetch(baseUrl + path, init);
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    const m = text.match(/name="_csrf" value="([^"]+)"/);
    if (m) csrf = m[1];
    return { status: res.status, text, headers: res.headers, location: res.headers.get('location') };
  }

  return {
    get: (path) => request(path),
    async post(path, form = {}, { withCsrf = true } = {}) {
      if (withCsrf && !jar.has('agora_csrf')) await request('/');
      const token = jar.get('agora_csrf') || csrf;
      return request(path, { method: 'POST', form: withCsrf ? { _csrf: token, ...form } : form });
    },
    async register(username, password = 'password123') {
      await request('/register');
      return this.post('/register', { username, display_name: username, password });
    },
    jar,
  };
}

export const validAgent = (endpoint, extra = {}) => ({
  name: 'Тестовый агент',
  slug: '',
  icon: '🧪',
  tagline: 'Переворачивает текст задом наперёд для проверки',
  description: 'Агент для автотестов: возвращает текст задом наперёд и считает слова. Ничего полезного не делает.',
  category: 'other',
  tags: 'тест, пример',
  primary_lang: 'ru',
  languages: 'ru',
  region: 'global',
  endpoint,
  input_hint: 'Любой текст',
  example_input: 'привет мир',
  price_note: 'бесплатно',
  version: '1.0',
  ...extra,
});
