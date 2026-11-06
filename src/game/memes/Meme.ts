import * as THREE from 'three';

export type MemeKind = 'image' | 'gif' | 'video' | 'placeholder';

/**
 * Мем, натянутый на коробки. Текстура верха соответствует квадрату исходной коробки:
 * у обрезанных коробок через UV видна только их часть мема.
 */
export interface Meme {
  readonly key: string;
  readonly kind: MemeKind;
  /** Порядок граней BoxGeometry: +x, -x, +y (верх), -y, +z, -z. */
  readonly materials: THREE.MeshBasicMaterial[];
  readonly animated: boolean;
  /** Включить/выключить анимацию (видео на паузу, GIF перестаёт менять кадры). */
  setActive(active: boolean): void;
  /** Шаг анимации; вызывается каждый кадр только для активных мемов. */
  update(dtMs: number): void;
  dispose(): void;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Средний цвет кадра — им красятся боковые грани коробки. */
export function averageColor(src: CanvasImageSource): THREE.Color {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  const color = new THREE.Color();
  if (!n) return color.setRGB(0.8, 0.8, 0.8, THREE.SRGBColorSpace);
  color.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  // Чуть насыщеннее и без крайностей по яркости, чтобы бока не были грязно-серыми или чёрными.
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color.setHSL(hsl.h, clamp(hsl.s * 1.3, 0, 1), clamp(hsl.l, 0.38, 0.72));
}

function shade(color: THREE.Color, k: number) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * k);
}

export function createBoxMaterials(top: THREE.Texture, base: THREE.Color): THREE.MeshBasicMaterial[] {
  const sideX = new THREE.MeshBasicMaterial({ color: shade(base, 0.92) });
  const sideZ = new THREE.MeshBasicMaterial({ color: shade(base, 0.72) });
  const topMaterial = new THREE.MeshBasicMaterial({ map: top });
  const bottom = new THREE.MeshBasicMaterial({ color: shade(base, 0.5) });
  return [sideX, sideX, topMaterial, bottom, sideZ, sideZ];
}

export function setSideColors(materials: THREE.MeshBasicMaterial[], base: THREE.Color) {
  materials[0].color.copy(shade(base, 0.92));
  materials[3].color.copy(shade(base, 0.5));
  materials[4].color.copy(shade(base, 0.72));
}

export function disposeMaterials(materials: THREE.MeshBasicMaterial[]) {
  new Set(materials).forEach((m) => m.dispose());
}

/** Квадратный холст и функция, которая вписывает в него кадр с обрезкой по центру (cover). */
export function createSquareCanvas(srcW: number, srcH: number, maxSide: number) {
  const side = Math.max(2, Math.min(maxSide, Math.min(srcW, srcH)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  const k = Math.max(side / srcW, side / srcH);
  const dw = srcW * k;
  const dh = srcH * k;
  const draw = (src: CanvasImageSource) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, side, side);
    ctx.drawImage(src, (side - dw) / 2, (side - dh) / 2, dw, dh);
  };
  return { canvas, draw };
}

export function configureTexture(texture: THREE.Texture, renderer: THREE.WebGLRenderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
