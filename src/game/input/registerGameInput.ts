export interface GameInputHandlers {
  /** Тап, клик или клавиша: старт / положить коробку / рестарт — решает игра. */
  action(): void;
  /** Игра идёт: тогда любая клавиша — ход, даже если фокус на кнопке. */
  isRunning(): boolean;
}

const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, label');

/** Ввод: тап/клик в любом месте, Space / Enter / ↑ / R; во время игры — любая клавиша. Возвращает отписку. */
export function registerGameInput(handlers: GameInputHandlers): () => void {
  const onPointerDown = (e: PointerEvent) => {
    if (e.button > 0 || isControl(e.target)) return;
    handlers.action();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (handlers.isRunning()) {
      // Иначе пробел «нажал» бы кнопку, на которой остался фокус.
      e.preventDefault();
      handlers.action();
      return;
    }
    if (isControl(e.target) && e.code !== 'KeyR') return;
    if (['Space', 'Enter', 'ArrowUp', 'KeyR'].includes(e.code)) {
      e.preventDefault();
      handlers.action();
    }
  };

  // Кнопки не держат фокус после клика, чтобы клавиатура всегда управляла игрой.
  const onClick = (e: MouseEvent) => {
    if (e.target instanceof Element) e.target.closest('button')?.blur();
  };

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', onClick);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('click', onClick);
  };
}
