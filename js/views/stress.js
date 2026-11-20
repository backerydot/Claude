// Стрес-тест: питання на час, відповідь голосом (або з клавіатури)
import { getState, save, dayStats, markActive, today, updateSettings } from '../storage.js';
import { label } from '../content.js';
import { speak, stopSpeaking, listen, stopListening, canRecognize, requestMic, beep } from '../speech.js';
import { checkWord, checkArticle, checkSentence, checkPattern, letterHint, articleRule } from '../match.js';
import { esc, icon, sayBtn, shuffle, plural, sleep, umlautKeys, fmtNum } from '../ui.js';

const MIN_WORDS = 8; // скільки слів треба вивчити, щоб почати
// Помилки мікрофона, після яких голосом далі не вийде
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported', 'unsupported']);

// Складаємо питання тільки з того, що вже вчили
function buildQuestions(content, state, count, demo) {
  const learned = demo ? content.lessons[0].words : content.words.filter((w) => state.cards[w.id]?.seen);
  const lessonIds = new Set(learned.map((w) => w.lesson));
  const wordQs = shuffle(learned).map((w) => ({ kind: 'word', w }));
  const articleQs = shuffle(learned.filter((w) => w.pos === 'n' && w.art && !w.plOnly)).map((w) => ({ kind: 'article', w }));
  const phraseQs = shuffle(
    content.lessons.filter((l) => lessonIds.has(l.id)).flatMap((l) => l.speak.map((s) => ({ kind: s.type, s }))),
  );

  // Приблизно: 30% фраз, 25% артиклів, решта — переклад слів
  const nPhrases = Math.min(phraseQs.length, Math.round(count * 0.3));
  const nArticles = Math.min(articleQs.length, Math.round(count * 0.25));
  const picked = [...phraseQs.slice(0, nPhrases), ...articleQs.slice(0, nArticles)];
  const used = new Set(picked.filter((q) => q.w).map((q) => q.w.id));
  for (const q of wordQs) {
    if (picked.length >= count) break;
    if (!used.has(q.w.id)) picked.push(q);
  }
  for (const q of [...phraseQs.slice(nPhrases), ...articleQs.slice(nArticles)]) {
    if (picked.length >= count) break;
    picked.push(q);
  }
  return shuffle(picked).slice(0, count);
}

function correctText(q) {
  if (q.w) return label(q.w);
  return q.kind === 'question' ? q.s.example : q.s.answers[0];
}

function micErrorText(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Браузер не дав доступу до мікрофона. Відповідай з клавіатури або дозволь мікрофон у налаштуваннях сайту.';
  }
  if (code === 'network') {
    return 'Розпізнавання мови тут не працює: потрібен Google Chrome і інтернет. Поки відповідай з клавіатури.';
  }
  if (code === 'audio-capture') return 'Мікрофон не знайдено. Відповідай з клавіатури.';
  return 'Голосове введення недоступне. Відповідай з клавіатури.';
}

export function render(app, content) {
  const state = getState();
  const S = state.settings;
  let alive = true; // стає false, коли йдемо зі сторінки
  let mode = canRecognize() && S.stressInput !== 'keyboard' ? 'voice' : 'keyboard';
  let notice = '';
  let run = null; // стан поточного тесту
  let raf = 0;
  let autoNext = 0;

  const seconds = (q) => (q.kind === 'sentence' || q.kind === 'question' ? S.stressSeconds + 5 : S.stressSeconds);
  const timeLeft = () => Math.max(0, run.total - (performance.now() - run.start));
  const isCurrent = (q) => alive && run && run.qs[run.i] === q;

  // ---------- Екран перед стартом ----------

  function intro() {
    document.body.classList.remove('focus-mode');
    const learned = content.words.filter((w) => state.cards[w.id]?.seen).length;
    const enough = learned >= MIN_WORDS;
    const voiceOk = canRecognize();
    app.innerHTML = `
      <section class="stress-intro">
        <h1>Стрес-тест</h1>
        <p class="lead">${S.stressCount} питань на швидкість. На кожне слово є ${S.stressSeconds} секунд, на речення ${S.stressSeconds + 5}.</p>
        <ul class="rules">
          <li>Відповідай уголос німецькою або з клавіатури</li>
          <li>Підказка відкриває перші літери, але забирає половину балів</li>
          <li>Швидка відповідь і серія правильних дають бонус</li>
          <li>Питання беруться тільки з вивчених слів і фраз</li>
        </ul>
        <div class="seg" role="radiogroup" aria-label="Як відповідати">
          <button type="button" role="radio" aria-checked="${mode === 'voice'}" data-mode="voice"${voiceOk ? '' : ' disabled'}>${icon('mic')}Голосом</button>
          <button type="button" role="radio" aria-checked="${mode === 'keyboard'}" data-mode="keyboard">${icon('keyboard')}З клавіатури</button>
        </div>
        ${voiceOk ? '' : '<p class="note">Цей браузер не вміє розпізнавати мову. Відкрий сайт у Google Chrome на комп’ютері чи Android, а поки відповідай з клавіатури.</p>'}
        ${notice ? `<p class="note">${esc(notice)}</p>` : ''}
        ${enough
          ? '<button class="btn btn-marker btn-big" data-act="start">Почати</button>'
          : `<p class="note">Поки вивчено ${learned} ${plural(learned, 'слово', 'слова', 'слів')}, а для тесту треба хоча б ${MIN_WORDS}</p>
             <div class="row-actions">
               <a class="btn btn-marker" href="#/cards">Вчити слова</a>
               <button class="btn" data-act="demo">Пробний раунд</button>
             </div>`}
        ${state.stress.best ? `<p class="record">Рекорд: ${fmtNum(state.stress.best)} ${plural(state.stress.best, 'бал', 'бали', 'балів')}</p>` : ''}
      </section>`;

    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      notice = '';
      updateSettings({ stressInput: mode });
      intro();
    }));
    app.querySelector('[data-act="start"]')?.addEventListener('click', () => start(false));
    app.querySelector('[data-act="demo"]')?.addEventListener('click', () => start(true));
  }

  async function start(demo) {
    notice = '';
    if (mode === 'voice') {
      app.querySelector('[data-act="start"], [data-act="demo"]')?.setAttribute('disabled', '');
      const ok = await requestMic();
      if (!alive) return;
      if (!ok) {
        mode = 'keyboard';
        notice = 'Немає доступу до мікрофона, тому цей раунд з клавіатури. Дозволь мікрофон у налаштуваннях браузера.';
      }
    }
    run = { demo, qs: buildQuestions(content, state, S.stressCount, demo), i: 0, score: 0, combo: 0, results: [], answered: false, hint: false, total: 0, start: 0 };
    document.body.classList.add('focus-mode');
    for (const n of ['3', '2', '1', 'Los!']) {
      if (!alive) return;
      app.innerHTML = `<div class="countdown" aria-live="assertive"><span class="cd-num" lang="de">${n}</span></div>`;
      await sleep(n === 'Los!' ? 500 : 650);
    }
    if (alive) ask();
  }

  // ---------- Питання ----------

  function promptParts(q) {
    const say = mode === 'voice' ? 'Скажи' : 'Напиши';
    if (q.kind === 'word') return { task: `${say} німецькою`, big: esc(q.w.ua), lang: 'uk' };
    if (q.kind === 'article') return { task: `${say} з артиклем: der, die чи das?`, big: esc(q.w.de), sub: esc(q.w.ua), lang: 'de' };
    if (q.kind === 'sentence') return { task: `${say} німецькою`, big: esc(q.s.ua), lang: 'uk' };
    return { task: 'Дай відповідь німецькою', big: `${esc(q.s.de)}${sayBtn(q.s.de)}`, sub: esc(q.s.ua), lang: 'de' };
  }

  function answerZone() {
    if (mode === 'voice') {
      return `<div class="mic" aria-hidden="true">${icon('mic')}</div><p class="heard" aria-live="polite">Говори, коли піде таймер</p>`;
    }
    return `
      <form class="kb" autocomplete="off">
        <input id="kb-input" class="text-input" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" lang="de" aria-label="Відповідь німецькою">
        <button class="btn btn-marker" type="submit">OK</button>
      </form>
      ${umlautKeys('kb-input')}`;
  }

  function bindKeyboard(q) {
    app.querySelector('.kb')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = app.querySelector('#kb-input').value.trim();
      if (value) submit(q, [value], 'keyboard');
    });
  }

  async function ask() {
    const q = run.qs[run.i];
    run.answered = false;
    run.hint = false;
    run.total = seconds(q) * 1000;
    const p = promptParts(q);
    app.innerHTML = `
      <section class="stress-run">
        <div class="run-top">
          <span class="q-count">${run.i + 1} з ${run.qs.length}</span>
          ${run.combo >= 2 ? `<span class="combo">серія ${run.combo}</span>` : ''}
          <span class="score">${fmtNum(run.score)} <small>${plural(run.score, 'бал', 'бали', 'балів')}</small></span>
        </div>
        <div class="timer" aria-hidden="true"><div class="timer-bar"></div></div>
        <div class="secs" aria-hidden="true">${seconds(q)}</div>
        <div class="prompt">
          <p class="task">${p.task}</p>
          <p class="big" lang="${p.lang}">${p.big}</p>
          ${p.sub ? `<p class="sub">${p.sub}</p>` : ''}
        </div>
        <p class="hint-line" lang="de" hidden></p>
        <div class="answer-zone">${run.i === 0 && notice ? `<p class="note">${esc(notice)}</p>` : ''}${answerZone()}</div>
        <div class="run-actions">
          <button class="btn" type="button" data-act="hint">Підказка</button>
          <button class="btn btn-ghost" type="button" data-act="skip">Пропустити</button>
        </div>
        <div class="fb-slot"></div>
      </section>`;
    app.querySelector('[data-act="hint"]').addEventListener('click', () => hint(q));
    app.querySelector('[data-act="skip"]').addEventListener('click', () => skip(q));
    bindKeyboard(q);

    // Питання спершу звучить, а таймер стартує після озвучки
    if (q.kind === 'question') {
      await speak(q.s.de);
      if (!isCurrent(q)) return;
    }
    run.start = performance.now();
    startTimer(q);
    if (mode === 'voice') voiceLoop(q);
    else app.querySelector('#kb-input')?.focus();
  }

  function startTimer(q) {
    const bar = app.querySelector('.timer-bar');
    const secs = app.querySelector('.secs');
    const box = app.querySelector('.timer');
    const tick = () => {
      if (!isCurrent(q) || run.answered) return;
      const left = timeLeft();
      bar.style.transform = `scaleX(${left / run.total})`;
      secs.textContent = Math.ceil(left / 1000);
      box.classList.toggle('low', left < 3000);
      secs.classList.toggle('low', left < 3000);
      if (left <= 0) timeout(q);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // Слухаємо, доки не почуємо відповідь або не скінчиться час
  async function voiceLoop(q) {
    const mic = () => app.querySelector('.mic');
    const heard = (text) => {
      const el = app.querySelector('.heard');
      if (el) el.textContent = text;
    };
    let attempts = 0;
    while (isCurrent(q) && !run.answered && attempts < 12) {
      attempts++;
      mic()?.classList.add('is-on');
      heard('Слухаю…');
      let alts = [];
      try {
        alts = await listen({ onInterim: (t) => heard(`«${t}»`) });
      } catch (err) {
        mic()?.classList.remove('is-on');
        if (!isCurrent(q) || run.answered) return;
        if (FATAL.has(err.message)) {
          switchToKeyboard(q, micErrorText(err.message));
          return;
        }
        await sleep(250);
        continue;
      }
      mic()?.classList.remove('is-on');
      if (!isCurrent(q) || run.answered) return;
      if (alts.length) {
        submit(q, alts, 'voice');
        return;
      }
      await sleep(120);
    }
  }

  function switchToKeyboard(q, message) {
    mode = 'keyboard';
    notice = message;
    const zone = app.querySelector('.answer-zone');
    if (!zone) return;
    zone.innerHTML = `<p class="note">${esc(message)}</p>${answerZone()}`;
    const task = app.querySelector('.prompt .task');
    if (task) task.textContent = task.textContent.replace('Скажи', 'Напиши');
    bindKeyboard(q);
    app.querySelector('#kb-input')?.focus();
  }

  function check(q, text, voice) {
    if (q.kind === 'word') return checkWord(text, [q.w.de, ...(q.w.alt || [])], { voice });
    if (q.kind === 'sentence') return checkSentence(text, q.s.answers, { voice });
    return checkPattern(text, q.s.accept);
  }

  function submit(q, alts, via) {
    if (!isCurrent(q) || run.answered) return;
    const left = timeLeft();
    run.answered = true;
    cancelAnimationFrame(raf);
    stopListening();
    const voice = via === 'voice';
    let result = { ok: false };
    if (q.kind === 'article') {
      // Для артикля беремо тільки найімовірніший варіант, інакше легко «вгадати»
      result = checkArticle(alts[0], q.w, { voice });
    } else {
      for (const a of alts) {
        const r = check(q, a, voice);
        if (r.ok) { result = r; break; }
        if (r.close) result = r;
      }
    }
    resolve(q, result.ok, { heard: alts[0], left, via });
  }

  function timeout(q) {
    if (!isCurrent(q) || run.answered) return;
    // Якщо щось уже надруковано, але Enter не натиснуто, — перевіряємо це
    const typed = app.querySelector('#kb-input')?.value.trim();
    if (typed) {
      submit(q, [typed], 'keyboard');
      return;
    }
    run.answered = true;
    stopListening();
    resolve(q, false, { timeout: true });
  }

  function skip(q) {
    if (!isCurrent(q) || run.answered) return;
    run.answered = true;
    cancelAnimationFrame(raf);
    stopListening();
    resolve(q, false, { skipped: true });
  }

  function compoundPart(w) {
    const low = w.de.toLowerCase();
    return content.words.find((o) => o !== w && o.pos === 'n' && o.art && o.de.length >= 3
      && low.length > o.de.length && low.endsWith(o.de.toLowerCase()));
  }

  function hintFor(q) {
    if (q.kind === 'word') return { text: letterHint(q.w.de), costs: true };
    if (q.kind === 'sentence') return { text: letterHint(q.s.answers[0]), costs: true };
    if (q.kind === 'question') return { text: letterHint(q.s.example), costs: true };
    const part = compoundPart(q.w);
    if (part) return { text: `Складне слово: рід такий самий, як у «${part.de}»`, costs: true };
    const rule = articleRule(q.w.de);
    if (rule) return { text: rule, costs: true };
    return { text: 'Простого правила тут немає, тому ця підказка безкоштовна. Повтори слово з артиклем на картках.', costs: false };
  }

  function hint(q) {
    if (!isCurrent(q) || run.answered || run.hint) return;
    const h = hintFor(q);
    const line = app.querySelector('.hint-line');
    line.textContent = h.text;
    line.hidden = false;
    if (h.costs) run.hint = true;
    app.querySelector('[data-act="hint"]').disabled = true;
  }

  // ---------- Після відповіді ----------

  function resolve(q, ok, info = {}) {
    let pts = 0;
    if (ok) {
      run.combo++;
      pts = 100 + Math.round((50 * (info.left || 0)) / run.total) + Math.min(run.combo - 1, 5) * 10;
      if (run.hint) pts = Math.round(pts / 2);
      run.score += pts;
    } else {
      run.combo = 0;
    }
    beep(ok);
    run.results.push({ q, ok, pts, heard: info.heard || '', time: run.total - (info.left || 0), overridden: false });
    showFeedback(q, ok, pts, info);
  }

  function showFeedback(q, ok, pts, info) {
    const answer = correctText(q);
    const section = app.querySelector('.stress-run');
    section.classList.add(ok ? 'is-right' : 'is-wrong');
    app.querySelector('.run-actions').hidden = true;
    app.querySelector('.answer-zone').hidden = true;
    app.querySelector('.score').innerHTML = `${fmtNum(run.score)} <small>${plural(run.score, 'бал', 'бали', 'балів')}</small>`;

    const title = ok ? `Правильно, +${pts}` : info.timeout ? 'Час вийшов' : info.skipped ? 'Пропущено' : 'Не так';
    const heardLabel = info.via === 'voice' ? 'Почуто' : 'Твоя відповідь';
    const canOverride = !ok && info.via === 'voice' && info.heard;
    app.querySelector('.fb-slot').innerHTML = `
      <div class="fb ${ok ? 'ok' : 'bad'}" role="status">
        <p class="fb-title">${title}</p>
        ${info.heard ? `<p class="fb-heard">${heardLabel}: «${esc(info.heard)}»</p>` : ''}
        <p class="fb-answer">${ok ? '' : '<span>Правильно:</span>'}<b lang="de">${esc(answer)}</b>${sayBtn(answer)}</p>
        ${canOverride ? '<p class="fb-note">Якщо відповідь була правильна, а розпізнало не так, натисни «Зарахувати»</p>' : ''}
        <div class="row-actions">
          <button class="btn btn-marker" type="button" data-act="next">${run.i + 1 < run.qs.length ? 'Далі' : 'Результат'}</button>
          ${canOverride ? '<button class="btn btn-ghost" type="button" data-act="override">Зарахувати</button>' : ''}
        </div>
      </div>`;
    app.querySelector('[data-act="next"]').addEventListener('click', next);
    app.querySelector('[data-act="override"]')?.addEventListener('click', override);
    if (ok) {
      autoNext = setTimeout(next, 1300);
    } else {
      app.querySelector('[data-act="next"]').focus({ preventScroll: true });
      if (S.speakAnswers) speak(answer);
    }
  }

  function override() {
    const r = run.results[run.results.length - 1];
    if (!r || r.ok) return;
    r.ok = true;
    r.overridden = true;
    r.pts = 50;
    run.score += 50;
    run.combo = 1;
    next();
  }

  function next() {
    if (!alive || !run || !run.answered) return;
    clearTimeout(autoNext);
    stopSpeaking();
    run.i++;
    if (run.i < run.qs.length) ask();
    else results();
  }

  // ---------- Результат ----------

  function results() {
    document.body.classList.remove('focus-mode');
    const n = run.results.length;
    const right = run.results.filter((r) => r.ok).length;
    const accuracy = n ? Math.round((right / n) * 100) : 0;
    const times = run.results.filter((r) => r.ok && !r.overridden).map((r) => r.time);
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : 0;
    const prevBest = state.stress.best;
    const isRecord = !run.demo && run.score > prevBest;
    const mistakes = run.results.filter((r) => !r.ok);

    if (!run.demo) {
      state.stress.best = Math.max(prevBest, run.score);
      state.stress.bestAccuracy = Math.max(state.stress.bestAccuracy, accuracy);
      state.stress.history = [...state.stress.history, { day: today(), score: run.score, right, total: n }].slice(-30);
      // Слова з помилками — у сьогоднішнє повторення
      for (const m of mistakes) {
        if (m.q.w && state.cards[m.q.w.id]) state.cards[m.q.w.id].due = today();
      }
      dayStats().stress++;
      markActive();
      save();
    }

    const recordLine = run.demo
      ? '<p class="note">Пробний раунд не записується в рекорди</p>'
      : isRecord
        ? '<p class="record-new">Новий рекорд</p>'
        : `<p class="muted">Рекорд: ${fmtNum(state.stress.best)}</p>`;

    app.innerHTML = `
      <section class="stress-result">
        <p class="result-score"><span class="num">${fmtNum(run.score)}</span> ${plural(run.score, 'бал', 'бали', 'балів')}</p>
        ${recordLine}
        <p>Правильно ${right} з ${n}${times.length ? `, у середньому за ${avg.toFixed(1).replace('.', ',')} с` : ''}</p>
        ${mistakes.length
          ? `<h2>Помилки</h2>
             <ul class="mistakes">${mistakes.map(mistakeRow).join('')}</ul>
             ${run.demo ? '' : '<p class="muted">Слова з помилками додано в сьогоднішнє повторення</p>'}`
          : '<p>Жодної помилки</p>'}
        <div class="row-actions">
          <button class="btn btn-marker" data-act="again">Ще раз</button>
          <a class="btn" href="#/cards">До карток</a>
        </div>
      </section>`;
    const demo = run.demo;
    app.querySelector('[data-act="again"]').addEventListener('click', () => start(demo));
  }

  function mistakeRow(r) {
    const q = r.q;
    const prompt = q.kind === 'article' ? q.w.de : q.kind === 'question' ? q.s.de : q.w ? q.w.ua : q.s.ua;
    const answer = correctText(q);
    return `
      <li>
        <div>
          <span class="m-prompt">${esc(prompt)}</span>
          <b lang="de">${esc(answer)}</b>
          ${r.heard ? `<span class="m-heard">${esc(r.heard)}</span>` : ''}
        </div>
        ${sayBtn(answer)}
      </li>`;
  }

  // Enter або пробіл після відповіді — наступне питання
  const onKey = (e) => {
    if (!run || !run.answered || !app.querySelector('.fb-slot .fb')) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('button, a')) return; // кнопка сама обробить натискання
    e.preventDefault();
    next();
  };
  document.addEventListener('keydown', onKey);

  intro();
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(autoNext);
    stopListening();
    stopSpeaking();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('focus-mode');
  };
}
