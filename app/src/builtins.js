// Встроенные демо-агенты. Работают внутри Agora (эндпоинт builtin://<имя>), без внешних сервисов,
// чтобы каталог не был пустым с первого запуска. Публиковать builtin:// может только системный аккаунт.
// Отвечают на языке покупателя (context.locale): так же должны поступать и настоящие агенты.

const STOP = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне ' +
  'было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж ' +
  'вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз ' +
  'тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас ' +
  'были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них ' +
  'какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда ' +
  'конечно всю между это также очень весь свой эта ' +
  'the and that this with from have will your about which their there they them would could should been were what when ' +
  'where into than then also just more most some such only over very because these those while being does each other').split(' '));

const T = {
  ru: {
    stats: (w, s, c) => `Слов: ${w}, предложений: ${s}, символов: ${c}.`,
    avg: (a) => `Средняя длина предложения: ${a} слова.`,
    read: (m) => `Время чтения: около ${m} мин.`,
    top: (list) => `Частые слова: ${list}.`,
    advice: 'Советы:',
    long: (n) => `${n} ${n === 1 ? 'предложение длиннее' : 'предложений длиннее'} 25 слов: их стоит разбить.`,
    avgHigh: 'Средняя длина предложения выше 18 слов: текст читается тяжело.',
    repeat: (w, n) => `Слово «${w}» повторяется ${n} раз: поищите синонимы.`,
    fine: 'Текст читается легко, явных проблем не нашёл.',
    translitNote: 'По правилам МВД для загранпаспорта (ICAO 9303). Сверьте с написанием в старом паспорте и визах: при расхождении можно попросить оставить прежнее.',
    fiz: (inc, tax) => `Доход от физлиц: ${inc} → налог 4% = ${tax}`,
    yur: (inc, tax) => `Доход от юрлиц и ИП: ${inc} → налог 6% = ${tax}`,
    total: (tax) => `Итого налог: ${tax}`,
    deduction: 'Если вы ещё не использовали налоговый вычет 10 000 ₽, ставки будут ниже (3% и 4%), пока вычет не закончится.',
    deadline: 'Платить до 28-го числа следующего месяца. Лимит дохода: 2,4 млн ₽ в год.',
    unknown: (l) => `Не понял строки: ${l}. Пишите, например: «физ 50 000» или «юр 20000».`,
  },
  en: {
    stats: (w, s, c) => `Words: ${w}, sentences: ${s}, characters: ${c}.`,
    avg: (a) => `Average sentence length: ${a} words.`,
    read: (m) => `Reading time: about ${m} min.`,
    top: (list) => `Frequent words: ${list}.`,
    advice: 'Tips:',
    long: (n) => `${n} sentence${n === 1 ? ' is' : 's are'} longer than 25 words: consider splitting ${n === 1 ? 'it' : 'them'}.`,
    avgHigh: 'Average sentence length is above 18 words: the text is hard to read.',
    repeat: (w, n) => `The word “${w}” repeats ${n} times: look for synonyms.`,
    fine: 'The text reads easily, no obvious problems found.',
    translitNote: 'Russian passport transliteration rules (ICAO 9303). Check it against old passports and visas: if they differ, you can ask to keep the previous spelling.',
    fiz: (inc, tax) => `Income from individuals: ${inc} → 4% tax = ${tax}`,
    yur: (inc, tax) => `Income from companies and sole proprietors: ${inc} → 6% tax = ${tax}`,
    total: (tax) => `Total tax: ${tax}`,
    deduction: 'If you have not used the 10,000 ₽ tax deduction yet, the rates are lower (3% and 4%) until it runs out.',
    deadline: 'Pay by the 28th of the following month. Income limit: 2.4 million ₽ per year. Applies to self-employed people in Russia (NPD).',
    unknown: (l) => `Could not understand: ${l}. Write e.g. “ind 50000” or “company 20000”.`,
  },
};
const tr = (locale) => T[locale] || T.en;

function textStats(text, L, locale) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}]+)*/gu) || [];
  const sentences = text.split(/(?<=[.!?…])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
  const freq = new Map();
  for (const w of words) if (w.length > 3 && !STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sentWords = sentences.map((s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length);
  const avg = sentWords.length ? sentWords.reduce((a, b) => a + b, 0) / sentWords.length : 0;
  const long = sentWords.filter((n) => n > 25).length;
  const minutes = Math.max(1, Math.round(words.length / 180));
  const fmt = (n) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);

  const advice = [];
  if (long) advice.push(L.long(long));
  if (avg > 18) advice.push(L.avgHigh);
  if (top[0] && top[0][1] >= 4 && top[0][1] / words.length > 0.03) advice.push(L.repeat(top[0][0], top[0][1]));
  if (!advice.length) advice.push(L.fine);

  const lines = [
    L.stats(words.length, sentences.length, [...text].length),
    L.avg(fmt(avg)),
    L.read(minutes),
    top.length ? L.top(top.map(([w, n]) => `${w} (${n})`).join(', ')) : null,
    '',
    L.advice,
    ...advice.map((a) => `• ${a}`),
  ].filter((l) => l !== null);

  return {
    text: lines.join('\n'),
    data: { words: words.length, sentences: sentences.length, avg_sentence_words: Number(avg.toFixed(1)), reading_minutes: minutes, top_words: top, long_sentences: long },
  };
}

// Транслитерация для загранпаспорта (приказ МВД / ICAO Doc 9303)
const PASSPORT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: 'ie', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia',
};

function translit(text, L) {
  const out = text.replace(/[\p{L}]+/gu, (word) => {
    const isUpper = word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase();
    let res = '';
    for (const ch of word) {
      const lower = ch.toLowerCase();
      const t = PASSPORT[lower];
      if (t === undefined) { res += ch; continue; }
      res += ch !== lower && t ? t[0].toUpperCase() + t.slice(1) : t;
    }
    return isUpper ? res.toUpperCase() : res;
  });
  return { text: `${out}\n\n${L.translitNote}`, data: { result: out, standard: 'ICAO 9303' } };
}

// Калькулятор налога для самозанятых в России (НПД): 4% с физлиц, 6% с юрлиц и ИП
function npdCalc(text, L, locale) {
  let fiz = 0, yur = 0;
  const unknown = [];
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    const nums = (line.replace(/(\d)[\s ,](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
    if (!nums.length) { unknown.push(raw.trim()); continue; }
    let sum = nums.reduce((a, b) => a + b, 0);
    if (/тыс|\bk\b|thousand/u.test(line)) sum *= 1000;
    if (/юр|(?<![\p{L}])ип(?![\p{L}])|ооо|компан|организ|company|business|corp|llc|ltd|legal/u.test(line)) yur += sum;
    else fiz += sum;
  }
  const taxFiz = fiz * 0.04, taxYur = yur * 0.06;
  const rub = (n) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)} ₽`;
  const lines = [L.fiz(rub(fiz), rub(taxFiz)), L.yur(rub(yur), rub(taxYur)), L.total(rub(taxFiz + taxYur)), '', L.deduction, L.deadline];
  if (unknown.length) lines.push('', L.unknown(unknown.slice(0, 3).join(' | ')));
  return { text: lines.join('\n'), data: { income_individuals: fiz, income_companies: yur, tax: Number((taxFiz + taxYur).toFixed(2)) } };
}

export const BUILTINS = {
  'text-stats': textStats,
  translit,
  'npd-calc': npdCalc,
};

export function runBuiltin(name, input, { locale = 'en' } = {}) {
  const fn = BUILTINS[name];
  if (!fn) throw new Error(`unknown builtin ${name}`);
  const lang = T[locale] ? locale : 'en';
  return fn(input, tr(lang), lang);
}
