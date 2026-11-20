import { speak } from './speech.js';
// Дрібні помічники для сторінок: екранування тексту, іконки, кнопки озвучки.

// Безпечно вставити текст у HTML
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Простий формат для текстів граматики: **жирний**, нові рядки
export const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

// Слово з артиклем, пофарбоване за родом
export function wordHTML(w) {
  const cls = w.plOnly ? 'g-pl' : w.art ? `g-${w.art}` : 'g-none';
  const art = w.art ? `<span class="art">${esc(w.art)}</span> ` : '';
  return `<span class="word ${cls}" lang="de">${art}<span class="lemma">${esc(w.de)}</span></span>`;
}

const svg = (body) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  home: svg('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>'),
  lessons: svg('<path d="M12 6.5C10 5 7 4.5 4 4.5v14c3 0 6 .5 8 2 2-1.5 5-2 8-2v-14c-3 0-6 .5-8 2z"/><path d="M12 6.5v14"/>'),
  cards: svg('<rect x="3" y="7.5" width="14" height="12" rx="1.5"/><path d="M7 4.5h12a1.5 1.5 0 0 1 1.5 1.5v10"/><path d="M6 11h8"/>'),
  stress: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5"/><path d="m18.5 6.5 1.5-1.5"/>'),
  settings: svg('<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>'),
  speaker: svg('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>'),
  back: svg('<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>'),
  next: svg('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  flag: svg('<path d="M5.5 21V4"/><path d="M5.5 4.5c4-2 7 2 13 0v9c-6 2-9-2-13 0"/>'),
  game: svg('<rect x="5" y="4" width="14" height="12" rx="3"/><path d="M5 10h14"/><path d="M9 13h.01M15 13h.01"/><path d="m8 20 2-4M16 20l-2-4"/>'),
  flame: svg('<path d="M12 3c.6 3 4.5 4.8 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2.2 1.1-3.6 2.3-4.6.1 1.9.9 3 2.1 3.1-.4-3.1-.8-5.6.1-8z"/>'),
};

export const icon = (name) => ICONS[name] || '';

// Кнопка озвучки. Натискання обробляє app.js (data-say).
export function sayBtn(text, label = 'Озвучити') {
  return `<button class="say" type="button" data-say="${esc(text)}" aria-label="${esc(label)}" title="${esc(label)}">${icon('speaker')}</button>`;
}

// Кнопки ä ö ü ß під полем введення (для клавіатури без німецької розкладки)
export function umlautKeys(inputId) {
  return `<div class="umlauts" data-for="${inputId}">${['ä', 'ö', 'ü', 'ß']
    .map((c) => `<button type="button" data-insert="${c}" aria-label="Вставити ${c}">${c}</button>`)
    .join('')}</div>`;
}

// Вставити символ (ä, ö, ü, ß) у поле там, де стоїть курсор
function insertAtCaret(input, text) {
  if (input.readOnly) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

// Озвучка (data-say) і кнопки ä/ö/ü/ß (data-insert) — одна обробка для всієї сторінки.
// Викликають app.js (сайт) і game/main.js (гра).
export function installGlobalHandlers() {
  document.addEventListener('click', (e) => {
    const sayEl = e.target.closest('[data-say]');
    if (sayEl) {
      e.preventDefault();
      speak(sayEl.dataset.say);
      return;
    }
    const key = e.target.closest('[data-insert]');
    if (key) {
      const box = key.closest('[data-for]');
      const input = box && document.getElementById(box.dataset.for);
      if (input) insertAtCaret(input, key.dataset.insert);
    }
  });
  // Натискання на ä/ö/ü/ß не повинно забирати фокус з поля (інакше на телефоні ховається клавіатура)
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-insert]')) e.preventDefault();
  });
}

// Українські форми множини: 1 день, 2 дні, 5 днів
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export const fmtNum = (n) => Number(n).toLocaleString('uk-UA');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Перемішати масив (повертає новий)
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer = 0;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
