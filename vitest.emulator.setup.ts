import { generateKeyPairSync } from "node:crypto";
import { beforeEach, vi } from "vitest";
import { clearSentPushes } from "@/test/push-mock";

// Runs before every emulator integration test file (vitest.emulator.config.ts).

export const EMULATOR_PROJECT_ID = "split-app-actions-test";

// lib/firebase/admin.ts builds its credential from this at import time. The
// emulator never checks it, but cert() needs a well-formed service account.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 = Buffer.from(
  JSON.stringify({
    type: "service_account",
    project_id: EMULATOR_PROJECT_ID,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    client_email: `emulator@${EMULATOR_PROJECT_ID}.iam.gserviceaccount.com`,
  }),
).toString("base64");
// Stops google-auth-library from probing the GCE metadata server for one.
process.env.GCLOUD_PROJECT = EMULATOR_PROJECT_ID;
// `firebase emulators:exec` sets this; the fallback lets an already running
// `pnpm emulators` serve a plain `vitest --config vitest.emulator.config.ts`.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

vi.mock("@/lib/auth/session", () => import("@/test/session-mock"));
vi.mock("@/lib/push/notify", () => import("@/test/push-mock"));

beforeEach(async () => {
  clearSentPushes();
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`Could not clear the Firestore emulator: ${response.status}`);
});
