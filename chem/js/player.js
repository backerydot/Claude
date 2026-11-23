// Проходження уроку: вступ → картки теорії з питаннями «перевір себе» → контрольна → результат.
// Питання «перевір себе» не впливають на оцінку; контрольну треба здати від 80%.
import { getState, recordResult, PASS, isPassed } from './store.js';
import { esc, fmt, formula, cleanFormula, atoms, splitEquation, countSides, gcdAll, parseNum, cleanText, shuffle, plural } from './chem.js';
import { icon } from './icons.js';

// Повідомити застосунок «Хімія» (Android) про вперше зданий урок — він дасть +5 хв у «Ліміті».
function reportToPhoneApp(lesson, pct) {
  if (typeof window.ChemApp?.lessonPassed !== 'function') return null;
  try {
    return JSON.parse(window.ChemApp.lessonPassed(lesson.id, pct));
  } catch {
    return null;
  }
}

export function render(app, course, lessonId) {
  const lesson = course.byId.get(lessonId);
  if (!lesson) {
    app.innerHTML = '<section class="done"><h1>Такого уроку немає</h1><a class="btn" href="#/lessons">До уроків</a></section>';
    return null;
  }
  const idx = course.lessons.indexOf(lesson);
  const prev = course.lessons[idx - 1];
  if (prev && !isPassed(prev.id) && !isPassed(lesson.id)) {
    app.innerHTML = `
      <section class="done">
        <h1>Урок ще закритий</h1>
        <p>Спершу здай попередній урок: <b>${esc(prev.num)}. ${esc(prev.title)}</b></p>
        <a class="btn btn-marker" href="#/lesson/${prev.id}">Відкрити попередній урок</a>
      </section>`;
    return null;
  }
  const nextL = course.lessons[idx + 1];

  let mode = 'intro'; // intro | steps | quiz | result
  let i = 0;
  let quiz = [];
  let right = 0;
  let wrong = [];
  let answered = false;

  // ---------- Вступ ----------
  function intro() {
    mode = 'intro';
    document.body.classList.remove('focus-mode');
    const best = getState().best[lesson.id];
    const cards = lesson.steps.filter((s) => s.t === 'card').length;
    app.innerHTML = `
      <a class="back" href="#/lessons">${icon('back')}Усі уроки</a>
      <header class="lesson-head">
        <span class="tile tile-big"><span class="tile-num">${esc(lesson.num)}</span></span>
        <div>
          <h1>${esc(lesson.title)}</h1>
          <p class="de-title">${esc(lesson.par)}</p>
        </div>
      </header>
      <section class="block goals">
        <h2>Що ти вмітимеш після уроку</h2>
        <ul class="goal-list">${lesson.goals.map((g) => `<li>${fmt(g)}</li>`).join('')}</ul>
        <p class="muted">≈ ${lesson.min || 10} хв · ${cards} ${plural(cards, 'картка', 'картки', 'карток')} теорії · контрольна з ${lesson.quiz.length} ${plural(lesson.quiz.length, 'питання', 'питань', 'питань')}</p>
        ${best !== undefined ? `<p class="muted">Найкращий результат: <b>${best}%</b>${best >= PASS ? ' — урок зараховано' : ''}</p>` : ''}
      </section>
      <div class="row-actions">
        <button class="btn btn-marker btn-big" data-act="start">${best !== undefined ? 'Пройти ще раз' : 'Почати урок'}</button>
        ${best !== undefined ? '<button class="btn" data-act="quiz">Одразу до контрольної</button>' : ''}
      </div>`;
    app.querySelector('[data-act="start"]').addEventListener('click', startSteps);
    app.querySelector('[data-act="quiz"]')?.addEventListener('click', startQuiz);
  }

  function startSteps() {
    mode = 'steps';
    i = 0;
    document.body.classList.add('focus-mode');
    show();
  }

  function startQuiz() {
    mode = 'quiz';
    i = 0;
    right = 0;
    wrong = [];
    quiz = lesson.quiz;
    document.body.classList.add('focus-mode');
    show();
  }

  const list = () => (mode === 'steps' ? lesson.steps : quiz);

  function frame(inner, task) {
    const items = list();
    const label = mode === 'steps' ? 'Теорія' : 'Контрольна';
    app.innerHTML = `
      <div class="session-top">
        <a class="back" href="#/lesson/${lesson.id}" data-act="exit">${icon('back')}${esc(lesson.title)}</a>
        <span class="count">${label} · ${i + 1} з ${items.length}</span>
      </div>
      <div class="progress-line${mode === 'quiz' ? ' is-quiz' : ''}" aria-hidden="true"><i style="--p:${(i / items.length).toFixed(3)}"></i></div>
      <article class="ex${task ? '' : ' card'}">${task ? `<p class="ex-task">${task}</p>` : ''}${inner}<div class="fb-slot"></div></article>`;
    app.querySelector('[data-act="exit"]').addEventListener('click', (e) => {
      e.preventDefault();
      intro();
    });
  }

  function show() {
    answered = false;
    window.scrollTo(0, 0);
    const s = list()[i];
    if (s.t === 'card') return showCard(s);
    const task = mode === 'steps' ? 'Перевір себе' : null;
    if (s.t === 'choice') showChoice(s, task);
    else if (s.t === 'input') showInput(s, task);
    else if (s.t === 'balance') showBalance(s, task);
    else if (s.t === 'sort') showSort(s, task);
    else if (s.t === 'match') showMatch(s, task);
  }

  // ---------- Картка теорії ----------
  function showCard(s) {
    const table = s.table ? `<div class="table-wrap"><table class="chem-table">${s.table.map((row, r) =>
      `<tr>${row.map((c) => r === 0 ? `<th>${fmt(c)}</th>` : `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
    frame(`
      <h2 class="card-title">${fmt(s.title)}</h2>
      <div class="card-text"><p>${fmt(s.text)}</p></div>
      ${table}
      ${s.example ? `<div class="example"><p class="example-title">${esc(s.example.title || 'Приклад')}</p><p>${fmt(s.example.text)}</p></div>` : ''}
      ${s.tip ? `<p class="tip">${fmt(s.tip)}</p>` : ''}
      <div class="row-actions card-actions">
        <button class="btn btn-marker" data-act="next">${i + 1 < lesson.steps.length ? 'Зрозуміло, далі' : 'До контрольної'}</button>
        ${i > 0 ? '<button class="btn btn-ghost" data-act="prev">Назад</button>' : ''}
      </div>`, null);
    app.querySelector('[data-act="next"]').addEventListener('click', next);
    app.querySelector('[data-act="prev"]')?.addEventListener('click', () => {
      i--;
      show();
    });
  }

  // ---------- Вибір варіанта ----------
  function showChoice(s, task) {
    frame(`
      <p class="ex-q">${fmt(s.q)}</p>
      <div class="options">
        ${shuffle(s.options).map((o) => `<button class="option" data-opt="${esc(o)}">${fmt(o)}</button>`).join('')}
      </div>`, task || 'Обери правильну відповідь');
    app.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
      if (answered) return;
      const ok = btn.dataset.opt === s.answer;
      app.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (b.dataset.opt === s.answer) b.classList.add('is-right');
      });
      if (!ok) btn.classList.add('is-wrong');
      feedback(s, ok);
    }));
  }

  // ---------- Введення: формула, число або слово ----------
  function showInput(s, task) {
    const kind = s.kind || 'text';
    const keys = kind === 'formula' ? ['2', '3', '4', '5', '(', ')'] : kind === 'number' ? [',', '.'] : [];
    frame(`
      <p class="ex-q">${fmt(s.q)}</p>
      <form class="ex-form" autocomplete="off">
        <div class="input-row">
          <input id="ex-input" class="text-input${kind === 'formula' ? ' formula-input' : ''}" type="text"
            ${kind === 'number' ? 'inputmode="decimal"' : ''} autocapitalize="off" autocorrect="off" spellcheck="false"
            aria-label="Відповідь" placeholder="${kind === 'formula' ? 'напр. H2O' : kind === 'number' ? 'число' : 'відповідь'}">
          ${s.unit ? `<span class="unit">${esc(s.unit)}</span>` : ''}
        </div>
        ${kind === 'formula' ? '<p class="preview" aria-live="polite"></p>' : ''}
        ${keys.length ? `<div class="umlauts" data-for="ex-input">${keys.map((k) => `<button type="button" data-insert="${k}">${k}</button>`).join('')}</div>` : ''}
        <button class="btn btn-marker" type="submit">Перевірити</button>
      </form>`, task || (kind === 'number' ? 'Порахуй і впиши відповідь' : kind === 'formula' ? 'Напиши формулу' : 'Впиши відповідь'));
    const input = app.querySelector('#ex-input');
    const preview = app.querySelector('.preview');
    if (preview) {
      input.addEventListener('input', () => {
        const v = cleanFormula(input.value);
        preview.innerHTML = v ? `Виглядає так: <span class="f">${formula(v)}</span>` : '';
      });
    }
    input.focus();
    app.querySelector('.ex-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (answered) return next();
      const value = input.value.trim();
      if (!value) return input.focus();
      const res = checkInput(s, value);
      input.readOnly = true;
      input.classList.add(res.ok ? 'is-right' : 'is-wrong');
      feedback(s, res.ok, res.note);
    });
  }

  function checkInput(s, value) {
    const kind = s.kind || 'text';
    if (kind === 'number') {
      const v = parseNum(value);
      if (Number.isNaN(v)) return { ok: false, note: 'Тут потрібне число.' };
      const ok = s.answers.some((a) => Math.abs(v - Number(a)) <= (s.tol ?? Math.max(0.01, Math.abs(Number(a)) * 0.01)));
      return { ok };
    }
    if (kind === 'formula') {
      const v = cleanFormula(value);
      if (s.answers.some((a) => cleanFormula(a) === v)) return { ok: true };
      if (s.answers.some((a) => cleanFormula(a).toLowerCase() === v.toLowerCase())) {
        return { ok: false, note: 'Майже! Але у символах елементів перша літера велика, друга маленька: Co — це Кобальт, а CO — чадний газ.' };
      }
      // Ті самі атоми, інший порядок (OH2 замість H2O) — підкажемо
      const a = atoms(v);
      const same = a && s.answers.some((x) => JSON.stringify(sortObj(atoms(x))) === JSON.stringify(sortObj(a)));
      return { ok: false, note: same ? 'Атоми ті самі, але у формулі їх пишуть в іншому порядку.' : '' };
    }
    return { ok: s.answers.some((a) => cleanText(a) === cleanText(value)) };
  }

  const sortObj = (o) => Object.fromEntries(Object.entries(o || {}).sort());

  // ---------- Зрівняй рівняння ----------
  function showBalance(s, task) {
    const { left, right: rightSide } = splitEquation(s.eq);
    const field = (f, k) => `<span class="eq-term"><input class="coef-input" data-k="${k}" type="text" inputmode="numeric" maxlength="2" placeholder="1" aria-label="Коефіцієнт перед ${esc(f)}"><span class="f">${formula(f)}</span></span>`;
    const side = (arr, off) => arr.map((f, k) => field(f, off + k)).join('<span class="eq-plus">+</span>');
    frame(`
      ${s.q ? `<p class="ex-q-small">${fmt(s.q)}</p>` : ''}
      <div class="equation">${side(left, 0)}<span class="eq-arrow">→</span>${side(rightSide, left.length)}</div>
      <p class="muted small">Порожня клітинка — це коефіцієнт 1. Рахуй атоми:</p>
      <table class="atom-count"><thead><tr><th>Атоми</th><th>Ліворуч</th><th>Праворуч</th><th></th></tr></thead><tbody></tbody></table>
      <div class="row-actions">
        <button class="btn btn-marker" data-act="check">Перевірити</button>
      </div>`, task || 'Зрівняй рівняння: постав коефіцієнти');
    const inputs = [...app.querySelectorAll('.coef-input')];
    const tbody = app.querySelector('.atom-count tbody');
    const coefs = () => inputs.map((x) => {
      const n = parseInt(x.value, 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    });
    function update() {
      const rows = countSides(s.eq, coefs());
      tbody.innerHTML = rows.map((r) => `<tr class="${r.l === r.r ? 'eq-ok' : 'eq-bad'}"><td><b>${esc(r.el)}</b></td><td>${r.l}</td><td>${r.r}</td><td>${r.l === r.r ? '✓' : '≠'}</td></tr>`).join('');
      return rows;
    }
    inputs.forEach((x) => x.addEventListener('input', () => {
      x.value = x.value.replace(/\D/g, '');
      update();
    }));
    update();
    app.querySelector('[data-act="check"]').addEventListener('click', () => {
      if (answered) return;
      const rows = update();
      const c = coefs();
      const balanced = rows.every((r) => r.l === r.r);
      const minimal = gcdAll(c) === 1;
      inputs.forEach((x) => { x.readOnly = true; });
      const note = balanced && !minimal ? 'Атомів порівну, але всі коефіцієнти можна поділити на одне число. Коефіцієнти мають бути найменшими.' : '';
      feedback(s, balanced && minimal, note);
    });
  }

  // Правильно зрівняне рівняння (з даних уроку) для показу після відповіді
  function balancedText(s) {
    const { left, right: r } = splitEquation(s.eq);
    const c = s.answer;
    const term = (f, k) => `${c[k] > 1 ? c[k] : ''}${f}`;
    return `${left.map((f, k) => term(f, k)).join(' + ')} → ${r.map((f, k) => term(f, left.length + k)).join(' + ')}`;
  }

  // ---------- Розклади по групах ----------
  function showSort(s, task) {
    const items = shuffle(s.items.map((it, k) => ({ text: it[0], bin: it[1], k })));
    frame(`
      <p class="ex-q-small">${fmt(s.q)}</p>
      <ul class="sort-list">${items.map((it) => `
        <li data-k="${it.k}"><span class="sort-item">${fmt(it.text)}</span>
          <span class="seg">${s.bins.map((b, j) => `<button type="button" data-bin="${j}">${fmt(b)}</button>`).join('')}</span></li>`).join('')}
      </ul>
      <div class="row-actions"><button class="btn btn-marker" data-act="check">Перевірити</button></div>`, task || 'Розклади по групах');
    const picked = new Map();
    app.querySelector('.sort-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bin]');
      if (!b || answered) return;
      const li = b.closest('li');
      li.querySelectorAll('[data-bin]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      picked.set(Number(li.dataset.k), Number(b.dataset.bin));
      li.classList.remove('is-missing');
    });
    app.querySelector('[data-act="check"]').addEventListener('click', () => {
      if (answered) return;
      const missing = s.items.map((_, k) => k).filter((k) => !picked.has(k));
      if (missing.length) {
        missing.forEach((k) => app.querySelector(`li[data-k="${k}"]`).classList.add('is-missing'));
        return;
      }
      let errors = 0;
      app.querySelectorAll('.sort-list li').forEach((li) => {
        const k = Number(li.dataset.k);
        const ok = picked.get(k) === s.items[k][1];
        if (!ok) errors++;
        li.classList.add(ok ? 'is-right' : 'is-wrong');
        li.querySelector(`[data-bin="${s.items[k][1]}"]`).classList.add('is-answer');
      });
      feedback(s, errors === 0, errors ? `Помилок: ${errors}. Правильна група підкреслена.` : '');
    });
  }

  // ---------- Знайди пари ----------
  function showMatch(s, task) {
    const pairs = s.pairs.map((p, k) => ({ a: p[0], b: p[1], k }));
    frame(`
      ${s.q ? `<p class="ex-q-small">${fmt(s.q)}</p>` : ''}
      <div class="match">
        <div class="match-col">${shuffle(pairs).map((p) => `<button class="match-item" type="button" data-k="${p.k}" data-side="a">${fmt(p.a)}</button>`).join('')}</div>
        <div class="match-col">${shuffle(pairs).map((p) => `<button class="match-item" type="button" data-k="${p.k}" data-side="b">${fmt(p.b)}</button>`).join('')}</div>
      </div>`, task || 'Знайди пари: натисни ліворуч, потім праворуч');
    let picked = null;
    let misses = 0;
    let found = 0;
    app.querySelector('.match').addEventListener('click', (e) => {
      const b = e.target.closest('.match-item');
      if (!b || b.disabled || answered) return;
      if (!picked || picked.dataset.side === b.dataset.side) {
        picked?.classList.remove('is-picked');
        picked = picked === b ? null : b;
        picked?.classList.add('is-picked');
        return;
      }
      if (picked.dataset.k === b.dataset.k) {
        for (const x of [picked, b]) {
          x.classList.remove('is-picked');
          x.classList.add('is-done');
          x.disabled = true;
        }
        if (++found === pairs.length) feedback(s, misses <= 1, misses ? `Усі пари знайдено, помилок: ${misses}` : '');
      } else {
        misses++;
        for (const x of [picked, b]) {
          x.classList.remove('is-picked');
          x.classList.add('is-miss');
          setTimeout(() => x.classList.remove('is-miss'), 400);
        }
      }
      picked = null;
    });
  }

  // ---------- Відповідь і пояснення ----------
  function answerText(s) {
    if (s.t === 'choice') return fmt(s.answer);
    if (s.t === 'input') return s.kind === 'formula' ? `<span class="f">${formula(s.answers[0])}</span>` : esc(s.answers[0]) + (s.unit ? ` ${esc(s.unit)}` : '');
    if (s.t === 'balance') return `<span class="f">${formula(balancedText(s))}</span>`;
    return '';
  }

  function feedback(s, ok, note = '') {
    answered = true;
    if (mode === 'quiz') {
      if (ok) right++;
      else wrong.push(s);
    }
    app.querySelectorAll('[data-act="check"], .ex-form [type="submit"], .umlauts').forEach((el) => { el.hidden = true; });
    const ans = !ok ? answerText(s) : '';
    const last = i + 1 >= list().length;
    app.querySelector('.fb-slot').innerHTML = `
      <div class="fb ${ok ? 'ok' : 'bad'}" role="status">
        <p class="fb-title">${ok ? 'Правильно' : 'Неправильно'}</p>
        ${note ? `<p class="fb-note">${esc(note)}</p>` : ''}
        ${ans ? `<p class="fb-answer">Правильно: <b>${ans}</b></p>` : ''}
        ${s.explain ? `<p class="fb-explain">${fmt(s.explain)}</p>` : ''}
        <button class="btn btn-marker" data-act="next">${!last ? 'Далі' : mode === 'steps' ? 'До контрольної' : 'Показати результат'}</button>
      </div>`;
    const nextBtn = app.querySelector('[data-act="next"]');
    nextBtn.addEventListener('click', next);
    nextBtn.focus({ preventScroll: true });
    nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function next() {
    i++;
    if (i < list().length) return show();
    if (mode === 'steps') return quizIntro();
    finish();
  }

  function quizIntro() {
    mode = 'quiz-intro';
    window.scrollTo(0, 0);
    app.innerHTML = `
      <section class="done">
        <p class="kicker">Теорію пройдено</p>
        <h1>Контрольна</h1>
        <p>${lesson.quiz.length} ${plural(lesson.quiz.length, 'питання', 'питання', 'питань')}. Щоб урок зарахувався, треба ${PASS}% правильних — це не більше ніж ${Math.floor(lesson.quiz.length * (100 - PASS) / 100)} ${plural(Math.floor(lesson.quiz.length * (100 - PASS) / 100), 'помилка', 'помилки', 'помилок')}.</p>
        <p class="muted">Не поспішай. Якщо не вийде з першого разу — побачиш пояснення до кожної помилки.</p>
        <div class="row-actions">
          <button class="btn btn-marker btn-big" data-act="go">Почати контрольну</button>
          <button class="btn btn-ghost" data-act="back">Ще раз теорію</button>
        </div>
      </section>`;
    app.querySelector('[data-act="go"]').addEventListener('click', startQuiz);
    app.querySelector('[data-act="back"]').addEventListener('click', startSteps);
  }

  // ---------- Результат ----------
  function finish() {
    mode = 'result';
    document.body.classList.remove('focus-mode');
    window.scrollTo(0, 0);
    const pct = Math.round((right / quiz.length) * 100);
    const first = recordResult(lesson.id, pct);
    const passed = pct >= PASS;
    const phone = first ? reportToPhoneApp(lesson, pct) : null;
    const nextOpen = nextL && passed;
    app.innerHTML = `
      <section class="done ex-result">
        <div class="ex-result-head">
          <p class="result-score"><span class="num">${right}</span> з ${quiz.length}</p>
          <p class="stamp ${passed ? 'ok' : 'bad'}">${passed ? 'Зараховано' : 'Ще раз'}</p>
        </div>
        <h1>${passed ? (pct === 100 ? 'Ідеально!' : 'Урок зараховано') : 'Майже, але ще не все'}</h1>
        <p>Результат ${pct}%${passed ? '' : `. Треба ${PASS}%`}</p>
        ${phone?.text ? `
          <div class="fb ok bonus" role="status">
            <p class="fb-title">${esc(phone.title)}</p>
            <p class="fb-explain">${esc(phone.text)}</p>
          </div>` : ''}
        ${wrong.length ? `
          <h2>${passed ? 'Де була помилка' : 'Розберімо помилки'}</h2>
          <ul class="mistakes chem-mistakes">${wrong.map((s) => `
            <li><div>
              <span class="m-prompt">${s.t === 'balance' ? `Зрівняти: <span class="f">${formula(s.eq.replace('=', '→'))}</span>` : fmt(s.q || 'Знайди пари')}</span>
              ${answerText(s) ? `<b>${answerText(s)}</b>` : ''}
              ${s.explain ? `<span class="m-explain">${fmt(s.explain)}</span>` : ''}
            </div></li>`).join('')}
          </ul>` : ''}
        <div class="row-actions">
          ${nextOpen ? `<a class="btn btn-marker" href="#/lesson/${nextL.id}">Наступний урок</a>` : ''}
          ${!passed ? '<button class="btn btn-marker" data-act="again">Ще раз контрольну</button><button class="btn" data-act="theory">Повторити теорію</button>' : ''}
          ${passed && !nextL ? '<a class="btn btn-marker" href="#/">На головну</a>' : ''}
          ${passed ? '<a class="btn" href="#/lessons">Усі уроки</a>' : ''}
        </div>
      </section>`;
    app.querySelector('[data-act="again"]')?.addEventListener('click', startQuiz);
    app.querySelector('[data-act="theory"]')?.addEventListener('click', startSteps);
  }

  intro();
  return () => document.body.classList.remove('focus-mode');
}
