import { createUser, randomToken } from './auth.js';
import { createAgent, getOwnAgent, i18nSearchText } from './agents.js';
import { startExam } from './exam.js';

// Системный аккаунт @agora и встроенные демо-агенты, чтобы каталог не был пустым с первого запуска.
// Описания на русском с переводом на английский; отвечают на обоих языках (context.locale).
const DEMO = [
  {
    slug: 'analiz-teksta', name: 'Анализ текста', icon: '📝', category: 'text', region: 'global',
    tagline: 'Считает слова и время чтения, находит длинные предложения и повторы',
    description: 'Вставьте пост, статью или письмо. Агент посчитает слова и предложения, оценит время чтения, найдёт слишком длинные предложения и слова, которые повторяются чаще нормы, и даст короткие советы.\n\nДемо-агент Agora: работает без ИИ, по правилам. Нужен, чтобы показать, как выглядят паспорт агента и вызов через шлюз.',
    tags: 'тексты, редактура, копирайтинг', endpoint: 'builtin://text-stats', price_note: '',
    input_hint: 'Вставьте текст',
    example_input: 'Мы запускаем новый сервис. Сервис помогает предпринимателям находить ИИ-агентов, которые уже умеют решать их задачи, и при этом сервис сам считает, насколько каждому агенту можно доверять, опираясь на реальные выполненные задачи, а не на отзывы, которые легко накрутить. Попробуйте сервис уже сегодня!',
    en: {
      name: 'Text analysis',
      tagline: 'Counts words and reading time, finds long sentences and repetitions',
      description: 'Paste a post, an article or an email. The agent counts words and sentences, estimates reading time, finds overly long sentences and words repeated too often, and gives short tips.\n\nAgora demo agent: rule-based, no AI. It shows what an agent passport and a gateway call look like.',
      input_hint: 'Paste your text',
      example_input: 'We are launching a new service. The service helps entrepreneurs find AI agents that already know how to solve their tasks, and the service itself calculates how much each agent can be trusted, based on real completed tasks rather than on reviews that are easy to fake. Try the service today!',
    },
  },
  {
    slug: 'translit-pasport', name: 'Транслитерация для загранпаспорта', icon: '🛂', category: 'travel', region: 'RU',
    tagline: 'Переводит ФИО и адрес в латиницу по правилам МВД для загранпаспорта',
    description: 'Пишет имя, фамилию или адрес латиницей ровно так, как это сделают в загранпаспорте (приказ МВД, стандарт ICAO 9303). Пригодится для бронирования билетов и отелей, чтобы имя совпадало с паспортом.\n\nДемо-агент Agora: работает по правилам, без ИИ.',
    tags: 'паспорт, билеты, транслит', endpoint: 'builtin://translit', price_note: '',
    input_hint: 'ФИО или адрес кириллицей', example_input: 'Щукина Юлия Сергеевна',
    en: {
      name: 'Russian passport transliteration',
      tagline: 'Writes Russian names and addresses in Latin letters exactly as in a Russian passport',
      description: 'Converts a Russian (Cyrillic) name or address to Latin letters following the rules used for Russian international passports (ICAO 9303). Useful for booking flights and hotels so the name matches the passport.\n\nAgora demo agent: rule-based, no AI.',
      input_hint: 'Name or address in Cyrillic', example_input: 'Щукина Юлия Сергеевна',
    },
  },
  {
    slug: 'npd-kalkuliator', name: 'Налог самозанятого', icon: '🧾', category: 'finance', region: 'RU',
    tagline: 'Считает налог на профессиональный доход: 4% с физлиц и 6% с юрлиц',
    description: 'Перечислите поступления за месяц, по одному на строку, с пометкой «физ» или «юр» (ИП и компании). Агент посчитает налог НПД, напомнит про налоговый вычет, срок оплаты и годовой лимит дохода.\n\nДемо-агент Agora: работает по правилам, без ИИ. Не является налоговой консультацией.',
    tags: 'налоги, самозанятые, нпд', endpoint: 'builtin://npd-calc', price_note: '',
    input_hint: 'Поступления: по одному на строку', example_input: 'физ 45 000\nфиз 12 500\nюр 30 000',
    en: {
      name: 'Russian self-employed tax',
      tagline: 'Calculates the Russian professional income tax (NPD): 4% from individuals, 6% from companies',
      description: 'For self-employed people in Russia. List your payments for the month, one per line, marked “ind” or “company”. The agent calculates the NPD tax and reminds you about the deduction, the payment deadline and the yearly income limit.\n\nAgora demo agent: rule-based, no AI. Not tax advice.',
      input_hint: 'Payments, one per line', example_input: 'ind 45000\nind 12500\ncompany 30000',
    },
  },
];

/** Создаёт демо-данные в пустой базе и запускает для демо-агентов экзамен. Возвращает промисы экзаменов. */
export function seedIfEmpty(db, config) {
  const hasUsers = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (hasUsers) return [];
  // Пароль случайный и нигде не сохраняется: в системный аккаунт нельзя войти.
  const ownerId = createUser(db, { username: 'agora', display_name: 'Agora', password: randomToken(32), is_system: 1 });
  const exams = [];
  for (const { en, ...d } of DEMO) {
    const i18n = { en };
    const id = createAgent(db, ownerId, { version: '1.0', primary_lang: 'ru', languages: ['ru', 'en'], i18n, i18n_text: i18nSearchText(i18n), ...d });
    // Демо-агенты работают по правилам: проверка по существу моделью-судьёй для них не нужна
    if (config) exams.push(startExam(db, config, getOwnAgent(db, id, ownerId), { judge: null }).done);
  }
  return exams;
}
