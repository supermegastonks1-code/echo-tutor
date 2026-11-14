// 3D-персонаж: белый гранёный блок с глазами-прямоугольниками, ручками и шестью лапками.
// Построен из гранёных блоков на Three.js и живёт каждый кадр: дышит, моргает,
// следит за мышкой, говорит, прыгает от радости и пыхтит паром от злости.

import * as THREE from '../node_modules/three/build/three.module.js';

const WHITE = new THREE.Color('#ffffff');

// Подсветка вокруг персонажа и лёгкий оттенок тела в каждом состоянии.
const LOOK = {
  idle: { rim: '#9fb4ff', tint: WHITE },
  listening: { rim: '#3d7bff', tint: WHITE },
  speaking: { rim: '#ff4f86', tint: WHITE },
  sassy: { rim: '#9b5cff', tint: new THREE.Color('#f6f0ff') },
  angry: { rim: '#ff2a2a', tint: new THREE.Color('#ffc4c4') },
  happy: { rim: '#1fd28a', tint: new THREE.Color('#f2fff8') }
};

// Восьмиугольное сечение: прямоугольник со срезанными углами (сверху и снизу срез разный).
function ring(halfW, top, bottom, cutTop, cutBottom, z) {
  return [
    [-halfW + cutBottom, bottom], [halfW - cutBottom, bottom], [halfW, bottom + cutBottom], [halfW, top - cutTop],
    [halfW - cutTop, top], [-halfW + cutTop, top], [-halfW, top - cutTop], [-halfW, bottom + cutBottom]
  ].map(([x, y]) => new THREE.Vector3(x, y, z));
}

// Гранёное тело: сечения от передней грани к задней соединяются плоскими гранями.
function loft(rings) {
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const center = (r) => r.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / r.length);
  const first = rings[0], last = rings[rings.length - 1], n = first.length;
  const cf = center(first), cb = center(last);
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    tri(cf, first[j], first[k]);
    tri(cb, last[k], last[j]);
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i][j], b = rings[i][k], c = rings[i + 1][k], d = rings[i + 1][j];
      tri(a, c, b);
      tri(a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Простой гранёный блок с фаской b по всем рёбрам.
function facetBox(w, h, d, b) {
  const x = w / 2, y = h / 2, z = d / 2;
  return loft([
    ring(x - b, y - b, -y + b, b * 0.6, b * 0.6, z),
    ring(x, y, -y, b, b, z - b),
    ring(x, y, -y, b, b, -z + b),
    ring(x - b, y - b, -y + b, b * 0.6, b * 0.6, -z)
  ]);
}

// Корпус по замерам с референса: широкая фаска вокруг лица, сверху крупнее, снизу мельче.
function torsoGeometry() {
  return loft([
    ring(0.75, 0.43, -0.58, 0.1, 0.07, 0.65),
    ring(0.9, 0.66, -0.66, 0.2, 0.12, 0.43),
    ring(0.9, 0.66, -0.66, 0.2, 0.12, -0.43),
    ring(0.75, 0.43, -0.58, 0.1, 0.07, -0.65)
  ]);
}

const mix = (a, b, k) => a + (b - a) * k;

export class Face {
  constructor(el) {
    this.el = el;
    this.mood = 'calm';
    this.activity = 'idle';
    this.level = 0;
    this.t = 0;
    this.prev = performance.now();
    this.pop = 0;
    this.nextBlink = 2;
    this.mouse = new THREE.Vector2(0, 0);
    this.lastMouse = -10;
    this.gaze = new THREE.Vector2(0, 0);
    this.k = { lean: 0, sassy: 0, angry: 0, happy: 0 };
    this.steam = [];

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    el.innerHTML = '';
    el.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'face-canvas';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.0, 5.3);
    this.camera.lookAt(0, 0.72, 0);

    this.buildLights();
    this.buildModel();

    const resize = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 250;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(el);
    resize();

    window.addEventListener('mousemove', (e) => {
      const box = el.getBoundingClientRect();
      this.mouse.set(
        THREE.MathUtils.clamp((e.clientX - (box.left + box.width / 2)) / 400, -1, 1),
        THREE.MathUtils.clamp((e.clientY - (box.top + box.height / 2)) / 300, -1, 1)
      );
      this.lastMouse = this.t;
    });

    requestAnimationFrame(() => this.frame());
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9d2e3', 1.7));
    const key = new THREE.DirectionalLight('#ffffff', 2.6);
    key.position.set(-2.5, 4.5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 15 });
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.6);
    fill.position.set(4, 2, 3);
    this.scene.add(fill);
    // Цветная контровая подсветка — по ней видно настроение.
    this.rim = new THREE.PointLight(LOOK.idle.rim, 6, 8, 1.5);
    this.rim.position.set(0, 1.4, -1.6);
    this.scene.add(this.rim);
    this.rimSide = new THREE.PointLight(LOOK.idle.rim, 2.5, 6, 1.5);
    this.rimSide.position.set(2.2, 0.6, 0.8);
    this.scene.add(this.rimSide);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildModel() {
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: WHITE.clone(), roughness: 0.45, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color('#dfe8ff')
    });
    const ink = new THREE.MeshStandardMaterial({ color: '#141622', roughness: 0.35 });
    const mesh = (geo, mat = this.bodyMat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Шесть лапок: две спереди, две по бокам, две сзади.
    const legGeo = facetBox(0.35, 0.46, 0.34, 0.04);
    const legSpots = [[-0.4, 0.36], [0.4, 0.36], [-0.68, 0.02], [0.68, 0.02], [-0.4, -0.36], [0.4, -0.36]];
    this.legs = legSpots.map(([x, z]) => {
      const leg = mesh(legGeo);
      leg.position.set(x, 0.23, z);
      this.root.add(leg);
      return leg;
    });

    // Тело на пружинке: вся анимация корпуса — через этот узел.
    this.body = new THREE.Group();
    this.body.position.y = 0.38;
    this.root.add(this.body);
    const torso = mesh(torsoGeometry());
    torso.position.y = 0.66;
    this.body.add(torso);

    // Лицо на передней грани.
    this.face = new THREE.Group();
    this.face.position.set(0, 0.66, 0.65);
    this.body.add(this.face);
    const eyeGeo = new THREE.BoxGeometry(0.15, 0.27, 0.04);
    this.eyes = [-0.43, 0.43].map((x) => {
      const eye = mesh(eyeGeo, ink);
      eye.position.set(x, 0.01, 0.012);
      this.face.add(eye);
      return eye;
    });
    this.mouth = mesh(new THREE.BoxGeometry(0.27, 0.05, 0.03), ink);
    this.mouth.position.set(-0.01, -0.27, 0.012);
    this.face.add(this.mouth);

    // Ручки на шарнирах у плеч, чтобы ими можно было махать.
    const armGeo = facetBox(0.38, 0.46, 0.48, 0.09);
    this.arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.84, 0.42, 0.2);
      const arm = mesh(armGeo);
      arm.position.set(side * 0.17, -0.1, 0);
      pivot.add(arm);
      this.body.add(pivot);
      return pivot;
    });

    // Пар для злости.
    this.steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, roughness: 1 });
    this.steamGeo = new THREE.SphereGeometry(0.08, 12, 10);
  }

  set({ mood, activity }) {
    if (mood && mood !== this.mood) this.pop = 1;
    if (mood) this.mood = mood;
    if (activity) this.activity = activity;
    if (this.activity !== 'speaking') this.level = 0;
  }

  speak(level) { this.level = level; }

  state() {
    if (this.mood === 'angry' || this.mood === 'sassy' || this.mood === 'happy') return this.mood;
    return this.activity;
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    this.t += dt;
    const t = this.t, k = this.k, state = this.state();
    const ease = 1 - Math.exp(-dt * 7);
    const go = (name, target) => { k[name] = mix(k[name], target, ease); };

    go('lean', state === 'listening' ? 1 : 0);
    go('sassy', state === 'sassy' ? 1 : 0);
    go('angry', state === 'angry' ? 1 : 0);
    go('happy', state === 'happy' ? 1 : 0);
    this.pop *= Math.exp(-dt * 5);

    // Цвет подсветки и оттенок тела.
    const look = LOOK[state];
    this.rim.color.lerp(new THREE.Color(look.rim), ease);
    this.rimSide.color.copy(this.rim.color);
    this.rim.intensity = 5 + (state === 'idle' ? 0 : 3) + Math.sin(t * 3) * 0.8;
    this.bodyMat.color.lerp(look.tint, ease);
    this.el.style.setProperty('--glow', `#${this.rim.color.getHexString()}`);

    // Взгляд и поворот за мышкой; без мышки — оглядывается сам.
    if (t - this.lastMouse > 3 && Math.random() < dt * 0.5) {
      this.mouse.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6);
    }
    this.gaze.lerp(this.mouse, 1 - Math.exp(-dt * 6));

    // Корпус: дыхание, наклон при слушании, поворот при ехидстве, прыжки от радости, тряска от злости.
    const breathe = Math.sin(t * 2.2) * 0.02;
    const hop = k.happy * Math.abs(Math.sin(t * 6)) * 0.35;
    const talkBob = this.level * 0.06 * Math.abs(Math.sin(t * 14));
    const shake = k.angry * 0.025;
    const pop = 1 + 0.12 * this.pop * Math.cos(t * 28);
    this.root.position.set((Math.random() - 0.5) * shake * 2, hop, 0);
    this.root.rotation.y = this.gaze.x * 0.35 + k.sassy * 0.45 + Math.sin(t * 0.7) * 0.05;
    this.body.rotation.x = k.lean * 0.12 + this.gaze.y * 0.08;
    this.body.rotation.z = k.lean * 0.08 + k.sassy * -0.06 + Math.sin(t * 1.3) * 0.015;
    const squash = k.happy * (0.06 - Math.abs(Math.sin(t * 6)) * 0.1);
    this.body.scale.set(pop * (1 + squash * 0.5), pop * (1 + breathe - squash + talkBob), pop * (1 + squash * 0.5));
    this.body.position.y = 0.38 + talkBob * 0.4;
    for (const [i, leg] of this.legs.entries()) leg.scale.y = 1 - k.happy * 0.12 * Math.abs(Math.sin(t * 6 + i));

    // Ручки: висят, при речи жестикулируют, от радости машут, от злости сжаты и трясутся.
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const wave = k.happy * (0.9 + Math.sin(t * 12 + i) * 0.4);
      const talk = this.level * 0.5 * Math.sin(t * 9 + i * 2);
      const mad = k.angry * (0.25 + Math.sin(t * 40 + i) * 0.08);
      arm.rotation.z = side * (wave + talk * 0.6 + mad) + Math.sin(t * 2 + i) * 0.04;
      arm.rotation.x = -k.lean * 0.2;
    });

    // Моргание.
    let blink = 1;
    if (t > this.nextBlink) {
      const b = (t - this.nextBlink) / 0.15;
      blink = b < 1 ? Math.max(0.08, Math.abs(1 - 2 * b)) : 1;
      if (b >= 1) this.nextBlink = t + 2.5 + Math.random() * 3;
    }

    // Глаза: смотрят за мышкой, щурятся от радости, косятся при ехидстве, злобно наклоняются.
    this.eyes.forEach((eye, i) => {
      const side = i === 0 ? -1 : 1;
      eye.position.x = side * 0.43 + this.gaze.x * 0.07;
      eye.position.y = 0.01 - this.gaze.y * 0.05 + k.lean * 0.03;
      const sy = blink * (1 - k.happy * 0.6) * (1 - k.sassy * (i === 0 ? 0.6 : -0.1)) * (1 - k.angry * 0.25);
      eye.scale.set(1 + k.lean * 0.15, Math.max(0.06, sy) * (1 + k.lean * 0.12), 1);
      eye.rotation.z = side * -k.angry * 0.55;
    });

    // Рот: открывается в такт голосу, ухмыляется при ехидстве, шире от радости.
    const open = this.activity === 'speaking' ? this.level : 0;
    this.mouth.scale.set(1 + k.happy * 0.8 + k.angry * 0.4, 1 + open * 5 + k.angry * 0.8, 1);
    this.mouth.position.x = -0.01 + k.sassy * 0.08;
    this.mouth.rotation.z = k.sassy * 0.25;

    this.updateSteam(dt, k.angry > 0.5);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.frame());
  }

  updateSteam(dt, active) {
    if (active && Math.random() < dt * 10) {
      const puff = new THREE.Mesh(this.steamGeo, this.steamMat.clone());
      puff.position.set((Math.random() - 0.5) * 1.4, 1.7 + this.root.position.y, (Math.random() - 0.5) * 0.6);
      puff.userData = { life: 0, max: 1 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.3 };
      this.scene.add(puff);
      this.steam.push(puff);
    }
    this.steam = this.steam.filter((p) => {
      const d = p.userData;
      d.life += dt;
      const k = d.life / d.max;
      p.position.y += dt * 0.9;
      p.position.x += d.vx * dt;
      p.scale.setScalar(0.6 + k * 1.8);
      p.material.opacity = 0.75 * (1 - k);
      if (k >= 1) {
        this.scene.remove(p);
        p.material.dispose();
        return false;
      }
      return true;
    });
  }
}
