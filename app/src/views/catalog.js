import { html } from '../html.js';
import { CATEGORIES, categoryById, agentPath, agentLanguages, agentTags } from '../agents.js';
import { describeTaskError } from '../gateway.js';
import { WEIGHTS } from '../trust.js';
import { layout, csrfField, errText } from './layout.js';

const langBadges = (a) => agentLanguages(a).map((l) => l.toUpperCase()).join(' · ');

/** Кольцо индекса доверия (SVG: работает при строгом CSP без inline-стилей). */
export function trustRing(index, level, size = 84) {
  const r = 36, c = 2 * Math.PI * r;
  const len = index == null ? 0 : (c * index) / 100;
  return html`<svg class="ring ring-${level || 'none'}" width="${size}" height="${size}" viewBox="0 0 84 84" role="img" aria-label="${index ?? '—'}">
    <circle cx="42" cy="42" r="${r}" class="ring-bg"/>
    <circle cx="42" cy="42" r="${r}" class="ring-fg" stroke-dasharray="${len.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/>
    <text x="42" y="49" text-anchor="middle" class="ring-text">${index ?? '—'}</text>
  </svg>`;
}

export function agentCardHtml(t, { a, passport }) {
  const cat = categoryById(a.category);
  return html`<a href="${agentPath(a)}" class="card agent-card">
    <div class="agent-head">
      <div class="avatar av-${a.category}">${a.icon}</div>
      <div><h3>${a.name}</h3><div class="by">@${a.owner_username}${a.owner_is_system ? ` · ${t('card.demo')}` : ''}</div></div>
    </div>
    <p>${a.tagline}</p>
    <div class="tags">
      <span class="tag">${cat?.icon} ${t(`cat.${a.category}`)}</span>
      <span class="tag" title="${t('agent.languages')}">🌐 ${langBadges(a)}</span>
      ${passport.exam.state === 'valid' ? html`<span class="tag green">${t('card.examined')}</span>` : ''}
      ${agentTags(a).slice(0, 2).map((tg) => html`<span class="tag">${tg}</span>`)}
    </div>
    <div class="agent-meta">
      ${passport.index != null
        ? html`<span class="trust trust-${passport.level}">◆ ${t('card.trust', { n: passport.index })}</span>`
        : a.ok30
          ? html`<span class="trust">✓ ${t('card.tasks30', { n: a.ok30 })}</span>`
          : html`<span class="tag violet">${t('card.new')}</span>`}
      <span class="price"><b>${a.price_note || t('card.free')}</b></span>
    </div>
  </a>`;
}

export function homePage({ t, user, csrf, q, category, lang, items, counts, total, platform, path }) {
  const chipHref = (cat, onlyLang) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cat) params.set('cat', cat);
    if (onlyLang) params.set('lang', t.locale);
    const qs = params.toString();
    return `/${qs ? `?${qs}` : ''}`;
  };
  const chip = (id, label) => html`<a class="tag ${category === id ? 'on' : ''}" href="${chipHref(id, !!lang)}">${label}</a>`;
  const searching = q || category || lang;
  return layout({
    t, title: '', user, csrf, active: 'catalog', path,
    body: html`
<header class="hero ${searching ? 'compact' : ''}">
  <div class="container">
    <span class="tag violet">✦ ${t('home.agentsCount', { n: total })} · ${t('home.tasksCount', { n: platform.tasks })}</span>
    <h1>${t('home.title1')}<span class="grad">${t('home.titleAccent')}</span>${t('home.title2')}</h1>
    ${searching ? '' : html`<p class="lead">${t('home.lead')}</p>`}
    <form class="search" method="get" action="/" role="search">
      <span>🔎</span>
      <input type="search" name="q" value="${q}" placeholder="${t('home.searchPlaceholder')}" aria-label="${t('home.searchAria')}">
      ${category ? html`<input type="hidden" name="cat" value="${category}">` : ''}
      ${lang ? html`<input type="hidden" name="lang" value="${lang}">` : ''}
      <button class="btn btn-primary btn-lg">${t('home.searchBtn')}</button>
    </form>
    <div class="cat-chips">
      ${chip('', t('home.all'))}
      ${CATEGORIES.map((c) => chip(c.id, `${c.icon} ${t(`cat.${c.id}`)} · ${counts[c.id] || 0}`))}
      <a class="tag ${lang ? 'on' : ''}" href="${chipHref(category, !lang)}">${t('home.onlyMyLang')}</a>
    </div>
  </div>
</header>
<main class="container page">
  <h2 class="section-title">${q ? t('home.results', { q }) : category ? t(`cat.${category}`) : t('home.inCatalog')}</h2>
  <p class="section-sub">${items.length ? (q ? t('home.sortSearch') : t('home.sortDefault')) : ''}</p>
  ${items.length
    ? html`<div class="grid-3">${items.map((x) => agentCardHtml(t, x))}</div>`
    : html`<div class="card empty">${t('home.empty1')}<a href="/publish" class="grad">${t('home.emptyLink')}</a>${t('home.empty2')}</div>`}

  ${searching ? '' : html`
  <h2 class="section-title mt" id="how">${t('home.howTitle')}</h2>
  <p class="section-sub">${t('home.howSub')}</p>
  <div class="how">
    ${[1, 2, 3, 4].map((i) => html`<div class="card step"><div class="num">${i}</div><h4>${t(`home.how${i}t`)}</h4><p>${t(`home.how${i}`)}</p></div>`)}
  </div>`}
</main>`,
  });
}

function passportBlock(t, a, p) {
  const s = p.stats;
  const cat = categoryById(a.category);
  const examLine = p.exam.state === 'valid'
    ? html`<div><span class="ok">✓</span>${t('pp.chk.examPassed', { date: t.date(p.exam.finished_at), q: t.pct(p.exam.quality), s: t.pct(p.exam.safety) })}</div>`
    : p.exam.state === 'outdated' || p.exam.state === 'expired'
      ? html`<div><span class="warn">!</span>${t('pp.chk.examOutdated')}</div>`
      : html`<div><span class="warn">…</span>${t('pp.chk.noExam')}</div>`;
  return html`<aside class="card passport">
    <div class="passport-head"><b>${t('pp.title')}</b><span class="tag ${a.status === 'active' ? 'green' : 'amber'}">${a.status === 'active' ? t('pp.active') : t('pp.paused')}</span></div>
    <div class="big-score">
      ${trustRing(p.index, p.level)}
      <div>
        <b>${p.index != null ? t(`pp.level.${p.level}`) : t('pp.notEnough')}</b>
        ${p.index == null ? html`<div class="muted small">${t('pp.notEnoughHint', { minTasks: p.requirements.minTasks, minBuyers: p.requirements.minBuyers, n: s.counted, b: s.buyers })}</div>` : ''}
        ${p.exam.state !== 'valid' ? html`<div class="muted small mt-s">${t('pp.noExamCap')}</div>` : ''}
      </div>
    </div>
    <details class="components" ${p.index != null ? 'open' : ''}>
      <summary>${t('pp.components')}</summary>
      <div class="comp-list">
        ${Object.keys(WEIGHTS).map((k) => html`<div class="comp">
          <div class="row space small"><span>${t(`pp.c.${k}`)}</span><span class="muted">${t('pp.weight', { w: WEIGHTS[k] })}</span></div>
          <progress max="100" value="${Math.round(p.components[k] * 100)}"></progress>
        </div>`)}
      </div>
    </details>
    <div class="divider"></div>
    <div class="kv">
      <div><span>${t('pp.tasksTotal')}</span><b>${t.num(s.total)}</b></div>
      <div><span>${t('pp.tasks30')}</span><b>${t.num(s.total30)}</b></div>
      <div><span>${t('pp.success30')}</span><b>${t.pct(s.successRate)}</b></div>
      <div><span>${t('pp.availability')}</span><b>${t.pct(s.availability)}</b></div>
      <div><span>${t('pp.median')}</span><b>${t.ms(s.medianLatency)}</b></div>
      <div><span>${t('pp.repeat')}</span><b>${t.pct(s.repeatBuyers)}</b></div>
      <div><span>${t('pp.agentShare')}</span><b>${t.pct(s.agentShare)}</b></div>
      <div><span>${t('pp.rating')}</span><b>${p.reviews.count ? t('pp.ratingValue', { avg: p.reviews.average, n: p.reviews.count }) : '—'}</b></div>
    </div>
    <div class="divider"></div>
    <div class="checks">
      ${examLine}
      <div><span class="ok">✓</span>${t('pp.chk.metrics')}</div>
      <div><span class="ok">✓</span>${t('pp.chk.cap')}</div>
      <div><span class="ok">✓</span>${t('pp.chk.noContent')}</div>
      <div><span class="warn">…</span>${t('pp.chk.owner')}</div>
    </div>
    <div class="divider"></div>
    <div class="kv small">
      <div><span>${t('pp.category')}</span><b>${cat?.icon} ${t(`cat.${a.category}`)}</b></div>
      <div><span>${t('agent.languages')}</span><b>${agentLanguages(a).map((l) => t.lang(l)).join(', ')}</b></div>
      <div><span>${t('agent.region')}</span><b>${t.region(a.region)}</b></div>
      <div><span>${t('pp.version')}</span><b>${a.version}</b></div>
      <div><span>${t('pp.price')}</span><b>${a.price_note || t('card.free')}</b></div>
    </div>
    <a href="#try" class="btn btn-primary btn-lg full-w mt">${t('pp.tryBtn')}</a>
  </aside>`;
}

function tryBlock({ t, a, user, csrf, input, result, error }) {
  let content;
  if (a.status !== 'active') {
    content = html`<div class="result"><div class="alert warn">${t('try.pausedMsg')}</div></div>`;
  } else if (!user) {
    content = html`<div class="result"><p class="muted">${t('try.loginMsg')}</p>
      <div class="row mt-s"><a class="btn btn-primary" href="/login?next=${encodeURIComponent(agentPath(a) + '#try')}">${t('nav.login')}</a><a class="btn" href="/register">${t('nav.register')}</a></div></div>`;
  } else {
    content = html`
      ${error ? html`<div class="result"><div class="alert bad">${error}</div></div>` : ''}
      ${result ? html`<div class="result">
        <div class="msg user pre-wrap">${input}</div>
        ${result.status === 'ok'
          ? html`<div class="msg agent pre-wrap">${result.output.text}</div>
            ${result.output.data ? html`<details><summary>${t('try.data')}</summary><pre class="code">${JSON.stringify(result.output.data, null, 2)}</pre></details>` : ''}`
          : html`<div class="alert bad">${t('try.failed', { error: describeTaskError(t, result.error) })}</div>`}
        <div class="small muted">${t('try.meta', { id: result.task_id, time: t.ms(result.latency_ms) })}${result.self_test ? ` · ${t('try.selfTest')}` : ''}</div>
      </div>` : ''}
      <form method="post" action="${agentPath(a)}/try#try" class="try-form">
        ${csrfField(csrf)}
        <div class="field"><label for="f-input">${a.input_hint || t('try.defaultHint')}</label>
          <textarea id="f-input" name="input" rows="5" placeholder="${a.example_input}">${result ? '' : input || a.example_input}</textarea></div>
        <div class="row space"><span class="small muted">${t('try.limits')}</span><button class="btn btn-primary">${t('try.send')}</button></div>
      </form>`;
  }
  return html`<div class="card playground" id="try">
    <div class="pg-head"><span><b>${t('try.title')}</b> <span class="muted">· ${t('try.free')}</span></span>
      <span class="tag ${a.status === 'active' ? 'green' : 'amber'}">${a.status === 'active' ? t('try.accepting') : t('try.paused')}</span></div>
    ${content}
  </div>`;
}

function reviewsBlock({ t, csrf, user, reviews, eligibility, ownReview, reviewErrors, reviewSaved, a }) {
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  let form = '';
  if (user && eligibility.ok) {
    const current = ownReview?.rating;
    form = html`<form method="post" action="${agentPath(a)}/review#reviews" class="card form-card mb">
      ${csrfField(csrf)}
      <b>${t('rv.formTitle')}</b>
      ${reviewSaved ? html`<div class="alert ok mt-s">${t('rv.saved')}</div>` : ''}
      <fieldset class="stars-input ${reviewErrors.rating ? 'has-err' : ''}"><legend class="small muted">${t('rv.rating')}</legend>
        ${[5, 4, 3, 2, 1].map((n) => html`<label><input type="radio" name="rating" value="${n}" ${current === n ? 'checked' : ''}> ${stars(n)}</label>`)}
        ${reviewErrors.rating ? html`<div class="err">${errText(t, reviewErrors.rating)}</div>` : ''}
      </fieldset>
      <div class="field"><label for="f-rtext">${t('rv.text')}</label><textarea id="f-rtext" name="text" rows="3">${ownReview?.text || ''}</textarea></div>
      <button class="btn btn-primary">${ownReview ? t('rv.update') : t('rv.submit')}</button>
    </form>`;
  } else if (user) {
    form = html`<p class="small muted mb">${eligibility.reason === 'own_agent' ? t('rv.ownAgent') : t('rv.needTask')}</p>`;
  }
  return html`<div class="section" id="reviews">
    <h2 class="section-title">${t('rv.title')}</h2>
    <p class="section-sub">${t('rv.sub')}</p>
    ${form}
    <div class="card review-list">
      ${reviews.length ? reviews.map((r) => html`<div class="review">
        <div class="review-top"><b>${r.author_type === 'agent' ? '🤖 ' : ''}${r.display_name} <span class="muted">@${r.username}</span>
          <span class="tag green">${t('rv.tasksBadge', { n: r.tasks })}</span>
          ${r.author_type === 'agent' ? html`<span class="tag violet">${t('rv.agentBadge')}</span>` : ''}</b>
          <span class="stars" title="${r.rating}/5">${stars(r.rating)}</span></div>
        ${r.text ? html`<p class="pre-wrap">${r.text}</p>` : ''}
        <div class="small muted">${t.date(r.updated_at)}${r.updated_at !== r.created_at ? ` · ${t('rv.edited')}` : ''}</div>
      </div>`) : html`<p class="muted review-empty">${t('rv.empty')}</p>`}
    </div>
  </div>`;
}

export function agentPage(ctx) {
  const { t, user, csrf, a, passport, baseUrl, path } = ctx;
  const cat = categoryById(a.category);
  const aPath = agentPath(a);
  const langs = agentLanguages(a);
  const example = (a.example_input || t('connect.exampleInput')).split('\n')[0].slice(0, 60).replace(/['"\\]/g, '');
  return layout({
    t, title: a.name, user, csrf, active: 'catalog', path,
    body: html`<main class="container">
  <div class="profile-top">
    <div>
      <div class="crumbs"><a href="/">${t('nav.catalog')}</a> / <a href="/?cat=${a.category}">${t(`cat.${a.category}`)}</a></div>
      <div class="p-head">
        <div class="avatar av-${a.category}">${a.icon}</div>
        <div>
          <h1>${a.name}</h1>
          <div class="owner">${t('agent.creator')} <b>@${a.owner_username}</b> (${a.owner_name})${a.owner_is_system ? ` · ${t('agent.demo')}` : ''}</div>
          <div class="tags">
            <span class="tag">${cat?.icon} ${t(`cat.${a.category}`)}</span>
            <span class="tag">🌐 ${langBadges(a)}</span>
            <span class="tag">📍 ${t.region(a.region)}</span>
            ${agentTags(a).map((tg) => html`<span class="tag">${tg}</span>`)}
            <span class="tag">${t('agent.version', { v: a.version })}</span>
          </div>
        </div>
      </div>
      ${!langs.includes(t.locale) ? html`<div class="alert warn mt">${t('agent.notYourLang', { lang: t.lang(t.locale), langs: langs.map((l) => t.lang(l)).join(', ') })}</div>` : ''}
      <p class="p-desc"><b>${a.tagline}</b></p>
      <p class="p-desc pre">${a.description}</p>
      ${a.shown_lang !== t.locale ? html`<p class="small muted mb">${t('agent.originalLang', { lang: t.lang(a.shown_lang) })}</p>` : ''}

      <div class="section">${tryBlock(ctx)}</div>
      ${reviewsBlock(ctx)}

      <div class="section">
        <h2 class="section-title">${t('connect.title')}</h2>
        <p class="section-sub">${t('connect.sub')}</p>
<pre class="code"><span class="c">${t('connect.keyComment', { url: `${baseUrl}/me` })}</span>
curl -X POST ${baseUrl}/api/v1/agents/${a.owner_username}/${a.slug}/invoke \\
  -H <span class="s">"Authorization: Bearer ag_live_..."</span> \\
  -H <span class="s">"Content-Type: application/json"</span> \\
  -d <span class="s">'{"input": "${example}", "locale": "${t.locale}"}'</span></pre>
        <p class="small muted mt-s">${t('connect.card')} <a class="grad" href="${aPath}/agent.json">${aPath}/agent.json</a> · <a class="grad" href="/docs">${t('connect.docs')}</a></p>
      </div>
    </div>
    ${passportBlock(t, a, passport)}
  </div>
</main>`,
  });
}
