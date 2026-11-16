// Клиент Gemini Live API (WebSocket BidiGenerateContent).

const API = 'https://generativelanguage.googleapis.com/v1beta';
const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Находит модель с поддержкой Live API, предпочитая нативный звук.
export async function pickModel(apiKey) {
  const res = await fetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) {
    const text = await res.text();
    if (/location is not supported/i.test(text)) throw new Error('Google не пускает из твоего региона — включи VPN и нажми «Начать занятие» ещё раз.');
    throw new Error(res.status === 400 || res.status === 403 ? 'Ключ Gemini не подошёл — проверь, что скопировал его целиком.' : `Gemini: ${res.status} ${text}`);
  }
  const { models = [] } = await res.json();
  const live = models.filter(m => (m.supportedGenerationMethods || []).includes('bidiGenerateContent')
    && !/transcribe|translate|robotics|thinking/.test(m.name));
  if (!live.length) throw new Error('Не нашёл ни одной Live-модели для этого ключа.');
  // Сначала самая новая основная Live-модель (gemini-N-live), потом нативный звук 2.5.
  const score = (m) => /^models\/gemini-[\d.]+-live$/.test(m.name) ? 3 : m.name.includes('native-audio') ? 2 : 0;
  live.sort((a, b) => score(b) - score(a) || b.name.localeCompare(a.name));
  return live[0].name;
}

export class LiveSession {
  constructor({ apiKey, model, voice, systemPrompt, tools, handlers }) {
    Object.assign(this, { apiKey, model, voice, systemPrompt, tools, handlers });
    this.ws = null;
    this.resumeHandle = null;
    this.closedByUser = false;
    this.ready = false;
  }

  connect() {
    this.ready = false;
    this.ws = new WebSocket(`${WS}?key=${encodeURIComponent(this.apiKey)}`);
    this.ws.onopen = () => this.send({ setup: this.setupMessage() });
    this.ws.onmessage = async (e) => {
      const text = typeof e.data === 'string' ? e.data : await e.data.text();
      this.onMessage(JSON.parse(text));
    };
    this.ws.onclose = (e) => {
      const wasReady = this.ready;
      this.ready = false;
      if (this.closedByUser) return;
      const reason = `${e.code}${e.reason ? ' ' + e.reason : ''}`;
      this.handlers.onLog?.(`связь закрыта: ${reason}${wasReady ? '' : ' (до готовности)'}`);
      this.failures = wasReady ? 0 : (this.failures || 0) + 1;
      // Не получилось продолжить старую сессию — начинаем новую, память всё равно в progress.json.
      if (!wasReady && this.resumeHandle && this.failures >= 2) {
        this.handlers.onLog?.('сбрасываю ключ продолжения');
        this.resumeHandle = null;
      }
      // Модель не принимает настройку «раздумий» — сразу пробуем без неё.
      if (!wasReady && !this.noThinkingConfig && /thinking/i.test(e.reason)) {
        this.noThinkingConfig = true;
        this.failures = 0;
        setTimeout(() => this.connect(), 100);
        return;
      }
      // Google не пускает из региона — обычно это моргнул VPN. Ждём, пока он вернётся.
      if (/location is not supported/i.test(e.reason)) {
        this.handlers.onStatus?.('location', reason);
        setTimeout(() => this.connect(), 5000);
        return;
      }
      if (this.failures >= 6) {
        this.handlers.onStatus?.('failed', reason);
        return;
      }
      this.handlers.onStatus?.('reconnecting', reason);
      setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.failures, 15000));
    };
    this.ws.onerror = () => this.handlers.onLog?.('ошибка сокета');
  }

  setupMessage() {
    const setup = {
      model: this.model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
        // Без «раздумий» модель отвечает примерно вдвое быстрее (если модель это поддерживает).
        ...(this.noThinkingConfig ? {} : { thinkingConfig: { thinkingBudget: 0 } })
      },
      // Ученик говорит на чужом языке и делает паузы, подбирая слова, — не обрываем его на полуслове.
      realtimeInputConfig: {
        automaticActivityDetection: { endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', silenceDurationMs: 1100 }
      },
      // systemPrompt может быть функцией: при новой сессии посреди занятия (ключ продолжения сброшен)
      // её собирают заново — с тем, что уже было на этом занятии.
      systemInstruction: { parts: [{ text: typeof this.systemPrompt === 'function'
        ? this.systemPrompt({ reconnect: this.everReady && !this.resumeHandle })
        : this.systemPrompt }] },
      tools: this.tools,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {}
    };
    return setup;
  }

  onMessage(msg) {
    const h = this.handlers;
    if (msg.setupComplete) {
      const resumed = !!this.resumeHandle;
      this.ready = true;
      this.everReady = true;
      h.onStatus?.('ready', resumed);
      return;
    }
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    }
    if (msg.error) h.onLog?.(`ошибка сервера: ${JSON.stringify(msg.error).slice(0, 300)}`);
    if (msg.goAway) {
      h.onLog?.(`сервер просит переподключиться (goAway ${msg.goAway.timeLeft || ''})`);
      // Сервер скоро закроет соединение — переподключимся с тем же контекстом.
      this.ws.close();
      return;
    }
    if (msg.toolCall) {
      const responses = msg.toolCall.functionCalls.map(call => ({
        id: call.id,
        name: call.name,
        response: { result: h.onTool?.(call.name, call.args || {}) ?? 'ok' }
      }));
      this.send({ toolResponse: { functionResponses: responses } });
    }
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) h.onInterrupted?.();
    for (const part of sc.modelTurn?.parts || []) {
      if (part.inlineData?.data) h.onAudio?.(part.inlineData.data);
    }
    if (sc.inputTranscription?.text) h.onUserText?.(sc.inputTranscription.text);
    if (sc.outputTranscription?.text) h.onTutorText?.(sc.outputTranscription.text);
    if (sc.turnComplete) h.onTurnComplete?.();
  }

  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendAudio(b64) {
    if (this.ready) this.send({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } });
  }

  sendText(text) {
    if (this.ready) this.send({ realtimeInput: { text } });
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}
