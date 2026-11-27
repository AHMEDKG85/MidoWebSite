import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

type FrameFinishKey = 'tortoise' | 'obsidian' | 'emerald';

interface FinishPreset {
  key: FrameFinishKey;
  label: string;
  swatch: string;
  frameColor: number;
  metalColor: number;
  roughness: number;
}

const FINISH_PRESETS: FinishPreset[] = [
  {
    key: 'tortoise',
    label: 'سلحفاة وذهبي',
    swatch: '#7A4E2D',
    frameColor: 0x5c361d,
    metalColor: 0xc9a461,
    roughness: 0.22,
  },
  {
    key: 'obsidian',
    label: 'أسود وفضي',
    swatch: '#1F2429',
    frameColor: 0x1b1d20,
    metalColor: 0xd0d4da,
    roughness: 0.42,
  },
  {
    key: 'emerald',
    label: 'زمردي شفاف',
    swatch: '#355E3B',
    frameColor: 0x2f5a38,
    metalColor: 0xc9a461,
    roughness: 0.14,
  },
];

interface HeroKeyframe {
  t: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  camX: number;
  camY: number;
  camZoom: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  explode: number;
}

const CAMERA_KEYFRAMES: HeroKeyframe[] = [
  {
    t: 0.0,
    rotX: 0.1,
    rotY: -0.28,
    rotZ: -0.03,
    camX: 0.15,
    camY: 0.3,
    camZoom: 1.0,
    lookX: 0,
    lookY: 0.05,
    lookZ: 0,
    explode: 0,
  },
  {
    t: 0.36,
    rotX: 0.2,
    rotY: 0.38,
    rotZ: 0.03,
    camX: -0.32,
    camY: 0.22,
    camZoom: 0.74,
    lookX: 0.08,
    lookY: 0.08,
    lookZ: 0.04,
    explode: 0.16,
  },
  {
    t: 0.72,
    rotX: 0.08,
    rotY: 1.18,
    rotZ: -0.02,
    camX: 0.46,
    camY: 0.36,
    camZoom: 0.86,
    lookX: -0.1,
    lookY: 0.05,
    lookZ: -0.25,
    explode: 0.06,
  },
  {
    t: 1.0,
    rotX: 0.13,
    rotY: 1.78,
    rotZ: 0.0,
    camX: 0.08,
    camY: 0.28,
    camZoom: 0.96,
    lookX: 0,
    lookY: 0.05,
    lookZ: 0,
    explode: 0,
  },
];

function sampleKeyframes(p: number): HeroKeyframe {
  const clamped = THREE.MathUtils.clamp(p, 0, 1);
  for (let i = 0; i < CAMERA_KEYFRAMES.length - 1; i += 1) {
    const a = CAMERA_KEYFRAMES[i];
    const b = CAMERA_KEYFRAMES[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const local = (clamped - a.t) / Math.max(0.0001, b.t - a.t);
      const s = local * local * (3 - 2 * local);
      return {
        t: clamped,
        rotX: THREE.MathUtils.lerp(a.rotX, b.rotX, s),
        rotY: THREE.MathUtils.lerp(a.rotY, b.rotY, s),
        rotZ: THREE.MathUtils.lerp(a.rotZ, b.rotZ, s),
        camX: THREE.MathUtils.lerp(a.camX, b.camX, s),
        camY: THREE.MathUtils.lerp(a.camY, b.camY, s),
        camZoom: THREE.MathUtils.lerp(a.camZoom, b.camZoom, s),
        lookX: THREE.MathUtils.lerp(a.lookX, b.lookX, s),
        lookY: THREE.MathUtils.lerp(a.lookY, b.lookY, s),
        lookZ: THREE.MathUtils.lerp(a.lookZ, b.lookZ, s),
        explode: THREE.MathUtils.lerp(a.explode, b.explode, s),
      };
    }
  }
  return CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1];
}

function createTortoiseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#4c2b16';
    ctx.fillRect(0, 0, 256, 256);
    const spots = [
      { x: 30, y: 40, r: 34, c: '#8f592e' },
      { x: 110, y: 80, r: 44, c: '#261409' },
      { x: 190, y: 50, r: 30, c: '#a86f38' },
      { x: 70, y: 170, r: 38, c: '#9e622f' },
      { x: 165, y: 185, r: 46, c: '#1f1008' },
      { x: 225, y: 135, r: 32, c: '#7a461f' },
    ];
    for (const s of spots) {
      const grad = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.r);
      grad.addColorStop(0, s.c);
      grad.addColorStop(1, 'rgba(76, 43, 22, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    grad.addColorStop(0, 'rgba(20, 20, 19, 0.28)');
    grad.addColorStop(0.5, 'rgba(20, 20, 19, 0.10)');
    grad.addColorStop(1, 'rgba(20, 20, 19, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPantoRimShape(outerW: number, outerH: number): THREE.Shape {
  const shape = new THREE.Shape();
  const r = outerW * 0.48;
  shape.moveTo(-outerW, outerH * 0.25);
  shape.bezierCurveTo(-outerW, outerH, outerW, outerH, outerW, outerH * 0.25);
  shape.bezierCurveTo(outerW * 1.02, -outerH * 0.95, r * 0.85, -outerH, 0, -outerH);
  shape.bezierCurveTo(-r * 0.85, -outerH, -outerW * 1.02, -outerH * 0.95, -outerW, outerH * 0.25);

  const hole = new THREE.Path();
  const iw = outerW * 0.83;
  const ih = outerH * 0.82;
  hole.moveTo(-iw, ih * 0.24);
  hole.bezierCurveTo(-iw, ih, iw, ih, iw, ih * 0.24);
  hole.bezierCurveTo(iw * 1.01, -ih * 0.92, iw * 0.4, -ih, 0, -ih);
  hole.bezierCurveTo(-iw * 0.4, -ih, -iw * 1.01, -ih * 0.92, -iw, ih * 0.24);
  shape.holes.push(hole);
  return shape;
}

function createLensShape(w: number, h: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-w, h * 0.24);
  shape.bezierCurveTo(-w, h, w, h, w, h * 0.24);
  shape.bezierCurveTo(w * 1.01, -h * 0.92, w * 0.4, -h, 0, -h);
  shape.bezierCurveTo(-w * 0.4, -h, -w * 1.01, -h * 0.92, -w, h * 0.24);
  return shape;
}

interface GlassesHero3DProps {
  scrollProgress?: number;
  heroModelUrl?: string;
}

export function GlassesHero3D({ scrollProgress, heroModelUrl }: GlassesHero3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activeFinish, setActiveFinish] = useState<FrameFinishKey>('tortoise');
  const [dockOpen, setDockOpen] = useState(true);
  const [contextLost, setContextLost] = useState(false);

  const finishRef = useRef<FrameFinishKey>('tortoise');
  const scrollProgressRef = useRef<number | undefined>(scrollProgress);
  const applyFinishRef = useRef<((preset: FinishPreset) => void) | null>(null);
  const resetPoseRef = useRef<(() => void) | null>(null);
  const syncScrollRef = useRef<(() => void) | null>(null);
  const loadModelRef = useRef<((url: string) => void) | null>(null);

  useEffect(() => {
    scrollProgressRef.current = scrollProgress;
    syncScrollRef.current?.();
  }, [scrollProgress]);

  useEffect(() => {
    finishRef.current = activeFinish;
    const found = FINISH_PRESETS.find((f) => f.key === activeFinish);
    if (found && applyFinishRef.current) {
      applyFinishRef.current(found);
    }
  }, [activeFinish]);

  useEffect(() => {
    if (loadModelRef.current) {
      loadModelRef.current(heroModelUrl || '');
    }
  }, [heroModelUrl]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f1ea);
    scene.fog = new THREE.FogExp2(0xf4f1ea, 0.032);

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 60);
    const getBaseDist = (aspect: number) =>
      aspect < 1.15 ? 5.4 / Math.max(0.68, aspect * 0.92) : 5.2;

    let currentBaseDist = getBaseDist(width / height);
    camera.position.set(0.15, 0.3, currentBaseDist);
    camera.lookAt(0, 0.05, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvasEl = renderer.domElement;
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.display = 'block';
    canvasEl.setAttribute('data-testid', 'hero-3d-canvas');
    container.innerHTML = '';
    container.appendChild(canvasEl);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvasEl.addEventListener('webglcontextlost', handleContextLost);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemiLight = new THREE.HemisphereLight(0xeaf2ff, 0xd8cbb8, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff3e0, 2.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -3.5;
    keyLight.shadow.camera.right = 3.5;
    keyLight.shadow.camera.top = 3.5;
    keyLight.shadow.camera.bottom = -3.5;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdceeff, 1.1);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    const tortoiseTex = createTortoiseTexture();
    tortoiseTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tortoiseTex,
      roughness: 0.22,
      metalness: 0.05,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    });

    const metalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc9a461,
      metalness: 0.92,
      roughness: 0.2,
      clearcoat: 0.3,
    });

    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff,
      metalness: 0.02,
      roughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.86,
      transparent: true,
      opacity: isSoftwareGl ? 0.38 : 1,
      ior: 1.56,
      thickness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      iridescence: isSoftwareGl ? 0 : 0.45,
      iridescenceIOR: 1.33,
      depthWrite: false,
    });

    const glassesRoot = new THREE.Group();
    const proceduralGroup = new THREE.Group();
    const customModelGroup = new THREE.Group();
    customModelGroup.visible = false;

    const frontChassis = new THREE.Group();
    const lensAssembly = new THREE.Group();
    proceduralGroup.add(frontChassis);
    proceduralGroup.add(lensAssembly);
    glassesRoot.add(proceduralGroup);
    glassesRoot.add(customModelGroup);

    const rimExtrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.09,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.024,
      bevelThickness: 0.024,
      curveSegments: 28,
    };

    const rimShape = createPantoRimShape(0.62, 0.54);
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, rimExtrudeSettings);
    rimGeo.center();

    const leftRim = new THREE.Mesh(rimGeo, frameMaterial);
    leftRim.position.set(-0.78, 0, 0);
    leftRim.castShadow = !isSoftwareGl;
    frontChassis.add(leftRim);

    const rightRim = new THREE.Mesh(rimGeo, frameMaterial);
    rightRim.position.set(0.78, 0, 0);
    rightRim.castShadow = !isSoftwareGl;
    frontChassis.add(rightRim);

    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 0.1, 0.01),
      new THREE.Vector3(-0.08, 0.16, 0.04),
      new THREE.Vector3(0.08, 0.16, 0.04),
      new THREE.Vector3(0.22, 0.1, 0.01),
    ]);
    const bridgeGeo = new THREE.TubeGeometry(bridgeCurve, 16, 0.046, 12, false);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, frameMaterial);
    bridgeMesh.castShadow = !isSoftwareGl;
    frontChassis.add(bridgeMesh);

    const padGeo = new THREE.CapsuleGeometry(0.028, 0.07, 4, 8);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0xeae6df,
      roughness: 0.35,
      transparent: true,
      opacity: 0.85,
    });
    const noseArmGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8);
    for (const sign of [-1, 1]) {
      const arm = new THREE.Mesh(noseArmGeo, metalMaterial);
      arm.position.set(sign * 0.24, -0.04, -0.09);
      arm.rotation.z = sign * 0.4;
      arm.rotation.x = 0.35;
      frontChassis.add(arm);

      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(sign * 0.19, -0.11, -0.15);
      pad.rotation.z = sign * -0.25;
      frontChassis.add(pad);
    }

    const endPieceGeo = new THREE.BoxGeometry(0.18, 0.11, 0.09);
    const pinGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.11, 10);
    pinGeo.rotateX(Math.PI / 2);

    for (const sign of [-1, 1]) {
      const lug = new THREE.Mesh(endPieceGeo, metalMaterial);
      lug.position.set(sign * 1.41, 0.17, -0.02);
      lug.castShadow = !isSoftwareGl;
      frontChassis.add(lug);

      const pin = new THREE.Mesh(pinGeo, metalMaterial);
      pin.position.set(sign * 1.38, 0.17, 0.02);
      frontChassis.add(pin);
    }

    const templeParts: THREE.Group[] = [];
    for (const sign of [-1, 1]) {
      const templeGroup = new THREE.Group();
      templeGroup.position.set(sign * 1.46, 0.17, -0.05);

      const metalStemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(sign * 0.03, 0, -0.95),
        new THREE.Vector3(sign * 0.01, -0.03, -1.75),
      ]);
      const stemGeo = new THREE.TubeGeometry(metalStemCurve, 20, 0.026, 10, false);
      const stemMesh = new THREE.Mesh(stemGeo, metalMaterial);
      stemMesh.castShadow = !isSoftwareGl;
      templeGroup.add(stemMesh);

      const tipCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sign * 0.01, -0.03, -1.72),
        new THREE.Vector3(0, -0.07, -2.18),
        new THREE.Vector3(-sign * 0.04, -0.32, -2.42),
      ]);
      const tipGeo = new THREE.TubeGeometry(tipCurve, 14, 0.04, 10, false);
      const tipMesh = new THREE.Mesh(tipGeo, frameMaterial);
      tipMesh.castShadow = !isSoftwareGl;
      templeGroup.add(tipMesh);

      proceduralGroup.add(templeGroup);
      templeParts.push(templeGroup);
    }

    const lensShape = createLensShape(0.49, 0.415);
    const lensGeo = new THREE.ExtrudeGeometry(lensShape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.005,
      bevelThickness: 0.005,
      curveSegments: 24,
    });
    lensGeo.center();

    const leftLens = new THREE.Mesh(lensGeo, lensMaterial);
    leftLens.position.set(-0.78, 0, 0);
    leftLens.renderOrder = 2;
    lensAssembly.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeo, lensMaterial);
    rightLens.position.set(0.78, 0, 0);
    rightLens.renderOrder = 2;
    lensAssembly.add(rightLens);

    glassesRoot.position.set(0, 0.14, 0.32);
    scene.add(glassesRoot);

    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 3.8),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(0, -1.02, -0.3);
    scene.add(shadowPlane);

    // Optional GLB/GLTF Model Loader
    const gltfLoader = new GLTFLoader();
    let loadedModelUrl = '';
    const loadExternalModel = (url: string) => {
      const cleanUrl = (url || '').trim();
      if (cleanUrl === loadedModelUrl) return;
      loadedModelUrl = cleanUrl;

      while (customModelGroup.children.length > 0) {
        customModelGroup.remove(customModelGroup.children[0]);
      }

      if (!cleanUrl) {
        proceduralGroup.visible = true;
        customModelGroup.visible = false;
        requestRender();
        return;
      }

      gltfLoader.load(
        cleanUrl,
        (gltf) => {
          if (loadedModelUrl !== cleanUrl) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const scale = 2.95 / maxDim;
          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));
          model.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = !isSoftwareGl;
              obj.receiveShadow = !isSoftwareGl;
            }
          });
          customModelGroup.add(model);
          customModelGroup.visible = true;
          proceduralGroup.visible = false;
          requestRender();
        },
        undefined,
        () => {
          proceduralGroup.visible = true;
          customModelGroup.visible = false;
          requestRender();
        },
      );
    };
    loadModelRef.current = loadExternalModel;

    // Damped Animation Targets
    let targetRotY = CAMERA_KEYFRAMES[0].rotY;
    let targetRotX = CAMERA_KEYFRAMES[0].rotX;
    let targetRotZ = CAMERA_KEYFRAMES[0].rotZ;
    let targetCamX = CAMERA_KEYFRAMES[0].camX;
    let targetCamY = CAMERA_KEYFRAMES[0].camY;
    let targetCamZ = currentBaseDist * CAMERA_KEYFRAMES[0].camZoom;
    let targetLookX = CAMERA_KEYFRAMES[0].lookX;
    let targetLookY = CAMERA_KEYFRAMES[0].lookY;
    let targetLookZ = CAMERA_KEYFRAMES[0].lookZ;
    let targetExplode = CAMERA_KEYFRAMES[0].explode;

    let pointerOffsetX = 0;
    let pointerOffsetY = 0;
    let manualSpinOffset = 0;
    let isDragging = false;
    let lastPointerX = 0;

    let curRotY = targetRotY;
    let curRotX = targetRotX;
    let curRotZ = targetRotZ;
    let curCamX = targetCamX;
    let curCamY = targetCamY;
    let curCamZ = targetCamZ;
    let curLookX = targetLookX;
    let curLookY = targetLookY;
    let curLookZ = targetLookZ;
    let curExplode = targetExplode;

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function updateTargetsFromScroll() {
      const p =
        typeof scrollProgressRef.current === 'number'
          ? scrollProgressRef.current
          : THREE.MathUtils.clamp(
              window.scrollY / Math.max(520, window.innerHeight * 1.15),
              0,
              1,
            );
      const kf = sampleKeyframes(p);

      targetRotY = kf.rotY + manualSpinOffset + pointerOffsetX * 0.28;
      targetRotX = kf.rotX + pointerOffsetY * 0.16;
      targetRotZ = kf.rotZ;
      targetCamX = kf.camX;
      targetCamY = kf.camY;
      targetCamZ = currentBaseDist * kf.camZoom;
      targetLookX = kf.lookX;
      targetLookY = kf.lookY;
      targetLookZ = kf.lookZ;
      targetExplode = kf.explode;
    }

    syncScrollRef.current = () => {
      updateTargetsFromScroll();
      requestRender();
    };

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 60);
        return;
      }
      gl.flush();
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 50);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const delta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const lambda = 7.5;
        curRotY = THREE.MathUtils.damp(curRotY, targetRotY, lambda, delta);
        curRotX = THREE.MathUtils.damp(curRotX, targetRotX, lambda, delta);
        curRotZ = THREE.MathUtils.damp(curRotZ, targetRotZ, lambda, delta);
        curCamX = THREE.MathUtils.damp(curCamX, targetCamX, lambda, delta);
        curCamY = THREE.MathUtils.damp(curCamY, targetCamY, lambda, delta);
        curCamZ = THREE.MathUtils.damp(curCamZ, targetCamZ, lambda, delta);
        curLookX = THREE.MathUtils.damp(curLookX, targetLookX, lambda, delta);
        curLookY = THREE.MathUtils.damp(curLookY, targetLookY, lambda, delta);
        curLookZ = THREE.MathUtils.damp(curLookZ, targetLookZ, lambda, delta);
        curExplode = THREE.MathUtils.damp(curExplode, targetExplode, lambda, delta);

        glassesRoot.rotation.set(curRotX, curRotY, curRotZ);
        lensAssembly.position.z = curExplode;
        templeParts[0].rotation.y = curExplode * 0.14;
        templeParts[1].rotation.y = -curExplode * 0.14;

        camera.position.set(curCamX, curCamY, curCamZ);
        camera.lookAt(curLookX, curLookY, curLookZ);

        renderer.render(scene, camera);

        const settled =
          Math.abs(curRotY - targetRotY) < 0.0015 &&
          Math.abs(curRotX - targetRotX) < 0.0015 &&
          Math.abs(curCamZ - targetCamZ) < 0.002 &&
          Math.abs(curExplode - targetExplode) < 0.0015;

        const done = () => {
          renderBusy = false;
          if (!settled || renderDirty) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    applyFinishRef.current = (preset: FinishPreset) => {
      if (preset.key === 'tortoise') {
        frameMaterial.map = tortoiseTex;
        frameMaterial.color.setHex(0xffffff);
      } else {
        frameMaterial.map = null;
        frameMaterial.color.setHex(preset.frameColor);
      }
      frameMaterial.roughness = preset.roughness;
      frameMaterial.needsUpdate = true;
      metalMaterial.color.setHex(preset.metalColor);
      metalMaterial.needsUpdate = true;
      requestRender();
    };

    resetPoseRef.current = () => {
      manualSpinOffset = 0;
      pointerOffsetX = 0;
      pointerOffsetY = 0;
      updateTargetsFromScroll();
      requestRender();
    };

    const onScroll = () => {
      if (typeof scrollProgressRef.current !== 'number') {
        updateTargetsFromScroll();
        requestRender();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastPointerX = e.clientX;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      if (isDragging) {
        const dx = e.clientX - lastPointerX;
        lastPointerX = e.clientX;
        manualSpinOffset += dx * 0.008;
      } else if (rect.width > 0 && rect.height > 0) {
        pointerOffsetX = ((e.clientX - rect.left) / rect.width - 0.5) * 1.1;
        pointerOffsetY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.7;
      }
      updateTargetsFromScroll();
      requestRender();
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      currentBaseDist = getBaseDist(camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      updateTargetsFromScroll();
      requestRender();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    if (heroModelUrl) {
      loadExternalModel(heroModelUrl);
    }
    updateTargetsFromScroll();
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);

      rimGeo.dispose();
      bridgeGeo.dispose();
      padGeo.dispose();
      noseArmGeo.dispose();
      endPieceGeo.dispose();
      pinGeo.dispose();
      lensGeo.dispose();
      tortoiseTex.dispose();
      shadowTex.dispose();
      frameMaterial.dispose();
      metalMaterial.dispose();
      lensMaterial.dispose();
      padMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] lg:h-[540px] rounded-2xl overflow-hidden bg-[#F4F1EA] border border-[#141413]/10">
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="عرض ثلاثي الأبعاد تفاعلي للنظارة يتبع التمرير والسحب"
      />

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F4F1EA] p-6 text-center">
          <p className="text-sm text-[#4A4843]">
            تم تعليق العرض ثلاثي الأبعاد مؤقتاً — يمكنك متابعة التصفح بشكل طبيعي.
          </p>
        </div>
      )}

      {/* Collapsible Bottom Material & Reset Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 w-[calc(100%-24px)] max-w-[460px]">
        <button
          type="button"
          onClick={() => setDockOpen((prev) => !prev)}
          className="mb-1.5 px-3 py-1 rounded-t-lg bg-white border border-[#141413]/10 text-[11px] font-medium text-[#4A4843] hover:text-[#141413] flex items-center gap-1 whitespace-nowrap"
          aria-expanded={dockOpen}
        >
          {dockOpen ? (
            <>
              <span>إخفاء التحكم</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>خامات الإطار</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          )}
        </button>

        {dockOpen && (
          <div className="w-full bg-white border border-[#141413]/12 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              {FINISH_PRESETS.map((preset) => {
                const selected = activeFinish === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setActiveFinish(preset.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      selected
                        ? 'bg-[#141413] text-white'
                        : 'bg-[#F4F1EA] text-[#141413] hover:bg-[#EAE5DC]'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: preset.swatch }}
                    />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => resetPoseRef.current?.()}
              aria-label="إعادة ضبط زاوية النظارة"
              title="إعادة ضبط الزاوية"
              className="p-2 rounded-lg text-[#4A4843] hover:text-[#141413] hover:bg-[#F4F1EA] transition-colors shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
