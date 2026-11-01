import { Router } from 'express';
import {
  validateRegistration, createUser, findUserByUsername, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, csrfProtect, requireLogin, memoryRateLimit,
  createApiKey, listApiKeys, revokeApiKey,
} from '../auth.js';
import {
  CATEGORIES, validateAgent, createAgent, updateAgent, setAgentStatus, rotateAgentSecret, deleteAgent, slugTaken,
  getAgentByPath, getOwnAgent, listOwnAgents, searchAgents, countActiveAgents, categoryCounts, agentPath, agentCard,
} from '../agents.js';
import { agentStats, dailyTasks, platformStats } from '../stats.js';
import { invokeAgent, HttpError } from '../gateway.js';
import { homePage, agentPage } from '../views/catalog.js';
import { loginPage, registerPage, agentFormPage } from '../views/forms.js';
import { dashboardPage } from '../views/dashboard.js';
import { docsPage } from '../views/docs.js';
import { errorPage } from '../views/layout.js';

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));

/** Разрешаем только внутренние относительные адреса для ?next= (защита от open redirect). */
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : '/me');

export function webRouter(db, config) {
  const r = Router();
  const ctx = (req) => ({ user: req.user, csrf: req.csrfToken });
  const authLimit = memoryRateLimit({ windowMs: 15 * 60_000, max: config.authRateLimit });

  r.use(csrfProtect);

  // ---------- Каталог ----------

  r.get('/', (req, res) => {
    const q = String(req.query.q || '').slice(0, 200);
    const category = CATEGORIES.some((c) => c.id === req.query.cat) ? req.query.cat : '';
    const agents = searchAgents(db, { q, category, limit: 60 });
    send(res, homePage({ ...ctx(req), q, category, agents, counts: categoryCounts(db), total: countActiveAgents(db), platform: platformStats(db) }));
  });

  r.get('/docs', (req, res) => send(res, docsPage({ ...ctx(req), baseUrl: config.baseUrl })));

  const findPublicAgent = (req) => {
    const a = getAgentByPath(db, req.params.owner, req.params.slug);
    // На паузе агента видит только владелец; остальным он недоступен
    if (!a || (a.status !== 'active' && a.owner_id !== req.user?.id)) return null;
    return a;
  };

  r.get('/a/:owner/:slug/agent.json', (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return res.status(404).json({ error: 'not_found' });
    res.json(agentCard(a, agentStats(db, a.id), config.baseUrl));
  });

  r.get('/a/:owner/:slug', (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return send(res, errorPage({ ...ctx(req), status: 404, message: 'Такого агента нет или он скрыт создателем.' }), 404);
    send(res, agentPage({ ...ctx(req), a, stats: agentStats(db, a.id), baseUrl: config.baseUrl }));
  });

  r.post('/a/:owner/:slug/try', requireLogin, async (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return send(res, errorPage({ ...ctx(req), status: 404, message: 'Агент не найден.' }), 404);
    const input = String(req.body.input || '');
    let result = null, error = null, status = 200;
    try {
      result = await invokeAgent(db, config, a, { input, buyer: req.user, channel: 'web' });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      error = err.message;
      status = err.status;
    }
    send(res, agentPage({ ...ctx(req), a, stats: agentStats(db, a.id), baseUrl: config.baseUrl, input, result, error }), status);
  });

  // ---------- Вход и регистрация ----------

  r.get('/register', (req, res) => (req.user ? res.redirect(303, '/me') : send(res, registerPage(ctx(req)))));

  r.post('/register', authLimit, (req, res) => {
    const { errors, values } = validateRegistration(req.body);
    if (!errors.username && findUserByUsername(db, values.username)) errors.username = 'Этот логин уже занят';
    if (Object.keys(errors).length) return send(res, registerPage({ ...ctx(req), values, errors }), 400);
    const userId = createUser(db, values);
    setSessionCookie(res, config, createSession(db, userId));
    res.redirect(303, '/me');
  });

  r.get('/login', (req, res) => (req.user ? res.redirect(303, '/me') : send(res, loginPage({ ...ctx(req), next: safeNext(req.query.next) }))));

  r.post('/login', authLimit, (req, res) => {
    const username = String(req.body.username || '').trim();
    const user = findUserByUsername(db, username);
    const ok = user && !user.is_system && verifyPassword(String(req.body.password || ''), user.password_hash);
    if (!ok) return send(res, loginPage({ ...ctx(req), values: { username }, error: 'Неверный логин или пароль', next: safeNext(req.body.next) }), 401);
    if (req.sessionToken) destroySession(db, req.sessionToken);
    setSessionCookie(res, config, createSession(db, user.id));
    res.redirect(303, safeNext(req.body.next));
  });

  r.post('/logout', (req, res) => {
    destroySession(db, req.sessionToken);
    clearSessionCookie(res, config);
    res.redirect(303, '/');
  });

  // ---------- Кабинет создателя ----------

  const renderDashboard = (req, res, extra = {}) => {
    const own = listOwnAgents(db, req.user.id);
    const agents = own.map((a) => ({ a, s: agentStats(db, a.id) }));
    const t30 = agents.reduce((n, x) => n + x.s.total30, 0);
    const weighted = (key) => (t30 ? agents.reduce((n, x) => n + (x.s[key] || 0) * x.s.total30, 0) / t30 : null);
    const totals = { tasks: t30, all: agents.reduce((n, x) => n + x.s.total, 0), okRate: weighted('successRate'), agentShare: weighted('agentShare') };
    send(res, dashboardPage({
      ...ctx(req), agents, totals, days: dailyTasks(db, own.map((a) => a.id)), keys: listApiKeys(db, req.user.id),
      notice: String(req.query.ok || ''), ...extra,
    }));
  };

  r.get('/me', requireLogin, (req, res) => renderDashboard(req, res));

  r.post('/me/keys', requireLogin, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60) || 'ключ без названия';
    const key = createApiKey(db, req.user.id, name);
    // Ключ показываем прямо в ответе, а не через редирект: он не должен попасть в URL и историю
    renderDashboard(req, res, { newKey: key, notice: '' });
  });

  r.post('/me/keys/:id/revoke', requireLogin, (req, res) => {
    revokeApiKey(db, req.user.id, Number(req.params.id));
    res.redirect(303, '/me?ok=key_revoked');
  });

  r.get('/publish', requireLogin, (req, res) => send(res, agentFormPage({ ...ctx(req), mode: 'create', devEndpoints: config.devEndpoints })));

  r.post('/publish', requireLogin, (req, res) => {
    const { errors, values } = validateAgent(req.body, { devEndpoints: config.devEndpoints, allowBuiltin: !!req.user.is_system });
    if (!errors.slug && slugTaken(db, req.user.id, values.slug)) errors.slug = 'У вас уже есть агент с таким адресом';
    if (Object.keys(errors).length) {
      return send(res, agentFormPage({ ...ctx(req), mode: 'create', values, errors, devEndpoints: config.devEndpoints }), 400);
    }
    createAgent(db, req.user.id, values);
    res.redirect(303, '/me?ok=published');
  });

  const ownAgent = (req) => getOwnAgent(db, Number(req.params.id), req.user.id);
  const notFound = (req, res) => send(res, errorPage({ ...ctx(req), status: 404, message: 'Агент не найден.' }), 404);

  r.get('/me/agents/:id/edit', requireLogin, (req, res) => {
    const a = ownAgent(req);
    if (!a) return notFound(req, res);
    send(res, agentFormPage({ ...ctx(req), mode: 'edit', agent: a, values: a, devEndpoints: config.devEndpoints }));
  });

  r.post('/me/agents/:id/edit', requireLogin, (req, res) => {
    const a = ownAgent(req);
    if (!a) return notFound(req, res);
    const { errors, values } = validateAgent(req.body, { devEndpoints: config.devEndpoints, allowBuiltin: !!req.user.is_system });
    if (!errors.slug && slugTaken(db, req.user.id, values.slug, a.id)) errors.slug = 'У вас уже есть агент с таким адресом';
    if (Object.keys(errors).length) {
      return send(res, agentFormPage({ ...ctx(req), mode: 'edit', agent: a, values, errors, devEndpoints: config.devEndpoints }), 400);
    }
    updateAgent(db, a.id, req.user.id, values);
    res.redirect(303, '/me?ok=saved');
  });

  for (const [action, status, notice] of [['pause', 'paused', 'paused'], ['resume', 'active', 'resumed']]) {
    r.post(`/me/agents/:id/${action}`, requireLogin, (req, res) => {
      if (!ownAgent(req)) return notFound(req, res);
      setAgentStatus(db, Number(req.params.id), req.user.id, status);
      res.redirect(303, `/me?ok=${notice}`);
    });
  }

  r.post('/me/agents/:id/rotate-secret', requireLogin, (req, res) => {
    if (!ownAgent(req)) return notFound(req, res);
    rotateAgentSecret(db, Number(req.params.id), req.user.id);
    res.redirect(303, '/me?ok=secret');
  });

  r.post('/me/agents/:id/delete', requireLogin, (req, res) => {
    if (!ownAgent(req)) return notFound(req, res);
    deleteAgent(db, Number(req.params.id), req.user.id);
    res.redirect(303, '/me?ok=deleted');
  });

  return r;
}

