// Гра «Папірланд-Експрес»: поїзд їде від станції до станції, кожна станція — урок.
// На станції відкриваються ті самі сторінки, що й на сайті (граматика, картки, вправи),
// тож прогрес спільний: усе, що вивчиш у грі, видно на сайті, і навпаки.
import { loadContent, lessonStats, LESSON_DONE as DONE } from '../content.js';
import { getState, onChange, currentStreak, today } from '../storage.js';
import { stopSpeaking, stopListening } from '../speech.js';
import { esc, icon, plural, toast, installGlobalHandlers } from '../ui.js';
import { createWorld } from './world.js';
import * as lessons from '../views/lessons.js';
import * as cards from '../views/cards.js';
import * as exercises from '../views/exercises.js';
import * as stress from '../views/stress.js';

const UNLOCK = 0.5;               // наступна станція відкривається, коли попередню пройдено на 50%
const POS_KEY = 'deutsch-trainer/game'; // де стоїть поїзд — лише зручність, не прогрес

// Сторінки сайту, які можна відкрити з гри. Інші адреси (#/, #/lessons) закривають вікно.
const ROUTES = [
  { re: /^#\/lesson\/([\w-]+)$/, view: lessons.renderLesson },
  { re: /^#\/cards(?:\/([\w-]+))?$/, view: cards.render },
  { re: /^#\/exercises\/([\w-]+)$/, view: exercises.render },
  { re: /^#\/stress$/, view: stress.render },
];

const $ = (sel) => document.querySelector(sel);
let content = null;
let world = null;
let stations = [];
let cleanup = null;

// Стан кожної станції з прогресу: planned / locked / open / done
function buildStations() {
  const state = getState();
  let prevOk = true;
  return content.lessons.map((l) => {
    const s = l.planned ? null : lessonStats(l, state);
    let st;
    if (l.planned) st = 'planned';
    else if (s.progress >= DONE) st = 'done';
    else if (prevOk || s.progress > 0) st = 'open';
    else st = 'locked';
    prevOk = !!s && s.progress >= UNLOCK;
    return { id: l.id, num: l.num, title: l.title, titleDe: l.titleDe, state: st,
      progress: s ? s.progress : 0, learned: s ? s.learned : 0, total: s ? s.total : 0 };
  });
}

function savePos(i) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ at: i })); } catch { /* приватний режим — не страшно */ }
}
function loadPos() {
  try { return JSON.parse(localStorage.getItem(POS_KEY))?.at; } catch { return undefined; }
}

// ---------- Картка станції внизу екрана ----------
function renderPanel() {
  const s = stations[world.current];
  const panel = $('#station');
  if (!s) return;
  const pct = Math.round(s.progress * 100);
  let body;
  if (s.state === 'planned') {
    body = '<p class="muted">Ця станція ще будується: урок буде пізніше.</p>';
  } else if (s.state === 'locked') {
    const prev = stations[world.current - 1];
    body = `<p class="muted">Закрито. Пройди станцію ${prev.num} хоча б на ${UNLOCK * 100}%.</p>`;
  } else {
    body = `
      <div class="st-progress"><span class="bar"><i style="--p:${s.progress.toFixed(3)}"></i></span><span>${s.learned}/${s.total} слів · ${pct}%</span></div>
      <div class="st-actions">
        <a class="btn" href="#/lesson/${s.id}">${icon('lessons')}Граматика</a>
        <a class="btn" href="#/cards/${s.id}">${icon('cards')}Картки</a>
        <a class="btn btn-marker" href="#/exercises/${s.id}">Вправи</a>
      </div>`;
  }
  panel.innerHTML = `
    <div class="st-head">
      <button class="st-nav" type="button" data-go="-1" aria-label="Попередня станція" ${world.current === 0 ? 'disabled' : ''}>‹</button>
      <span class="lesson-num">${s.num}</span>
      <div class="st-title"><b lang="de">${esc(s.titleDe)}</b><span>${esc(s.title)}</span></div>
      <button class="st-nav" type="button" data-go="1" aria-label="Наступна станція" ${world.current === stations.length - 1 ? 'disabled' : ''}>›</button>
    </div>${body}`;
}

function renderHud() {
  const n = currentStreak();
  const state = getState();
  const due = Object.values(state.cards).filter((c) => c.seen && c.due <= today()).length;
  const done = stations.filter((s) => s.state === 'done').length;
  $('#hud-stats').innerHTML = `
    <span class="streak-chip ${n ? 'is-on' : ''}" title="Стрік">${icon('flame')}<span>${n}</span></span>
    <span class="hud-chip" title="Пройдені станції">🚩 ${done}/${stations.length}</span>
    ${due ? `<a class="hud-chip hud-due" href="#/cards">${due} ${plural(due, 'картка', 'картки', 'карток')} на повтор</a>` : ''}`;
}

function refresh() {
  stations = buildStations();
  world.setStations(stations);
  renderPanel();
  renderHud();
}

// Поїхати до станції. Через закриті станції поїзд не проїжджає.
function travel(i) {
  if (i < 0 || i >= stations.length) return;
  const firstLocked = stations.findIndex((s) => s.state === 'locked');
  if (firstLocked !== -1 && i > firstLocked) {
    toast(`Колія закрита на станції ${stations[firstLocked].num}. Спершу пройди попередню.`);
    i = firstLocked;
  }
  world.moveTo(i);
  savePos(i);
  renderPanel();
}

// ---------- Вікно зі сторінкою сайту поверх світу ----------
function route() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;
  stopSpeaking();
  stopListening();
  document.body.classList.remove('focus-mode');

  const hash = location.hash;
  const found = ROUTES.map((r) => ({ r, m: hash.match(r.re) })).find((x) => x.m);
  const overlay = $('#overlay');
  const app = $('#app');
  if (!found) {
    if (!overlay.hidden) {
      overlay.hidden = true;
      app.innerHTML = '';
      refresh(); // після заняття станції могли змінитися: нові дерева, відкрита колія
    }
    if (hash && hash !== '#/') history.replaceState(null, '', location.pathname);
    return;
  }
  overlay.hidden = false;
  app.innerHTML = '';
  overlay.scrollTo(0, 0);
  cleanup = found.r.view(app, content, ...found.m.slice(1)) || null;
}

function closeOverlay() {
  location.hash = '#/';
}

async function init() {
  installGlobalHandlers();
  try {
    content = await loadContent();
  } catch (err) {
    $('#station').innerHTML = `<p>Не вдалося завантажити уроки: ${esc(err.message)}</p><p>Запусти <code>python3 -m http.server 8000</code> і відкрий http://localhost:8000/game.html</p>`;
    return;
  }
  world = createWorld($('#world'), {
    onPick: (i) => (i === world.current && world.arrived && stations[i].state !== 'locked' && stations[i].state !== 'planned'
      ? (location.hash = `#/lesson/${stations[i].id}`) // повторний клік по станції — зайти в урок
      : travel(i)),
  });
  stations = buildStations();
  world.setStations(stations);
  // Старт: де поїзд стояв минулого разу, інакше перша непройдена відкрита станція
  const saved = loadPos();
  const firstOpen = stations.findIndex((s) => s.state === 'open');
  const start = Number.isInteger(saved) && saved < stations.length && stations[saved].state !== 'locked' ? saved : Math.max(firstOpen, 0);
  world.jumpTo(start);
  renderPanel();
  renderHud();
  onChange(renderHud);

  $('#station').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) travel(world.current + Number(b.dataset.go));
  });
  $('#overlay-close').addEventListener('click', closeOverlay);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (!$('#overlay').hidden) {
      if (e.key === 'Escape') closeOverlay();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'd') travel(world.current + 1);
    if (e.key === 'ArrowLeft' || e.key === 'a') travel(world.current - 1);
    if (e.key === 'Enter') $('#station .btn')?.click();
  });
  addEventListener('hashchange', route);
  route();
}

init();
