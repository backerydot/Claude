// Налаштування і резервна копія прогресу
import { getState, updateSettings, exportJSON, importJSON, resetAll, today } from '../storage.js';
import { germanVoices, onVoices, speak, canRecognize, listen, requestMic } from '../speech.js';
import { esc, toast } from '../ui.js';

function select(key, title, options, value) {
  const numeric = typeof value === 'number';
  return `
    <label class="field">
      <span>${title}</span>
      <select data-set="${key}"${numeric ? ' data-num' : ''}>
        ${options.map(([v, text]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${text}</option>`).join('')}
      </select>
    </label>`;
}

// 0.9 → «0,9» (в українській десятковий знак — кома)
const decimal = (n) => String(n).replace('.', ',');

function check(key, title, value) {
  return `<label class="check"><input type="checkbox" data-set="${key}"${value ? ' checked' : ''}><span>${title}</span></label>`;
}

export function render(app) {
  const S = getState().settings;
  app.innerHTML = `
    <div class="settings">
      <header class="page-head"><h1>Параметри</h1></header>

      <section class="set-group">
        <h2>Картки</h2>
        ${select('newPerDay', 'Нових слів на день', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30']], S.newPerDay)}
        ${select('direction', 'Що показувати спочатку', [['de-ua', 'Німецьке слово'], ['ua-de', 'Український переклад'], ['mix', 'Навмання']], S.direction)}
        ${check('autoplay', 'Озвучувати німецькі слова автоматично', S.autoplay)}
      </section>

      <section class="set-group">
        <h2>Озвучка</h2>
        <label class="field"><span>Німецький голос</span><select id="voice" data-set="voiceURI"></select></label>
        <label class="field">
          <span>Швидкість: <output id="rate-out">${decimal(S.ttsRate)}</output></span>
          <input type="range" min="0.6" max="1.2" step="0.05" value="${S.ttsRate}" data-set="ttsRate" data-num>
        </label>
        <div class="row-actions"><button class="btn" type="button" data-act="test-voice">Прослухати</button></div>
      </section>

      <section class="set-group">
        <h2>Стрес-тест</h2>
        ${select('stressSeconds', 'Секунд на слово (на речення на 5 більше)', [[8, '8'], [10, '10'], [12, '12'], [15, '15']], S.stressSeconds)}
        ${select('stressCount', 'Кількість питань', [[10, '10'], [15, '15'], [20, '20']], S.stressCount)}
        ${select('stressInput', 'Як відповідати', [['voice', 'Голосом'], ['keyboard', 'З клавіатури']], S.stressInput)}
        ${check('speakAnswers', 'Озвучувати правильну відповідь після помилки', S.speakAnswers)}
        ${check('sounds', 'Звуки', S.sounds)}
        <div class="row-actions"><button class="btn" type="button" data-act="test-mic">Перевірити мікрофон</button></div>
        <p class="mic-result muted" aria-live="polite"></p>
      </section>

      <section class="set-group">
        <h2>Прогрес</h2>
        <p class="muted">Прогрес зберігається тільки в цьому браузері. Зроби копію, щоб не втратити його або перенести на інший пристрій.</p>
        <div class="row-actions">
          <button class="btn" type="button" data-act="export">Зберегти копію</button>
          <label class="btn">Відновити з копії<input type="file" accept=".json,application/json" data-act="import" hidden></label>
        </div>
        <div class="row-actions"><button class="btn btn-danger" type="button" data-act="reset">Скинути прогрес</button></div>
      </section>

      <p class="muted about">Deutsch-Trainer 0.1. Синхронізація між пристроями з’явиться згодом.</p>
    </div>`;

  const root = app.querySelector('.settings');

  function fillVoices() {
    const sel = root.querySelector('#voice');
    const voices = germanVoices();
    sel.innerHTML = voices.length
      ? `<option value="">Автоматично</option>${voices.map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')}`
      : '<option value="">Німецьких голосів не знайдено</option>';
    sel.value = voices.some((v) => v.voiceURI === getState().settings.voiceURI) ? getState().settings.voiceURI : '';
  }
  fillVoices();
  const offVoices = onVoices(fillVoices);

  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (el.hasAttribute('data-num')) value = Number(value);
    updateSettings({ [el.dataset.set]: value });
    toast('Збережено');
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.set === 'ttsRate') root.querySelector('#rate-out').textContent = decimal(e.target.value);
  });

  root.querySelector('[data-act="test-voice"]').addEventListener('click', () => {
    speak('Hallo! Ich bin dein Deutsch-Trainer. Wie geht es dir?');
  });

  root.querySelector('[data-act="test-mic"]').addEventListener('click', async () => {
    const out = root.querySelector('.mic-result');
    if (!canRecognize()) {
      out.textContent = 'Цей браузер не розпізнає мову. Спробуй Google Chrome.';
      return;
    }
    if (!(await requestMic())) {
      out.textContent = 'Немає доступу до мікрофона. Дозволь його в налаштуваннях сайту.';
      return;
    }
    out.textContent = 'Скажи щось німецькою, наприклад «Guten Tag»';
    try {
      const alts = await listen();
      out.textContent = alts.length ? `Почуто: «${alts[0]}». Мікрофон працює.` : 'Нічого не почуто. Спробуй ще раз.';
    } catch (err) {
      out.textContent = `Розпізнавання не спрацювало (${err.message})`;
    }
  });

  root.querySelector('[data-act="export"]').addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deutsch-trainer-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Копію збережено');
  });

  root.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importJSON(await file.text());
      toast('Прогрес відновлено');
      location.hash = '#/';
    } catch (err) {
      toast(err.message);
    }
  });

  const resetBtn = root.querySelector('[data-act="reset"]');
  let armed = 0;
  resetBtn.addEventListener('click', () => {
    if (armed) {
      clearTimeout(armed);
      resetAll();
      toast('Прогрес скинуто');
      location.hash = '#/';
      return;
    }
    resetBtn.textContent = 'Точно скинути? Натисни ще раз';
    armed = setTimeout(() => {
      armed = 0;
      resetBtn.textContent = 'Скинути прогрес';
    }, 4000);
  });

  return () => {
    offVoices();
    clearTimeout(armed);
  };
}
