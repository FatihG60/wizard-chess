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

  public placeAtSquare(piece: ArticulatedPiece, square: Square): void {
    this.bumpToken(piece.id);
    this.animatingIds.delete(piece.id);
    piece.root.userData.defeated = false;
    piece.root.visible = true;
    piece.root.scale.set(1, 1, 1);

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
  ): Promise<void> {
    if (from === to) {
      this.placeAtSquare(piece, to);
      return;
    }

    const token = this.bumpToken(piece.id);
    const isAlive = () => this.animTokens.get(piece.id) === token;
    this.animatingIds.add(piece.id);
    piece.root.userData.defeated = false;
    this.resetRig(piece);

    const fromPos = squareToWorld(from);
    const toPos = squareToWorld(to);
    const knightLeap = isKnight ?? piece.type === 'n';
    const durationMs = knightLeap ? 520 : 420;

    const dx = toPos.x - fromPos.x;
    const dz = toPos.z - fromPos.z;
    const restYaw = defaultYaw(piece.color);
    const startYaw = piece.root.rotation.y;
    const travelYaw = Math.atan2(dx, dz);

    // Project world travel direction into the piece's rest-facing local space for natural momentum lean.
    const cosY = Math.cos(restYaw);
    const sinY = Math.sin(restYaw);
    const dist = Math.hypot(dx, dz) || 1;
    const ndx = dx / dist;
    const ndz = dz / dist;
    const localForward = ndx * sinY + ndz * cosY;
    const localRight = ndx * cosY - ndz * sinY;

    const restBodyRot = getRestRot(piece.body);
    const restWeaponRot = getRestRot(piece.weaponArm);

    await this.runTween(isAlive, durationMs, (t) => {
      const e = easeInOutCubic(t);
      const x = lerp(fromPos.x, toPos.x, e);
      const z = lerp(fromPos.z, toPos.z, e);

      if (knightLeap) {
        const arc = Math.sin(t * Math.PI);
        piece.root.position.set(x, arc * 1.18, z);

        // Turn cleanly toward leap vector on ascent and settle back to board facing on landing.
        const turnWeight = Math.sin(t * Math.PI);
        const yawDelta = shortestAngleDelta(startYaw, travelYaw);
        piece.root.rotation.y = startYaw + yawDelta * turnWeight;

        // Warhorse rears during ascent then pitches forward into landing.
        const pitch = t < 0.5 ? -0.26 * Math.sin(t * Math.PI * 2) : 0.16 * Math.sin((t - 0.5) * Math.PI * 2);
        piece.body.rotation.x = restBodyRot.x + pitch;
        piece.weaponArm.rotation.x = restWeaponRot.x - arc * 0.24;
      } else {
        const lift = Math.sin(t * Math.PI) * 0.065;
        piece.root.position.set(x, lift, z);
        piece.root.rotation.y = restYaw;

        const leanEnvelope = Math.sin(t * Math.PI);
        piece.body.rotation.x = restBodyRot.x + localForward * leanEnvelope * 0.085;
        piece.body.rotation.z = restBodyRot.z - localRight * leanEnvelope * 0.075;
      }
    });

    if (isAlive()) {
      this.placeAtSquare(piece, to);
    }
  }

  public async animateAttack(
    attacker: ArticulatedPiece,
    victim: ArticulatedPiece,
    from: Square,
    to: Square,
    capturedSquare: Square,
    onImpact: () => void,
  ): Promise<void> {
    const token = this.bumpToken(attacker.id);
    const isAlive = () => this.animTokens.get(attacker.id) === token;
    this.animatingIds.add(attacker.id);
    attacker.root.userData.defeated = false;
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

    // 1. Turn smoothly to face the victim on capturedSquare
    await this.runTween(isAlive, 175, (t) => {
      attacker.root.rotation.y = startYaw + yawToTarget * easeInOutCubic(t);
    });
    if (!isAlive()) return;

    // 2. Advance to striking distance just short of capturedSquare (~0.62 units away)
    const isKnight = attacker.type === 'n';
    const advanceMs = isKnight ? 330 : 250;
    const restBodyRot = getRestRot(attacker.body);
    await this.runTween(isAlive, advanceMs, (t) => {
      const e = easeInOutCubic(t);
      const x = lerp(fromPos.x, strikePos.x, e);
      const z = lerp(fromPos.z, strikePos.z, e);
      const arc = Math.sin(t * Math.PI);
      const y = isKnight ? arc * 0.85 : arc * 0.045;
      attacker.root.position.set(x, y, z);
      attacker.body.rotation.x = restBodyRot.x + (isKnight ? -0.14 * arc : 0.07 * arc);
    });
    if (!isAlive()) return;

    attacker.root.position.set(strikePos.x, 0, strikePos.z);
    const poses = ARCHETYPE_ATTACK_POSES[attacker.type];

    // 3. Wind up weaponArm & body coil
    await this.runTween(isAlive, 215, (t) => {
      applyPoseBlend(attacker, NEUTRAL_POSE, poses.windup, easeOutCubic(t));
    });
    if (!isAlive()) return;

    // 4. Explosive strike forward, triggering onImpact ONCE at peak contact
    let impactFired = false;
    await this.runTween(isAlive, 130, (t) => {
      applyPoseBlend(attacker, poses.windup, poses.strike, easeInQuad(t));
    });

    if (isAlive() && !impactFired) {
      impactFired = true;
      victim.root.visible = false;
      onImpact();
    }
    if (!isAlive()) return;

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

  public updateIdle(pieces: Iterable<ArticulatedPiece>, elapsed: number): void {
    for (const piece of pieces) {
      if (!piece.root.visible || piece.root.userData.defeated || this.animatingIds.has(piece.id)) {
        continue;
      }

      let phase = this.phaseCache.get(piece.id);
      if (phase === undefined) {
        phase = phaseFromId(piece.id);
        this.phaseCache.set(piece.id, phase);
      }

      const breath = Math.sin(elapsed * 1.45 + phase);
      const sway = Math.sin(elapsed * 1.45 + phase - 0.65);
      const glance = Math.sin(elapsed * 0.72 + phase * 1.37);

      const bPos = getRestPos(piece.body);
      const bRot = getRestRot(piece.body);
      piece.body.position.y = bPos.y + breath * 0.0045;
      piece.body.rotation.x = bRot.x + breath * 0.011;

      const wRot = getRestRot(piece.weaponArm);
      piece.weaponArm.rotation.x = wRot.x + sway * 0.022;

      if (piece.shieldArm) {
        const sRot = getRestRot(piece.shieldArm);
        // Keep King's paired two-handed grip locked onto the greatsword hilt during idle breathing.
        piece.shieldArm.rotation.x =
          piece.type === 'k' ? sRot.x + sway * 0.022 : sRot.x - sway * 0.014;
      }

      if (piece.head) {
        const hRot = getRestRot(piece.head);
        piece.head.rotation.y = hRot.y + glance * 0.026;
        piece.head.rotation.x = hRot.x + breath * 0.009;
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
