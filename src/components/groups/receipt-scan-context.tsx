"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * Whether this deployment has a vision model configured to read receipts
 * (GEMINI_API_KEY or OPENROUTER_API_KEY — server-only, so the group page's
 * Server Component reads it and provides it here). Off by default: without
 * a key the expense form offers only typing the items in.
 */
const ReceiptScanContext = createContext(false);

export function ReceiptScanProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <ReceiptScanContext value={enabled}>{children}</ReceiptScanContext>;
}

export function useReceiptScanEnabled(): boolean {
  return useContext(ReceiptScanContext);
}
