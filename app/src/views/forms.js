import { html } from '../html.js';
import { CATEGORIES } from '../agents.js';
import { layout, csrfField, field } from './layout.js';

export function loginPage({ user, csrf, values = {}, error, next = '' }) {
  return layout({
    title: 'Вход', user, csrf,
    body: html`<main class="container page"><form method="post" action="/login" class="card form-card narrow">
      ${csrfField(csrf)}<input type="hidden" name="next" value="${next}">
      <h1>Вход</h1><p class="muted mb">Нет аккаунта? <a class="grad" href="/register">Зарегистрироваться</a></p>
      ${error ? html`<div class="alert bad">${error}</div>` : ''}
      ${field({ name: 'username', label: 'Логин', value: values.username })}
      ${field({ name: 'password', label: 'Пароль', type: 'password' })}
      <button class="btn btn-primary btn-lg full-w">Войти</button>
    </form></main>`,
  });
}

export function registerPage({ user, csrf, values = {}, errors = {} }) {
  return layout({
    title: 'Регистрация', user, csrf,
    body: html`<main class="container page"><form method="post" action="/register" class="card form-card narrow">
      ${csrfField(csrf)}
      <h1>Регистрация</h1><p class="muted mb">Один аккаунт, чтобы и пробовать агентов, и публиковать своих.</p>
      ${errors._ ? html`<div class="alert bad">${errors._}</div>` : ''}
      ${field({ name: 'username', label: 'Логин (будет в адресе ваших агентов)', value: values.username, error: errors.username, placeholder: 'lex_lab', help: 'Латиница, цифры и _, от 3 до 24 символов' })}
      ${field({ name: 'display_name', label: 'Имя или название студии', value: values.display_name, error: errors.display_name, placeholder: 'Lex Lab' })}
      ${field({ name: 'password', label: 'Пароль', type: 'password', error: errors.password, help: 'Минимум 8 символов' })}
      <button class="btn btn-primary btn-lg full-w">Создать аккаунт</button>
    </form></main>`,
  });
}

export function agentFormPage({ user, csrf, mode, values = {}, errors = {}, agent = null, devEndpoints }) {
  const isEdit = mode === 'edit';
  const action = isEdit ? `/me/agents/${agent.id}/edit` : '/publish';
  const hasErrors = Object.keys(errors).length > 0;
  return layout({
    title: isEdit ? `Редактирование: ${agent.name}` : 'Публикация агента', user, csrf, active: 'me',
    body: html`<main class="container page"><form method="post" action="${action}" class="card form-card mid">
      ${csrfField(csrf)}
      <h1>${isEdit ? `Редактирование: ${agent.name}` : 'Опубликовать агента'}</h1>
      <p class="muted mb">Агент работает у вас на сервере. Agora передаёт ему задачи по <a class="grad" href="/docs#protocol">протоколу agora/v0</a> и считает метрики. Промпт и база знаний остаются у вас.</p>
      ${hasErrors ? html`<div class="alert bad">Проверьте поля, отмеченные красным.</div>` : ''}

      <div class="grid-icon">
        ${field({ name: 'icon', label: 'Иконка', value: values.icon || '🤖', error: errors.icon })}
        ${field({ name: 'name', label: 'Название', value: values.name, error: errors.name, placeholder: 'Юрист по аренде' })}
        ${field({ name: 'slug', label: 'Адрес (латиницей)', value: values.slug, error: errors.slug, placeholder: 'yurist-po-arende', help: 'Если оставить пустым, адрес соберётся из названия' })}
      </div>
      ${field({ name: 'tagline', label: 'Коротко: что делает агент', value: values.tagline, error: errors.tagline, placeholder: 'Находит рискованные пункты в договоре аренды и предлагает правки' })}
      ${field({ name: 'description', label: 'Подробное описание', value: values.description, error: errors.description, textarea: true, rows: 6, help: 'Что умеет, на чём основан (база знаний, опыт), какие у него ограничения. От 30 символов.' })}
      <div class="grid-2">
        <div class="field ${errors.category ? 'has-err' : ''}"><label for="f-category">Категория</label>
          <select id="f-category" name="category">
            <option value="">— выберите —</option>
            ${CATEGORIES.map((c) => html`<option value="${c.id}" ${values.category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`)}
          </select>${errors.category ? html`<div class="err">${errors.category}</div>` : ''}</div>
        ${field({ name: 'tags', label: 'Теги через запятую', value: values.tags, error: errors.tags, placeholder: 'договоры, аренда, недвижимость' })}
      </div>

      <div class="divider"></div>
      ${field({ name: 'endpoint', label: 'Где работает агент (эндпоинт)', value: values.endpoint, error: errors.endpoint, type: 'url',
        placeholder: devEndpoints ? 'http://localhost:4100/agent' : 'https://api.example.com/agent',
        help: devEndpoints ? 'Режим разработки: разрешены http:// и localhost. Пример агента: npm run example-agent' : 'Только https://. Адреса внутренних сетей запрещены.' })}
      <div class="grid-2">
        ${field({ name: 'input_hint', label: 'Подсказка для поля задачи', value: values.input_hint, error: errors.input_hint, placeholder: 'Вставьте текст договора' })}
        ${field({ name: 'price_note', label: 'Цена (пока только для информации)', value: values.price_note, error: errors.price_note, placeholder: 'бесплатно в бете' })}
      </div>
      ${field({ name: 'example_input', label: 'Пример задачи', value: values.example_input, error: errors.example_input, textarea: true, rows: 3, help: 'Подставится в поле «Попробовать», чтобы человек сразу увидел, как работает агент' })}
      ${field({ name: 'version', label: 'Версия', value: values.version || '1.0', error: errors.version })}

      <div class="row space mt">
        <a href="/me" class="btn">Отмена</a>
        <button class="btn btn-primary btn-lg">${isEdit ? 'Сохранить' : 'Опубликовать'}</button>
      </div>
    </form>
    ${isEdit ? html`<div class="card form-card mid mt">
      <h2 class="section-title">Опасная зона</h2>
      <div class="row space mt-s">
        <span class="muted small">Новый секрет: старый перестанет работать сразу, обновите его у себя на сервере.</span>
        <form method="post" action="/me/agents/${agent.id}/rotate-secret">${csrfField(csrf)}<button class="btn btn-sm">Сменить секрет</button></form>
      </div>
      <div class="row space mt-s">
        <span class="muted small">Удалить агента вместе со всей статистикой. Отменить нельзя.</span>
        <form method="post" action="/me/agents/${agent.id}/delete">${csrfField(csrf)}<button class="btn btn-sm btn-danger">Удалить агента</button></form>
      </div>
    </div>` : ''}
    </main>`,
  });
}
