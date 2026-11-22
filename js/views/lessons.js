// Список уроків і сторінка уроку: граматика й слова
import { getState } from '../storage.js';
import { label, pluralLabel, lessonStats } from '../content.js';
import { isLearned } from '../srs.js';
import { speak, stopSpeaking } from '../speech.js';
import { esc, fmt, wordHTML, sayBtn, icon, sleep } from '../ui.js';

export function renderList(app, content) {
  const state = getState();
  app.innerHTML = content.levels
    .filter((level) => level.lessons.length)
    .map((level) => `
      <header class="page-head">
        <h1>Уроки ${esc(level.id)}</h1>
        <p class="muted">Теми й граматика йдуть приблизно в тому ж порядку, що й у підручнику Menschen ${esc(level.id)}</p>
      </header>
      <ol class="lesson-list">${level.lessons.map((l) => lessonRow(l, state)).join('')}</ol>`)
    .join('');
}

function lessonRow(l, state) {
  const head = `<span class="num">${l.num}</span><span class="body"><span class="t">${esc(l.title)}</span><span class="de" lang="de">${esc(l.titleDe)}</span>`;
  if (l.planned) {
    return `<li class="is-planned"><a class="lesson-row" href="#/lesson/${l.id}">${head}</span><span class="meta">скоро</span></a></li>`;
  }
  const s = lessonStats(l, state);
  return `<li><a class="lesson-row" href="#/lesson/${l.id}">${head}<span class="bar"><i style="--p:${s.progress.toFixed(3)}"></i></span></span><span class="meta">${s.learned}/${s.total}</span></a></li>`;
}

export function renderLesson(app, content, id) {
  const lesson = content.lessonById.get(id);
  if (!lesson) {
    app.innerHTML = '<section class="done"><h1>Такого уроку немає</h1><a class="btn" href="#/lessons">До списку уроків</a></section>';
    return;
  }
  const state = getState();
  const head = `
    <a class="back" href="#/lessons">${icon('back')}Уроки</a>
    <header class="lesson-head">
      <span class="lesson-num">${lesson.num}</span>
      <div><h1>${esc(lesson.title)}</h1><p class="de-title" lang="de">${esc(lesson.titleDe)}</p></div>
    </header>
    <p class="topic">${esc(lesson.topic)}</p>`;

  if (lesson.planned) {
    app.innerHTML = `${head}
      <section class="block">
        <h2>Що буде в уроці</h2>
        <ul class="plan">${(lesson.grammarPlan || []).map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
        <p class="muted">Урок ще не наповнений. Попроси Claude Code: «Наповни урок ${lesson.num} за правилами з CLAUDE.md».</p>
      </section>`;
    return;
  }

  const s = lessonStats(lesson, state);
  // Урок-фокус має список слів з минулих уроків, які в ньому повторюємо
  const review = (lesson.review || []).map((rid) => content.wordById.get(rid)).filter(Boolean);
  const actions = `
    <div class="row-actions">
      <a class="btn btn-marker" href="#/cards/${lesson.id}">Вчити слова</a>
      <a class="btn" href="#/exercises/${lesson.id}">Вправи${s.ex ? ` (${s.ex}%)` : ''}</a>
    </div>`;
  app.innerHTML = `${head}
    ${actions}
    <p class="muted">Вивчено ${s.learned} з ${s.total} слів</p>
    ${lesson.scene ? sceneHTML(lesson.scene) : ''}

    <section class="block">
      <h2>Граматика</h2>
      ${lesson.grammar.map(gramHTML).join('')}
    </section>

    ${lesson.fact ? `<aside class="fact"><h2>Цікаво знати</h2><p>${fmt(lesson.fact)}</p></aside>` : ''}

    <section class="block">
      <h2>Слова</h2>
      <p class="legend"><span><b class="g-der">der</b> чоловічий</span><span><b class="g-das">das</b> середній</span><span><b class="g-die">die</b> жіночий</span></p>
      <ul class="word-list">${lesson.words.map((w) => wordRow(w, state)).join('')}</ul>
      ${review.length ? `
        <h3>Повторюємо з минулих уроків</h3>
        <ul class="word-list">${review.map((w) => wordRow(w, state)).join('')}</ul>` : ''}
    </section>

    <section class="block">
      <h2>Що далі</h2>
      <p class="muted">Спершу слова на картках, потім вправи. Після 50% відкривається наступна станція в грі.</p>
      ${actions}
    </section>`;
  return lesson.scene ? bindScene(app, lesson.scene) : null;
}

// ---------- Сцена: короткий діалог на початку уроку ----------

const PITCH = [1, 0.8, 1.25]; // висота голосу для 1-го, 2-го, 3-го персонажа

const speakers = (scene) => [...new Set(scene.lines.map((l) => l.who))];

function sceneHTML(scene) {
  const who = speakers(scene);
  return `
    <section class="block scene">
      <h2>Сцена: ${esc(scene.title)}</h2>
      <div class="scene-tools">
        <button class="btn" type="button" data-act="play">${icon('speaker')}<span>Прослухати діалог</span></button>
        <label class="check"><input type="checkbox" data-act="ua">Показати переклад</label>
      </div>
      <ol class="dialog">${scene.lines.map((l, i) => `
        <li class="speaker-${who.indexOf(l.who)}" data-i="${i}">
          <span class="who" lang="de">${esc(l.who)}</span>
          <button class="line" type="button"><span lang="de">${esc(l.de)}</span><span class="ua">${esc(l.ua)}</span></button>
        </li>`).join('')}
      </ol>
      <p class="muted">Натисни на репліку, щоб почути її й побачити переклад</p>
    </section>`;
}

function bindScene(app, scene) {
  const box = app.querySelector('.scene');
  const list = box.querySelector('.dialog');
  const playBtn = box.querySelector('[data-act="play"]');
  const who = speakers(scene);
  const pitch = (line) => PITCH[who.indexOf(line.who) % PITCH.length];
  let run = 0; // номер програвання: якщо змінився, старе програвання зупиняється
  let playing = false;

  const mark = (i) => list.querySelectorAll('li').forEach((li) => li.classList.toggle('is-on', Number(li.dataset.i) === i));
  const setPlaying = (on) => {
    playing = on;
    playBtn.querySelector('span').textContent = on ? 'Зупинити' : 'Прослухати діалог';
    if (!on) mark(-1);
  };
  const stop = () => {
    run++;
    stopSpeaking();
    setPlaying(false);
  };

  async function playAll() {
    const my = ++run;
    setPlaying(true);
    for (let i = 0; i < scene.lines.length; i++) {
      mark(i);
      list.children[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await speak(scene.lines[i].de, { pitch: pitch(scene.lines[i]) });
      if (my !== run) return;
      await sleep(300);
      if (my !== run) return;
    }
    setPlaying(false);
  }

  playBtn.addEventListener('click', () => (playing ? stop() : playAll()));
  box.querySelector('[data-act="ua"]').addEventListener('change', (e) => list.classList.toggle('show-ua', e.target.checked));
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    stop();
    li.classList.add('open');
    const line = scene.lines[Number(li.dataset.i)];
    speak(line.de, { pitch: pitch(line) });
  });
  return () => { run++; };
}

function gramHTML(g) {
  let table = '';
  if (g.table) {
    const hasHead = g.table[0][0] === '';
    const rows = g.table
      .map((row, i) => `<tr>${row.map((cell) => (hasHead && i === 0 ? `<th>${fmt(cell)}</th>` : `<td>${fmt(cell)}</td>`)).join('')}</tr>`)
      .join('');
    table = `<div class="table-wrap"><table lang="de">${rows}</table></div>`;
  }
  return `<article class="gram"><h3>${esc(g.title)}</h3>${g.text ? `<p>${fmt(g.text)}</p>` : ''}${table}</article>`;
}

function wordRow(w, state) {
  const pl = pluralLabel(w);
  const extra = [w.forms, w.note].filter(Boolean).map(esc).join('<br>');
  const learned = isLearned(state.cards[w.id]);
  return `
    <li${learned ? ' class="is-learned"' : ''}>
      <div class="wl-de">${wordHTML(w)}${pl ? `<span class="wl-pl">${esc(pl)}</span>` : ''}${learned ? `<span class="wl-ok" title="Вивчено" aria-label="Вивчено">${icon('check')}</span>` : ''}</div>
      <div class="wl-ua">${esc(w.ua)}</div>
      ${extra ? `<div class="wl-extra" lang="de">${extra}</div>` : ''}
      ${sayBtn(label(w))}
    </li>`;
}
