import webpush from "web-push";
import { afterEach, describe, expect, it } from "vitest";
import { assertVapidEnvFormat, getVapidConfig, validateVapidKeys } from "./vapid";

const keys = webpush.generateVAPIDKeys();

describe("validateVapidKeys", () => {
  it("accepts a pair as web-push generates it", () => {
    expect(() => validateVapidKeys(keys.publicKey, keys.privateKey)).not.toThrow();
  });

  it("rejects the pair swapped — the realistic copy-paste slip — without echoing the secret", () => {
    expect(() => validateVapidKeys(keys.privateKey, keys.publicKey)).toThrow(/VAPID_PUBLIC_KEY/);
    try {
      validateVapidKeys(keys.publicKey, keys.publicKey);
    } catch (error) {
      expect((error as Error).message).toMatch(/VAPID_PRIVATE_KEY: got 87 characters/);
      expect((error as Error).message).not.toContain(keys.publicKey);
    }
  });
});

describe("assertVapidEnvFormat / getVapidConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("treats no keys at all as push switched off", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => assertVapidEnvFormat()).not.toThrow();
    expect(getVapidConfig()).toBeNull();
  });

  it("fails the build on half a pair", () => {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => assertVapidEnvFormat()).toThrow(/both/);
  });

  it("names the app, not a person, as the contact push services see", () => {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    delete process.env.VAPID_SUBJECT;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "maxsplit-ten.vercel.app";
    expect(getVapidConfig()).toEqual({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: "https://maxsplit-ten.vercel.app",
    });
  });
});
