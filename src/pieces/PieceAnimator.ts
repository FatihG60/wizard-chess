import * as THREE from 'three';
import { squareToWorld } from '../types';
import type { ArticulatedPiece, PieceColor, PieceType, Square } from '../types';

interface Vec3Delta {
  x: number;
  y: number;
  z: number;
}

interface AttackPose {
  bodyRot: Vec3Delta;
  bodyPos: Vec3Delta;
  weaponRot: Vec3Delta;
  weaponPos: Vec3Delta;
  shieldRot: Vec3Delta;
}

const ZERO: Vec3Delta = { x: 0, y: 0, z: 0 };

const ARCHETYPE_ATTACK_POSES: Record<PieceType, { windup: AttackPose; strike: AttackPose }> = {
  p: {
    windup: {
      bodyRot: { x: -0.16, y: -0.18, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: -1.35, y: 0, z: 0.18 },
      weaponPos: ZERO,
      shieldRot: { x: 0.12, y: 0.28, z: 0 },
    },
    strike: {
      bodyRot: { x: 0.26, y: 0.14, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: 0.98, y: 0, z: -0.12 },
      weaponPos: ZERO,
      shieldRot: { x: -0.08, y: 0.15, z: 0 },
    },
  },
  k: {
    // Greatsword hangs point-down at rest (0); -2.55 raises both hands high overhead, -1.12 cleaves forward-down.
    windup: {
      bodyRot: { x: -0.18, y: 0, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: -2.55, y: 0, z: 0 },
      weaponPos: ZERO,
      shieldRot: { x: -2.55, y: 0, z: 0 },
    },
    strike: {
      bodyRot: { x: 0.24, y: 0, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: -1.12, y: 0, z: 0 },
      weaponPos: ZERO,
      shieldRot: { x: -1.12, y: 0, z: 0 },
    },
  },
  n: {
    windup: {
      bodyRot: { x: -0.18, y: -0.24, z: 0 },
      bodyPos: { x: 0, y: 0.04, z: -0.04 },
      weaponRot: { x: -0.28, y: 0, z: 0.10 },
      weaponPos: { x: 0, y: 0.02, z: -0.10 },
      shieldRot: { x: 0.10, y: 0.24, z: 0 },
    },
    strike: {
      bodyRot: { x: 0.22, y: 0.12, z: 0 },
      bodyPos: { x: 0, y: 0, z: 0.08 },
      weaponRot: { x: 1.18, y: 0, z: -0.04 },
      weaponPos: { x: 0, y: -0.04, z: 0.24 },
      shieldRot: { x: -0.08, y: 0.12, z: 0 },
    },
  },
  b: {
    windup: {
      bodyRot: { x: -0.12, y: -0.44, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: -0.75, y: 0, z: 0.65 },
      weaponPos: ZERO,
      shieldRot: { x: -0.10, y: -0.15, z: 0 },
    },
    strike: {
      bodyRot: { x: 0.22, y: 0.36, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: 0.92, y: 0, z: -0.48 },
      weaponPos: ZERO,
      shieldRot: { x: 0.08, y: 0.10, z: 0 },
    },
  },
  q: {
    windup: {
      bodyRot: { x: -0.14, y: -0.36, z: 0 },
      bodyPos: { x: 0, y: 0, z: -0.04 },
      weaponRot: { x: -0.65, y: 0, z: 0.22 },
      weaponPos: { x: 0, y: 0.02, z: -0.10 },
      shieldRot: { x: 0.08, y: 0.22, z: 0 },
    },
    strike: {
      bodyRot: { x: 0.26, y: 0.22, z: 0 },
      bodyPos: { x: 0, y: 0, z: 0.08 },
      weaponRot: { x: 1.08, y: 0, z: -0.06 },
      weaponPos: { x: 0, y: -0.02, z: 0.26 },
      shieldRot: { x: -0.06, y: 0.10, z: 0 },
    },
  },
  r: {
    windup: {
      bodyRot: { x: -0.12, y: 0, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: -0.36, y: 0, z: 0 },
      weaponPos: { x: 0, y: 0.08, z: -0.04 },
      shieldRot: ZERO,
    },
    strike: {
      bodyRot: { x: 0.20, y: 0, z: 0 },
      bodyPos: ZERO,
      weaponRot: { x: 0.44, y: 0, z: 0 },
      weaponPos: { x: 0, y: -0.02, z: 0.18 },
      shieldRot: ZERO,
    },
  },
};

function defaultYaw(color: PieceColor): number {
  return color === 'w' ? Math.PI : 0;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInQuad(t: number): number {
  return t * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function getRestPos(obj: THREE.Object3D): THREE.Vector3 {
  const saved = obj.userData.restPos as THREE.Vector3 | undefined;
  return saved ?? new THREE.Vector3(0, 0, 0);
}

function getRestRot(obj: THREE.Object3D): THREE.Euler {
  const saved = obj.userData.restRot as THREE.Euler | undefined;
  return saved ?? new THREE.Euler(0, 0, 0);
}

function phaseFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 6283) / 1000;
}

function applyPoseBlend(
  piece: ArticulatedPiece,
  fromPose: AttackPose,
  toPose: AttackPose,
  t: number,
): void {
  const bPos = getRestPos(piece.body);
  const bRot = getRestRot(piece.body);
  piece.body.position.set(
    bPos.x + lerp(fromPose.bodyPos.x, toPose.bodyPos.x, t),
    bPos.y + lerp(fromPose.bodyPos.y, toPose.bodyPos.y, t),
    bPos.z + lerp(fromPose.bodyPos.z, toPose.bodyPos.z, t),
  );
  piece.body.rotation.set(
    bRot.x + lerp(fromPose.bodyRot.x, toPose.bodyRot.x, t),
    bRot.y + lerp(fromPose.bodyRot.y, toPose.bodyRot.y, t),
    bRot.z + lerp(fromPose.bodyRot.z, toPose.bodyRot.z, t),
  );

  const wPos = getRestPos(piece.weaponArm);
  const wRot = getRestRot(piece.weaponArm);
  piece.weaponArm.position.set(
    wPos.x + lerp(fromPose.weaponPos.x, toPose.weaponPos.x, t),
    wPos.y + lerp(fromPose.weaponPos.y, toPose.weaponPos.y, t),
    wPos.z + lerp(fromPose.weaponPos.z, toPose.weaponPos.z, t),
  );
  piece.weaponArm.rotation.set(
    wRot.x + lerp(fromPose.weaponRot.x, toPose.weaponRot.x, t),
    wRot.y + lerp(fromPose.weaponRot.y, toPose.weaponRot.y, t),
    wRot.z + lerp(fromPose.weaponRot.z, toPose.weaponRot.z, t),
  );

  if (piece.shieldArm) {
    const sRot = getRestRot(piece.shieldArm);
    piece.shieldArm.rotation.set(
      sRot.x + lerp(fromPose.shieldRot.x, toPose.shieldRot.x, t),
      sRot.y + lerp(fromPose.shieldRot.y, toPose.shieldRot.y, t),
      sRot.z + lerp(fromPose.shieldRot.z, toPose.shieldRot.z, t),
    );
  }
}

const NEUTRAL_POSE: AttackPose = {
  bodyRot: ZERO,
  bodyPos: ZERO,
  weaponRot: ZERO,
  weaponPos: ZERO,
  shieldRot: ZERO,
};

export class PieceAnimator {
  private readonly animTokens = new Map<string, number>();
  private readonly animatingIds = new Set<string>();
  private readonly phaseCache = new Map<string, number>();

  private readonly hoverBlends = new Map<string, number>();
  private readonly selectBlends = new Map<string, number>();
  private readonly victoryBlends = new Map<string, number>();

  private hoveredPieceId: string | null = null;
  private selectedPieceId: string | null = null;
  private checkedKingId: string | null = null;
  private draggingPieceId: string | null = null;

  public setHoveredPiece(pieceId: string | null): void {
    this.hoveredPieceId = pieceId;
  }

  public setSelectedPiece(pieceId: string | null): void {
    this.selectedPieceId = pieceId;
  }

  public setCheckedKing(kingId: string | null): void {
    this.checkedKingId = kingId;
  }

  public setDraggingPiece(pieceId: string | null): void {
    this.draggingPieceId = pieceId;
  }

  public placeAtSquare(piece: ArticulatedPiece, square: Square): void {
    this.bumpToken(piece.id);
    this.animatingIds.delete(piece.id);
    piece.root.userData.defeated = false;
    piece.root.userData.defending = false;
    piece.root.userData.victorySalute = false;
    piece.root.visible = true;
    piece.root.scale.set(1, 1, 1);
    this.hoverBlends.delete(piece.id);
    this.selectBlends.delete(piece.id);
    this.victoryBlends.delete(piece.id);

    const { x, z } = squareToWorld(square);
    piece.root.position.set(x, 0, z);
    piece.root.rotation.set(0, defaultYaw(piece.color), 0);

    this.resetRig(piece);
  }

  public async animateMove(
    piece: ArticulatedPiece,
    from: Square,
    to: Square,
    isKnight?: boolean,
    onLand?: () => void,
  ): Promise<void> {
    if (from === to) {
      this.placeAtSquare(piece, to);
      onLand?.();
      return;
    }

    const token = this.bumpToken(piece.id);
    const isAlive = () => this.animTokens.get(piece.id) === token;
    this.animatingIds.add(piece.id);
    piece.root.userData.defeated = false;
    piece.root.userData.victorySalute = false;
    this.resetRig(piece);

    const fromPos = squareToWorld(from);
    const toPos = squareToWorld(to);
    const knightLeap = isKnight ?? piece.type === 'n';
    const dx = toPos.x - fromPos.x;
    const dz = toPos.z - fromPos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const restYaw = defaultYaw(piece.color);
    const startYaw = piece.root.rotation.y;
    const travelYaw = Math.atan2(dx, dz);

    // Project world travel direction into piece's rest-facing local space for natural momentum lean.
    const cosY = Math.cos(restYaw);
    const sinY = Math.sin(restYaw);
    const ndx = dx / dist;
    const ndz = dz / dist;
    const localForward = ndx * sinY + ndz * cosY;
    const localRight = ndx * cosY - ndz * sinY;

    const restBodyRot = getRestRot(piece.body);
    const restWeaponRot = getRestRot(piece.weaponArm);
    const restShieldRot = piece.shieldArm ? getRestRot(piece.shieldArm) : null;

    if (knightLeap) {
      // Warhorse rears up proudly on hind legs before leaping
      await this.runTween(isAlive, 120, (t) => {
        const rear = Math.sin(t * Math.PI * 0.5);
        piece.body.rotation.x = restBodyRot.x - rear * 0.34;
        piece.root.position.set(fromPos.x, rear * 0.09, fromPos.z);
        piece.weaponArm.rotation.x = restWeaponRot.x - rear * 0.28;
      });
      if (!isAlive()) return;
    }

    const durationMs = knightLeap ? 500 : Math.min(620, 360 + dist * 42);
    const marchSteps = Math.max(2, Math.round(dist * 1.4));

    await this.runTween(isAlive, durationMs, (t) => {
      const e = easeInOutCubic(t);
      const x = lerp(fromPos.x, toPos.x, e);
      const z = lerp(fromPos.z, toPos.z, e);

      if (knightLeap) {
        const arc = Math.sin(t * Math.PI);
        piece.root.position.set(x, arc * 1.24, z);

        const turnWeight = Math.sin(t * Math.PI);
        const yawDelta = shortestAngleDelta(startYaw, travelYaw);
        piece.root.rotation.y = startYaw + yawDelta * turnWeight;

        const pitch =
          t < 0.5
            ? -0.28 * Math.cos(t * Math.PI)
            : 0.18 * Math.sin((t - 0.5) * Math.PI * 2);
        piece.body.rotation.x = restBodyRot.x + pitch;
        piece.weaponArm.rotation.x = restWeaponRot.x - arc * 0.28;
      } else {
        // Armored footstep march cadence with alternating stride roll & weapon swing
        const stepPhase = t * Math.PI * marchSteps;
        const stepLift = Math.abs(Math.sin(stepPhase)) * 0.068;
        const strideSwing = Math.sin(stepPhase) * Math.sin(t * Math.PI);
        const leanEnvelope = Math.sin(t * Math.PI);

        piece.root.position.set(x, stepLift, z);
        piece.root.rotation.y = restYaw;

        piece.body.rotation.x = restBodyRot.x + localForward * leanEnvelope * 0.095;
        piece.body.rotation.z =
          restBodyRot.z - localRight * leanEnvelope * 0.065 + strideSwing * 0.055;

        piece.weaponArm.rotation.x =
          restWeaponRot.x + (piece.type === 'k' ? -0.14 : -0.22) * leanEnvelope + strideSwing * 0.16;
        if (piece.shieldArm && restShieldRot) {
          piece.shieldArm.rotation.x =
            restShieldRot.x + (piece.type === 'k' ? -0.14 : -strideSwing * 0.14);
        }
      }
    });

    if (isAlive()) {
      this.placeAtSquare(piece, to);
      onLand?.();
    }
  }

  public async animateAttack(
    attacker: ArticulatedPiece,
    victim: ArticulatedPiece,
    from: Square,
    to: Square,
    capturedSquare: Square,
    onImpact: () => void,
    onStrikeVFX?: (
      attackerType: PieceType,
      attackerPos: { x: number; z: number },
      targetPos: { x: number; z: number },
    ) => void,
  ): Promise<void> {
    const token = this.bumpToken(attacker.id);
    const isAlive = () => this.animTokens.get(attacker.id) === token;
    this.animatingIds.add(attacker.id);
    attacker.root.userData.defeated = false;
    victim.root.userData.defending = true;
    this.resetRig(attacker);

    const fromPos = squareToWorld(from);
    const capPos = squareToWorld(capturedSquare);
    const toPos = squareToWorld(to);

    const dx = capPos.x - fromPos.x;
    const dz = capPos.z - fromPos.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dist > 1e-4 ? dx / dist : 0;
    const dirZ = dist > 1e-4 ? dz / dist : attacker.color === 'w' ? -1 : 1;

    const strikeOffset = Math.min(0.62, dist * 0.55);
    const strikePos = {
      x: capPos.x - dirX * strikeOffset,
      z: capPos.z - dirZ * strikeOffset,
    };

    const faceCapYaw = Math.atan2(dirX, dirZ);
    const restYaw = defaultYaw(attacker.color);
    const startYaw = attacker.root.rotation.y;
    const yawToTarget = shortestAngleDelta(startYaw, faceCapYaw);

    // Victim turns to brace defensively against attacker
    const victimStartYaw = victim.root.rotation.y;
    const faceAttackerYaw = Math.atan2(-dirX, -dirZ);
    const victimYawDelta = shortestAngleDelta(victimStartYaw, faceAttackerYaw);
    const vBodyRestRot = getRestRot(victim.body);
    const vShieldRestRot = victim.shieldArm ? getRestRot(victim.shieldArm) : null;
    const vWeaponRestRot = getRestRot(victim.weaponArm);

    const applyVictimBrace = (amt: number, tremble = 0) => {
      victim.root.rotation.y = victimStartYaw + victimYawDelta * Math.min(1, amt * 1.4);
      victim.body.rotation.x = vBodyRestRot.x - 0.16 * amt + Math.sin(tremble * 38) * 0.03 * amt;
      victim.body.rotation.z = vBodyRestRot.z + Math.cos(tremble * 31) * 0.025 * amt;
      if (victim.shieldArm && vShieldRestRot) {
        victim.shieldArm.rotation.x = vShieldRestRot.x - 0.55 * amt;
      }
      victim.weaponArm.rotation.x = vWeaponRestRot.x - 0.35 * amt;
    };

    // 1. Turn smoothly to face the victim on capturedSquare while victim begins defensive brace
    await this.runTween(isAlive, 175, (t) => {
      const e = easeInOutCubic(t);
      attacker.root.rotation.y = startYaw + yawToTarget * e;
      applyVictimBrace(e * 0.65, t);
    });
    if (!isAlive()) {
      victim.root.userData.defending = false;
      return;
    }

    // 2. Advance to striking distance (Queen performs a levitating 360 valkyrie spin!)
    const isKnight = attacker.type === 'n';
    const isQueen = attacker.type === 'q';
    const advanceMs = isKnight ? 330 : 270;
    const restBodyRot = getRestRot(attacker.body);
    await this.runTween(isAlive, advanceMs, (t) => {
      const e = easeInOutCubic(t);
      const x = lerp(fromPos.x, strikePos.x, e);
      const z = lerp(fromPos.z, strikePos.z, e);
      const arc = Math.sin(t * Math.PI);
      const y = isKnight ? arc * 0.92 : isQueen ? arc * 0.24 : arc * 0.055;
      attacker.root.position.set(x, y, z);
      attacker.body.rotation.x = restBodyRot.x + (isKnight ? -0.14 * arc : 0.08 * arc);
      if (isQueen) {
        attacker.root.rotation.y = faceCapYaw + Math.PI * 2 * e;
      }
      applyVictimBrace(0.65 + e * 0.35, t + 1);
    });
    if (!isAlive()) {
      victim.root.userData.defending = false;
      return;
    }

    attacker.root.position.set(strikePos.x, 0, strikePos.z);
    attacker.root.rotation.y = faceCapYaw;
    const poses = ARCHETYPE_ATTACK_POSES[attacker.type];

    // 3. Wind up weaponArm & body coil while victim braces hard
    await this.runTween(isAlive, 215, (t) => {
      applyPoseBlend(attacker, NEUTRAL_POSE, poses.windup, easeOutCubic(t));
      applyVictimBrace(1.0, t + 2);
    });
    if (!isAlive()) {
      victim.root.userData.defending = false;
      return;
    }

    // 4. Explosive strike forward, triggering weapon VFX & onImpact at peak contact
    onStrikeVFX?.(attacker.type, strikePos, capPos);

    let impactFired = false;
    await this.runTween(isAlive, 130, (t) => {
      applyPoseBlend(attacker, poses.windup, poses.strike, easeInQuad(t));
    });

    if (isAlive() && !impactFired) {
      impactFired = true;
      victim.root.userData.defending = false;
      victim.root.visible = false;
      onImpact();
    }
    if (!isAlive()) {
      victim.root.userData.defending = false;
      return;
    }

    // Hold peak follow-through briefly for dramatic impact readability
    await this.waitMs(isAlive, 165);
    if (!isAlive()) return;

    // 5. Recover weapon pose, glide cleanly onto destination square `to`, and restore default board facing
    const yawBack = shortestAngleDelta(faceCapYaw, restYaw);
    await this.runTween(isAlive, 320, (t) => {
      const e = easeInOutCubic(t);
      applyPoseBlend(attacker, poses.strike, NEUTRAL_POSE, e);
      const x = lerp(strikePos.x, toPos.x, e);
      const z = lerp(strikePos.z, toPos.z, e);
      const lift = Math.sin(t * Math.PI) * 0.035;
      attacker.root.position.set(x, lift, z);
      attacker.root.rotation.y = faceCapYaw + yawBack * e;
    });

    if (isAlive()) {
      this.placeAtSquare(attacker, to);
    }
  }

  public animateVictorySalute(pieces: Iterable<ArticulatedPiece>, winnerColor: PieceColor): void {
    for (const piece of pieces) {
      if (!piece.root.visible || piece.root.userData.defeated) continue;
      if (piece.color === winnerColor) {
        piece.root.userData.victorySalute = true;
      }
    }
  }

  public async animateCheckmateDefeat(kingPiece: ArticulatedPiece): Promise<void> {
    const token = this.bumpToken(kingPiece.id);
    const isAlive = () => this.animTokens.get(kingPiece.id) === token;
    this.animatingIds.add(kingPiece.id);
    kingPiece.root.userData.defeated = true;

    const bPos = getRestPos(kingPiece.body);
    const bRot = getRestRot(kingPiece.body);
    const wRot = getRestRot(kingPiece.weaponArm);
    const sRot = kingPiece.shieldArm ? getRestRot(kingPiece.shieldArm) : null;
    const hRot = kingPiece.head ? getRestRot(kingPiece.head) : null;

    await this.runTween(isAlive, 820, (t) => {
      const e = easeInOutCubic(t);
      kingPiece.body.rotation.x = bRot.x + 0.58 * e;
      kingPiece.body.position.y = bPos.y - 0.055 * e;
      kingPiece.weaponArm.rotation.x = wRot.x + 0.34 * e;
      if (kingPiece.shieldArm && sRot) {
        kingPiece.shieldArm.rotation.x = sRot.x + 0.34 * e;
      }
      if (kingPiece.head && hRot) {
        kingPiece.head.rotation.x = hRot.x + 0.38 * e;
      }
    });

    if (isAlive()) {
      this.animatingIds.delete(kingPiece.id);
    }
  }

  public updateIdle(pieces: Iterable<ArticulatedPiece>, elapsed: number, dt = 0.016): void {
    const smooth = 1 - Math.exp(-10 * Math.min(0.05, Math.max(0.001, dt)));

    for (const piece of pieces) {
      if (
        !piece.root.visible ||
        piece.root.userData.defeated ||
        piece.root.userData.defending ||
        this.animatingIds.has(piece.id) ||
        this.draggingPieceId === piece.id
      ) {
        continue;
      }

      let phase = this.phaseCache.get(piece.id);
      if (phase === undefined) {
        phase = phaseFromId(piece.id);
        this.phaseCache.set(piece.id, phase);
      }

      const targetSelect = this.selectedPieceId === piece.id ? 1 : 0;
      const targetHover = this.hoveredPieceId === piece.id && targetSelect === 0 ? 1 : 0;
      const targetVictory = piece.root.userData.victorySalute ? 1 : 0;
      const isCheckedKing = this.checkedKingId === piece.id ? 1 : 0;

      const selectAmt = lerp(this.selectBlends.get(piece.id) ?? 0, targetSelect, smooth);
      const hoverAmt = lerp(this.hoverBlends.get(piece.id) ?? 0, targetHover, smooth);
      const victoryAmt = lerp(this.victoryBlends.get(piece.id) ?? 0, targetVictory, smooth);

      this.selectBlends.set(piece.id, selectAmt);
      this.hoverBlends.set(piece.id, hoverAmt);
      this.victoryBlends.set(piece.id, victoryAmt);

      const breath = Math.sin(elapsed * 1.45 + phase);
      const sway = Math.sin(elapsed * 1.45 + phase - 0.65);
      const glance = Math.sin(elapsed * 0.72 + phase * 1.37);

      // Levitation on selection / slight alert lift on hover
      const levitation =
        selectAmt * (0.11 + Math.sin(elapsed * 4.2) * 0.022) +
        hoverAmt * 0.036 +
        victoryAmt * Math.max(0, Math.sin(elapsed * 5.0 + phase)) * 0.045;
      piece.root.position.y = levitation;

      const bPos = getRestPos(piece.body);
      const bRot = getRestRot(piece.body);
      piece.body.position.y = bPos.y + breath * 0.0045 - isCheckedKing * 0.024;
      piece.body.rotation.x =
        bRot.x + breath * 0.011 + selectAmt * 0.06 + isCheckedKing * 0.11 - victoryAmt * 0.08;

      // Weapon ready stance on selection, celebratory raise on victory salute
      const wRot = getRestRot(piece.weaponArm);
      const readyWeaponX = piece.type === 'k' ? -0.92 : piece.type === 'r' ? -0.18 : -0.48;
      const saluteWeaponX = piece.type === 'k' ? -2.2 : piece.type === 'r' ? -0.25 : -1.28;
      const salutePulse = victoryAmt * Math.sin(elapsed * 5.0 + phase) * 0.14;
      piece.weaponArm.rotation.x =
        wRot.x +
        sway * 0.022 +
        selectAmt * readyWeaponX +
        hoverAmt * (readyWeaponX * 0.35) +
        victoryAmt * saluteWeaponX +
        salutePulse;

      if (piece.shieldArm) {
        const sRot = getRestRot(piece.shieldArm);
        const readyShieldX = piece.type === 'k' ? -0.92 : -0.28;
        const victoryShieldX = piece.type === 'k' ? -2.2 : -0.35;
        piece.shieldArm.rotation.x =
          sRot.x +
          (piece.type === 'k' ? sway * 0.022 : -sway * 0.014) +
          selectAmt * readyShieldX +
          victoryAmt * victoryShieldX +
          (piece.type === 'k' ? salutePulse : 0);
      }

      if (piece.head) {
        const hRot = getRestRot(piece.head);
        piece.head.rotation.y = hRot.y + glance * 0.026 * (1 - selectAmt);
        piece.head.rotation.x = hRot.x + breath * 0.009 - victoryAmt * 0.12 + isCheckedKing * 0.08;
      }
    }
  }

  private resetRig(piece: ArticulatedPiece): void {
    piece.body.position.copy(getRestPos(piece.body));
    piece.body.rotation.copy(getRestRot(piece.body));

    piece.weaponArm.position.copy(getRestPos(piece.weaponArm));
    piece.weaponArm.rotation.copy(getRestRot(piece.weaponArm));

    if (piece.shieldArm) {
      piece.shieldArm.position.copy(getRestPos(piece.shieldArm));
      piece.shieldArm.rotation.copy(getRestRot(piece.shieldArm));
    }

    if (piece.head) {
      piece.head.position.copy(getRestPos(piece.head));
      piece.head.rotation.copy(getRestRot(piece.head));
    }
  }

  private bumpToken(id: string): number {
    const next = (this.animTokens.get(id) ?? 0) + 1;
    this.animTokens.set(id, next);
    return next;
  }

  private runTween(
    isAlive: () => boolean,
    durationMs: number,
    onFrame: (t: number) => void,
  ): Promise<void> {
    if (typeof requestAnimationFrame === 'undefined' || durationMs <= 0) {
      if (isAlive()) onFrame(1);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        if (!isAlive()) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / durationMs);
        onFrame(t);
        if (t >= 1) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private waitMs(isAlive: () => boolean, ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, isAlive() ? ms : 0);
    });
  }
}
