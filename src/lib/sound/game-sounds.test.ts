import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The setting is cached per module, so each test loads a fresh copy.
async function loadSounds() {
  vi.resetModules();
  return import("@/lib/sound/game-sounds");
}

describe("game sounds mute setting", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("starts with sound on when nothing is stored", async () => {
    const sounds = await loadSounds();
    expect(sounds.isGameSoundsMuted()).toBe(false);
  });

  it("reads 'Ton aus' from storage before any game's switch has mounted", async () => {
    window.localStorage.setItem("split:game-sound-off", "1");
    const sounds = await loadSounds();
    expect(sounds.isGameSoundsMuted()).toBe(true);
  });

  it("remembers a change and tells every switch on screen", async () => {
    const sounds = await loadSounds();
    const listener = vi.fn();
    const unsubscribe = sounds.subscribeGameSoundsMuted(listener);

    sounds.setGameSoundsMuted(true);
    expect(sounds.isGameSoundsMuted()).toBe(true);
    expect(window.localStorage.getItem("split:game-sound-off")).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    sounds.setGameSoundsMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((await loadSounds()).isGameSoundsMuted()).toBe(false);
  });
});
