import { clampHelpSoundVolume } from "../shared/models";

export async function playHelpChime(volume = 80): Promise<void> {
  const level = clampHelpSoundVolume(volume) / 100;
  if (level <= 0) return;

  const ctx = new AudioContext();
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const start = ctx.currentTime + 0.01;
    const peak = 0.12 + level * 0.7;
    tone(ctx, start, 880, 0.16, peak);
    tone(ctx, start + 0.16, 1175, 0.22, peak);
    await wait(420);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function tone(
  ctx: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  peak: number,
): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(ctx.destination);

  for (const [type, ratio] of [
    ["sine", 0.72],
    ["triangle", 0.28],
  ] as const) {
    const osc = ctx.createOscillator();
    const mix = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    mix.gain.setValueAtTime(ratio, start);
    osc.connect(mix);
    mix.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
