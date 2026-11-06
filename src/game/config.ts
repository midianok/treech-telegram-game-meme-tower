import { getTelegramViewportHeight } from '../telegram';

const FALLBACK_WIDTH = 480;
const FALLBACK_HEIGHT = 720;

/** Размер игрового поля: в Telegram берём высоту вьюпорта Mini App. */
export function getGameViewportSize(): { width: number; height: number } {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = getTelegramViewportHeight() ?? viewport?.height ?? window.innerHeight;

  return {
    width: Math.max(1, Math.ceil(width || FALLBACK_WIDTH)),
    height: Math.max(1, Math.ceil(height || FALLBACK_HEIGHT)),
  };
}
