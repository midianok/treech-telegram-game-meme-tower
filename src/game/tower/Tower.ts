import { CFG } from '../constants';
import { Box, type BoxRect, type Vec3 } from '../entities/Box';
import { PerfectFlash } from '../effects/PerfectFlash';
import type { Meme } from '../memes/Meme';
import type { MemeLibrary } from '../memes/MemeLibrary';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { GameView } from '../render/GameView';
import { SmoothDamp } from './SmoothDamp';

type Axis = 'x' | 'z';
const otherAxis = (a: Axis): Axis => (a === 'x' ? 'z' : 'x');
const randInt = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

export type LossReason = 'miss' | 'beyond' | 'collapse';

export interface TowerEvents {
  placed(perfect: boolean): void;
  lost(reason: LossReason): void;
}

/**
 * Механика башни: коробка выезжает из -5 и едет к +5; по тапу всё, что свисает, отрезается и падает,
 * почти точное попадание (≤ 5%) — «идеально», коробка встаёт ровно без обрезки.
 */
export class Tower {
  private base!: Box;
  /** Поставленные коробки, base не входит. */
  private boxes: Box[] = [];
  /** Отрезанные и упавшие куски. */
  private pieces: Box[] = [];
  private moving: { box: Box; axis: Axis } | null = null;
  private playing = false;
  private memeRun = randInt(...CFG.memeRun);
  private readonly flash: PerfectFlash;
  private readonly dampAxis = new SmoothDamp(CFG.smoothTime, CFG.dampEps);
  private readonly dampOther = new SmoothDamp(CFG.smoothTime, CFG.dampEps);

  constructor(
    private readonly view: GameView,
    private readonly physics: PhysicsWorld,
    private readonly memes: MemeLibrary,
    private readonly baseY: number,
    private readonly events: TowerEvents,
  ) {
    this.flash = new PerfectFlash(view.scene);
  }

  get height(): number {
    return this.boxes.length;
  }

  /** Новая башня: основание, камера в исходное положение, ничего не едет. */
  reset(): void {
    this.clear();
    if (this.base) this.base.destroy(this.physics);
    this.base = new Box(this.view.scene, this.memes.pick(), CFG.boxSize, CFG.boxSize, { x: 0, z: 0 }, { x: 0, y: this.baseY, z: 0 });
    this.base.addBody(this.physics, 'fixed');
    this.view.resetCamera();
    this.dampAxis.reset();
    this.dampOther.reset();
    this.memeRun = randInt(...CFG.memeRun);
    this.playing = false;
  }

  start(): void {
    this.playing = true;
    this.spawn('x', CFG.boxSize, CFG.boxSize, { x: 0, z: 0 }, this.base.position, this.memeFor(1, this.base.meme));
  }

  /** Тап: положить едущую коробку. */
  place(): void {
    if (!this.playing || !this.moving) return;
    const { box, axis } = this.moving;
    const topPos = this.top.position;
    const pos = box.mesh.position;
    const size = axis === 'x' ? box.sx : box.sz;
    const delta = pos[axis] - topPos[axis];
    const overhang = Math.abs(delta);

    if (size - overhang <= 0) {
      this.lose('miss');
      return;
    }

    box.destroy(this.physics);
    this.moving = null;
    const perfect = overhang / size <= CFG.perfectRatio;
    const countBefore = this.boxes.length;
    let placed: Box;

    if (perfect) {
      // Встаёт ровно на предыдущую коробку, размер не меняется.
      placed = new Box(this.view.scene, box.meme, box.sx, box.sz, box.rect, {
        x: topPos.x,
        y: topPos.y + CFG.boxHeight,
        z: topPos.z,
      });
      this.flash.show(placed);
    } else {
      // Режем: остаётся только часть над башней, свисающая часть падает.
      const kept = size - overhang;
      const keptRect: BoxRect = { ...box.rect };
      const cutRect: BoxRect = { ...box.rect };
      if (delta > 0) cutRect[axis] += kept;
      else keptRect[axis] += overhang;

      const keptPos: Vec3 = { x: pos.x, y: pos.y, z: pos.z };
      keptPos[axis] = pos[axis] - delta / 2;
      const cutPos: Vec3 = { x: pos.x, y: pos.y, z: pos.z };
      cutPos[axis] = pos[axis] + (Math.sign(delta) * kept) / 2;

      placed = new Box(
        this.view.scene,
        box.meme,
        axis === 'x' ? kept : box.sx,
        axis === 'z' ? kept : box.sz,
        keptRect,
        keptPos,
      );
      const piece = new Box(
        this.view.scene,
        box.meme,
        axis === 'x' ? overhang : box.sx,
        axis === 'z' ? overhang : box.sz,
        cutRect,
        cutPos,
      );
      piece.addBody(this.physics, 'falling');
      this.pieces.push(piece);
    }

    placed.addBody(this.physics, 'tower');
    this.boxes.push(placed);
    this.freezeDeep();
    this.trimPieces();

    // Камера поднимается на высоту коробки, когда башня стала достаточно высокой.
    const cam = this.view.camera.position;
    if (countBefore >= CFG.cameraFollowFrom && cam.y < CFG.boxHeight * (countBefore - 1) + CFG.cameraStart.y) {
      this.view.cameraGoal.copy(cam).y += CFG.boxHeight;
    }

    this.events.placed(perfect);

    const from = { x: placed.mesh.position.x, y: topPos.y + CFG.boxHeight, z: placed.mesh.position.z };
    this.spawn(otherAxis(axis), placed.sx, placed.sz, placed.rect, from, this.memeFor(this.boxes.length + 1, placed.meme));
  }

  update(dt: number, speed: number): void {
    this.physics.step(dt);
    this.base.sync();
    this.boxes.forEach((b) => b.sync());
    this.pieces.forEach((b) => b.sync());

    if (this.playing && this.moving) {
      const { box, axis } = this.moving;
      const top = this.top.position;
      const p = box.mesh.position;
      const other = otherAxis(axis);
      p[axis] = this.dampAxis.step(p[axis], CFG.travel, dt, speed);
      p[other] = this.dampOther.step(p[other], top[other], dt, speed);

      if (p[axis] >= CFG.travel) {
        this.lose('beyond');
      } else if (Math.abs(this.top.placedY - top.y) > CFG.collapseDrop) {
        this.lose('collapse');
      }
    }

    // Куски, улетевшие мимо пола, удаляем.
    this.pieces = this.pieces.filter((b) => {
      if (b.position.y < this.baseY - 30) {
        b.destroy(this.physics);
        return false;
      }
      return true;
    });

    this.flash.update(dt);
  }

  /** Мемы, которые сейчас на экране: у них играет анимация. */
  visibleMemes(): Set<Meme> {
    const set = new Set<Meme>();
    if (this.moving) set.add(this.moving.box.meme);
    const from = Math.max(0, this.boxes.length - CFG.visibleDepth);
    for (let i = from; i < this.boxes.length; i++) set.add(this.boxes[i].meme);
    if (this.boxes.length < CFG.visibleDepth) set.add(this.base.meme);
    for (const p of this.pieces.slice(-12)) set.add(p.meme);
    return set;
  }

  /** Для отладки из консоли (только DEV). */
  debugState() {
    const axis = this.moving?.axis ?? 'x';
    return {
      playing: this.playing,
      height: this.boxes.length,
      axis: this.moving?.axis,
      pos: this.moving ? this.moving.box.mesh.position[axis] : null,
      topPos: this.top.position[axis],
      pieces: this.pieces.length,
    };
  }

  private get top(): Box {
    return this.boxes[this.boxes.length - 1] ?? this.base;
  }

  private lose(reason: LossReason): void {
    if (!this.playing) return;
    this.playing = false;
    // Едущая коробка просто падает.
    if (this.moving) {
      this.moving.box.addBody(this.physics, 'falling');
      this.pieces.push(this.moving.box);
      this.moving = null;
    }
    // Камера возвращается вниз и немного отдаляется.
    this.view.zoomGoal = Math.max(CFG.minZoom, CFG.zoom - this.boxes.length / 2);
    this.view.cameraGoal.copy(CFG.cameraStart);
    this.events.lost(reason);
  }

  /** Новая коробка выезжает из -travel по оси axis, по второй оси совпадает с верхом башни. */
  private spawn(axis: Axis, sx: number, sz: number, rect: BoxRect, from: Vec3, meme: Meme): void {
    const pos: Vec3 = { x: from.x, y: from.y + CFG.boxHeight, z: from.z };
    pos[axis] = -CFG.travel;
    // Как в оригинале: каждая коробка разгоняется с места.
    this.dampAxis.reset();
    this.dampOther.reset();
    this.moving = { box: new Box(this.view.scene, meme, sx, sz, rect, pos), axis };
  }

  /** Мем сохраняется 1–2 коробки подряд, потом меняется на другой. */
  private memeFor(count: number, prev: Meme): Meme {
    if (count % this.memeRun !== 0) return prev;
    this.memeRun = randInt(...CFG.memeRun);
    return this.memes.pick(prev);
  }

  /** Глубоко внизу коробки уже не видны — делаем их статичными, чтобы физика не тормозила. */
  private freezeDeep(): void {
    for (let i = 0; i < this.boxes.length - CFG.freezeDepth; i++) {
      const body = this.boxes[i].body;
      if (body) this.physics.freeze(body);
    }
  }

  private trimPieces(): void {
    while (this.pieces.length > CFG.maxPieces) this.pieces.shift()!.destroy(this.physics);
  }

  private clear(): void {
    this.boxes.forEach((b) => b.destroy(this.physics));
    this.pieces.forEach((b) => b.destroy(this.physics));
    if (this.moving) this.moving.box.destroy(this.physics);
    this.boxes = [];
    this.pieces = [];
    this.moving = null;
    this.flash.clear();
  }
}
