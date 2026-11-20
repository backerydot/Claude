// Збереження прогресу в браузері (localStorage).
// Увесь прогрес — один об’єкт. На етапі 4 саме його синхронізуватимемо через Firebase.

const KEY = 'deutsch-trainer/v1';

export const DEFAULT_SETTINGS = {
  newPerDay: 10,         // скільки нових слів на день
  direction: 'de-ua',    // що на картці спочатку: 'de-ua', 'ua-de' або 'mix'
  autoplay: true,        // автоматично озвучувати німецьке слово
  ttsRate: 0.9,          // швидкість озвучки
  voiceURI: '',          // вибраний німецький голос ('' — автоматично)
  stressSeconds: 10,     // секунд на слово в стрес-тесті (на речення +5)
  stressCount: 15,       // кількість питань у стрес-тесті
  stressInput: 'voice',  // 'voice' або 'keyboard'
  speakAnswers: true,    // озвучувати правильну відповідь після помилки
  sounds: true,          // звуки в стрес-тесті
};

function fresh() {
  return {
    version: 1,
    cards: {},      // { [id слова]: { seen, reps, interval, ease, due, lapses, last } }
    exercises: {},  // найкращий результат вправ: { [id уроку]: 0..100 }
    stress: { best: 0, bestAccuracy: 0, history: [] },
    streak: { current: 0, best: 0, lastDay: null },
    daily: {},      // { 'YYYY-MM-DD': { reviews, newCards, exercises, stress } }
    settings: { ...DEFAULT_SETTINGS },
  };
}

// Доповнюємо збережені дані полями, яких могло не бути в старій версії
function withDefaults(data) {
  const base = fresh();
  if (!data || typeof data !== 'object') return base;
  return {
    ...base,
    ...data,
    cards: data.cards || {},
    exercises: data.exercises || {},
    stress: { ...base.stress, ...(data.stress || {}) },
    streak: { ...base.streak, ...(data.streak || {}) },
    daily: data.daily || {},
    settings: { ...base.settings, ...(data.settings || {}) },
  };
}

function load() {
  try {
    return withDefaults(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return fresh();
  }
}

let state = load();
const listeners = new Set();

export function getState() {
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Не вдалося зберегти прогрес', err);
  }
  listeners.forEach((fn) => fn(state));
}

// Підписка на зміни (наприклад, щоб оновити стрік у шапці)
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}

// ---------- Дати за місцевим часом у форматі YYYY-MM-DD ----------

export function today(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return today(new Date(y, m - 1, d + n));
}

// ---------- Статистика дня і стрік ----------

export function dayStats(day = today()) {
  if (!state.daily[day]) state.daily[day] = { reviews: 0, newCards: 0, exercises: 0, stress: 0 };
  return state.daily[day];
}

// Позначити, що сьогодні були заняття (оновлює стрік). Після виклику треба save().
export function markActive() {
  const t = today();
  const s = state.streak;
  if (s.lastDay !== t) {
    s.current = s.lastDay === addDays(t, -1) ? s.current + 1 : 1;
    s.best = Math.max(s.best, s.current);
    s.lastDay = t;
  }
  // Зберігаємо статистику лише за останні 120 днів
  const days = Object.keys(state.daily).sort();
  while (days.length > 120) delete state.daily[days.shift()];
}

// Стрік зберігається, якщо заняття були сьогодні або вчора
export function currentStreak() {
  const { lastDay, current } = state.streak;
  const t = today();
  return lastDay === t || lastDay === addDays(t, -1) ? current : 0;
}

// Останні n днів: чи були заняття (для рядка тижня на головній)
export function activeDays(n = 7) {
  const t = today();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = addDays(t, -i);
    const s = state.daily[day];
    out.push({ day, active: !!s && s.reviews + s.exercises + s.stress > 0 });
  }
  return out;
}

// ---------- Резервна копія ----------

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл пошкоджений або це не JSON.');
  }
  if (!data || typeof data !== 'object' || !data.cards) {
    throw new Error('Це не файл прогресу Deutsch-Trainer.');
  }
  state = withDefaults(data);
  save();
}

// Скидає прогрес, але залишає налаштування
export function resetAll() {
  const settings = { ...state.settings };
  state = fresh();
  state.settings = settings;
  save();
}
