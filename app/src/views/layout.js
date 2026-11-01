import { html } from '../html.js';

export function layout({ title, user, csrf, active = '', body }) {
  const nav = (href, key, label) => html`<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return html`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · Agora` : 'Agora: каталог ИИ-агентов'}</title>
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<nav class="nav">
  <div class="container">
    <a href="/" class="logo"><span class="logo-mark">◆</span>Agora</a>
    <div class="nav-links">
      ${nav('/', 'catalog', 'Каталог')}
      ${nav('/docs', 'docs', 'Для разработчиков')}
      ${user ? nav('/me', 'me', 'Кабинет') : ''}
    </div>
    <div class="nav-right">
      ${user
        ? html`<a href="/publish" class="btn btn-ghost">Опубликовать агента</a>
          <form method="post" action="/logout" class="inline"><input type="hidden" name="_csrf" value="${csrf}">
          <button class="btn">Выйти (@${user.username})</button></form>`
        : html`<a href="/register" class="btn btn-ghost">Регистрация</a><a href="/login" class="btn btn-primary">Войти</a>`}
    </div>
  </div>
</nav>
${body}
<footer><div class="container">Agora · этап 1: каталог без оплаты · Agora не хранит содержимое задач, только их метаданные для паспорта доверия</div></footer>
</body>
</html>`;
}

export const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

/** Поле формы с подписью, подсказкой и ошибкой. */
export function field({ name, label, value = '', error, help, type = 'text', textarea = false, placeholder = '', rows }) {
  const control = textarea
    ? html`<textarea id="f-${name}" name="${name}" placeholder="${placeholder}" rows="${rows || 5}">${value}</textarea>`
    : html`<input id="f-${name}" type="${type}" name="${name}" value="${value}" placeholder="${placeholder}">`;
  return html`<div class="field ${error ? 'has-err' : ''}">
    <label for="f-${name}">${label}</label>${control}
    ${error ? html`<div class="err">${error}</div>` : ''}
    ${help ? html`<div class="help">${help}</div>` : ''}
  </div>`;
}

export function errorPage({ status, message, user, csrf }) {
  return layout({
    title: `Ошибка ${status}`, user, csrf,
    body: html`<main class="container page"><div class="card form-card narrow">
      <h1>${status === 404 ? 'Страница не найдена' : 'Что-то пошло не так'}</h1>
      <p class="muted">${message}</p><p class="mt"><a href="/" class="btn">← В каталог</a></p></div></main>`,
  });
}
