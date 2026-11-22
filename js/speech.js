// Голос: озвучка (speechSynthesis), розпізнавання мови (SpeechRecognition) і звуки.
import { getState } from './storage.js';

// ---------- Озвучка ----------

// У застосунку для Android (android/) озвучує сам телефон через window.DTApp:
// у вбудованому браузері Android speechSynthesis часто немає або він німий.
const native = typeof window.DTApp?.speak === 'function' ? window.DTApp : null;
const webSpeech = 'speechSynthesis' in window;
export const canSpeak = () => !!native || webSpeech;

// Застосунок повідомляє сюди, що фразу з номером id договорено
const nativePending = new Map();
let nativeSeq = 0;
window.__dtSpoken = (id) => {
  nativePending.get(id)?.();
  nativePending.delete(id);
};

let voices = [];
function refreshVoices() {
  try {
    voices = speechSynthesis.getVoices().filter((v) => /^de([-_]|$)/i.test(v.lang));
  } catch {
    voices = [];
  }
}
if (webSpeech) refreshVoices();

export function germanVoices() {
  if (webSpeech) refreshVoices();
  return voices;
}

// Голоси в Chrome завантажуються не одразу — тут можна підписатися на їх появу
export function onVoices(fn) {
  if (!webSpeech) return () => {};
  const handler = () => { refreshVoices(); fn(voices); };
  speechSynthesis.addEventListener('voiceschanged', handler);
  return () => speechSynthesis.removeEventListener('voiceschanged', handler);
}

function pickVoice() {
  const wanted = getState().settings.voiceURI;
  return (
    voices.find((v) => v.voiceURI === wanted) ||
    voices.find((v) => /google/i.test(v.name)) ||
    voices.find((v) => v.lang === 'de-DE') ||
    voices[0] ||
    null
  );
}

// Вимовити текст німецькою. Проміс завершується, коли озвучка закінчилась.
export function speak(text, { rate, pitch } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak() || !text) return resolve();
    if (native) {
      const id = String(++nativeSeq);
      const timer = setTimeout(() => window.__dtSpoken(id), 2000 + text.length * 150);
      nativePending.set(id, () => { clearTimeout(timer); resolve(); });
      native.speak(text, rate ?? getState().settings.ttsRate, pitch || 1, id);
      return;
    }
    refreshVoices();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = rate ?? getState().settings.ttsRate;
    if (pitch) u.pitch = pitch; // різна висота голосу — щоб у діалозі було чути різних людей
    // Запобіжник: інколи браузер не повідомляє про кінець озвучки
    const timer = setTimeout(resolve, 2000 + text.length * 150);
    const done = () => { clearTimeout(timer); resolve(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (native) native.stopSpeaking();
  else if (webSpeech) speechSynthesis.cancel();
}

// ---------- Розпізнавання мови ----------

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = () => !!Recognition;

let active = null;

// Слухає одну фразу. Повертає масив варіантів того, що почуто (найімовірніший — перший),
// або порожній масив, якщо нічого не сказали. Помилка — Error з кодом браузера
// ('not-allowed', 'network' тощо).
export function listen({ onInterim } = {}) {
  return new Promise((resolve, reject) => {
    if (!Recognition) {
      reject(new Error('unsupported'));
      return;
    }
    const rec = new Recognition();
    rec.lang = 'de-DE';
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let alts = null;
    let error = null;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) alts = Array.from(result, (a) => a.transcript.trim()).filter(Boolean);
        else onInterim?.(result[0].transcript);
      }
    };
    rec.onerror = (e) => { error = e.error; };
    rec.onend = () => {
      if (active === rec) active = null;
      if (alts && alts.length) resolve(alts);
      else if (error && error !== 'no-speech' && error !== 'aborted') reject(new Error(error));
      else resolve([]);
    };
    active = rec;
    try {
      rec.start();
    } catch (err) {
      active = null;
      reject(err);
    }
  });
}

export function stopListening() {
  try {
    active?.abort();
  } catch {
    // уже зупинено
  }
  active = null;
}

// Попросити доступ до мікрофона заздалегідь, щоб діалог браузера не з’їв час на питання
export async function requestMic() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

// ---------- Короткі звуки для стрес-тесту ----------

let audio = null;
export function beep(ok) {
  if (!getState().settings.sounds) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = ok ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(ok ? 660 : 180, t);
    if (ok) osc.frequency.exponentialRampToValueAtTime(990, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(ok ? 0.18 : 0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.22 : 0.3));
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  } catch {
    // без звуку — не страшно
  }
}
