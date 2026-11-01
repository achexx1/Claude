import { html } from '../html.js';
import { agentPath } from '../agents.js';
import { EXAM_CHECKS } from '../exam.js';
import { describeTaskError } from '../gateway.js';
import { layout, csrfField } from './layout.js';
import { trustRing } from './catalog.js';

const NOTICES = ['published', 'saved', 'paused', 'resumed', 'deleted', 'secret', 'key_revoked', 'exam_started'];

function chart(t, days) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const w = 100 / days.length;
  return html`<svg class="chart-svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="${t('d.chartAria')}">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#7c5cff" stop-opacity=".25"/></linearGradient></defs>
    ${days.map((d, i) => {
      const h = d.n ? Math.max(1.5, (d.n / max) * 38) : 0.6;
      return html`<rect x="${(i * w + w * 0.15).toFixed(2)}" y="${(40 - h).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6"><title>${t.dateShort(d.day)}: ${d.n}</title></rect>`;
    })}
  </svg><div class="chart-labels"><span>${t.dateShort(days[0].day)}</span><span>${t('d.today')}</span></div>`;
}

function examCell(t, x) {
  const ex = x.latest;
  let label;
  if (ex?.status === 'running') label = html`<span class="tag amber">${t('d.examRunning')}</span>`;
  else if (x.p.exam.state === 'valid') label = html`<span class="tag green">${t.pct(x.p.exam.quality)} · ${t.pct(x.p.exam.safety)}</span>`;
  else if (x.p.exam.state === 'outdated' || x.p.exam.state === 'expired') label = html`<span class="tag amber">${t('d.examOutdated')}</span>`;
  else label = html`<span class="tag">${t('d.examNone')}</span>`;
  return html`${label} <a class="btn btn-sm" href="/me/agents/${x.a.id}/exam">${t('d.examOpen')}</a>`;
}

export function dashboardPage({ t, user, csrf, agents, totals, days, keys, notice, newKey, path }) {
  const activeCount = agents.filter((x) => x.a.status === 'active').length;
  return layout({
    t, title: t('d.title'), user, csrf, active: 'me', path,
    body: html`<main class="container page">
  <div class="row space mb">
    <div><h1 class="section-title">${t('d.hello', { name: user.display_name })}</h1><p class="muted">${t('d.sub')}</p></div>
    <a href="/publish" class="btn btn-primary">+ ${t('nav.publish')}</a>
  </div>
  ${NOTICES.includes(notice) ? html`<div class="alert ok">${t(`d.n.${notice}`)}</div>` : ''}
  ${newKey ? html`<div class="alert warn"><b>${t('d.newKey')}</b> ${t('d.newKeyHint')}<div class="secret mt-s">${newKey}</div></div>` : ''}

  <div class="kpis">
    <div class="card kpi"><span>${t('d.k.agents')}</span><b>${agents.length}</b><span class="muted small">${t('d.k.active', { n: activeCount })}</span></div>
    <div class="card kpi"><span>${t('d.k.tasks30')}</span><b>${t.num(totals.tasks)}</b><span class="muted small">${t('d.k.all', { n: totals.all })}</span></div>
    <div class="card kpi"><span>${t('d.k.success')}</span><b>${t.pct(totals.okRate)}</b><span class="muted small">${t('d.k.successHint')}</span></div>
    <div class="card kpi"><span>${t('d.k.fromAgents')}</span><b>${t.pct(totals.agentShare)}</b><span class="muted small">${t('d.k.fromAgentsHint')}</span></div>
  </div>

  <div class="card mb form-card"><div class="row space"><b>${t('d.chart')}</b><span class="tag">${t('d.days14')}</span></div>${chart(t, days)}</div>

  <h2 class="section-title">${t('d.myAgents')}</h2>
  ${agents.length ? html`<div class="card table-card mb"><table class="list">
    <thead><tr><th>${t('d.th.agent')}</th><th>${t('d.th.trust')}</th><th>${t('d.th.status')}</th><th>${t('d.th.tasks')}</th><th>${t('d.th.exam')}</th><th></th></tr></thead>
    <tbody>${agents.map((x) => html`<tr>
      <td><a href="${agentPath(x.a)}"><b>${x.a.icon} ${x.a.name}</b></a><div class="small muted">${agentPath(x.a)}</div>
        <details class="mt-s"><summary>${t('d.secret')}</summary>
          <div class="small muted mt-s">${t('d.endpoint', { url: x.a.endpoint })}</div>
          <div class="small muted mt-s">${t('d.secretHint')}</div>
          <div class="secret mt-s">${x.a.secret}</div></details></td>
      <td>${trustRing(x.p.index, x.p.level, 44)}</td>
      <td>${x.a.status === 'active' ? html`<span class="tag green">${t('d.statusActive')}</span>` : html`<span class="tag amber">${t('d.statusPaused')}</span>`}</td>
      <td>${t.num(x.p.stats.total30)}<div class="small muted">${t.pct(x.p.stats.successRate)}</div></td>
      <td>${examCell(t, x)}</td>
      <td><div class="row">
        <a class="btn btn-sm" href="/me/agents/${x.a.id}/edit">${t('d.edit')}</a>
        <form method="post" action="/me/agents/${x.a.id}/${x.a.status === 'active' ? 'pause' : 'resume'}">${csrfField(csrf)}
          <button class="btn btn-sm">${x.a.status === 'active' ? t('d.pause') : t('d.resume')}</button></form>
      </div></td>
    </tr>`)}</tbody></table></div>`
    : html`<div class="card empty mb">${t('d.empty1')}<a class="grad" href="/publish">${t('d.emptyLink')}</a>${t('d.empty2')}</div>`}

  <h2 class="section-title">${t('d.keys')}</h2>
  <p class="section-sub">${t('d.keysSub')}</p>
  <div class="card form-card">
    <form method="post" action="/me/keys" class="row">
      ${csrfField(csrf)}
      <input type="text" name="name" placeholder="${t('d.keyPh')}" aria-label="${t('d.th.name')}">
      <button class="btn btn-primary">${t('d.keyCreate')}</button>
    </form>
    ${keys.length ? html`<table class="list mt"><thead><tr><th>${t('d.th.name')}</th><th>${t('d.th.key')}</th><th>${t('d.th.lastUsed')}</th><th></th></tr></thead><tbody>
      ${keys.map((k) => html`<tr><td>${k.name}</td><td><code>${k.prefix}…</code></td>
        <td class="muted">${k.last_used_at ? t.dateTime(k.last_used_at) : t('d.never')}</td>
        <td><form method="post" action="/me/keys/${k.id}/revoke">${csrfField(csrf)}<button class="btn btn-sm btn-danger">${t('d.revoke')}</button></form></td></tr>`)}
    </tbody></table>` : html`<p class="muted small mt-s">${t('d.noKeys')}</p>`}
  </div>
</main>`,
  });
}

function detailText(t, d) {
  if (!d) return '';
  if (d.key === 'ex.detail.latency') return t(d.key, { time: t.ms(d.ms) });
  if (d.key === 'ex.detail.error') return t(d.key, { error: describeTaskError(t, d.error) });
  if (d.key === 'ex.detail.judge') return t(d.key, { score: t.pct(d.score) });
  return t(d.key);
}

function substanceSection(t, latest, judgeEnabled) {
  const items = latest.results.filter((r) => r.group === 'substance');
  const status = latest.substance_status || 'off';
  let body;
  if (status === 'done') {
    body = html`<p class="small muted">${t('ex.substanceIntro')}</p>
      <div class="exam">${items.map((r) => html`<details class="exam-task">
        <summary class="exam-row">
          <span class="${r.pass ? 'ok' : 'danger'}">${r.pass ? '✓' : '✗'}</span>
          <span>${t('ex.task')} ${r.id.split('_')[1]} · <span class="muted small">${t(`ex.kind.${r.task.kind}`)} · ${t('ex.lang', { lang: t.lang(r.task.language) })}</span>
            ${r.grade?.summary ? html`<div class="small muted">${r.grade.summary}</div>` : r.detail ? html`<div class="small muted">${detailText(t, r.detail)}</div>` : ''}</span>
          <span class="small ${r.pass ? 'ok' : 'danger'}">${t.pct(r.score)}</span>
        </summary>
        <div class="exam-task-body">
          <div class="small muted">${t('ex.task')}</div><div class="msg user pre-wrap">${r.task.text}</div>
          ${r.answer ? html`<div class="small muted mt-s">${t('ex.answer')}</div><div class="msg agent pre-wrap">${r.answer}</div>` : ''}
          ${r.grade ? html`<div class="small muted mt-s">${t('ex.criteria')}</div>
            <ul class="criteria">${r.grade.criteria.map((c) => html`<li><span class="${c.met ? 'ok' : 'danger'}">${c.met ? '✓' : '✗'}</span> ${c.criterion}<div class="small muted">${c.comment}</div></li>`)}</ul>` : ''}
        </div>
      </details>`)}</div>`;
  } else if (status === 'error') {
    body = html`<div class="alert warn">${t('ex.substanceError')}</div>`;
  } else {
    body = html`<p class="small muted">${judgeEnabled ? t('ex.substanceNotRun') : t('ex.substanceOff')}</p>`;
  }
  return html`<h3 class="mt">${t('ex.group.substance')}</h3>${body}`;
}

export function examPage({ t, user, csrf, agent, latest, validity, cooldown, path, judgeEnabled, examsLeft, dailyLimit, limitHit }) {
  const byId = Object.fromEntries((latest?.results || []).map((r) => [r.id, r]));
  const group = (name) => html`<h3 class="mt">${t(`ex.group.${name}`)}</h3><div class="exam">
    ${EXAM_CHECKS[name].map((id) => {
      const r = byId[id];
      return html`<div class="exam-row">
        <span class="${r ? (r.pass ? 'ok' : 'danger') : 'muted'}">${r ? (r.pass ? '✓' : '✗') : '·'}</span>
        <span>${t(`ex.c.${id}`)}${r?.detail ? html`<div class="small muted">${detailText(t, r.detail)}</div>` : ''}</span>
        <span class="small ${r ? (r.pass ? 'ok' : 'danger') : 'muted'}">${r ? (r.pass ? t('ex.pass') : t('ex.fail')) : ''}</span>
      </div>`;
    })}</div>`;
  const running = latest?.status === 'running';
  return layout({
    t, title: t('ex.title', { name: agent.name }), user, csrf, active: 'me', path,
    body: html`<main class="container page"><div class="mid">
  <p class="mb"><a class="grad" href="/me">${t('ex.back')}</a></p>
  <div class="card form-card">
    <h1>${t('ex.title', { name: agent.name })}</h1>
    <p class="muted">${t('ex.sub')}</p>
    ${running ? html`<div class="alert warn mt">${t('ex.running')}</div>` : ''}
    ${latest?.status === 'failed' ? html`<div class="alert bad mt">${t('ex.failedRun')}</div>` : ''}
    ${!running && validity === 'outdated' ? html`<div class="alert warn mt">${t('ex.outdated')}</div>` : ''}
    ${!running && validity === 'expired' ? html`<div class="alert warn mt">${t('ex.expired')}</div>` : ''}
    ${latest?.status === 'done' ? html`<div class="kpis mt exam-kpis">
      <div class="card kpi"><span>${t('ex.substance')}</span><b>${t.pct(latest.substance_score)}</b></div>
      <div class="card kpi"><span>${t('ex.quality')}</span><b>${t.pct(latest.quality_score)}</b></div>
      <div class="card kpi"><span>${t('ex.safety')}</span><b>${t.pct(latest.safety_score)}</b></div>
      <div class="card kpi"><span>${t('ex.finished', { date: '' })}</span><b class="small">${t.dateTime(latest.finished_at)}</b></div>
    </div>` : ''}
    ${limitHit ? html`<div class="alert bad mt">${t('ex.dailyLimit', { limit: dailyLimit })}</div>` : ''}
    ${!latest ? html`<p class="mt">${t('ex.none')}</p>${judgeEnabled ? '' : html`<p class="small muted">${t('ex.substanceOff')}</p>`}` : ''}
    ${latest?.status === 'done' ? html`${substanceSection(t, latest, judgeEnabled)}${group('quality')}${group('safety')}` : ''}
    <div class="row space mt">
      <span class="small muted">${cooldown > 0 && !running ? t('ex.cooldown', { min: cooldown }) : ''}
        ${Number.isFinite(examsLeft) ? html`<br>${t('ex.examsLeft', { n: examsLeft })}` : ''}</span>
      ${running ? '' : html`<form method="post" action="/me/agents/${agent.id}/exam">${csrfField(csrf)}
        <button class="btn btn-primary" ${cooldown > 0 ? 'disabled' : ''}>${latest ? t('ex.rerun') : t('ex.run')}</button></form>`}
    </div>
  </div>
</div></main>`,
  });
}
