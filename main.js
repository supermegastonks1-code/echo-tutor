const { app, BrowserWindow, ipcMain, session, crashReporter, shell } = require('electron');

crashReporter.start({ uploadToServer: false });
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
// В собранной программе настройки и прогресс лежат в профиле пользователя (%APPDATA%/Klyaks),
// чтобы переживать обновления. При разработке — в папке проекта.
const DATA_ROOT = app.isPackaged ? app.getPath('userData') : ROOT;
const CONFIG_PATH = path.join(DATA_ROOT, 'config.json');
const PROGRESS_PATH = path.join(DATA_ROOT, 'data', 'progress.json');

const DEFAULT_CONFIG = {
  apiKey: '',
  voice: 'Puck',
  style: '',
  model: ''
};

const DEFAULT_PROGRESS = {
  level: '',
  levelSummary: '',
  program: [],
  lessonIndex: 0,
  words: [],
  mistakes: [],
  notes: [],
  lastSession: [],
  sessions: 0
};

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Старые сборки хранили config.json и data/ рядом с .exe — переносим их один раз.
if (app.isPackaged) {
  const old = path.dirname(process.execPath);
  for (const rel of ['config.json', path.join('data', 'progress.json')]) {
    const from = path.join(old, rel), to = path.join(DATA_ROOT, rel);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

ipcMain.handle('config:get', () => readJson(CONFIG_PATH, DEFAULT_CONFIG));
ipcMain.handle('config:save', (_e, patch) => {
  const config = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  for (const key of ['apiKey', 'voice', 'style']) {
    if (typeof patch?.[key] === 'string') config[key] = patch[key].trim();
  }
  writeJson(CONFIG_PATH, config);
  return config;
});
ipcMain.on('open-key-page', () => shell.openExternal('https://aistudio.google.com/apikey'));
ipcMain.handle('progress:get', () => readJson(PROGRESS_PATH, DEFAULT_PROGRESS));
ipcMain.handle('progress:save', (_e, data) => {
  writeJson(PROGRESS_PATH, data);
  return true;
});

const LOG_PATH = path.join(DATA_ROOT, 'data', 'log.txt');
function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toLocaleString('ru-RU')}  ${line}\n`, 'utf8');
  } catch {}
}
ipcMain.on('log', (_e, line) => log(line));

// Всё, из-за чего программа может закрыться, пишем в log.txt.
process.on('uncaughtException', (e) => log(`ОШИБКА main: ${e.stack || e}`));
process.on('exit', (code) => log(`процесс завершён, код ${code}`));
app.on('child-process-gone', (_e, d) => log(`упал служебный процесс ${d.type}: ${d.reason} (${d.exitCode})`));
app.on('before-quit', () => log('выход из программы'));

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 520,
    minHeight: 560,
    title: 'Клякс — репетитор английского',
    backgroundColor: '#f6f6f4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on('render-process-gone', (_e, d) => log(`ОКНО УПАЛО: ${d.reason} (${d.exitCode})`));
  win.webContents.on('unresponsive', () => log('Окно зависло'));
  win.on('close', () => log('окно закрывается'));
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
