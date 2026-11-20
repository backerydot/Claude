// Картки з інтервальним повторенням
import { getState, save, dayStats, markActive, today } from '../storage.js';
import { schedule, intervals, formatInterval, GRADES } from '../srs.js';
import { label, pluralLabel } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { esc, wordHTML, sayBtn, icon, plural, shuffle } from '../ui.js';

// Що показувати в занятті: слова «на сьогодні» і нові (у межах денного ліміту)
export function planSession(content, state, lessonId) {
  const t = today();
  const lesson = lessonId ? content.lessonById.get(lessonId) : null;
  const scope = lesson ? lesson.words : content.words;
  const due = [];
  const fresh = [];
  for (const w of scope) {
    const c = state.cards[w.id];
    if (c && c.seen) {
      if (c.due <= t) due.push(w);
    } else {
      fresh.push(w);
    }
  }
  const newToday = state.daily[t]?.newCards || 0;
  // Із уроку беремо до 10 нових за раз, із загального повторення — за денним лімітом
  const limit = lesson ? 10 : Math.max(0, state.settings.newPerDay - newToday);
  return { due: shuffle(due), fresh: fresh.slice(0, limit) };
}

export function render(app, content, lessonId) {
  const state = getState();
  const lesson = lessonId ? content.lessonById.get(lessonId) : null;
  const back = lesson ? `#/lesson/${lesson.id}` : '#/';
  const { due, fresh } = planSession(content, state, lessonId);
  const queue = [...due, ...fresh];
  const total = queue.length;

  if (!total) {
    app.innerHTML = emptyHTML(lesson, back);
    return null;
  }

  let current = null;
  let dir = 'de-ua';
  let flipped = false;
  let done = 0;
  const newSeen = new Set();
  const isFresh = (w) => !state.cards[w.id]?.seen;

  function pickDir(w) {
    if (isFresh(w)) return 'de-ua'; // нове слово спершу показуємо німецькою
    const d = state.settings.direction;
    if (d === 'mix') return Math.random() < 0.5 ? 'de-ua' : 'ua-de';
    return d;
  }

  function autoSay() {
    if (state.settings.autoplay) speak(label(current));
  }

  function show() {
    current = queue[0];
    dir = pickDir(current);
    flipped = false;
    draw();
    if (dir === 'de-ua') autoSay();
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    draw();
    if (dir === 'ua-de') autoSay();
    app.querySelector('.grade-good')?.focus({ preventScroll: true });
  }

  function grade(g) {
    if (!flipped) return;
    const w = current;
    if (isFresh(w) && !newSeen.has(w.id)) {
      newSeen.add(w.id);
      dayStats().newCards++;
    }
    state.cards[w.id] = schedule(state.cards[w.id], g);
    dayStats().reviews++;
    markActive();
    save();
    stopSpeaking();
    queue.shift();
    // «Знову» — картка повернеться через кілька інших
    if (g === 'again') queue.splice(Math.min(3, queue.length), 0, w);
    else done++;
    if (queue.length) show();
    else finish();
  }

  function draw() {
    const w = current;
    const lessonTitle = content.lessonById.get(w.lesson)?.title || '';
    const german = `<div class="kk-word">${wordHTML(w)}</div>${sayBtn(label(w))}`;
    const ukrainian = `<div class="kk-ua">${esc(w.ua)}</div>`;
    const pl = pluralLabel(w);
    const details = [
      pl && `<p class="kk-pl">${esc(pl)}</p>`,
      w.forms && `<p class="kk-forms" lang="de">${esc(w.forms)}</p>`,
      w.note && `<p class="kk-note">${esc(w.note)}</p>`,
      w.ex && `<p class="kk-ex"><span class="ex-de" lang="de">${esc(w.ex)}</span>${sayBtn(w.ex, 'Озвучити приклад')}<span class="ex-ua">${esc(w.exUa || '')}</span></p>`,
    ].filter(Boolean).join('');
    const iv = intervals(state.cards[w.id]);

    app.innerHTML = `
      <div class="session-top">
        <a class="back" href="${back}">${icon('back')}Закінчити</a>
        <span class="count">${done} з ${total}</span>
      </div>
      <div class="progress-line" aria-hidden="true"><i style="--p:${(done / total).toFixed(3)}"></i></div>
      <article class="kk" aria-live="polite">
        <div class="kk-head"><span>${esc(lessonTitle)}</span>${isFresh(w) ? '<span class="kk-tag">нове слово</span>' : ''}</div>
        <div class="kk-front">${dir === 'de-ua' ? german : ukrainian}</div>
        ${flipped ? `<div class="kk-back">${dir === 'de-ua' ? ukrainian : german}${details}</div>` : ''}
      </article>
      <div class="kk-actions">
        ${flipped
          ? `<div class="grades">${GRADES.map((g) => `<button class="grade grade-${g.id}" data-grade="${g.id}">${g.label}<small>${formatInterval(iv[g.id])}</small></button>`).join('')}</div>`
          : '<button class="btn btn-marker btn-wide" data-act="flip">Показати відповідь</button>'}
      </div>
      <p class="kbd-hint">На клавіатурі: пробіл показує відповідь, клавіші 1–4 ставлять оцінку</p>`;

    app.querySelector('[data-act="flip"]')?.addEventListener('click', flip);
    app.querySelector('.kk').addEventListener('click', (e) => {
      if (!e.target.closest('button')) flip();
    });
    app.querySelectorAll('[data-grade]').forEach((b) => b.addEventListener('click', () => grade(b.dataset.grade)));
  }

  function finish() {
    app.innerHTML = `
      <section class="done">
        <h1>Готово</h1>
        <p>Повторено ${done} ${plural(done, 'картку', 'картки', 'карток')}${newSeen.size ? `, з них нових ${newSeen.size}` : ''}</p>
        <div class="row-actions">
          <a class="btn btn-marker" href="#/stress">Перевірити себе в стрес-тесті</a>
          <a class="btn" href="${back}">${lesson ? 'Повернутися до уроку' : 'На головну'}</a>
        </div>
      </section>`;
  }

  const onKey = (e) => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
      if (e.target.closest('button, a')) return;
      e.preventDefault();
      flip();
    } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      grade(GRADES[Number(e.key) - 1].id);
    }
  };
  document.addEventListener('keydown', onKey);
  show();
  return () => document.removeEventListener('keydown', onKey);
}

function emptyHTML(lesson, back) {
  const text = lesson
    ? 'Усі слова цього уроку вже в повторенні. Наступні картки з’являться за розкладом.'
    : 'Повторювати поки нічого, а нові слова на сьогодні закінчились. Ліміт можна змінити в параметрах.';
  return `
    <section class="done">
      <h1>На зараз усе</h1>
      <p>${text}</p>
      <div class="row-actions">
        <a class="btn btn-marker" href="#/stress">Пройти стрес-тест</a>
        <a class="btn" href="${lesson ? back : '#/lessons'}">${lesson ? 'Повернутися до уроку' : 'Відкрити уроки'}</a>
      </div>
    </section>`;
}
