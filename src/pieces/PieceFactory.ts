import * as THREE from 'three';
import type { ArticulatedPiece, PieceColor, PieceType } from '../types';

interface ColorPalette {
  primary: THREE.MeshPhysicalMaterial;
  secondary: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  recess: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  parchment: THREE.MeshStandardMaterial;
}

/**
 * Generates a tileable procedural stone/ivory/obsidian micro-grain roughness + bump texture
 * using pure Uint8Array DataTexture (no DOM canvas dependency).
 * Values stay in [218..255] so base material roughness is preserved with subtle organic variation.
 */
function createMicroGrainTexture(size = 128, streakMode = false): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  let seed = streakMode ? 9137 : 4271;
  const nextRand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffff) / 0xffff;
  };

  for (let y = 0; y < size; y++) {
    const rowBias = streakMode ? (nextRand() - 0.5) * 20 : 0;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const fine = (nextRand() - 0.5) * (streakMode ? 12 : 18);
      const wave = streakMode
        ? Math.sin((y / size) * Math.PI * 16) * 7
        : Math.sin((x / size) * Math.PI * 6 + Math.cos((y / size) * Math.PI * 6)) * 8;
      const val = Math.max(212, Math.min(255, Math.round(236 + fine + rowBias + wave)));
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Stores initial local transforms on articulated groups so PieceAnimator can always
 * layer animations and reset cleanly to each piece's exact sculptural rest pose.
 */
function saveRestPose(obj: THREE.Object3D): void {
  obj.userData.restPos = obj.position.clone();
  obj.userData.restRot = obj.rotation.clone();
}

export class PieceFactory {
  private readonly stoneGrainTex: THREE.DataTexture;
  private readonly brushedMetalTex: THREE.DataTexture;
  private readonly palettes: Record<PieceColor, ColorPalette>;
  private readonly geoCache = new Map<string, THREE.BufferGeometry>();

  constructor() {
    this.stoneGrainTex = createMicroGrainTexture(128, false);
    this.brushedMetalTex = createMicroGrainTexture(128, true);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.88,
      roughness: 0.22,
      roughnessMap: this.brushedMetalTex,
      bumpMap: this.brushedMetalTex,
      bumpScale: 0.0025,
    });

    const recessMat = new THREE.MeshStandardMaterial({
      color: 0x090b10,
      metalness: 0.18,
      roughness: 0.78,
    });

    const parchmentMat = new THREE.MeshStandardMaterial({
      color: 0xe7dac0,
      metalness: 0.02,
      roughness: 0.68,
    });

    this.palettes = {
      w: {
        primary: new THREE.MeshPhysicalMaterial({
          color: 0xefe8dd,
          roughness: 0.26,
          metalness: 0.04,
          clearcoat: 0.36,
          clearcoatRoughness: 0.18,
          roughnessMap: this.stoneGrainTex,
          bumpMap: this.stoneGrainTex,
          bumpScale: 0.003,
        }),
        secondary: new THREE.MeshStandardMaterial({
          color: 0xd9cfc0,
          roughness: 0.36,
          metalness: 0.06,
          roughnessMap: this.stoneGrainTex,
        }),
        gold: goldMat,
        steel: new THREE.MeshStandardMaterial({
          color: 0xc8d0dc,
          metalness: 0.92,
          roughness: 0.18,
          roughnessMap: this.brushedMetalTex,
          bumpMap: this.brushedMetalTex,
          bumpScale: 0.002,
        }),
        recess: recessMat,
        leather: new THREE.MeshStandardMaterial({
          color: 0x4b3629,
          metalness: 0.06,
          roughness: 0.56,
        }),
        parchment: parchmentMat,
      },
      b: {
        primary: new THREE.MeshPhysicalMaterial({
          color: 0x14161d,
          roughness: 0.22,
          metalness: 0.15,
          clearcoat: 0.44,
          clearcoatRoughness: 0.14,
          roughnessMap: this.stoneGrainTex,
          bumpMap: this.stoneGrainTex,
          bumpScale: 0.003,
        }),
        secondary: new THREE.MeshStandardMaterial({
          color: 0x222633,
          roughness: 0.32,
          metalness: 0.22,
          roughnessMap: this.stoneGrainTex,
        }),
        gold: goldMat,
        steel: new THREE.MeshStandardMaterial({
          color: 0xa6b0be,
          metalness: 0.9,
          roughness: 0.2,
          roughnessMap: this.brushedMetalTex,
          bumpMap: this.brushedMetalTex,
          bumpScale: 0.002,
        }),
        recess: recessMat,
        leather: new THREE.MeshStandardMaterial({
          color: 0x251b17,
          metalness: 0.08,
          roughness: 0.52,
        }),
        parchment: parchmentMat,
      },
    };
  }

  public createPiece(id: string, type: PieceType, color: PieceColor): ArticulatedPiece {
    const pal = this.palettes[color];
    let piece: ArticulatedPiece;

    switch (type) {
      case 'p':
        piece = this.buildPawn(id, color, pal);
        break;
      case 'r':
        piece = this.buildRook(id, color, pal);
        break;
      case 'n':
        piece = this.buildKnight(id, color, pal);
        break;
      case 'b':
        piece = this.buildBishop(id, color, pal);
        break;
      case 'q':
        piece = this.buildQueen(id, color, pal);
        break;
      case 'k':
        piece = this.buildKing(id, color, pal);
        break;
    }

    // Default board facing: White looks toward -Z (Math.PI), Black looks toward +Z (0).
    piece.root.rotation.set(0, color === 'w' ? Math.PI : 0, 0);

    // Save sculptural rest poses for deterministic animation and reset.
    saveRestPose(piece.body);
    saveRestPose(piece.weaponArm);
    if (piece.shieldArm) saveRestPose(piece.shieldArm);
    if (piece.head) saveRestPose(piece.head);

    // Enable shadows and attach pieceId to every descendant mesh for Three.js raycasting.
    piece.root.traverse((obj) => {
      obj.userData.pieceId = id;
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return piece;
  }

  public dispose(): void {
    for (const geo of this.geoCache.values()) {
      geo.dispose();
    }
    this.geoCache.clear();

    const disposedMats = new Set<THREE.Material>();
    for (const pal of Object.values(this.palettes)) {
      const mats: THREE.Material[] = [
        pal.primary,
        pal.secondary,
        pal.gold,
        pal.steel,
        pal.recess,
        pal.leather,
        pal.parchment,
      ];
      for (const m of mats) {
        if (!disposedMats.has(m)) {
          disposedMats.add(m);
          m.dispose();
        }
      }
    }

    this.stoneGrainTex.dispose();
    this.brushedMetalTex.dispose();
  }

  private getGeo(key: string, builder: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geo = this.geoCache.get(key);
    if (!geo) {
      geo = builder();
      this.geoCache.set(key, geo);
    }
    return geo;
  }

  // -------------------------------------------------------------------------
  // Shared Sculptural Component Builders
  // -------------------------------------------------------------------------

  /**
   * Builds a stepped, gold-rimmed plinth resting cleanly at y = 0.
   */
  private createPlinth(
    radius: number,
    height: number,
    pal: ColorPalette,
    octagonal = false,
  ): THREE.Group {
    const group = new THREE.Group();
    const segs = octagonal ? 8 : 24;
    const key = `plinth_${radius.toFixed(3)}_${height.toFixed(3)}_${segs}`;

    const latheGeo = this.getGeo(key, () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(radius, 0),
        new THREE.Vector2(radius, height * 0.24),
        new THREE.Vector2(radius * 0.93, height * 0.34),
        new THREE.Vector2(radius * 0.91, height * 0.46),
        new THREE.Vector2(radius * 0.81, height * 0.72),
        new THREE.Vector2(radius * 0.84, height * 0.86),
        new THREE.Vector2(radius * 0.78, height),
        new THREE.Vector2(0, height),
      ];
      return new THREE.LatheGeometry(pts, segs);
    });

    const bodyMesh = new THREE.Mesh(latheGeo, pal.primary);
    if (octagonal) {
      bodyMesh.rotation.y = Math.PI / 8;
    }
    group.add(bodyMesh);

    const lowerRingGeo = this.getGeo(
      `plinth_ring_lo_${radius.toFixed(3)}_${segs}`,
      () => new THREE.TorusGeometry(radius * 0.92, 0.013, 8, segs),
    );
    const lowerRing = new THREE.Mesh(lowerRingGeo, pal.gold);
    lowerRing.rotation.x = Math.PI / 2;
    if (octagonal) lowerRing.rotation.z = Math.PI / 8;
    lowerRing.position.y = height * 0.38;
    group.add(lowerRing);

    const upperRingGeo = this.getGeo(
      `plinth_ring_hi_${radius.toFixed(3)}_${segs}`,
      () => new THREE.TorusGeometry(radius * 0.825, 0.013, 8, segs),
    );
    const upperRing = new THREE.Mesh(upperRingGeo, pal.gold);
    upperRing.rotation.x = Math.PI / 2;
    if (octagonal) upperRing.rotation.z = Math.PI / 8;
    upperRing.position.y = height * 0.92;
    group.add(upperRing);

    return group;
  }

  /**
   * Builds a diamond-section forged medieval sword blade pointing along +Y from y=0 to y=length.
   */
  private createDiamondBladeGeo(
    key: string,
    length: number,
    baseHalfWidth: number,
    shoulderHalfWidth: number,
    ridgeDepth: number,
  ): THREE.BufferGeometry {
    return this.getGeo(key, () => {
      const shoulderY = length * 0.82;
      const tipY = length;
      const shoulderRidge = ridgeDepth * 0.74;

      const L0: [number, number, number] = [-baseHalfWidth, 0, 0];
      const R0: [number, number, number] = [baseHalfWidth, 0, 0];
      const F0: [number, number, number] = [0, 0, ridgeDepth];
      const B0: [number, number, number] = [0, 0, -ridgeDepth];

      const L1: [number, number, number] = [-shoulderHalfWidth, shoulderY, 0];
      const R1: [number, number, number] = [shoulderHalfWidth, shoulderY, 0];
      const F1: [number, number, number] = [0, shoulderY, shoulderRidge];
      const B1: [number, number, number] = [0, shoulderY, -shoulderRidge];

      const T: [number, number, number] = [0, tipY, 0];

      const positions: number[] = [];
      const pushTri = (
        a: [number, number, number],
        b: [number, number, number],
        c: [number, number, number],
      ) => {
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      };

      // Front-right bevel
      pushTri(F0, R0, R1);
      pushTri(F0, R1, F1);
      // Front-left bevel
      pushTri(L0, F0, F1);
      pushTri(L0, F1, L1);
      // Back-right bevel
      pushTri(R0, B0, B1);
      pushTri(R0, B1, R1);
      // Back-left bevel
      pushTri(B0, L0, L1);
      pushTri(B0, L1, B1);
      // Point facets
      pushTri(F1, R1, T);
      pushTri(L1, F1, T);
      pushTri(R1, B1, T);
      pushTri(B1, L1, T);
      // Bottom tang cap
      pushTri(L0, R0, F0);
      pushTri(R0, L0, B0);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      return geo;
    });
  }

  /**
   * Builds a sculpted medieval broadsword or two-handed greatsword centered at the hand grip (0,0,0).
   */
  private createSword(
    bladeLength: number,
    bladeWidth: number,
    guardWidth: number,
    gripLen: number,
    pointDown: boolean,
    pal: ColorPalette,
  ): THREE.Group {
    const sword = new THREE.Group();
    const dir = pointDown ? -1 : 1;

    // Wrapped leather grip
    const gripGeo = this.getGeo(
      `grip_${gripLen.toFixed(3)}`,
      () => new THREE.CylinderGeometry(0.017, 0.019, gripLen, 10),
    );
    const grip = new THREE.Mesh(gripGeo, pal.leather);
    grip.position.y = dir * (gripLen * 0.15);
    sword.add(grip);

    // Faceted gold pommel
    const pommelGeo = this.getGeo('sword_pommel', () => new THREE.OctahedronGeometry(0.032, 0));
    const pommel = new THREE.Mesh(pommelGeo, pal.gold);
    pommel.position.y = -dir * (gripLen * 0.45);
    sword.add(pommel);

    // Crossguard bar + finial tips
    const guardY = dir * (gripLen * 0.56);
    const guardGeo = this.getGeo(
      `guard_${guardWidth.toFixed(3)}`,
      () => new THREE.BoxGeometry(guardWidth, 0.028, 0.036),
    );
    const guard = new THREE.Mesh(guardGeo, pal.gold);
    guard.position.y = guardY;
    sword.add(guard);

    const finialGeo = this.getGeo('guard_finial', () => new THREE.SphereGeometry(0.02, 8, 8));
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(finialGeo, pal.gold);
      f.position.set(side * (guardWidth * 0.5), guardY, 0);
      sword.add(f);
    }

    // Diamond-section blade
    const bladeGeo = this.createDiamondBladeGeo(
      `blade_${bladeLength.toFixed(3)}_${bladeWidth.toFixed(3)}`,
      bladeLength,
      bladeWidth * 0.5,
      bladeWidth * 0.34,
      bladeWidth * 0.24,
    );
    const blade = new THREE.Mesh(bladeGeo, pal.steel);
    blade.position.y = guardY + dir * 0.012;
    if (pointDown) {
      blade.rotation.z = Math.PI;
    }
    sword.add(blade);

    return sword;
  }

  /**
   * Builds a curved medieval heater shield with raised gold border and raised gold Latin cross on +Z.
   */
  private createHeaterShield(width: number, height: number, pal: ColorPalette): THREE.Group {
    const shield = new THREE.Group();
    const hw = width * 0.5;
    const hh = height * 0.5;
    const depth = 0.026;

    const plateKey = `shield_plate_${width.toFixed(3)}_${height.toFixed(3)}`;
    const plateGeo = this.getGeo(plateKey, () => {
      const shape = new THREE.Shape();
      shape.moveTo(-hw, hh);
      shape.lineTo(hw, hh);
      shape.lineTo(hw, hh * 0.12);
      shape.quadraticCurveTo(hw * 0.92, -hh * 0.52, 0, -hh);
      shape.quadraticCurveTo(-hw * 0.92, -hh * 0.52, -hw, hh * 0.12);
      shape.closePath();

      const g = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
        bevelSegments: 2,
      });
      g.translate(0, 0, -depth * 0.5);
      return g;
    });

    const plate = new THREE.Mesh(plateGeo, pal.primary);
    shield.add(plate);

    // Raised gold rim backing (slightly larger scale behind front edge for crisp gold trim)
    const rim = new THREE.Mesh(plateGeo, pal.gold);
    rim.scale.set(1.09, 1.07, 0.72);
    rim.position.z = -0.004;
    shield.add(rim);

    // Raised gold heraldic cross on +Z face
    const frontZ = depth * 0.5 + 0.012;
    const vBarGeo = this.getGeo(
      `shield_cross_v_${height.toFixed(3)}`,
      () => new THREE.BoxGeometry(width * 0.16, height * 0.76, 0.014),
    );
    const hBarGeo = this.getGeo(
      `shield_cross_h_${width.toFixed(3)}`,
      () => new THREE.BoxGeometry(width * 0.68, width * 0.16, 0.014),
    );
    const vBar = new THREE.Mesh(vBarGeo, pal.gold);
    vBar.position.set(0, -height * 0.02, frontZ);
    shield.add(vBar);

    const hBar = new THREE.Mesh(hBarGeo, pal.gold);
    hBar.position.set(0, height * 0.12, frontZ);
    shield.add(hBar);

    const bossGeo = this.getGeo('shield_boss', () => new THREE.SphereGeometry(width * 0.11, 10, 8));
    const boss = new THREE.Mesh(bossGeo, pal.gold);
    boss.scale.set(1, 1, 0.55);
    boss.position.set(0, height * 0.12, frontZ + 0.004);
    shield.add(boss);

    return shield;
  }

  /**
   * Builds a two-segment armored humanoid arm with gold-rimmed pauldron, elbow couter, and gauntlet.
   * Local (0,0,0) is the shoulder pivot. Returns the group and the gauntlet hand anchor position.
   */
  private createArmoredArm(
    side: 'right' | 'left',
    scale: number,
    pal: ColorPalette,
    handOffset: THREE.Vector3,
  ): THREE.Group {
    const arm = new THREE.Group();
    const s = side === 'right' ? -1 : 1;

    // Multi-lame shoulder pauldron wrapped in a single tilted group so Euler order stays exact
    const pauldronGroup = new THREE.Group();
    pauldronGroup.position.set(s * 0.01, 0.01, 0);
    pauldronGroup.rotation.z = s * 0.35;

    const pauldronGeo = this.getGeo(
      `pauldron_${scale.toFixed(2)}`,
      () => new THREE.SphereGeometry(0.082 * scale, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    );
    pauldronGroup.add(new THREE.Mesh(pauldronGeo, pal.primary));

    const pauldronRimGeo = this.getGeo(
      `pauldron_rim_${scale.toFixed(2)}`,
      () => new THREE.TorusGeometry(0.078 * scale, 0.011 * scale, 8, 16),
    );
    const rim = new THREE.Mesh(pauldronRimGeo, pal.gold);
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = -0.02 * scale;
    pauldronGroup.add(rim);
    arm.add(pauldronGroup);

    // Elbow midpoint
    const elbow = new THREE.Vector3(s * 0.025 * scale, -0.125 * scale, 0.065 * scale);
    const origin = new THREE.Vector3(0, 0, 0);

    this.addLimbSegment(arm, origin, elbow, 0.044 * scale, 0.036 * scale, pal.secondary);

    const couterGeo = this.getGeo(
      `couter_${scale.toFixed(2)}`,
      () => new THREE.SphereGeometry(0.042 * scale, 10, 8),
    );
    const couter = new THREE.Mesh(couterGeo, pal.gold);
    couter.position.copy(elbow);
    arm.add(couter);

    this.addLimbSegment(arm, elbow, handOffset, 0.038 * scale, 0.032 * scale, pal.primary);

    // Gauntlet fist
    const gauntletGeo = this.getGeo(
      `gauntlet_${scale.toFixed(2)}`,
      () => new THREE.BoxGeometry(0.068 * scale, 0.074 * scale, 0.078 * scale),
    );
    const gauntlet = new THREE.Mesh(gauntletGeo, pal.gold);
    gauntlet.position.copy(handOffset);
    arm.add(gauntlet);

    return arm;
  }

  private addLimbSegment(
    parent: THREE.Group,
    a: THREE.Vector3,
    b: THREE.Vector3,
    rTop: number,
    rBot: number,
    mat: THREE.Material,
  ): void {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.001) return;
    const key = `limb_${len.toFixed(3)}_${rTop.toFixed(3)}_${rBot.toFixed(3)}`;
    const geo = this.getGeo(key, () => new THREE.CylinderGeometry(rTop, rBot, len, 10));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
  }

  private createLatinCross(height: number, width: number, thickness: number, pal: ColorPalette): THREE.Group {
    const cross = new THREE.Group();
    const vGeo = this.getGeo(
      `cross_v_${height.toFixed(3)}_${thickness.toFixed(3)}`,
      () => new THREE.BoxGeometry(thickness, height, thickness),
    );
    const hGeo = this.getGeo(
      `cross_h_${width.toFixed(3)}_${thickness.toFixed(3)}`,
      () => new THREE.BoxGeometry(width, thickness, thickness),
    );
    const v = new THREE.Mesh(vGeo, pal.gold);
    v.position.y = height * 0.5;
    cross.add(v);

    const h = new THREE.Mesh(hGeo, pal.gold);
    h.position.y = height * 0.68;
    cross.add(h);
    return cross;
  }

  // -------------------------------------------------------------------------
  // 1. PAWN (Footman, height ~1.05)
  // -------------------------------------------------------------------------
  private buildPawn(id: string, color: PieceColor, pal: ColorPalette): ArticulatedPiece {
    const root = new THREE.Group();
    root.add(this.createPlinth(0.31, 0.13, pal));

    const body = new THREE.Group();
    body.position.y = 0.12;
    root.add(body);

    // Armored skirt / tassets
    const skirtGeo = this.getGeo('pawn_skirt', () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.24, 0),
        new THREE.Vector2(0.22, 0.12),
        new THREE.Vector2(0.17, 0.25),
        new THREE.Vector2(0, 0.25),
      ];
      return new THREE.LatheGeometry(pts, 18);
    });
    body.add(new THREE.Mesh(skirtGeo, pal.secondary));

    // Four layered thigh tassets around waist
    const tassetGeo = this.getGeo('pawn_tasset', () => new THREE.BoxGeometry(0.14, 0.17, 0.04));
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const t = new THREE.Mesh(tassetGeo, pal.primary);
      t.position.set(Math.sin(ang) * 0.17, 0.15, Math.cos(ang) * 0.17);
      t.rotation.order = 'YXZ';
      t.rotation.y = ang;
      t.rotation.x = -0.22;
      body.add(t);
    }

    // Gold waist belt + buckle
    const beltGeo = this.getGeo('pawn_belt', () => new THREE.CylinderGeometry(0.178, 0.184, 0.045, 18));
    const belt = new THREE.Mesh(beltGeo, pal.gold);
    belt.position.y = 0.25;
    body.add(belt);

    const buckleGeo = this.getGeo('pawn_buckle', () => new THREE.BoxGeometry(0.068, 0.058, 0.03));
    const buckle = new THREE.Mesh(buckleGeo, pal.gold);
    buckle.position.set(0, 0.25, 0.178);
    body.add(buckle);

    // Sculpted cuirass torso
    const cuirassGeo = this.getGeo('pawn_cuirass', () => {
      const pts = [
        new THREE.Vector2(0, 0.25),
        new THREE.Vector2(0.165, 0.26),
        new THREE.Vector2(0.205, 0.41),
        new THREE.Vector2(0.185, 0.51),
        new THREE.Vector2(0.115, 0.54),
        new THREE.Vector2(0, 0.54),
      ];
      return new THREE.LatheGeometry(pts, 18);
    });
    const cuirass = new THREE.Mesh(cuirassGeo, pal.primary);
    cuirass.scale.set(1.06, 1, 0.88);
    body.add(cuirass);

    // Gold sternum breastplate ridge
    const breastTrimGeo = this.getGeo('pawn_breast_trim', () => new THREE.BoxGeometry(0.036, 0.22, 0.03));
    const breastTrim = new THREE.Mesh(breastTrimGeo, pal.gold);
    breastTrim.position.set(0, 0.39, 0.182);
    breastTrim.rotation.x = -0.14;
    body.add(breastTrim);

    // Gorget collar
    const gorgetGeo = this.getGeo('pawn_gorget', () => new THREE.CylinderGeometry(0.118, 0.138, 0.055, 16));
    const gorget = new THREE.Mesh(gorgetGeo, pal.gold);
    gorget.position.y = 0.53;
    body.add(gorget);

    // Head + Kettle Hat Helmet (reaches 0.12 + 0.53 + 0.40 = 1.05)
    const head = new THREE.Group();
    head.position.set(0, 0.53, 0);
    body.add(head);

    const headCoreGeo = this.getGeo('pawn_head_core', () => new THREE.SphereGeometry(0.105, 14, 12));
    const headCore = new THREE.Mesh(headCoreGeo, pal.secondary);
    headCore.position.y = 0.11;
    head.add(headCore);

    // Visor shadow + noseguard
    const visorRecessGeo = this.getGeo('pawn_visor', () => new THREE.BoxGeometry(0.12, 0.04, 0.05));
    const visorRecess = new THREE.Mesh(visorRecessGeo, pal.recess);
    visorRecess.position.set(0, 0.125, 0.088);
    head.add(visorRecess);

    const chinGeo = this.getGeo('pawn_chin', () => new THREE.CylinderGeometry(0.095, 0.108, 0.08, 12));
    const chin = new THREE.Mesh(chinGeo, pal.primary);
    chin.position.y = 0.065;
    head.add(chin);

    // Wide-brimmed medieval Kettle Hat helmet
    const kettleGeo = this.getGeo('pawn_kettle_helm', () => {
      const pts = [
        new THREE.Vector2(0.225, 0.14),
        new THREE.Vector2(0.205, 0.165),
        new THREE.Vector2(0.145, 0.205),
        new THREE.Vector2(0.128, 0.28),
        new THREE.Vector2(0.082, 0.35),
        new THREE.Vector2(0.018, 0.385),
        new THREE.Vector2(0, 0.39),
      ];
      return new THREE.LatheGeometry(pts, 20);
    });
    head.add(new THREE.Mesh(kettleGeo, pal.primary));

    // Gold rim around wide brim
    const brimRimGeo = this.getGeo('pawn_kettle_rim', () => new THREE.TorusGeometry(0.218, 0.012, 8, 24));
    const brimRim = new THREE.Mesh(brimRimGeo, pal.gold);
    brimRim.rotation.x = Math.PI / 2;
    brimRim.position.y = 0.148;
    head.add(brimRim);

    // Gold ridge crest running front-to-back over kettle helm
    const crestGeo = this.getGeo(
      'pawn_kettle_crest',
      () => new THREE.TorusGeometry(0.132, 0.014, 8, 18, Math.PI),
    );
    const crest = new THREE.Mesh(crestGeo, pal.gold);
    crest.rotation.y = Math.PI / 2;
    crest.position.y = 0.265;
    head.add(crest);

    const finialGeo = this.getGeo('pawn_finial', () => new THREE.ConeGeometry(0.025, 0.05, 8));
    const finial = new THREE.Mesh(finialGeo, pal.gold);
    finial.position.y = 0.40;
    head.add(finial);

    // Left shieldArm holding Heater Shield
    const shieldHand = new THREE.Vector3(0.03, -0.11, 0.17);
    const shieldArm = this.createArmoredArm('left', 0.94, pal, shieldHand);
    shieldArm.position.set(0.205, 0.47, 0.01);
    body.add(shieldArm);

    const shield = this.createHeaterShield(0.24, 0.31, pal);
    shield.position.copy(shieldHand).add(new THREE.Vector3(0.035, 0.02, 0.035));
    shield.rotation.order = 'YXZ';
    shield.rotation.set(-0.08, 0.45, 0);
    shieldArm.add(shield);

    // Right weaponArm holding Broadsword
    const weaponHand = new THREE.Vector3(-0.02, -0.10, 0.18);
    const weaponArm = this.createArmoredArm('right', 0.94, pal, weaponHand);
    weaponArm.position.set(-0.205, 0.47, 0.01);
    body.add(weaponArm);

    const sword = this.createSword(0.45, 0.056, 0.16, 0.11, false, pal);
    sword.position.copy(weaponHand);
    sword.rotation.x = 0.12;
    weaponArm.add(sword);

    return { id, root, body, weaponArm, shieldArm, head, type: 'p', color };
  }

  // -------------------------------------------------------------------------
  // 2. ROOK (Fortified Battlement Keep, height ~1.28)
  // -------------------------------------------------------------------------
  private buildRook(id: string, color: PieceColor, pal: ColorPalette): ArticulatedPiece {
    const root = new THREE.Group();
    root.add(this.createPlinth(0.36, 0.15, pal, true));

    const body = new THREE.Group();
    body.position.y = 0.14;
    root.add(body);

    // Heavy octagonal masonry tower shaft
    const towerGeo = this.getGeo('rook_shaft', () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.30, 0),
        new THREE.Vector2(0.28, 0.16),
        new THREE.Vector2(0.245, 0.42),
        new THREE.Vector2(0.255, 0.67),
        new THREE.Vector2(0, 0.67),
      ];
      return new THREE.LatheGeometry(pts, 8);
    });
    const tower = new THREE.Mesh(towerGeo, pal.primary);
    tower.rotation.y = Math.PI / 8;
    body.add(tower);

    // 8 vertical corner buttress ribs
    const ribGeo = this.getGeo('rook_rib', () => new THREE.BoxGeometry(0.055, 0.62, 0.065));
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 + Math.PI / 8;
      const r = 0.255;
      const rib = new THREE.Mesh(ribGeo, pal.secondary);
      rib.position.set(Math.sin(ang) * r, 0.32, Math.cos(ang) * r);
      rib.rotation.y = ang;
      body.add(rib);
    }

    // Stepped stone masonry belt + gold collar bands
    const beltGeo = this.getGeo('rook_belt', () => new THREE.CylinderGeometry(0.278, 0.285, 0.045, 8));
    const belt = new THREE.Mesh(beltGeo, pal.secondary);
    belt.rotation.y = Math.PI / 8;
    belt.position.y = 0.25;
    body.add(belt);

    const neckCollarGeo = this.getGeo('rook_neck_gold', () => new THREE.CylinderGeometry(0.268, 0.264, 0.04, 8));
    const neckCollar = new THREE.Mesh(neckCollarGeo, pal.gold);
    neckCollar.rotation.y = Math.PI / 8;
    neckCollar.position.y = 0.65;
    body.add(neckCollar);

    // Dark arrow-slit recesses on the 4 cardinal faces
    const slitGeo = this.getGeo('rook_arrow_slit', () => new THREE.BoxGeometry(0.036, 0.19, 0.03));
    const slitCrossGeo = this.getGeo('rook_slit_cross', () => new THREE.BoxGeometry(0.088, 0.026, 0.028));
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2;
      const slitGroup = new THREE.Group();
      slitGroup.position.set(Math.sin(ang) * 0.232, 0.48, Math.cos(ang) * 0.232);
      slitGroup.rotation.y = ang;
      slitGroup.add(new THREE.Mesh(slitGeo, pal.recess));
      const cross = new THREE.Mesh(slitCrossGeo, pal.recess);
      cross.position.y = 0.03;
      slitGroup.add(cross);
      body.add(slitGroup);
    }

    // Front (+Z) fortified gatehouse portcullis recess so Rook clearly reads +Z front
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0.11, 0.265);
    const gateRecess = new THREE.Mesh(
      this.getGeo('rook_gate_recess', () => new THREE.BoxGeometry(0.14, 0.22, 0.035)),
      pal.recess,
    );
    gateGroup.add(gateRecess);
    const gateArch = new THREE.Mesh(
      this.getGeo('rook_gate_arch', () => new THREE.BoxGeometry(0.17, 0.032, 0.042)),
      pal.gold,
    );
    gateArch.position.y = 0.115;
    gateGroup.add(gateArch);
    const portcullisBarGeo = this.getGeo('rook_gate_bar', () => new THREE.CylinderGeometry(0.008, 0.008, 0.20, 6));
    for (const bx of [-0.042, 0, 0.042]) {
      const bar = new THREE.Mesh(portcullisBarGeo, pal.gold);
      bar.position.set(bx, 0, 0.012);
      gateGroup.add(bar);
    }
    body.add(gateGroup);

    // Upper articulated turret crown + siege battering ram (weaponArm pivots at y = 0.67)
    const weaponArm = new THREE.Group();
    weaponArm.position.set(0, 0.67, 0);
    body.add(weaponArm);

    const corbelGeo = this.getGeo('rook_corbel', () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.255, 0),
        new THREE.Vector2(0.325, 0.14),
        new THREE.Vector2(0.33, 0.30),
        new THREE.Vector2(0.23, 0.30),
        new THREE.Vector2(0.22, 0.22),
        new THREE.Vector2(0, 0.22),
      ];
      return new THREE.LatheGeometry(pts, 8);
    });
    const corbel = new THREE.Mesh(corbelGeo, pal.primary);
    corbel.rotation.y = Math.PI / 8;
    weaponArm.add(corbel);

    // Dark recessed inner rampart floor
    const rampartFloor = new THREE.Mesh(
      this.getGeo('rook_rampart_floor', () => new THREE.CylinderGeometry(0.22, 0.22, 0.02, 8)),
      pal.recess,
    );
    rampartFloor.rotation.y = Math.PI / 8;
    rampartFloor.position.y = 0.23;
    weaponArm.add(rampartFloor);

    // Gold battlement band
    const crownBand = new THREE.Mesh(
      this.getGeo('rook_crown_band', () => new THREE.CylinderGeometry(0.336, 0.328, 0.042, 8)),
      pal.gold,
    );
    crownBand.rotation.y = Math.PI / 8;
    crownBand.position.y = 0.155;
    weaponArm.add(crownBand);

    // 8-merlon crenellated crown (reaches y = 0.14 + 0.67 + 0.47 = 1.28)
    const merlonGeo = this.getGeo('rook_merlon', () => new THREE.BoxGeometry(0.125, 0.155, 0.085));
    const merlonCapGeo = this.getGeo('rook_merlon_cap', () => new THREE.BoxGeometry(0.138, 0.028, 0.095));
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const r = 0.275;
      const mGroup = new THREE.Group();
      mGroup.position.set(Math.sin(ang) * r, 0.375, Math.cos(ang) * r);
      mGroup.rotation.y = ang;
      mGroup.add(new THREE.Mesh(merlonGeo, pal.primary));
      const cap = new THREE.Mesh(merlonCapGeo, pal.gold);
      cap.position.y = 0.086;
      mGroup.add(cap);
      weaponArm.add(mGroup);
    }

    // Integrated front (+Z) golden siege ram prow embedded cleanly in the front battlement
    const ramBeam = new THREE.Mesh(
      this.getGeo('rook_ram_beam', () => new THREE.CylinderGeometry(0.055, 0.068, 0.24, 10)),
      pal.secondary,
    );
    ramBeam.rotation.x = Math.PI / 2;
    ramBeam.position.set(0, 0.22, 0.26);
    weaponArm.add(ramBeam);

    const ramHead = new THREE.Mesh(
      this.getGeo('rook_ram_head', () => new THREE.ConeGeometry(0.078, 0.13, 8)),
      pal.gold,
    );
    ramHead.rotation.x = Math.PI / 2;
    ramHead.position.set(0, 0.22, 0.40);
    weaponArm.add(ramHead);

    return { id, root, body, weaponArm, type: 'r', color };
  }

  // -------------------------------------------------------------------------
  // 3. KNIGHT (Armored Warhorse & Lancer, height ~1.40)
  // -------------------------------------------------------------------------
  private buildKnight(id: string, color: PieceColor, pal: ColorPalette): ArticulatedPiece {
    const root = new THREE.Group();
    root.add(this.createPlinth(0.36, 0.14, pal));

    const body = new THREE.Group();
    body.position.y = 0.13;
    root.add(body);

    // Sculpted Warhorse profile in 2D (+X = front, +Y = up), extruded & rotated -PI/2 so +X -> +Z
    const horseProfileGeo = this.getGeo('knight_horse_profile', () => {
      const s = new THREE.Shape();
      // Start under chest, trace forward chest -> neck -> muzzle -> ears -> mane -> back -> rump -> belly
      s.moveTo(0.16, 0.24);
      s.quadraticCurveTo(0.29, 0.34, 0.28, 0.50);
      s.lineTo(0.24, 0.68);
      s.lineTo(0.34, 0.62); // nose bridge
      s.lineTo(0.37, 0.66); // muzzle
      s.lineTo(0.27, 0.80); // brow
      s.lineTo(0.24, 0.90); // ear tip
      s.lineTo(0.18, 0.84); // poll
      s.quadraticCurveTo(0.07, 0.72, 0.04, 0.53); // arched neck back
      s.lineTo(-0.18, 0.52); // horse back / saddle seat
      s.quadraticCurveTo(-0.30, 0.48, -0.30, 0.30); // hindquarters
      s.lineTo(-0.22, 0.22);
      s.quadraticCurveTo(0.0, 0.20, 0.16, 0.24);
      s.closePath();

      const depth = 0.20;
      const g = new THREE.ExtrudeGeometry(s, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.032,
        bevelSize: 0.025,
        bevelSegments: 3,
      });
      g.translate(0, 0, -depth * 0.5);
      g.rotateY(-Math.PI / 2);
      return g;
    });
    body.add(new THREE.Mesh(horseProfileGeo, pal.primary));

    // Forelegs & Hindlegs planted cleanly on plinth
    const legGeo = this.getGeo('knight_horse_leg', () => new THREE.CylinderGeometry(0.042, 0.032, 0.28, 10));
    const hoofGeo = this.getGeo('knight_horse_hoof', () => new THREE.CylinderGeometry(0.036, 0.044, 0.045, 10));
    const legCoords: Array<[number, number, number]> = [
      [-0.088, 0.14, 0.16],
      [0.088, 0.14, 0.16],
      [-0.095, 0.14, -0.18],
      [0.095, 0.14, -0.18],
    ];
    for (const [lx, ly, lz] of legCoords) {
      const leg = new THREE.Mesh(legGeo, pal.secondary);
      leg.position.set(lx, ly, lz);
      leg.rotation.x = lz > 0 ? -0.14 : 0.12;
      body.add(leg);

      const hoof = new THREE.Mesh(hoofGeo, pal.gold);
      hoof.position.set(lx, 0.022, lz + (lz > 0 ? 0.02 : -0.02));
      body.add(hoof);
    }

    // Gold Chamfron (horse forehead armor) + spike + peytral chest plate
    const chamfronGeo = this.getGeo('knight_chamfron', () => new THREE.BoxGeometry(0.11, 0.18, 0.045));
    const chamfron = new THREE.Mesh(chamfronGeo, pal.gold);
    chamfron.position.set(0, 0.72, 0.305);
    chamfron.rotation.x = -0.62;
    body.add(chamfron);

    const hornGeo = this.getGeo('knight_chamfron_horn', () => new THREE.ConeGeometry(0.018, 0.08, 8));
    const horn = new THREE.Mesh(hornGeo, pal.gold);
    horn.position.set(0, 0.80, 0.32);
    horn.rotation.x = 0.92;
    body.add(horn);

    const peytralGeo = this.getGeo('knight_peytral', () => new THREE.SphereGeometry(0.14, 12, 10));
    const peytral = new THREE.Mesh(peytralGeo, pal.gold);
    peytral.scale.set(0.95, 0.9, 0.55);
    peytral.position.set(0, 0.38, 0.25);
    body.add(peytral);

    // Armored caparison flanks with gold trim borders
    const flankGeo = this.getGeo('knight_caparison', () => new THREE.BoxGeometry(0.032, 0.24, 0.42));
    const flankTrimGeo = this.getGeo('knight_caparison_trim', () => new THREE.BoxGeometry(0.036, 0.032, 0.43));
    for (const side of [-1, 1]) {
      const flank = new THREE.Mesh(flankGeo, pal.secondary);
      flank.position.set(side * 0.135, 0.33, -0.02);
      flank.rotation.z = side * -0.08;
      body.add(flank);

      const trim = new THREE.Mesh(flankTrimGeo, pal.gold);
      trim.position.set(side * 0.143, 0.22, -0.02);
      body.add(trim);
    }

    // Gold-plated horse mane crest + tail plume
    const maneGeo = this.getGeo('knight_mane', () => new THREE.BoxGeometry(0.048, 0.28, 0.075));
    const mane = new THREE.Mesh(maneGeo, pal.gold);
    mane.position.set(0, 0.70, 0.125);
    mane.rotation.x = 0.44;
    body.add(mane);

    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.42, -0.28),
      new THREE.Vector3(0, 0.34, -0.35),
      new THREE.Vector3(0, 0.18, -0.33),
    ]);
    const tailGeo = this.getGeo('knight_tail', () => new THREE.TubeGeometry(tailCurve, 10, 0.034, 8, false));
    body.add(new THREE.Mesh(tailGeo, pal.secondary));

    // Mounted Armored Rider seated in saddle (z = -0.05)
    const riderSaddle = new THREE.Mesh(
      this.getGeo('knight_saddle', () => new THREE.BoxGeometry(0.24, 0.08, 0.24)),
      pal.gold,
    );
    riderSaddle.position.set(0, 0.53, -0.05);
    body.add(riderSaddle);

    const riderTorso = new THREE.Mesh(
      this.getGeo('knight_rider_torso', () => new THREE.CylinderGeometry(0.13, 0.115, 0.32, 12)),
      pal.primary,
    );
    riderTorso.scale.set(1.15, 1, 0.85);
    riderTorso.position.set(0, 0.71, -0.05);
    body.add(riderTorso);

    const riderBelt = new THREE.Mesh(
      this.getGeo('knight_rider_belt', () => new THREE.CylinderGeometry(0.128, 0.128, 0.04, 12)),
      pal.gold,
    );
    riderBelt.scale.set(1.15, 1, 0.85);
    riderBelt.position.set(0, 0.60, -0.05);
    body.add(riderBelt);

    // Rider greaves gripping horse flanks
    const greaveGeo = this.getGeo('knight_greave', () => new THREE.CylinderGeometry(0.042, 0.034, 0.25, 8));
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(greaveGeo, pal.secondary);
      g.position.set(side * 0.155, 0.44, -0.02);
      g.rotation.z = side * 0.16;
      g.rotation.x = -0.22;
      body.add(g);
    }

    // Head: Flat-topped Crusader Great Helm + Gold Face Cross + Visor Slit + Crest Plume (total height ~1.40)
    const head = new THREE.Group();
    head.position.set(0, 0.87, -0.05);
    body.add(head);

    const helmGeo = this.getGeo('knight_great_helm', () => new THREE.CylinderGeometry(0.114, 0.122, 0.27, 12));
    const helm = new THREE.Mesh(helmGeo, pal.primary);
    helm.position.y = 0.14;
    head.add(helm);

    const helmTop = new THREE.Mesh(
      this.getGeo('knight_helm_top', () => new THREE.CylinderGeometry(0.098, 0.114, 0.03, 12)),
      pal.gold,
    );
    helmTop.position.y = 0.285;
    head.add(helmTop);

    // Visor slit & brass face cross on +Z
    const visorSlit = new THREE.Mesh(
      this.getGeo('knight_visor_slit', () => new THREE.BoxGeometry(0.14, 0.026, 0.04)),
      pal.recess,
    );
    visorSlit.position.set(0, 0.175, 0.106);
    head.add(visorSlit);

    const faceCrossV = new THREE.Mesh(
      this.getGeo('knight_cross_v', () => new THREE.BoxGeometry(0.024, 0.21, 0.024)),
      pal.gold,
    );
    faceCrossV.position.set(0, 0.145, 0.118);
    head.add(faceCrossV);

    const faceCrossH = new THREE.Mesh(
      this.getGeo('knight_cross_h', () => new THREE.BoxGeometry(0.145, 0.022, 0.024)),
      pal.gold,
    );
    faceCrossH.position.set(0, 0.15, 0.118);
    head.add(faceCrossH);

    // Plumed crest reaching 0.13 + 0.87 + 0.40 = 1.40
    const plumeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.30, 0.04),
      new THREE.Vector3(0, 0.39, -0.03),
      new THREE.Vector3(0, 0.34, -0.14),
    ]);
    const plumeGeo = this.getGeo('knight_plume', () => new THREE.TubeGeometry(plumeCurve, 12, 0.026, 8, false));
    head.add(new THREE.Mesh(plumeGeo, pal.gold));

    // Left shieldArm holding Heater Shield
    const shieldHand = new THREE.Vector3(0.02, -0.10, 0.16);
    const shieldArm = this.createArmoredArm('left', 0.92, pal, shieldHand);
    shieldArm.position.set(0.185, 0.83, -0.04);
    body.add(shieldArm);

    const shield = this.createHeaterShield(0.24, 0.31, pal);
    shield.position.copy(shieldHand).add(new THREE.Vector3(0.035, 0.01, 0.03));
    shield.rotation.order = 'YXZ';
    shield.rotation.set(-0.08, 0.55, 0);
    shieldArm.add(shield);

    // Right weaponArm holding Jousting Lance with Gold Vamplate & Steel Tip
    const weaponHand = new THREE.Vector3(-0.01, -0.10, 0.17);
    const weaponArm = this.createArmoredArm('right', 0.92, pal, weaponHand);
    weaponArm.position.set(-0.185, 0.83, -0.04);
    body.add(weaponArm);

    const lanceGroup = new THREE.Group();
    lanceGroup.position.copy(weaponHand);
    lanceGroup.rotation.x = 0.32; // Upright proud tilt at rest; +1.20 snaps it horizontal forward!

    const shaft = new THREE.Mesh(
      this.getGeo('knight_lance_shaft', () => new THREE.CylinderGeometry(0.017, 0.023, 0.72, 10)),
      pal.leather,
    );
    shaft.position.y = 0.12;
    lanceGroup.add(shaft);

    const vamplate = new THREE.Mesh(
      this.getGeo('knight_vamplate', () => new THREE.ConeGeometry(0.082, 0.105, 14)),
      pal.gold,
    );
    vamplate.position.y = 0.08;
    lanceGroup.add(vamplate);

    const lanceCollar = new THREE.Mesh(
      this.getGeo('knight_lance_collar', () => new THREE.CylinderGeometry(0.027, 0.027, 0.036, 10)),
      pal.gold,
    );
    lanceCollar.position.y = 0.46;
    lanceGroup.add(lanceCollar);

    const lanceTip = new THREE.Mesh(
      this.createDiamondBladeGeo('knight_lance_tip', 0.21, 0.034, 0.02, 0.024),
      pal.steel,
    );
    lanceTip.position.y = 0.48;
    lanceGroup.add(lanceTip);

    weaponArm.add(lanceGroup);

    return { id, root, body, weaponArm, shieldArm, head, type: 'n', color };
  }

  // -------------------------------------------------------------------------
  // 4. BISHOP (Battle Prelate, height ~1.52)
  // -------------------------------------------------------------------------
  private buildBishop(id: string, color: PieceColor, pal: ColorPalette): ArticulatedPiece {
    const root = new THREE.Group();
    root.add(this.createPlinth(0.35, 0.14, pal));

    const body = new THREE.Group();
    body.position.y = 0.13;
    root.add(body);

    // Fluted clerical robe / cassock
    const robeGeo = this.getGeo('bishop_robe', () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.26, 0),
        new THREE.Vector2(0.24, 0.18),
        new THREE.Vector2(0.185, 0.56),
        new THREE.Vector2(0.195, 0.78),
        new THREE.Vector2(0.14, 0.89),
        new THREE.Vector2(0, 0.89),
      ];
      return new THREE.LatheGeometry(pts, 20);
    });
    body.add(new THREE.Mesh(robeGeo, pal.primary));

    // Vertical sculptural drapery flutes around robe
    const fluteGeo = this.getGeo('bishop_flute', () => new THREE.CylinderGeometry(0.022, 0.036, 0.62, 8));
    for (let i = 0; i < 10; i++) {
      const ang = (i * Math.PI * 2) / 10;
      const flute = new THREE.Mesh(fluteGeo, pal.secondary);
      flute.position.set(Math.sin(ang) * 0.20, 0.31, Math.cos(ang) * 0.20);
      flute.rotation.x = Math.cos(ang) * -0.12;
      flute.rotation.z = Math.sin(ang) * 0.12;
      body.add(flute);
    }

    // Hanging front golden clerical stole
    const stole = new THREE.Mesh(
      this.getGeo('bishop_stole', () => new THREE.BoxGeometry(0.088, 0.66, 0.032)),
      pal.gold,
    );
    stole.position.set(0, 0.41, 0.215);
    stole.rotation.x = -0.14;
    body.add(stole);

    // Pectoral armored breastplate / shoulder mantle
    const pectoral = new THREE.Mesh(
      this.getGeo('bishop_pectoral', () => new THREE.CylinderGeometry(0.195, 0.185, 0.24, 16)),
      pal.secondary,
    );
    pectoral.scale.set(1.12, 1, 0.88);
    pectoral.position.y = 0.74;
    body.add(pectoral);

    const collarGold = new THREE.Mesh(
      this.getGeo('bishop_collar', () => new THREE.TorusGeometry(0.145, 0.016, 8, 18)),
      pal.gold,
    );
    collarGold.rotation.x = Math.PI / 2;
    collarGold.position.y = 0.86;
    body.add(collarGold);

    // Head: Bearded/visored prelate + Cleft Pointed Mitre with gold cross (total ~1.52)
    const head = new THREE.Group();
    head.position.set(0, 0.89, 0);
    body.add(head);

    const faceCore = new THREE.Mesh(
      this.getGeo('bishop_head_core', () => new THREE.SphereGeometry(0.105, 14, 12)),
      pal.primary,
    );
    faceCore.position.y = 0.11;
    head.add(faceCore);

    // Sculpted beard & brow recess
    const beard = new THREE.Mesh(
      this.getGeo('bishop_beard', () => new THREE.ConeGeometry(0.075, 0.12, 10)),
      pal.secondary,
    );
    beard.rotation.x = Math.PI;
    beard.position.set(0, 0.055, 0.068);
    head.add(beard);

    const eyeShadow = new THREE.Mesh(
      this.getGeo('bishop_eye_shadow', () => new THREE.BoxGeometry(0.115, 0.032, 0.04)),
      pal.recess,
    );
    eyeShadow.position.set(0, 0.13, 0.09);
    head.add(eyeShadow);

    // Cleft Pointed Mitre (2D side profile with V-cleft between front & back horns, rotated -PI/2)
    const mitreGeo = this.getGeo('bishop_mitre', () => {
      const s = new THREE.Shape();
      s.moveTo(-0.115, 0.16);
      s.lineTo(0.115, 0.16);
      s.quadraticCurveTo(0.135, 0.31, 0.065, 0.49); // front peak
      s.lineTo(0.0, 0.34); // cleft valley!
      s.lineTo(-0.065, 0.49); // rear peak
      s.quadraticCurveTo(-0.135, 0.31, -0.115, 0.16);
      s.closePath();

      const depth = 0.17;
      const g = new THREE.ExtrudeGeometry(s, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.02,
        bevelSegments: 2,
      });
      g.translate(0, 0, -depth * 0.5);
      g.rotateY(-Math.PI / 2);
      return g;
    });
    head.add(new THREE.Mesh(mitreGeo, pal.primary));

    // Gold circlet band & raised Latin cross on front mitre peak (+Z)
    const mitreBand = new THREE.Mesh(
      this.getGeo('bishop_mitre_band', () => new THREE.CylinderGeometry(0.128, 0.126, 0.032, 16)),
      pal.gold,
    );
    mitreBand.position.y = 0.175;
    head.add(mitreBand);

    const mitreCross = this.createLatinCross(0.15, 0.10, 0.022, pal);
    mitreCross.position.set(0, 0.26, 0.14);
    mitreCross.rotation.x = -0.18;
    head.add(mitreCross);

    // Left shieldArm holding Open Illuminated Tome/Book
    const shieldHand = new THREE.Vector3(0.03, -0.11, 0.19);
    const shieldArm = this.createArmoredArm('left', 1.0, pal, shieldHand);
    shieldArm.position.set(0.22, 0.82, 0.02);
    body.add(shieldArm);

    const tomeGroup = new THREE.Group();
    tomeGroup.position.copy(shieldHand).add(new THREE.Vector3(0.02, 0.04, 0.06));
    tomeGroup.rotation.set(0.62, 0.25, -0.1);

    const coverGeo = this.getGeo('bishop_tome_cover', () => new THREE.BoxGeometry(0.135, 0.18, 0.014));
    const pageGeo = this.getGeo('bishop_tome_page', () => new THREE.BoxGeometry(0.12, 0.162, 0.022));
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.rotation.y = side * -0.38;
      wing.position.x = side * 0.062;
      wing.add(new THREE.Mesh(coverGeo, pal.leather));
      const pages = new THREE.Mesh(pageGeo, pal.parchment);
      pages.position.z = 0.015;
      wing.add(pages);
      tomeGroup.add(wing);
    }
    const spine = new THREE.Mesh(
      this.getGeo('bishop_tome_spine', () => new THREE.CylinderGeometry(0.014, 0.014, 0.185, 8)),
      pal.gold,
    );
    tomeGroup.add(spine);
    shieldArm.add(tomeGroup);

    // Right weaponArm gripping Spiral Golden Crosier
    const weaponHand = new THREE.Vector3(-0.02, -0.10, 0.19);
    const weaponArm = this.createArmoredArm('right', 1.0, pal, weaponHand);
    weaponArm.position.set(-0.22, 0.82, 0.02);
    body.add(weaponArm);

    const crosierGroup = new THREE.Group();
    crosierGroup.position.copy(weaponHand);
    crosierGroup.rotation.x = 0.06;

    const staff = new THREE.Mesh(
      this.getGeo('bishop_staff', () => new THREE.CylinderGeometry(0.018, 0.018, 0.92, 10)),
      pal.leather,
    );
    staff.position.y = -0.14;
    crosierGroup.add(staff);

    const ferrule = new THREE.Mesh(
      this.getGeo('bishop_ferrule', () => new THREE.CylinderGeometry(0.026, 0.012, 0.09, 10)),
      pal.gold,
    );
    ferrule.position.y = -0.60;
    crosierGroup.add(ferrule);

    const lantern = new THREE.Mesh(
      this.getGeo('bishop_lantern', () => new THREE.CylinderGeometry(0.036, 0.028, 0.065, 8)),
      pal.gold,
    );
    lantern.position.y = 0.34;
    crosierGroup.add(lantern);

    // TubeGeometry spiral shepherd's crook curling gracefully toward +Z
    const crookGeo = this.getGeo('bishop_crosier_crook', () => {
      const pts: THREE.Vector3[] = [];
      pts.push(new THREE.Vector3(0, 0.35, 0));
      const turns = 1.25;
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = -Math.PI / 2 + t * Math.PI * 2 * turns;
        const rad = 0.135 * (1 - t * 0.68);
        const cy = 0.51;
        const cz = 0.04;
        pts.push(new THREE.Vector3(0, cy + Math.sin(angle) * rad, cz + Math.cos(angle) * rad));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.02, 8, false);
    });
    crosierGroup.add(new THREE.Mesh(crookGeo, pal.gold));

    const crookCross = this.createLatinCross(0.09, 0.065, 0.016, pal);
    crookCross.position.set(0, 0.46, 0.04);
    crosierGroup.add(crookCross);

    weaponArm.add(crosierGroup);

    return { id, root, body, weaponArm, shieldArm, head, type: 'b', color };
  }

  // -------------------------------------------------------------------------
  // 5. QUEEN (Warrior Sovereign, height ~1.68)
  // -------------------------------------------------------------------------
  private buildQueen(id: string, color: PieceColor, pal: ColorPalette): ArticulatedPiece {
    const root = new THREE.Group();
    root.add(this.createPlinth(0.36, 0.15, pal));

    const body = new THREE.Group();
    body.position.y = 0.14;
    root.add(body);

    // Fluted sweeping royal gown
    const gownGeo = this.getGeo('queen_gown', () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.285, 0),
        new THREE.Vector2(0.26, 0.20),
        new THREE.Vector2(0.185, 0.54),
        new THREE.Vector2(0.155, 0.70),
        new THREE.Vector2(0.205, 0.90),
        new THREE.Vector2(0.175, 0.98),
        new THREE.Vector2(0.115, 1.01),
        new THREE.Vector2(0, 1.01),
      ];
      return new THREE.LatheGeometry(pts, 24);
    });
    const gown = new THREE.Mesh(gownGeo, pal.primary);
    gown.scale.set(1.04, 1, 0.94);
    body.add(gown);

    // Sculpted vertical gown pleats
    const pleatGeo = this.getGeo('queen_pleat', () => new THREE.CylinderGeometry(0.02, 0.038, 0.68, 8));
    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI * 2) / 12;
      const pleat = new THREE.Mesh(pleatGeo, pal.secondary);
      pleat.position.set(Math.sin(ang) * 0.21, 0.34, Math.cos(ang) * 0.195);
      pleat.rotation.x = Math.cos(ang) * -0.16;
      pleat.rotation.z = Math.sin(ang) * 0.16;
      body.add(pleat);
    }

    // Gold hem ring + waist girdle + breastplate V-chevron
    const hemRing = new THREE.Mesh(
      this.getGeo('queen_hem_ring', () => new THREE.TorusGeometry(0.278, 0.013, 8, 24)),
      pal.gold,
    );
    hemRing.rotation.x = Math.PI / 2;
    hemRing.scale.set(1.04, 0.94, 1);
    hemRing.position.y = 0.04;
    body.add(hemRing);

    const girdle = new THREE.Mesh(
      this.getGeo('queen_girdle', () => new THREE.CylinderGeometry(0.164, 0.168, 0.05, 18)),
      pal.gold,
    );
    girdle.position.y = 0.70;
    body.add(girdle);

    const crestFront = new THREE.Mesh(
      this.getGeo('queen_chest_emblem', () => new THREE.OctahedronGeometry(0.055, 0)),
      pal.gold,
    );
    crestFront.scale.set(1, 1.3, 0.4);
    crestFront.position.set(0, 0.86, 0.18);
    body.add(crestFront);

    // Head: Veiled/helmed regal face + 8-spiked golden coronet (0.14 + 1.01 + 0.53 = 1.68)
    const head = new THREE.Group();
    head.position.set(0, 1.01, 0);
    body.add(head);

    const headSphere = new THREE.Mesh(
      this.getGeo('queen_head_sphere', () => new THREE.SphereGeometry(0.105, 14, 12)),
      pal.primary,
    );
    headSphere.position.y = 0.11;
    head.add(headSphere);

    // Regal veil draping down -Z behind head
    const veilGeo = this.getGeo('queen_veil', () => new THREE.CylinderGeometry(0.108, 0.155, 0.28, 12, 1, false, Math.PI * 0.55, Math.PI * 0.9));
    const veil = new THREE.Mesh(veilGeo, pal.secondary);
    veil.position.set(0, 0.04, -0.02);
    head.add(veil);

    const browRecess = new THREE.Mesh(
      this.getGeo('queen_brow', () => new THREE.BoxGeometry(0.10, 0.028, 0.035)),
      pal.recess,
    );
    browRecess.position.set(0, 0.125, 0.09);
    head.add(browRecess);

    // 8-spiked golden coronet
    const circlet = new THREE.Mesh(
      this.getGeo('queen_circlet', () => new THREE.CylinderGeometry(0.125, 0.112, 0.055, 16)),
      pal.gold,
    );
    circlet.position.y = 0.185;
    head.add(circlet);

    const coronetCap = new THREE.Mesh(
      this.getGeo('queen_coronet_cap', () => new THREE.SphereGeometry(0.10, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      pal.primary,
    );
    coronetCap.position.y = 0.205;
    head.add(coronetCap);

    const spikeGeo = this.getGeo('queen_crown_spike', () => new THREE.ConeGeometry(0.024, 0.24, 6));
    const pearlGeo = this.getGeo('queen_crown_pearl', () => new THREE.SphereGeometry(0.018, 8, 8));
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const spikeGroup = new THREE.Group();
      spikeGroup.position.set(Math.sin(ang) * 0.115, 0.21, Math.cos(ang) * 0.115);
      spikeGroup.rotation.order = 'YXZ';
      spikeGroup.rotation.y = ang;
      spikeGroup.rotation.x = 0.22;

      const spike = new THREE.Mesh(spikeGeo, pal.gold);
      spike.position.y = 0.12;
      spikeGroup.add(spike);

      const pearl = new THREE.Mesh(pearlGeo, pal.gold);
      pearl.position.y = 0.245;
      spikeGroup.add(pearl);

      head.add(spikeGroup);
    }

    // Center spire finial reaching height 1.68
    const centerOrb = new THREE.Mesh(
      this.getGeo('queen_apex_orb', () => new THREE.OctahedronGeometry(0.042, 0)),
      pal.gold,
    );
    centerOrb.scale.set(0.8, 1.4, 0.8);
    centerOrb.position.y = 0.47;
    head.add(centerOrb);

    const centerStem = new THREE.Mesh(
      this.getGeo('queen_apex_stem', () => new THREE.CylinderGeometry(0.015, 0.03, 0.16, 8)),
      pal.gold,
    );
    centerStem.position.y = 0.35;
    head.add(centerStem);

    // Left shieldArm holding Heraldic Round Buckler
    const shieldHand = new THREE.Vector3(0.03, -0.10, 0.18);
    const shieldArm = this.createArmoredArm('left', 1.0, pal, shieldHand);
    shieldArm.position.set(0.22, 0.94, 0.02);
    body.add(shieldArm);

    const buckler = new THREE.Group();
    buckler.position.copy(shieldHand).add(new THREE.Vector3(0.04, 0.01, 0.03));
    buckler.rotation.order = 'YXZ';
    buckler.rotation.set(-0.06, 0.58, 0);

    const bucklerBody = new THREE.Mesh(
      this.getGeo('queen_buckler_body', () => new THREE.CylinderGeometry(0.135, 0.135, 0.026, 20)),
      pal.primary,
    );
    bucklerBody.rotation.x = Math.PI / 2;
    buckler.add(bucklerBody);

    const bucklerRim = new THREE.Mesh(
      this.getGeo('queen_buckler_rim', () => new THREE.TorusGeometry(0.132, 0.016, 8, 24)),
      pal.gold,
    );
    buckler.add(bucklerRim);

    const bucklerBoss = new THREE.Mesh(
      this.getGeo('queen_buckler_boss', () => new THREE.ConeGeometry(0.045, 0.048, 8)),
      pal.gold,
    );
    bucklerBoss.rotation.x = Math.PI / 2;
    bucklerBoss.position.z = 0.024;
    buckler.add(bucklerBoss);
    shieldArm.add(buckler);

    // Right weaponArm wielding Three-Pronged Golden Trident / War-Scepter
    const weaponHand = new THREE.Vector3(-0.02, -0.10, 0.18);
    const weaponArm = this.createArmoredArm('right', 1.0, pal, weaponHand);
    weaponArm.position.set(-0.22, 0.94, 0.02);
    body.add(weaponArm);

    const trident = new THREE.Group();
    trident.position.copy(weaponHand);
    trident.rotation.x = 0.08;

    const tridentShaft = new THREE.Mesh(
      this.getGeo('queen_trident_shaft', () => new THREE.CylinderGeometry(0.018, 0.018, 1.02, 10)),
      pal.gold,
    );
    tridentShaft.position.y = -0.14;
    trident.add(tridentShaft);

    const tridentBar = new THREE.Mesh(
      this.getGeo('queen_trident_bar', () => new THREE.BoxGeometry(0.20, 0.036, 0.038)),
      pal.gold,
    );
    tridentBar.position.y = 0.37;
    trident.add(tridentBar);

    const centerSpear = new THREE.Mesh(
      this.createDiamondBladeGeo('queen_trident_center', 0.36, 0.034, 0.022, 0.024),
      pal.steel,
    );
    centerSpear.position.y = 0.38;
    trident.add(centerSpear);

    // Two curved outer golden trident tines
    for (const side of [-1, 1]) {
      const tineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.08, 0.37, 0),
        new THREE.Vector3(side * 0.125, 0.47, 0),
        new THREE.Vector3(side * 0.095, 0.62, 0),
      ]);
      const tine = new THREE.Mesh(
        this.getGeo(
          `queen_trident_tine_${side}`,
          () => new THREE.TubeGeometry(tineCurve, 12, 0.014, 8, false),
        ),
        pal.gold,
      );
      trident.add(tine);

      const tineTip = new THREE.Mesh(
        this.getGeo('queen_tine_tip', () => new THREE.ConeGeometry(0.018, 0.065, 6)),
        pal.gold,
      );
      tineTip.position.set(side * 0.092, 0.645, 0);
      tineTip.rotation.z = side * 0.16;
      trident.add(tineTip);
    }

    weaponArm.add(trident);

    return { id, root, body, weaponArm, shieldArm, head, type: 'q', color };
  }

  // -------------------------------------------------------------------------
  // 6. KING (High Monarch, height ~1.88)
  // -------------------------------------------------------------------------
  private buildKing(id: string, color: PieceColor, pal: ColorPalette): ArticulatedPiece {
    const root = new THREE.Group();
    root.add(this.createPlinth(0.38, 0.16, pal));

    const body = new THREE.Group();
    body.position.y = 0.15;
    root.add(body);

    // Broad royal surcoat & armored skirt
    const surcoatGeo = this.getGeo('king_surcoat', () => {
      const pts = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.295, 0),
        new THREE.Vector2(0.265, 0.22),
        new THREE.Vector2(0.215, 0.62),
        new THREE.Vector2(0.245, 0.96),
        new THREE.Vector2(0.22, 1.09),
        new THREE.Vector2(0.135, 1.15),
        new THREE.Vector2(0, 1.15),
      ];
      return new THREE.LatheGeometry(pts, 22);
    });
    const surcoat = new THREE.Mesh(surcoatGeo, pal.primary);
    surcoat.scale.set(1.08, 1, 0.90);
    body.add(surcoat);

    // Sweeping royal mantle/cloak falling down -Z
    const mantleGeo = this.getGeo('king_mantle', () => new THREE.CylinderGeometry(0.20, 0.30, 1.02, 12, 1, false, Math.PI * 0.6, Math.PI * 0.8));
    const mantle = new THREE.Mesh(mantleGeo, pal.secondary);
    mantle.position.set(0, 0.56, -0.04);
    body.add(mantle);

    // Heavy gilded belt + chest chain of office
    const kingBelt = new THREE.Mesh(
      this.getGeo('king_belt', () => new THREE.CylinderGeometry(0.23, 0.225, 0.055, 20)),
      pal.gold,
    );
    kingBelt.scale.set(1.08, 1, 0.90);
    kingBelt.position.y = 0.68;
    body.add(kingBelt);

    const chainRing = new THREE.Mesh(
      this.getGeo('king_chain', () => new THREE.TorusGeometry(0.185, 0.018, 8, 22)),
      pal.gold,
    );
    chainRing.rotation.x = Math.PI * 0.42;
    chainRing.position.set(0, 1.02, 0.06);
    body.add(chainRing);

    const chestMedallion = new THREE.Mesh(
      this.getGeo('king_medallion', () => new THREE.OctahedronGeometry(0.055, 0)),
      pal.gold,
    );
    chestMedallion.scale.set(1, 1.2, 0.45);
    chestMedallion.position.set(0, 0.92, 0.228);
    body.add(chestMedallion);

    // Head: Noble bearded/visored monarch + Arched Imperial Crown with Gold Cross (total 1.88)
    const head = new THREE.Group();
    head.position.set(0, 1.15, 0);
    body.add(head);

    const headSphere = new THREE.Mesh(
      this.getGeo('king_head_sphere', () => new THREE.SphereGeometry(0.118, 14, 12)),
      pal.primary,
    );
    headSphere.position.y = 0.125;
    head.add(headSphere);

    // Sculpted royal beard & visor shadow
    const kingBeard = new THREE.Mesh(
      this.getGeo('king_beard', () => new THREE.ConeGeometry(0.088, 0.135, 10)),
      pal.secondary,
    );
    kingBeard.rotation.x = Math.PI;
    kingBeard.position.set(0, 0.065, 0.075);
    head.add(kingBeard);

    const kingVisor = new THREE.Mesh(
      this.getGeo('king_visor', () => new THREE.BoxGeometry(0.125, 0.032, 0.04)),
      pal.recess,
    );
    kingVisor.position.set(0, 0.145, 0.102);
    head.add(kingVisor);

    // Crown circlet + 8 rim fleurs + velvet dome
    const crownCirclet = new THREE.Mesh(
      this.getGeo('king_crown_circlet', () => new THREE.CylinderGeometry(0.138, 0.125, 0.065, 18)),
      pal.gold,
    );
    crownCirclet.position.y = 0.21;
    head.add(crownCirclet);

    const crownVelvetCap = new THREE.Mesh(
      this.getGeo('king_crown_cap', () => new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      pal.primary,
    );
    crownVelvetCap.position.y = 0.235;
    head.add(crownVelvetCap);

    const crownLeafGeo = this.getGeo('king_crown_leaf', () => new THREE.ConeGeometry(0.026, 0.08, 6));
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const leaf = new THREE.Mesh(crownLeafGeo, pal.gold);
      leaf.position.set(Math.sin(ang) * 0.13, 0.275, Math.cos(ang) * 0.13);
      head.add(leaf);
    }

    // Two intersecting imperial arches
    for (const rotY of [0, Math.PI / 2]) {
      const archCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.13, 0.235, 0),
        new THREE.Vector3(-0.11, 0.37, 0),
        new THREE.Vector3(0, 0.425, 0),
        new THREE.Vector3(0.11, 0.37, 0),
        new THREE.Vector3(0.13, 0.235, 0),
      ]);
      const arch = new THREE.Mesh(
        this.getGeo(`king_arch_${rotY.toFixed(2)}`, () => new THREE.TubeGeometry(archCurve, 18, 0.017, 8, false)),
        pal.gold,
      );
      arch.rotation.y = rotY;
      head.add(arch);
    }

    // Imperial Orb & Cross at apex (0.15 + 1.15 + 0.58 = 1.88)
    const crownOrb = new THREE.Mesh(
      this.getGeo('king_crown_orb', () => new THREE.SphereGeometry(0.036, 10, 10)),
      pal.gold,
    );
    crownOrb.position.y = 0.445;
    head.add(crownOrb);

    const crownCross = this.createLatinCross(0.115, 0.085, 0.02, pal);
    crownCross.position.y = 0.465;
    head.add(crownCross);

    // Paired two-handed greatsword grip pose (both shoulder pivots share exact Y = 1.07, Z = 0.03!)
    // so equal X-axis rotation keeps both gauntlets locked on the hilt throughout the cleave.
    const weaponHand = new THREE.Vector3(0.255, -0.15, 0.23);
    const weaponArm = this.createArmoredArm('right', 1.12, pal, weaponHand);
    weaponArm.position.set(-0.255, 1.07, 0.03);
    body.add(weaponArm);

    const shieldHand = new THREE.Vector3(-0.255, -0.09, 0.23);
    const shieldArm = this.createArmoredArm('left', 1.12, pal, shieldHand);
    shieldArm.position.set(0.255, 1.07, 0.03);
    body.add(shieldArm);

    // Massive Two-Handed Greatsword pointing straight DOWN (-Y) in rest pose!
    // Hand sits at body y = 0.92 (world y = 1.07); blade tip hovers cleanly at world y ~ 0.21 above plinth.
    const greatsword = this.createSword(0.76, 0.088, 0.32, 0.20, true, pal);
    greatsword.position.set(0.255, -0.12, 0.23);
    weaponArm.add(greatsword);

    return { id, root, body, weaponArm, shieldArm, head, type: 'k', color };
  }
}
