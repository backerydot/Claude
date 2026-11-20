// Вправи до уроку: вибір варіанта, пропуск, порядок слів, переклад,
// а ще автоматичні зі слів уроку: артиклі, «знайди пари», диктант на слух
import { getState, save, dayStats, markActive } from '../storage.js';
import { label } from '../content.js';
import { speak, stopSpeaking } from '../speech.js';
import { normalize, similarity } from '../match.js';
import { esc, icon, sayBtn, shuffle, umlautKeys, wordHTML, plural } from '../ui.js';

const ARTICLE_DRILL = 4; // скільки питань «der, das чи die?» додати на початок
const MATCH = 5;         // скільки пар у вправі «знайди пари»
const LISTEN = 2;        // скільки диктантів на слух

// Німецькі шкільні оцінки: 1 — найкраща, 6 — найгірша
const NOTEN = [[92, 1, 'sehr gut'], [81, 2, 'gut'], [67, 3, 'befriedigend'], [50, 4, 'ausreichend'], [30, 5, 'mangelhaft'], [0, 6, 'ungenügend']];

// «Знайди пари»: німецьке слово ↔ переклад (переклади без повторів)
function matchRound(lesson) {
  const seen = new Set();
  const words = shuffle(lesson.words).filter((w) => !seen.has(w.ua) && seen.add(w.ua)).slice(0, MATCH);
  return words.length >= 3 ? [{ type: 'match', words }] : [];
}

// Диктант: короткі приклади речень зі слів уроку
function listenRound(lesson) {
  return shuffle(lesson.words.filter((w) => w.ex && w.ex.split(' ').length <= 6))
    .slice(0, LISTEN)
    .map((w) => ({ type: 'listen', answers: [w.ex], explain: w.exUa }));
}

// Розминка з артиклями зі слів уроку
function articleDrill(lesson) {
  const nouns = lesson.words.filter((w) => w.pos === 'n' && w.art && !w.plOnly);
  return shuffle(nouns).slice(0, ARTICLE_DRILL).map((w) => ({
    type: 'choice',
    drill: true,
    q: `___ ${w.de}`,
    options: ['der', 'das', 'die'],
    answer: w.art,
    say: `${w.art} ${w.de}`,
    explain: `${w.art} ${w.de} — ${w.ua}.`,
  }));
}

// Повне правильне речення — показуємо й озвучуємо після відповіді
function fullText(ex) {
  if (ex.say) return ex.say;
  if (ex.type === 'choice' || ex.type === 'gap') {
    const answer = ex.type === 'choice' ? ex.answer : ex.answers[0];
    return ex.q.includes('___') ? ex.q.replace('___', answer) : answer;
  }
  return ex.answers[0];
}

// У розминці з артиклями відповідь фарбуємо кольором роду
const gender = (ex) => (ex.drill ? ` class="g-${ex.answer}"` : '');

const isRight = (value, answers) => answers.some((a) => normalize(a) === normalize(value));

// Перевірка речення з клавіатури: «майже», якщо відрізняється на кілька літер
const typedCheck = (answers) => (value) => {
  const ok = isRight(value, answers);
  const best = Math.max(...answers.map((a) => similarity(normalize(a), normalize(value))));
  return { ok, close: !ok && best >= 0.85 };
};

export function render(app, content, lessonId) {
  const lesson = content.lessonById.get(lessonId);
  if (!lesson || lesson.planned || !lesson.exercises.length) {
    app.innerHTML = '<section class="done"><h1>Вправ поки немає</h1><a class="btn" href="#/lessons">До уроків</a></section>';
    return null;
  }
  const back = `#/lesson/${lesson.id}`;
  let items = [];
  let i = 0;
  let right = 0;
  let answered = false;
  let wrong = []; // вправи з помилками — покажемо в кінці

  function start() {
    // Диктанти вставляємо між вправами уроку, щоб типи чергувалися
    const own = lesson.exercises;
    const third = Math.ceil(own.length / 3);
    const [l1, l2] = listenRound(lesson);
    items = [...articleDrill(lesson), ...matchRound(lesson), ...own.slice(0, third), l1,
      ...own.slice(third, 2 * third), l2, ...own.slice(2 * third)].filter(Boolean);
    i = 0;
    right = 0;
    wrong = [];
    show();
  }

  function frame(inner) {
    app.innerHTML = `
      <div class="session-top">
        <a class="back" href="${back}">${icon('back')}${esc(lesson.title)}</a>
        <span class="count">${i + 1} з ${items.length}</span>
      </div>
      <div class="progress-line" aria-hidden="true"><i style="--p:${(i / items.length).toFixed(3)}"></i></div>
      <article class="ex">${inner}<div class="fb-slot"></div></article>`;
  }

  function show() {
    answered = false;
    const ex = items[i];
    if (ex.type === 'choice') showChoice(ex);
    else if (ex.type === 'gap') showGap(ex);
    else if (ex.type === 'order') showOrder(ex);
    else if (ex.type === 'match') showMatch(ex);
    else if (ex.type === 'listen') showListen(ex);
    else showTranslate(ex);
  }

  function showMatch(ex) {
    const byId = new Map(ex.words.map((w) => [w.id, w]));
    frame(`
      <p class="ex-task">Знайди пари: натисни слово, а потім його переклад</p>
      <div class="match">
        <div class="match-col">${ex.words.map((w) => `<button class="match-item" type="button" data-id="${w.id}" data-side="de">${wordHTML(w)}</button>`).join('')}</div>
        <div class="match-col">${shuffle(ex.words).map((w) => `<button class="match-item" type="button" data-id="${w.id}" data-side="ua">${esc(w.ua)}</button>`).join('')}</div>
      </div>`);
    let picked = null;
    let misses = 0;
    let found = 0;
    app.querySelector('.match').addEventListener('click', (e) => {
      const b = e.target.closest('.match-item');
      if (!b || b.disabled || answered) return;
      if (b.dataset.side === 'de') speak(label(byId.get(b.dataset.id)));
      // Перший вибір або інше слово з того ж стовпця — просто позначаємо
      if (!picked || picked.dataset.side === b.dataset.side) {
        picked?.classList.remove('is-picked');
        picked = picked === b ? null : b;
        picked?.classList.add('is-picked');
        return;
      }
      if (picked.dataset.id === b.dataset.id) {
        for (const x of [picked, b]) {
          x.classList.remove('is-picked');
          x.classList.add('is-done');
          x.disabled = true;
        }
        if (++found === ex.words.length) {
          feedback(ex, misses <= 1, { title: misses ? `Усі пари знайдено, помилок: ${misses}` : 'Усі пари без жодної помилки' });
        }
      } else {
        misses++;
        for (const x of [picked, b]) {
          x.classList.remove('is-picked');
          x.classList.add('is-miss'); // коротко трусимо червоним
          setTimeout(() => x.classList.remove('is-miss'), 400);
        }
      }
      picked = null;
    });
  }

  function showListen(ex) {
    const text = ex.answers[0];
    frame(`
      <p class="ex-task">Послухай і запиши німецькою</p>
      <div class="listen">
        <button class="btn listen-play" type="button" data-act="play" aria-label="Прослухати ще раз">${icon('speaker')}</button>
        <button class="btn btn-ghost" type="button" data-act="slow">Повільніше</button>
      </div>
      <form class="ex-form" autocomplete="off">
        <input id="ex-input" class="text-input" type="text" autocapitalize="sentences" autocorrect="off" spellcheck="false" lang="de" aria-label="Що почув німецькою">
        ${umlautKeys('ex-input')}
        <button class="btn btn-marker" type="submit">Перевірити</button>
      </form>`);
    app.querySelector('[data-act="play"]').addEventListener('click', () => speak(text));
    app.querySelector('[data-act="slow"]').addEventListener('click', () => speak(text, { rate: 0.6 }));
    speak(text);
    bindTyped(ex, typedCheck(ex.answers));
  }

  function showChoice(ex) {
    const options = ex.drill ? ex.options : shuffle(ex.options);
    const q = esc(ex.q).replace('___', '<span class="blank"></span>');
    frame(`
      <p class="ex-task">${ex.drill ? 'Який артикль?' : 'Обери правильний варіант'}</p>
      <p class="ex-q" lang="de">${q}</p>
      <div class="options${ex.drill ? ' options-row' : ''}">
        ${options.map((o) => `<button class="option${ex.drill ? ` g-${o}` : ''}" data-opt="${esc(o)}" lang="de">${esc(o)}</button>`).join('')}
      </div>`);
    app.querySelectorAll('.option').forEach((btn) => btn.addEventListener('click', () => {
      if (answered) return;
      const ok = btn.dataset.opt === ex.answer;
      app.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (b.dataset.opt === ex.answer) b.classList.add('is-right');
      });
      if (!ok) btn.classList.add('is-wrong');
      feedback(ex, ok);
    }));
  }

  function showGap(ex) {
    const [before, after = ''] = esc(ex.q).split('___');
    const width = Math.max(4, ex.answers[0].length + 2);
    frame(`
      <p class="ex-task">Встав пропущене слово${ex.hint ? ` <span class="ex-hint">(${esc(ex.hint)})</span>` : ''}</p>
      <form class="ex-form" autocomplete="off">
        <p class="ex-q" lang="de">${before}<input id="ex-input" class="gap-input" style="width:${width}ch" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" lang="de" aria-label="Пропущене слово">${after}</p>
        ${umlautKeys('ex-input')}
        <button class="btn btn-marker" type="submit">Перевірити</button>
      </form>`);
    bindTyped(ex, (value) => ({ ok: isRight(value, ex.answers) }));
  }

  function showTranslate(ex) {
    frame(`
      <p class="ex-task">Переклади німецькою</p>
      <p class="ex-prompt">${esc(ex.ua)}</p>
      <form class="ex-form" autocomplete="off">
        <input id="ex-input" class="text-input" type="text" autocapitalize="sentences" autocorrect="off" spellcheck="false" lang="de" aria-label="Переклад німецькою">
        ${umlautKeys('ex-input')}
        <button class="btn btn-marker" type="submit">Перевірити</button>
      </form>`);
    bindTyped(ex, typedCheck(ex.answers));
  }

  // Спільне для полів введення: Enter перевіряє, а після відповіді — йде далі
  function bindTyped(ex, check) {
    const input = app.querySelector('#ex-input');
    input.focus();
    app.querySelector('.ex-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (answered) {
        next();
        return;
      }
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      const result = check(value);
      input.readOnly = true;
      input.classList.add(result.ok ? 'is-right' : 'is-wrong');
      feedback(ex, result.ok, { close: result.close });
    });
  }

  function showOrder(ex) {
    let pool = shuffle(ex.words);
    // Щоб картки не лягли одразу в правильному порядку
    if (normalize(pool.join(' ')) === normalize(ex.answers[0])) pool = [...pool].reverse();
    frame(`
      <p class="ex-task">Склади речення</p>
      <p class="ex-prompt">${esc(ex.ua)}</p>
      <div class="answer-line" aria-label="Твоє речення" lang="de"></div>
      <div class="chips pool" lang="de">${pool.map((w) => `<button class="chip" type="button">${esc(w)}</button>`).join('')}</div>
      <div class="row-actions">
        <button class="btn btn-marker" data-act="check">Перевірити</button>
        <button class="btn btn-ghost" data-act="reset">Почати спочатку</button>
      </div>`);
    const line = app.querySelector('.answer-line');
    const poolEl = app.querySelector('.pool');
    app.querySelector('.ex').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip || answered) return;
      (chip.parentElement === poolEl ? line : poolEl).appendChild(chip);
    });
    app.querySelector('[data-act="reset"]').addEventListener('click', () => {
      if (answered) return;
      line.querySelectorAll('.chip').forEach((c) => poolEl.appendChild(c));
    });
    app.querySelector('[data-act="check"]').addEventListener('click', () => {
      if (answered) return;
      const built = [...line.querySelectorAll('.chip')].map((c) => c.textContent).join(' ');
      if (!built) return;
      feedback(ex, isRight(built, ex.answers));
    });
  }

  function feedback(ex, ok, { close = false, title } = {}) {
    answered = true;
    if (ok) right++;
    else if (ex.type !== 'match') wrong.push(ex);
    const full = ex.type === 'match' ? '' : fullText(ex);
    app.querySelectorAll('[data-act="check"], [data-act="reset"], .ex-form [type="submit"], .umlauts').forEach((el) => { el.hidden = true; });
    title = title || (ok ? 'Правильно' : close ? 'Майже, перевір написання' : 'Неправильно');
    app.querySelector('.fb-slot').innerHTML = `
      <div class="fb ${ok ? 'ok' : 'bad'}" role="status">
        <p class="fb-title">${title}</p>
        ${full ? `<p class="fb-answer"><b lang="de"${gender(ex)}>${esc(full)}</b>${sayBtn(full)}</p>` : ''}
        ${ex.explain ? `<p class="fb-explain">${esc(ex.explain)}</p>` : ''}
        <button class="btn btn-marker" data-act="next">${i + 1 < items.length ? 'Далі' : 'Показати результат'}</button>
      </div>`;
    const nextBtn = app.querySelector('[data-act="next"]');
    nextBtn.addEventListener('click', next);
    nextBtn.focus({ preventScroll: true });
    nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (full && getState().settings.autoplay) speak(full);
  }

  function next() {
    stopSpeaking();
    i++;
    if (i < items.length) show();
    else finish();
  }

  function finish() {
    const state = getState();
    const pct = Math.round((right / items.length) * 100);
    const prevBest = state.exercises[lesson.id] || 0;
    state.exercises[lesson.id] = Math.max(prevBest, pct);
    dayStats().exercises++;
    markActive();
    save();
    const title = pct >= 90 ? 'Чудово' : pct >= 70 ? 'Добре' : 'Варто повторити';
    const record = prevBest && pct > prevBest ? `, найкращий досі (був ${prevBest}%)` : '';
    const [, note, noteDe] = NOTEN.find(([min]) => pct >= min);
    const prompt = (ex) => ex.ua || (ex.q ? ex.q : 'Диктант');
    app.innerHTML = `
      <section class="done ex-result">
        <div class="ex-result-head">
          <p class="result-score"><span class="num">${right}</span> з ${items.length}</p>
          <p class="note-stamp" aria-label="Оцінка ${note}, ${noteDe}"><span class="note-num">${note}</span><span lang="de">${noteDe}</span></p>
        </div>
        <h1>${title}</h1>
        <p>Результат ${pct}%${record}</p>
        ${pct < 70 ? '<p>Перечитай граматику уроку й спробуй ще раз</p>' : ''}
        <p class="muted">Оцінка — як у німецькій школі: 1 найкраща, 6 найгірша</p>
        ${wrong.length ? `
          <h2>Над чим попрацювати</h2>
          <ul class="mistakes">${wrong.map((ex) => `
            <li><div><span class="m-prompt">${esc(prompt(ex))}</span><b lang="de"${gender(ex)}>${esc(fullText(ex))}</b></div>${sayBtn(fullText(ex))}</li>`).join('')}
          </ul>` : ''}
        <div class="row-actions">
          <button class="btn btn-marker" data-act="again">Ще раз</button>
          <a class="btn" href="${back}">До уроку</a>
        </div>
      </section>`;
    app.querySelector('[data-act="again"]').addEventListener('click', start);
  }

  start();
  return () => stopSpeaking();
}
