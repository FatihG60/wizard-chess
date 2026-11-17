import * as THREE from 'three';
import { THEMES } from '../themes';
import {
  ArticulatedPiece,
  LegalMoveOption,
  PieceColor,
  PieceType,
  Square,
  ThemeId,
  squareToWorld,
} from '../types';

interface TransientVFX {
  group: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  age: number;
  lifetime: number;
  onUpdate: (t: number) => void;
}

interface DebrisShard {
  mesh: THREE.Mesh;
  materials: THREE.Material[];
  ownsGeometry: boolean;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  radius: number;
  baseScale: number;
  age: number;
  lifetime: number;
  fadeStart: number;
}

interface ScorchDecal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  lifetime: number;
}

interface SmokePuff {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  velocity: THREE.Vector3;
  startScale: number;
  endScale: number;
  baseOpacity: number;
  age: number;
  lifetime: number;
}

/**
 * Handles board tactical indicators (legal move discs, capture target rings,
 * selected-square gold halo, checkmate/check crimson ring) and Wizard's Chess
 * piece shatter physics + volumetric dust/smoke puffs.
 */
export class CombatFX {
  private readonly scene: THREE.Scene;
  private readonly highlightGroup: THREE.Group;
  private readonly scorchGroup: THREE.Group;
  private readonly checkGroup: THREE.Group;
  private readonly debrisGroup: THREE.Group;

  private readonly planeGeo: THREE.PlaneGeometry;
  private readonly selectedTex: THREE.CanvasTexture;
  private readonly quietMoveTex: THREE.CanvasTexture;
  private readonly captureMoveTex: THREE.CanvasTexture;
  private readonly checkHaloTex: THREE.CanvasTexture;
  private readonly scorchTex: THREE.CanvasTexture;

  private readonly selectedMat: THREE.MeshBasicMaterial;
  private readonly quietMoveMat: THREE.MeshBasicMaterial;
  private readonly captureMoveMat: THREE.MeshBasicMaterial;
  private readonly checkHaloMat: THREE.MeshBasicMaterial;
  private readonly checkInnerMat: THREE.MeshBasicMaterial;

  private checkOuterMesh: THREE.Mesh | null = null;
  private checkInnerMesh: THREE.Mesh | null = null;
  private checkActive = false;
  private isCheckmateActive = false;

  private readonly quietMeshes: THREE.Mesh[] = [];
  private readonly captureMeshes: THREE.Mesh[] = [];
  private selectedMesh: THREE.Mesh | null = null;

  private readonly shardGeometries: THREE.BufferGeometry[] = [];
  private readonly smokeGeo: THREE.SphereGeometry;

  private readonly ivoryShardBaseMat: THREE.MeshStandardMaterial;
  private readonly obsidianShardBaseMat: THREE.MeshStandardMaterial;
  private readonly goldShardBaseMat: THREE.MeshStandardMaterial;

  private readonly shards: DebrisShard[] = [];
  private readonly smokePuffs: SmokePuff[] = [];
  private readonly transientVfx: TransientVFX[] = [];
  private readonly scorchDecals: ScorchDecal[] = [];
  private readonly vfxGroup: THREE.Group;
  private readonly gemSparkGeo: THREE.OctahedronGeometry;

  private selectedAuraGroup: THREE.Group | null = null;
  private selectedOuterRing: THREE.Mesh | null = null;
  private selectedInnerRing: THREE.Mesh | null = null;
  private currentTheme: ThemeId = 'gothic';

  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.highlightGroup = new THREE.Group();
    this.scorchGroup = new THREE.Group();
    this.checkGroup = new THREE.Group();
    this.debrisGroup = new THREE.Group();
    this.vfxGroup = new THREE.Group();
    this.scene.add(this.scorchGroup);
    this.scene.add(this.highlightGroup);
    this.scene.add(this.checkGroup);
    this.scene.add(this.debrisGroup);
    this.scene.add(this.vfxGroup);

    this.planeGeo = new THREE.PlaneGeometry(1, 1);
    this.planeGeo.rotateX(-Math.PI / 2);

    this.selectedTex = this.createSelectedSquareTexture();
    this.quietMoveTex = this.createQuietMoveTexture();
    this.captureMoveTex = this.createCaptureRingTexture();
    this.checkHaloTex = this.createCheckHaloTexture();
    this.scorchTex = this.createScorchTexture();
    this.gemSparkGeo = new THREE.OctahedronGeometry(0.042, 0);

    this.selectedMat = new THREE.MeshBasicMaterial({
      map: this.selectedTex,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    this.quietMoveMat = new THREE.MeshBasicMaterial({
      map: this.quietMoveTex,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    this.captureMoveMat = new THREE.MeshBasicMaterial({
      map: this.captureMoveTex,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    this.checkHaloMat = new THREE.MeshBasicMaterial({
      map: this.checkHaloTex,
      color: new THREE.Color(2.2, 2.2, 2.2),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    this.checkInnerMat = new THREE.MeshBasicMaterial({
      map: this.checkHaloTex,
      color: 0xff5a36,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    // Prebuild 8 watertight flat-faceted angular Voronoi-like stone shard geometries
    for (let i = 0; i < 8; i++) {
      this.shardGeometries.push(this.createVoronoiShardGeometry(i + 1));
    }

    this.smokeGeo = new THREE.SphereGeometry(1, 12, 10);

    this.ivoryShardBaseMat = new THREE.MeshStandardMaterial({
      color: 0xebe3d4,
      roughness: 0.3,
      metalness: 0.05,
      transparent: true,
      opacity: 1,
      flatShading: true,
    });

    this.obsidianShardBaseMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.24,
      metalness: 0.16,
      transparent: true,
      opacity: 1,
      flatShading: true,
    });

    this.goldShardBaseMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.24,
      metalness: 0.88,
      transparent: true,
      opacity: 1,
      flatShading: true,
    });
  }

  setTheme(themeId: ThemeId): void {
    this.currentTheme = themeId;
    const vfx = THEMES[themeId].combatVfx;
    this.ivoryShardBaseMat.color.setHex(vfx.whiteShardHex);
    this.obsidianShardBaseMat.color.setHex(vfx.blackShardHex);
    this.goldShardBaseMat.color.setHex(vfx.trimShardHex);
  }

  showLegalMoves(selectedSquare: Square | null, moves: LegalMoveOption[]): void {
    this.clearHighlights();

    if (selectedSquare) {
      const { x, z } = squareToWorld(selectedSquare);
      const selMesh = new THREE.Mesh(this.planeGeo, this.selectedMat);
      selMesh.position.set(x, 0.018, z);
      selMesh.scale.set(0.96, 1, 0.96);
      this.highlightGroup.add(selMesh);
      this.selectedMesh = selMesh;

      // Rotating arcane selection aura underneath levitating selected piece
      const auraGroup = new THREE.Group();
      auraGroup.position.set(x, 0.032, z);
      const themeVfx = THEMES[this.currentTheme].combatVfx;

      const outerGeo = new THREE.RingGeometry(0.36, 0.43, 32);
      outerGeo.rotateX(-Math.PI / 2);
      const outerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeVfx.selectHex),
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      auraGroup.add(outerMesh);

      const innerGeo = new THREE.RingGeometry(0.24, 0.28, 6);
      innerGeo.rotateX(-Math.PI / 2);
      const innerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeVfx.quietHex),
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.position.y = 0.004;
      auraGroup.add(innerMesh);

      this.highlightGroup.add(auraGroup);
      this.selectedAuraGroup = auraGroup;
      this.selectedOuterRing = outerMesh;
      this.selectedInnerRing = innerMesh;
    }

    const seenTargets = new Set<string>();
    for (const move of moves) {
      const isThreat = move.isCapture || move.isEnPassant;
      const key = `${move.to}:${isThreat ? 'c' : 'q'}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);

      const { x, z } = squareToWorld(move.to);
      if (isThreat) {
        const capMesh = new THREE.Mesh(this.planeGeo, this.captureMoveMat);
        capMesh.position.set(x, 0.025, z);
        capMesh.scale.set(0.92, 1, 0.92);
        this.highlightGroup.add(capMesh);
        this.captureMeshes.push(capMesh);
      } else {
        const quietMesh = new THREE.Mesh(this.planeGeo, this.quietMoveMat);
        quietMesh.position.set(x, 0.025, z);
        quietMesh.scale.set(0.68, 1, 0.68);
        this.highlightGroup.add(quietMesh);
        this.quietMeshes.push(quietMesh);
      }
    }
  }

  clearHighlights(): void {
    if (this.selectedOuterRing) {
      this.selectedOuterRing.geometry.dispose();
      (this.selectedOuterRing.material as THREE.Material).dispose();
    }
    if (this.selectedInnerRing) {
      this.selectedInnerRing.geometry.dispose();
      (this.selectedInnerRing.material as THREE.Material).dispose();
    }
    while (this.highlightGroup.children.length > 0) {
      this.highlightGroup.remove(this.highlightGroup.children[0]);
    }
    this.quietMeshes.length = 0;
    this.captureMeshes.length = 0;
    this.selectedMesh = null;
    this.selectedAuraGroup = null;
    this.selectedOuterRing = null;
    this.selectedInnerRing = null;
  }

  spawnLandingPulse(worldPos: { x: number; z: number }): void {
    const themeVfx = THEMES[this.currentTheme].combatVfx;
    const group = new THREE.Group();
    group.position.set(worldPos.x, 0.03, worldPos.z);

    const geo = new THREE.RingGeometry(0.16, 0.28, 28);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: themeVfx.slashHex,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    this.vfxGroup.add(group);
    this.transientVfx.push({
      group,
      materials: [mat],
      geometries: [geo],
      age: 0,
      lifetime: 0.34,
      onUpdate: (t) => {
        const s = 1 + t * 1.9;
        mesh.scale.set(s, 1, s);
        mat.opacity = 0.65 * Math.pow(1 - t, 1.5);
      },
    });
  }

  spawnAttackVFX(
    attackerType: PieceType,
    attackerPos: { x: number; z: number },
    targetPos: { x: number; z: number },
  ): void {
    const themeVfx = THEMES[this.currentTheme].combatVfx;
    const dx = targetPos.x - attackerPos.x;
    const dz = targetPos.z - attackerPos.z;
    const yaw = Math.atan2(dx, dz);

    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    let lifetime = 0.38;
    let onUpdate: (t: number) => void = () => {};

    if (attackerType === 'p' || attackerType === 'k') {
      // Glowing crescent sword / greatsword slash arc
      const radius = attackerType === 'k' ? 0.85 : 0.56;
      const arcGeo = new THREE.TorusGeometry(radius, attackerType === 'k' ? 0.065 : 0.042, 8, 28, Math.PI * 0.85);
      const arcMat = new THREE.MeshBasicMaterial({
        color: attackerType === 'k' ? themeVfx.magicHex : themeVfx.slashHex,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const arc = new THREE.Mesh(arcGeo, arcMat);
      arc.position.set(targetPos.x, attackerType === 'k' ? 0.72 : 0.52, targetPos.z);
      arc.rotation.y = yaw;
      arc.rotation.z = attackerType === 'k' ? 0.25 : 0.75;
      group.add(arc);
      geometries.push(arcGeo);
      materials.push(arcMat);

      const waveGeo = new THREE.RingGeometry(0.18, 0.34, 32);
      waveGeo.rotateX(-Math.PI / 2);
      const waveMat = new THREE.MeshBasicMaterial({
        color: themeVfx.magicHex,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const wave = new THREE.Mesh(waveGeo, waveMat);
      wave.position.set(targetPos.x, 0.04, targetPos.z);
      group.add(wave);
      geometries.push(waveGeo);
      materials.push(waveMat);

      lifetime = attackerType === 'k' ? 0.48 : 0.32;
      onUpdate = (t) => {
        arc.rotation.x = -0.6 + t * 2.2;
        const sc = 0.85 + t * 0.55;
        arc.scale.setScalar(sc);
        arcMat.opacity = 0.92 * (1 - t);
        const ws = 1 + t * (attackerType === 'k' ? 3.2 : 2.1);
        wave.scale.set(ws, 1, ws);
        waveMat.opacity = 0.75 * Math.pow(1 - t, 1.4);
      };
    } else if (attackerType === 'r') {
      // Heavy seismic siege shockwave
      const ringGeo = new THREE.RingGeometry(0.22, 0.44, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: themeVfx.magicHex,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(targetPos.x, 0.04, targetPos.z);
      group.add(ring);
      geometries.push(ringGeo);
      materials.push(ringMat);
      lifetime = 0.44;
      onUpdate = (t) => {
        const s = 1 + t * 3.6;
        ring.scale.set(s, 1, s);
        ringMat.opacity = 0.88 * Math.pow(1 - t, 1.5);
      };
    } else if (attackerType === 'n') {
      // Piercing cavalry lance energy cone streak
      const coneGeo = new THREE.ConeGeometry(0.24, 1.15, 16, 1, true);
      coneGeo.rotateX(Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: themeVfx.slashHex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(targetPos.x, 0.65, targetPos.z);
      cone.rotation.y = yaw;
      group.add(cone);
      geometries.push(coneGeo);
      materials.push(coneMat);
      lifetime = 0.28;
      onUpdate = (t) => {
        cone.scale.set(1 - t * 0.4, 1 - t * 0.4, 0.8 + t * 1.1);
        coneMat.opacity = 0.85 * (1 - t);
      };
    } else if (attackerType === 'b') {
      // Skyward holy / arcane pillar beam + ground sigil
      const beamGeo = new THREE.CylinderGeometry(0.32, 0.45, 5.5, 20, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: themeVfx.magicHex,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(targetPos.x, 2.75, targetPos.z);
      group.add(beam);
      geometries.push(beamGeo);
      materials.push(beamMat);
      lifetime = 0.46;
      onUpdate = (t) => {
        const w = 1 - t * 0.65;
        beam.scale.set(w, 1, w);
        beamMat.opacity = 0.72 * Math.pow(1 - t, 1.3);
      };
    } else {
      // Queen: Forked 3D lightning strike + arcane burst sphere
      const boltMat = new THREE.MeshBasicMaterial({
        color: themeVfx.slashHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.push(boltMat);

      for (let b = 0; b < 3; b++) {
        const pts: THREE.Vector3[] = [];
        const startX = attackerPos.x + (b - 1) * 0.14;
        const startZ = attackerPos.z + (b - 1) * 0.14;
        for (let s = 0; s <= 5; s++) {
          const f = s / 5;
          const jitter = s === 0 || s === 5 ? 0 : 0.18;
          pts.push(
            new THREE.Vector3(
              THREE.MathUtils.lerp(startX, targetPos.x, f) + (Math.random() - 0.5) * jitter,
              THREE.MathUtils.lerp(1.45, 0.45, f) + Math.sin(f * Math.PI) * 0.35,
              THREE.MathUtils.lerp(startZ, targetPos.z, f) + (Math.random() - 0.5) * jitter,
            ),
          );
        }
        const boltGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.028, 6, false);
        geometries.push(boltGeo);
        group.add(new THREE.Mesh(boltGeo, boltMat));
      }

      const flashGeo = new THREE.SphereGeometry(0.45, 14, 12);
      const flashMat = new THREE.MeshBasicMaterial({
        color: themeVfx.magicHex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const flash = new THREE.Mesh(flashGeo, flashMat);
      flash.position.set(targetPos.x, 0.55, targetPos.z);
      group.add(flash);
      geometries.push(flashGeo);
      materials.push(flashMat);

      lifetime = 0.38;
      onUpdate = (t) => {
        boltMat.opacity = 0.95 * Math.pow(1 - t, 1.3);
        const fs = 0.7 + t * 1.4;
        flash.scale.setScalar(fs);
        flashMat.opacity = 0.85 * Math.pow(1 - t, 1.6);
      };
    }

    this.vfxGroup.add(group);
    this.transientVfx.push({ group, materials, geometries, age: 0, lifetime, onUpdate });
  }

  setCheckIndicator(kingSquare: Square | null, isCheckmate: boolean): void {
    while (this.checkGroup.children.length > 0) {
      this.checkGroup.remove(this.checkGroup.children[0]);
    }
    this.checkOuterMesh = null;
    this.checkInnerMesh = null;

    if (!kingSquare) {
      this.checkActive = false;
      this.isCheckmateActive = false;
      return;
    }

    const { x, z } = squareToWorld(kingSquare);
    this.checkActive = true;
    this.isCheckmateActive = isCheckmate;

    const outer = new THREE.Mesh(this.planeGeo, this.checkHaloMat);
    outer.position.set(x, 0.02, z);
    outer.scale.set(0.96, 1, 0.96);
    this.checkGroup.add(outer);
    this.checkOuterMesh = outer;

    if (isCheckmate) {
      const inner = new THREE.Mesh(this.planeGeo, this.checkInnerMat);
      inner.position.set(x, 0.022, z);
      inner.scale.set(0.78, 1, 0.78);
      this.checkGroup.add(inner);
      this.checkInnerMesh = inner;
    }
  }

  shatterPiece(
    worldPos: { x: number; z: number },
    victimColor: PieceColor,
    attackerPos: { x: number; z: number },
    victimPiece?: ArticulatedPiece
  ): void {
    let dirX = worldPos.x - attackerPos.x;
    let dirZ = worldPos.z - attackerPos.z;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) {
      dirX /= len;
      dirZ /= len;
    } else {
      dirX = 0;
      dirZ = 1;
    }
    const perpX = -dirZ;
    const perpZ = dirX;

    this.spawnScorchDecal(worldPos);

    // Extract actual detached sculpted limbs/head/weapon/crown parts from the victim rig
    if (victimPiece) {
      victimPiece.root.updateMatrixWorld(true);
      const candidateGroups: Array<{ grp?: THREE.Group; limit: number }> = [
        { grp: victimPiece.head, limit: 1 },
        { grp: victimPiece.weaponArm, limit: 1 },
        { grp: victimPiece.shieldArm, limit: 1 },
        { grp: victimPiece.body, limit: 2 },
      ];
      const wPos = new THREE.Vector3();
      const wQuat = new THREE.Quaternion();
      const wScale = new THREE.Vector3();
      let spawnedRelics = 0;

      for (const { grp, limit } of candidateGroups) {
        if (!grp) continue;
        let picked = 0;
        grp.traverse((node) => {
          if (picked >= limit || spawnedRelics >= 5) return;
          const srcMesh = node as THREE.Mesh;
          if (!srcMesh.isMesh || !srcMesh.geometry) return;

          const srcMats = Array.isArray(srcMesh.material)
            ? srcMesh.material
            : [srcMesh.material];
          const clonedMats = srcMats.map((m) => {
            const c = m.clone();
            c.transparent = true;
            c.opacity = 1;
            return c;
          });

          const frag = new THREE.Mesh(
            srcMesh.geometry,
            Array.isArray(srcMesh.material) ? clonedMats : clonedMats[0]
          );
          srcMesh.matrixWorld.decompose(wPos, wQuat, wScale);
          frag.position.copy(wPos);
          frag.quaternion.copy(wQuat);
          frag.scale.copy(wScale).multiplyScalar(0.84);
          frag.castShadow = true;
          frag.receiveShadow = true;

          const sideJitter = (Math.random() - 0.5) * 4.4;
          const forwardSpd = 2.0 + Math.random() * 2.8;
          const upSpd = 2.8 + Math.random() * 3.0;
          const lifetime = 2.25 + Math.random() * 0.45;

          this.debrisGroup.add(frag);
          this.shards.push({
            mesh: frag,
            materials: clonedMats,
            ownsGeometry: false,
            velocity: new THREE.Vector3(
              dirX * forwardSpd + perpX * sideJitter,
              upSpd,
              dirZ * forwardSpd + perpZ * sideJitter
            ),
            angularVelocity: new THREE.Vector3(
              (Math.random() - 0.5) * 14,
              (Math.random() - 0.5) * 14,
              (Math.random() - 0.5) * 14
            ),
            radius: 0.14,
            baseScale: frag.scale.x,
            age: 0,
            lifetime,
            fadeStart: lifetime - 0.8,
          });
          picked += 1;
          spawnedRelics += 1;
        });
      }
    }

    // Spawn 16 angular 3D Voronoi chunks + 8 glowing HDR arcane crystal sparks
    const totalShards = 16;
    const bodyBaseMat =
      victimColor === 'w' ? this.ivoryShardBaseMat : this.obsidianShardBaseMat;

    for (let i = 0; i < totalShards; i++) {
      const isGold = i >= 12;
      const geo = this.shardGeometries[i % this.shardGeometries.length];
      const mat = (isGold ? this.goldShardBaseMat : bodyBaseMat).clone();

      const mesh = new THREE.Mesh(geo, mat);
      const scale = isGold ? 0.55 + Math.random() * 0.4 : 0.7 + Math.random() * 0.65;
      mesh.scale.setScalar(scale);

      const spawnHeight = 0.16 + Math.random() * 1.05;
      mesh.position.set(
        worldPos.x + (Math.random() - 0.5) * 0.36,
        spawnHeight,
        worldPos.z + (Math.random() - 0.5) * 0.36
      );
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const forwardSpeed = 2.1 + Math.random() * 3.4;
      const sideSpeed = (Math.random() - 0.5) * 3.8;
      const upSpeed = 2.2 + Math.random() * 3.4;

      const velocity = new THREE.Vector3(
        dirX * forwardSpeed + perpX * sideSpeed,
        upSpeed,
        dirZ * forwardSpeed + perpZ * sideSpeed
      );

      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18
      );

      const lifetime = 2.1 + Math.random() * 0.5;
      const fadeStart = lifetime - 0.75;

      this.debrisGroup.add(mesh);
      this.shards.push({
        mesh,
        materials: [mat],
        ownsGeometry: false,
        velocity,
        angularVelocity,
        radius: 0.08 * scale,
        baseScale: scale,
        age: 0,
        lifetime,
        fadeStart,
      });
    }

    const themeVfx = THEMES[this.currentTheme].combatVfx;
    for (let i = 0; i < 8; i++) {
      const sparkMat = new THREE.MeshStandardMaterial({
        color: themeVfx.magicHex,
        emissive: themeVfx.magicHex,
        emissiveIntensity: 2.6,
        roughness: 0.12,
        transparent: true,
        opacity: 1,
      });
      const sparkMesh = new THREE.Mesh(this.gemSparkGeo, sparkMat);
      const scale = 0.65 + Math.random() * 0.55;
      sparkMesh.scale.setScalar(scale);
      sparkMesh.position.set(
        worldPos.x + (Math.random() - 0.5) * 0.28,
        0.3 + Math.random() * 0.75,
        worldPos.z + (Math.random() - 0.5) * 0.28
      );
      const forwardSpeed = 1.6 + Math.random() * 4.2;
      const sideSpeed = (Math.random() - 0.5) * 4.6;
      const upSpeed = 2.8 + Math.random() * 3.6;
      const lifetime = 1.35 + Math.random() * 0.35;

      this.debrisGroup.add(sparkMesh);
      this.shards.push({
        mesh: sparkMesh,
        materials: [sparkMat],
        ownsGeometry: false,
        velocity: new THREE.Vector3(
          dirX * forwardSpeed + perpX * sideSpeed,
          upSpeed,
          dirZ * forwardSpeed + perpZ * sideSpeed
        ),
        angularVelocity: new THREE.Vector3(12, 16, 10),
        radius: 0.04 * scale,
        baseScale: scale,
        age: 0,
        lifetime,
        fadeStart: lifetime - 0.55,
      });
    }

    // Spawn 14 billowing volumetric dust/smoke spheres expanding & rising over ~2.2s
    const smokeCount = 14;
    const smokeBaseColor = victimColor === 'w' ? 0xd8d1c4 : 0x4b5364;
    for (let i = 0; i < smokeCount; i++) {
      const isFlashPuff = i < 4;
      const mat = new THREE.MeshStandardMaterial({
        color: isFlashPuff ? 0x9b8262 : smokeBaseColor,
        roughness: 0.96,
        metalness: 0.0,
        transparent: true,
        opacity: isFlashPuff ? 0.44 : 0.34,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this.smokeGeo, mat);
      const startScale = 0.16 + Math.random() * 0.14;
      const endScale = 0.72 + Math.random() * 0.55;
      mesh.scale.setScalar(startScale);

      const angle = (i / smokeCount) * Math.PI * 2 + Math.random() * 0.5;
      const radial = 0.1 + Math.random() * 0.25;
      mesh.position.set(
        worldPos.x + Math.cos(angle) * radial,
        0.2 + Math.random() * 0.65,
        worldPos.z + Math.sin(angle) * radial
      );

      const outward = 0.55 + Math.random() * 0.9;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * outward + dirX * 0.65,
        0.55 + Math.random() * 0.75,
        Math.sin(angle) * outward + dirZ * 0.65
      );

      this.debrisGroup.add(mesh);
      this.smokePuffs.push({
        mesh,
        material: mat,
        velocity,
        startScale,
        endScale,
        baseOpacity: mat.opacity,
        age: 0,
        lifetime: 2.05 + Math.random() * 0.3,
      });
    }
  }

  private spawnScorchDecal(worldPos: { x: number; z: number }): void {
    while (this.scorchDecals.length >= 8) {
      const oldest = this.scorchDecals.shift();
      if (oldest) {
        this.scorchGroup.remove(oldest.mesh);
        oldest.material.dispose();
      }
    }
    const themeVfx = THEMES[this.currentTheme].combatVfx;
    const mat = new THREE.MeshBasicMaterial({
      map: this.scorchTex,
      color: new THREE.Color(themeVfx.magicHex).lerp(new THREE.Color(0xffffff), 0.32),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    mesh.position.set(worldPos.x, 0.0055, worldPos.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.set(0.92, 1, 0.92);
    this.scorchGroup.add(mesh);
    this.scorchDecals.push({ mesh, material: mat, age: 0, lifetime: 18.0 });
  }

  clearDebris(): void {
    for (const shard of this.shards) {
      this.debrisGroup.remove(shard.mesh);
      shard.materials.forEach((m) => m.dispose());
    }
    this.shards.length = 0;

    for (const puff of this.smokePuffs) {
      this.debrisGroup.remove(puff.mesh);
      puff.material.dispose();
    }
    this.smokePuffs.length = 0;

    for (const fx of this.transientVfx) {
      this.vfxGroup.remove(fx.group);
      fx.geometries.forEach((g) => g.dispose());
      fx.materials.forEach((m) => m.dispose());
    }
    this.transientVfx.length = 0;

    for (const dec of this.scorchDecals) {
      this.scorchGroup.remove(dec.mesh);
      dec.material.dispose();
    }
    this.scorchDecals.length = 0;
  }

  getActiveDebrisCount(): number {
    return this.shards.length + this.smokePuffs.length;
  }

  update(dt: number): void {
    const clampedDt = Math.min(Math.max(dt, 0), 0.05);
    this.elapsed += clampedDt;

    // Pulse legal move & selection indicators
    const pulseSlow = 0.5 + 0.5 * Math.sin(this.elapsed * 3.4);
    this.quietMoveMat.opacity = 0.74 + pulseSlow * 0.2;
    this.captureMoveMat.opacity = 0.8 + pulseSlow * 0.18;
    this.selectedMat.opacity = 0.82 + pulseSlow * 0.15;

    for (let i = 0; i < this.quietMeshes.length; i++) {
      const s = 0.66 + Math.sin(this.elapsed * 3.4 + i * 0.25) * 0.035;
      this.quietMeshes[i].scale.set(s, 1, s);
    }

    for (let i = 0; i < this.captureMeshes.length; i++) {
      const s = 0.9 + Math.sin(this.elapsed * 4.8 + i * 0.3) * 0.04;
      this.captureMeshes[i].scale.set(s, 1, s);
    }

    if (this.selectedAuraGroup && this.selectedOuterRing && this.selectedInnerRing) {
      this.selectedOuterRing.rotation.z = this.elapsed * 1.1;
      this.selectedInnerRing.rotation.z = -this.elapsed * 1.6;
      const auraScale = 1 + Math.sin(this.elapsed * 3.8) * 0.045;
      this.selectedAuraGroup.scale.set(auraScale, 1, auraScale);
    }

    for (let i = this.scorchDecals.length - 1; i >= 0; i--) {
      const dec = this.scorchDecals[i];
      dec.age += clampedDt;
      if (dec.age >= dec.lifetime) {
        this.scorchGroup.remove(dec.mesh);
        dec.material.dispose();
        this.scorchDecals.splice(i, 1);
      } else {
        const t = dec.age / dec.lifetime;
        dec.material.opacity = 0.88 * Math.pow(1 - t, 1.35);
      }
    }

    // Step transient weapon & landing VFX
    for (let i = this.transientVfx.length - 1; i >= 0; i--) {
      const fx = this.transientVfx[i];
      fx.age += clampedDt;
      if (fx.age >= fx.lifetime) {
        this.vfxGroup.remove(fx.group);
        fx.geometries.forEach((g) => g.dispose());
        fx.materials.forEach((m) => m.dispose());
        this.transientVfx.splice(i, 1);
      } else {
        fx.onUpdate(fx.age / fx.lifetime);
      }
    }

    // Pulse threatened King check/checkmate halo
    if (this.checkActive && this.checkOuterMesh) {
      const freq = this.isCheckmateActive ? 6.5 : 4.2;
      const p = 0.5 + 0.5 * Math.sin(this.elapsed * freq);
      const outerScale = 0.9 + p * 0.11;
      this.checkOuterMesh.scale.set(outerScale, 1, outerScale);
      this.checkHaloMat.opacity = (this.isCheckmateActive ? 0.78 : 0.62) + p * 0.34;

      if (this.checkInnerMesh) {
        const innerScale = 0.72 + (1 - p) * 0.12;
        this.checkInnerMesh.scale.set(innerScale, 1, innerScale);
        this.checkInnerMat.opacity = 0.45 + p * 0.4;
      }
    }

    // Step debris shard physics
    const gravity = -15.5;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.age += clampedDt;

      if (s.age >= s.lifetime) {
        this.debrisGroup.remove(s.mesh);
        s.materials.forEach((m) => m.dispose());
        this.shards.splice(i, 1);
        continue;
      }

      // Apply gravity and integrate position
      s.velocity.y += gravity * clampedDt;
      s.mesh.position.addScaledVector(s.velocity, clampedDt);
      s.mesh.rotation.x += s.angularVelocity.x * clampedDt;
      s.mesh.rotation.y += s.angularVelocity.y * clampedDt;
      s.mesh.rotation.z += s.angularVelocity.z * clampedDt;

      // Elastic bounce on board surface (y = 0)
      const floorY = s.radius * 0.75;
      if (s.mesh.position.y < floorY) {
        s.mesh.position.y = floorY;
        if (s.velocity.y < -0.75) {
          s.velocity.y = -s.velocity.y * 0.42;
          s.velocity.x *= 0.76;
          s.velocity.z *= 0.76;
          s.angularVelocity.multiplyScalar(0.65);
        } else {
          s.velocity.y = 0;
          s.velocity.x *= Math.max(0, 1 - clampedDt * 8);
          s.velocity.z *= Math.max(0, 1 - clampedDt * 8);
          s.angularVelocity.multiplyScalar(Math.max(0, 1 - clampedDt * 9));
        }
      }

      // Smooth fade & shrink at end of lifetime
      if (s.age > s.fadeStart) {
        const fadeT = (s.age - s.fadeStart) / (s.lifetime - s.fadeStart);
        const remain = Math.max(0, 1 - fadeT);
        for (const mat of s.materials) {
          mat.opacity = remain;
        }
        s.mesh.scale.setScalar(s.baseScale * (0.25 + 0.75 * remain));
      }
    }

    // Step volumetric smoke puffs
    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const p = this.smokePuffs[i];
      p.age += clampedDt;

      if (p.age >= p.lifetime) {
        this.debrisGroup.remove(p.mesh);
        p.material.dispose();
        this.smokePuffs.splice(i, 1);
        continue;
      }

      const t = p.age / p.lifetime;
      const expandEase = 1 - Math.pow(1 - t, 2.2);
      const scale = p.startScale + (p.endScale - p.startScale) * expandEase;
      p.mesh.scale.setScalar(scale);

      // Slow down horizontal drift while gently rising
      p.velocity.x *= Math.max(0, 1 - clampedDt * 1.8);
      p.velocity.z *= Math.max(0, 1 - clampedDt * 1.8);
      p.mesh.position.addScaledVector(p.velocity, clampedDt);

      // Fade opacity smoothly after initial burst
      const alpha = t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 1.4);
      p.material.opacity = p.baseOpacity * Math.max(0, alpha);
    }
  }

  dispose(): void {
    this.clearHighlights();
    this.setCheckIndicator(null, false);
    this.clearDebris();

    this.scene.remove(this.scorchGroup);
    this.scene.remove(this.highlightGroup);
    this.scene.remove(this.checkGroup);
    this.scene.remove(this.debrisGroup);
    this.scene.remove(this.vfxGroup);

    this.planeGeo.dispose();
    this.smokeGeo.dispose();
    this.gemSparkGeo.dispose();
    for (const g of this.shardGeometries) {
      g.dispose();
    }
    this.shardGeometries.length = 0;

    this.selectedTex.dispose();
    this.quietMoveTex.dispose();
    this.captureMoveTex.dispose();
    this.checkHaloTex.dispose();
    this.scorchTex.dispose();

    this.selectedMat.dispose();
    this.quietMoveMat.dispose();
    this.captureMoveMat.dispose();
    this.checkHaloMat.dispose();
    this.checkInnerMat.dispose();

    this.ivoryShardBaseMat.dispose();
    this.obsidianShardBaseMat.dispose();
    this.goldShardBaseMat.dispose();
  }

  // ---------------------------------------------------------------------------
  // Procedural Geometries & Anti-aliased Indicator Textures
  // ---------------------------------------------------------------------------

  private createVoronoiShardGeometry(seed: number): THREE.BufferGeometry {
    let state = (seed * 9301 + 49297) >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };

    const base = new THREE.IcosahedronGeometry(0.11, 0);
    const pos = base.getAttribute('position');

    // Keep welded vertices consistent by mapping rounded coordinates -> perturbed offset
    const offsetMap = new Map<string, THREE.Vector3>();
    const sx = 0.65 + rand() * 0.95;
    const sy = 0.55 + rand() * 0.85;
    const sz = 0.65 + rand() * 0.95;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const key = `${vx.toFixed(4)}_${vy.toFixed(4)}_${vz.toFixed(4)}`;

      let displaced = offsetMap.get(key);
      if (!displaced) {
        const stretch = 0.65 + rand() * 0.75;
        displaced = new THREE.Vector3(
          vx * stretch * sx + (rand() - 0.5) * 0.03,
          vy * stretch * sy + (rand() - 0.5) * 0.03,
          vz * stretch * sz + (rand() - 0.5) * 0.03
        );
        offsetMap.set(key, displaced);
      }

      pos.setXYZ(i, displaced.x, displaced.y, displaced.z);
    }

    const nonIndexed = base.index ? base.toNonIndexed() : base;
    if (nonIndexed !== base) base.dispose();
    nonIndexed.computeVertexNormals();
    return nonIndexed;
  }

  private createSelectedSquareTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Subtle warm golden center glow
    const rad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    rad.addColorStop(0, 'rgba(245, 197, 66, 0.22)');
    rad.addColorStop(0.7, 'rgba(245, 197, 66, 0.14)');
    rad.addColorStop(1, 'rgba(245, 197, 66, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, size, size);

    // Crisp glowing golden border halo
    ctx.strokeStyle = 'rgba(245, 205, 86, 0.95)';
    ctx.lineWidth = 10;
    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(255, 205, 75, 0.9)';
    ctx.strokeRect(16, 16, size - 32, size - 32);

    ctx.strokeStyle = 'rgba(255, 236, 168, 0.9)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 0;
    ctx.strokeRect(24, 24, size - 48, size - 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createQuietMoveTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Soft cyan/teal outer radial halo
    const glow = ctx.createRadialGradient(128, 128, 18, 128, 128, 118);
    glow.addColorStop(0, 'rgba(56, 189, 248, 0.72)');
    glow.addColorStop(0.35, 'rgba(45, 212, 191, 0.46)');
    glow.addColorStop(0.68, 'rgba(56, 189, 248, 0.12)');
    glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // Clean luminous cyan/teal disc center
    ctx.beginPath();
    ctx.arc(128, 128, 44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.88)';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#2DD4BF';
    ctx.fill();

    // Crisp outer teal ring
    ctx.beginPath();
    ctx.arc(128, 128, 76, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.78)';
    ctx.lineWidth = 5;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createCaptureRingTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Amber-crimson radial danger glow
    const glow = ctx.createRadialGradient(128, 128, 56, 128, 128, 124);
    glow.addColorStop(0, 'rgba(239, 68, 68, 0)');
    glow.addColorStop(0.55, 'rgba(245, 158, 11, 0.28)');
    glow.addColorStop(0.8, 'rgba(239, 68, 68, 0.45)');
    glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // Outer crimson target ring
    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, Math.PI * 2);
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 10;
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#EF4444';
    ctx.stroke();

    // Inner amber ring
    ctx.beginPath();
    ctx.arc(128, 128, 78, 0, Math.PI * 2);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 4.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#F59E0B';
    ctx.stroke();

    // 4 sharp cardinal target ticks
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 6;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84);
      ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createCheckHaloTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const glow = ctx.createRadialGradient(128, 128, 42, 128, 128, 124);
    glow.addColorStop(0, 'rgba(220, 38, 38, 0.25)');
    glow.addColorStop(0.6, 'rgba(239, 68, 68, 0.65)');
    glow.addColorStop(0.84, 'rgba(220, 38, 38, 0.85)');
    glow.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, Math.PI * 2);
    ctx.strokeStyle = '#FF3B3B';
    ctx.lineWidth = 11;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#FF1E1E';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(128, 128, 72, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 130, 100, 0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createScorchTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Deep charred crater radial core
    const blast = ctx.createRadialGradient(128, 128, 8, 128, 128, 114);
    blast.addColorStop(0, 'rgba(18, 12, 10, 0.92)');
    blast.addColorStop(0.45, 'rgba(32, 20, 14, 0.72)');
    blast.addColorStop(0.78, 'rgba(40, 24, 18, 0.28)');
    blast.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = blast;
    ctx.fillRect(0, 0, size, size);

    // 9 radiating arcane fissure cracks glowing warmly in the stone
    for (let i = 0; i < 9; i++) {
      let ang = (i / 9) * Math.PI * 2 + 0.2;
      let cx = 128;
      let cy = 128;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 5; s++) {
        ang += Math.sin(i * 3.1 + s * 1.9) * 0.42;
        const step = 14 + ((i + s) % 3) * 6;
        cx += Math.cos(ang) * step;
        cy += Math.sin(ang) * step;
        ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = 'rgba(255, 196, 120, 0.85)';
      ctx.lineWidth = 3.2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#FFFFFF';
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
