// Хімія: запуск, маршрути (#/, #/lessons, #/lesson/:id, #/table, #/settings) і прості сторінки
import { getState, isPassed, streak, passedToday, exportJSON, importJSON, today, PASS } from './store.js';
import { esc, fmt, plural } from './chem.js';
import { icon } from './icons.js';
import * as player from './player.js';

window.__chemStarted = true;

const app = document.getElementById('app');
let course = null;
let elements = [];
let cleanup = null;

// ---------- Завантаження уроків ----------
async function loadCourse() {
  const get = async (url) => {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Не вдалося завантажити ${url}`);
    return r.json();
  };
  const meta = await get('data/course.json');
  // Розділ, який ще пишеться (файлу немає), показуємо як «готується», а не ламаємо весь сайт
  const files = await Promise.all(meta.sections.map((s) => get(s.file).catch(() => ({ lessons: [] }))));
  const lessons = [];
  meta.sections.forEach((s, k) => {
    s.lessons = files[k].lessons;
    s.lessons.forEach((l) => { l.section = s; lessons.push(l); });
  });
  elements = (await get('data/elements.json')).elements;
  return { sections: meta.sections, lessons, byId: new Map(lessons.map((l) => [l.id, l])) };
}

// Перший незданий урок — він і є «наступний»
const nextLesson = () => course.lessons.find((l) => !isPassed(l.id));
const isOpen = (l) => {
  const k = course.lessons.indexOf(l);
  return k === 0 || isPassed(l.id) || isPassed(course.lessons[k - 1].id);
};

// ---------- Головна ----------
function renderHome() {
  const n = nextLesson();
  const done = course.lessons.filter((l) => isPassed(l.id)).length;
  const total = course.lessons.length;
  const st = streak();
  const todayN = passedToday();
  const inApp = typeof window.ChemApp?.lessonPassed === 'function';
  app.innerHTML = `
    <header class="page-head">
      <p class="kicker">Хімія · 8 клас</p>
      <h1>${done === 0 ? 'Почнімо з простого' : n ? 'Продовжуємо' : 'Курс пройдено!'}</h1>
      <p class="muted">Спершу 14 уроків повторення 7 класу, потім 8 клас за підручником Григоровича. Один урок — близько 10 хвилин.</p>
    </header>
    ${n ? `
      <a class="next-card" href="#/lesson/${n.id}">
        <span class="tile tile-big"><span class="tile-sec">${esc(n.section.short)}</span><span class="tile-num">${esc(n.num)}</span></span>
        <span class="next-body">
          <span class="kicker">Наступний урок</span>
          <span class="t">${esc(n.title)}</span>
          <span class="de">${esc(n.par)}</span>
          <span class="btn btn-marker next-btn">Почати</span>
        </span>
      </a>` : `<p class="note">Усі ${total} уроків зараховано. Можна повторювати будь-який урок зі списку.</p>`}
    <section class="stats">
      <div class="stat"><span class="num">${done}</span><span class="muted">з ${total} уроків</span></div>
      <div class="stat"><span class="num">${st}</span><span class="muted">${plural(st, 'день', 'дні', 'днів')} поспіль</span></div>
      <div class="stat"><span class="num">${todayN}</span><span class="muted">сьогодні</span></div>
    </section>
    ${inApp ? `<p class="bonus-line">${icon('clock')}<span>Кожен новий зданий урок — <b>+5 хв</b> екстра-часу в «Ліміті». Час у цьому застосунку не рахується.</span></p>` : ''}
    <section class="block">
      <h2>Шлях</h2>
      ${course.sections.map((s) => {
        const d = s.lessons.filter((l) => isPassed(l.id)).length;
        return `
          <div class="path-sec">
            <div class="path-head"><span class="t">${esc(s.title)}</span><span class="meta">${s.lessons.length ? `${d}/${s.lessons.length}` : 'готується'}</span></div>
            <div class="path-cells">${s.lessons.map((l) => `<a class="cell${isPassed(l.id) ? ' is-done' : ''}${l === n ? ' is-next' : ''}" href="#/lesson/${l.id}" title="${esc(l.num)}. ${esc(l.title)}" aria-label="${esc(l.num)}. ${esc(l.title)}${isPassed(l.id) ? ', зараховано' : ''}"></a>`).join('')}</div>
          </div>`;
      }).join('')}
    </section>`;
}

// ---------- Список уроків ----------
function renderLessons() {
  const n = nextLesson();
  app.innerHTML = `
    <header class="page-head">
      <h1>Уроки</h1>
      <p class="muted">Новий урок відкривається, коли здано попередній (від ${PASS}% у контрольній).</p>
    </header>
    ${course.sections.map((s) => `
      <section class="lesson-sec">
        <h2>${esc(s.title)}</h2>
        ${s.sub ? `<p class="muted">${esc(s.sub)}</p>` : ''}
        ${s.lessons.length ? '' : '<p class="note">Уроки цього розділу ще готуються — з’являться, поки ти проходиш попередні.</p>'}
        <ol class="lesson-list">${s.lessons.map((l) => {
          const passed = isPassed(l.id);
          const open = isOpen(l);
          const best = getState().best[l.id];
          const meta = passed ? `${icon('check')}${best}%` : open ? (l === n ? 'далі' : best !== undefined ? `${best}%` : '') : icon('lock');
          return `<li class="${open ? '' : 'is-planned'}${passed ? ' is-passed' : ''}${l === n ? ' is-next' : ''}">
            <a class="lesson-row" href="#/lesson/${l.id}"><span class="num">${esc(l.num)}</span>
              <span class="body"><span class="t">${esc(l.title)}</span><span class="de">${esc(l.par)}</span></span>
              <span class="meta">${meta}</span></a></li>`;
        }).join('')}</ol>
      </section>`).join('')}`;
  app.querySelector('.is-next')?.scrollIntoView({ block: 'center' });
}

// ---------- Періодична таблиця ----------
const KIND = { m: 'метал', n: 'неметал', g: 'інертний газ' };
function renderTable() {
  const main = elements.filter((e) => e.p <= 4);
  const extra = elements.filter((e) => e.p > 4);
  const cell = (e) => `<button class="el el-${e.kind}" type="button" data-s="${e.s}" style="grid-row:${e.p + 1};grid-column:${e.g}"><span class="el-z">${e.z}</span><span class="el-s">${e.s}</span><span class="el-ar">${String(e.ar).replace('.', ',')}</span></button>`;
  app.innerHTML = `
    <header class="page-head">
      <h1>Періодична таблиця</h1>
      <p class="muted">Перші 4 періоди і кілька важких елементів, що трапляються в задачах. Натисни на елемент.</p>
      <p class="legend"><span><i class="dot el-m"></i>метали</span><span><i class="dot el-n"></i>неметали</span><span><i class="dot el-g"></i>інертні гази</span></p>
    </header>
    <div class="ptable-wrap"><div class="ptable">
      ${Array.from({ length: 18 }, (_, k) => `<span class="pg" style="grid-row:1;grid-column:${k + 1}">${k + 1}</span>`).join('')}
      ${main.map(cell).join('')}
    </div></div>
    <p class="muted small">Номер групи — над стовпцем, номер періоду — рядок (1–4).</p>
    <div class="ptable-extra">${extra.map((e) => cell(e).replace(/style="[^"]*"/, '')).join('')}</div>
    <div class="el-info" aria-live="polite"><p class="muted">Тут з’явиться опис елемента.</p></div>`;
  const info = app.querySelector('.el-info');
  app.addEventListener('click', (ev) => {
    const b = ev.target.closest('.el');
    if (!b) return;
    app.querySelectorAll('.el.is-picked').forEach((x) => x.classList.remove('is-picked'));
    b.classList.add('is-picked');
    const e = elements.find((x) => x.s === b.dataset.s);
    info.innerHTML = `
      <div class="el-card">
        <span class="el big el-${e.kind}"><span class="el-z">${e.z}</span><span class="el-s">${e.s}</span><span class="el-ar">${String(e.ar).replace('.', ',')}</span></span>
        <div>
          <h2>${esc(e.name)}</h2>
          <p>${e.read ? `У формулах читаємо «<b>${esc(e.read)}</b>». ` : ''}${KIND[e.kind]}</p>
          <p class="muted">Порядковий номер ${e.z} · A<sub>r</sub> = ${String(e.ar).replace('.', ',')} · ${e.p}-й період, ${e.g}-а група${e.val ? ` · валентність ${esc(e.val)}` : ''}</p>
        </div>
      </div>`;
  });
}

// ---------- Параметри ----------
function renderSettings() {
  app.innerHTML = `
    <header class="page-head"><h1>Параметри</h1></header>
    <section class="set-group">
      <h2>Копія прогресу</h2>
      <p class="muted">Прогрес зберігається лише на цьому пристрої. Щоб перенести на інший телефон — збережи копію і віднови її там.</p>
      <div class="row-actions">
        <button class="btn" data-act="save">Зберегти копію</button>
        <label class="btn">Відновити з копії<input type="file" accept="application/json,.json" hidden></label>
      </div>
      <p class="msg muted" role="status"></p>
    </section>
    <section class="set-group">
      <h2>Про курс</h2>
      <p class="muted">Порядок тем — за підручниками «Хімія» О. Григоровича й О. Недоруба для 7 (2024) і 8 (2025) класу. Усі пояснення й задачі тут власні, тож номери задач з підручника не збігатимуться.</p>
    </section>`;
  const msg = app.querySelector('.msg');
  app.querySelector('[data-act="save"]').addEventListener('click', () => {
    const name = `chem-${today()}.json`;
    if (typeof window.ChemApp?.saveBackup === 'function') {
      window.ChemApp.saveBackup(name, exportJSON());
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  app.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      importJSON(await f.text());
      msg.textContent = 'Прогрес відновлено.';
    } catch (err) {
      msg.textContent = `Не вдалося: ${err.message}`;
    }
  });
}

// ---------- Маршрути ----------
const ROUTES = [
  { re: /^#?\/?$/, view: renderHome, tab: 'home', title: '' },
  { re: /^#\/lessons$/, view: renderLessons, tab: 'lessons', title: 'Уроки' },
  { re: /^#\/lesson\/([\w-]+)$/, view: (a, c, id) => player.render(a, c, id), tab: 'lessons', title: 'Урок' },
  { re: /^#\/table$/, view: renderTable, tab: 'table', title: 'Таблиця' },
  { re: /^#\/settings$/, view: renderSettings, tab: 'settings', title: 'Параметри' },
];

function route() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;
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
  document.title = found.r.title ? `${found.r.title}. Хімія` : 'Хімія';
  app.innerHTML = '';
  window.scrollTo(0, 0);
  cleanup = found.r.view(app, course, ...found.m.slice(1)) || null;
  renderStreak();
}

function renderStreak() {
  const n = streak();
  const chip = document.getElementById('streak');
  chip.innerHTML = `${icon('flame')}<span>${n}</span>`;
  chip.classList.toggle('is-on', n > 0);
  chip.title = n ? `${n} ${plural(n, 'день', 'дні', 'днів')} поспіль` : 'Стрік ще не почався';
  chip.setAttribute('aria-label', chip.title);
}

// Кнопки 2, 3, (, ) під полем формули вставляють символ туди, де курсор
document.addEventListener('click', (e) => {
  const key = e.target.closest('[data-insert]');
  if (!key) return;
  const box = key.closest('[data-for]');
  const input = box && document.getElementById(box.dataset.for);
  if (!input || input.readOnly) return;
  const s = input.selectionStart ?? input.value.length;
  input.setRangeText(key.dataset.insert, s, input.selectionEnd ?? s, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
});
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-insert]')) e.preventDefault();
});

async function init() {
  document.querySelectorAll('.tab').forEach((a) => a.insertAdjacentHTML('afterbegin', icon(a.dataset.tab)));
  document.querySelector('.brand-mark').innerHTML = icon('flask');
  try {
    course = await loadCourse();
  } catch (err) {
    app.innerHTML = `<section class="error-box"><h1>Не вдалося завантажити уроки</h1><p>${esc(err.message)}</p></section>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

init();
export { fmt };
