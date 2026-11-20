// 3D-світ гри «Папірланд-Експрес»: зошит у клітинку, залізниця-маркер, станції-уроки і поїзд.
// Тут тільки графіка. Що відкривати на станції, вирішує game/main.js.
import * as THREE from 'three';

const PER_ROW = 6;   // станцій в одному ряду змійки
const STEP_X = 8;    // відстань між станціями в ряду
const STEP_Z = 10;   // відстань між рядами

// Кольори беремо з токенів css/style.css, тому темна тема працює сама
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const get = (name) => css.getPropertyValue(name).trim();
  return {
    paper: get('--paper'), grid: get('--grid'), ink: get('--ink'), ink3: get('--ink-3'),
    rule: get('--rule'), card: get('--card'), top: get('--card-top'), marker: get('--marker'),
    der: get('--der'), das: get('--das'), die: get('--die'), pl: get('--pl'),
    font: get('--font-cond') || 'sans-serif',
  };
}

// three.js не розуміє rgba(...) з прозорістю, тож прозорість відкидаємо
const col = (c) => new THREE.Color(c.startsWith('rgba') ? c.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)') : c);

// Позиція станції i на змійці (ряди йдуть то вправо, то вліво)
function stationPos(i) {
  const row = Math.floor(i / PER_ROW);
  const c = i % PER_ROW;
  const col_ = row % 2 ? PER_ROW - 1 - c : c;
  const wobble = Math.sin(i * 1.7) * 1.2; // трохи кривизни, щоб не було як по лінійці
  return new THREE.Vector3((col_ - (PER_ROW - 1) / 2) * STEP_X, 0, row * STEP_Z + wobble);
}

// Фон-зошит: папір і блакитна клітинка
function paperTexture(t) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = t.paper;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = t.grid;
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200, 200);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Табличка над станцією, як табло вокзалу: номер і назва німецькою
function signSprite(t, num, text, dim) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = t.card;
  g.strokeStyle = dim ? t.rule : t.ink;
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(6, 6, 500, 148, 18);
  g.fill();
  g.stroke();
  g.fillStyle = dim ? t.ink3 : t.top;
  g.font = `700 92px ${t.font}`;
  g.textBaseline = 'middle';
  g.fillText(String(num), 26, 84);
  g.fillStyle = dim ? t.ink3 : t.ink;
  g.font = `600 44px ${t.font}`;
  let s = text;
  while (g.measureText(s).width > 340 && s.length > 4) s = s.slice(0, -2);
  if (s !== text) s += '…';
  g.fillText(s, 150, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(4.4, 1.375, 1);
  return sp;
}

// Смуга вздовж кривої (маркер під колією, рейки)
function strip(points, offset, width, y, material) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[Math.min(i + 1, points.length - 1)];
    const r = points[Math.max(i - 1, 0)];
    const dx = q.x - r.x;
    const dz = q.z - r.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    for (const side of [-1, 1]) {
      const o = offset + (side * width) / 2;
      pos.push(p.x + nx * o, y, p.z + nz * o);
    }
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));

export function createWorld(canvas, { onPick }) {
  const t = tokens();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = col(t.paper);

  // Ізометрична камера, як у настільній грі
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const CAM_OFFSET = new THREE.Vector3(22, 26, 22);
  let zoom = 1;

  scene.add(new THREE.HemisphereLight(0xffffff, col(t.rule), 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 120 });
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ map: paperTexture(t) }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let curve = null;
  let count = 0;
  const stationGroups = [];
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);

  // ---------- Поїзд: локомотив і вагони кольорів роду der / das / die ----------
  const train = [];
  function makeCar(color, loco) {
    const g = new THREE.Group();
    const body = box(1.9, loco ? 0.9 : 1.1, 1.1, color);
    body.position.y = loco ? 0.75 : 0.85;
    g.add(body);
    if (loco) {
      const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 14), new THREE.MeshLambertMaterial({ color }));
      boiler.rotation.z = Math.PI / 2;
      boiler.position.set(0.45, 1.35, 0);
      const cab = box(0.8, 0.9, 1.1, col(t.ink));
      cab.position.set(-0.55, 1.5, 0);
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 10), new THREE.MeshLambertMaterial({ color: col(t.ink) }));
      chimney.position.set(0.8, 2.0, 0);
      g.add(boiler, cab, chimney);
    } else {
      const roof = box(2.0, 0.12, 1.2, col(t.card));
      roof.position.y = 1.46;
      g.add(roof);
    }
    for (const x of [-0.6, 0.6]) {
      for (const z of [-0.56, 0.56]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), new THREE.MeshLambertMaterial({ color: col(t.ink) }));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.3, z);
        g.add(w);
      }
    }
    g.traverse((m) => { m.castShadow = true; });
    scene.add(g);
    train.push(g);
  }
  makeCar(col(t.der), true);
  makeCar(col(t.das), false);
  makeCar(col(t.die), false);

  // Дим з труби: кілька кульок, які піднімаються і тануть
  const puffs = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    m.userData.life = 0;
    scene.add(m);
    return m;
  });
  let puffTimer = 0;

  // Кільце-підсвітка поточної станції (жовтий маркер)
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.8, 40), new THREE.MeshBasicMaterial({ color: col(t.marker), transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  scene.add(ring);

  const camTarget = new THREE.Vector3(); // куди дивиться камера
  let pos = 0;    // де поїзд (в «станціях», 0…count-1)
  let target = 0; // куди їде
  let current = 0;

  // ---------- Станції ----------
  function buildStation(s, i) {
    const g = new THREE.Group();
    g.position.copy(stationPos(i));
    g.userData.index = i;
    // будівля стоїть збоку від колії, з боку «від глядача»
    const side = new THREE.Group();
    side.position.set(0, 0, -2.4);
    g.add(side);

    const platform = box(4, 0.25, 1.4, col(t.rule));
    platform.position.set(0, 0.12, 1);
    side.add(platform);

    if (s.state === 'planned') {
      // Будується: каркас з риштувань
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.6, 1.8, 1.8)),
        new THREE.LineBasicMaterial({ color: col(t.ink3) }),
      );
      frame.position.y = 1.15;
      const crane = box(0.15, 3.2, 0.15, col(t.pl));
      crane.position.set(1.6, 1.6, -0.5);
      const arm = box(2.2, 0.12, 0.12, col(t.pl));
      arm.position.set(0.8, 3.15, -0.5);
      side.add(frame, crane, arm);
    } else {
      const locked = s.state === 'locked';
      const wall = box(2.6, 1.6, 1.8, col(locked ? t.rule : t.card));
      wall.position.y = 1.05;
      const roofColor = locked ? t.ink3 : s.state === 'done' ? t.das : t.top;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.45, 1.1, 4, 1), new THREE.MeshLambertMaterial({ color: col(roofColor) }));
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1.35, 1, 0.95);
      roof.position.y = 2.4;
      const door = box(0.6, 0.9, 0.05, col(t.ink));
      door.position.set(0, 0.7, 0.92);
      side.add(wall, roof, door);
      // Вікна світяться маркером, коли урок відкритий
      for (const x of [-0.85, 0.85]) {
        const win = box(0.45, 0.4, 0.05, col(locked ? t.ink3 : t.marker));
        win.position.set(x, 1.25, 0.92);
        side.add(win);
      }
      // Дерева = вивчені слова (до 6 штук навколо станції)
      const trees = s.total ? Math.round((s.learned / s.total) * 6) : 0;
      for (let k = 0; k < trees; k++) {
        const a = (k / 6) * Math.PI + Math.PI * 0.05;
        const tree = new THREE.Group();
        const trunk = box(0.15, 0.4, 0.15, col(t.pl));
        trunk.position.y = 0.2;
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 7), new THREE.MeshLambertMaterial({ color: col(t.das) }));
        crown.position.y = 0.9;
        tree.add(trunk, crown);
        tree.position.set(Math.cos(a) * 2.6, 0, -Math.sin(a) * 1.4 - 0.4);
        side.add(tree);
      }
      // Прапорець на даху, якщо урок пройдено
      if (s.state === 'done') {
        const pole = box(0.06, 1.1, 0.06, col(t.ink));
        pole.position.set(0.9, 3.0, 0);
        const flag = box(0.6, 0.35, 0.03, col(t.marker));
        flag.position.set(1.2, 3.35, 0);
        side.add(pole, flag);
      }
    }
    const sign = signSprite(t, s.num, s.titleDe, s.state === 'locked' || s.state === 'planned');
    sign.position.set(0, 4.3, -2.4);
    g.add(sign);

    // Невидима «коробка» для кліку: легше влучити пальцем на телефоні
    const hit = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4, 5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 2, -1);
    g.add(hit);

    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }

  function setStations(stations) {
    for (const g of stationGroups) scene.remove(g);
    stationGroups.length = 0;
    stations.forEach((s, i) => {
      const g = buildStation(s, i);
      stationGroups.push(g);
      scene.add(g);
    });
    if (count === stations.length) return;
    count = stations.length;

    // Колія через усі станції: широкий штрих маркера, шпали і дві рейки
    trackGroup.clear();
    curve = new THREE.CatmullRomCurve3(stations.map((_, i) => stationPos(i)), false, 'centripetal');
    const pts = curve.getPoints(count * 24);
    const markerMat = new THREE.MeshBasicMaterial({ color: col(t.marker), transparent: true, opacity: 0.75, depthWrite: false });
    trackGroup.add(strip(pts, 0, 2.4, 0.02, markerMat));
    const railMat = new THREE.MeshLambertMaterial({ color: col(t.ink) });
    trackGroup.add(strip(pts, -0.45, 0.1, 0.16, railMat), strip(pts, 0.45, 0.1, 0.16, railMat));
    const spaced = curve.getSpacedPoints(Math.round(curve.getLength() / 0.9));
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.1, 1.4), new THREE.MeshLambertMaterial({ color: col(t.pl) }), spaced.length);
    const m = new THREE.Object3D();
    spaced.forEach((p, i) => {
      const q = spaced[Math.min(i + 1, spaced.length - 1)];
      const r = spaced[Math.max(i - 1, 0)];
      m.position.set(p.x, 0.08, p.z);
      m.rotation.set(0, -Math.atan2(q.z - r.z, q.x - r.x), 0);
      m.updateMatrix();
      sleepers.setMatrixAt(i, m.matrix);
    });
    sleepers.receiveShadow = true;
    trackGroup.add(sleepers);
  }

  // Точка на колії: s у «станціях» (0 — перша станція)
  function railPoint(s) {
    const u = THREE.MathUtils.clamp(s / Math.max(count - 1, 1), 0, 1);
    return curve.getPoint(u);
  }

  function placeTrain() {
    if (!curve) return;
    // Вагони йдуть позаду локомотива; поза колією стоять на першій станції
    train.forEach((car, k) => {
      const s = pos - k * 0.3;
      const p = railPoint(s);
      const ahead = railPoint(s + 0.05);
      const back = railPoint(s - 0.05);
      car.position.set(p.x, 0.1, p.z);
      car.rotation.y = -Math.atan2(ahead.z - back.z, ahead.x - back.x);
    });
  }

  function moveTo(i) {
    target = THREE.MathUtils.clamp(i, 0, count - 1);
    current = target;
    ring.position.x = stationPos(current).x;
    ring.position.z = stationPos(current).z;
  }

  function jumpTo(i) {
    moveTo(i);
    pos = target;
    placeTrain();
    camTarget.copy(railPoint(pos)); // одразу показати поїзд, без під’їзду камери
  }

  // ---------- Клік по станції ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(stationGroups, true)[0];
    let o = hit && hit.object;
    while (o && o.userData.index === undefined) o = o.parent;
    if (o) onPick(o.userData.index);
  });
  // shortcut: масштаб лише коліщатком миші; щипок двома пальцями на телефоні не підтримується — додати, якщо буде потрібно
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.2);
    resize();
  }, { passive: false });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const view = (w < 600 ? 13 : 16) / zoom; // на телефоні трохи ближче
    const aspect = w / h;
    const lift = 0.3; // поїзд трохи вище центру, щоб його не закривала картка станції
    Object.assign(camera, { left: -view * aspect, right: view * aspect, top: view * (1 - lift), bottom: -view * (1 + lift) });
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Головний цикл ----------
  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const moving = Math.abs(target - pos) > 0.001;
    if (moving) {
      const dir = Math.sign(target - pos);
      const speed = Math.min(2.2, 0.6 + Math.abs(target - pos)); // далеко — швидше, біля станції гальмує
      pos += dir * Math.min(Math.abs(target - pos), speed * dt);
      placeTrain();
    }
    // Дим: частіше, коли поїзд їде
    puffTimer -= dt;
    if (puffTimer <= 0 && curve) {
      puffTimer = moving ? 0.12 : 0.9;
      const p = puffs.find((x) => x.userData.life <= 0);
      if (p) {
        const loco = train[0];
        p.position.copy(loco.localToWorld(new THREE.Vector3(0.8, 2.3, 0)));
        p.userData.life = 1;
      }
    }
    for (const p of puffs) {
      if (p.userData.life <= 0) continue;
      p.userData.life -= dt * 0.8;
      p.position.y += dt * 1.2;
      p.scale.setScalar(1 + (1 - p.userData.life) * 1.5);
      p.material.opacity = Math.max(0, p.userData.life * 0.7);
    }
    ring.material.opacity = 0.65 + Math.sin(performance.now() / 300) * 0.25;

    // Камера плавно стежить за поїздом
    if (curve) camTarget.lerp(railPoint(pos), 1 - Math.exp(-dt * 4));
    camera.position.copy(camTarget).add(CAM_OFFSET);
    camera.lookAt(camTarget);
    sun.position.copy(camTarget).add(new THREE.Vector3(12, 30, 8));
    sun.target.position.copy(camTarget);
    renderer.render(scene, camera);
  }
  frame();

  return {
    setStations,
    moveTo,
    jumpTo,
    resize,
    get current() { return current; },
    get arrived() { return Math.abs(target - pos) < 0.001; },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
