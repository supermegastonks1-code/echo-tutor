import { Face } from './face.js';
import { Mic, Player } from './audio.js';
import { LiveSession, pickModel } from './live.js';
import { STYLES, TOOLS, buildSystemPrompt, currentLesson, dueWords, REVIEW_STEPS } from './prompt.js';
import { COURSE, LEVELS, lessonById, firstLessonOf } from './course.js';

const $ = (id) => document.getElementById(id);
const face = new Face($('face'));

// Тема: тёмная — белый Echo, светлая — тёмный Echo. Без выбора — как в Windows.
function applyTheme(theme) {
  const t = theme === 'light' || theme === 'dark' ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  face.setTheme(t);
  $('themeBtn').title = t === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  return t;
}
applyTheme('');

let config, progress;
let session = null, mic = null, player = null;
let micOn = true;
let textTalkUntil = 0; // пока Echo «пишет» без голоса — шевелит ртом
let lastVoiceAt = 0;
let greeted = false;

window.addEventListener('error', (e) => window.klyaks.log(`ошибка JS: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.klyaks.log(`ошибка JS (promise): ${e.reason?.message || e.reason}`));
let current = { tutor: null, me: null };

function setStatus(text) { $('status').textContent = text; }

function showLesson() {
  if (!progress.level) {
    $('lesson').textContent = 'сначала тест уровня';
  } else {
    const l = currentLesson(progress);
    $('lesson').textContent = `${l.level} · урок ${l.n}: ${l.title}`;
  }
  if (!$('program').hidden) renderProgram();
}

// Старый прогресс (до курса) и новые поля приводим к одному виду.
function normalizeProgress(p) {
  p.done = Array.isArray(p.done) ? p.done : [];
  p.focus = Array.isArray(p.focus) ? p.focus : [];
  p.homework = p.homework || '';
  if (p.level && !lessonById(p.lessonId)) {
    // Раньше программа была списком строк — её ближайшие темы становятся слабыми местами.
    const from = p.lessonIndex || 0;
    if (!p.focus.length && Array.isArray(p.program)) p.focus = p.program.slice(from, from + 5);
    p.lessonId = firstLessonOf(p.level).id;
  }
  delete p.program;
  delete p.lessonIndex;
  for (const w of p.words) {
    w.box ??= 0;
    w.due ??= 0;
  }
  return p;
}

// ---- Окно «Программа»: уровни, уроки, домашка, слова на повтор ----

function renderProgram() {
  const cur = progress.level ? currentLesson(progress) : null;
  const curIdx = cur ? COURSE.indexOf(cur) : -1;
  const due = dueWords(progress, 999).length;
  const doneIds = new Set(progress.done.map(d => d.id));
  const passed = COURSE.filter((l, i) => doneIds.has(l.id) || i < curIdx).length;

  $('programSummary').innerHTML = cur
    ? `<b>${cur.level} · ${LEVELS[cur.level]}</b> · пройдено ${passed} из ${COURSE.length} уроков<br>
       Сейчас: <b>${escapeHtml(cur.title)}</b> — ${escapeHtml(cur.goal)}<br>
       Слов в копилке: ${progress.words.length}, повторить сегодня: ${due}`
    : 'Уровень ещё не проверен — начни занятие, и Echo проведёт короткий тест.';
  $('programHomework').hidden = !progress.homework;
  $('programHomework').innerHTML = progress.homework ? `<b>Домашка:</b> ${escapeHtml(progress.homework)}` : '';

  $('programList').innerHTML = Object.keys(LEVELS).map(level => {
    const items = COURSE.filter(l => l.level === level).map(l => {
      const i = COURSE.indexOf(l);
      const rec = progress.done.find(d => d.id === l.id);
      const state = l === cur ? 'now' : rec ? 'done' : i < curIdx ? 'skip' : '';
      const mark = { now: '▶', done: '✓', skip: '·' }[state] || '';
      const score = rec?.score != null ? ` <small>${rec.score}/5</small>` : '';
      return `<li class="${state}" data-id="${l.id}" title="${escapeHtml(l.goal)} — нажми, чтобы учить"><span class="mark">${mark}</span>${l.n}. ${escapeHtml(l.title)}${score}</li>`;
    }).join('');
    const open = cur ? cur.level === level : level === 'A1';
    return `<details ${open ? 'open' : ''}><summary>${level} — ${LEVELS[level]}</summary><ol>${items}</ol></details>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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

// Конец разговора сохраняем сами, чтобы на следующем занятии Echo продолжил с того же места.
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
      if (!exists) progress.words.push({ en: w.en, ru: w.ru || '', box: 0, due: progress.sessions + 1 });
    }
    addUnique(progress.mistakes, args.mistakes || []);
    addUnique(progress.notes, args.note ? [args.note] : []);
    progress.mistakes = progress.mistakes.slice(-100);
    progress.notes = progress.notes.slice(-50);
    save();
    return 'сохранено';
  }
  if (name === 'set_program') {
    const level = String(args.level || '').toUpperCase().match(/[ABC][12]/)?.[0];
    if (!level) return 'нужен level: A1, A2, B1, B2 или C1';
    const start = lessonById(String(args.start_lesson || '').toUpperCase().trim()) || firstLessonOf(level);
    progress.level = start.level;
    progress.levelSummary = args.summary || '';
    progress.focus = (args.focus || []).filter(Boolean).slice(0, 5);
    progress.lessonId = start.id;
    save();
    showLesson();
    addMsg('system', `Уровень: ${level}. Начинаем с урока «${start.title}».`);
    return `сохранено, начинай урок ${start.id}: ${start.title} — ${start.goal}`;
  }
  if (name === 'lesson_done') {
    const cur = currentLesson(progress);
    const score = args.score != null && Number.isFinite(+args.score) ? Math.max(0, Math.min(5, Math.round(+args.score))) : null;
    progress.done = progress.done.filter(d => d.id !== cur.id);
    progress.done.push({ id: cur.id, score, at: new Date().toISOString().slice(0, 10) });
    if (args.homework) progress.homework = String(args.homework).trim();
    const next = COURSE[COURSE.indexOf(cur) + 1];
    if (next) {
      progress.lessonId = next.id;
      progress.level = next.level;
    }
    save();
    showLesson();
    addMsg('system', `Урок «${cur.title}» сдан${score != null ? ` на ${score}/5` : ''}.${args.homework ? ' Домашка записана.' : ''}`);
    return next ? `следующий урок ${next.id}: ${next.title} — ${next.goal}` : 'это был последний урок курса — поздравь ученика';
  }
  if (name === 'review_words') {
    const find = (en) => progress.words.find(w => w.en.toLowerCase() === String(en).trim().toLowerCase());
    for (const en of args.known || []) {
      const w = find(en);
      if (!w) continue;
      w.box = Math.min((w.box ?? 0) + 1, REVIEW_STEPS.length - 1);
      w.due = progress.sessions + REVIEW_STEPS[w.box];
    }
    for (const en of args.forgot || []) {
      const w = find(en);
      if (!w) continue;
      w.box = 0;
      w.due = progress.sessions + 1;
    }
    save();
    if (!$('program').hidden) renderProgram();
    return 'сохранено';
  }
  if (name === 'homework_checked') {
    if (args.result) addUnique(progress.notes, [`Домашка (${new Date().toISOString().slice(0, 10)}): ${args.result}`]);
    progress.homework = '';
    progress.notes = progress.notes.slice(-50);
    save();
    if (!$('program').hidden) renderProgram();
    return 'ок';
  }
  return 'неизвестная функция';
}

function onMicChunk(b64, rms) {
  if (!session || !micOn) return;
  // Без наушников Echo услышит сам себя из колонок — пока он говорит, микрофон молчит.
  if (!$('headphones').checked && player.busy()) return;
  if (rms > 0.02) lastVoiceAt = performance.now();
  session.sendAudio(b64);
}

function loop() {
  if (player?.playing) {
    face.set({ activity: 'speaking' });
    face.speak(player.level());
  } else if (performance.now() < textTalkUntil) {
    face.set({ activity: 'speaking' });
    face.speak(0.25 + 0.2 * Math.abs(Math.sin(performance.now() / 110)));
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
            setStatus(micOn ? 'Говори или пиши' : 'Микрофон выключен — пиши, Echo отвечает текстом');
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
        // Микрофон выключен — общаемся текстом: голос Echo не включаем, его слова и так идут в чат.
        onAudio: (b64) => { if (micOn) player.play(b64); },
        onInterrupted: () => player.stop(),
        onTutorText: (t) => { if (!micOn) textTalkUntil = performance.now() + 600; current.me = null; appendTo('tutor', t); turnText.tutor += t; },
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
  if (!micOn) player?.stop();
  setStatus(micOn ? 'Говори или пиши' : 'Микрофон выключен — пиши, Echo отвечает текстом');
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
  if (!apiKey) return error('Вставь ключ Gemini — без него Echo не заговорит.');
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
// Новая версия скачалась — показываем кнопку. Нажал — Echo перезапускается обновлённым.
window.klyaks.onUpdateReady((version) => {
  $('updateBtn').hidden = false;
  $('updateBtn').title = `Вышла версия ${version} — нажми, чтобы перезапустить Echo с ней`;
});
$('updateBtn').onclick = () => {
  if (session) return addMsg('system', 'Сначала закончи занятие — потом нажми «Обновить».');
  window.klyaks.installUpdate();
};
$('themeBtn').onclick = async () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  config = await window.klyaks.saveConfig({ theme: next });
};
$('programBtn').onclick = () => { renderProgram(); $('program').hidden = false; };
$('programClose').onclick = () => { $('program').hidden = true; };

// Ученик сам выбирает, что учить: клик по уроку делает его текущим.
$('programList').addEventListener('click', (e) => {
  const lesson = lessonById(e.target.closest('li[data-id]')?.dataset.id);
  if (!lesson) return;
  const wasPlaced = !!progress.level;
  progress.lessonId = lesson.id;
  progress.level = lesson.level;
  save();
  showLesson();
  $('program').hidden = true;
  addMsg('system', `Выбран урок «${lesson.title}» (${lesson.level}).`);
  if (session) {
    current = { tutor: null, me: null };
    player?.stop();
    session.sendText(`[ученик сам выбрал урок ${lesson.id}: ${lesson.title} — ${lesson.goal}. ${wasPlaced ? '' : 'Тест уровня не нужен. '}Коротко подтверди и переходи к этому уроку по шагам]`);
  }
});
$('program').addEventListener('click', (e) => { if (e.target === $('program')) $('program').hidden = true; });
$('keyLink').onclick = (e) => { e.preventDefault(); window.klyaks.openKeyPage(); };

(async () => {
  config = await window.klyaks.getConfig();
  applyTheme(config.theme);
  progress = normalizeProgress(await window.klyaks.getProgress());
  for (const key of ['mistakes', 'notes']) {
    const clean = [];
    addUnique(clean, progress[key]);
    progress[key] = clean;
  }
  showLesson();
  if (!hasKey() || !config.style) openSettings();
  requestAnimationFrame(loop);
})();
