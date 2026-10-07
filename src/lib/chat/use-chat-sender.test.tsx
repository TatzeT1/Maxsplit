import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Server Action pulls in firebase-admin; the hook only calls it.
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/messages", () => ({ sendMessage }));

import type { ChatMessage } from "@/lib/types";
import { useChatSender } from "./use-chat-sender";

// A message shows at once, and stays visible — marked — if it didn't go out.

const delivered = (id: string): ChatMessage => ({
  id,
  senderUid: "max",
  text: "x",
  createdAt: "2026-10-07T10:00:00.000Z",
});

beforeEach(() => sendMessage.mockReset());

describe("useChatSender", () => {
  it("shows the message while sending, then drops it once the listener delivers it", async () => {
    sendMessage.mockResolvedValue({ ok: true, data: { messageId: "?" } });
    const { result, rerender } = renderHook(
      ({ messages }: { messages: ChatMessage[] }) => useChatSender("g1", messages),
      { initialProps: { messages: [] as ChatMessage[] } },
    );
    act(() => result.current.send("Hallo", null));
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0]).toMatchObject({ text: "Hallo", status: "sending" });

    await waitFor(() => expect(result.current.pending[0].status).toBe("sent"));
    const { id } = result.current.pending[0];
    expect(sendMessage).toHaveBeenCalledWith({ groupId: "g1", text: "Hallo", clientId: id });

    rerender({ messages: [delivered(id)] });
    expect(result.current.pending).toHaveLength(0);
  });

  it("sends the quoted message's id along with a reply", async () => {
    sendMessage.mockResolvedValue({ ok: true, data: { messageId: "?" } });
    const { result } = renderHook(() => useChatSender("g1", []));
    act(() =>
      result.current.send("Okay", { id: "m0", senderUid: "lea", text: "Wer kauft Milch?" }),
    );
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][0]).toMatchObject({ replyToId: "m0" });
  });

  it("keeps a failed send, and sending it again reuses its id so it can't double-post", async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: "network" });
    const { result } = renderHook(() => useChatSender("g1", []));
    act(() => result.current.send("Hallo", null));
    await waitFor(() => expect(result.current.pending[0].status).toBe("failed"));
    const { id } = result.current.pending[0];

    sendMessage.mockResolvedValueOnce({ ok: true, data: { messageId: id } });
    act(() => result.current.retry(id));
    expect(result.current.pending[0].status).toBe("sending");
    await waitFor(() => expect(result.current.pending[0].status).toBe("sent"));
    expect(sendMessage.mock.calls.map((call) => call[0].clientId)).toEqual([id, id]);
  });

  it("turns a thrown request into a failed message, not a stuck one", async () => {
    sendMessage.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useChatSender("g1", []));
    act(() => result.current.send("Hallo", null));
    await waitFor(() => expect(result.current.pending[0].status).toBe("failed"));
  });

  it("lets a failed message go", async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: "network" });
    const { result } = renderHook(() => useChatSender("g1", []));
    act(() => result.current.send("Hallo", null));
    await waitFor(() => expect(result.current.pending[0].status).toBe("failed"));
    act(() => result.current.discard(result.current.pending[0].id));
    expect(result.current.pending).toHaveLength(0);
  });

  it("does not show a message twice when the server wrote it but the answer was lost", async () => {
    sendMessage.mockRejectedValueOnce(new Error("answer lost"));
    const { result, rerender } = renderHook(
      ({ messages }: { messages: ChatMessage[] }) => useChatSender("g1", messages),
      { initialProps: { messages: [] as ChatMessage[] } },
    );
    act(() => result.current.send("Hallo", null));
    await waitFor(() => expect(result.current.pending[0].status).toBe("failed"));
    rerender({ messages: [delivered(result.current.pending[0].id)] });
    expect(result.current.pending).toHaveLength(0);
  });
});
