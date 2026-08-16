import "server-only";
import { GrpcStatus } from "firebase-admin/firestore";

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === GrpcStatus.ALREADY_EXISTS
  );
}

/**
 * Creates a document at `ref` and returns its id. If `ref` already exists —
 * a retried submission reusing the same client-generated id, which both
 * Next's built-in offline retry (`experimental.useOffline`) and the
 * IndexedDB outbox in lib/offline can produce — this treats that as the
 * original write having already landed rather than an error, so a retried
 * "add expense" / "record payment" can't create a duplicate.
 */
export async function createIdempotent(
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
): Promise<string> {
  try {
    await ref.create(data);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  return ref.id;
}
