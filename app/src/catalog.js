// Каталог: поиск + паспорт доверия + сортировка + перевод карточек на язык посетителя.

import { searchAgents, localizeAgent } from './agents.js';
import { trustPassport } from './trust.js';

/**
 * Без запроса: по индексу доверия (агенты без индекса — после, по числу задач).
 * С запросом: релевантность bm25, усиленная индексом доверия (до +50% для индекса 100).
 */
export function listCatalog(db, { q = '', category = '', lang = '', locale = 'en', limit = 60 } = {}) {
  const items = searchAgents(db, { q, category, lang }).map((a) => ({ a, passport: trustPassport(db, a) }));
  const trustOf = (x) => x.passport.index;
  if (q && items.some((x) => x.a.rank != null)) {
    const score = (x) => -x.a.rank * (1 + (trustOf(x) ?? 40) / 200);
    items.sort((x, y) => score(y) - score(x));
  } else {
    items.sort((x, y) => (trustOf(y) ?? -1) - (trustOf(x) ?? -1) || y.a.ok30 - x.a.ok30 || y.a.created_at - x.a.created_at);
  }
  return items.slice(0, limit).map((x) => ({ a: localizeAgent(x.a, locale), passport: x.passport }));
}
