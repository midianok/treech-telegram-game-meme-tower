import { logger } from '../../api/logger';

/** Синтезированные звуки + фразы при проигрыше из src/assets/sounds/finish (как в «Наморево горе»). */
let ctx: AudioContext | null = null;
export let muted = false;

/** Фразы при проигрыше: подхватываются автоматически, одна случайная на каждый game over. */
const FINISH_SOUND_URLS = Object.entries(
  import.meta.glob('../../assets/sounds/finish/*.{ogg,opus,webm,mp3,m4a,aac,wav}', {
    eager: true,
    import: 'default',
    query: '?url',
  }) as Record<string, string>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const finishBuffers: AudioBuffer[] = [];
let finishSource: AudioBufferSourceNode | null = null;
let lastFinishIndex = -1;

function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(v: boolean) {
  muted = v;
  if (v) stopFinish();
}

/**
 * Загрузка и декодирование фраз в фоне (не блокирует старт игры).
 * AudioContext создаётся «спящим» и будится первым звуком из жеста пользователя.
 */
export async function preloadFinishSounds(): Promise<void> {
  const context = ctx ?? (ctx = new AudioContext());
  await Promise.all(
    FINISH_SOUND_URLS.map(async (url) => {
      try {
        const data = await (await fetch(url)).arrayBuffer();
        finishBuffers.push(await context.decodeAudioData(data));
      } catch (error) {
        logger.warn('failed to load finish sound', { url, error: String(error) });
      }
    }),
  );
}

function stopFinish() {
  if (!finishSource) return;
  try {
    finishSource.stop();
  } catch {
    // уже остановлен
  }
  finishSource = null;
}

/** Случайная фраза из finish (без повтора предыдущей); пока ничего не загрузилось — синтезированный звук. */
function playFinish(): boolean {
  if (!finishBuffers.length) return false;
  const context = audioContext();
  let index = Math.floor(Math.random() * finishBuffers.length);
  if (finishBuffers.length > 1 && index === lastFinishIndex) index = (index + 1) % finishBuffers.length;
  lastFinishIndex = index;

  stopFinish();
  const source = context.createBufferSource();
  source.buffer = finishBuffers[index];
  source.connect(context.destination);
  source.onended = () => {
    if (finishSource === source) finishSource = null;
  };
  source.start();
  finishSource = source;
  return true;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  if (muted) return;
  const context = audioContext();
  const t = context.currentTime + delay;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(context.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  drop: () => tone(620, 0.09, 'triangle', 0.12, 420),
  land: (level: number) => tone(Math.min(180 + level * 8, 520), 0.14, 'sine', 0.3, 90),
  perfect: () => {
    tone(880, 0.12, 'triangle', 0.14);
    tone(1320, 0.18, 'triangle', 0.14, undefined, 0.08);
  },
  over: () => {
    if (muted || playFinish()) return;
    tone(420, 0.25, 'sawtooth', 0.08, 260);
    tone(260, 0.5, 'sawtooth', 0.08, 70, 0.2);
  },
};
