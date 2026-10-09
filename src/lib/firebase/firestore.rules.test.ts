import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

  it("denies a banned member from reading their own group", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/alice").set({ displayName: "Alice", banned: true });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1")));
  });

  it("still allows a banned user to read their own profile", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/alice").set({ displayName: "Alice", banned: true });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "users/alice")));
  });

  it("allows a group member to read a chat message", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/messages/msg1")
        .set({ senderUid: "alice", text: "Hi", createdAt: "now" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/messages/msg1")));
  });

  it("denies a non-member from reading a chat message", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/messages/msg1")
        .set({ senderUid: "alice", text: "Hi", createdAt: "now" });
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1/messages/msg1")));
  });

  it("denies a client write to a chat message, even by a member", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/messages/msg1"), { senderUid: "alice", text: "Hi" }),
    );
  });

  it("allows a member to read their own chat read receipt", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("groups/group1/chatReads/alice").set({ lastReadAt: "now" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/chatReads/alice")));
  });

  it("denies a member from reading another member's chat read receipt", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1")
        .update({ memberUids: ["alice", "bob"] });
      await context.firestore().doc("groups/group1/chatReads/alice").set({ lastReadAt: "now" });
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1/chatReads/alice")));
  });

  it("denies a non-member from reading their own chat read receipt", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("groups/group1/chatReads/bob").set({ lastReadAt: "now" });
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1/chatReads/bob")));
  });

  it("allows a group member to read a tournament", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1")
        .set({ gameId: "connectfour", status: "running" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/tournaments/t1")));
  });

  it("denies a non-member from reading a tournament", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1")
        .set({ gameId: "connectfour", status: "running" });
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1/tournaments/t1")));
  });

  it("denies a banned member from reading a tournament", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/alice").set({ displayName: "Alice", banned: true });
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1")
        .set({ gameId: "connectfour", status: "running" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/tournaments/t1")));
  });

  it("denies a client write to a tournament, even by a member", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/tournaments/t1"), { gameId: "connectfour" }),
    );
  });
  it("allows a member to watch an online match's live board", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1/liveMatches/m1")
        .set({ gameId: "tictactoe", version: 0 });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/tournaments/t1/liveMatches/m1")));
  });

  it("denies a non-member from reading a live board", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1/liveMatches/m1")
        .set({ gameId: "tictactoe", version: 0 });
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "groups/group1/tournaments/t1/liveMatches/m1")));
  });

  it("denies a client move written straight to a live board", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/tournaments/t1/liveMatches/m1"), { version: 1 }),
    );
  });

  it("denies even a member from reading the hidden memory deck", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1/liveSecrets/m1")
        .set({ faces: ["🍕", "🍕"] });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/tournaments/t1/liveSecrets/m1")));
  });

  it("denies everyone, the owner included, access to push subscriptions", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("pushSubscriptions/sub1")
        .set({ uid: "alice", endpoint: "https://fcm.googleapis.com/fcm/send/abc" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "pushSubscriptions/sub1")));
    await assertFails(
      setDoc(doc(alice, "pushSubscriptions/sub2"), {
        uid: "alice",
        endpoint: "https://fcm.googleapis.com/fcm/send/def",
      }),
    );
  });

  it("allows a member to watch an online luck round, and nobody else", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/luckRounds/r1")
        .set({ gameId: "scratch", status: "running", revealed: {} });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/luckRounds/r1")));
    await assertFails(getDoc(doc(bob, "groups/group1/luckRounds/r1")));
  });

  it("denies a member scratching a card by writing to the round", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/luckRounds/r1"), { revealed: { alice: false } }),
    );
  });

  it("denies a member reading or resetting the nudge rate limit", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1/nudges/m1")
        .set({ at: "2026-10-03T12:00:00.000Z", byUid: "alice" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/tournaments/t1/nudges/m1")));
    await assertFails(setDoc(doc(alice, "groups/group1/tournaments/t1/nudges/m1"), { at: "x" }));
  });

  it("denies a member from reading or faking game presence", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/tournaments/t1/presence/alice")
        .set({ at: "2026-09-29T12:00:00.000Z" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/tournaments/t1/presence/alice")));
    await assertFails(
      setDoc(doc(alice, "groups/group1/tournaments/t1/presence/alice"), {
        at: "2026-09-29T12:00:00.000Z",
      }),
    );
  });

  // Estimate rounds (ADR-007): the round document is member-readable, its
  // secrets (the truth, the hidden guesses) and the seen set are server-only.

  it("allows a member to watch an estimate round, and nobody else", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1")
        .set({ gameId: "estimate", status: "running", stages: [] });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(alice, "groups/group1/estimateRounds/r1")));
    await assertFails(getDoc(doc(bob, "groups/group1/estimateRounds/r1")));
    await assertFails(getDoc(doc(anon, "groups/group1/estimateRounds/r1")));
  });

  it("denies a banned member from reading an estimate round", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/alice").set({ displayName: "Alice", banned: true });
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1")
        .set({ gameId: "estimate", status: "running", stages: [] });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/estimateRounds/r1")));
  });

  it("denies a member writing an estimate round", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1")
        .set({ gameId: "estimate", status: "running", stages: [{ index: 0 }] });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/estimateRounds/r1"), { gameId: "estimate", stages: [] }),
    );
    await assertFails(
      setDoc(doc(alice, "groups/group1/estimateRounds/r2"), { gameId: "estimate", stages: [] }),
    );
    await assertFails(updateDoc(doc(alice, "groups/group1/estimateRounds/r1"), { stages: [] }));
    await assertFails(deleteDoc(doc(alice, "groups/group1/estimateRounds/r1")));
  });

  it("denies even a member reading the secrets of a stage", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1/secrets/0")
        .set({ question: { value: "2962" }, guesses: {} });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/estimateRounds/r1/secrets/0")));
  });

  it("denies listing the secrets of a round", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1/secrets/0")
        .set({ question: { value: "2962" }, guesses: {} });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDocs(collection(alice, "groups/group1/estimateRounds/r1/secrets")));
  });

  it("denies a collection-group read of secrets", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1/secrets/0")
        .set({ question: { value: "2962" }, guesses: {} });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDocs(collectionGroup(alice, "secrets")));
  });

  it("denies a member writing a secret", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateRounds/r1/secrets/0")
        .set({ question: { value: "2962" }, guesses: {} });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "groups/group1/estimateRounds/r1/secrets/0"), {
        guesses: { alice: { milli: 1 } },
      }),
    );
  });

  it("denies a member reading or writing the seen set", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1/estimateState/seen")
        .set({ ids: ["est-tst-0001"], resets: 0, recent: {} });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "groups/group1/estimateState/seen")));
    await assertFails(setDoc(doc(alice, "groups/group1/estimateState/seen"), { ids: [] }));
  });

  it("lets a member read the estimate pointer on the group document", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc("groups/group1")
        .update({ activeEstimateRound: { id: "r1" } });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const snap = await assertSucceeds(getDoc(doc(alice, "groups/group1")));
    expect(snap.data()?.memberUids).toEqual(["alice"]);
    expect(snap.data()?.activeEstimateRound).toEqual({ id: "r1" });
  });
});
