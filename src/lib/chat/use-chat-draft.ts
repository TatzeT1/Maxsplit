"use client";

import { useCallback, useState } from "react";

const keyFor = (groupId: string) => `split:chat-draft:${groupId}`;

function readDraft(groupId: string): string {
  try {
    return window.localStorage.getItem(keyFor(groupId)) ?? "";
  } catch {
    return "";
  }
}

/**
 * The composer's text, kept per group in this browser so what you were typing
 * survives leaving the chat (or the phone killing the tab). A convenience
 * only: storage can be blocked or empty, and then the draft is simply gone.
 *
 * Read in the initializer, not an effect — the chat renders its composer only
 * after client-only data has loaded, so there is no server markup to disagree
 * with.
 */
export function useChatDraft(groupId: string): [string, (text: string) => void] {
  const [text, setTextState] = useState(() =>
    typeof window === "undefined" ? "" : readDraft(groupId),
  );

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      try {
        if (next) window.localStorage.setItem(keyFor(groupId), next);
        else window.localStorage.removeItem(keyFor(groupId));
      } catch {
        // No storage: the draft just lives as long as the page.
      }
    },
    [groupId],
  );

  return [text, setText];
}
