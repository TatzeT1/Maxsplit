"use client";

/**
 * Tiny synthesized sound effects for the "who pays" split mini-games — no
 * audio assets, just short Web Audio bursts built from oscillators, filters
 * and noise. Safe to call from a click handler (the only context that can
 * start an AudioContext on iOS Safari).
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

/** A short burst of filtered white noise — the unvoiced "h" breath at the front of a "ha". */
function breathNoise(
  ctx: AudioContext,
  startTime: number,
  duration: number,
  gainPeak: number,
): void {
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(4000, startTime);
  filter.Q.value = 0.6;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

/**
 * One voiced "ha" syllable: a sawtooth glottal buzz run through two parallel
 * bandpass filters tuned to the F1/F2 formants of an open "ah" vowel, plus a
 * breathy noise burst on the attack and a little pitch vibrato. That formant
 * pair is what makes it read as a voice instead of a tone — a single
 * bandpassed oscillator (the old approach) sounds like a kazoo.
 */
function playHaSyllable(
  ctx: AudioContext,
  startTime: number,
  f0: number,
  duration: number,
  gainPeak: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0 * 1.12, startTime);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.82, startTime + duration);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 26;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = f0 * 0.025;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(gainPeak, startTime + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  const formant1 = ctx.createBiquadFilter();
  formant1.type = "bandpass";
  formant1.frequency.setValueAtTime(720, startTime);
  formant1.Q.value = 7;

  const formant2 = ctx.createBiquadFilter();
  formant2.type = "bandpass";
  formant2.frequency.setValueAtTime(1150, startTime);
  formant2.Q.value = 9;
  const formant2Gain = ctx.createGain();
  formant2Gain.gain.value = 0.55;

  osc.connect(formant1);
  osc.connect(formant2);
  formant1.connect(envelope);
  formant2.connect(formant2Gain);
  formant2Gain.connect(envelope);
  envelope.connect(ctx.destination);

  vibrato.start(startTime);
  vibrato.stop(startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);

  breathNoise(ctx, startTime, Math.min(0.025, duration * 0.25), gainPeak * 0.4);
}

/** A single, quiet "heh" — the safe tap earns a small amused chuckle, not the big reveal laugh. */
export function playMissSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  playHaSyllable(ctx, ctx.currentTime, 150 + Math.random() * 15, 0.11, 0.09);
}

/**
 * A "ha-ha-ha-ha" burst for a "pay" reveal: several voiced syllables at
 * alternating pitches, so it reads as two people laughing together rather
 * than one voice repeating.
 */
export function playLaughSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const haCount = 4 + Math.round(Math.random());
  let time = ctx.currentTime;
  for (let i = 0; i < haCount; i++) {
    const voiceOffset = i % 2 === 0 ? 0 : 45;
    const f0 = 165 + voiceOffset + Math.random() * 25;
    const duration = 0.13 + Math.random() * 0.03;
    playHaSyllable(ctx, time, f0, duration, 0.17);
    time += duration * 0.78 + Math.random() * 0.02;
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
