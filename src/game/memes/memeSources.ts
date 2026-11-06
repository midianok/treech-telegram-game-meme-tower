import * as THREE from 'three';
import { decompressFrame, parseGIF, type ParsedGif } from 'gifuct-js';

import {
  averageColor,
  configureTexture,
  createBoxMaterials,
  createSquareCanvas,
  disposeMaterials,
  setSideColors,
  type Meme,
} from './Meme';

const STATIC_TEXTURE_SIDE = 1024;
/** Анимированные текстуры обновляются каждый кадр — держим их поменьше. */
const ANIMATED_TEXTURE_SIDE = 512;
const VIDEO_LOAD_TIMEOUT_MS = 20000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить картинку ${url}`));
    img.src = url;
  });
}

/** Статичная картинка (jpg/png/webp/avif/svg). */
export async function loadImageMeme(key: string, url: string, renderer: THREE.WebGLRenderer): Promise<Meme> {
  const img = await loadImage(url);
  const { canvas, draw } = createSquareCanvas(img.naturalWidth, img.naturalHeight, STATIC_TEXTURE_SIDE);
  draw(img);
  return staticMeme(key, 'image', canvas, renderer);
}

export function staticMeme(
  key: string,
  kind: 'image' | 'placeholder',
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
): Meme {
  const texture = configureTexture(new THREE.CanvasTexture(canvas), renderer);
  const materials = createBoxMaterials(texture, averageColor(canvas));
  return {
    key,
    kind,
    materials,
    animated: false,
    setActive: () => {},
    update: () => {},
    dispose: () => {
      texture.dispose();
      disposeMaterials(materials);
    },
  };
}

type GifImageFrame = Extract<ParsedGif['frames'][number], { image: unknown }>;

/**
 * Анимированный GIF: кадры распаковываются по одному прямо во время игры
 * (держать все кадры в памяти на телефоне слишком дорого) с учётом способа очистки кадра.
 */
export async function loadGifMeme(key: string, url: string, renderer: THREE.WebGLRenderer): Promise<Meme> {
  const buffer = await (await fetch(url)).arrayBuffer();
  const gif = parseGIF(buffer);
  const frames = gif.frames.filter((f): f is GifImageFrame => 'image' in f);
  if (!frames.length) throw new Error(`В GIF нет кадров: ${url}`);

  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const composite = document.createElement('canvas');
  composite.width = width;
  composite.height = height;
  const cctx = composite.getContext('2d', { willReadFrequently: true })!;
  const patchCanvas = document.createElement('canvas');
  const pctx = patchCanvas.getContext('2d')!;
  const { canvas, draw } = createSquareCanvas(width, height, frames.length > 1 ? ANIMATED_TEXTURE_SIDE : STATIC_TEXTURE_SIDE);

  let index = -1;
  let elapsed = 0;
  let delay = 100;
  let prevDisposal = 0;
  let prevDims: { left: number; top: number; width: number; height: number } | null = null;
  let restoreData: ImageData | null = null;

  const renderNext = () => {
    index = (index + 1) % frames.length;
    if (index === 0) {
      cctx.clearRect(0, 0, width, height);
      prevDims = null;
      restoreData = null;
    } else if (prevDims) {
      // Очистка предыдущего кадра: 2 — до фона, 3 — вернуть как было до него.
      if (prevDisposal === 2) cctx.clearRect(prevDims.left, prevDims.top, prevDims.width, prevDims.height);
      else if (prevDisposal === 3 && restoreData) cctx.putImageData(restoreData, 0, 0);
    }
    const frame = decompressFrame(frames[index], gif.gct, true);
    restoreData = frame.disposalType === 3 ? cctx.getImageData(0, 0, width, height) : null;
    const { dims } = frame;
    patchCanvas.width = dims.width;
    patchCanvas.height = dims.height;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), dims.width, dims.height), 0, 0);
    cctx.drawImage(patchCanvas, dims.left, dims.top);
    prevDisposal = frame.disposalType;
    prevDims = dims;
    // Как в браузерах: слишком короткая задержка считается за 100 мс.
    delay = frame.delay < 20 ? 100 : frame.delay;
    draw(composite);
  };

  renderNext();
  const texture = configureTexture(new THREE.CanvasTexture(canvas), renderer);
  const materials = createBoxMaterials(texture, averageColor(canvas));
  let active = false;

  return {
    key,
    kind: 'gif',
    materials,
    animated: frames.length > 1,
    setActive: (v) => {
      active = v;
    },
    update: (dtMs) => {
      if (!active || frames.length < 2) return;
      elapsed += dtMs;
      if (elapsed < delay) return;
      // Если вкладка «подвисла», не догоняем все пропущенные кадры.
      elapsed = Math.min(elapsed - delay, delay);
      renderNext();
      texture.needsUpdate = true;
    },
    dispose: () => {
      texture.dispose();
      disposeMaterials(materials);
    },
  };
}

/** Видео-мем (mp4/webm): без звука, по кругу, inline — так его можно автозапускать в Telegram. */
export function loadVideoMeme(key: string, url: string, renderer: THREE.WebGLRenderer): Promise<Meme> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    let timer = 0;
    const fail = (error: Error) => {
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      reject(error);
    };
    timer = window.setTimeout(() => fail(new Error(`Видео грузится слишком долго: ${url}`)), VIDEO_LOAD_TIMEOUT_MS);

    video.addEventListener('error', () => fail(new Error(`Не удалось загрузить видео ${url}`)), { once: true });
    video.addEventListener(
      'loadeddata',
      () => {
        window.clearTimeout(timer);
        const w = video.videoWidth || 1;
        const h = video.videoHeight || 1;
        const texture = configureTexture(new THREE.VideoTexture(video), renderer);
        // Обрезка до квадрата по центру через UV-трансформацию текстуры.
        const side = Math.min(w, h);
        texture.repeat.set(side / w, side / h);
        texture.offset.set((1 - side / w) / 2, (1 - side / h) / 2);

        const { canvas, draw } = createSquareCanvas(w, h, 64);
        draw(video);
        const materials = createBoxMaterials(texture, averageColor(canvas));
        let active = false;
        let colorPicked = false;
        // Запускали play() только чтобы iOS начал загрузку — до показа на коробке держим на паузе.
        video.pause();

        resolve({
          key,
          kind: 'video',
          materials,
          animated: true,
          setActive: (v) => {
            if (v === active) return;
            active = v;
            if (v) void video.play().catch(() => {});
            else video.pause();
          },
          update: () => {
            // Первый кадр бывает чёрным — цвет боков уточняем, когда видео реально пошло.
            if (!colorPicked && video.currentTime > 0.3) {
              colorPicked = true;
              draw(video);
              setSideColors(materials, averageColor(canvas));
            }
          },
          dispose: () => {
            video.pause();
            texture.dispose();
            disposeMaterials(materials);
            video.removeAttribute('src');
            video.load();
          },
        });
      },
      { once: true },
    );
    video.src = url;
    video.load();
    // iOS не грузит видео без play(); беззвучное inline-видео можно запускать без жеста пользователя.
    void video.play().catch(() => {});
  });
}
