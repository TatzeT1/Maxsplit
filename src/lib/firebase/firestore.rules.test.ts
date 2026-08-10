import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "split-app-rules-test";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed data as an admin context, bypassing rules — mirrors what the Admin
  // SDK writes in production, since clients never write directly (ADR-001).
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc("groups/group1").set({
      name: "WG Küche",
      memberUids: ["alice"],
    });
    await db.doc("users/alice").set({ displayName: "Alice" });
    await db.doc("users/bob").set({ displayName: "Bob" });
  });
});

describe("firestore.rules", () => {
  it("allows a group member to read the group", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1")));
  });

  it("denies a non-member from reading the group", async () => {
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1")));
  });

  it("denies an unauthenticated read", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "groups/group1")));
  });

  it("denies any client write to a group, even by a member", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(alice, "groups/group1"), { name: "Hacked" }));
  });

  it("allows a user to read their own profile", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "users/alice")));
  });

  it("denies a user from reading another user's profile", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "users/bob")));
  });

  it("denies access to an unmatched collection via the deny-all backstop", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "somethingUnexpected/doc1")));
  });

  it("allows a group member to read an activity log entry", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/activityLog/log1")
        .set({ type: "expense_edited", actorUid: "alice", description: "Miete", createdAt: "now" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/activityLog/log1")));
  });

  it("denies a non-member from reading an activity log entry", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/activityLog/log1")
        .set({ type: "expense_edited", actorUid: "alice", description: "Miete", createdAt: "now" });
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1/activityLog/log1")));
  });

  it("denies a client write to an activity log entry, even by a member", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/activityLog/log1"), { type: "expense_edited" }),
    );
  });
});
