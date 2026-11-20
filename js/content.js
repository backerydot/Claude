// Завантаження навчального контенту з data/*.json
import { isLearned } from './srs.js';

let cache = null;

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Не вдалося завантажити ${url} (код ${res.status}).`);
  return res.json();
}

export async function loadContent() {
  if (cache) return cache;
  const levels = await getJSON('data/levels.json');
  const lessons = [];
  const lessonById = new Map();
  const wordById = new Map();

  for (const level of levels) {
    level.lessons = [];
    if (!level.file) continue;
    const data = await getJSON(level.file);
    for (const lesson of data.lessons) {
      lesson.level = level.id;
      lesson.words = lesson.words || [];
      lesson.exercises = lesson.exercises || [];
      lesson.speak = lesson.speak || [];
      lesson.grammar = lesson.grammar || [];
      for (const w of lesson.words) {
        w.lesson = lesson.id;
        wordById.set(w.id, w);
      }
      level.lessons.push(lesson);
      lessons.push(lesson);
      lessonById.set(lesson.id, lesson);
    }
  }

  cache = { levels, lessons, lessonById, wordById, words: [...wordById.values()] };
  return cache;
}

// «die Mutter» для іменників, просто слово для решти
export function label(w) {
  return w.art ? `${w.art} ${w.de}` : w.de;
}

export function pluralLabel(w) {
  if (w.plOnly) return 'тільки множина';
  if (!w.art || !w.pl) return '';
  return `die ${w.pl}`;
}

// З якого прогресу урок вважається пройденим (на головній і в грі)
export const LESSON_DONE = 0.9;

// Прогрес уроку: 75% — вивчені слова, 25% — найкращий результат вправ
export function lessonStats(lesson, state) {
  const total = lesson.words.length;
  const learned = lesson.words.filter((w) => isLearned(state.cards[w.id])).length;
  const ex = state.exercises[lesson.id] || 0;
  const progress = total ? 0.75 * (learned / total) + 0.25 * (ex / 100) : 0;
  return { total, learned, ex, progress };
}

// Прогрес рівня — середнє по всіх уроках (ненаповнені рахуються як 0)
export function levelProgress(level, state) {
  if (!level.lessons.length) return 0;
  const sum = level.lessons.reduce((acc, l) => acc + lessonStats(l, state).progress, 0);
  return sum / level.lessons.length;
}
