// Головна: що вчити сьогодні, тиждень занять, рекорд і карта прогресу
import { getState, currentStreak, activeDays, today } from '../storage.js';
import { label, lessonStats, levelProgress, LESSON_DONE } from '../content.js';
import { isLearned } from '../srs.js';
import { planSession } from './cards.js';
import { esc, wordHTML, sayBtn, plural, fmtNum } from '../ui.js';

// Дні тижня німецькою — заодно вчимо (вони будуть в уроці 8)
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// Сьогоднішня дата німецькою: «Freitag, 20. November» — заодно вчимо дні й місяці
const dateDe = () => new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

function weekday(day) {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

function todayText(due, fresh) {
  if (due && fresh) {
    return `Сьогодні ${due} ${plural(due, 'слово', 'слова', 'слів')} на повторення і ${fresh} ${plural(fresh, 'нове', 'нових', 'нових')}`;
  }
  if (due) return `Сьогодні ${due} ${plural(due, 'слово', 'слова', 'слів')} на повторення`;
  if (fresh) return `Сьогодні ${fresh} ${plural(fresh, 'нове слово', 'нових слова', 'нових слів')}`;
  return 'На сьогодні все повторено. Можна пройти стрес-тест або відкрити наступний урок.';
}

export function render(app, content) {
  const state = getState();
  const { due, fresh } = planSession(content, state);
  const learnedWords = content.words.filter((w) => isLearned(state.cards[w.id]));
  const learned = learnedWords.length;
  // Велике слово вгорі: наступне нове, або на повторення, або будь-яке вже вивчене
  const hero = fresh[0] || due[0] || learnedWords[Math.floor(Math.random() * learned)] || content.words[0] || null;
  const todo = due.length + fresh.length;
  const streak = currentStreak();
  const t = today();
  const next = content.lessons.find((l) => !l.planned && lessonStats(l, state).progress < LESSON_DONE);
  const nextP = next ? lessonStats(next, state).progress : 0;
  const best = state.stress.best;

  app.innerHTML = `
    <section class="home-hero">
      <h1 class="greet" lang="de">${dateDe()}</h1>
      ${hero ? `<div class="hero-word">${wordHTML(hero)}${sayBtn(label(hero))}</div><p class="hero-ua">${esc(hero.ua)}</p>` : ''}
      <p class="today-line">${todayText(due.length, fresh.length)}</p>
      ${todo
        ? '<a class="btn btn-marker" href="#/cards">Почати картки</a>'
        : '<a class="btn btn-marker" href="#/stress">Пройти стрес-тест</a>'}
    </section>

    <section class="block">
      <h2>Цей тиждень</h2>
      <div class="week" role="list">
        ${activeDays(7).map((d) => `<span role="listitem" class="day${d.active ? ' on' : ''}${d.day === t ? ' today' : ''}" title="${d.day}${d.active ? ', були заняття' : ''}">${weekday(d.day)}</span>`).join('')}
      </div>
      <p class="muted">${streak ? `${streak} ${plural(streak, 'день', 'дні', 'днів')} поспіль.` : 'Сьогодні ще без занять. Будь-які картки чи вправи запускають стрік.'} Рекорд: ${state.streak.best} ${plural(state.streak.best, 'день', 'дні', 'днів')}.</p>
    </section>

    ${next ? `
    <section class="block">
      <h2>${nextP ? 'Продовжити урок' : 'Наступний урок'}</h2>
      <a class="next-lesson" href="#/lesson/${next.id}">
        <span class="num">${next.num}</span>
        <span class="body"><span class="t">${esc(next.title)}</span><span class="de" lang="de">${esc(next.titleDe)}</span>
          <span class="bar"><i style="--p:${nextP.toFixed(3)}"></i></span></span>
      </a>    </section>` : ''}

    <section class="block">
      <h2>Стрес-тест</h2>
      <p>${best ? `Твій рекорд — ${fmtNum(best)} ${plural(best, 'бал', 'бали', 'балів')}` : 'Відповідаєш уголос на час. Питання лише з того, що вже вивчено.'}</p>
      <a class="btn" href="#/stress">Почати стрес-тест</a>
    </section>

    <section class="block">
      <h2>Шлях до B1+</h2>
      <p class="muted">Вивчено ${learned} ${plural(learned, 'слово', 'слова', 'слів')}. Кожна клітинка — урок: що більше зафарбована, то краще засвоєний.</p>
      <div class="levels">${content.levels.map((lv) => levelHTML(lv, state)).join('')}</div>
    </section>`;
}

function levelHTML(level, state) {
  const has = level.lessons.length > 0;
  const cells = has
    ? level.lessons.map((l) => {
        if (l.planned) {
          return `<a class="cell planned" href="#/lesson/${l.id}" title="Урок ${l.num}. ${esc(l.title)} (скоро)"><span>${l.num}</span></a>`;
        }
        const p = lessonStats(l, state).progress;
        return `<a class="cell" href="#/lesson/${l.id}" style="--p:${p.toFixed(3)}" title="Урок ${l.num}. ${esc(l.title)}: ${Math.round(p * 100)}%"><span>${l.num}</span></a>`;
      }).join('')
    : Array.from({ length: level.plannedLessons || 0 }, () => '<span class="cell locked"></span>').join('');
  const meta = has ? `${Math.round(levelProgress(level, state) * 100)}%` : 'скоро';
  return `
    <div class="level${has ? '' : ' is-locked'}">
      <div class="level-head">
        <span class="level-name">${esc(level.id)}</span>
        <span class="level-title">${esc(level.name)}</span>
        <span class="level-meta">${meta}</span>
      </div>
      <div class="cells">${cells}</div>
    </div>`;
}
