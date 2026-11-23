// Прогрес хімії: один об'єкт у localStorage (окремо від німецької).
const KEY = 'chem-trainer/v1';
export const PASS = 80; // з якого відсотка урок зараховано

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function withDefaults(s) {
  return {
    best: {},     // id уроку → найкращий відсоток контрольної
    passedAt: {}, // id уроку → дата, коли вперше зараховано
    days: [],     // дні, коли здано хоч один урок (для стріку)
    ...(s && typeof s === 'object' ? s : {}),
  };
}

let state = null;
export function getState() {
  if (!state) {
    try {
      state = withDefaults(JSON.parse(localStorage.getItem(KEY)));
    } catch {
      state = withDefaults(null);
    }
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* приватне вікно — прогрес лише до закриття */ }
}

export const isPassed = (id) => (getState().best[id] || 0) >= PASS;

// Записати результат контрольної. Повертає true, якщо урок зараховано вперше.
export function recordResult(id, pct) {
  const s = getState();
  const was = isPassed(id);
  s.best[id] = Math.max(s.best[id] || 0, pct);
  let first = false;
  if (pct >= PASS) {
    if (!was) {
      s.passedAt[id] = today();
      first = true;
    }
    if (!s.days.includes(today())) s.days.push(today());
    s.days = s.days.slice(-400);
  }
  save();
  return first;
}

// Скільки днів поспіль здавав уроки (сьогодні або вчора — стрік ще живий)
export function streak() {
  const set = new Set(getState().days);
  const d = new Date();
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const passedToday = () => Object.values(getState().passedAt).filter((d) => d === today()).length;

export function exportJSON() {
  return JSON.stringify({ app: 'chem-trainer', version: 1, state: getState() }, null, 1);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'chem-trainer' || !data.state) throw new Error('Це не копія прогресу хімії');
  state = withDefaults(data.state);
  save();
}

export { today };
