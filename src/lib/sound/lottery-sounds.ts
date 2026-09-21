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

/** Playful ascending bounce for a "pay" reveal — evokes a laugh, not a jump-scare. */
export function playLaughSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [660, 550, 660, 780, 880];
  notes.forEach((freq, i) => tone(ctx, freq, now + i * 0.09, 0.14, "triangle", 0.1));
}

/** Short two-note chime when a result is applied to the expense form. */
export function playAppliedSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 523.25, now, 0.12, "sine", 0.08);
  tone(ctx, 659.25, now + 0.1, 0.16, "sine", 0.08);
}
