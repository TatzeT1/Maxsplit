import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The Server Actions pull in firebase-admin; here they are only called on a tap.
const deleteMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/messages", () => ({ deleteMessage }));

import { LocaleProvider } from "@/components/locale-provider";
import type { PendingMessage } from "@/lib/chat/use-chat-sender";
import type { ChatMessage, GroupMember } from "@/lib/types";
import { MessageBubble, PendingBubble } from "./chat-message";

// What a message offers: a tap opens the actions, a link doesn't, reactions
// toggle, only your own can be deleted — and a message that didn't go out stays
// on screen with a way to send it again.

const member = (displayName: string): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder: false,
});
const members = { max: member("Max"), lea: member("Lea") };

const message: ChatMessage = {
  id: "m1",
  senderUid: "lea",
  text: "Rechnung: https://paypal.me/lea/12 bitte @Max",
  createdAt: "2026-10-07T10:00:00.000Z",
  mentions: ["max"],
};

function Bubble({
  msg = message,
  isOwn = false,
  online = true,
  reactions = {},
  onReact = vi.fn(),
  onReply = vi.fn(),
  onActionError = vi.fn(),
}: {
  msg?: ChatMessage;
  isOwn?: boolean;
  online?: boolean;
  reactions?: Record<string, string[]>;
  onReact?: (id: string, active: boolean) => void;
  onReply?: () => void;
  onActionError?: (message: string) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <LocaleProvider initialLocale="de">
      <MessageBubble
        message={msg}
        senderName={members[msg.senderUid as "max" | "lea"].displayName}
        isOwn={isOwn}
        showSender
        groupId="g1"
        members={members}
        currentUid="max"
        online={online}
        reactions={reactions}
        active={active}
        highlighted={false}
        onToggleActions={() => setActive((current) => !current)}
        onReact={onReact}
        onReply={onReply}
        onJump={vi.fn()}
        onActionError={onActionError}
      />
    </LocaleProvider>
  );
}

beforeEach(() => {
  deleteMessage.mockReset();
  // jsdom has no scrollIntoView; the actions bar calls it on open.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("MessageBubble", () => {
  it("renders links as links and real mentions highlighted", () => {
    render(<Bubble />);
    const link = screen.getByRole("link", { name: "https://paypal.me/lea/12" });
    expect(link).toHaveAttribute("href", "https://paypal.me/lea/12");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("@Max")).toBeInTheDocument();
  });

  it("opens the actions on a tap on the bubble, not on a tap on a link", async () => {
    const user = userEvent.setup();
    render(<Bubble />);
    await user.click(screen.getByRole("link"));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    await user.click(screen.getByText(/Rechnung/));
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    await user.click(screen.getByText(/Rechnung/));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("reacts, replies — and on someone else's message offers no delete", async () => {
    const onReact = vi.fn();
    const onReply = vi.fn();
    const user = userEvent.setup();
    render(<Bubble onReact={onReact} onReply={onReply} />);
    await user.click(screen.getByText(/Rechnung/));
    const toolbar = screen.getByRole("toolbar");
    expect(within(toolbar).queryByRole("button", { name: "Löschen" })).not.toBeInTheDocument();

    await user.click(within(toolbar).getByRole("button", { name: "Mit 👍 reagieren" }));
    expect(onReact).toHaveBeenCalledWith("up", true);
    await user.click(within(toolbar).getByRole("button", { name: "Antworten" }));
    expect(onReply).toHaveBeenCalled();
  });

  it("takes back my own reaction from the pill under the bubble", async () => {
    const onReact = vi.fn();
    const user = userEvent.setup();
    render(<Bubble reactions={{ up: ["max", "lea"], heart: ["lea"] }} onReact={onReact} />);
    const mine = screen.getByRole("button", { name: "👍 Max, Lea" });
    expect(mine).toHaveAttribute("aria-pressed", "true");
    expect(mine).toHaveTextContent("2");
    await user.click(mine);
    expect(onReact).toHaveBeenCalledWith("up", false);

    await user.click(screen.getByRole("button", { name: "❤️ Lea" }));
    expect(onReact).toHaveBeenLastCalledWith("heart", true);
  });

  it("offline, nothing that saves can be tapped", async () => {
    const user = userEvent.setup();
    render(
      <Bubble
        msg={{ ...message, senderUid: "max" }}
        isOwn
        online={false}
        reactions={{ up: ["lea"] }}
      />,
    );
    expect(screen.getByRole("button", { name: "👍 Lea" })).toBeDisabled();
    await user.click(screen.getByText(/Rechnung/));
    const toolbar = screen.getByRole("toolbar");
    expect(within(toolbar).getByRole("button", { name: "Löschen" })).toBeDisabled();
    expect(within(toolbar).getByRole("button", { name: "Mit 👍 reagieren" })).toBeDisabled();
    // Replying only writes into the composer, so it stays available.
    expect(within(toolbar).getByRole("button", { name: "Antworten" })).toBeEnabled();
  });

  it("deletes my own message after confirming, and reports a failure visibly", async () => {
    deleteMessage.mockResolvedValue({ ok: false, error: "not-owner" });
    const onActionError = vi.fn();
    const user = userEvent.setup();
    render(<Bubble msg={{ ...message, senderUid: "max" }} isOwn onActionError={onActionError} />);
    await user.click(screen.getByText(/Rechnung/));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Löschen" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Löschen" }),
    );
    expect(deleteMessage).toHaveBeenCalledWith({ groupId: "g1", messageId: "m1" });
    expect(onActionError).toHaveBeenCalledWith("Nachricht konnte nicht gelöscht werden.");
  });

  it("turns a request that never arrived into an error, not a stuck delete", async () => {
    deleteMessage.mockRejectedValue(new Error("offline"));
    const onActionError = vi.fn();
    const user = userEvent.setup();
    render(<Bubble msg={{ ...message, senderUid: "max" }} isOwn onActionError={onActionError} />);
    await user.click(screen.getByText(/Rechnung/));
    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Löschen" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Löschen" }),
    );
    expect(onActionError).toHaveBeenCalledWith("Nachricht konnte nicht gelöscht werden.");
  });

  it("shows the quote of a reply", () => {
    render(
      <Bubble
        msg={{
          ...message,
          replyTo: { id: "m0", senderUid: "max", text: "Wer kauft Milch?" },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Zur Nachricht springen" })).toHaveTextContent(
      "MaxWer kauft Milch?",
    );
  });

  it("renders an expense card with my share", () => {
    render(
      <Bubble
        msg={{
          id: "m2",
          senderUid: "lea",
          text: "Lea hat „Pizza“ eingetragen",
          createdAt: "2026-10-07T10:00:00.000Z",
          expenseCard: {
            expenseId: "e1",
            description: "Pizza",
            amountMinor: 3600,
            currency: "EUR",
            paidBy: { lea: 3600 },
            shares: { max: 1800, lea: 1800 },
          },
        }}
      />,
    );
    expect(screen.getByText("Pizza")).toBeInTheDocument();
    expect(screen.getByText("Bezahlt von Lea")).toBeInTheDocument();
    expect(screen.getByText(/Dein Anteil: 18,00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zu den Ausgaben/ })).toHaveAttribute(
      "href",
      "/groups/g1",
    );
  });
});

describe("PendingBubble", () => {
  const item: PendingMessage = {
    id: "c1",
    text: "Bin gleich da",
    createdAt: "2026-10-07T10:00:00.000Z",
    replyTo: null,
    status: "sending",
  };

  function renderPending(status: PendingMessage["status"], online = true) {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(
      <LocaleProvider initialLocale="de">
        <PendingBubble
          item={{ ...item, status }}
          members={members}
          online={online}
          onRetry={onRetry}
          onDiscard={onDiscard}
        />
      </LocaleProvider>,
    );
    return { onRetry, onDiscard };
  }

  it("says it is being sent", () => {
    renderPending("sending");
    expect(screen.getByText("Bin gleich da")).toBeInTheDocument();
    expect(screen.getByText("Wird gesendet …")).toBeInTheDocument();
  });

  it("keeps a failed message with a way to send it again or let it go", async () => {
    const user = userEvent.setup();
    const { onRetry, onDiscard } = renderPending("failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Nicht gesendet");
    await user.click(screen.getByRole("button", { name: "Erneut senden" }));
    expect(onRetry).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("offline, sending again waits for a connection", () => {
    renderPending("failed", false);
    expect(screen.getByRole("button", { name: "Erneut senden" })).toBeDisabled();
  });
});
