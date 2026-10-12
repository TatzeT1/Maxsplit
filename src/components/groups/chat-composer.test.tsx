import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

// LocaleProvider refreshes the router on a language switch; nothing here does.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LocaleProvider } from "@/components/locale-provider";
import { ChatComposer } from "./chat-composer";

// The composer is shared by the chat screen and the chat under a match: typing,
// "@" suggestions, the reply being written and the reason sending is off.

const members = [
  { uid: "lea", displayName: "Lea" },
  { uid: "ben", displayName: "Ben" },
  { uid: "lena", displayName: "Lena Müller" },
];

function Harness({
  online = true,
  onSend = vi.fn(),
  reply = null,
  onCancelReply = vi.fn(),
}: {
  online?: boolean;
  onSend?: () => void;
  reply?: { name: string; text: string } | null;
  onCancelReply?: () => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <LocaleProvider initialLocale="de">
      <ChatComposer
        value={value}
        onChange={setValue}
        onSend={onSend}
        online={online}
        reply={reply}
        onCancelReply={onCancelReply}
        mentionCandidates={members}
        textareaRef={textareaRef}
      />
    </LocaleProvider>
  );
}

const textarea = () => screen.getByPlaceholderText("Nachricht schreiben …") as HTMLTextAreaElement;

describe("ChatComposer", () => {
  it("sends on Enter, but Shift+Enter makes a new line", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);
    await user.type(textarea(), "Hallo{Shift>}{Enter}{/Shift}Welt");
    expect(textarea().value).toBe("Hallo\nWelt");
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("keeps the send button off until there is text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Senden" })).toBeDisabled();
    await user.type(textarea(), "  ");
    expect(screen.getByRole("button", { name: "Senden" })).toBeDisabled();
    await user.type(textarea(), "Hi");
    expect(screen.getByRole("button", { name: "Senden" })).toBeEnabled();
  });

  it("offline: says why sending is off, and keeps what you typed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness online={false} />);
    expect(screen.getByText(/Du bist offline/)).toBeInTheDocument();
    await user.type(textarea(), "Hi");
    expect(screen.getByRole("button", { name: "Senden" })).toBeDisabled();
    expect(textarea().value).toBe("Hi");
    rerender(<Harness online={false} />);
    expect(textarea().value).toBe("Hi");
  });

  it("suggests members after an @ and inserts the picked one instead of sending", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);
    await user.type(textarea(), "Danke @Le");
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["@Lea", "@Lena Müller"]);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(textarea().value).toBe("Danke @Lena Müller ");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await user.keyboard("super{Enter}");
    expect(textarea().value).toBe("Danke @Lena Müller super");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("picks a suggestion by tapping it, and Escape closes the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(textarea(), "@B");
    await user.click(screen.getByRole("option", { name: "@Ben" }));
    expect(textarea().value).toBe("@Ben ");

    await user.type(textarea(), "@L");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("does not suggest anyone for an @ inside a word", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(textarea(), "mail an max@Le");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows the reply being written, with a way to drop it", async () => {
    const onCancelReply = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness reply={{ name: "Lea", text: "Wer kauft Milch?" }} onCancelReply={onCancelReply} />,
    );
    expect(screen.getByText("Antwort an Lea")).toBeInTheDocument();
    expect(screen.getByText("Wer kauft Milch?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Antwort abbrechen" }));
    expect(onCancelReply).toHaveBeenCalled();
  });
});
