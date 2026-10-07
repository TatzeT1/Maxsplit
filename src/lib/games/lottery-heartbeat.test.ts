import { describe, expect, it } from "vitest";
import { HEARTBEAT_MAX_BPM, HEARTBEAT_MIN_BPM, lotteryHeartbeat } from "./lottery-heartbeat";

describe("lotteryHeartbeat", () => {
  it("is calm on a full board and racing when every face left laughs", () => {
    const start = lotteryHeartbeat(1, 32)!;
    expect(start.bpm).toBeGreaterThanOrEqual(HEARTBEAT_MIN_BPM);
    expect(start.bpm).toBeLessThan(90);
    expect(lotteryHeartbeat(3, 3)!.bpm).toBe(HEARTBEAT_MAX_BPM);
    expect(lotteryHeartbeat(3, 3)!.intensity).toBe(1);
  });

  it("speeds up with every safe face that vanishes", () => {
    let previous = 0;
    for (let facesLeft = 24; facesLeft >= 2; facesLeft--) {
      const beat = lotteryHeartbeat(2, facesLeft)!;
      expect(beat.bpm).toBeGreaterThanOrEqual(previous);
      expect(beat.bpm).toBeLessThanOrEqual(HEARTBEAT_MAX_BPM);
      previous = beat.bpm;
    }
    expect(lotteryHeartbeat(2, 4)!.bpm).toBeGreaterThan(lotteryHeartbeat(2, 20)!.bpm);
  });

  it("slows down again when a laughing face is found", () => {
    // 2 of 8 faces laugh, a laughing face is caught: 1 of 7 left.
    expect(lotteryHeartbeat(1, 7)!.bpm).toBeLessThan(lotteryHeartbeat(2, 8)!.bpm);
  });

  it("reports the plain odds", () => {
    expect(lotteryHeartbeat(1, 4)!.odds).toBe(0.25);
  });

  it("stops once nothing is left to find", () => {
    expect(lotteryHeartbeat(0, 12)).toBeNull();
    expect(lotteryHeartbeat(1, 0)).toBeNull();
  });
});
