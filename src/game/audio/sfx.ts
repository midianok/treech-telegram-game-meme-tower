/** Синтезированные звуки — без аудиофайлов. */
let ctx: AudioContext | null = null;
export let muted = false;

export function setMuted(v: boolean) {
  muted = v;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  if (muted) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
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
    tone(420, 0.25, 'sawtooth', 0.08, 260);
    tone(260, 0.5, 'sawtooth', 0.08, 70, 0.2);
  },
};
