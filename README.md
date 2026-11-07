# Локи — дерзкий репетитор английского

Десктопное приложение на Electron: голосовой и текстовый репетитор на Gemini Live API. У Локи анимированная мордочка, которая меняется от настроения, жёсткий характер с матом и подколами, тест уровня с личной программой уроков и память между занятиями.

## Запуск

1. Установи [Node.js](https://nodejs.org) 20+.
2. `npm install`
3. Скопируй `config.example.json` в `config.json` и вставь ключ Gemini (aistudio.google.com → Get API key).
4. `npm start`

Gemini недоступен в некоторых регионах — тогда нужен VPN.

## Сборка .exe

```
npx @electron/packager . Loki --platform=win32 --arch=x64 --out=dist --overwrite --asar --ignore="^/config\.json$" --ignore="^/data" --ignore="^/dist"
```

Рядом с `Loki.exe` положи `config.json` с ключом.

## Устройство

- `main.js` — окно, config, прогресс и лог в `data/`
- `renderer/live.js` — WebSocket-клиент Gemini Live, автопереподключение
- `renderer/audio.js` — микрофон 16 кГц и воспроизведение 24 кГц
- `renderer/face.js` — SVG-мордочка и эмоции
- `renderer/prompt.js` — характер, тест уровня, функции памяти
- `renderer/app.js` — интерфейс и логика занятия
