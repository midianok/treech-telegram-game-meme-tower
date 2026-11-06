import RAPIER from '@dimforge/rapier3d-compat';

import { CFG } from '../constants';

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

export type BodyKind = 'fixed' | 'tower' | 'falling';

/** Физика на Rapier: фиксированный шаг 1/60, у стоящих и падающих коробок своя гравитация. */
export class PhysicsWorld {
  private readonly world: RAPIER.World;
  private accumulator = 0;

  static async create(floorY: number): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(floorY);
  }

  private constructor(floorY: number) {
    this.world = new RAPIER.World({ x: 0, y: -CFG.gravity, z: 0 });
    this.world.timestep = STEP;
    // Невидимый пол на уровне основания: на него падают отрезанные куски.
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(10, 0.01, 10).setTranslation(0, floorY - 0.01, 0),
      this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    );
  }

  createBox(
    kind: BodyKind,
    size: { x: number; z: number },
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number; w: number },
  ): RAPIER.RigidBody {
    const desc = (kind === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation)
      .setGravityScale(kind === 'falling' ? CFG.fallingGravityScale : CFG.towerGravityScale);
    const body = this.world.createRigidBody(desc);
    const collider = RAPIER.ColliderDesc.cuboid(size.x / 2, CFG.boxHeight / 2, size.z / 2).setFriction(0.5);
    // Масса пропорциональна площади коробки.
    if (kind !== 'fixed') collider.setMass(CFG.baseMass * (size.x / CFG.boxSize) * (size.z / CFG.boxSize));
    this.world.createCollider(collider, body);
    return body;
  }

  freeze(body: RAPIER.RigidBody): void {
    if (!body.isFixed()) body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  }

  remove(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  step(dt: number): void {
    this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= STEP) {
      this.world.step();
      this.accumulator -= STEP;
    }
  }
}
