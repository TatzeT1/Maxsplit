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

/** A short burst of filtered white noise, the raw material for breaths, clicks and paper. */
function noiseBurst(
  ctx: AudioContext,
  startTime: number,
  duration: number,
  gainPeak: number,
  filterType: BiquadFilterType,
  frequency: number,
  q: number,
): void {
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, startTime);
  filter.Q.value = q;

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

/** The unvoiced "h" breath at the front of a "ha". */
function breathNoise(
  ctx: AudioContext,
  startTime: number,
  duration: number,
  gainPeak: number,
): void {
  noiseBurst(ctx, startTime, duration, gainPeak, "bandpass", 4000, 0.6);
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
export function playLaughSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const haCount = 4 + Math.round(Math.random());
  let time = ctx.currentTime + delaySeconds;
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

/** A short mechanical "clunk" for pulling the slot machine's lever. */
export function playLeverSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 90, now, 0.09, "square", 0.06);
  breathNoise(ctx, now, 0.04, 0.05);
}

/**
 * A hollow wood-block "tock" for one slot reel locking into place — a
 * desk-toy sound, not a cabinet one. A sine with a fast downward pitch bend
 * is what reads as a struck block rather than a beep.
 */
export function playReelStopSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880 + Math.random() * 60, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.07);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.1, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
  noiseBurst(ctx, now, 0.014, 0.05, "bandpass", 2200, 1.4);
}

/**
 * The wheel's flapper clicking past a peg: a very short, dry click. Called
 * once per wedge boundary, so it has to stay quiet — a fast spin fires it
 * dozens of times a second, and the ear should hear a ratchet slowing down,
 * not a buzz.
 */
export function playTickSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.012, 0.07, "bandpass", 2600 + Math.random() * 400, 2);
  tone(ctx, 1900, now, 0.018, "sine", 0.018);
}

/**
 * A rubber stamp hitting paper, plus the papery "pff" of the confetti it
 * throws up — the sound half of the stamp-and-confetti celebration
 * (`split-game/celebration.tsx`). `delaySeconds` schedules it on the audio
 * clock so it lands on the visual impact frame rather than when the
 * animation was *started*.
 */
export function playStampSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;

  // The body: a low sine dropping in pitch, the "thump" of the handle.
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(170, at);
  osc.frequency.exponentialRampToValueAtTime(46, at + 0.16);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.3, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.22);

  // The rubber face slapping the paper.
  noiseBurst(ctx, at, 0.04, 0.14, "bandpass", 1300, 0.9);
  // The confetti popping up a beat later.
  noiseBurst(ctx, at + 0.03, 0.16, 0.05, "highpass", 3200, 0.7);
}

/** Two or three quick, high "ha"s — a lighter laugh for the slot machine's many small hits. */
export function playGiggleSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const haCount = 2 + Math.round(Math.random());
  let time = ctx.currentTime + delaySeconds;
  for (let i = 0; i < haCount; i++) {
    const f0 = 220 + (i % 2 === 0 ? 0 : 30) + Math.random() * 20;
    const duration = 0.1 + Math.random() * 0.02;
    playHaSyllable(ctx, time, f0, duration, 0.12);
    time += duration * 0.8;
  }
}
