// Інтервальне повторення: спрощений алгоритм SM-2 (так працює Anki).
// Після кожної відповіді рахуємо, через скільки днів показати картку знову.
import { today, addDays } from './storage.js';

export const GRADES = [
  { id: 'again', label: 'Знову' },
  { id: 'hard', label: 'Важко' },
  { id: 'good', label: 'Добре' },
  { id: 'easy', label: 'Легко' },
];

export function newCard() {
  return { seen: false, reps: 0, interval: 0, ease: 2.5, due: today(), lapses: 0, last: null };
}

// Інтервали (у днях) для кожної оцінки. 0 — показати ще раз у цьому ж занятті.
export function intervals(card) {
  const c = { ...newCard(), ...(card || {}) };
  if (c.reps === 0) return { again: 0, hard: 1, good: 1, easy: 4 };
  const i = Math.max(1, c.interval);
  const hard = Math.max(i + 1, Math.round(i * 1.2));
  const good = Math.max(hard + 1, c.reps === 1 ? 3 : Math.round(i * c.ease));
  const easy = Math.max(good + 1, Math.round(good * 1.3));
  return { again: 0, hard: Math.min(hard, 365), good: Math.min(good, 365), easy: Math.min(easy, 365) };
}

// Повертає новий стан картки після оцінки
export function schedule(card, grade) {
  const c = { ...newCard(), ...(card || {}) };
  const days = intervals(c)[grade];
  if (grade === 'again') {
    if (c.reps > 0) c.lapses += 1;
    c.reps = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else {
    c.reps += 1;
    if (grade === 'hard') c.ease = Math.max(1.3, c.ease - 0.15);
    if (grade === 'easy') c.ease = Math.min(3, c.ease + 0.15);
  }
  c.interval = days;
  c.seen = true;
  c.last = today();
  c.due = addDays(today(), days);
  return c;
}

export function formatInterval(days) {
  if (days <= 0) return 'зараз';
  if (days < 30) return `${days} д`;
  if (days < 365) return `${Math.round(days / 30)} міс`;
  return '1 рік';
}

// Слово вивчене, якщо останнього разу його згадали
export const isLearned = (card) => !!card && card.seen && card.reps > 0;
