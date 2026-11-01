import express from 'express';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { authMiddleware } from './auth.js';
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
  if (config.seed) seedIfEmpty(db);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

  // API: JSON, авторизация по ключу, без cookies и CSRF
  app.use('/api/v1', express.json({ limit: '64kb' }), apiRouter(db, config));

  // Сайт: формы, сессии в cookies, CSRF
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(authMiddleware(db, config));
  app.use(webRouter(db, config));

  app.use((req, res) => {
    res.status(404).type('html').send(String(errorPage({ status: 404, message: 'Такой страницы нет.', user: req.user, csrf: req.csrfToken })));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).type('html').send(String(errorPage({
      status, message: status === 500 ? 'Внутренняя ошибка. Мы уже разбираемся.' : 'Некорректный запрос.', user: req.user, csrf: req.csrfToken,
    })));
  });

  return { app, db };
}
