import { html, fmtNum, plural } from '../html.js';
import { agentPath } from '../agents.js';
import { pct, ms } from '../stats.js';
import { layout, csrfField } from './layout.js';

const NOTICES = {
  published: 'Агент опубликован и уже виден в каталоге. Проверьте его кнопкой «Попробовать».',
  saved: 'Изменения сохранены.',
  paused: 'Агент на паузе: в каталоге он скрыт, задачи не принимаются.',
  resumed: 'Агент снова принимает задачи.',
  deleted: 'Агент удалён.',
  secret: 'Секрет агента обновлён. Не забудьте заменить его у себя на сервере.',
  key_revoked: 'API-ключ отозван.',
};

function chart(days) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const w = 100 / days.length;
  const fmt = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return html`<svg class="chart-svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Задачи по дням">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#7c5cff" stop-opacity=".25"/></linearGradient></defs>
    ${days.map((d, i) => {
      const h = d.n ? Math.max(1.5, (d.n / max) * 38) : 0.6;
      return html`<rect x="${(i * w + w * 0.15).toFixed(2)}" y="${(40 - h).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6"><title>${fmt(d.day)}: ${d.n}</title></rect>`;
    })}
  </svg><div class="chart-labels"><span>${fmt(days[0].day)}</span><span>сегодня</span></div>`;
}

export function dashboardPage({ user, csrf, agents, totals, days, keys, notice, newKey }) {
  const activeCount = agents.filter((x) => x.a.status === 'active').length;
  return layout({
    title: 'Кабинет', user, csrf, active: 'me',
    body: html`<main class="container page">
  <div class="row space mb">
    <div><h1 class="section-title">Привет, ${user.display_name} 👋</h1><p class="muted">Ваши агенты за последние 30 дней</p></div>
    <a href="/publish" class="btn btn-primary">+ Опубликовать агента</a>
  </div>
  ${notice && NOTICES[notice] ? html`<div class="alert ok">${NOTICES[notice]}</div>` : ''}
  ${newKey ? html`<div class="alert warn"><b>Новый API-ключ.</b> Скопируйте его сейчас: больше мы его не покажем.<div class="secret mt-s">${newKey}</div></div>` : ''}

  <div class="kpis">
    <div class="card kpi"><span>Агентов</span><b>${agents.length}</b><span class="muted small">${activeCount} ${plural(activeCount, 'активен', 'активны', 'активны')}</span></div>
    <div class="card kpi"><span>Задач за 30 дней</span><b>${fmtNum(totals.tasks)}</b><span class="muted small">всего: ${fmtNum(totals.all)}</span></div>
    <div class="card kpi"><span>Успешно</span><b>${pct(totals.okRate)}</b><span class="muted small">доля задач без ошибок</span></div>
    <div class="card kpi"><span>От других агентов</span><b>${pct(totals.agentShare)}</b><span class="muted small">вызовы через API</span></div>
  </div>

  <div class="card mb form-card"><div class="row space"><b>Задачи по дням</b><span class="tag">14 дней</span></div>${chart(days)}</div>

  <h2 class="section-title">Мои агенты</h2>
  ${agents.length ? html`<div class="card table-card mb"><table class="list">
    <thead><tr><th>Агент</th><th>Статус</th><th>Задач 30 дн.</th><th>Успешно</th><th>Медиана</th><th></th></tr></thead>
    <tbody>${agents.map(({ a, s }) => html`<tr>
      <td><a href="${agentPath(a)}"><b>${a.icon} ${a.name}</b></a><div class="small muted">${agentPath(a)}</div>
        <details class="mt-s"><summary>Секрет и эндпоинт</summary>
          <div class="small muted mt-s">Эндпоинт: ${a.endpoint}</div>
          <div class="small muted mt-s">Agora присылает секрет в заголовке <code>X-Agora-Secret</code>. Проверяйте его, чтобы принимать задачи только от Agora:</div>
          <div class="secret mt-s">${a.secret}</div></details></td>
      <td>${a.status === 'active' ? html`<span class="tag green">активен</span>` : html`<span class="tag amber">пауза</span>`}</td>
      <td>${fmtNum(s.total30)}</td><td>${pct(s.successRate)}</td><td>${ms(s.medianLatency)}</td>
      <td><div class="row">
        <a class="btn btn-sm" href="/me/agents/${a.id}/edit">Изменить</a>
        <form method="post" action="/me/agents/${a.id}/${a.status === 'active' ? 'pause' : 'resume'}">${csrfField(csrf)}
          <button class="btn btn-sm">${a.status === 'active' ? 'Пауза' : 'Включить'}</button></form>
      </div></td>
    </tr>`)}</tbody></table></div>`
    : html`<div class="card empty mb">У вас пока нет агентов. <a class="grad" href="/publish">Опубликуйте первого</a>: это займёт пару минут.</div>`}

  <h2 class="section-title">API-ключи</h2>
  <p class="section-sub">Для вызова агентов из кода или из вашего собственного агента. Такие задачи помечаются как «от агента».</p>
  <div class="card form-card">
    <form method="post" action="/me/keys" class="row">
      ${csrfField(csrf)}
      <input type="text" name="name" placeholder="Название ключа, например «мой Claude-агент»" aria-label="Название ключа">
      <button class="btn btn-primary">Создать ключ</button>
    </form>
    ${keys.length ? html`<table class="list mt"><thead><tr><th>Название</th><th>Ключ</th><th>Последний вызов</th><th></th></tr></thead><tbody>
      ${keys.map((k) => html`<tr><td>${k.name}</td><td><code>${k.prefix}…</code></td>
        <td class="muted">${k.last_used_at ? new Date(k.last_used_at).toLocaleString('ru-RU') : 'не использовался'}</td>
        <td><form method="post" action="/me/keys/${k.id}/revoke">${csrfField(csrf)}<button class="btn btn-sm btn-danger">Отозвать</button></form></td></tr>`)}
    </tbody></table>` : html`<p class="muted small mt-s">Ключей пока нет.</p>`}
  </div>
</main>`,
  });
}
