import { Router } from 'express';
import { userByApiKey } from '../auth.js';
import { CATEGORIES, getAgentByPath, agentCard, agentLanguages } from '../agents.js';
import { trustPassport } from '../trust.js';
import { listCatalog } from '../catalog.js';
import { invokeAgent, HttpError } from '../gateway.js';
import { upsertReview, validateReview } from '../reviews.js';
import { AGENT_LANGUAGES, isUiLocale, makeT, pickLocale } from '../i18n/index.js';

export function apiRouter(db, config) {
  const r = Router();

  // Язык сообщений об ошибках API: из Accept-Language, по умолчанию английский
  r.use((req, res, next) => { req.t = makeT(pickLocale(req, { useCookie: false })); next(); });

  const apiError = (req, res, status, code, params = {}) => res.status(status).json({ error: code, message: req.t(`gw.${code}`, params) });

  const summary = ({ a, passport }) => ({
    id: `${a.owner_username}/${a.slug}`,
    name: a.name,
    description: a.tagline,
    description_language: a.shown_lang,
    category: a.category,
    tags: a.tags ? a.tags.split(', ') : [],
    languages: agentLanguages(a),
    region: a.region,
    price_note: a.price_note || null,
    trust_index: passport.index,
    trust_level: passport.level,
    exam: passport.exam.state,
    tasks_ok_30d: a.ok30,
    card_url: `${config.baseUrl}/a/${a.owner_username}/${a.slug}/agent.json`,
    invoke_url: `${config.baseUrl}/api/v1/agents/${a.owner_username}/${a.slug}/invoke`,
  });

  const bearerUser = (req) => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    return m ? userByApiKey(db, m[1]) : null;
  };

  r.get('/agents', (req, res) => {
    const q = String(req.query.q || '').slice(0, 200);
    const category = String(req.query.category || '');
    const lang = String(req.query.lang || '');
    if (category && !CATEGORIES.some((c) => c.id === category)) {
      return res.status(400).json({ error: 'bad_category', message: `category: ${CATEGORIES.map((c) => c.id).join(', ')}` });
    }
    if (lang && !AGENT_LANGUAGES.includes(lang)) {
      return res.status(400).json({ error: 'bad_lang', message: `lang: ${AGENT_LANGUAGES.join(', ')}` });
    }
    const locale = isUiLocale(req.query.locale) ? req.query.locale : req.t.locale;
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    res.json({ agents: listCatalog(db, { q, category, lang, locale, limit }).map(summary) });
  });

  r.get('/agents/:owner/:slug', (req, res) => {
    const a = getAgentByPath(db, req.params.owner, req.params.slug);
    if (!a || a.status !== 'active') return res.status(404).json({ error: 'not_found', message: 'agent not found' });
    res.json(agentCard(a, trustPassport(db, a), config.baseUrl));
  });

  const withAgent = (handler) => async (req, res) => {
    const buyer = bearerUser(req);
    if (!buyer) return res.status(401).json({ error: 'unauthorized', message: 'Authorization: Bearer ag_live_... required' });
    const a = getAgentByPath(db, req.params.owner, req.params.slug);
    if (!a) return res.status(404).json({ error: 'not_found', message: 'agent not found' });
    try {
      await handler(req, res, a, buyer);
    } catch (err) {
      if (err instanceof HttpError) return apiError(req, res, err.status, err.code, err.params);
      throw err;
    }
  };

  r.post('/agents/:owner/:slug/invoke', withAgent(async (req, res, a, buyer) => {
    // Язык ответа: поле locale в теле запроса, иначе Accept-Language
    const locale = AGENT_LANGUAGES.includes(req.body?.locale) ? req.body.locale : req.t.locale;
    res.json(await invokeAgent(db, config, a, { input: req.body?.input, buyer, channel: 'api', locale }));
  }));

  r.post('/agents/:owner/:slug/review', withAgent(async (req, res, a, buyer) => {
    const { errors, values } = validateReview(req.body || {});
    if (errors.rating) throw new HttpError(400, 'bad_rating');
    upsertReview(db, a, buyer, 'agent', values);
    res.json({ ok: true, trust_index: trustPassport(db, a).index });
  }));

  r.use((req, res) => res.status(404).json({ error: 'not_found', message: 'no such API method' }));
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'request body is not JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'request too large' });
    console.error(err);
    res.status(500).json({ error: 'internal', message: 'internal error' });
  });
  return r;
}
