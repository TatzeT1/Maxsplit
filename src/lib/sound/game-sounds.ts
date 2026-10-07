"use client";

/**
 * Tiny synthesized sound effects for the "who pays" split mini-games — no
 * audio assets, just short Web Audio bursts built from oscillators, filters
 * and noise. Safe to call from a click handler (the only context that can
 * start an AudioContext on iOS Safari).
 */

let audioCtx: AudioContext | null = null;

/**
 * "Ton aus" for every game, remembered per browser. Read from storage on
 * first use rather than when some game's switch mounts — it used to be
 * applied only once the slot machine opened, so after a reload every other
 * game played sound again although it had been switched off.
 */
const SOUND_OFF_KEY = "split:game-sound-off";
let muted: boolean | null = null;
const mutedListeners = new Set<() => void>();

export function isGameSoundsMuted(): boolean {
  if (muted === null) {
    try {
      muted = typeof window !== "undefined" && window.localStorage.getItem(SOUND_OFF_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

/** Mutes or unmutes every game sound and remembers it on this device. The stage's 🔊 switch drives this. */
export function setGameSoundsMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(SOUND_OFF_KEY, next ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the switch still works until a reload.
  }
  for (const listener of mutedListeners) listener();
}

/** For `useSyncExternalStore`: every switch on screen follows the same setting. */
export function subscribeGameSoundsMuted(listener: () => void): () => void {
  mutedListeners.add(listener);
  return () => {
    mutedListeners.delete(listener);
  };
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || isGameSoundsMuted()) return null;
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

/** A short, bright two-tone chime for the reaction duel's "Los!" signal — distinct from the mechanical sounds above, so it reads as "go" rather than as a machine noise. */
export function playGoSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.09, "triangle", 0.12);
  tone(ctx, 1318.5, now + 0.06, 0.14, "triangle", 0.12);
}

/** A short, low buzz for a false start — deliberately flat and a little harsh, the opposite of the "Los!" chime. */
export function playBuzzerSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 140, now, 0.22, "sawtooth", 0.08);
  noiseBurst(ctx, now, 0.05, 0.05, "lowpass", 400, 0.8);
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

/**
 * One stroke of the balloon pump: a short squeaky rise whose pitch climbs with
 * how full the balloon already is (`fullness`, 0..1), plus a puff of air.
 * Deliberately says nothing about the secret burst point — fullness comes from
 * the visible size, which only ever shows how much air went in.
 */
export function playPumpSound(fullness = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const base = 240 + Math.min(Math.max(fullness, 0), 1) * 520;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.16);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
  noiseBurst(ctx, now, 0.12, 0.04, "bandpass", 1600, 0.7);
}

/** A balloon going off: a sharp crack of noise over a short, dropping thump. */
export function playPopSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.14, 0.32, "highpass", 500, 0.5);
  noiseBurst(ctx, now, 0.05, 0.25, "bandpass", 2400, 0.8);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.14);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.28, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

/** One nasal pulse of a quack: a sawtooth glide through two vowel-ish formants, like `playHaSyllable` but flatter and buzzier. */
function quackPulse(
  ctx: AudioContext,
  startTime: number,
  f0: number,
  duration: number,
  gainPeak: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, startTime);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.68, startTime + duration);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  const formant1 = ctx.createBiquadFilter();
  formant1.type = "bandpass";
  formant1.frequency.setValueAtTime(900, startTime);
  formant1.Q.value = 5;
  const formant2 = ctx.createBiquadFilter();
  formant2.type = "bandpass";
  formant2.frequency.setValueAtTime(1900, startTime);
  formant2.Q.value = 6;
  const formant2Gain = ctx.createGain();
  formant2Gain.gain.value = 0.6;

  osc.connect(formant1);
  osc.connect(formant2);
  formant1.connect(envelope);
  formant2.connect(formant2Gain);
  formant2Gain.connect(envelope);
  envelope.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** A rubber duck's "qua-ak": two quick pulses, the second a touch lower. */
export function playQuackSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const f0 = 380 + Math.random() * 60;
  quackPulse(ctx, now, f0, 0.1, 0.16);
  quackPulse(ctx, now + 0.11, f0 * 0.9, 0.13, 0.14);
}

/** Water slapping: a wash of mid noise with a bright sizzle on top — the start gun of the duck race. */
export function playSplashSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.28, 0.12, "bandpass", 1500, 0.5);
  noiseBurst(ctx, now + 0.04, 0.2, 0.06, "highpass", 3000, 0.6);
}

/** Dice rattling in a cup: a burst of dry clicks at uneven gaps. */
export function playDiceRattleSound(seconds = 0.75): void {
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime;
  const end = start + seconds;
  for (let time = start; time < end; time += 0.04 + Math.random() * 0.035) {
    noiseBurst(
      ctx,
      time,
      0.02,
      0.07 + Math.random() * 0.04,
      "bandpass",
      1600 + Math.random() * 2200,
      2.5,
    );
  }
}

/** Dice coming to rest on the table: one soft thud and a click. */
export function playDiceLandSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 190, now, 0.08, "sine", 0.12);
  noiseBurst(ctx, now, 0.03, 0.07, "bandpass", 1100, 1.1);
}

/**
 * One half of a heartbeat: a sine that drops from a knock to a thud. It starts
 * at 150 Hz on purpose — a phone speaker reproduces next to nothing below
 * ~120 Hz, so a "real" 50 Hz heartbeat would be silent exactly where this
 * game is played; the drop is what still reads as a thump.
 */
function heartThump(ctx: AudioContext, at: number, gainPeak: number, pitch: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150 * pitch, at);
  osc.frequency.exponentialRampToValueAtTime(52 * pitch, at + 0.12);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(gainPeak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.16);
  noiseBurst(ctx, at, 0.05, gainPeak * 0.25, "lowpass", 420, 0.7);
}

/**
 * One heartbeat, "lub-dub", for the lottery's tension. `intensity` (0..1) is
 * how close the next tap is to a laughing face: the beat gets louder and the
 * "dub" crowds the "lub", the way a racing pulse sounds. The caller sets the
 * tempo by how often it calls this.
 */
export function playHeartbeatSound(intensity = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const level = Math.min(Math.max(intensity, 0), 1);
  const now = ctx.currentTime;
  const gainPeak = 0.1 + level * 0.14;
  heartThump(ctx, now, gainPeak, 1);
  heartThump(ctx, now + 0.17 - level * 0.05, gainPeak * 0.7, 0.85);
}

/** A pencil stroke: a short, dry scratch of high-passed noise — a Käsekästchen line being drawn. */
export function playPencilSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.11, 0.05, "highpass", 3400, 0.6);
  noiseBurst(ctx, now + 0.02, 0.08, 0.03, "bandpass", 5200, 1.2);
}

/**
 * A match being struck: the rasp of the head on the box, then the soft "fff"
 * of the flame catching and a tiny crackle. Played for every take in the
 * matchstick duel.
 */
export function playMatchStrikeSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.09, 0.09, "highpass", 2400 + Math.random() * 500, 0.8);
  noiseBurst(ctx, now + 0.07, 0.22, 0.07, "bandpass", 1500, 0.5);
  tone(ctx, 1400 + Math.random() * 300, now + 0.1, 0.02, "square", 0.012);
}

/**
 * One tick of the matchstick duel's fuse in its last seconds — higher and
 * sharper the closer the end, so the ear feels it tighten even with the eyes
 * on the board.
 */
export function playFuseTickSound(secondsLeft: number): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const urgency = 1 - Math.min(Math.max(secondsLeft, 1), 5) / 5;
  tone(ctx, 620 + urgency * 700, now, 0.05, "triangle", 0.07 + urgency * 0.05);
  noiseBurst(ctx, now, 0.02, 0.04, "bandpass", 3000, 2);
}

/** A puff of breath and a sinking note: the joker blowing the match out to skip a move. */
export function playSkipSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  breathNoise(ctx, now, 0.3, 0.11);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(240, now + 0.22);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

/*
 * The slot machine's paytable sounds: one per combination, so the ear knows
 * what came up before the eye has read the slip. Ordered from the smallest
 * moment to the biggest.
 */

/** A bell-like partial stack: a fundamental plus two inharmonic overtones, decaying at different rates. */
function bellTone(ctx: AudioContext, freq: number, startTime: number, gainPeak: number): void {
  tone(ctx, freq, startTime, 1.1, "sine", gainPeak);
  tone(ctx, freq * 2.76, startTime, 0.5, "sine", gainPeak * 0.35);
  tone(ctx, freq * 5.4, startTime, 0.22, "sine", gainPeak * 0.15);
}

/** One coin landing in a tray: a bright, short metallic ping. */
function coinPing(ctx: AudioContext, startTime: number, gainPeak: number): void {
  const freq = 2100 + Math.random() * 900;
  tone(ctx, freq, startTime, 0.16, "triangle", gainPeak);
  tone(ctx, freq * 1.5, startTime + 0.005, 0.1, "sine", gainPeak * 0.5);
}

/** A drum roll for the teased third reel: quick snare hits swelling toward the stop. */
export function playDrumrollSound(seconds: number): void {
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime;
  for (let time = 0; time < seconds; time += 0.055) {
    const swell = 0.03 + (time / seconds) * 0.07;
    noiseBurst(ctx, start + time, 0.05, swell, "bandpass", 1800 + Math.random() * 300, 0.9);
  }
}

/** Two of a kind, stake back: a couple of coins dropping into the tray. */
export function playCoinSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  coinPing(ctx, now, 0.07);
  coinPing(ctx, now + 0.09, 0.06);
}

/** Three lemons: a sour, sagging "wah-wah". */
export function playSourSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  [0, 0.28].forEach((offset, index) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const from = index === 0 ? 330 : 294;
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(from, at + offset);
    osc.frequency.exponentialRampToValueAtTime(from * 0.86, at + offset + 0.3);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, at + offset);
    filter.frequency.exponentialRampToValueAtTime(380, at + offset + 0.3);
    gain.gain.setValueAtTime(0, at + offset);
    gain.gain.linearRampToValueAtTime(0.09, at + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + offset + 0.32);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at + offset);
    osc.stop(at + offset + 0.32);
  });
}

/** Three cherries, free spin: a quick rising arpeggio. */
export function playFreeSpinSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
    tone(ctx, freq, at + index * 0.07, 0.18, "triangle", 0.09);
  });
}

/** Three bells, Schwarzer Peter: a doorbell "ding-dong" for whoever's next. */
export function playBellSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  bellTone(ctx, 784, at, 0.1);
  bellTone(ctx, 622, at + 0.32, 0.1);
}

/** Three stars, a round for everyone: a high sparkle running up and down. */
export function playStarSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  [1318.5, 1568, 1975.5, 2637, 1975.5, 2637, 3136].forEach((freq, index) => {
    tone(ctx, freq, at + index * 0.05, 0.16, "sine", 0.05);
  });
}

/** Three bombs: a crack, a deep boom, and debris rumbling out. */
export function playBombSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  noiseBurst(ctx, at, 0.08, 0.35, "highpass", 900, 0.5);
  noiseBurst(ctx, at + 0.02, 0.9, 0.3, "lowpass", 520, 0.7);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, at);
  osc.frequency.exponentialRampToValueAtTime(32, at + 0.6);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.4, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.7);
}

/** Three sevens: a brass fanfare, then a long cascade of coins. */
export function playJackpotSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  const fanfare: [number, number, number][] = [
    [523.25, 0, 0.14],
    [523.25, 0.15, 0.14],
    [523.25, 0.3, 0.14],
    [659.25, 0.45, 0.22],
    [783.99, 0.68, 0.5],
  ];
  for (const [freq, offset, duration] of fanfare) {
    tone(ctx, freq, at + offset, duration, "square", 0.045);
    tone(ctx, freq * 1.5, at + offset, duration, "sawtooth", 0.02);
    tone(ctx, freq / 2, at + offset, duration, "triangle", 0.05);
  }
  for (let i = 0; i < 18; i++) {
    coinPing(ctx, at + 0.75 + i * 0.07 + Math.random() * 0.04, 0.05);
  }
}

/**
 * A slot's win meter rolling up: fast ticks climbing in pitch over
 * `seconds`, ending on a bright "ding" when the count lands.
 */
export function playRollupSound(seconds: number, delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime + delaySeconds;
  const step = 0.045;
  for (let time = 0; time < seconds; time += step) {
    const progress = time / seconds;
    tone(ctx, 900 + progress * 900, start + time, 0.03, "square", 0.018);
  }
  bellTone(ctx, 1568, start + seconds, 0.07);
}

/** The winning line lighting up: a quick rising three-note chime. */
export function playWinLineSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  [1046.5, 1318.5, 1568].forEach((freq, index) => {
    tone(ctx, freq, now + index * 0.06, 0.2, "triangle", 0.06);
  });
}

/** A "BIG WIN" sting: a bright major arpeggio over a low hit, then coins. */
export function playBigWinSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  tone(ctx, 130.8, at, 0.5, "triangle", 0.12);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => {
    tone(ctx, freq, at + index * 0.07, 0.35, "square", 0.035);
    tone(ctx, freq * 2, at + index * 0.07, 0.25, "sine", 0.03);
  });
  for (let i = 0; i < 8; i++) {
    coinPing(ctx, at + 0.4 + i * 0.08 + Math.random() * 0.03, 0.05);
  }
}

/** Free spins starting: a little circus run up and a held chord. */
export function playFreeSpinsIntroSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  [392, 440, 493.9, 523.25, 587.3, 659.25, 698.5, 783.99].forEach((freq, index) => {
    tone(ctx, freq, now + index * 0.05, 0.12, "triangle", 0.07);
  });
  [783.99, 987.8, 1174.7].forEach((freq) => tone(ctx, freq, now + 0.45, 0.8, "sine", 0.05));
}

/** Die Rechnung: a till drawer's "ka-ching". */
export function playCashRegisterSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  noiseBurst(ctx, at, 0.08, 0.12, "bandpass", 900, 1.2);
  tone(ctx, 220, at, 0.08, "square", 0.04);
  bellTone(ctx, 2093, at + 0.12, 0.09);
  bellTone(ctx, 2637, at + 0.12, 0.06);
}

/** Geistertausch: a wobbly, falling "woo-ooo". */
export function playGhostSound(delaySeconds = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  const at = ctx.currentTime + delaySeconds;
  const osc = ctx.createOscillator();
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, at);
  osc.frequency.exponentialRampToValueAtTime(260, at + 1.1);
  vibrato.frequency.value = 6;
  vibratoGain.gain.value = 22;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.09, at + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  vibrato.start(at);
  osc.start(at);
  vibrato.stop(at + 1.2);
  osc.stop(at + 1.2);
}

/** Mystery symbols turning over: a rising shimmer. */
export function playMysterySound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.4, 0.05, "highpass", 4000, 0.6);
  [880, 1174.7, 1568, 2093].forEach((freq, index) => {
    tone(ctx, freq, now + 0.25 + index * 0.05, 0.25, "sine", 0.05);
  });
}

/** A gift box popping open: a paper rustle, a pop and a chime. */
export function playGiftOpenSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.12, 0.08, "bandpass", 2500, 0.7);
  tone(ctx, 300, now + 0.1, 0.08, "sine", 0.12);
  bellTone(ctx, 1318.5, now + 0.18, 0.07);
}

/** Two blades crossing, for the duel. */
export function playSwordSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.25, 0.12, "highpass", 5000, 0.8);
  tone(ctx, 2600, now, 0.35, "triangle", 0.05);
  tone(ctx, 3900, now + 0.01, 0.3, "sine", 0.03);
}
