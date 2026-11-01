import { html } from '../html.js';
import { UI_LOCALES } from '../i18n/index.js';

export function layout({ t, title, user, csrf, active = '', body, path = '/' }) {
  const nav = (href, key, label) => html`<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  const langLinks = UI_LOCALES.map((l) => html`<a href="/lang/${l}?next=${encodeURIComponent(path)}" class="${t.locale === l ? 'on' : ''}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`);
  return html`<!DOCTYPE html>
<html lang="${t.locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · Agora` : t('site.title')}</title>
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<nav class="nav">
  <div class="container">
    <a href="/" class="logo"><span class="logo-mark">◆</span>Agora</a>
    <div class="nav-links">
      ${nav('/', 'catalog', t('nav.catalog'))}
      ${nav('/docs', 'docs', t('nav.docs'))}
      ${user ? nav('/me', 'me', t('nav.me')) : ''}
    </div>
    <div class="nav-right">
      <div class="lang-switch" role="group" aria-label="${t('nav.language')}">${langLinks}</div>
      ${user
        ? html`<a href="/publish" class="btn btn-ghost">${t('nav.publish')}</a>
          <form method="post" action="/logout" class="inline"><input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn">${t('nav.logout', { username: user.username })}</button></form>`
        : html`<a href="/register" class="btn btn-ghost">${t('nav.register')}</a><a href="/login" class="btn btn-primary">${t('nav.login')}</a>`}
    </div>
  </div>
</nav>
${body}
<footer><div class="container">${t('footer')}</div></footer>
</body>
</html>`;
}

export const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

/** Текст ошибки поля: { code, ...params } → строка на языке интерфейса. */
export const errText = (t, e) => (e ? t(`err.${e.code}`, e) : '');

/** Поле формы с подписью, подсказкой и ошибкой. */
export function field({ t, name, label, value = '', error, help, type = 'text', textarea = false, placeholder = '', rows }) {
  const control = textarea
    ? html`<textarea id="f-${name}" name="${name}" placeholder="${placeholder}" rows="${rows || 5}">${value}</textarea>`
    : html`<input id="f-${name}" type="${type}" name="${name}" value="${value}" placeholder="${placeholder}">`;
  return html`<div class="field ${error ? 'has-err' : ''}">
    <label for="f-${name}">${label}</label>${control}
    ${error ? html`<div class="err">${errText(t, error)}</div>` : ''}
    ${help ? html`<div class="help">${help}</div>` : ''}
  </div>`;
}

export function errorPage({ t, status, message, user, csrf, path }) {
  return layout({
    t, title: t('error.title', { status }), user, csrf, path,
    body: html`<main class="container page"><div class="card form-card narrow">
      <h1>${status === 404 ? t('error.notFound') : t('error.generic')}</h1>
      <p class="muted">${message}</p><p class="mt"><a href="/" class="btn">${t('error.back')}</a></p></div></main>`,
  });
}
