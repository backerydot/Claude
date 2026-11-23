// Хімічні помічники: показ формул з індексами, розбір формул на атоми, перевірка відповідей.

// Безпечно вставити текст у HTML
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Одна формула або рівняння: H2SO4 → H₂SO₄ (індекси внизу), 2H2O — коефіцієнт 2 лишається звичайним,
// SO4^2- або Na^+ — заряд угорі.
export function formula(src) {
  return String(src)
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const [body, charge] = tok.split('^');
      const m = body.match(/^(\d*)(.*)$/); // коефіцієнт на початку
      let out = m[1] ? `<span class="coef">${m[1]}</span>` : '';
      out += esc(m[2]).replace(/([A-Za-z)\]·])(\d+)/g, '$1<sub>$2</sub>');
      if (charge !== undefined) out += `<sup>${esc(charge)}</sup>`;
      return out;
    })
    .join('');
}

// Текст уроку: **жирний**, нові рядки, {H2O} — формула
export function fmt(s) {
  return esc(s)
    .replace(/\{([^}]+)\}/g, (_, f) => `<span class="f">${formula(f.replace(/&gt;/g, '>').replace(/&amp;/g, '&'))}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\b([A-Za-zА-Яа-я])_([A-Za-z]+)\b/g, '$1<sub>$2</sub>') // A_r → Aᵣ, V_m, N_A
    .replace(/\n/g, '<br>');
}

// Українські літери, схожі на латинські: хто пише «Н2О» на українській розкладці — теж правий
const LOOKALIKE = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'І': 'I', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P',
  'Т': 'T', 'Х': 'X', 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'і': 'i', 'к': 'k', 'л': 'l', 'н': 'n' };
const SUBS = '₀₁₂₃₄₅₆₇₈₉';

// Формулу з поля введення приводимо до вигляду «H2SO4»
export function cleanFormula(s) {
  return String(s)
    .replace(/[\s·*.]/g, '')
    .replace(/[₀-₉]/g, (d) => String(SUBS.indexOf(d)))
    .replace(/[А-Яа-яІі]/g, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(/[−–—]/g, '-');
}

// Розбір формули на атоми: «Ca(OH)2» → { Ca: 1, O: 2, H: 2 }. null, якщо формула незрозуміла.
export function atoms(f) {
  const s = cleanFormula(f).split('^')[0];
  let i = 0;
  function num() {
    let n = '';
    while (i < s.length && /\d/.test(s[i])) n += s[i++];
    return n ? Number(n) : 1;
  }
  function group() {
    const out = {};
    while (i < s.length && s[i] !== ')') {
      if (s[i] === '(') {
        i++;
        const inner = group();
        if (s[i] !== ')') throw new Error('bracket');
        i++;
        const k = num();
        for (const [el, n] of Object.entries(inner)) out[el] = (out[el] || 0) + n * k;
      } else if (/[A-Z]/.test(s[i])) {
        let el = s[i++];
        if (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
        const k = num();
        out[el] = (out[el] || 0) + k;
      } else {
        throw new Error('char');
      }
    }
    return out;
  }
  try {
    const res = group();
    if (i !== s.length || !Object.keys(res).length) return null;
    return res;
  } catch {
    return null;
  }
}

// «H2 + O2 = H2O» → { left: ['H2','O2'], right: ['H2O'] }
export function splitEquation(eq) {
  const [l, r] = eq.split('=');
  const part = (x) => x.split('+').map((t) => t.trim()).filter(Boolean);
  return { left: part(l), right: part(r) };
}

// Порахувати атоми з обох боків рівняння за коефіцієнтами
export function countSides(eq, coefs) {
  const { left, right } = splitEquation(eq);
  const side = (list, offset) => {
    const total = {};
    list.forEach((f, k) => {
      const c = coefs[offset + k];
      for (const [el, n] of Object.entries(atoms(f) || {})) total[el] = (total[el] || 0) + n * c;
    });
    return total;
  };
  const L = side(left, 0);
  const R = side(right, left.length);
  const els = [...new Set([...Object.keys(L), ...Object.keys(R)])];
  return els.map((el) => ({ el, l: L[el] || 0, r: R[el] || 0 }));
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const gcdAll = (arr) => arr.reduce((g, x) => gcd(g, x), 0);

// Число з поля: «1,5», «0.25 моль», «22,4 л» → 1.5, 0.25, 22.4
export function parseNum(s) {
  const m = String(s).replace(/\s/g, '').replace(',', '.').match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// Текстова відповідь: без регістру, зайвих пробілів і різниці в апострофах
export const cleanText = (s) =>
  String(s).toLowerCase().replace(/[’'ʼ`]/g, "'").replace(/[.,!?;:«»"]/g, '').replace(/\s+/g, ' ').trim();

// Українські форми множини: 1 урок, 2 уроки, 5 уроків
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

// Перемішати масив (повертає новий)
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
