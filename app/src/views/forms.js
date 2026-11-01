import { html } from '../html.js';
import { CATEGORIES } from '../agents.js';
import { AGENT_LANGUAGES, REGIONS, UI_LOCALES } from '../i18n/index.js';
import { layout, csrfField, field, errText } from './layout.js';

export function loginPage({ t, user, csrf, values = {}, error, next = '', path }) {
  return layout({
    t, title: t('login.title'), user, csrf, path,
    body: html`<main class="container page"><form method="post" action="/login" class="card form-card narrow">
      ${csrfField(csrf)}<input type="hidden" name="next" value="${next}">
      <h1>${t('login.title')}</h1><p class="muted mb">${t('login.noAccount')} <a class="grad" href="/register">${t('login.signup')}</a></p>
      ${error ? html`<div class="alert bad">${error}</div>` : ''}
      ${field({ t, name: 'username', label: t('login.username'), value: values.username })}
      ${field({ t, name: 'password', label: t('login.password'), type: 'password' })}
      <button class="btn btn-primary btn-lg full-w">${t('login.submit')}</button>
    </form></main>`,
  });
}

export function registerPage({ t, user, csrf, values = {}, errors = {}, path }) {
  return layout({
    t, title: t('reg.title'), user, csrf, path,
    body: html`<main class="container page"><form method="post" action="/register" class="card form-card narrow">
      ${csrfField(csrf)}
      <h1>${t('reg.title')}</h1><p class="muted mb">${t('reg.sub')}</p>
      ${field({ t, name: 'username', label: t('reg.username'), value: values.username, error: errors.username, placeholder: 'lex_lab', help: t('reg.usernameHelp') })}
      ${field({ t, name: 'display_name', label: t('reg.displayName'), value: values.display_name, error: errors.display_name, placeholder: 'Lex Lab' })}
      ${field({ t, name: 'password', label: t('reg.password'), type: 'password', error: errors.password, help: t('reg.passwordHelp') })}
      <button class="btn btn-primary btn-lg full-w">${t('reg.submit')}</button>
    </form></main>`,
  });
}

function select({ t, name, label, value, options, error, help }) {
  return html`<div class="field ${error ? 'has-err' : ''}"><label for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}">${options.map((o) => html`<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`)}</select>
    ${error ? html`<div class="err">${errText(t, error)}</div>` : ''}${help ? html`<div class="help">${help}</div>` : ''}</div>`;
}

export function agentFormPage({ t, user, csrf, mode, values = {}, errors = {}, agent = null, devEndpoints, path }) {
  const isEdit = mode === 'edit';
  const action = isEdit ? `/me/agents/${agent.id}/edit` : '/publish';
  const hasErrors = Object.keys(errors).length > 0;
  const primary = values.primary_lang || t.locale;
  const chosenLangs = values.languages?.length ? values.languages : [primary];
  const langOptions = AGENT_LANGUAGES.map((l) => ({ value: l, label: `${t.lang(l)} (${l})` }));
  // Переводы карточки предлагаем для языков интерфейса Agora, кроме языка оригинала
  const trLangs = UI_LOCALES.filter((l) => l !== primary);

  return layout({
    t, title: isEdit ? t('af.titleEdit', { name: agent.name }) : t('af.titleCreate'), user, csrf, active: 'me', path,
    body: html`<main class="container page"><form method="post" action="${action}" class="card form-card mid">
      ${csrfField(csrf)}
      <h1>${isEdit ? t('af.titleEdit', { name: agent.name }) : t('af.titleCreate')}</h1>
      <p class="muted mb">${t('af.lead1')}<a class="grad" href="/docs#protocol">${t('af.protocolLink')}</a>${t('af.lead2')}<a class="grad" href="/docs#template">${t('af.templateLink')}</a>.</p>
      ${hasErrors ? html`<div class="alert bad">${t('af.hasErrors')}</div>` : ''}

      <div class="grid-icon">
        ${field({ t, name: 'icon', label: t('af.icon'), value: values.icon || '🤖', error: errors.icon })}
        ${field({ t, name: 'name', label: t('af.name'), value: values.name, error: errors.name, placeholder: t('af.namePh') })}
        ${field({ t, name: 'slug', label: t('af.slug'), value: values.slug, error: errors.slug, placeholder: 'lease-reviewer', help: t('af.slugHelp') })}
      </div>
      ${field({ t, name: 'tagline', label: t('af.tagline'), value: values.tagline, error: errors.tagline, placeholder: t('af.taglinePh') })}
      ${field({ t, name: 'description', label: t('af.description'), value: values.description, error: errors.description, textarea: true, rows: 6, help: t('af.descriptionHelp') })}
      <div class="grid-2">
        ${select({ t, name: 'category', label: t('af.category'), value: values.category, error: errors.category,
          options: [{ value: '', label: t('af.choose') }, ...CATEGORIES.map((c) => ({ value: c.id, label: `${c.icon} ${t(`cat.${c.id}`)}` }))] })}
        ${field({ t, name: 'tags', label: t('af.tags'), value: values.tags, error: errors.tags, placeholder: t('af.tagsPh') })}
      </div>

      <div class="divider"></div>
      <h2 class="section-title">${t('af.langSection')}</h2>
      <div class="grid-2">
        ${select({ t, name: 'primary_lang', label: t('af.primaryLang'), value: primary, error: errors.primary_lang, options: langOptions })}
        ${select({ t, name: 'region', label: t('af.region'), value: values.region || 'global', error: errors.region, help: t('af.regionHelp'),
          options: REGIONS.map((r) => ({ value: r, label: t.region(r) })) })}
      </div>
      <fieldset class="field lang-boxes ${errors.languages ? 'has-err' : ''}">
        <legend>${t('af.languages')}</legend>
        <div class="checks-grid">${AGENT_LANGUAGES.map((l) => html`<label class="check"><input type="checkbox" name="languages" value="${l}" ${chosenLangs.includes(l) ? 'checked' : ''}> ${t.lang(l)}</label>`)}</div>
        ${errors.languages ? html`<div class="err">${errText(t, errors.languages)}</div>` : ''}
        <div class="help">${t('af.languagesHelp')}</div>
      </fieldset>

      <div class="divider"></div>
      ${field({ t, name: 'endpoint', label: t('af.endpoint'), value: values.endpoint, error: errors.endpoint, type: 'url',
        placeholder: devEndpoints ? 'http://localhost:4100/agent' : 'https://api.example.com/agent',
        help: devEndpoints ? t('af.endpointHelpDev') : t('af.endpointHelp') })}
      <div class="grid-2">
        ${field({ t, name: 'input_hint', label: t('af.inputHint'), value: values.input_hint, error: errors.input_hint, placeholder: t('af.inputHintPh') })}
        ${field({ t, name: 'price_note', label: t('af.price'), value: values.price_note, error: errors.price_note, placeholder: t('af.pricePh') })}
      </div>
      ${field({ t, name: 'example_input', label: t('af.example'), value: values.example_input, error: errors.example_input, textarea: true, rows: 3, help: t('af.exampleHelp') })}
      ${field({ t, name: 'version', label: t('af.version'), value: values.version || '1.0', error: errors.version })}

      ${trLangs.map((l) => {
        const k = (f) => `tr_${l}_${f}`;
        const open = ['name', 'tagline', 'description', 'input_hint', 'example_input'].some((f) => values[k(f)] || errors[k(f)]);
        return html`<details class="translation mt" ${open ? 'open' : ''}>
          <summary><b>${t('af.trTitle', { lang: t.lang(l) })}</b></summary>
          <p class="help mt-s">${t('af.trHelp')}</p>
          ${field({ t, name: k('name'), label: t('af.name'), value: values[k('name')], error: errors[k('name')] })}
          ${field({ t, name: k('tagline'), label: t('af.tagline'), value: values[k('tagline')], error: errors[k('tagline')] })}
          ${field({ t, name: k('description'), label: t('af.description'), value: values[k('description')], error: errors[k('description')], textarea: true, rows: 5 })}
          ${field({ t, name: k('input_hint'), label: t('af.inputHint'), value: values[k('input_hint')], error: errors[k('input_hint')] })}
          ${field({ t, name: k('example_input'), label: t('af.example'), value: values[k('example_input')], error: errors[k('example_input')], textarea: true, rows: 3 })}
        </details>`;
      })}

      <div class="row space mt">
        <a href="/me" class="btn">${t('af.cancel')}</a>
        <button class="btn btn-primary btn-lg">${isEdit ? t('af.save') : t('af.publish')}</button>
      </div>
    </form>
    ${isEdit ? html`<div class="card form-card mid mt">
      <h2 class="section-title">${t('af.danger')}</h2>
      <div class="row space mt-s">
        <span class="muted small">${t('af.rotateText')}</span>
        <form method="post" action="/me/agents/${agent.id}/rotate-secret">${csrfField(csrf)}<button class="btn btn-sm">${t('af.rotateBtn')}</button></form>
      </div>
      <div class="row space mt-s">
        <span class="muted small">${t('af.deleteText')}</span>
        <form method="post" action="/me/agents/${agent.id}/delete">${csrfField(csrf)}<button class="btn btn-sm btn-danger">${t('af.deleteBtn')}</button></form>
      </div>
    </div>` : ''}
    </main>`,
  });
}
