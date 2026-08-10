import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!encoded) {
    throw new Error("Missing required environment variable: FIREBASE_SERVICE_ACCOUNT_KEY_BASE64");
  }

  const serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const adminApp = getAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
