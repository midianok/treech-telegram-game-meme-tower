import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import { CFG } from '../constants';
import type { Meme } from '../memes/Meme';
import type { BodyKind, PhysicsWorld } from '../physics/PhysicsWorld';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Какую часть исходного квадрата (и мема на нём) занимает коробка: смещение по X и Z. */
export interface BoxRect {
  x: number;
  z: number;
}

const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });

/**
 * Коробка башни: меш + (после постановки) физическое тело.
 * У обрезанных коробок мем не сжимается — видна соответствующая часть картинки.
 */
export class Box {
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.Material[]>;
  body: RAPIER.RigidBody | null = null;
  /** Высота, на которую коробку поставили (для проверки обрушения). */
  readonly placedY: number;

  constructor(
    private readonly scene: THREE.Scene,
    readonly meme: Meme,
    readonly sx: number,
    readonly sz: number,
    readonly rect: BoxRect,
    position: Vec3,
  ) {
    const geo = new THREE.BoxGeometry(sx, CFG.boxHeight, sz);
    // UV верхней грани (вершины 8..11) — по положению внутри исходного квадрата.
    // Мем «читается» в изометрии: его правый край смотрит в -Z, верх — в -X.
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const S = CFG.boxSize;
    for (let i = 8; i < 12; i++) {
      const xs = rect.x + pos.getX(i) + sx / 2;
      const zs = rect.z + pos.getZ(i) + sz / 2;
      uv.setXY(i, 1 - zs / S, 1 - xs / S);
    }
    uv.needsUpdate = true;

    this.mesh = new THREE.Mesh(geo, meme.materials);
    this.mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial));
    this.mesh.position.set(position.x, position.y, position.z);
    this.placedY = position.y;
    scene.add(this.mesh);
  }

  get position(): Vec3 {
    return this.body ? this.body.translation() : this.mesh.position;
  }

  addBody(physics: PhysicsWorld, kind: BodyKind): void {
    this.body = physics.createBox(kind, { x: this.sx, z: this.sz }, this.mesh.position, this.mesh.quaternion);
  }

  sync(): void {
    if (!this.body) return;
    const p = this.body.translation();
    const q = this.body.rotation();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }

  destroy(physics: PhysicsWorld): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.children[0] as THREE.LineSegments).geometry.dispose();
    if (this.body) physics.remove(this.body);
    this.body = null;
  }
}
