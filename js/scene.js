import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const INK       = 0x07080b;
const VERMILION = 0xe2452f;
const SPIRIT    = 0x7fe3d4;
const AMBER     = 0xf2a33c;
const BONE      = 0xece3d2;

const GATE_COUNT   = 34;
const GATE_SPACING = 4.4;
const CORRIDOR_END = -(GATE_COUNT - 1) * GATE_SPACING;

// guards against NaN: ScrollTrigger reports 0/0 progress while the page height is
// locked by the loader, and a single NaN would poison every camera transform downstream
const clamp  = (v, a = 0, b = 1) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a);
const lerp   = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
/** map v from [a,b] into 0..1, clamped */
const range  = (v, a, b) => clamp((v - a) / (b - a));

/* ───────────────────────── torii geometry ───────────────────────── */
function buildToriiGeometry() {
  const parts = [];
  const push = (geo, x, y, z, rz = 0) => {
    const m = new THREE.Matrix4().makeRotationZ(rz);
    m.setPosition(x, y, z);
    parts.push(geo.applyMatrix4(m));
  };

  // pillars (hashira) — slightly tapered, canted inward
  push(new THREE.CylinderGeometry(0.115, 0.155, 4.3, 12), -1.36, 0.15, 0,  0.012);
  push(new THREE.CylinderGeometry(0.115, 0.155, 4.3, 12),  1.36, 0.15, 0, -0.012);
  // kasagi — the crowning lintel
  push(new THREE.BoxGeometry(3.62, 0.19, 0.36), 0, 2.36, 0);
  // shimaki — beam beneath it
  push(new THREE.BoxGeometry(3.24, 0.15, 0.29), 0, 2.16, 0);
  // nuki — the tie beam
  push(new THREE.BoxGeometry(3.02, 0.17, 0.25), 0, 1.52, 0);
  // gakuzuka — the little strut between them
  push(new THREE.BoxGeometry(0.17, 0.52, 0.2), 0, 1.86, 0);
  // stone footings
  push(new THREE.CylinderGeometry(0.23, 0.26, 0.3, 10), -1.36, -1.86, 0);
  push(new THREE.CylinderGeometry(0.23, 0.26, 0.3, 10),  1.36, -1.86, 0);

  return mergeGeometries(parts, false);
}

/* ───────────────────────── embers ───────────────────────── */
function buildEmbers(count = 2600) {
  const pos  = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const size = new Float32Array(count);
  const spd  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = 1.5 + Math.pow(Math.random(), 0.6) * 13;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3]     = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 26;
    pos[i * 3 + 2] = 22 + Math.random() * (CORRIDOR_END - 40 - 22);
    seed[i] = Math.random();
    size[i] = 1.0 + Math.random() * 3.0;
    spd[i]  = 0.25 + Math.random() * 0.85;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSpd',  new THREE.BufferAttribute(spd, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:   { value: 0 },
      uPix:    { value: 1 },
      uAmber:  { value: new THREE.Color(AMBER) },
      uSpirit: { value: new THREE.Color(SPIRIT) },
    },
    vertexShader: /* glsl */`
      attribute float aSeed, aSize, aSpd;
      uniform float uTime, uPix;
      varying float vSeed, vAlpha;
      void main(){
        vSeed = aSeed;
        vec3 p = position;
        // slow rise, wrapped so the field never empties
        p.y = mod(p.y + uTime * aSpd * 0.55, 26.0) - 4.0;
        p.x += sin(uTime * 0.28 + aSeed * 6.2831) * 0.75;
        p.z += cos(uTime * 0.21 + aSeed * 6.2831) * 0.55;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vAlpha = smoothstep(150.0, 12.0, d) * smoothstep(0.4, 3.0, d);
        gl_PointSize = aSize * uPix * (60.0 / max(d, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uAmber, uSpirit;
      varying float vSeed, vAlpha;
      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uAmber, uSpirit, smoothstep(0.45, 0.9, vSeed));
        gl_FragColor = vec4(col, core * core * vAlpha * 0.5);
      }`,
  });

  return { points: new THREE.Points(geo, mat), mat };
}

/* ───────────────────────── toon ramp ───────────────────────── */
function toonRamp() {
  const tex = new THREE.DataTexture(
    new Uint8Array([40, 40, 48, 255, 128, 122, 116, 255, 255, 255, 255, 255]),
    3, 1, THREE.RGBAFormat
  );
  tex.needsUpdate = true;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  return tex;
}

/* ═══════════════════════════════════════════════════════════════ */
export function createScene(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0d16, 0.019);

  // a vertical indigo wash so the corridor silhouettes against night rather than void
  const sky = document.createElement('canvas');
  sky.width = 2; sky.height = 256;
  const sctx = sky.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#0e1730');
  grad.addColorStop(0.45, '#0a0f1e');
  grad.addColorStop(1.00, '#05070c');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
  camera.position.set(0, 0.25, 6.6);

  /* ── lights ── */
  scene.add(new THREE.AmbientLight(0x35406b, 1.1));
  const key = new THREE.DirectionalLight(SPIRIT, 1.05);
  key.position.set(-4, 7, 5);
  scene.add(key);
  // cold moon behind the corridor, so every gate keeps a rim of light
  const moon = new THREE.DirectionalLight(0xa8c4ff, 0.42);
  moon.position.set(3, 9, -18);
  scene.add(moon);
  const warm = new THREE.PointLight(AMBER, 11, 22, 2);
  warm.position.set(0, 1.4, 2);
  scene.add(warm);
  const rim = new THREE.PointLight(VERMILION, 7, 20, 2);
  rim.position.set(2.6, -0.8, -3);
  scene.add(rim);

  /* ── ground ── */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x080e19, roughness: 0.62, metalness: 0.12 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);

  /* ── torii corridor ── */
  const toriiGeo = buildToriiGeometry();
  const toriiMat = new THREE.MeshStandardMaterial({
    color: 0xb03a26, roughness: 0.64, metalness: 0.08,
    emissive: new THREE.Color(VERMILION), emissiveIntensity: 0.1,
  });
  const gates = new THREE.InstancedMesh(toriiGeo, toriiMat, GATE_COUNT);
  const dummy = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  for (let i = 0; i < GATE_COUNT; i++) {
    const wob = (Math.sin(i * 2.7) + Math.cos(i * 1.31)) * 0.5;
    v.set(wob * 0.11, -0.02 + Math.sin(i * 0.9) * 0.05, -i * GATE_SPACING);
    q.setFromEuler(new THREE.Euler(0, wob * 0.012, wob * 0.008));
    const sc = 1 + Math.sin(i * 1.7) * 0.035;
    s.set(sc, sc, sc);
    gates.setMatrixAt(i, dummy.compose(v, q, s));
  }
  gates.instanceMatrix.needsUpdate = true;
  scene.add(gates);

  /* ── lanterns strung between the gates ── */
  const lanternGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.13, 8);
  const lanternMat = new THREE.MeshBasicMaterial({ color: AMBER });
  const LANTERNS = (GATE_COUNT - 1) * 2;
  const lanterns = new THREE.InstancedMesh(lanternGeo, lanternMat, LANTERNS);
  const lanternPhase = [];
  let li = 0;
  for (let i = 0; i < GATE_COUNT - 1; i++) {
    for (const side of [-1, 1]) {
      v.set(side * (1.05 + Math.sin(i * 1.3) * 0.1), 1.02 + Math.sin(i * 2.1) * 0.12, -i * GATE_SPACING - GATE_SPACING / 2);
      q.identity(); s.set(1, 1, 1);
      lanterns.setMatrixAt(li, dummy.compose(v, q, s));
      lanternPhase.push({ base: v.clone(), ph: Math.random() * 6.28 });
      li++;
    }
  }
  lanterns.instanceMatrix.needsUpdate = true;
  scene.add(lanterns);

  /* ── embers ── */
  const embers = buildEmbers(reducedMotion ? 900 : 2600);
  scene.add(embers.points);

  /* ── the mask (loaded) ── */
  const maskPivot = new THREE.Group();
  scene.add(maskPivot);
  let maskReady = false;

  function mountMask(geometry, map) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const size = new THREE.Vector3(); bb.getSize(size);
    const center = new THREE.Vector3(); bb.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    const k = 1.5 / Math.max(size.x, size.y, size.z);
    geometry.scale(k, k, k);
    // the scan's face points down -Z; swing it round to meet the camera
    geometry.rotateY(Math.PI);

    if (map) map.colorSpace = THREE.SRGBColorSpace;

    // cel-shade the baked scan: keep its painted vermilion + kintsugi texture, but quantise
    // the lighting through a 3-step ramp so it reads hand-drawn rather than photoreal
    const face = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({
      color: map ? 0xffffff : BONE, map: map || null,
      gradientMap: toonRamp(), side: THREE.DoubleSide,
      emissive: new THREE.Color(VERMILION), emissiveIntensity: 0.04,
    }));

    // spirit halo
    const halo = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: VERMILION, side: THREE.BackSide, transparent: true,
      opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.08);

    maskPivot.add(halo, face);
    maskReady = true;
  }

  /* ── postprocessing ── */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.42, 0.74);
  if (!reducedMotion) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ── state ── */
  let progress = 0, eased = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let W = 1, H = 1, pix = 1;

  function resize() {
    // a zero-sized viewport (minimised window, hidden pane) would give the camera a
    // NaN aspect and hand the bloom pass 0×0 render targets — clamp before anything sees it
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    pix = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pix);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(pix);
    composer.setSize(W, H);
    bloom.resolution.set(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    embers.mat.uniforms.uPix.value = pix;
  }

  const lookAt = new THREE.Vector3();

  function render(t) {
    // ease the scroll value so a flicked wheel never snaps the camera
    eased += (progress - eased) * 0.085;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    const p = eased;

    // ── camera: hold in the hero, then fly the corridor ──
    const flight = smooth(range(p, 0.06, 0.88));
    const z = lerp(6.6, CORRIDOR_END + 14, flight);
    camera.position.z = z;
    camera.position.x = pointer.x * 0.55 + Math.sin(t * 0.13) * 0.06;
    camera.position.y = lerp(0.25, 0.72, flight) + pointer.y * -0.28 + Math.sin(t * 0.19) * 0.03;
    lookAt.set(pointer.x * 0.3, 0.18 + pointer.y * -0.1, z - 8);
    camera.lookAt(lookAt);

    // ── mask: leads the camera down the line, then dissolves away ──
    if (maskReady) {
      const lead = lerp(4.8, 9.5, flight);
      maskPivot.position.z = z - lead;
      maskPivot.position.x = Math.sin(t * 0.35) * 0.22 + pointer.x * 0.35;
      maskPivot.position.y = 0.3 + Math.sin(t * 0.55) * 0.09 + flight * 0.35;
      maskPivot.rotation.y = Math.sin(t * 0.28) * 0.28 + p * Math.PI * 1.6;
      maskPivot.rotation.z = Math.sin(t * 0.22) * 0.05;
      maskPivot.rotation.x = -0.05 + Math.sin(t * 0.31) * 0.04;
      const sc = lerp(1, 0.52, range(p, 0.1, 0.7));
      maskPivot.scale.setScalar(sc);
      maskPivot.visible = p < 0.93;
    }

    // ── lanterns sway ──
    for (let i = 0; i < LANTERNS; i++) {
      const { base, ph } = lanternPhase[i];
      v.set(base.x + Math.sin(t * 0.6 + ph) * 0.05, base.y + Math.sin(t * 0.9 + ph) * 0.025, base.z);
      q.setFromEuler(new THREE.Euler(0, 0, Math.sin(t * 0.6 + ph) * 0.09));
      s.set(1, 1, 1);
      lanterns.setMatrixAt(i, dummy.compose(v, q, s));
    }
    lanterns.instanceMatrix.needsUpdate = true;

    // ── atmosphere thickens as you go deeper ──
    scene.fog.density = lerp(0.019, 0.046, flight);
    warm.position.set(camera.position.x, 1.5, camera.position.z - 3);
    rim.position.set(camera.position.x + 2.4, -0.7, camera.position.z - 6);
    bloom.strength = lerp(0.48, 0.86, flight);

    embers.mat.uniforms.uTime.value = t;

    composer.render();
  }

  /* ── public ── */
  return {
    resize,
    render,
    setProgress: p => { progress = clamp(p) },
    /** snap eased value — used once after the loader so we don't animate in from 0 */
    syncProgress: p => { progress = eased = clamp(p) },
    setPointer: (nx, ny) => { pointer.tx = nx; pointer.ty = ny },
    load(manager) {
      return new Promise(resolve => {
        const loader = new GLTFLoader(manager);
        loader.load(
          'assets/3d/mask.glb',
          gltf => {
            let geo = null, map = null;
            gltf.scene.traverse(o => {
              if (o.isMesh && !geo) { geo = o.geometry.clone(); map = o.material?.map || null; }
            });
            mountMask(geo || new THREE.IcosahedronGeometry(1, 2), map);
            resolve();
          },
          undefined,
          () => { // the corridor is the star; a missing mesh must not kill the page
            console.warn('[yurei] mask.glb unavailable — falling back to a primitive');
            mountMask(new THREE.IcosahedronGeometry(1, 3), null);
            resolve();
          }
        );
      });
    },
  };
}
