import * as THREE from 'three';

import { logger } from '../../api/logger';
import { t } from '../../i18n';
import type { Meme } from './Meme';
import { loadGifMeme, loadImageMeme, loadVideoMeme, staticMeme } from './memeSources';

type MediaType = 'image' | 'gif' | 'video';

interface MemeMedia {
  key: string;
  type: MediaType;
  url: string;
}

/** Мемы из src/assets/memes: картинки, GIF и видео (mp4/webm) подхватываются автоматически. */
const MEME_MODULES = import.meta.glob(
  '../../assets/memes/*.{jpg,jpeg,png,webp,avif,svg,gif,mp4,webm,mov,JPG,JPEG,PNG,WEBP,GIF,MP4,WEBM,MOV}',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
) as Record<string, string>;

const MEME_MEDIA: MemeMedia[] = Object.entries(MEME_MODULES)
  .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
  .map(([path, url], index) => ({
    key: `meme_${index + 1}`,
    type: /\.(mp4|webm|mov)$/i.test(path) ? 'video' : /\.gif$/i.test(path) ? 'gif' : 'image',
    url,
  }));

/**
 * Набор мемов для коробок. Картинки и GIF грузятся до старта (с прогрессом на экране загрузки),
 * видео — по одному в фоне: каждое попадает в игру, как только догрузилось.
 */
export class MemeLibrary {
  private readonly ready: Meme[] = [];
  private readonly placeholders: Meme[];
  private active = new Set<Meme>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.placeholders = createPlaceholderMemes(renderer);
  }

  get count(): number {
    return this.ready.length;
  }

  async preload(onProgress: (value: number) => void): Promise<void> {
    const stills = MEME_MEDIA.filter((m) => m.type !== 'video');
    const videos = MEME_MEDIA.filter((m) => m.type === 'video' && canPlayVideo(m.url));
    let done = 0;
    onProgress(stills.length ? 0 : 1);

    await Promise.all(
      stills.map(async (media) => {
        const meme = await this.load(media);
        if (meme) this.ready.push(meme);
        onProgress(++done / stills.length);
      }),
    );

    void this.loadVideosInBackground(videos);
  }

  /** Случайный мем, отличный от except (если есть из чего выбрать). */
  pick(except?: Meme): Meme {
    const pool = this.ready.length ? this.ready : this.placeholders;
    let meme = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && meme === except) meme = pool[(pool.indexOf(meme) + 1) % pool.length];
    return meme;
  }

  /** Анимация идёт только у мемов, которые сейчас видны на коробках. */
  setActive(visible: Set<Meme>): void {
    for (const meme of this.active) if (!visible.has(meme)) meme.setActive(false);
    for (const meme of visible) if (!this.active.has(meme)) meme.setActive(true);
    this.active = visible;
  }

  /** Повторно запустить анимации активных мемов (вызывать из обработчика жеста пользователя). */
  resume(): void {
    for (const meme of this.active) {
      meme.setActive(false);
      meme.setActive(true);
    }
  }

  update(dtMs: number): void {
    for (const meme of this.active) meme.update(dtMs);
  }

  private async loadVideosInBackground(videos: MemeMedia[]): Promise<void> {
    for (const media of videos) {
      const meme = await this.load(media);
      if (meme) this.ready.push(meme);
    }
  }

  private async load(media: MemeMedia): Promise<Meme | null> {
    try {
      switch (media.type) {
        case 'gif':
          return await loadGifMeme(media.key, media.url, this.renderer);
        case 'video':
          return await loadVideoMeme(media.key, media.url, this.renderer);
        default:
          return await loadImageMeme(media.key, media.url, this.renderer);
      }
    } catch (error) {
      console.error(t('log.failedToLoadMeme'), media.url, error);
      logger.warn('failed to load meme', { url: media.url, type: media.type, error: String(error) });
      return null;
    }
  }
}

function canPlayVideo(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  const mime = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  return document.createElement('video').canPlayType(mime) !== '';
}

/** Заглушки с эмодзи, пока в src/assets/memes нет ни одного мема. */
function createPlaceholderMemes(renderer: THREE.WebGLRenderer): Meme[] {
  const items: [string, string, number][] = [
    ['😂', 'LOL', 48], ['🐸', 'PEPE', 120], ['🗿', 'MOAI', 28], ['🐱', 'MEOW', 330],
    ['🔥', 'FIRE', 12], ['🤡', 'HONK', 280], ['😎', 'COOL', 200], ['🦆', 'QUACK', 55],
  ];
  return items.map(([emoji, label, hue], i) => {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, `hsl(${hue} 85% 66%)`);
    g.addColorStop(1, `hsl(${hue + 30} 80% 52%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size * 0.42}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(emoji, size / 2, size * 0.43);
    ctx.font = `900 ${size * 0.13}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(label, size / 2, size * 0.84);
    return staticMeme(`placeholder_${i}`, 'placeholder', c, renderer);
  });
}
