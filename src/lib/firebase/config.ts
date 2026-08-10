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

export function getFirebaseClientConfig() {
  return {
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
  };
}

export const useFirebaseEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
