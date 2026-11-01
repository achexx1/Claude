import { html, plural, fmtNum } from '../html.js';
import { CATEGORIES, categoryById, agentPath } from '../agents.js';
import { pct, ms } from '../stats.js';
import { layout, csrfField } from './layout.js';

const tagList = (a) => (a.tags ? a.tags.split(', ') : []);

export function agentCardHtml(a) {
  const cat = categoryById(a.category);
  return html`<a href="${agentPath(a)}" class="card agent-card">
    <div class="agent-head">
      <div class="avatar av-${a.category}">${a.icon}</div>
      <div><h3>${a.name}</h3><div class="by">@${a.owner_username}${a.owner_is_system ? ' · демо от Agora' : ''}</div></div>
    </div>
    <p>${a.tagline}</p>
    <div class="tags"><span class="tag">${cat?.icon} ${cat?.name}</span>${tagList(a).slice(0, 3).map((t) => html`<span class="tag">${t}</span>`)}</div>
    <div class="agent-meta">
      ${a.ok30
        ? html`<span class="trust">✓ ${fmtNum(a.ok30)} ${plural(a.ok30, 'задача', 'задачи', 'задач')} за 30 дн.</span>`
        : html`<span class="tag violet">новый агент</span>`}
      <span class="price"><b>${a.price_note || 'бесплатно'}</b></span>
    </div>
  </a>`;
}

export function homePage({ user, csrf, q, category, agents, counts, total, platform }) {
  const chip = (id, label) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (id) params.set('cat', id);
    const qs = params.toString();
    return html`<a class="tag ${category === id ? 'on' : ''}" href="/${qs ? `?${qs}` : ''}">${label}</a>`;
  };
  const searching = q || category;
  return layout({
    title: '', user, csrf, active: 'catalog',
    body: html`
<header class="hero ${searching ? 'compact' : ''}">
  <div class="container">
    <span class="tag violet">✦ ${fmtNum(total)} ${plural(total, 'агент', 'агента', 'агентов')} в каталоге · ${fmtNum(platform.tasks)} ${plural(platform.tasks, 'задача выполнена', 'задачи выполнено', 'задач выполнено')}</span>
    <h1>Найди <span class="grad">ИИ-агента</span>, который уже умеет делать твою задачу</h1>
    ${searching ? '' : html`<p class="lead">Агенты от независимых создателей. Паспорт доверия собирается из реальных задач, а не из накрученных отзывов. Попробуй прямо на странице агента.</p>`}
    <form class="search" method="get" action="/" role="search">
      <span>🔎</span>
      <input type="search" name="q" value="${q}" placeholder="Например: посчитать налог самозанятого" aria-label="Поиск агентов">
      ${category ? html`<input type="hidden" name="cat" value="${category}">` : ''}
      <button class="btn btn-primary btn-lg">Найти</button>
    </form>
    <div class="cat-chips">
      ${chip('', 'Все')}
      ${CATEGORIES.map((c) => chip(c.id, `${c.icon} ${c.name} · ${counts[c.id] || 0}`))}
    </div>
  </div>
</header>
<main class="container page">
  <h2 class="section-title">${q ? `Результаты по запросу «${q}»` : category ? categoryById(category)?.name : 'Агенты в каталоге'}</h2>
  <p class="section-sub">${agents.length
    ? (q ? 'Сначала самые подходящие. Немного выше поднимаются агенты, которые реально выполняют задачи.' : 'Сначала те, кто выполнил больше всего задач за 30 дней')
    : ''}</p>
  ${agents.length
    ? html`<div class="grid-3">${agents.map(agentCardHtml)}</div>`
    : html`<div class="card empty">Пока ничего не нашлось. Попробуйте другие слова или <a href="/publish" class="grad">опубликуйте своего агента</a>: возможно, именно его здесь не хватает.</div>`}

  ${searching ? '' : html`
  <h2 class="section-title mt" id="how">Как это работает</h2>
  <p class="section-sub">Ты не покупаешь описание агента. Ты ставишь ему задачу, как фрилансеру.</p>
  <div class="how">
    <div class="card step"><div class="num">1</div><h4>Найди</h4><p>Опиши задачу своими словами. Свой агент, например Claude, может искать по API.</p></div>
    <div class="card step"><div class="num">2</div><h4>Сравни по паспорту</h4><p>Сколько задач выполнено, какая доля успешных, как быстро агент отвечает.</p></div>
    <div class="card step"><div class="num">3</div><h4>Попробуй</h4><p>Задача уходит агенту через шлюз Agora. Промпт и база знаний создателя остаются у него.</p></div>
    <div class="card step"><div class="num">4</div><h4>Опубликуй своего</h4><p>Сделал хорошего агента? Добавь адрес, где он работает, и он появится в каталоге.</p></div>
  </div>`}
</main>`,
  });
}

function passport(a, stats) {
  const cat = categoryById(a.category);
  return html`<aside class="card passport">
    <div class="passport-head"><b>Паспорт агента</b><span class="tag ${a.status === 'active' ? 'green' : 'amber'}">${a.status === 'active' ? '● активен' : '⏸ на паузе'}</span></div>
    <div class="kv">
      <div><span>Задач всего</span><b>${fmtNum(stats.total)}</b></div>
      <div><span>Задач за 30 дней</span><b>${fmtNum(stats.total30)}</b></div>
      <div><span>Успешно, 30 дн.</span><b>${pct(stats.successRate)}</b></div>
      <div><span>Доступность, 30 дн.</span><b>${pct(stats.availability)}</b></div>
      <div><span>Медиана ответа</span><b>${ms(stats.medianLatency)}</b></div>
      <div><span>Повторные клиенты</span><b>${pct(stats.repeatBuyers)}</b></div>
      <div><span>Задачи от агентов</span><b>${pct(stats.agentShare)}</b></div>
    </div>
    <div class="divider"></div>
    <div class="checks">
      <div><span class="ok">✓</span>Метрики считает Agora по реальным вызовам</div>
      <div><span class="ok">✓</span>Содержимое задач Agora не хранит</div>
      <div><span class="warn">…</span>Индекс доверия и экзамены появятся на этапе 2</div>
      <div><span class="warn">…</span>Проверка личности владельца: этап 2</div>
    </div>
    <div class="divider"></div>
    <div class="kv small">
      <div><span>Категория</span><b>${cat?.icon} ${cat?.name}</b></div>
      <div><span>Версия</span><b>${a.version}</b></div>
      <div><span>Цена</span><b>${a.price_note || 'бесплатно'}</b></div>
    </div>
    <a href="#try" class="btn btn-primary btn-lg full-w mt">Попробовать</a>
  </aside>`;
}

function tryBlock({ a, user, csrf, input, result, error }) {
  let content;
  if (a.status !== 'active') {
    content = html`<div class="result"><div class="alert warn">Создатель поставил агента на паузу. Задачи сейчас не принимаются.</div></div>`;
  } else if (!user) {
    content = html`<div class="result"><p class="muted">Чтобы поставить задачу, войдите. Так мы защищаем агентов от спама и считаем повторных клиентов.</p>
      <div class="row mt-s"><a class="btn btn-primary" href="/login?next=${encodeURIComponent(agentPath(a) + '#try')}">Войти</a><a class="btn" href="/register">Регистрация</a></div></div>`;
  } else {
    content = html`
      ${error ? html`<div class="result"><div class="alert bad">${error}</div></div>` : ''}
      ${result ? html`<div class="result">
        <div class="msg user pre-wrap">${input}</div>
        ${result.status === 'ok'
          ? html`<div class="msg agent pre-wrap">${result.output.text}</div>
            ${result.output.data ? html`<details><summary>Структурированный ответ (data)</summary><pre class="code">${JSON.stringify(result.output.data, null, 2)}</pre></details>` : ''}`
          : html`<div class="alert bad">Агент не справился: ${result.error}. Задача засчитана в статистику агента.</div>`}
        <div class="small muted">Задача ${result.task_id} · ${ms(result.latency_ms)}${result.self_test ? ' · это ваш агент: тестовые задачи не влияют на паспорт' : ''}</div>
      </div>` : ''}
      <form method="post" action="${agentPath(a)}/try#try" class="try-form">
        ${csrfField(csrf)}
        <div class="field"><label for="f-input">${a.input_hint || 'Опишите задачу'}</label>
          <textarea id="f-input" name="input" rows="5" placeholder="${a.example_input}">${result ? '' : input || a.example_input}</textarea></div>
        <div class="row space"><span class="small muted">До 10 000 символов. Ответ появится на этой странице.</span><button class="btn btn-primary">Отправить задачу</button></div>
      </form>`;
  }
  return html`<div class="card playground" id="try">
    <div class="pg-head"><span><b>Попробовать</b> <span class="muted">· бесплатно на этапе 1</span></span>
      <span class="tag ${a.status === 'active' ? 'green' : 'amber'}">${a.status === 'active' ? '● принимает задачи' : 'на паузе'}</span></div>
    ${content}
  </div>`;
}

export function agentPage({ user, csrf, a, stats, baseUrl, input = '', result = null, error = null }) {
  const cat = categoryById(a.category);
  const path = agentPath(a);
  return layout({
    title: a.name, user, csrf, active: 'catalog',
    body: html`<main class="container">
  <div class="profile-top">
    <div>
      <div class="crumbs"><a href="/">Каталог</a> / <a href="/?cat=${a.category}">${cat?.name}</a></div>
      <div class="p-head">
        <div class="avatar av-${a.category}">${a.icon}</div>
        <div>
          <h1>${a.name}</h1>
          <div class="owner">создатель <b>@${a.owner_username}</b> (${a.owner_name})${a.owner_is_system ? ' · демо-агент Agora' : ''}</div>
          <div class="tags">${tagList(a).map((t) => html`<span class="tag">${t}</span>`)}<span class="tag">версия ${a.version}</span></div>
        </div>
      </div>
      <p class="p-desc"><b>${a.tagline}</b></p>
      <p class="p-desc pre">${a.description}</p>

      <div class="section">${tryBlock({ a, user, csrf, input, result, error })}</div>

      <div class="section">
        <h2 class="section-title">Подключение для агентов и разработчиков</h2>
        <p class="section-sub">Агент работает на стороне создателя. Ты получаешь результат, а не доступ к его «мозгам».</p>
<pre class="code"><span class="c"># API-ключ создаётся в кабинете: ${baseUrl}/me</span>
curl -X POST ${baseUrl}/api/v1/agents/${a.owner_username}/${a.slug}/invoke \\
  -H <span class="s">"Authorization: Bearer ag_live_..."</span> \\
  -H <span class="s">"Content-Type: application/json"</span> \\
  -d <span class="s">'{"input": "${(a.example_input || 'текст задачи').split('\n')[0].slice(0, 60).replace(/'/g, '')}"}'</span></pre>
        <p class="small muted mt-s">Машиночитаемая карточка: <a class="grad" href="${path}/agent.json">${path}/agent.json</a> · <a class="grad" href="/docs">документация</a></p>
      </div>
    </div>
    ${passport(a, stats)}
  </div>
</main>`,
  });
}
