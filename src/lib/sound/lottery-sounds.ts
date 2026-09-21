"use client";

/**
 * Tiny synthesized sound effects for the payer lottery — no audio assets,
 * just short Web Audio oscillator bursts. Safe to call from a click handler
 * (the only context that can start an AudioContext on iOS Safari).
 */

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function tone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** Short neutral click for a "safe" reveal. */
export function playTapSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  tone(ctx, 420, ctx.currentTime, 0.08, "square", 0.05);
}

/** One "ha" burst: a sawtooth that dips in pitch through a vocal-range bandpass filter, the way an exhaled syllable does. */
function playHa(ctx: AudioContext, startTime: number, baseFreq: number): void {
  const duration = 0.11;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(baseFreq * 1.5, startTime);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, startTime + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1000, startTime);
  filter.Q.value = 3;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.18, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** A "ha-ha-ha-ha" burst for a "pay" reveal — rhythmic vocal-range pulses, not a musical jingle. */
export function playLaughSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const haCount = 4 + Math.round(Math.random());
  let time = ctx.currentTime;
  for (let i = 0; i < haCount; i++) {
    const baseFreq = 260 + Math.random() * 40;
    playHa(ctx, time, baseFreq);
    time += 0.13 + Math.random() * 0.02;
  }
}

/** Short two-note chime when a result is applied to the expense form. */
export function playAppliedSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 523.25, now, 0.12, "sine", 0.08);
  tone(ctx, 659.25, now + 0.1, 0.16, "sine", 0.08);
}
