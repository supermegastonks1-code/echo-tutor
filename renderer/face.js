// Клякс — живая чернильная клякса. Форма считается каждый кадр: дышит, колышется,
// при злости покрывается колючками и брызгает, при радости прыгает и искрит.

const CX = 120, CY = 112, R = 62;
const INK = '#0d0b26';

const PALETTE = {
  idle: [43, 45, 143],
  listening: [37, 99, 235],
  speaking: [236, 72, 98],
  sassy: [139, 61, 230],
  angry: [220, 38, 38],
  happy: [16, 163, 108]
};

// Движение тела в каждом состоянии: колыхание, колючки, наклон, растяжение, тряска, прыжки.
const MOTION = {
  idle: { wobble: 1, spikes: 0, rot: 0, sy: 1, shake: 0, bounce: 0 },
  listening: { wobble: 1.3, spikes: 0, rot: 6, sy: 1.05, shake: 0, bounce: 0 },
  speaking: { wobble: 1.6, spikes: 0, rot: 0, sy: 1, shake: 0, bounce: 0 },
  sassy: { wobble: 1.1, spikes: 0, rot: -8, sy: 1, shake: 0, bounce: 0 },
  angry: { wobble: 1.4, spikes: 1, rot: 0, sy: 1.04, shake: 2.2, bounce: 0 },
  happy: { wobble: 1.2, spikes: 0, rot: 0, sy: 1, shake: 0, bounce: 1 }
};

const mix = (a, b, k) => a + (b - a) * k;
const rgb = (c, k = 0, to = 255) => `rgb(${c.map(v => Math.round(mix(v, to, k))).join(',')})`;

function blobPath(t, wobble, spikes, level) {
  const n = 64, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1
      + wobble * (0.045 * Math.sin(3 * a + 1.3 * t) + 0.03 * Math.sin(5 * a - 1.7 * t + 1) + 0.02 * Math.sin(2 * a + 0.7 * t))
      + level * 0.04 * Math.sin(7 * a + 9 * t)
      + spikes * 0.17 * Math.pow(Math.max(0, Math.sin(11 * a + 4 * t)), 3);
    pts.push([CX + Math.cos(a) * R * r, CY + Math.sin(a) * R * r]);
  }
  // Сглаживание Catmull-Rom → кривые Безье.
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

const EYE = (x, ry = 15, pr = 6.5, id) => `
  <ellipse cx="${x}" cy="${CY - 8}" rx="13" ry="${ry}" fill="#fff"/>
  <g id="${id}">
    <circle cx="${x}" cy="${CY - 6}" r="${pr}" fill="${INK}"/>
    <circle cx="${x + 2.5}" cy="${CY - 9}" r="2" fill="#fff"/>
  </g>`;

const LINE = 'stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"';

function features(mood, gid) {
  switch (mood) {
    case 'happy':
      return {
        eyes: `<path d="M86 ${CY - 4} Q98 ${CY - 22} 110 ${CY - 4}" ${LINE} stroke-width="6"/>
               <path d="M130 ${CY - 4} Q142 ${CY - 22} 154 ${CY - 4}" ${LINE} stroke-width="6"/>`,
        mouth: `<path d="M102 ${CY + 18} Q120 ${CY + 44} 138 ${CY + 18} Z" fill="${INK}" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`
      };
    case 'sassy':
      return {
        eyes: `${EYE(98, 15, 6.5, 'pl')}
               <path d="M84 ${CY - 8} A14 15 0 0 1 112 ${CY - 8} Z" fill="url(#${gid})" stroke="#fff" stroke-width="3"/>
               ${EYE(142, 15, 6.5, 'pr')}
               <path d="M128 ${CY - 30} Q142 ${CY - 40} 157 ${CY - 32}" ${LINE}/>`,
        mouth: `<path d="M108 ${CY + 28} Q124 ${CY + 31} 136 ${CY + 19}" ${LINE}/>`
      };
    case 'angry':
      return {
        eyes: `${EYE(98, 11, 5, 'pl')}${EYE(142, 11, 5, 'pr')}
               <path d="M82 ${CY - 30} L111 ${CY - 18}" ${LINE} stroke-width="6"/>
               <path d="M158 ${CY - 30} L129 ${CY - 18}" ${LINE} stroke-width="6"/>`,
        mouth: `<rect x="103" y="${CY + 18}" width="34" height="13" rx="3" fill="#fff" stroke="${INK}" stroke-width="2"/>
                <path d="M103 ${CY + 24.5} H137 M114 ${CY + 18} V${CY + 31} M126 ${CY + 18} V${CY + 31}" stroke="${INK}" stroke-width="1.5"/>`
      };
    default:
      return {
        eyes: `${EYE(98, 15, 6.5, 'pl')}${EYE(142, 15, 6.5, 'pr')}`,
        mouth: `<path d="M108 ${CY + 22} Q120 ${CY + 31} 132 ${CY + 22}" ${LINE}/>`
      };
  }
}

let faceCount = 0;

export class Face {
  constructor(el) {
    this.el = el;
    this.mood = 'calm';
    this.activity = 'idle';
    this.level = 0;
    this.color = [...PALETTE.idle];
    this.motion = { ...MOTION.idle };
    this.particles = [];
    this.pop = 0;
    this.gaze = [0, 0];
    this.gazeTarget = [0, 0];
    this.lastMouse = 0;
    this.nextBlink = 2;
    this.t = 0;
    this.prev = performance.now();
    this.key = null;
    this.gid = `kg${++faceCount}`;

    el.innerHTML = `
      <svg viewBox="0 0 240 230" class="face-svg">
        <defs>
          <radialGradient id="${this.gid}" cx="38%" cy="32%" r="75%">
            <stop class="s0" offset="0%"/>
            <stop class="s1" offset="65%"/>
            <stop class="s2" offset="100%"/>
          </radialGradient>
        </defs>
        <g id="fx"></g>
        <g id="body">
          <path id="drip" fill="url(#${this.gid})"/>
          <circle id="drop" r="6" fill="url(#${this.gid})"/>
          <path id="blob" fill="url(#${this.gid})"/>
          <ellipse cx="${CX - 27}" cy="${CY - 32}" rx="15" ry="8" fill="#fff" opacity=".28" transform="rotate(-32 ${CX - 27} ${CY - 32})"/>
          <g id="eyes"></g>
          <g id="mouth"></g>
          <ellipse id="talk" cx="${CX}" cy="${CY + 26}" rx="12" ry="3" fill="${INK}" stroke="#fff" stroke-width="4"/>
        </g>
      </svg>`;
    this.q = (id) => el.querySelector('#' + id);
    window.addEventListener('mousemove', (e) => this.look(e));
    this.render();
    requestAnimationFrame(() => this.frame());
  }

  set({ mood, activity }) {
    if (mood) this.mood = mood;
    if (activity) this.activity = activity;
    if (this.activity !== 'speaking') this.level = 0;
    this.render();
  }

  speak(level) { this.level = level; }

  state() {
    if (this.mood === 'angry' || this.mood === 'sassy' || this.mood === 'happy') return this.mood;
    return this.activity;
  }

  render() {
    const key = this.mood + '|' + this.activity;
    if (key === this.key) return;
    if (this.key && this.key.split('|')[0] !== this.mood) this.pop = 1;
    this.key = key;
    const f = features(this.mood, this.gid);
    this.q('eyes').innerHTML = f.eyes;
    this.q('mouth').innerHTML = f.mouth;
  }

  // Зрачки следят за мышкой, а без неё — блуждают сами.
  look(e) {
    const box = this.el.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / 300);
    this.gazeTarget = [dx / len * 4 * k, dy / len * 4 * k];
    this.lastMouse = this.t;
  }

  spawn(state, dt) {
    const c = this.color;
    if (state === 'angry' && Math.random() < dt * 9) {
      const a = Math.random() * Math.PI * 2, s = 70 + Math.random() * 60;
      this.particles.push({ kind: 'drop', x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0, max: 0.8, r: 2 + Math.random() * 4 });
    }
    if (state === 'happy' && Math.random() < dt * 4) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ kind: 'spark', x: CX + Math.cos(a) * (R + 18), y: CY + Math.sin(a) * (R + 18), vx: 0, vy: -10, life: 0, max: 0.9, r: 5 + Math.random() * 4 });
    }
    if (state === 'listening' && Math.random() < dt * 1.6) {
      this.particles.push({ kind: 'ring', x: CX, y: CY, vx: 0, vy: 0, life: 0, max: 1.2, r: R });
    }
    this.particles = this.particles.filter(p => (p.life += dt) < p.max);
    let out = '';
    for (const p of this.particles) {
      const k = p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'drop') {
        p.vy += 260 * dt;
        out += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(p.r * (1 - k * 0.5)).toFixed(1)}" fill="${rgb(c)}" opacity="${(1 - k).toFixed(2)}"/>`;
      } else if (p.kind === 'spark') {
        const s = p.r * Math.sin(k * Math.PI);
        out += `<path d="M${p.x} ${p.y - s} L${p.x + s * 0.3} ${p.y - s * 0.3} L${p.x + s} ${p.y} L${p.x + s * 0.3} ${p.y + s * 0.3} L${p.x} ${p.y + s} L${p.x - s * 0.3} ${p.y + s * 0.3} L${p.x - s} ${p.y} L${p.x - s * 0.3} ${p.y - s * 0.3}Z" fill="#ffd23f"/>`;
      } else {
        out += `<circle cx="${CX}" cy="${CY}" r="${(R + k * 45).toFixed(1)}" fill="none" stroke="${rgb(c)}" stroke-width="3" opacity="${(0.5 * (1 - k)).toFixed(2)}"/>`;
      }
    }
    this.q('fx').innerHTML = out;
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    this.t += dt;
    const t = this.t;
    const state = this.state();

    // Плавный переход цвета и движения.
    const target = PALETTE[state];
    const ease = 1 - Math.exp(-dt * 6);
    this.color = this.color.map((v, i) => mix(v, target[i], ease));
    const m = MOTION[state];
    for (const k in m) this.motion[k] = mix(this.motion[k], m[k], ease);
    const mo = this.motion;

    const c = this.color;
    this.el.querySelector('.s0').setAttribute('stop-color', rgb(c, 0.3));
    this.el.querySelector('.s1').setAttribute('stop-color', rgb(c));
    this.el.querySelector('.s2').setAttribute('stop-color', rgb(c, 0.3, 0));
    this.el.querySelector('svg').style.filter = `drop-shadow(0 10px 20px ${rgb(c).replace('rgb', 'rgba').replace(')', ',0.4)')})`;

    this.q('blob').setAttribute('d', blobPath(t, mo.wobble, mo.spikes, this.level));

    // Капля снизу медленно набухает и срывается.
    const ph = (t % 5) / 5;
    const grow = Math.min(1, ph / 0.7);
    const fall = Math.max(0, (ph - 0.7) / 0.3);
    const dx = CX - 24, top = CY + R * 0.82;
    const len = 6 + grow * 16;
    this.q('drip').setAttribute('d', `M${dx - 5} ${top} Q${dx - 3} ${top + len * 0.6} ${dx} ${top + len} Q${dx + 3} ${top + len * 0.6} ${dx + 5} ${top} Z`);
    const drop = this.q('drop');
    drop.setAttribute('cx', dx);
    drop.setAttribute('cy', (top + len + fall * fall * 60).toFixed(1));
    drop.setAttribute('r', (3 + grow * 3).toFixed(1));
    drop.setAttribute('opacity', (1 - fall).toFixed(2));

    // Тело: дыхание, наклон, речь, тряска, прыжки, «поп» при смене настроения.
    this.pop *= Math.exp(-dt * 6);
    const breathe = 1 + 0.018 * Math.sin(t * 2.2);
    const hop = mo.bounce * Math.abs(Math.sin(t * 5));
    const pop = 1 + 0.14 * this.pop * Math.cos(t * 30);
    const sx = breathe * pop * (1 + 0.05 * this.level + mo.bounce * 0.06 * (1 - hop));
    const sy = breathe * pop * mo.sy * (1 - 0.04 * this.level - mo.bounce * 0.05 * (1 - hop));
    const ox = (Math.random() - 0.5) * 2 * mo.shake;
    const oy = (Math.random() - 0.5) * 2 * mo.shake - hop * 12;
    this.q('body').setAttribute('transform',
      `translate(${(CX + ox).toFixed(1)} ${(CY + oy).toFixed(1)}) rotate(${mo.rot.toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-CX} ${-CY})`);

    // Моргание.
    let blink = 1;
    if (t > this.nextBlink) {
      const b = (t - this.nextBlink) / 0.14;
      blink = b < 1 ? Math.abs(1 - 2 * b) * 0.9 + 0.1 : 1;
      if (b >= 1) this.nextBlink = t + 2.5 + Math.random() * 3;
    }
    this.q('eyes').setAttribute('transform', `translate(0 ${CY - 8}) scale(1 ${blink.toFixed(2)}) translate(0 ${-(CY - 8)})`);

    // Взгляд.
    if (t - this.lastMouse > 3 && Math.random() < dt * 0.6) {
      this.gazeTarget = [(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5];
    }
    this.gaze = this.gaze.map((v, i) => mix(v, this.gazeTarget[i], 1 - Math.exp(-dt * 9)));
    for (const id of ['pl', 'pr']) {
      this.q(id)?.setAttribute('transform', `translate(${this.gaze[0].toFixed(1)} ${this.gaze[1].toFixed(1)})`);
    }

    // Рот: во время речи открывается в такт голосу.
    const talking = this.activity === 'speaking' && this.mood !== 'happy';
    this.q('mouth').style.display = talking ? 'none' : '';
    const talk = this.q('talk');
    talk.style.display = talking ? '' : 'none';
    if (talking) talk.setAttribute('ry', (3 + this.level * 12).toFixed(1));

    this.spawn(state, dt);
    requestAnimationFrame(() => this.frame());
  }
}
