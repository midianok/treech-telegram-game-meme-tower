/**
 * Плавное движение к цели с ограничением скорости (классический SmoothDamp).
 * Скорость хранится внутри и сохраняется между коробками, как в оригинале.
 */
export class SmoothDamp {
  private velocity = 0;

  constructor(
    private readonly smoothTime: number,
    private readonly eps: number,
  ) {}

  reset(): void {
    this.velocity = 0;
  }

  step(current: number, target: number, dt: number, maxSpeed: number): number {
    if (Math.abs(current - target) <= this.eps) {
      this.velocity = 0;
      return target;
    }
    const omega = 2 / this.smoothTime;
    const x = omega * dt;
    const ease = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const maxChange = maxSpeed * this.smoothTime;
    const change = Math.max(-maxChange, Math.min(maxChange, current - target));
    const clampedTarget = current - change;
    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * ease;
    let out = clampedTarget + (change + temp) * ease;
    if (target - current > 0 === out > target) {
      out = target;
      this.velocity = 0;
    }
    return out;
  }
}
