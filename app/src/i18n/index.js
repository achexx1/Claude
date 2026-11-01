// Переводы интерфейса. Чтобы добавить язык: создайте словарь по образцу en.js,
// подключите его в LOCALES и добавьте в UI_LOCALES. Недостающие ключи берутся из английского.

import ru from './ru.js';
import en from './en.js';
import { parseCookies } from '../auth.js';

export const LOCALES = { en, ru };
export const UI_LOCALES = ['en', 'ru'];
export const DEFAULT_LOCALE = 'en';
export const LANG_COOKIE = 'agora_lang';

export const isUiLocale = (l) => UI_LOCALES.includes(l);

/** Языки, на которых может отвечать агент (не путать с языками интерфейса). */
export const AGENT_LANGUAGES = ['en', 'ru', 'es', 'pt', 'fr', 'de', 'it', 'tr', 'uk', 'kk', 'pl', 'ar', 'hi', 'zh', 'ja', 'ko', 'id'];
/** Регионы, для которых агент может быть актуален. 'global' — для всех. */
export const REGIONS = ['global', 'US', 'GB', 'EU', 'RU', 'KZ', 'BY', 'UA', 'UZ', 'DE', 'FR', 'ES', 'IT', 'TR', 'IN', 'BR', 'CN', 'JP', 'AE'];

/** Выбор языка: явный выбор (cookie) → заголовок браузера Accept-Language → английский. */
export function pickLocale(req, { useCookie = true } = {}) {
  if (useCookie) {
    const fromCookie = parseCookies(req.headers.cookie)[LANG_COOKIE];
    if (isUiLocale(fromCookie)) return fromCookie;
  }
  const header = String(req.headers['accept-language'] || '');
  const prefs = header.split(',').map((part) => {
    const [tag, ...params] = part.trim().split(';');
    const q = params.find((p) => p.trim().startsWith('q='));
    return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 };
  }).filter((p) => p.lang).sort((a, b) => b.q - a.q);
  return prefs.find((p) => isUiLocale(p.lang))?.lang || DEFAULT_LOCALE;
}

export function makeT(locale) {
  if (!isUiLocale(locale)) locale = DEFAULT_LOCALE;
  const dict = LOCALES[locale];
  const plurals = new Intl.PluralRules(locale);
  const numFmt = new Intl.NumberFormat(locale);
  const langNames = new Intl.DisplayNames([locale], { type: 'language' });
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });

  const t = (key, params = {}) => {
    let v = dict[key] ?? LOCALES[DEFAULT_LOCALE][key];
    if (v === undefined) return key;
    if (typeof v === 'object') v = v[plurals.select(Number(params.n) || 0)] ?? v.other;
    return String(v).replace(/\{(\w+)\}/g, (_, k) => {
      const p = params[k];
      if (p === undefined || p === null) return '';
      return typeof p === 'number' ? numFmt.format(p) : String(p);
    });
  };
  t.locale = locale;
  t.num = (n) => numFmt.format(n);
  t.pct = (x) => (x == null ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(x * 100)}%`);
  t.ms = (x) => (x == null ? '—' : x < 1000
    ? `${numFmt.format(x)} ${dict['unit.ms']}`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(x / 1000)} ${dict['unit.s']}`);
  t.date = (ts) => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  t.dateShort = (ts) => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  t.dateTime = (ts) => new Date(ts).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  t.lang = (code) => { try { return langNames.of(code); } catch { return code; } };
  t.region = (code) => (code === 'global' ? dict['region.global'] : code === 'EU' ? dict['region.EU'] : (() => {
    try { return regionNames.of(code); } catch { return code; }
  })());
  return t;
}

/** Middleware: req.t / res.locals.t для страниц сайта. */
export function localeMiddleware(req, res, next) {
  req.t = makeT(pickLocale(req));
  res.locals.t = req.t;
  next();
}
