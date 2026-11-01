import { Router } from 'express';
import {
  validateRegistration, createUser, findUserByUsername, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, csrfProtect, requireLogin, memoryRateLimit,
  createApiKey, listApiKeys, revokeApiKey,
} from '../auth.js';
import {
  CATEGORIES, validateAgent, createAgent, updateAgent, setAgentStatus, rotateAgentSecret, deleteAgent, slugTaken,
  getAgentByPath, getOwnAgent, listOwnAgents, countActiveAgents, categoryCounts, agentPath, agentCard,
  localizeAgent, agentFormValues,
} from '../agents.js';
import { dailyTasks, platformStats } from '../stats.js';
import { trustPassport } from '../trust.js';
import { listCatalog } from '../catalog.js';
import { invokeAgent, HttpError } from '../gateway.js';
import { reviewEligibility, validateReview, upsertReview, getOwnReview, listReviews } from '../reviews.js';
import { startExam, latestExam, validExam, examCooldownMinutes, examsLeftToday } from '../exam.js';
import { isUiLocale, LANG_COOKIE, AGENT_LANGUAGES } from '../i18n/index.js';
import { homePage, agentPage } from '../views/catalog.js';
import { loginPage, registerPage, agentFormPage } from '../views/forms.js';
import { dashboardPage, examPage } from '../views/dashboard.js';
import { docsPage } from '../views/docs.js';
import { errorPage } from '../views/layout.js';

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));

/** Разрешаем только внутренние относительные адреса (защита от open redirect). */
const safeNext = (n, fallback = '/me') => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : fallback);

export function webRouter(db, config, pending) {
  const r = Router();
  const ctx = (req) => ({ t: req.t, user: req.user, csrf: req.csrfToken, path: req.originalUrl });
  const authLimit = memoryRateLimit({ windowMs: 15 * 60_000, max: config.authRateLimit });
  const track = (promise) => { pending.add(promise); promise.finally(() => pending.delete(promise)); };

  r.use(csrfProtect);

  // ---------- Язык интерфейса ----------

  r.get('/lang/:code', (req, res) => {
    const code = req.params.code;
    if (isUiLocale(code)) {
      res.append('Set-Cookie', `${LANG_COOKIE}=${code}; Path=/; SameSite=Lax; Max-Age=${365 * 24 * 3600}${config.cookieSecure ? '; Secure' : ''}`);
    }
    res.redirect(303, safeNext(req.query.next, '/'));
  });

  // ---------- Каталог ----------

  r.get('/', (req, res) => {
    const q = String(req.query.q || '').slice(0, 200);
    const category = CATEGORIES.some((c) => c.id === req.query.cat) ? req.query.cat : '';
    const lang = AGENT_LANGUAGES.includes(req.query.lang) ? req.query.lang : '';
    const items = listCatalog(db, { q, category, lang, locale: req.t.locale });
    send(res, homePage({ ...ctx(req), q, category, lang, items, counts: categoryCounts(db), total: countActiveAgents(db), platform: platformStats(db) }));
  });

  r.get('/docs', (req, res) => send(res, docsPage({ ...ctx(req), baseUrl: config.baseUrl })));

  const findPublicAgent = (req) => {
    const a = getAgentByPath(db, req.params.owner, req.params.slug);
    // На паузе агента видит только владелец; остальным он недоступен
    if (!a || (a.status !== 'active' && a.owner_id !== req.user?.id)) return null;
    return a;
  };
  const agentNotFound = (req, res) => send(res, errorPage({ ...ctx(req), status: 404, message: req.t('error.agentNotFound') }), 404);

  const renderAgent = (req, res, a, extra = {}, status = 200) => {
    send(res, agentPage({
      ...ctx(req),
      a: localizeAgent(a, req.t.locale),
      passport: trustPassport(db, a),
      baseUrl: config.baseUrl,
      reviews: listReviews(db, a.id),
      eligibility: reviewEligibility(db, a, req.user),
      ownReview: req.user ? getOwnReview(db, a.id, req.user.id) : null,
      reviewErrors: {},
      reviewSaved: req.query.review === 'saved',
      ...extra,
    }), status);
  };

  r.get('/a/:owner/:slug/agent.json', (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return res.status(404).json({ error: 'not_found' });
    res.json(agentCard(a, trustPassport(db, a), config.baseUrl));
  });

  r.get('/a/:owner/:slug', (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return agentNotFound(req, res);
    renderAgent(req, res, a);
  });

  r.post('/a/:owner/:slug/try', requireLogin, async (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return agentNotFound(req, res);
    const input = String(req.body.input || '');
    let result = null, error = null, status = 200;
    try {
      result = await invokeAgent(db, config, a, { input, buyer: req.user, channel: 'web', locale: req.t.locale });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      error = req.t(`gw.${err.code}`, err.params);
      status = err.status;
    }
    renderAgent(req, res, a, { input, result, error }, status);
  });

  r.post('/a/:owner/:slug/review', requireLogin, (req, res) => {
    const a = findPublicAgent(req);
    if (!a) return agentNotFound(req, res);
    const { errors, values } = validateReview(req.body);
    if (Object.keys(errors).length) return renderAgent(req, res, a, { reviewErrors: errors, ownReview: { ...values, rating: null } }, 400);
    try {
      upsertReview(db, a, req.user, 'human', values);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      return renderAgent(req, res, a, {}, err.status);
    }
    res.redirect(303, `${agentPath(a)}?review=saved#reviews`);
  });

  // ---------- Вход и регистрация ----------

  r.get('/register', (req, res) => (req.user ? res.redirect(303, '/me') : send(res, registerPage(ctx(req)))));

  r.post('/register', authLimit, (req, res) => {
    const { errors, values } = validateRegistration(req.body);
    if (!errors.username && findUserByUsername(db, values.username)) errors.username = { code: 'username_taken' };
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
    if (!ok) return send(res, loginPage({ ...ctx(req), values: { username }, error: req.t('login.bad'), next: safeNext(req.body.next) }), 401);
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
    const agents = own.map((a) => ({ a: localizeAgent(a, req.t.locale), p: trustPassport(db, a), latest: latestExam(db, a.id) }));
    const t30 = agents.reduce((n, x) => n + x.p.stats.counted, 0);
    const weighted = (key) => (t30 ? agents.reduce((n, x) => n + (x.p.stats[key] || 0) * x.p.stats.counted, 0) / t30 : null);
    const totals = {
      tasks: agents.reduce((n, x) => n + x.p.stats.total30, 0),
      all: agents.reduce((n, x) => n + x.p.stats.total, 0),
      okRate: weighted('successRate'),
      agentShare: weighted('agentShare'),
    };
    send(res, dashboardPage({
      ...ctx(req), agents, totals, days: dailyTasks(db, own.map((a) => a.id)), keys: listApiKeys(db, req.user.id),
      notice: String(req.query.ok || ''), ...extra,
    }));
  };

  r.get('/me', requireLogin, (req, res) => renderDashboard(req, res));

  r.post('/me/keys', requireLogin, (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60) || req.t('d.keyDefault');
    const key = createApiKey(db, req.user.id, name);
    // Ключ показываем прямо в ответе, а не через редирект: он не должен попасть в URL и историю
    renderDashboard(req, res, { newKey: key, notice: '' });
  });

  r.post('/me/keys/:id/revoke', requireLogin, (req, res) => {
    revokeApiKey(db, req.user.id, Number(req.params.id));
    res.redirect(303, '/me?ok=key_revoked');
  });

  const formOpts = (req) => ({ devEndpoints: config.devEndpoints, allowBuiltin: !!req.user.is_system });

  r.get('/publish', requireLogin, (req, res) => send(res, agentFormPage({ ...ctx(req), mode: 'create', values: { primary_lang: req.t.locale }, devEndpoints: config.devEndpoints })));

  r.post('/publish', requireLogin, (req, res) => {
    const { errors, values } = validateAgent(req.body, formOpts(req));
    if (!errors.slug && slugTaken(db, req.user.id, values.slug)) errors.slug = { code: 'slug_taken' };
    if (Object.keys(errors).length) {
      return send(res, agentFormPage({ ...ctx(req), mode: 'create', values: { ...req.body, ...values, languages: values.languages }, errors, devEndpoints: config.devEndpoints }), 400);
    }
    createAgent(db, req.user.id, values);
    res.redirect(303, '/me?ok=published');
  });

  const ownAgent = (req) => getOwnAgent(db, Number(req.params.id), req.user.id);
  const notFound = (req, res) => agentNotFound(req, res);

  r.get('/me/agents/:id/edit', requireLogin, (req, res) => {
    const a = ownAgent(req);
    if (!a) return notFound(req, res);
    send(res, agentFormPage({ ...ctx(req), mode: 'edit', agent: a, values: agentFormValues(a), devEndpoints: config.devEndpoints }));
  });

  r.post('/me/agents/:id/edit', requireLogin, (req, res) => {
    const a = ownAgent(req);
    if (!a) return notFound(req, res);
    const { errors, values } = validateAgent(req.body, formOpts(req));
    if (!errors.slug && slugTaken(db, req.user.id, values.slug, a.id)) errors.slug = { code: 'slug_taken' };
    if (Object.keys(errors).length) {
      return send(res, agentFormPage({ ...ctx(req), mode: 'edit', agent: a, values: { ...req.body, ...values, languages: values.languages }, errors, devEndpoints: config.devEndpoints }), 400);
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

  // ---------- Экзамен ----------

  r.get('/me/agents/:id/exam', requireLogin, (req, res) => {
    const a = ownAgent(req);
    if (!a) return notFound(req, res);
    send(res, examPage({
      ...ctx(req), agent: localizeAgent(a, req.t.locale), latest: latestExam(db, a.id),
      validity: validExam(db, a).state, cooldown: examCooldownMinutes(db, a.id),
      judgeEnabled: Boolean(config.judge.enabled || config.judgeClient),
      examsLeft: examsLeftToday(db, config, req.user.id), dailyLimit: config.judge.dailyExamsPerOwner,
      limitHit: req.query.limit === '1',
    }));
  });

  r.post('/me/agents/:id/exam', requireLogin, (req, res) => {
    const a = ownAgent(req);
    if (!a) return notFound(req, res);
    const running = latestExam(db, a.id)?.status === 'running';
    if (examsLeftToday(db, config, req.user.id) <= 0) return res.redirect(303, `/me/agents/${a.id}/exam?limit=1`);
    if (!running && examCooldownMinutes(db, a.id) === 0) track(startExam(db, config, a).done);
    res.redirect(303, `/me/agents/${a.id}/exam`);
  });

  return r;
}
