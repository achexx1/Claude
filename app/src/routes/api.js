import { Router } from 'express';
import { userByApiKey } from '../auth.js';
import { CATEGORIES, searchAgents, getAgentByPath, agentCard } from '../agents.js';
import { agentStats } from '../stats.js';
import { invokeAgent, HttpError } from '../gateway.js';

export function apiRouter(db, config) {
  const r = Router();
  const apiError = (res, status, code, message) => res.status(status).json({ error: code, message });

  const summary = (a) => ({
    id: `${a.owner_username}/${a.slug}`,
    name: a.name,
    description: a.tagline,
    category: a.category,
    tags: a.tags ? a.tags.split(', ') : [],
    price_note: a.price_note || null,
    tasks_ok_30d: a.ok30,
    card_url: `${config.baseUrl}/a/${a.owner_username}/${a.slug}/agent.json`,
    invoke_url: `${config.baseUrl}/api/v1/agents/${a.owner_username}/${a.slug}/invoke`,
  });

  r.get('/agents', (req, res) => {
    const q = String(req.query.q || '').slice(0, 200);
    const category = String(req.query.category || '');
    if (category && !CATEGORIES.some((c) => c.id === category)) {
      return apiError(res, 400, 'bad_category', `Категории: ${CATEGORIES.map((c) => c.id).join(', ')}`);
    }
    const agents = searchAgents(db, { q, category, limit: req.query.limit, offset: req.query.offset });
    res.json({ agents: agents.map(summary) });
  });

  r.get('/agents/:owner/:slug', (req, res) => {
    const a = getAgentByPath(db, req.params.owner, req.params.slug);
    if (!a || a.status !== 'active') return apiError(res, 404, 'not_found', 'Агент не найден');
    res.json(agentCard(a, agentStats(db, a.id), config.baseUrl));
  });

  r.post('/agents/:owner/:slug/invoke', async (req, res) => {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    const buyer = m ? userByApiKey(db, m[1]) : null;
    if (!buyer) return apiError(res, 401, 'unauthorized', 'Нужен заголовок Authorization: Bearer ag_live_...');
    const a = getAgentByPath(db, req.params.owner, req.params.slug);
    if (!a) return apiError(res, 404, 'not_found', 'Агент не найден');
    try {
      res.json(await invokeAgent(db, config, a, { input: req.body?.input, buyer, channel: 'api' }));
    } catch (err) {
      if (err instanceof HttpError) return apiError(res, err.status, err.code, err.message);
      throw err;
    }
  });

  r.use((req, res) => apiError(res, 404, 'not_found', 'Нет такого метода API'));
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return apiError(res, 400, 'bad_json', 'Тело запроса не JSON');
    if (err.type === 'entity.too.large') return apiError(res, 413, 'too_large', 'Слишком большой запрос');
    console.error(err);
    apiError(res, 500, 'internal', 'Внутренняя ошибка');
  });
  return r;
}
