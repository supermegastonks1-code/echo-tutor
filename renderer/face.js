// Мордочка Локи: форма зависит от того, кто говорит, лицо — от настроения.

const COLORS = {
  idle: '#2233c8',
  happy: '#2233c8',
  listening: '#2f6bff',
  speaking: '#ff3b3b',
  sassy: '#d45bd8',
  angry: '#ff2e2e'
};

const BUBBLE = (c) => `
  <rect x="50" y="62" width="140" height="78" rx="34" fill="#fff" stroke="${c}" stroke-width="7"/>
  <path d="M80 133 L64 162 L106 137" fill="#fff" stroke="${c}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`;

const FLAMES = `
  <g class="flames">
    <path d="M56 92 L50 34 L70 54 L76 8 L96 46 L108 0 L120 42 L134 -2 L146 44 L160 10 L166 54 L188 30 L184 92 Z"
          fill="#ff7a1a" stroke="#ff2e2e" stroke-width="5" stroke-linejoin="round"/>
    <path d="M72 92 L72 58 L86 70 L94 32 L108 64 L120 24 L132 64 L146 30 L152 70 L168 56 L168 92 Z" fill="#ffc21a"/>
  </g>`;

const SHAPES = {
  idle: (c) => `<circle cx="120" cy="100" r="62" fill="#fff" stroke="${c}" stroke-width="7"/>`,
  happy: (c) => `<circle cx="120" cy="100" r="62" fill="#fff" stroke="${c}" stroke-width="7"/>`,
  listening: (c) => `
    <path d="M36 148 C64 136 98 138 120 152 C142 138 176 136 204 148" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    <path d="M118 60 C94 44 62 46 38 56 L38 140 C62 130 96 130 118 144 Z" fill="#fff" stroke="${c}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M122 60 C146 44 178 46 202 56 L202 140 C178 130 144 130 122 144 Z" fill="#fff" stroke="${c}" stroke-width="7" stroke-linejoin="round"/>`,
  speaking: BUBBLE,
  sassy: (c) => `<g transform="rotate(-9 120 100)">${BUBBLE(c)}</g>`,
  angry: (c) => FLAMES + BUBBLE(c)
};

const CENTER = { idle: 100, happy: 100, listening: 96, speaking: 101, sassy: 100, angry: 101 };

function features(mood, cy, c) {
  const L = 98, R = 142, ey = cy - 4, my = cy + 17;
  const ink = '#1a1a2e';
  switch (mood) {
    case 'happy':
      return `
        <g class="eyes">
          <path d="M${L - 8} ${ey + 3} Q${L} ${ey - 9} ${L + 8} ${ey + 3}" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
          <path d="M${R - 8} ${ey + 3} Q${R} ${ey - 9} ${R + 8} ${ey + 3}" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
        </g>
        <path id="mouth" d="M110 ${my - 3} Q120 ${my + 9} 130 ${my - 3}" fill="${ink}"/>`;
    case 'sassy':
      return `
        <g transform="rotate(-9 120 100)">
          <path d="M${L - 10} ${ey - 16} L${L + 9} ${ey - 20}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
          <g class="eyes">
            <rect x="${L - 8}" y="${ey - 1}" width="16" height="5" rx="2.5" fill="${ink}"/>
            <ellipse cx="${R}" cy="${ey}" rx="5" ry="6" fill="${ink}"/>
          </g>
          <rect id="mouth" x="${116}" y="${my - 2}" width="18" height="4" rx="2" fill="${ink}"/>
        </g>`;
    case 'angry':
      return `
        <path d="M${L - 11} ${ey - 15} L${L + 9} ${ey - 6}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
        <path d="M${R + 11} ${ey - 15} L${R - 9} ${ey - 6}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
        <g class="eyes">
          <ellipse cx="${L}" cy="${ey + 2}" rx="5" ry="4" fill="${ink}"/>
          <ellipse cx="${R}" cy="${ey + 2}" rx="5" ry="4" fill="${ink}"/>
        </g>
        <rect id="mouth" x="108" y="${my - 3}" width="24" height="7" rx="2" fill="#fff" stroke="${ink}" stroke-width="3"/>`;
    default:
      return `
        <g class="eyes">
          <ellipse cx="${L}" cy="${ey}" rx="5" ry="7" fill="${ink}"/>
          <ellipse cx="${R}" cy="${ey}" rx="5" ry="7" fill="${ink}"/>
        </g>
        <rect id="mouth" x="112" y="${my - 2}" width="16" height="4" rx="2" fill="${ink}"/>`;
  }
}

export class Face {
  constructor(el) {
    this.el = el;
    this.mood = 'calm';
    this.activity = 'idle'; // idle | listening | speaking
    this.shape = null;
    this.key = null;
    this.render();
  }

  set({ mood, activity }) {
    if (mood) this.mood = mood;
    if (activity) this.activity = activity;
    this.render();
  }

  visualShape() {
    if (this.mood === 'angry') return 'angry';
    if (this.activity === 'speaking') return this.mood === 'sassy' ? 'sassy' : 'speaking';
    if (this.activity === 'listening') return 'listening';
    if (this.mood === 'sassy') return 'sassy';
    return this.mood === 'happy' ? 'happy' : 'idle';
  }

  render() {
    const shape = this.visualShape();
    const key = shape + '|' + this.mood;
    if (key === this.key) return;
    const c = COLORS[shape];
    const featureMood = shape === 'listening' && this.mood === 'calm' ? 'calm' : this.mood;
    this.el.innerHTML = `
      <svg viewBox="0 0 240 200" class="face-svg">
        ${SHAPES[shape](c)}
        ${features(featureMood, CENTER[shape], c)}
      </svg>`;
    this.el.dataset.shape = shape;
    this.el.style.setProperty('--glow', c);
    if (shape !== this.shape) {
      this.el.classList.remove('pop');
      void this.el.offsetWidth;
      this.el.classList.add('pop');
    }
    this.shape = shape;
    this.key = key;
    this.mouth = this.el.querySelector('#mouth');
    this.mouthBase = this.mouth?.tagName === 'rect'
      ? { y: +this.mouth.getAttribute('y'), h: +this.mouth.getAttribute('height') }
      : null;
  }

  // Открывает рот в такт голосу (0..1).
  speak(level) {
    if (!this.mouthBase) return;
    const extra = level * 14;
    this.mouth.setAttribute('height', this.mouthBase.h + extra);
    this.mouth.setAttribute('y', this.mouthBase.y - extra / 2);
  }
}
