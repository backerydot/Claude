// Перевірка відповідей: нормалізація тексту, схожість слів, шаблони, підказки.
// Тут немає роботи зі сторінкою — лише чисті функції, їх легко перевіряти.

const ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

// 21 → «einundzwanzig». Розпізнавання мови часто повертає цифри, а не слова.
export function numberToGerman(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${o === 1 ? 'ein' : ONES[o]}und${TENS[t]}` : TENS[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${h === 1 ? '' : ONES[h]}hundert${r ? numberToGerman(r) : ''}`;
  }
  return String(n);
}

// Зводимо текст до простого вигляду: малі літери, без розділових знаків,
// ä → ae, ß → ss, числа словами. Так «Wie geht's?» = «wie gehts».
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\b\d{1,3}\b/g, (m) => numberToGerman(Number(m)))
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/['’`´]/g, '')
    .replace(/[.,!?;:"„“”«»()[\]\-–—…/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Відстань Левенштейна: скільки літер треба змінити, щоб отримати інше слово
export function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// 1 — однакові, 0 — зовсім різні
export function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  return max ? 1 - distance(a, b) / max : 1;
}

const ARTICLES = ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'];

function stripArticle(norm) {
  const [first, ...rest] = norm.split(' ');
  return ARTICLES.includes(first) && rest.length ? rest.join(' ') : norm;
}

// Переклад слова UA → DE. Артикль можна сказати або ні.
// voice: true — відповідь з мікрофона, прощаємо дрібні помилки розпізнавання в довгих словах.
export function checkWord(input, expected, { voice = false } = {}) {
  const got = stripArticle(normalize(input));
  if (!got) return { ok: false };
  let best = 0;
  for (const e of expected) {
    const want = stripArticle(normalize(e));
    if (got === want) return { ok: true };
    best = Math.max(best, similarity(got, want));
  }
  if (voice && best >= 0.8 && got.length >= 6) return { ok: true };
  return { ok: false, close: best >= 0.75 };
}

// Слово з артиклем: артикль має бути точно правильним
export function checkArticle(input, word, { voice = false } = {}) {
  const tokens = normalize(input).split(' ').filter(Boolean);
  if (!tokens.length || tokens[0] !== word.art) return { ok: false };
  if (tokens.length === 1) return { ok: true }; // сказали тільки артикль — теж годиться
  const rest = tokens.slice(1).join(' ');
  const noun = normalize(word.de);
  return { ok: rest === noun || similarity(rest, noun) >= (voice ? 0.6 : 0.8) };
}

// Голос: дозволяємо одне довге слово з дрібною помилкою розпізнавання
function closeByWords(got, want) {
  const a = got.split(' ');
  const b = want.split(' ');
  if (a.length !== b.length) return false;
  let fuzzy = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (b[i].length >= 6 && similarity(a[i], b[i]) >= 0.75) fuzzy++;
    else return false;
  }
  return fuzzy <= 1;
}

// Переклад речення
export function checkSentence(input, answers, { voice = false } = {}) {
  const got = normalize(input);
  if (!got) return { ok: false };
  let best = 0;
  for (const a of answers) {
    const want = normalize(a);
    if (got === want) return { ok: true };
    if (voice && closeByWords(got, want)) return { ok: true };
    best = Math.max(best, similarity(got, want));
  }
  return { ok: false, close: best >= 0.8 };
}

// Вільна відповідь на питання за шаблонами.
// «*» — будь-який текст, «#» — число. Приклад: «ich bin # jahre alt».
const NUMBER = '\\S*(?:null|eins|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|elf|zwoelf|zig|ssig|hundert)\\S*';

function patternRegex(pattern) {
  const marked = pattern.replace(/\*/g, '__any__').replace(/#/g, '__num__');
  const src = normalize(marked)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/__any__/g, '.*')
    .replace(/__num__/g, NUMBER);
  return new RegExp(`^${src}$`);
}

export function checkPattern(input, patterns) {
  const got = normalize(input);
  if (!got) return { ok: false };
  return { ok: patterns.some((p) => patternRegex(p).test(got)) };
}

// Підказка «перші літери»: «Wie heißt du?» → «W__ h____ d_?»
export function letterHint(text) {
  return String(text)
    .split(' ')
    .map((w) => {
      const m = w.match(/^([^\p{L}]*)(\p{L})(\p{L}*)(.*)$/u);
      return m ? m[1] + m[2] + '_'.repeat(m[3].length) + m[4] : w;
    })
    .join(' ');
}

// Правила, за якими часто можна вгадати рід
const RULES = [
  { re: /(ung|heit|keit|schaft|ion|tät|ik)$/, text: 'Слова на -ung, -heit, -keit, -schaft, -ion, -tät, -ik майже завжди die.' },
  { re: /(chen|lein)$/, text: 'Зменшувальні слова на -chen і -lein завжди das.' },
  { re: /(ment|um)$/, text: 'Слова на -ment і -um здебільшого das.' },
  { re: /(ismus|ling|ent|ant|or)$/, text: 'Слова на -ismus, -ling, -ent, -ant, -or здебільшого der.' },
  { re: /e$/, text: 'Слова на -e здебільшого die (але der Name, der Kollege).' },
];

export function articleRule(noun) {
  const n = String(noun).toLowerCase();
  const rule = RULES.find((r) => r.re.test(n));
  return rule ? rule.text : null;
}
