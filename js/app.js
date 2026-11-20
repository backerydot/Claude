// Головний файл: завантажує уроки і показує потрібну сторінку за адресою (#/...)
import { loadContent } from './content.js';
import { onChange, currentStreak } from './storage.js';
import { stopSpeaking, stopListening } from './speech.js';
import { esc, icon, plural, installGlobalHandlers } from './ui.js';
import * as home from './views/home.js';
import * as lessons from './views/lessons.js';
import * as cards from './views/cards.js';
import * as exercises from './views/exercises.js';
import * as stress from './views/stress.js';
import * as settings from './views/settings.js';

window.__dtStarted = true; // для підказки в index.html, якщо скрипт не запуститься

const ROUTES = [
  { re: /^#?\/?$/, view: home.render, tab: 'home', title: '' },
  { re: /^#\/lessons$/, view: lessons.renderList, tab: 'lessons', title: 'Уроки' },
  { re: /^#\/lesson\/([\w-]+)$/, view: lessons.renderLesson, tab: 'lessons', title: 'Урок' },
  { re: /^#\/cards(?:\/([\w-]+))?$/, view: cards.render, tab: 'cards', title: 'Картки' },
  { re: /^#\/exercises\/([\w-]+)$/, view: exercises.render, tab: 'lessons', title: 'Вправи' },
  { re: /^#\/stress$/, view: stress.render, tab: 'stress', title: 'Стрес-тест' },
  { re: /^#\/settings$/, view: settings.render, tab: 'settings', title: 'Параметри' },
];

const app = document.getElementById('app');
let content = null;
let cleanup = null; // функція, яка прибирає за попередньою сторінкою (таймери, мікрофон)

function route() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;
  stopSpeaking();
  stopListening();
  document.body.classList.remove('focus-mode');

  const hash = location.hash || '#/';
  const found = ROUTES.map((r) => ({ r, m: hash.match(r.re) })).find((x) => x.m);
  if (!found) {
    location.replace('#/');
    return;
  }
  document.querySelectorAll('.tab').forEach((a) => {
    if (a.dataset.tab === found.r.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = found.r.title ? `${found.r.title}. Deutsch-Trainer` : 'Deutsch-Trainer';
  app.innerHTML = '';
  window.scrollTo(0, 0);
  cleanup = found.r.view(app, content, ...found.m.slice(1)) || null;
}

function renderStreak() {
  const n = currentStreak();
  const chip = document.getElementById('streak');
  chip.innerHTML = `${icon('flame')}<span>${n}</span>`;
  chip.classList.toggle('is-on', n > 0);
  chip.title = n ? `${n} ${plural(n, 'день', 'дні', 'днів')} поспіль` : 'Стрік ще не почався';
  chip.setAttribute('aria-label', chip.title);
}

installGlobalHandlers();

async function init() {
  document.querySelectorAll('.tab').forEach((a) => a.insertAdjacentHTML('afterbegin', icon(a.dataset.tab)));
  renderStreak();
  onChange(renderStreak);
  try {
    content = await loadContent();
  } catch (err) {
    app.innerHTML = `
      <section class="error-box">
        <h1>Не вдалося завантажити уроки</h1>
        <p>${esc(err.message)}</p>
        <p>Сайт треба відкривати через локальний сервер. У папці проєкту виконай <code>python3 -m http.server 8000</code> і відкрий у браузері <b>http://localhost:8000</b>.</p>
      </section>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
