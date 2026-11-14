import { Face } from './face.js';
import { Mic, Player } from './audio.js';
import { LiveSession, pickModel } from './live.js';
import { STYLES, TOOLS, buildSystemPrompt, lessonsOf } from './prompt.js';

const $ = (id) => document.getElementById(id);
const face = new Face($('face'));

let config, progress;
let session = null, mic = null, player = null;
let micOn = true;
let lastVoiceAt = 0;
let greeted = false;

window.addEventListener('error', (e) => window.klyaks.log(`ошибка JS: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.klyaks.log(`ошибка JS (promise): ${e.reason?.message || e.reason}`));
let current = { tutor: null, me: null };

function setStatus(text) { $('status').textContent = text; }

function showLesson() {
  if (!progress.level) {
    $('lesson').textContent = 'сначала тест уровня';
    return;
  }
  const lessons = lessonsOf(progress);
  const i = Math.min(progress.lessonIndex, lessons.length - 1);
  $('lesson').textContent = `${progress.level} · урок ${i + 1}/${lessons.length}: ${lessons[i]}`;
}

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
  return el;
}

function appendTo(role, text) {
  if (!current[role]) current[role] = addMsg(role, '');
  current[role].textContent += text;
  $('log').scrollTop = $('log').scrollHeight;
}

function save() { window.klyaks.saveProgress(progress); }

function addUnique(list, items) {
  for (const item of items) {
    const key = String(item).trim().toLowerCase();
    if (key && !list.some(x => x.trim().toLowerCase() === key)) list.push(String(item).trim());
  }
}

// Конец разговора сохраняем сами, чтобы на следующем занятии Клякс продолжил с того же места.
let turnText = { me: '', tutor: '' };

function saveTurn() {
  const clip = (s) => s.trim().slice(0, 300);
  const log = progress.lastSession || (progress.lastSession = []);
  if (turnText.me.trim()) log.push({ role: 'me', text: clip(turnText.me) });
  if (turnText.tutor.trim()) log.push({ role: 'tutor', text: clip(turnText.tutor) });
  progress.lastSession = log.slice(-24);
  turnText = { me: '', tutor: '' };
  save();
}

function handleTool(name, args) {
  if (name === 'set_mood') {
    face.set({ mood: args.mood });
    return 'ok';
  }
  if (name === 'remember') {
    for (const w of args.new_words || []) {
      if (!w?.en) continue;
      const exists = progress.words.some(x => x.en.toLowerCase() === w.en.toLowerCase());
      if (!exists) progress.words.push({ en: w.en, ru: w.ru || '' });
    }
    addUnique(progress.mistakes, args.mistakes || []);
    addUnique(progress.notes, args.note ? [args.note] : []);
    progress.mistakes = progress.mistakes.slice(-100);
    progress.notes = progress.notes.slice(-50);
    save();
    return 'сохранено';
  }
  if (name === 'set_program') {
    const lessons = (args.lessons || []).filter(Boolean).map(l => l.replace(/^урок\s*\d+\s*[:.)-]\s*/i, ''));
    if (!args.level || !lessons.length) return 'нужны level и lessons';
    progress.level = args.level;
    progress.levelSummary = args.summary || '';
    progress.program = lessons;
    progress.lessonIndex = 0;
    save();
    showLesson();
    addMsg('system', `Уровень: ${args.level}. Программа из ${lessons.length} уроков сохранена.`);
    return `сохранено, начинай урок 1: ${lessons[0]}`;
  }
  if (name === 'lesson_done') {
    const lessons = lessonsOf(progress);
    progress.lessonIndex = Math.min(progress.lessonIndex + 1, lessons.length - 1);
    save();
    showLesson();
    return `следующий урок: ${lessons[progress.lessonIndex]}`;
  }
  return 'неизвестная функция';
}

function onMicChunk(b64, rms) {
  if (!session || !micOn) return;
  // Без наушников Клякс услышит сам себя из колонок — пока он говорит, микрофон молчит.
  if (!$('headphones').checked && player.busy()) return;
  if (rms > 0.02) lastVoiceAt = performance.now();
  session.sendAudio(b64);
}

function loop() {
  if (player?.playing) {
    face.set({ activity: 'speaking' });
    face.speak(player.level());
  } else if (session && micOn && performance.now() - lastVoiceAt < 700) {
    face.set({ activity: 'listening' });
  } else {
    face.set({ activity: 'idle' });
  }
  requestAnimationFrame(loop);
}

function setRunning(running) {
  $('startBtn').textContent = running ? 'Закончить' : 'Начать занятие';
  $('startBtn').classList.toggle('stop', running);
  for (const id of ['micBtn', 'textInput', 'sendBtn']) $(id).disabled = !running;
}

async function start() {
  if (!hasKey()) return openSettings();
  $('startBtn').disabled = true;
  try {
    setStatus('Ищу модель Gemini…');
    const model = config.model ? `models/${config.model.replace(/^models\//, '')}` : await pickModel(config.apiKey);

    player = new Player();
    greeted = false;
    window.klyaks.log(`--- занятие, модель ${model}`);
    progress.sessions += 1;
    save();

    session = new LiveSession({
      apiKey: config.apiKey,
      model,
      voice: config.voice || 'Puck',
      systemPrompt: buildSystemPrompt(progress, config.style),
      tools: TOOLS,
      handlers: {
        onStatus: (state, info) => {
          window.klyaks.log(`статус: ${state} ${info ?? ''}`);
          if (state === 'ready') {
            setStatus(micOn ? 'Говори или пиши' : 'Микрофон выключен — пиши');
            // Новая сессия без продолжения: первый раз здороваемся, потом просто продолжаем.
            if (!info) session.sendText(greeted ? '[связь восстановлена — продолжай с того места, где остановились, без приветствия]' : '[начало занятия]');
            greeted = true;
          } else if (state === 'reconnecting') {
            setStatus('Связь моргнула, переподключаюсь…');
          } else if (state === 'location') {
            if (!$('status').textContent.startsWith('VPN')) addMsg('system', 'Google пишет, что твой регион не поддерживается — похоже, отвалился VPN. Включи его, я сам переподключусь.');
            setStatus('VPN отвалился — жду, когда вернётся…');
          } else if (state === 'failed') {
            setStatus('Не удалось подключиться');
            addMsg('system', `Ошибка Gemini: ${info}. Подробности в log.txt`);
            stop();
          }
        },
        onLog: (line) => window.klyaks.log(line),
        onAudio: (b64) => player.play(b64),
        onInterrupted: () => player.stop(),
        onTutorText: (t) => { current.me = null; appendTo('tutor', t); turnText.tutor += t; },
        onUserText: (t) => { appendTo('me', t); turnText.me += t; },
        onTurnComplete: () => { current = { tutor: null, me: null }; saveTurn(); },
        onTool: handleTool
      }
    });
    session.connect();

    mic = new Mic(onMicChunk);
    try {
      await mic.start();
    } catch {
      micOn = false;
      $('micBtn').classList.add('off');
      addMsg('system', 'Нет доступа к микрофону — можно общаться текстом.');
    }

    setRunning(true);
    addMsg('system', `Занятие №${progress.sessions} · ${model.replace('models/', '')}`);
  } catch (e) {
    setStatus(e.message);
    addMsg('system', e.message);
  } finally {
    $('startBtn').disabled = false;
  }
}

function stop() {
  session?.close();
  mic?.stop();
  player?.stop();
  session = mic = null;
  face.set({ mood: 'calm', activity: 'idle' });
  setRunning(false);
  setStatus('Занятие закончено');
}

function sendTyped() {
  const text = $('textInput').value.trim();
  if (!text || !session) return;
  current = { tutor: null, me: null };
  addMsg('me', text);
  turnText.me += (turnText.me ? ' ' : '') + text;
  player.stop();
  session.sendText(text);
  $('textInput').value = '';
}

$('startBtn').onclick = () => (session ? stop() : start());
$('sendBtn').onclick = sendTyped;
$('textInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTyped(); });
$('micBtn').onclick = () => {
  micOn = !micOn;
  $('micBtn').classList.toggle('off', !micOn);
  setStatus(micOn ? 'Говори или пиши' : 'Микрофон выключен — пиши');
};

// ---- Настройки: ключ, стиль общения, голос ----

const hasKey = () => !!config.apiKey && !config.apiKey.startsWith('ВСТАВЬ');

function openSettings() {
  $('keyInput').value = hasKey() ? config.apiKey : '';
  $('voiceSelect').value = config.voice || 'Puck';
  const current = config.style || 'sassy';
  $('styles').innerHTML = Object.entries(STYLES).map(([id, s]) => `
    <label class="style-card">
      <input type="radio" name="style" value="${id}" ${id === current ? 'checked' : ''}>
      <b>${s.title}</b><small>${s.hint}</small>
    </label>`).join('');
  $('settingsError').hidden = true;
  $('settingsCancel').hidden = !hasKey() || !config.style;
  $('settings').hidden = false;
  if (!hasKey()) $('keyInput').focus();
}

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const apiKey = $('keyInput').value.trim();
  const style = document.querySelector('input[name="style"]:checked')?.value || 'sassy';
  const error = (text) => { $('settingsError').textContent = text; $('settingsError').hidden = false; };
  if (!apiKey) return error('Вставь ключ Gemini — без него Клякс не заговорит.');
  $('settingsSave').disabled = true;
  $('settingsSave').textContent = 'Проверяю ключ…';
  try {
    if (apiKey !== config.apiKey) await pickModel(apiKey);
    config = await window.klyaks.saveConfig({ apiKey, style, voice: $('voiceSelect').value });
    $('settings').hidden = true;
    $('startBtn').disabled = false;
    if (session) addMsg('system', 'Настройки сохранены — подействуют со следующего занятия.');
  } catch (err) {
    error(err.message);
  } finally {
    $('settingsSave').disabled = false;
    $('settingsSave').textContent = 'Сохранить';
  }
});
$('settingsCancel').onclick = () => { $('settings').hidden = true; };
$('settingsBtn').onclick = openSettings;
$('keyLink').onclick = (e) => { e.preventDefault(); window.klyaks.openKeyPage(); };

(async () => {
  config = await window.klyaks.getConfig();
  progress = await window.klyaks.getProgress();
  for (const key of ['mistakes', 'notes']) {
    const clean = [];
    addUnique(clean, progress[key]);
    progress[key] = clean;
  }
  showLesson();
  if (!hasKey() || !config.style) openSettings();
  requestAnimationFrame(loop);
})();
