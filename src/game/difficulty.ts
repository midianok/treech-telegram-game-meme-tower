/**
 * Сложность: стартовая скорость коробки чуть выше оригинальной (5),
 * каждые SPEED_STEP_EVERY поставленных коробок она немного растёт, но не выше SPEED_MAX.
 */
const SPEED_START = 5.5;
const SPEED_STEP_EVERY = 3;
const SPEED_STEP = 0.35;
const SPEED_MAX = 9.5;

export function getDifficultyLevel(score: number): number {
  return Math.floor(score / SPEED_STEP_EVERY);
}

export function getBoxSpeed(score: number): number {
  return Math.min(SPEED_MAX, SPEED_START + getDifficultyLevel(score) * SPEED_STEP);
}
