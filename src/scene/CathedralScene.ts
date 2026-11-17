import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { THEMES, type ParticleMode, type ThemeConfig } from '../themes';
import {
  CameraPreset,
  PieceColor,
  SQUARE_SIZE,
  Square,
  ThemeId,
  isLightSquare,
  squareToWorld,
} from '../types';

interface CameraTransition {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
  resolve?: () => void;
}

interface BrazierEffect {
  light: THREE.PointLight;
  baseIntensity: number;
  phase: number;
  emberCore: THREE.Mesh;
  outerFlame: THREE.Mesh;
  midFlame: THREE.Mesh;
  innerFlame: THREE.Mesh;
  particles: THREE.Points;
  particlePositions: Float32Array;
  particleVelocities: Float32Array;
  particleAges: Float32Array;
  particleLifetimes: Float32Array;
  origin: THREE.Vector3;
}

interface DustMoteData {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  mode: ParticleMode;
  basePositions: Float32Array;
  phases: Float32Array;
  speeds: Float32Array;
  count: number;
}

interface ThemeTextureBundle {
  lightMap: THREE.CanvasTexture;
  darkMap: THREE.CanvasTexture;
  borderMap: THREE.CanvasTexture;
  borderRough: THREE.CanvasTexture;
  borderBump: THREE.CanvasTexture;
  borderEmissive: THREE.CanvasTexture;
  glassMap: THREE.CanvasTexture;
  wallMap: THREE.CanvasTexture;
  floorMap: THREE.CanvasTexture;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 24 Elder Futhark rune stroke definitions in normalized cell coordinates [-1, 1].
 * Drawing crisp geometric segments guarantees authentic runes on every OS/browser.
 */
const ELDER_FUTHARK_STROKES: ReadonlyArray<ReadonlyArray<readonly [number, number, number, number]>> = [
  // Fehu
  [[-0.35, 0.85, -0.35, -0.85], [-0.35, -0.1, 0.45, -0.7], [-0.35, 0.35, 0.45, -0.2]],
  // Uruz
  [[-0.4, 0.85, -0.4, -0.85], [-0.4, -0.85, 0.35, -0.35], [0.35, -0.35, 0.4, 0.85]],
  // Thurisaz
  [[-0.35, 0.85, -0.35, -0.85], [-0.35, -0.35, 0.4, 0], [-0.35, 0.35, 0.4, 0]],
  // Ansuz
  [[-0.35, 0.85, -0.35, -0.85], [-0.35, -0.75, 0.45, -0.25], [-0.35, -0.2, 0.45, 0.3]],
  // Raido
  [[-0.35, 0.85, -0.35, -0.85], [-0.35, -0.85, 0.4, -0.35], [0.4, -0.35, -0.35, 0.1], [-0.35, 0.1, 0.45, 0.85]],
  // Kaunan
  [[0.35, -0.75, -0.35, 0], [-0.35, 0, 0.35, 0.75]],
  // Gebo
  [[-0.5, -0.8, 0.5, 0.8], [0.5, -0.8, -0.5, 0.8]],
  // Wunjo
  [[-0.35, 0.85, -0.35, -0.85], [-0.35, -0.85, 0.4, -0.35], [0.4, -0.35, -0.35, 0.15]],
  // Hagalaz
  [[-0.45, 0.85, -0.45, -0.85], [0.45, 0.85, 0.45, -0.85], [-0.45, -0.25, 0.45, 0.3]],
  // Naudiz
  [[0, 0.85, 0, -0.85], [-0.45, -0.2, 0.45, 0.35]],
  // Isaz
  [[0, 0.85, 0, -0.85]],
  // Jera
  [[-0.1, -0.8, -0.5, -0.25], [-0.5, -0.25, -0.05, 0.25], [0.1, 0.8, 0.5, 0.25], [0.5, 0.25, 0.05, -0.25]],
  // Eihwaz
  [[0, 0.85, 0, -0.85], [0, -0.85, 0.4, -0.4], [0, 0.85, -0.4, 0.4]],
  // Perthro
  [[-0.4, 0.85, -0.4, -0.85], [-0.4, -0.85, 0.35, -0.45], [-0.4, 0.85, 0.35, 0.45]],
  // Algiz
  [[0, 0.85, 0, -0.85], [0, -0.15, -0.5, -0.75], [0, -0.15, 0.5, -0.75]],
  // Sowilo
  [[0.4, -0.85, -0.35, -0.05], [-0.35, -0.05, 0.35, 0.05], [0.35, 0.05, -0.4, 0.85]],
  // Tiwaz
  [[0, 0.85, 0, -0.85], [0, -0.85, -0.5, -0.3], [0, -0.85, 0.5, -0.3]],
  // Berkano
  [[-0.35, 0.85, -0.35, -0.85], [-0.35, -0.85, 0.35, -0.42], [0.35, -0.42, -0.35, 0], [-0.35, 0, 0.35, 0.42], [0.35, 0.42, -0.35, 0.85]],
  // Ehwaz
  [[-0.45, 0.85, -0.45, -0.85], [0.45, 0.85, 0.45, -0.85], [-0.45, -0.7, 0, -0.15], [0.45, -0.7, 0, -0.15]],
  // Mannaz
  [[-0.45, 0.85, -0.45, -0.85], [0.45, 0.85, 0.45, -0.85], [-0.45, -0.8, 0.45, 0.05], [0.45, -0.8, -0.45, 0.05]],
  // Laguz
  [[-0.25, 0.85, -0.25, -0.85], [-0.25, -0.85, 0.45, -0.2]],
  // Ingwaz
  [[0, -0.7, -0.45, 0], [-0.45, 0, 0, 0.7], [0, 0.7, 0.45, 0], [0.45, 0, 0, -0.7]],
  // Dagaz
  [[-0.5, 0.8, -0.5, -0.8], [0.5, 0.8, 0.5, -0.8], [-0.5, -0.8, 0.5, 0.8], [-0.5, 0.8, 0.5, -0.8]],
  // Othala
  [[-0.45, 0.8, 0.45, -0.1], [0.45, -0.1, 0, -0.8], [0, -0.8, -0.45, -0.1], [-0.45, -0.1, 0.45, 0.8]],
];

/**
 * Full 3D Gothic Cathedral "Sanctum" environment, chessboard, lighting, IBL,
 * camera rig, and atmospheric effects for Wizard Chess.
 */
export class CathedralScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly boardSquares: Map<Square, THREE.Mesh> = new Map();

  private readonly container: HTMLElement;
  private readonly controls: OrbitControls;
  private readonly pmremGenerator: THREE.PMREMGenerator;
  private readonly envRenderTarget: THREE.WebGLRenderTarget;

  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];
  private readonly disposableLights: THREE.Light[] = [];

  private readonly braziers: BrazierEffect[] = [];
  private dustMotes: DustMoteData | null = null;
  private readonly moonlightBeams: THREE.Mesh[] = [];

  private currentTheme: ThemeId = 'gothic';
  private readonly themeTextureCache = new Map<ThemeId, ThemeTextureBundle>();

  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private moonRimLight!: THREE.DirectionalLight;
  private zenithLight!: THREE.DirectionalLight;

  private lightSquareMat!: THREE.MeshStandardMaterial;
  private darkSquareMat!: THREE.MeshStandardMaterial;
  private mortarMat!: THREE.MeshStandardMaterial;
  private goldBezelMat!: THREE.MeshStandardMaterial;
  private obsidianTopMat!: THREE.MeshStandardMaterial;
  private obsidianSideMat!: THREE.MeshStandardMaterial;
  private daisMat!: THREE.MeshStandardMaterial;
  private floorMat!: THREE.MeshStandardMaterial;
  private columnStoneMat!: THREE.MeshStandardMaterial;
  private columnTrimMat!: THREE.MeshStandardMaterial;
  private roofMat!: THREE.MeshStandardMaterial;
  private wallMat!: THREE.MeshStandardMaterial;
  private wallTrimMat!: THREE.MeshStandardMaterial;
  private nicheMat!: THREE.MeshStandardMaterial;
  private stainedGlassMat!: THREE.MeshStandardMaterial;
  private beamMat!: THREE.MeshBasicMaterial;
  private doorWoodMat!: THREE.MeshStandardMaterial;
  private doorIronMat!: THREE.MeshStandardMaterial;
  private doorBrassMat!: THREE.MeshStandardMaterial;
  private brazierPedestalMat!: THREE.MeshStandardMaterial;
  private brazierIronMat!: THREE.MeshStandardMaterial;
  private brazierRimMat!: THREE.MeshStandardMaterial;
  private readonly brazierEmberMats: THREE.MeshStandardMaterial[] = [];
  private readonly brazierOuterFlameMats: THREE.MeshBasicMaterial[] = [];
  private readonly brazierMidFlameMats: THREE.MeshBasicMaterial[] = [];
  private readonly brazierInnerFlameMats: THREE.MeshBasicMaterial[] = [];
  private readonly brazierParticleMats: THREE.PointsMaterial[] = [];

  private transition: CameraTransition | null = null;
  private currentPreset: CameraPreset = 'player';
  private currentPlayerColor: PieceColor = 'w';
  private lastWidth = 0;
  private lastHeight = 0;
  private shakeTime = 0;
  private shakeDuration = 0;
  private shakeIntensity = 0;
  private readonly lastShakeOffset = new THREE.Vector3();

  private resizeObserver: ResizeObserver | null = null;
  private readonly onWindowResizeBound: () => void;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;

    const width = container.clientWidth || window.innerWidth || 1280;
    const height = container.clientHeight || window.innerHeight || 720;
    this.lastWidth = width;
    this.lastHeight = height;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);
    this.scene.fog = new THREE.FogExp2(0x080b12, 0.015);

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 140);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // IBL setup so gold trim, obsidian, and ivory gleam naturally
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = this.pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 0.72;
    roomEnv.dispose();

    // OrbitControls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 17.5;
    this.controls.minPolarAngle = 0.04;
    this.controls.maxPolarAngle = Math.PI * 0.465;

    this.setCameraPreset('player', 'w', true);

    // Build Sanctum lighting & 3D architecture
    this.setupLighting();
    this.buildChessboardAndDais();
    this.buildCathedralFloor();
    this.buildCathedralColumnsAndVaults();
    this.buildCathedralWallsAndWindows();
    this.buildBraziers();
    this.buildDustMotes();

    this.onWindowResizeBound = () => this.handleResize();
    window.addEventListener('resize', this.onWindowResizeBound);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);
    }
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposableGeometries.push(geo);
    return geo;
  }

  private trackMaterial<T extends THREE.Material>(mat: T): T {
    this.disposableMaterials.push(mat);
    return mat;
  }

  private trackTexture<T extends THREE.Texture>(tex: T): T {
    this.disposableTextures.push(tex);
    return tex;
  }

  private trackLight<T extends THREE.Light>(light: T): T {
    this.disposableLights.push(light);
    return light;
  }

  private maxAnisotropy(): number {
    return Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 1);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth || 1280;
    const height = this.container.clientHeight || window.innerHeight || 720;
    if (width <= 0 || height <= 0) return;

    const sizeChanged = width !== this.lastWidth || height !== this.lastHeight;
    this.lastWidth = width;
    this.lastHeight = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (sizeChanged && !this.transition) {
      this.setCameraPreset(this.currentPreset, this.currentPlayerColor, true);
    }
  }

  private getPresetVectors(
    preset: CameraPreset,
    playerColor: PieceColor
  ): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const sign = playerColor === 'w' ? 1 : -1;
    const pos =
      preset === 'top-down'
        ? new THREE.Vector3(0, 11.8, 0.6 * sign)
        : new THREE.Vector3(0, 7.2, 9.2 * sign);
    const target =
      preset === 'top-down'
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(0, 0.3, 0);

    // Pull camera back proportionally on narrow/portrait viewports so board border & braziers fit cleanly
    const aspectScale = Math.max(1, 1.34 / Math.max(0.55, this.camera.aspect));
    pos.sub(target).multiplyScalar(aspectScale).add(target);
    return { pos, target };
  }

  private clearActiveShakeOffset(): void {
    if (this.lastShakeOffset.lengthSq() > 0) {
      this.camera.position.sub(this.lastShakeOffset);
      this.controls.target.sub(this.lastShakeOffset);
      this.lastShakeOffset.set(0, 0, 0);
    }
  }

  private resolvePendingTransition(): void {
    if (this.transition?.resolve) {
      const done = this.transition.resolve;
      this.transition.resolve = undefined;
      done();
    }
  }

  setCameraPreset(preset: CameraPreset, playerColor: PieceColor, immediate = false): void {
    this.clearActiveShakeOffset();
    this.resolvePendingTransition();

    this.currentPreset = preset;
    this.currentPlayerColor = playerColor;

    const { pos, target } = this.getPresetVectors(preset, playerColor);
    this.controls.maxDistance = Math.max(17.5, pos.distanceTo(target) + 2);

    if (immediate) {
      this.transition = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.enabled = true;
      this.controls.update();
      return;
    }

    this.controls.enabled = false;
    this.transition = {
      startPos: this.camera.position.clone(),
      endPos: pos,
      startTarget: this.controls.target.clone(),
      endTarget: target,
      elapsed: 0,
      duration: 0.55,
    };
  }

  focusBattleCamera(
    attackerWorld: { x: number; z: number },
    targetWorld: { x: number; z: number }
  ): Promise<void> {
    this.clearActiveShakeOffset();
    this.resolvePendingTransition();

    const midX = (attackerWorld.x + targetWorld.x) * 0.5;
    const midZ = (attackerWorld.z + targetWorld.z) * 0.5;

    let dx = targetWorld.x - attackerWorld.x;
    let dz = targetWorld.z - attackerWorld.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
    } else {
      dx = 0;
      dz = 1;
    }

    // Perpendicular side vector in XZ plane, picking side closest to current camera
    let px = -dz;
    let pz = dx;
    const dotToCam =
      px * (this.camera.position.x - midX) + pz * (this.camera.position.z - midZ);
    if (dotToCam < 0) {
      px = -px;
      pz = -pz;
    }

    // Blend perpendicular side angle with a slight rear-of-attacker slant
    let dirX = px * 0.88 - dx * 0.42;
    let dirZ = pz * 0.88 - dz * 0.42;
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dirLen;
    dirZ /= dirLen;

    const endPos = new THREE.Vector3(
      THREE.MathUtils.clamp(midX + dirX * 3.85, -8.5, 8.5),
      2.65,
      THREE.MathUtils.clamp(midZ + dirZ * 3.85, -8.5, 8.5)
    );
    const endTarget = new THREE.Vector3(midX, 0.72, midZ);

    this.controls.enabled = false;
    return new Promise<void>((resolve) => {
      this.transition = {
        startPos: this.camera.position.clone(),
        endPos,
        startTarget: this.controls.target.clone(),
        endTarget,
        elapsed: 0,
        duration: 0.42,
        resolve,
      };
    });
  }

  restoreCamera(preset: CameraPreset, playerColor: PieceColor): Promise<void> {
    this.clearActiveShakeOffset();
    this.resolvePendingTransition();

    this.currentPreset = preset;
    this.currentPlayerColor = playerColor;

    const { pos, target } = this.getPresetVectors(preset, playerColor);
    this.controls.maxDistance = Math.max(17.5, pos.distanceTo(target) + 2);
    this.controls.enabled = false;

    return new Promise<void>((resolve) => {
      this.transition = {
        startPos: this.camera.position.clone(),
        endPos: pos,
        startTarget: this.controls.target.clone(),
        endTarget: target,
        elapsed: 0,
        duration: 0.52,
        resolve,
      };
    });
  }

  triggerCameraShake(intensity = 0.14, durationMs = 340): void {
    this.shakeIntensity = Math.max(0.01, intensity);
    this.shakeDuration = Math.max(0.05, durationMs / 1000);
    this.shakeTime = 0;
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed) return;

    const clampedDt = Math.min(Math.max(dt, 0), 0.05);

    // Unwind previous frame's camera shake before updating controls or lerping
    this.clearActiveShakeOffset();

    // Update smooth camera transition if active
    if (this.transition) {
      this.transition.elapsed += clampedDt;
      const rawT = Math.min(1, this.transition.elapsed / this.transition.duration);
      const easedT = this.transition.resolve ? easeOutCubic(rawT) : easeInOutCubic(rawT);

      this.camera.position.lerpVectors(this.transition.startPos, this.transition.endPos, easedT);
      this.controls.target.lerpVectors(
        this.transition.startTarget,
        this.transition.endTarget,
        easedT
      );
      this.camera.lookAt(this.controls.target);

      if (rawT >= 1) {
        const done = this.transition.resolve;
        this.transition = null;
        this.controls.enabled = true;
        this.controls.update(clampedDt);
        if (done) done();
      }
    } else {
      this.controls.update(clampedDt);
    }

    // Apply decaying camera shake offset after OrbitControls update
    if (this.shakeDuration > 0 && this.shakeTime < this.shakeDuration) {
      this.shakeTime += clampedDt;
      const progress = Math.min(1, this.shakeTime / this.shakeDuration);
      const falloff = Math.pow(1 - progress, 2);
      const amp = this.shakeIntensity * falloff;

      const offsetX =
        Math.sin(this.shakeTime * 68) * amp * 0.85 + Math.cos(this.shakeTime * 113) * amp * 0.25;
      const offsetY =
        Math.cos(this.shakeTime * 79) * amp * 0.65 + Math.sin(this.shakeTime * 131) * amp * 0.2;
      const offsetZ = Math.sin(this.shakeTime * 57 + 1.1) * amp * 0.55;

      this.lastShakeOffset.set(offsetX, offsetY, offsetZ);
      this.camera.position.add(this.lastShakeOffset);
      this.controls.target.add(this.lastShakeOffset);
      this.camera.lookAt(this.controls.target);
    } else {
      this.shakeDuration = 0;
    }

    // Animate flickering braziers & rising embers
    this.updateBraziers(clampedDt, elapsed);

    // Animate floating cathedral particles
    this.updateDustMotes(clampedDt, elapsed);

    // Subtle shimmer on light beams
    const beamBase = THEMES[this.currentTheme].environment.beamOpacity;
    for (let i = 0; i < this.moonlightBeams.length; i++) {
      const mat = this.moonlightBeams[i].material as THREE.MeshBasicMaterial;
      mat.opacity = beamBase + Math.sin(elapsed * 0.45 + i * 1.1) * 0.01;
    }
  }

  public setTheme(themeId: ThemeId): void {
    if (this.disposed) return;
    this.currentTheme = themeId;
    const cfg = THEMES[themeId];
    const env = cfg.environment;
    const br = cfg.brazier;
    const bd = cfg.board;

    this.scene.background = new THREE.Color(env.bgHex);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(env.fogHex);
      this.scene.fog.density = env.fogDensity;
    }
    this.scene.environmentIntensity = env.envIntensity;

    this.hemiLight.color.setHex(env.hemiSkyHex);
    this.hemiLight.groundColor.setHex(env.hemiGroundHex);
    this.hemiLight.intensity = env.hemiIntensity;

    this.keyLight.color.setHex(env.keyHex);
    this.keyLight.intensity = env.keyIntensity;

    this.moonRimLight.color.setHex(env.rimHex);
    this.moonRimLight.intensity = env.rimIntensity;

    this.zenithLight.color.setHex(env.zenithHex);
    this.zenithLight.intensity = env.zenithIntensity;

    const tex = this.getOrBuildThemeTextures(cfg);

    this.lightSquareMat.map = tex.lightMap;
    this.lightSquareMat.needsUpdate = true;

    this.darkSquareMat.map = tex.darkMap;
    this.darkSquareMat.needsUpdate = true;

    this.obsidianTopMat.map = tex.borderMap;
    this.obsidianTopMat.roughnessMap = tex.borderRough;
    this.obsidianTopMat.bumpMap = tex.borderBump;
    this.obsidianTopMat.emissiveMap = tex.borderEmissive;
    this.obsidianTopMat.emissive.setHex(bd.runeEmissiveHex);
    this.obsidianTopMat.emissiveIntensity = bd.runeEmissiveIntensity;
    this.obsidianTopMat.needsUpdate = true;

    this.obsidianSideMat.color.setHex(new THREE.Color(bd.borderBaseHex).getHex());
    this.goldBezelMat.color.setHex(bd.bezelHex);
    this.mortarMat.color.setHex(bd.mortarHex);
    this.daisMat.color.setHex(bd.daisHex);

    this.floorMat.map = tex.floorMap;
    this.floorMat.needsUpdate = true;

    this.wallMat.map = tex.wallMap;
    this.wallMat.needsUpdate = true;

    this.wallTrimMat.color.setHex(env.wallTrimHex);
    this.nicheMat.color.setHex(env.nicheHex);
    this.columnStoneMat.color.setHex(env.columnHex);
    this.columnTrimMat.color.setHex(env.columnTrimHex);
    this.roofMat.color.setHex(env.roofHex);

    this.stainedGlassMat.map = tex.glassMap;
    this.stainedGlassMat.emissiveMap = tex.glassMap;
    this.stainedGlassMat.emissive.setHex(env.windowEmissiveHex);
    this.stainedGlassMat.needsUpdate = true;

    this.beamMat.color.setHex(env.beamHex);
    this.beamMat.opacity = env.beamOpacity;

    this.doorWoodMat.color.setHex(env.doorWoodHex);
    this.doorIronMat.color.setHex(env.doorIronHex);
    this.doorBrassMat.color.setHex(bd.bezelHex);

    this.brazierPedestalMat.color.setHex(br.pedestalHex);
    this.brazierIronMat.color.setHex(br.ironHex);
    this.brazierRimMat.color.setHex(bd.bezelHex);

    for (const b of this.braziers) {
      b.light.color.setHex(br.lightHex);
      b.baseIntensity = br.lightIntensity;
    }
    for (const m of this.brazierEmberMats) m.emissive.setHex(br.emberEmissiveHex);
    for (const m of this.brazierOuterFlameMats) m.color.setHex(br.outerFlameHex);
    for (const m of this.brazierMidFlameMats) m.color.setHex(br.midFlameHex);
    for (const m of this.brazierInnerFlameMats) m.color.setHex(br.innerFlameHex);
    for (const m of this.brazierParticleMats) m.color.setHex(br.sparkHex);

    if (this.dustMotes) {
      this.dustMotes.mode = cfg.particles.mode;
      this.dustMotes.material.color.setHex(cfg.particles.colorHex);
      this.dustMotes.material.size = cfg.particles.size;
      this.dustMotes.material.opacity = cfg.particles.opacity;
    }
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.resolvePendingTransition();
    this.transition = null;

    window.removeEventListener('resize', this.onWindowResizeBound);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.controls.dispose();

    for (const geo of this.disposableGeometries) {
      geo.dispose();
    }
    this.disposableGeometries.length = 0;

    for (const mat of this.disposableMaterials) {
      mat.dispose();
    }
    this.disposableMaterials.length = 0;

    for (const tex of this.disposableTextures) {
      tex.dispose();
    }
    this.disposableTextures.length = 0;

    for (const light of this.disposableLights) {
      light.dispose();
    }
    this.disposableLights.length = 0;

    this.envRenderTarget.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ---------------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------------

  private setupLighting(): void {
    this.hemiLight = this.trackLight(new THREE.HemisphereLight(0x7392c4, 0x2a1f16, 0.58));
    this.scene.add(this.hemiLight);

    // Warm key directional light from high sanctum shaft
    this.keyLight = this.trackLight(new THREE.DirectionalLight(0xffe9ca, 2.15));
    this.keyLight.position.set(-6.0, 14.5, 7.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 36;
    this.keyLight.shadow.camera.left = -7.5;
    this.keyLight.shadow.camera.right = 7.5;
    this.keyLight.shadow.camera.top = 7.5;
    this.keyLight.shadow.camera.bottom = -7.5;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.024;
    this.scene.add(this.keyLight);

    // Cool blue moonlight rim from lancet stained-glass windows
    this.moonRimLight = this.trackLight(new THREE.DirectionalLight(0x6c9ef0, 0.95));
    this.moonRimLight.position.set(4.5, 10.5, -12.0);
    this.scene.add(this.moonRimLight);

    // Subtle overhead sanctum fill so tops of crowns and faces read sharply
    this.zenithLight = this.trackLight(new THREE.DirectionalLight(0xcfdcff, 0.35));
    this.zenithLight.position.set(0, 14, -2);
    this.scene.add(this.zenithLight);
  }

  // ---------------------------------------------------------------------------
  // Chessboard, Gold Bezel, 2K Obsidian Rune Border & Dais
  // ---------------------------------------------------------------------------

  private buildChessboardAndDais(): void {
    const boardGroup = new THREE.Group();
    this.scene.add(boardGroup);

    // Procedural marble textures for light & dark squares
    const lightMarble = this.createMarbleSquareTextures(true);
    const darkMarble = this.createMarbleSquareTextures(false);

    this.lightSquareMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: lightMarble.map,
        roughnessMap: lightMarble.roughnessMap,
        bumpMap: lightMarble.bumpMap,
        bumpScale: 0.004,
        roughness: 0.28,
        metalness: 0.04,
      })
    );
    const lightMat = this.lightSquareMat;

    this.darkSquareMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: darkMarble.map,
        roughnessMap: darkMarble.roughnessMap,
        bumpMap: darkMarble.bumpMap,
        bumpScale: 0.005,
        roughness: 0.24,
        metalness: 0.08,
      })
    );
    const darkMat = this.darkSquareMat;

    // Base beveled square tile geometry with top strictly at y = 0
    const baseTileGeo = this.createBeveledTileGeometry(0.968, 0.14, 0.014);

    const files = 'abcdefgh';
    const ranks = '12345678';
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const sq: Square = `${files[f]}${ranks[r]}`;
        const tileGeo = this.trackGeometry(baseTileGeo.clone());

        // Give each square a distinct slice of the procedural marble slab
        const uOffset = ((f * 0.17 + r * 0.11) % 0.68);
        const vOffset = ((r * 0.19 + f * 0.07) % 0.68);
        this.applyPlanarTopUVs(tileGeo, uOffset, vOffset, 0.32);

        const mesh = new THREE.Mesh(tileGeo, isLightSquare(sq) ? lightMat : darkMat);
        const { x, z } = squareToWorld(sq);
        mesh.position.set(x, 0, z);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.userData.square = sq;

        boardGroup.add(mesh);
        this.boardSquares.set(sq, mesh);
      }
    }
    baseTileGeo.dispose();

    // Dark bronze-obsidian mortar bed right under the 64 squares so tile bevel seams read sharply
    const mortarBedGeo = this.trackGeometry(new THREE.BoxGeometry(8.04, 0.14, 8.04));
    this.mortarMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x161412,
        roughness: 0.5,
        metalness: 0.35,
      })
    );
    const mortarBed = new THREE.Mesh(mortarBedGeo, this.mortarMat);
    mortarBed.position.set(0, -0.088, 0);
    mortarBed.receiveShadow = true;
    boardGroup.add(mortarBed);

    // Raised brushed-gold inner bezel framing the 8x8 grid
    this.goldBezelMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.88,
        roughness: 0.22,
      })
    );
    const goldMat = this.goldBezelMat;

    const bezelInner = 4.01 * SQUARE_SIZE;
    const bezelOuter = 4.22 * SQUARE_SIZE;
    const railLength = bezelOuter * 2;
    const railWidth = bezelOuter - bezelInner;
    const railCenter = (bezelInner + bezelOuter) * 0.5;

    const northSouthGeo = this.trackGeometry(new THREE.BoxGeometry(railLength, 0.085, railWidth));
    const eastWestGeo = this.trackGeometry(
      new THREE.BoxGeometry(railWidth, 0.085, bezelInner * 2)
    );

    const bezelPositions: Array<[THREE.BufferGeometry, number, number]> = [
      [northSouthGeo, 0, -railCenter],
      [northSouthGeo, 0, railCenter],
      [eastWestGeo, -railCenter, 0],
      [eastWestGeo, railCenter, 0],
    ];

    for (const [geo, bx, bz] of bezelPositions) {
      const rail = new THREE.Mesh(geo, goldMat);
      rail.position.set(bx, 0.002, bz);
      rail.castShadow = true;
      rail.receiveShadow = true;
      boardGroup.add(rail);
    }

    // Thin inner chamfer step inside the gold bezel for extra crisp reflection catch
    const innerStepNS = this.trackGeometry(new THREE.BoxGeometry(8.16, 0.055, 0.06));
    const innerStepEW = this.trackGeometry(new THREE.BoxGeometry(0.06, 0.055, 8.04));
    for (const [geo, bx, bz] of [
      [innerStepNS, 0, -4.04],
      [innerStepNS, 0, 4.04],
      [innerStepEW, -4.04, 0],
      [innerStepEW, 4.04, 0],
    ] as Array<[THREE.BufferGeometry, number, number]>) {
      const step = new THREE.Mesh(geo, goldMat);
      step.position.set(bx, -0.005, bz);
      step.receiveShadow = true;
      boardGroup.add(step);
    }

    // 4 Corner gold rosette bosses on the bezel corners
    const cornerBossGeo = this.trackGeometry(new THREE.CylinderGeometry(0.11, 0.13, 0.075, 8));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const boss = new THREE.Mesh(cornerBossGeo, goldMat);
        boss.position.set(sx * railCenter, 0.025, sz * railCenter);
        boss.castShadow = true;
        boss.receiveShadow = true;
        boardGroup.add(boss);
      }
    }

    // Wide cracked black obsidian outer border (~10.6 x 10.6) with 2K procedural rune textures
    const obsidianTextures = this.createObsidianRuneBorderTextures();
    this.obsidianTopMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: obsidianTextures.map,
        roughnessMap: obsidianTextures.roughnessMap,
        bumpMap: obsidianTextures.bumpMap,
        bumpScale: 0.015,
        emissiveMap: obsidianTextures.emissiveMap,
        emissive: new THREE.Color(0xffc95c),
        emissiveIntensity: 0.45,
        roughness: 0.28,
        metalness: 0.18,
      })
    );
    const obsidianTopMat = this.obsidianTopMat;
    this.obsidianSideMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x0e1016,
        roughness: 0.34,
        metalness: 0.22,
      })
    );
    const obsidianSideMat = this.obsidianSideMat;

    const obsidianGeo = this.trackGeometry(new THREE.BoxGeometry(10.6, 0.42, 10.6));
    const obsidianBorder = new THREE.Mesh(obsidianGeo, [
      obsidianSideMat,
      obsidianSideMat,
      obsidianTopMat,
      obsidianSideMat,
      obsidianSideMat,
      obsidianSideMat,
    ]);
    obsidianBorder.position.set(0, -0.23, 0);
    obsidianBorder.receiveShadow = true;
    obsidianBorder.castShadow = true;
    boardGroup.add(obsidianBorder);

    // Outer brass rim molding hugging the bottom edge of the obsidian slab
    const outerBrassRimGeo = this.trackGeometry(new THREE.BoxGeometry(10.74, 0.07, 10.74));
    const outerBrassRim = new THREE.Mesh(outerBrassRimGeo, goldMat);
    outerBrassRim.position.set(0, -0.43, 0);
    outerBrassRim.receiveShadow = true;
    boardGroup.add(outerBrassRim);

    // Stepped dark basalt dais anchoring the chessboard to the cathedral floor (y = -0.65)
    this.daisMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1a1d24,
        roughness: 0.68,
        metalness: 0.08,
      })
    );
    const daisMat = this.daisMat;
    const daisUpperGeo = this.trackGeometry(new THREE.BoxGeometry(11.1, 0.11, 11.1));
    const daisUpper = new THREE.Mesh(daisUpperGeo, daisMat);
    daisUpper.position.set(0, -0.515, 0);
    daisUpper.receiveShadow = true;
    daisUpper.castShadow = true;
    boardGroup.add(daisUpper);

    const daisLowerGeo = this.trackGeometry(new THREE.BoxGeometry(11.8, 0.1, 11.8));
    const daisLower = new THREE.Mesh(daisLowerGeo, daisMat);
    daisLower.position.set(0, -0.6, 0);
    daisLower.receiveShadow = true;
    boardGroup.add(daisLower);
  }

  private createBeveledTileGeometry(
    innerSize: number,
    height: number,
    bevel: number
  ): THREE.BufferGeometry {
    const half = innerSize * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 1,
    });

    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      // Shift so the top surface rests strictly at y = 0
      geo.translate(0, -geo.boundingBox.max.y, 0);
    }
    geo.computeVertexNormals();
    return geo;
  }

  private applyPlanarTopUVs(
    geo: THREE.BufferGeometry,
    uOffset: number,
    vOffset: number,
    uvScale: number
  ): void {
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    if (!pos || !uv) return;

    for (let i = 0; i < pos.count; i++) {
      const nx = (pos.getX(i) + 0.5); // 0..1 across tile
      const nz = (pos.getZ(i) + 0.5);
      uv.setXY(i, uOffset + nx * uvScale, vOffset + nz * uvScale);
    }
    uv.needsUpdate = true;
  }

  private createMarbleSquareTextures(isLight: boolean): {
    map: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  } {
    const size = 1024;
    const rand = createSeededRandom(isLight ? 4109 : 9203);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d')!;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    // Base fill
    dCtx.fillStyle = isLight ? '#E7DFCF' : '#181C24';
    dCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = isLight ? '#404040' : '#323232';
    rCtx.fillRect(0, 0, size, size);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    // Soft mineral mottling clouds
    for (let i = 0; i < 65; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rad = 60 + rand() * 190;
      const grad = dCtx.createRadialGradient(cx, cy, 4, cx, cy, rad);
      if (isLight) {
        grad.addColorStop(0, rand() > 0.5 ? 'rgba(212, 200, 178, 0.14)' : 'rgba(248, 244, 236, 0.16)');
      } else {
        grad.addColorStop(0, rand() > 0.5 ? 'rgba(38, 46, 62, 0.18)' : 'rgba(12, 14, 18, 0.22)');
      }
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      dCtx.fillStyle = grad;
      dCtx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }

    // Organic flowing marble veins
    const veinCount = isLight ? 24 : 28;
    for (let v = 0; v < veinCount; v++) {
      let x = rand() * size;
      let y = rand() * size;
      let angle = rand() * Math.PI * 2;
      const steps = 40 + Math.floor(rand() * 40);

      dCtx.beginPath();
      bCtx.beginPath();
      rCtx.beginPath();
      dCtx.moveTo(x, y);
      bCtx.moveTo(x, y);
      rCtx.moveTo(x, y);

      for (let s = 0; s < steps; s++) {
        angle += (rand() - 0.5) * 0.7;
        const stepLen = 10 + rand() * 16;
        x += Math.cos(angle) * stepLen;
        y += Math.sin(angle) * stepLen;
        dCtx.lineTo(x, y);
        bCtx.lineTo(x, y);
        rCtx.lineTo(x, y);
      }

      const width = 0.8 + rand() * 3.0;
      if (isLight) {
        dCtx.strokeStyle =
          rand() > 0.35
            ? `rgba(170, 157, 138, ${0.18 + rand() * 0.22})`
            : `rgba(128, 118, 104, ${0.14 + rand() * 0.16})`;
      } else {
        dCtx.strokeStyle =
          rand() > 0.25
            ? `rgba(92, 104, 128, ${0.22 + rand() * 0.25})`
            : `rgba(164, 142, 92, ${0.14 + rand() * 0.18})`;
      }
      dCtx.lineWidth = width;
      dCtx.stroke();

      bCtx.strokeStyle = 'rgba(105, 105, 105, 0.35)';
      bCtx.lineWidth = width * 0.8;
      bCtx.stroke();

      rCtx.strokeStyle = 'rgba(110, 110, 110, 0.3)';
      rCtx.lineWidth = width;
      rCtx.stroke();
    }

    // Micro crystalline speckles
    for (let i = 0; i < 900; i++) {
      const px = rand() * size;
      const py = rand() * size;
      const r = 0.6 + rand() * 1.4;
      dCtx.fillStyle = isLight
        ? `rgba(255, 250, 240, ${0.06 + rand() * 0.08})`
        : `rgba(150, 170, 200, ${0.04 + rand() * 0.06})`;
      dCtx.fillRect(px, py, r, r);
    }

    const map = this.trackTexture(new THREE.CanvasTexture(diffCanvas));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = this.maxAnisotropy();

    const roughnessMap = this.trackTexture(new THREE.CanvasTexture(roughCanvas));
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.anisotropy = this.maxAnisotropy();

    const bumpMap = this.trackTexture(new THREE.CanvasTexture(bumpCanvas));
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.anisotropy = this.maxAnisotropy();

    return { map, roughnessMap, bumpMap };
  }

  private createObsidianRuneBorderTextures(): {
    map: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = 2048;
    const rand = createSeededRandom(7731);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d')!;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    const emisCanvas = document.createElement('canvas');
    emisCanvas.width = size;
    emisCanvas.height = size;
    const eCtx = emisCanvas.getContext('2d')!;

    // Deep volcanic obsidian base
    dCtx.fillStyle = '#0B0D12';
    dCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#383838'; // glossy obsidian ~0.22
    rCtx.fillRect(0, 0, size, size);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, size, size);

    // Subtle dark glassy obsidian tonal variations
    for (let i = 0; i < 160; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rad = 80 + rand() * 240;
      const grad = dCtx.createRadialGradient(cx, cy, 4, cx, cy, rad);
      grad.addColorStop(
        0,
        rand() > 0.5 ? 'rgba(26, 31, 44, 0.25)' : 'rgba(6, 7, 10, 0.35)'
      );
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dCtx.fillStyle = grad;
      dCtx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }

    // Helper to draw jagged lightning marble veins on the outer obsidian rim
    const drawLightningVein = (
      startX: number,
      startY: number,
      angle: number,
      length: number,
      width: number,
      depth: number
    ) => {
      if (depth > 3 || length < 22) return;
      const segments = 9;
      let cx = startX;
      let cy = startY;
      let curAngle = angle;

      const pts: Array<[number, number]> = [[cx, cy]];
      for (let s = 0; s < segments; s++) {
        curAngle += (rand() - 0.5) * 0.72;
        const segLen = (length / segments) * (0.7 + rand() * 0.6);
        cx += Math.cos(curAngle) * segLen;
        cy += Math.sin(curAngle) * segLen;
        pts.push([cx, cy]);

        if (rand() < 0.28 && depth < 3) {
          drawLightningVein(
            cx,
            cy,
            curAngle + (rand() > 0.5 ? 0.65 : -0.65),
            length * 0.55,
            width * 0.55,
            depth + 1
          );
        }
      }

      // Soft silvery mineral aura
      dCtx.beginPath();
      dCtx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) dCtx.lineTo(pts[i][0], pts[i][1]);
      dCtx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      dCtx.lineWidth = width * 2.8;
      dCtx.lineCap = 'round';
      dCtx.stroke();

      // Crisp white/silver lightning core
      dCtx.beginPath();
      dCtx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) dCtx.lineTo(pts[i][0], pts[i][1]);
      dCtx.strokeStyle = depth === 0 ? 'rgba(226, 234, 245, 0.78)' : 'rgba(203, 213, 225, 0.56)';
      dCtx.lineWidth = width;
      dCtx.stroke();

      // Crack relief in bump + rougher crack interior
      bCtx.beginPath();
      bCtx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) bCtx.lineTo(pts[i][0], pts[i][1]);
      bCtx.strokeStyle = 'rgba(55, 55, 55, 0.7)';
      bCtx.lineWidth = width * 1.1;
      bCtx.stroke();

      rCtx.beginPath();
      rCtx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) rCtx.lineTo(pts[i][0], pts[i][1]);
      rCtx.strokeStyle = 'rgba(130, 130, 130, 0.65)';
      rCtx.lineWidth = width * 1.3;
      rCtx.stroke();
    };

    // Scatter lightning veins along all 4 outer obsidian border margins
    const rimPx = 225;
    for (let i = 0; i < 42; i++) {
      const edge = i % 4;
      let sx = 0;
      let sy = 0;
      let ang = 0;
      if (edge === 0) {
        sx = rand() * size;
        sy = rand() * rimPx;
        ang = Math.PI * 0.5 + (rand() - 0.5) * 1.2;
      } else if (edge === 1) {
        sx = rand() * size;
        sy = size - rand() * rimPx;
        ang = -Math.PI * 0.5 + (rand() - 0.5) * 1.2;
      } else if (edge === 2) {
        sx = rand() * rimPx;
        sy = rand() * size;
        ang = (rand() - 0.5) * 1.2;
      } else {
        sx = size - rand() * rimPx;
        sy = rand() * size;
        ang = Math.PI + (rand() - 0.5) * 1.2;
      }
      drawLightningVein(sx, sy, ang, 110 + rand() * 140, 1.4 + rand() * 1.6, 0);
    }

    // Gold border trim frames around the obsidian margin
    const drawGoldFrameRect = (inset: number, lineWidth: number, glowAlpha: number) => {
      const w = size - inset * 2;
      dCtx.strokeStyle = '#E0B84C';
      dCtx.lineWidth = lineWidth;
      dCtx.strokeRect(inset, inset, w, w);

      bCtx.strokeStyle = '#505050';
      bCtx.lineWidth = lineWidth + 2;
      bCtx.strokeRect(inset, inset, w, w);

      rCtx.strokeStyle = '#303030';
      rCtx.lineWidth = lineWidth;
      rCtx.strokeRect(inset, inset, w, w);

      eCtx.strokeStyle = `rgba(255, 200, 90, ${glowAlpha})`;
      eCtx.lineWidth = lineWidth;
      eCtx.strokeRect(inset, inset, w, w);
    };

    drawGoldFrameRect(24, 5, 0.45);
    drawGoldFrameRect(42, 2.5, 0.3);
    drawGoldFrameRect(192, 4, 0.4);

    // Helper for etched glowing gold Elder Futhark rune glyphs
    const drawRune = (runeIdx: number, cx: number, cy: number, radius: number, rotRad: number) => {
      const strokes = ELDER_FUTHARK_STROKES[runeIdx % ELDER_FUTHARK_STROKES.length];

      const renderTo = (
        ctx: CanvasRenderingContext2D,
        color: string,
        lineW: number,
        shadowBlur = 0,
        shadowColor = 'transparent'
      ) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotRad);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of strokes) {
          ctx.moveTo(x1 * radius, y1 * radius);
          ctx.lineTo(x2 * radius, y2 * radius);
        }
        ctx.stroke();
        ctx.restore();
      };

      // Engraved bevel shadow + gold inlay + subtle warm glow
      renderTo(bCtx, '#383838', 11);
      renderTo(dCtx, '#F0C75E', 7.5);
      renderTo(rCtx, '#282828', 7.5);
      renderTo(eCtx, '#FFCC66', 6.5, 10, 'rgba(255, 185, 65, 0.85)');
    };

    // Helper for ornate 8-pointed corner star glyphs inside rune ring
    const drawCornerStarGlyph = (cx: number, cy: number, outerR: number) => {
      const renderStar = (
        ctx: CanvasRenderingContext2D,
        color: string,
        lineW: number,
        shadowBlur = 0,
        shadowColor = 'transparent'
      ) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;

        // Outer compass circle
        ctx.beginPath();
        ctx.arc(0, 0, outerR, 0, Math.PI * 2);
        ctx.stroke();

        // Inner circle
        ctx.beginPath();
        ctx.arc(0, 0, outerR * 0.42, 0, Math.PI * 2);
        ctx.stroke();

        // 8 star rays
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 4;
          const len = k % 2 === 0 ? outerR * 0.92 : outerR * 0.72;
          ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len);
          ctx.lineTo(-Math.cos(a) * len, -Math.sin(a) * len);
        }
        ctx.stroke();
        ctx.restore();
      };

      renderStar(bCtx, '#363636', 8);
      renderStar(dCtx, '#F2CA62', 5);
      renderStar(rCtx, '#262626', 5);
      renderStar(eCtx, '#FFD16E', 4.5, 12, 'rgba(255, 190, 70, 0.9)');
    };

    // 4 Corner star glyphs
    const cornerOffset = 114;
    for (const cx of [cornerOffset, size - cornerOffset]) {
      for (const cy of [cornerOffset, size - cornerOffset]) {
        drawCornerStarGlyph(cx, cy, 46);
      }
    }

    // 16 Elder Futhark runes etched along each of the 4 border sides
    const runesPerSide = 16;
    const spanStart = 235;
    const spanEnd = size - 235;
    for (let i = 0; i < runesPerSide; i++) {
      const t = i / (runesPerSide - 1);
      const pos = spanStart + t * (spanEnd - spanStart);
      const runeRadius = 38;

      // Top side (facing outward -Z)
      drawRune(i, pos, 114, runeRadius, Math.PI);
      // Bottom side (facing outward +Z)
      drawRune(i + 6, pos, size - 114, runeRadius, 0);
      // Left side (facing outward -X)
      drawRune(i + 12, 114, pos, runeRadius, -Math.PI / 2);
      // Right side (facing outward +X)
      drawRune(i + 18, size - 114, pos, runeRadius, Math.PI / 2);
    }

    const map = this.trackTexture(new THREE.CanvasTexture(diffCanvas));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = this.maxAnisotropy();

    const roughnessMap = this.trackTexture(new THREE.CanvasTexture(roughCanvas));
    roughnessMap.anisotropy = this.maxAnisotropy();

    const bumpMap = this.trackTexture(new THREE.CanvasTexture(bumpCanvas));
    bumpMap.anisotropy = this.maxAnisotropy();

    const emissiveMap = this.trackTexture(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.anisotropy = this.maxAnisotropy();

    return { map, roughnessMap, bumpMap, emissiveMap };
  }

  // ---------------------------------------------------------------------------
  // Cathedral Floor, Columns, Vaults, Walls, Lancet Windows, Doors
  // ---------------------------------------------------------------------------

  private createStoneTileTextures(): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  } {
    const size = 1024;
    const rand = createSeededRandom(3181);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d')!;

    dCtx.fillStyle = '#151820';
    dCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#404040';
    bCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#B8B8B8';
    rCtx.fillRect(0, 0, size, size);

    const grid = 4;
    const tile = size / grid;
    const gap = 8;

    for (let gx = 0; gx < grid; gx++) {
      for (let gy = 0; gy < grid; gy++) {
        const x = gx * tile + gap * 0.5;
        const y = gy * tile + gap * 0.5;
        const w = tile - gap;
        const tone = 30 + Math.floor(rand() * 14);
        dCtx.fillStyle = `rgb(${tone}, ${tone + 3}, ${tone + 10})`;
        dCtx.fillRect(x, y, w, w);

        // Beveled edge highlight & shadow
        dCtx.strokeStyle = 'rgba(130, 142, 165, 0.16)';
        dCtx.lineWidth = 4;
        dCtx.strokeRect(x + 2, y + 2, w - 4, w - 4);

        bCtx.fillStyle = `rgb(${155 + Math.floor(rand() * 25)}, ${155 + Math.floor(rand() * 25)}, ${155 + Math.floor(rand() * 25)})`;
        bCtx.fillRect(x + 3, y + 3, w - 6, w - 6);

        const rough = 120 + Math.floor(rand() * 45);
        rCtx.fillStyle = `rgb(${rough}, ${rough}, ${rough})`;
        rCtx.fillRect(x, y, w, w);

        // Stone pitting/weathering inside slab
        for (let p = 0; p < 55; p++) {
          const px = x + rand() * w;
          const py = y + rand() * w;
          const pr = 3 + rand() * 14;
          dCtx.fillStyle =
            rand() > 0.5 ? 'rgba(12, 14, 18, 0.16)' : 'rgba(72, 80, 96, 0.1)';
          dCtx.beginPath();
          dCtx.arc(px, py, pr, 0, Math.PI * 2);
          dCtx.fill();
        }
      }
    }

    const map = this.trackTexture(new THREE.CanvasTexture(diffCanvas));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(9, 11);
    map.anisotropy = this.maxAnisotropy();

    const bumpMap = this.trackTexture(new THREE.CanvasTexture(bumpCanvas));
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(9, 11);

    const roughnessMap = this.trackTexture(new THREE.CanvasTexture(roughCanvas));
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.repeat.set(9, 11);

    return { map, bumpMap, roughnessMap };
  }

  private createWallMasonryTextures(): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  } {
    const size = 1024;
    const rand = createSeededRandom(5507);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    dCtx.fillStyle = '#14171F';
    dCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#484848';
    bCtx.fillRect(0, 0, size, size);

    const rows = 12;
    const cols = 6;
    const rowH = size / rows;
    const colW = size / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * colW + offset + 3;
        const by = r * rowH + 3;
        const bw = colW - 6;
        const bh = rowH - 6;
        const v = 30 + Math.floor(rand() * 18);
        dCtx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 12})`;
        dCtx.fillRect(bx, by, bw, bh);

        bCtx.fillStyle = `rgb(${145 + Math.floor(rand() * 35)}, ${145 + Math.floor(rand() * 35)}, ${145 + Math.floor(rand() * 35)})`;
        bCtx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      }
    }

    const map = this.trackTexture(new THREE.CanvasTexture(diffCanvas));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 2);

    const bumpMap = this.trackTexture(new THREE.CanvasTexture(bumpCanvas));
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(3, 2);

    return { map, bumpMap };
  }

  private buildCathedralFloor(): void {
    const floorTex = this.createStoneTileTextures();
    this.floorMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: floorTex.map,
        bumpMap: floorTex.bumpMap,
        bumpScale: 0.03,
        roughnessMap: floorTex.roughnessMap,
        roughness: 0.72,
        metalness: 0.06,
      })
    );
    const floorMat = this.floorMat;

    const floorGeo = this.trackGeometry(new THREE.PlaneGeometry(46, 58));
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.65;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildCathedralColumnsAndVaults(): void {
    this.columnStoneMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x262b36,
        roughness: 0.76,
        metalness: 0.06,
      })
    );
    const stoneMat = this.columnStoneMat;
    this.columnTrimMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1b1f28,
        roughness: 0.65,
        metalness: 0.1,
      })
    );
    const darkTrimStoneMat = this.columnTrimMat;

    // Shared column geometries (tall enough that top-down camera at portrait aspect never clips arches)
    const base1Geo = this.trackGeometry(new THREE.CylinderGeometry(0.95, 1.02, 0.34, 8));
    const base2Geo = this.trackGeometry(new THREE.CylinderGeometry(0.8, 0.9, 0.32, 8));
    const base3Geo = this.trackGeometry(new THREE.CylinderGeometry(0.66, 0.76, 0.28, 8));
    const shaftHeight = 21.2;
    const shaftGeo = this.trackGeometry(new THREE.CylinderGeometry(0.46, 0.5, shaftHeight, 20));
    const ribGeo = this.trackGeometry(new THREE.CylinderGeometry(0.08, 0.08, shaftHeight, 8));
    const bandGeo = this.trackGeometry(new THREE.CylinderGeometry(0.56, 0.56, 0.18, 16));
    const capGeo = this.trackGeometry(new THREE.CylinderGeometry(0.88, 0.52, 0.7, 8));

    const colZList = [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5];
    for (const cz of colZList) {
      for (const cx of [-9.4, 9.4]) {
        const col = new THREE.Group();
        col.position.set(cx, -0.65, cz);

        const b1 = new THREE.Mesh(base1Geo, darkTrimStoneMat);
        b1.position.y = 0.17;
        b1.receiveShadow = true;
        b1.castShadow = true;
        col.add(b1);

        const b2 = new THREE.Mesh(base2Geo, stoneMat);
        b2.position.y = 0.5;
        b2.receiveShadow = true;
        b2.castShadow = true;
        col.add(b2);

        const b3 = new THREE.Mesh(base3Geo, darkTrimStoneMat);
        b3.position.y = 0.8;
        b3.receiveShadow = true;
        b3.castShadow = true;
        col.add(b3);

        const shaft = new THREE.Mesh(shaftGeo, stoneMat);
        shaft.position.y = 0.94 + shaftHeight * 0.5;
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        col.add(shaft);

        // 8 engaged vertical stone colonnette ribs
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const rib = new THREE.Mesh(ribGeo, darkTrimStoneMat);
          rib.position.set(Math.cos(a) * 0.46, 0.94 + shaftHeight * 0.5, Math.sin(a) * 0.46);
          rib.castShadow = true;
          col.add(rib);
        }

        // Stone collar bands & Gothic capital
        for (const by of [2.6, 7.6, 13.5, 21.6]) {
          const band = new THREE.Mesh(bandGeo, darkTrimStoneMat);
          band.position.y = by;
          col.add(band);
        }

        const cap = new THREE.Mesh(capGeo, stoneMat);
        cap.position.y = 22.4;
        col.add(cap);

        this.scene.add(col);
      }

      // Transverse pointed Gothic vault rib connecting left & right column
      const archCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-9.4, 22.0, cz),
        new THREE.Vector3(-5.0, 27.2, cz),
        new THREE.Vector3(0, 29.8, cz),
        new THREE.Vector3(5.0, 27.2, cz),
        new THREE.Vector3(9.4, 22.0, cz),
      ]);
      const archGeo = this.trackGeometry(new THREE.TubeGeometry(archCurve, 24, 0.24, 8, false));
      const arch = new THREE.Mesh(archGeo, darkTrimStoneMat);
      this.scene.add(arch);
    }

    // Dark vaulted roof cap high above
    const roofGeo = this.trackGeometry(new THREE.PlaneGeometry(34, 54));
    roofGeo.rotateX(Math.PI / 2);
    this.roofMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x0c0f16,
        roughness: 0.92,
      })
    );
    const roof = new THREE.Mesh(roofGeo, this.roofMat);
    roof.position.y = 30.6;
    this.scene.add(roof);
  }

  private buildCathedralWallsAndWindows(): void {
    const masonry = this.createWallMasonryTextures();
    this.wallMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: masonry.map,
        bumpMap: masonry.bumpMap,
        bumpScale: 0.04,
        roughness: 0.84,
        metalness: 0.04,
      })
    );
    const wallMat = this.wallMat;
    this.wallTrimMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x222632,
        roughness: 0.72,
        metalness: 0.08,
      })
    );
    const trimMat = this.wallTrimMat;
    this.nicheMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x12151c,
        roughness: 0.88,
      })
    );
    const nicheMat = this.nicheMat;

    // Main outer perimeter walls (end walls at z = +/-24.8 so narrow-aspect cameras never clip outside)
    const nsWallGeo = this.trackGeometry(new THREE.BoxGeometry(30, 31.8, 0.6));
    const ewWallGeo = this.trackGeometry(new THREE.BoxGeometry(0.6, 31.8, 51));

    const northWall = new THREE.Mesh(nsWallGeo, wallMat);
    northWall.position.set(0, 15.25, -24.8);
    northWall.receiveShadow = true;
    this.scene.add(northWall);

    const southWall = new THREE.Mesh(nsWallGeo, wallMat);
    southWall.position.set(0, 15.25, 24.8);
    southWall.receiveShadow = true;
    this.scene.add(southWall);

    const westWall = new THREE.Mesh(ewWallGeo, wallMat);
    westWall.position.set(-13.4, 15.25, 0);
    westWall.receiveShadow = true;
    this.scene.add(westWall);

    const eastWall = new THREE.Mesh(ewWallGeo, wallMat);
    eastWall.position.set(13.4, 15.25, 0);
    eastWall.receiveShadow = true;
    this.scene.add(eastWall);

    // Pointed Gothic Blind Arch geometry for lower wall arcade
    const blindArchFrameGeo = this.createPointedArchFrameGeometry(2.6, 4.2, 0.34, 0.28);
    const blindNicheGeo = this.trackGeometry(new THREE.BoxGeometry(2.1, 3.8, 0.14));

    const placeBlindArch = (x: number, z: number, rotY: number) => {
      const group = new THREE.Group();
      group.position.set(x, -0.65, z);
      group.rotation.y = rotY;

      const frame = new THREE.Mesh(blindArchFrameGeo, trimMat);
      frame.receiveShadow = true;
      frame.castShadow = true;
      group.add(frame);

      const niche = new THREE.Mesh(blindNicheGeo, nicheMat);
      niche.position.set(0, 1.9, -0.04);
      group.add(niche);

      this.scene.add(group);
    };

    // Lower blind arches along East & West walls
    for (const az of [-21.0, -17.5, -14.0, -10.5, -7.0, -3.5, 0, 3.5, 7.0, 10.5, 14.0, 17.5, 21.0]) {
      placeBlindArch(-13.0, az, Math.PI / 2);
      placeBlindArch(13.0, az, -Math.PI / 2);
    }

    // Lower blind arches flanking rear & front heavy oak/iron doors
    for (const ax of [-8.8, -5.4, 5.4, 8.8]) {
      placeBlindArch(ax, -24.4, 0);
      placeBlindArch(ax, 24.4, Math.PI);
    }

    // Heavy oak & iron cathedral doors in rear (-Z) and front (+Z) walls
    this.buildCathedralDoors(0, -24.42, 0);
    this.buildCathedralDoors(0, 24.42, Math.PI);

    // Tall mullioned lancet stained-glass windows + cool blue moonlight beams
    const stainedGlassTex = this.createStainedGlassTexture();
    this.stainedGlassMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: stainedGlassTex,
        emissiveMap: stainedGlassTex,
        emissive: new THREE.Color(0x5da0ff),
        emissiveIntensity: 1.55,
        roughness: 0.25,
        metalness: 0.1,
      })
    );
    const glassMat = this.stainedGlassMat;
    const lancetFrameGeo = this.createPointedArchFrameGeometry(2.3, 6.8, 0.24, 0.32);
    const glassPaneGeo = this.trackGeometry(new THREE.PlaneGeometry(2.05, 6.1));
    const mullionGeo = this.trackGeometry(new THREE.BoxGeometry(0.11, 5.8, 0.18));
    const transomGeo = this.trackGeometry(new THREE.BoxGeometry(2.0, 0.1, 0.18));
    const oculusGeo = this.trackGeometry(new THREE.TorusGeometry(0.32, 0.055, 8, 18));

    const beamTex = this.createMoonlightBeamTexture();
    this.beamMat = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        map: beamTex,
        color: 0x7cb6ff,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const beamMat = this.beamMat;
    const beamGeo = this.trackGeometry(new THREE.PlaneGeometry(2.5, 13.0));

    const placeLancetWindow = (x: number, y: number, z: number, rotY: number, withBeam: boolean) => {
      const win = new THREE.Group();
      win.position.set(x, y, z);
      win.rotation.y = rotY;

      const glass = new THREE.Mesh(glassPaneGeo, glassMat);
      glass.position.set(0, 3.15, 0.02);
      win.add(glass);

      const frame = new THREE.Mesh(lancetFrameGeo, trimMat);
      frame.position.z = 0.05;
      win.add(frame);

      const centerMullion = new THREE.Mesh(mullionGeo, trimMat);
      centerMullion.position.set(0, 2.9, 0.14);
      win.add(centerMullion);

      for (const ty of [1.8, 3.8]) {
        const transom = new THREE.Mesh(transomGeo, trimMat);
        transom.position.set(0, ty, 0.14);
        win.add(transom);
      }

      const oculus = new THREE.Mesh(oculusGeo, trimMat);
      oculus.position.set(0, 5.45, 0.14);
      win.add(oculus);

      if (withBeam) {
        const beamPivot = new THREE.Group();
        beamPivot.position.set(0, 0.7, 4.9);
        beamPivot.rotation.x = -Math.PI * 0.28;

        const beam1 = new THREE.Mesh(beamGeo, beamMat);
        beamPivot.add(beam1);

        const beam2 = new THREE.Mesh(beamGeo, beamMat);
        beam2.rotation.y = Math.PI / 3;
        beamPivot.add(beam2);

        win.add(beamPivot);
        this.moonlightBeams.push(beam1, beam2);
      }

      this.scene.add(win);
    };

    // Clerestory lancet windows on rear, front, and side walls
    for (const wx of [-5.4, 5.4]) {
      placeLancetWindow(wx, 4.6, -24.38, 0, true);
      placeLancetWindow(wx, 4.6, 24.38, Math.PI, false);
    }
    for (const wz of [-14.0, -7.0, 0, 7.0, 14.0]) {
      placeLancetWindow(-12.98, 4.6, wz, Math.PI / 2, true);
      placeLancetWindow(12.98, 4.6, wz, -Math.PI / 2, true);
    }
  }

  private createPointedArchFrameGeometry(
    width: number,
    height: number,
    thickness: number,
    depth: number
  ): THREE.BufferGeometry {
    const hw = width * 0.5;
    const springY = height * 0.62;
    const outerShape = new THREE.Shape();
    outerShape.moveTo(-hw - thickness, 0);
    outerShape.lineTo(-hw - thickness, springY);
    outerShape.quadraticCurveTo(-hw - thickness * 0.5, height * 0.92, 0, height + thickness * 0.8);
    outerShape.quadraticCurveTo(hw + thickness * 0.5, height * 0.92, hw + thickness, springY);
    outerShape.lineTo(hw + thickness, 0);
    outerShape.lineTo(hw, 0);
    outerShape.lineTo(hw, springY);
    outerShape.quadraticCurveTo(hw * 0.72, height * 0.88, 0, height);
    outerShape.quadraticCurveTo(-hw * 0.72, height * 0.88, -hw, springY);
    outerShape.lineTo(-hw, 0);
    outerShape.closePath();

    const geo = this.trackGeometry(
      new THREE.ExtrudeGeometry(outerShape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 1,
        curveSegments: 10,
      })
    );
    geo.computeVertexNormals();
    return geo;
  }

  private buildCathedralDoors(x: number, z: number, rotY: number): void {
    const group = new THREE.Group();
    group.position.set(x, -0.65, z);
    group.rotation.y = rotY;

    const stoneMat = this.columnStoneMat;
    if (!this.doorWoodMat) {
      this.doorWoodMat = this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: 0x2a1b12,
          roughness: 0.78,
          metalness: 0.06,
        })
      );
    }
    const oakMat = this.doorWoodMat;
    if (!this.doorIronMat) {
      this.doorIronMat = this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: 0x1a1d24,
          roughness: 0.36,
          metalness: 0.85,
        })
      );
    }
    const ironMat = this.doorIronMat;
    if (!this.doorBrassMat) {
      this.doorBrassMat = this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: 0xc29b38,
          roughness: 0.3,
          metalness: 0.88,
        })
      );
    }
    const brassMat = this.doorBrassMat;

    const portalFrameGeo = this.createPointedArchFrameGeometry(3.8, 6.2, 0.48, 0.45);
    const portal = new THREE.Mesh(portalFrameGeo, stoneMat);
    portal.castShadow = true;
    portal.receiveShadow = true;
    group.add(portal);

    // Double oak door panels
    const leafGeo = this.trackGeometry(new THREE.BoxGeometry(1.82, 5.6, 0.18));
    const leftLeaf = new THREE.Mesh(leafGeo, oakMat);
    leftLeaf.position.set(-0.92, 2.8, 0.05);
    group.add(leftLeaf);

    const rightLeaf = new THREE.Mesh(leafGeo, oakMat);
    rightLeaf.position.set(0.92, 2.8, 0.05);
    group.add(rightLeaf);

    // Center iron seam & horizontal wrought-iron hinge straps
    const seamGeo = this.trackGeometry(new THREE.BoxGeometry(0.1, 5.5, 0.24));
    const seam = new THREE.Mesh(seamGeo, ironMat);
    seam.position.set(0, 2.75, 0.08);
    group.add(seam);

    const strapGeo = this.trackGeometry(new THREE.BoxGeometry(1.62, 0.12, 0.05));
    for (const sy of [1.1, 2.6, 4.1]) {
      for (const sx of [-0.94, 0.94]) {
        const strap = new THREE.Mesh(strapGeo, ironMat);
        strap.position.set(sx, sy, 0.16);
        group.add(strap);
      }
    }

    // Heavy iron/brass ring door knockers
    const ringGeo = this.trackGeometry(new THREE.TorusGeometry(0.16, 0.032, 8, 18));
    for (const sx of [-0.42, 0.42]) {
      const ring = new THREE.Mesh(ringGeo, brassMat);
      ring.position.set(sx, 2.0, 0.22);
      group.add(ring);
    }

    this.scene.add(group);
  }

  private createStainedGlassTexture(): THREE.CanvasTexture {
    const w = 256;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#7AC2FF');
    grad.addColorStop(0.4, '#2A59B8');
    grad.addColorStop(0.85, '#172E6E');
    grad.addColorStop(1, '#0F1C44');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Diamond lead glass panes + subtle jewel highlights
    const step = 32;
    ctx.strokeStyle = 'rgba(10, 14, 24, 0.85)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= h; y += step) {
      for (let x = 0; x <= w; x += step) {
        if (((x + y) / step) % 5 === 0) {
          ctx.fillStyle = 'rgba(130, 195, 255, 0.35)';
          ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
        } else if (((x * 3 + y) / step) % 7 === 0) {
          ctx.fillStyle = 'rgba(180, 130, 255, 0.28)';
          ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
        }
        ctx.strokeRect(x, y, step, step);
      }
    }

    // Rose rosette at upper lancet
    ctx.beginPath();
    ctx.arc(w / 2, 100, 42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(155, 215, 255, 0.55)';
    ctx.fill();
    ctx.stroke();

    const tex = this.trackTexture(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createMoonlightBeamTexture(): THREE.CanvasTexture {
    const w = 128;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    const vGrad = ctx.createLinearGradient(0, 0, 0, h);
    vGrad.addColorStop(0, 'rgba(180, 220, 255, 0.9)');
    vGrad.addColorStop(0.65, 'rgba(120, 175, 255, 0.35)');
    vGrad.addColorStop(1, 'rgba(90, 145, 255, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);

    // Soft horizontal vignette so cone edges fade invisibly
    ctx.globalCompositeOperation = 'destination-in';
    const hGrad = ctx.createLinearGradient(0, 0, w, 0);
    hGrad.addColorStop(0, 'rgba(0,0,0,0)');
    hGrad.addColorStop(0.25, 'rgba(0,0,0,1)');
    hGrad.addColorStop(0.75, 'rgba(0,0,0,1)');
    hGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, w, h);

    return this.trackTexture(new THREE.CanvasTexture(canvas));
  }

  // ---------------------------------------------------------------------------
  // Flaming Wrought-Iron Braziers (x = -5.6, z = 0 and x = +5.6, z = 0)
  // ---------------------------------------------------------------------------

  private createGlowSpriteTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(255, 235, 190, 0.75)');
    grad.addColorStop(0.7, 'rgba(255, 140, 45, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = this.trackTexture(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildBraziers(): void {
    this.brazierPedestalMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1e222b,
        roughness: 0.72,
        metalness: 0.08,
      })
    );
    const stonePedestalMat = this.brazierPedestalMat;
    this.brazierIronMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x171920,
        roughness: 0.36,
        metalness: 0.86,
      })
    );
    const ironMat = this.brazierIronMat;
    this.brazierRimMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xb89334,
        roughness: 0.3,
        metalness: 0.88,
      })
    );
    const goldAccentMat = this.brazierRimMat;

    const spriteTex = this.createGlowSpriteTexture();

    const pedBaseGeo = this.trackGeometry(new THREE.CylinderGeometry(0.26, 0.3, 0.56, 8));
    const pedCapGeo = this.trackGeometry(new THREE.CylinderGeometry(0.28, 0.24, 0.14, 8));
    const stemGeo = this.trackGeometry(new THREE.CylinderGeometry(0.08, 0.12, 1.05, 8));
    const bowlGeo = this.trackGeometry(new THREE.CylinderGeometry(0.38, 0.18, 0.34, 10));
    const rimRingGeo = this.trackGeometry(new THREE.TorusGeometry(0.38, 0.032, 8, 16));
    const strutGeo = this.trackGeometry(new THREE.BoxGeometry(0.04, 0.75, 0.04));
    const emberGeo = this.trackGeometry(new THREE.IcosahedronGeometry(0.24, 1));
    const flameConeGeo = this.trackGeometry(new THREE.ConeGeometry(0.22, 0.75, 10));

    const positions: Array<[number, number]> = [
      [-5.6, 0],
      [5.6, 0],
    ];

    positions.forEach(([bx, bz], index) => {
      const group = new THREE.Group();
      group.position.set(bx, 0, bz);

      // Stepped stone pedestal sitting on cathedral floor (y = -0.65 -> -0.02)
      const pedBase = new THREE.Mesh(pedBaseGeo, stonePedestalMat);
      pedBase.position.y = -0.37;
      pedBase.castShadow = true;
      pedBase.receiveShadow = true;
      group.add(pedBase);

      const pedCap = new THREE.Mesh(pedCapGeo, stonePedestalMat);
      pedCap.position.y = -0.02;
      pedCap.castShadow = true;
      pedCap.receiveShadow = true;
      group.add(pedCap);

      // Forged wrought-iron column & basket bowl
      const stem = new THREE.Mesh(stemGeo, ironMat);
      stem.position.y = 0.56;
      stem.castShadow = true;
      group.add(stem);

      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const strut = new THREE.Mesh(strutGeo, ironMat);
        strut.position.set(Math.cos(a) * 0.16, 0.75, Math.sin(a) * 0.16);
        strut.rotation.z = -Math.cos(a) * 0.25;
        strut.rotation.x = Math.sin(a) * 0.25;
        group.add(strut);
      }

      const bowl = new THREE.Mesh(bowlGeo, ironMat);
      bowl.position.y = 1.24;
      bowl.castShadow = true;
      group.add(bowl);

      const rimRing = new THREE.Mesh(rimRingGeo, goldAccentMat);
      rimRing.rotation.x = Math.PI / 2;
      rimRing.position.y = 1.4;
      group.add(rimRing);

      // Glowing ember core inside the bowl
      const emberMat = this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: 0x3b1206,
          emissive: new THREE.Color(0xff4c12),
          emissiveIntensity: 2.3,
          roughness: 0.7,
        })
      );
      this.brazierEmberMats.push(emberMat);
      const emberCore = new THREE.Mesh(emberGeo, emberMat);
      emberCore.scale.set(1.15, 0.52, 1.15);
      emberCore.position.y = 1.38;
      group.add(emberCore);

      // Layered flame cones (outer crimson-orange, mid amber, inner bright core)
      const outerMat = this.trackMaterial(
        new THREE.MeshBasicMaterial({
          color: 0xff5412,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const midMat = this.trackMaterial(
        new THREE.MeshBasicMaterial({
          color: 0xff9a24,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const innerMat = this.trackMaterial(
        new THREE.MeshBasicMaterial({
          color: 0xffe484,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.brazierOuterFlameMats.push(outerMat);
      this.brazierMidFlameMats.push(midMat);
      this.brazierInnerFlameMats.push(innerMat);

      const outerFlame = new THREE.Mesh(flameConeGeo, outerMat);
      outerFlame.position.y = 1.72;
      group.add(outerFlame);

      const midFlame = new THREE.Mesh(flameConeGeo, midMat);
      midFlame.scale.set(0.74, 0.85, 0.74);
      midFlame.position.y = 1.68;
      group.add(midFlame);

      const innerFlame = new THREE.Mesh(flameConeGeo, innerMat);
      innerFlame.scale.set(0.45, 0.62, 0.45);
      innerFlame.position.y = 1.62;
      group.add(innerFlame);

      // Rising animated flame/ember particles
      const pCount = 28;
      const pPos = new Float32Array(pCount * 3);
      const pVel = new Float32Array(pCount * 3);
      const pAge = new Float32Array(pCount);
      const pLife = new Float32Array(pCount);

      for (let i = 0; i < pCount; i++) {
        pAge[i] = Math.random() * 1.1;
        pLife[i] = 0.75 + Math.random() * 0.55;
        this.resetBrazierParticle(i, bx, 1.44, bz, pPos, pVel);
      }

      const pGeo = this.trackGeometry(new THREE.BufferGeometry());
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      const pMat = this.trackMaterial(
        new THREE.PointsMaterial({
          map: spriteTex,
          color: 0xff8a2b,
          size: 0.22,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      this.brazierParticleMats.push(pMat);
      const particles = new THREE.Points(pGeo, pMat);
      this.scene.add(particles);

      // Warm flickering orange fire PointLight
      const light = this.trackLight(new THREE.PointLight(0xff7d2b, 4.6, 15.0, 1.55));
      light.position.set(bx, 1.9, bz);
      this.scene.add(light);

      this.scene.add(group);
      this.braziers.push({
        light,
        baseIntensity: 4.6,
        phase: index * 2.15,
        emberCore,
        outerFlame,
        midFlame,
        innerFlame,
        particles,
        particlePositions: pPos,
        particleVelocities: pVel,
        particleAges: pAge,
        particleLifetimes: pLife,
        origin: new THREE.Vector3(bx, 1.44, bz),
      });
    });
  }

  private resetBrazierParticle(
    index: number,
    ox: number,
    oy: number,
    oz: number,
    pos: Float32Array,
    vel: Float32Array
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.16;
    pos[index * 3] = ox + Math.cos(angle) * rad;
    pos[index * 3 + 1] = oy + Math.random() * 0.08;
    pos[index * 3 + 2] = oz + Math.sin(angle) * rad;

    vel[index * 3] = (Math.random() - 0.5) * 0.22;
    vel[index * 3 + 1] = 0.85 + Math.random() * 0.75;
    vel[index * 3 + 2] = (Math.random() - 0.5) * 0.22;
  }

  private updateBraziers(dt: number, elapsed: number): void {
    for (const b of this.braziers) {
      const t = elapsed + b.phase;
      const flicker =
        Math.sin(t * 7.3) * 0.42 +
        Math.sin(t * 14.9 + 1.4) * 0.26 +
        Math.cos(t * 23.1) * 0.14;

      b.light.intensity = b.baseIntensity + flicker;
      const emberMat = b.emberCore.material as THREE.MeshStandardMaterial;
      emberMat.emissiveIntensity = 2.1 + flicker * 0.45;

      // Animate flame tongues
      b.outerFlame.scale.set(
        1.0 + Math.sin(t * 9.5) * 0.12,
        1.0 + Math.cos(t * 11.2) * 0.18,
        1.0 + Math.cos(t * 8.7) * 0.12
      );
      b.outerFlame.rotation.z = Math.sin(t * 6.4) * 0.12;
      b.outerFlame.rotation.x = Math.cos(t * 7.8) * 0.1;

      b.midFlame.scale.set(
        0.74 + Math.cos(t * 12.1) * 0.09,
        0.85 + Math.sin(t * 14.5) * 0.16,
        0.74 + Math.sin(t * 10.6) * 0.09
      );
      b.midFlame.rotation.z = Math.cos(t * 8.2) * 0.11;

      b.innerFlame.scale.set(
        0.45 + Math.sin(t * 16.2) * 0.06,
        0.62 + Math.cos(t * 18.0) * 0.12,
        0.45 + Math.cos(t * 15.1) * 0.06
      );

      // Update rising ember particles
      const count = b.particleAges.length;
      for (let i = 0; i < count; i++) {
        b.particleAges[i] += dt;
        if (b.particleAges[i] >= b.particleLifetimes[i]) {
          b.particleAges[i] = 0;
          b.particleLifetimes[i] = 0.7 + Math.random() * 0.55;
          this.resetBrazierParticle(
            i,
            b.origin.x,
            b.origin.y,
            b.origin.z,
            b.particlePositions,
            b.particleVelocities
          );
        } else {
          const i3 = i * 3;
          const swirl = Math.sin(elapsed * 5 + i) * 0.12 * dt;
          b.particlePositions[i3] += b.particleVelocities[i3] * dt + swirl;
          b.particlePositions[i3 + 1] += b.particleVelocities[i3 + 1] * dt;
          b.particlePositions[i3 + 2] += b.particleVelocities[i3 + 2] * dt;
        }
      }
      const posAttr = b.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Atmospheric Dust Motes
  // ---------------------------------------------------------------------------

  private buildDustMotes(): void {
    const count = 240;
    const rand = createSeededRandom(8842);
    const basePositions = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 21;
      const y = 0.25 + rand() * 8.8;
      const z = (rand() - 0.5) * 21;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      phases[i] = rand() * Math.PI * 2;
      speeds[i] = 0.25 + rand() * 0.5;
    }

    const geo = this.trackGeometry(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const moteTex = this.createGlowSpriteTexture();
    const mat = this.trackMaterial(
      new THREE.PointsMaterial({
        map: moteTex,
        color: 0xd8c6a6,
        size: 0.085,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.dustMotes = {
      points,
      material: mat,
      mode: 'dust',
      basePositions,
      phases,
      speeds,
      count,
    };
  }

  private updateDustMotes(dt: number, elapsed: number): void {
    if (!this.dustMotes) return;
    const { points, mode, basePositions, phases, speeds, count } = this.dustMotes;
    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const t = elapsed * speeds[i] + phases[i];

      if (mode === 'sakura' || mode === 'snow') {
        const fallSpeed = mode === 'sakura' ? 0.72 : 0.56;
        basePositions[i3 + 1] -= fallSpeed * (0.65 + speeds[i] * 0.45) * dt;
        if (basePositions[i3 + 1] < -0.5) {
          basePositions[i3 + 1] = 9.2;
        }
        const swayAmp = mode === 'sakura' ? 0.65 : 0.35;
        arr[i3] = basePositions[i3] + Math.sin(t * 1.4) * swayAmp;
        arr[i3 + 1] = basePositions[i3 + 1];
        arr[i3 + 2] = basePositions[i3 + 2] + Math.cos(t * 1.1 + 0.8) * swayAmp;
      } else if (mode === 'embers') {
        basePositions[i3 + 1] += 1.05 * (0.6 + speeds[i] * 0.6) * dt;
        if (basePositions[i3 + 1] > 9.2) {
          basePositions[i3 + 1] = -0.5;
        }
        arr[i3] = basePositions[i3] + Math.sin(t * 2.2) * 0.42;
        arr[i3 + 1] = basePositions[i3 + 1];
        arr[i3 + 2] = basePositions[i3 + 2] + Math.cos(t * 2.0 + 1.1) * 0.42;
      } else {
        arr[i3] = basePositions[i3] + Math.sin(t) * 0.24;
        arr[i3 + 1] = basePositions[i3 + 1] + Math.cos(t * 0.7) * 0.18;
        arr[i3 + 2] = basePositions[i3 + 2] + Math.sin(t * 0.85 + 1.2) * 0.24;
      }
    }
    posAttr.needsUpdate = true;
  }

  private getOrBuildThemeTextures(cfg: ThemeConfig): ThemeTextureBundle {
    const cached = this.themeTextureCache.get(cfg.id);
    if (cached) return cached;

    if (cfg.id === 'gothic') {
      const bundle: ThemeTextureBundle = {
        lightMap: this.lightSquareMat.map as THREE.CanvasTexture,
        darkMap: this.darkSquareMat.map as THREE.CanvasTexture,
        borderMap: this.obsidianTopMat.map as THREE.CanvasTexture,
        borderRough: this.obsidianTopMat.roughnessMap as THREE.CanvasTexture,
        borderBump: this.obsidianTopMat.bumpMap as THREE.CanvasTexture,
        borderEmissive: this.obsidianTopMat.emissiveMap as THREE.CanvasTexture,
        glassMap: this.stainedGlassMat.map as THREE.CanvasTexture,
        wallMap: this.wallMat.map as THREE.CanvasTexture,
        floorMap: this.floorMat.map as THREE.CanvasTexture,
      };
      this.themeTextureCache.set('gothic', bundle);
      return bundle;
    }

    const lightSq = this.createThemedSquareTexture(true, cfg);
    const darkSq = this.createThemedSquareTexture(false, cfg);
    const border = this.createThemedBorderTextures(cfg);
    const glassMap = this.createThemedWindowTexture(cfg);
    const wallMap = this.createThemedWallTexture(cfg);
    const floorMap = this.createThemedFloorTexture(cfg);

    const bundle: ThemeTextureBundle = {
      lightMap: lightSq,
      darkMap: darkSq,
      borderMap: border.map,
      borderRough: border.roughnessMap,
      borderBump: border.bumpMap,
      borderEmissive: border.emissiveMap,
      glassMap,
      wallMap,
      floorMap,
    };
    this.themeTextureCache.set(cfg.id, bundle);
    return bundle;
  }

  private createThemedSquareTexture(isLight: boolean, cfg: ThemeConfig): THREE.CanvasTexture {
    const size = 512;
    const rand = createSeededRandom(
      (isLight ? 4109 : 9203) + cfg.id.charCodeAt(0) * 131 + cfg.id.charCodeAt(1) * 17,
    );
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = isLight ? cfg.board.lightSquareHex : cfg.board.darkSquareHex;
    ctx.fillRect(0, 0, size, size);

    const veinColor = isLight ? cfg.board.lightVeinHex : cfg.board.darkVeinHex;
    for (let v = 0; v < 18; v++) {
      let x = rand() * size;
      let y = rand() * size;
      let angle = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 26; s++) {
        angle += (rand() - 0.5) * 0.72;
        x += Math.cos(angle) * (8 + rand() * 12);
        y += Math.sin(angle) * (8 + rand() * 12);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = veinColor;
      ctx.lineWidth = 0.8 + rand() * 2.4;
      ctx.stroke();
    }

    const tex = this.trackTexture(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.maxAnisotropy();
    return tex;
  }

  private createThemedBorderTextures(cfg: ThemeConfig): {
    map: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = 1024;
    const rand = createSeededRandom(7731 + cfg.id.charCodeAt(0) * 97);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d')!;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d')!;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d')!;

    const emisCanvas = document.createElement('canvas');
    emisCanvas.width = size;
    emisCanvas.height = size;
    const eCtx = emisCanvas.getContext('2d')!;

    dCtx.fillStyle = cfg.board.borderBaseHex;
    dCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#383838';
    rCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, size, size);

    // Theme veins along margins
    for (let i = 0; i < 32; i++) {
      let x = rand() * size;
      let y = rand() * size;
      let ang = rand() * Math.PI * 2;
      dCtx.beginPath();
      dCtx.moveTo(x, y);
      for (let s = 0; s < 10; s++) {
        ang += (rand() - 0.5) * 0.8;
        x += Math.cos(ang) * 26;
        y += Math.sin(ang) * 26;
        dCtx.lineTo(x, y);
      }
      dCtx.strokeStyle = cfg.board.borderVeinHex;
      dCtx.lineWidth = 1.2 + rand() * 1.4;
      dCtx.stroke();
    }

    // Accent trim frames
    for (const [inset, lw] of [
      [14, 3],
      [24, 1.8],
      [98, 2.5],
    ]) {
      const w = size - inset * 2;
      dCtx.strokeStyle = cfg.board.runeHex;
      dCtx.lineWidth = lw;
      dCtx.strokeRect(inset, inset, w, w);
      eCtx.strokeStyle = cfg.board.runeHex;
      eCtx.lineWidth = lw;
      eCtx.strokeRect(inset, inset, w, w);
    }

    // Realm-specific glyphs along all 4 sides
    const drawMotif = (idx: number, cx: number, cy: number, rad: number, rot: number) => {
      const drawTo = (ctx: CanvasRenderingContext2D, color: string, lw: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (cfg.board.runeStyle === 'samurai') {
          // Torii gate & diamond kamon alternating motifs
          if (idx % 2 === 0) {
            ctx.moveTo(-rad * 0.85, -rad * 0.55);
            ctx.lineTo(rad * 0.85, -rad * 0.55);
            ctx.moveTo(-rad * 0.6, -rad * 0.2);
            ctx.lineTo(rad * 0.6, -rad * 0.2);
            ctx.moveTo(-rad * 0.42, -rad * 0.55);
            ctx.lineTo(-rad * 0.42, rad * 0.75);
            ctx.moveTo(rad * 0.42, -rad * 0.55);
            ctx.lineTo(rad * 0.42, rad * 0.75);
          } else {
            ctx.arc(0, 0, rad * 0.68, 0, Math.PI * 2);
            ctx.moveTo(0, -rad * 0.48);
            ctx.lineTo(rad * 0.48, 0);
            ctx.lineTo(0, rad * 0.48);
            ctx.lineTo(-rad * 0.48, 0);
            ctx.closePath();
          }
        } else if (cfg.board.runeStyle === 'hieroglyph') {
          // Ankh & Pyramid lotus motifs
          if (idx % 2 === 0) {
            ctx.arc(0, -rad * 0.42, rad * 0.28, 0, Math.PI * 2);
            ctx.moveTo(0, -rad * 0.14);
            ctx.lineTo(0, rad * 0.82);
            ctx.moveTo(-rad * 0.55, rad * 0.15);
            ctx.lineTo(rad * 0.55, rad * 0.15);
          } else {
            ctx.moveTo(0, -rad * 0.75);
            ctx.lineTo(rad * 0.7, rad * 0.65);
            ctx.lineTo(-rad * 0.7, rad * 0.65);
            ctx.closePath();
            ctx.moveTo(-rad * 0.35, 0);
            ctx.lineTo(rad * 0.35, 0);
          }
        } else if (cfg.board.runeStyle === 'astral') {
          // Constellation & astrolabe rings
          ctx.arc(0, 0, rad * 0.52, 0, Math.PI * 2);
          ctx.moveTo(0, -rad * 0.85);
          ctx.lineTo(0, rad * 0.85);
          ctx.moveTo(-rad * 0.85, 0);
          ctx.lineTo(rad * 0.85, 0);
        } else {
          const strokes = ELDER_FUTHARK_STROKES[idx % ELDER_FUTHARK_STROKES.length];
          for (const [x1, y1, x2, y2] of strokes) {
            ctx.moveTo(x1 * rad, y1 * rad);
            ctx.lineTo(x2 * rad, y2 * rad);
          }
        }
        ctx.stroke();
        ctx.restore();
      };
      drawTo(bCtx, '#383838', 5);
      drawTo(dCtx, cfg.board.runeHex, 3.8);
      drawTo(eCtx, cfg.board.runeHex, 3.6);
    };

    const spanStart = 120;
    const spanEnd = size - 120;
    for (let i = 0; i < 14; i++) {
      const p = spanStart + (i / 13) * (spanEnd - spanStart);
      drawMotif(i, p, 58, 19, Math.PI);
      drawMotif(i + 5, p, size - 58, 19, 0);
      drawMotif(i + 10, 58, p, 19, -Math.PI / 2);
      drawMotif(i + 15, size - 58, p, 19, Math.PI / 2);
    }

    const map = this.trackTexture(new THREE.CanvasTexture(diffCanvas));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = this.maxAnisotropy();

    const roughnessMap = this.trackTexture(new THREE.CanvasTexture(roughCanvas));
    const bumpMap = this.trackTexture(new THREE.CanvasTexture(bumpCanvas));
    const emissiveMap = this.trackTexture(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;

    return { map, roughnessMap, bumpMap, emissiveMap };
  }

  private createThemedWindowTexture(cfg: ThemeConfig): THREE.CanvasTexture {
    const w = 256;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, h);

    if (cfg.environment.windowStyle === 'shoji') {
      grad.addColorStop(0, '#FFD4A3');
      grad.addColorStop(0.55, '#E07A5F');
      grad.addColorStop(1, '#5C1B1B');
    } else if (cfg.environment.windowStyle === 'solar') {
      grad.addColorStop(0, '#FFF1A8');
      grad.addColorStop(0.5, '#F59E0B');
      grad.addColorStop(1, '#78350F');
    } else if (cfg.environment.windowStyle === 'aurora') {
      grad.addColorStop(0, '#A5F3FC');
      grad.addColorStop(0.5, '#0284C7');
      grad.addColorStop(1, '#0C4A6E');
    } else if (cfg.environment.windowStyle === 'magma') {
      grad.addColorStop(0, '#FDBA74');
      grad.addColorStop(0.45, '#DC2626');
      grad.addColorStop(1, '#450A0A');
    } else {
      grad.addColorStop(0, '#E9D5FF');
      grad.addColorStop(0.5, '#7E22CE');
      grad.addColorStop(1, '#1E1B4B');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(10, 10, 16, 0.85)';
    ctx.lineWidth = 4;
    const step = cfg.environment.windowStyle === 'shoji' ? 42 : 32;
    for (let y = 0; y <= h; y += step) {
      for (let x = 0; x <= w; x += step) {
        ctx.strokeRect(x, y, step, step);
      }
    }

    const tex = this.trackTexture(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createThemedWallTexture(cfg: ThemeConfig): THREE.CanvasTexture {
    const size = 512;
    const rand = createSeededRandom(5507 + cfg.id.charCodeAt(0) * 61);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = cfg.environment.wallBaseHex;
    ctx.fillRect(0, 0, size, size);

    const baseCol = new THREE.Color(cfg.environment.wallBaseHex);
    const rows = 10;
    const cols = 6;
    const rowH = size / rows;
    const colW = size / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (colW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const shade = 0.85 + rand() * 0.35;
        const rc = Math.min(255, Math.round(baseCol.r * 255 * shade));
        const gc = Math.min(255, Math.round(baseCol.g * 255 * shade));
        const bc = Math.min(255, Math.round(baseCol.b * 255 * shade));
        ctx.fillStyle = `rgb(${rc},${gc},${bc})`;
        ctx.fillRect(c * colW + off + 2, r * rowH + 2, colW - 4, rowH - 4);
      }
    }
    const tex = this.trackTexture(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    return tex;
  }

  private createThemedFloorTexture(cfg: ThemeConfig): THREE.CanvasTexture {
    const size = 512;
    const rand = createSeededRandom(3181 + cfg.id.charCodeAt(0) * 43);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = cfg.environment.floorBaseHex;
    ctx.fillRect(0, 0, size, size);

    const baseCol = new THREE.Color(cfg.environment.floorBaseHex);
    const tile = size / 4;
    for (let gx = 0; gx < 4; gx++) {
      for (let gy = 0; gy < 4; gy++) {
        const shade = 0.88 + rand() * 0.3;
        const rc = Math.min(255, Math.round(baseCol.r * 255 * shade));
        const gc = Math.min(255, Math.round(baseCol.g * 255 * shade));
        const bc = Math.min(255, Math.round(baseCol.b * 255 * shade));
        ctx.fillStyle = `rgb(${rc},${gc},${bc})`;
        ctx.fillRect(gx * tile + 3, gy * tile + 3, tile - 6, tile - 6);
      }
    }
    const tex = this.trackTexture(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 11);
    tex.anisotropy = this.maxAnisotropy();
    return tex;
  }
}
