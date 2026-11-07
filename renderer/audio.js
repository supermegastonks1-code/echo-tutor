// Микрофон (16 кГц PCM16) и проигрывание ответа (24 кГц PCM16).

const WORKLET = `
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(2048);
    this.pos = 0;
    this.sum = 0;
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.sum += s * s;
      this.buf[this.pos++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.pos === this.buf.length) {
        const rms = Math.sqrt(this.sum / this.buf.length);
        this.port.postMessage({ pcm: this.buf.buffer.slice(0), rms });
        this.pos = 0;
        this.sum = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
`;

export function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Mic {
  constructor(onChunk) {
    this.onChunk = onChunk; // (base64Pcm, rms)
    this.ctx = null;
    this.stream = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, 'mic-processor');
    node.port.onmessage = (e) => this.onChunk(bytesToBase64(e.data.pcm), e.data.rms);
    src.connect(node);
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close();
    this.ctx = null;
    this.stream = null;
  }
}

export class Player {
  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
    this.levelBuf = new Float32Array(this.analyser.fftSize);
    this.nextTime = 0;
    this.sources = new Set();
  }

  play(b64) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const bytes = base64ToBytes(b64);
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    const buf = this.ctx.createBuffer(1, pcm.length, 24000);
    const data = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const t = Math.max(this.ctx.currentTime + 0.05, this.nextTime);
    src.start(t);
    this.nextTime = t + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  stop() {
    this.sources.forEach(s => { try { s.stop(); } catch {} });
    this.sources.clear();
    this.nextTime = 0;
  }

  get playing() {
    return this.nextTime > this.ctx.currentTime;
  }

  // Звук ещё может доноситься из колонок: задержка вывода + эхо комнаты.
  busy(tail = 0.9) {
    return this.nextTime + (this.ctx.outputLatency || 0) + tail > this.ctx.currentTime;
  }

  // Громкость 0..1 для анимации рта.
  level() {
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const v of this.levelBuf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 5);
  }
}
