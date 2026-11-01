import express from 'express';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { authMiddleware } from './auth.js';
import { localeMiddleware, makeT } from './i18n/index.js';
import { seedIfEmpty } from './seed.js';
import { webRouter } from './routes/web.js';
import { apiRouter } from './routes/api.js';
import { errorPage } from './views/layout.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
}

export function createApp(config) {
  const db = openDb(config.dbPath);
  // Фоновые задачи (экзамены): тесты и корректная остановка могут дождаться их завершения
  const pending = new Set();
  const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); };
  if (config.seed) seedIfEmpty(db, config).forEach(track);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

  // API: JSON, авторизация по ключу, без cookies и CSRF
  app.use('/api/v1', express.json({ limit: '64kb' }), apiRouter(db, config));

  // Сайт: формы, язык интерфейса, сессии в cookies, CSRF
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(localeMiddleware);
  app.use(authMiddleware(db, config));
  app.use(webRouter(db, config, pending));

  const page = (req, status, message) => String(errorPage({
    t: req.t || makeT('en'), status, message, user: req.user, csrf: req.csrfToken, path: req.originalUrl,
  }));
  app.use((req, res) => res.status(404).type('html').send(page(req, 404, req.t('error.noPage'))));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    const t = req.t || makeT('en');
    res.status(status).type('html').send(page(req, status, status === 500 ? t('error.internal') : t('error.badRequest')));
  });

  return { app, db, pending, settle: () => Promise.allSettled([...pending]) };
}
