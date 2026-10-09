import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("firebase/firestore", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/actions/messages", () => ({
  deleteMessage: vi.fn(),
  markChatRead: vi.fn(),
  sendMessage: vi.fn(),
}));

import { LocaleProvider } from "@/components/locale-provider";
import { estimateDistance } from "@/lib/games/estimate-input";
import type { ChatGameResult, ChatMessage } from "@/lib/types";
import { MessageBubble } from "./chat-client";
import { MEMBERS, RATIO_QUESTION } from "./split-game/estimate/estimate-test-data";

function bubble(message: Partial<ChatMessage>) {
  return render(
    <LocaleProvider initialLocale="de">
      <MessageBubble
        message={{
          id: "m1",
          senderUid: "lea",
          text: "Lea lädt euch zu Schätzfragen ein.",
          createdAt: "2026-05-01T10:00:00.000Z",
          ...message,
        }}
        senderName="Lea"
        isOwn={false}
        showSender
        groupId="g1"
        members={MEMBERS}
        onDeleteError={vi.fn()}
      />
    </LocaleProvider>,
  );
}

const TRUTH = 2_962_000;

const estimateResult: ChatGameResult = {
  gameId: "estimate",
  loserUids: ["lea"],
  winnerUid: null,
  amount: { description: "Pizza", amountMinor: 3000, currency: "EUR" },
  attempt: 1,
  tournamentId: null,
  roundId: "round1",
  estimate: {
    resolvedBy: "distance",
    lines: [
      {
        text: RATIO_QUESTION.text,
        unit: RATIO_QUESTION.unit,
        scale: "ratio",
        format: "quantity",
        truthMilli: TRUTH,
        payers: [
          {
            uid: "lea",
            name: "Lea",
            guessMilli: 1_200_000,
            distance: estimateDistance("ratio", 1_200_000, TRUTH),
            byLot: false,
          },
        ],
      },
    ],
  },
};

describe("chat bubbles of the estimate game", () => {
  it("renders the invitation as a join card to the estimate page, not to /rounds/", () => {
    bubble({ estimateInvite: { roundId: "round1" } });
    expect(screen.getByText("Schätzfragen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mitspielen" })).toHaveAttribute(
      "href",
      "/groups/g1/estimate/round1",
    );
  });

  it("links the result card to the estimate page and prints the lines under the sentence", () => {
    bubble({ gameResult: estimateResult, text: "Lea zahlt." });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/groups/g1/estimate/round1");
    expect(screen.getByText(/richtig: 2\.962\sm/)).toBeInTheDocument();
    expect(screen.getByText(/Lea: 1\.200\sm \(Faktor/)).toBeInTheDocument();
  });

  it("keeps a scratch card on /rounds/ and prints no lines", () => {
    bubble({
      gameResult: { ...estimateResult, gameId: "scratch", estimate: undefined, roundId: "luck1" },
    });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/groups/g1/rounds/luck1");
    expect(document.querySelector('[data-slot="estimate-chat-lines"]')).toBeNull();
  });

  it("leads a result without a round to the stats", () => {
    bubble({ gameResult: { ...estimateResult, roundId: null, estimate: undefined } });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/groups/g1?tab=games");
  });
});
