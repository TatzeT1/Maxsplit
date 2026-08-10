// Each NEXT_PUBLIC_* var below is accessed via static `process.env.X` dot
// notation (never a dynamic `process.env[name]`) because Next.js inlines
// these at build time using static analysis — a computed key would leave
// `process.env` as an unresolved runtime lookup that's undefined in the browser.
function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Shape checks for the client config, kept separate from the env lookup so it
 * can be unit tested.
 *
 * These exist because a *well-formed but wrong* value fails silently and
 * catastrophically: production once had the storage bucket
 * ("split-f54a5.firebasestorage.app") pasted into NEXT_PUBLIC_FIREBASE_PROJECT_ID.
 * Auth kept working (it only needs apiKey + authDomain), so sign-in looked
 * healthy, but every Firestore listener addressed a project that doesn't exist
 * and was rejected with `permission-denied` — leaving the UI on a loading
 * skeleton forever. Each rule below catches one realistic copy-paste swap
 * between these six values.
 */
export function validateFirebaseClientConfig(config: FirebaseClientConfig): FirebaseClientConfig {
  const fail = (name: string, value: string, expected: string): never => {
    throw new Error(`Invalid environment variable ${name}: got "${value}" — expected ${expected}.`);
  };

  // Firebase project IDs are lowercase alphanumerics and hyphens. A dot means a
  // hostname or bucket ("<project>.firebasestorage.app") landed here by mistake.
  if (!/^[a-z0-9-]+$/.test(config.projectId)) {
    fail(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      config.projectId,
      'a bare project id such as "split-f54a5" (lowercase letters, digits and hyphens only — no dots, no hostname)',
    );
  }

  if (!config.authDomain.includes(".") || config.authDomain.includes("/")) {
    fail(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      config.authDomain,
      'a hostname such as "split-f54a5.firebaseapp.com"',
    );
  }

  if (!config.storageBucket.includes(".") || config.storageBucket.includes("/")) {
    fail(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      config.storageBucket,
      'a bucket host such as "split-f54a5.firebasestorage.app" (no "gs://" prefix)',
    );
  }

  if (!/^\d+$/.test(config.messagingSenderId)) {
    fail(
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      config.messagingSenderId,
      "a numeric sender id",
    );
  }

  if (!config.appId.includes(":")) {
    fail(
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      config.appId,
      'a colon-separated app id such as "1:151397998930:web:…"',
    );
  }

  return config;
}

/**
 * Build-time gate, called from next.config.ts. Checks only the *format* of the
 * vars that are set: an absent var is left to `requireEnv` at runtime, so
 * cloning the repo without a .env.local still fails with the existing
 * "Missing required environment variable" message rather than a config-load
 * crash. A var that is present but malformed fails the build.
 */
export function assertFirebaseClientEnvFormat(): void {
  const env = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (Object.values(env).some((value) => !value)) return;
  validateFirebaseClientConfig(env as FirebaseClientConfig);
}

export function getFirebaseClientConfig(): FirebaseClientConfig {
  return validateFirebaseClientConfig({
    apiKey: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, "NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv(
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    ),
    projectId: requireEnv(
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    ),
    storageBucket: requireEnv(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    ),
    messagingSenderId: requireEnv(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    ),
    appId: requireEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, "NEXT_PUBLIC_FIREBASE_APP_ID"),
  });
}

export const useFirebaseEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
