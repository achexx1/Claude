// Встроенные демо-агенты. Работают внутри Agora (эндпоинт builtin://<имя>), без внешних сервисов,
// чтобы каталог не был пустым с первого запуска. Публиковать builtin:// может только системный аккаунт.

const RU_STOP = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне ' +
  'было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж ' +
  'вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз ' +
  'тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас ' +
  'были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них ' +
  'какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда ' +
  'конечно всю между это также очень весь свой эта').split(' '));

function textStats(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+(?:[-'][\p{L}]+)*/gu) || [];
  const sentences = text.split(/(?<=[.!?…])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
  const freq = new Map();
  for (const w of words) if (w.length > 3 && !RU_STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sentWords = sentences.map((s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length);
  const avg = sentWords.length ? sentWords.reduce((a, b) => a + b, 0) / sentWords.length : 0;
  const long = sentWords.filter((n) => n > 25).length;
  const minutes = Math.max(1, Math.round(words.length / 180));

  const advice = [];
  if (long) advice.push(`${long} предложени${long === 1 ? 'е' : 'й'} длиннее 25 слов: их стоит разбить.`);
  if (avg > 18) advice.push('Средняя длина предложения выше 18 слов: текст читается тяжело.');
  if (top[0] && top[0][1] >= 4 && top[0][1] / words.length > 0.03) advice.push(`Слово «${top[0][0]}» повторяется ${top[0][1]} раз: поищите синонимы.`);
  if (!advice.length) advice.push('Текст читается легко, явных проблем не нашёл.');

  const lines = [
    `Слов: ${words.length}, предложений: ${sentences.length}, символов: ${[...text].length}.`,
    `Средняя длина предложения: ${avg.toFixed(1)} слова.`,
    `Время чтения: около ${minutes} мин.`,
    top.length ? `Частые слова: ${top.map(([w, n]) => `${w} (${n})`).join(', ')}.` : null,
    '',
    'Советы:',
    ...advice.map((a) => `• ${a}`),
  ].filter((l) => l !== null);

  return {
    text: lines.join('\n'),
    data: { words: words.length, sentences: sentences.length, avg_sentence_words: Number(avg.toFixed(1)), reading_minutes: minutes, top_words: top, long_sentences: long },
  };
}

// Транслитерация для загранпаспорта (приказ МВД № 2020 / ICAO Doc 9303)
const PASSPORT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: 'ie', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia',
};

function translit(text) {
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
  return {
    text: `${out}\n\nПо правилам МВД для загранпаспорта (ICAO 9303). Сверьте с написанием в старом паспорте и визах: при расхождении можно попросить оставить прежнее.`,
    data: { result: out, standard: 'ICAO 9303 / МВД РФ' },
  };
}

// Калькулятор налога для самозанятых (НПД): 4% с физлиц, 6% с юрлиц и ИП
function npdCalc(text) {
  let fiz = 0, yur = 0;
  const unknown = [];
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    const nums = (line.replace(/(\d)[\s ](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
    if (!nums.length) { unknown.push(raw.trim()); continue; }
    let sum = nums.reduce((a, b) => a + b, 0);
    if (/тыс/.test(line)) sum *= 1000;
    if (/юр|(?<![\p{L}])ип(?![\p{L}])|ооо|компан|организ/u.test(line)) yur += sum;
    else fiz += sum;
  }
  const taxFiz = fiz * 0.04, taxYur = yur * 0.06;
  const rub = (n) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)} ₽`;
  const lines = [
    `Доход от физлиц: ${rub(fiz)} → налог 4% = ${rub(taxFiz)}`,
    `Доход от юрлиц и ИП: ${rub(yur)} → налог 6% = ${rub(taxYur)}`,
    `Итого налог: ${rub(taxFiz + taxYur)}`,
    '',
    'Если вы ещё не использовали налоговый вычет 10 000 ₽, ставки будут ниже (3% и 4%), пока вычет не закончится.',
    'Платить до 28-го числа следующего месяца. Лимит дохода: 2,4 млн ₽ в год.',
  ];
  if (unknown.length) lines.push('', `Не понял строки: ${unknown.slice(0, 3).join(' | ')}. Пишите, например: «физ 50 000» или «юр 20000».`);
  return { text: lines.join('\n'), data: { income_individuals: fiz, income_companies: yur, tax: Number((taxFiz + taxYur).toFixed(2)) } };
}

export const BUILTINS = {
  'text-stats': textStats,
  translit,
  'npd-calc': npdCalc,
};

export function runBuiltin(name, input) {
  const fn = BUILTINS[name];
  if (!fn) throw new Error(`unknown builtin ${name}`);
  return fn(input);
}
