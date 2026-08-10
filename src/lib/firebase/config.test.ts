import { describe, expect, it } from "vitest";
import { type FirebaseClientConfig, validateFirebaseClientConfig } from "./config";

const valid: FirebaseClientConfig = {
  apiKey: "AIzaSyExampleKey",
  authDomain: "split-f54a5.firebaseapp.com",
  projectId: "split-f54a5",
  storageBucket: "split-f54a5.firebasestorage.app",
  messagingSenderId: "151397998930",
  appId: "1:151397998930:web:ed2b7668e1563bdc7d5a8b",
};

describe("validateFirebaseClientConfig", () => {
  it("accepts a well-formed config", () => {
    expect(validateFirebaseClientConfig(valid)).toEqual(valid);
  });

  // The production outage this guard exists for: the storage bucket was pasted
  // into the project id. Auth still worked, so the only symptom was every
  // Firestore listener failing with `permission-denied` against a project that
  // does not exist.
  it("rejects a storage bucket pasted into the project id", () => {
    expect(() =>
      validateFirebaseClientConfig({ ...valid, projectId: "split-f54a5.firebasestorage.app" }),
    ).toThrow(/NEXT_PUBLIC_FIREBASE_PROJECT_ID/);
  });

  it("rejects an auth domain pasted into the project id", () => {
    expect(() =>
      validateFirebaseClientConfig({ ...valid, projectId: "split-f54a5.firebaseapp.com" }),
    ).toThrow(/NEXT_PUBLIC_FIREBASE_PROJECT_ID/);
  });

  it("names the offending variable and its value in the error", () => {
    expect(() => validateFirebaseClientConfig({ ...valid, projectId: "Split_F54A5" })).toThrow(
      'Invalid environment variable NEXT_PUBLIC_FIREBASE_PROJECT_ID: got "Split_F54A5"',
    );
  });

  it("rejects a bare project id in the auth domain", () => {
    expect(() => validateFirebaseClientConfig({ ...valid, authDomain: "split-f54a5" })).toThrow(
      /NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN/,
    );
  });

  it("rejects a gs:// prefixed storage bucket", () => {
    expect(() =>
      validateFirebaseClientConfig({
        ...valid,
        storageBucket: "gs://split-f54a5.firebasestorage.app",
      }),
    ).toThrow(/NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET/);
  });

  it("rejects a non-numeric messaging sender id", () => {
    expect(() =>
      validateFirebaseClientConfig({ ...valid, messagingSenderId: "split-f54a5" }),
    ).toThrow(/NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID/);
  });

  it("rejects an app id that is not colon-separated", () => {
    expect(() => validateFirebaseClientConfig({ ...valid, appId: "ed2b7668e1563bdc" })).toThrow(
      /NEXT_PUBLIC_FIREBASE_APP_ID/,
    );
  });
});
