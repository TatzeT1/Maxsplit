"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { adminResyncPaymentDetails } from "@/lib/actions/admin";

/**
 * Platform-wide repairs that don't belong to one group or user. Currently the
 * payment-details resync — see adminResyncPaymentDetails for why it exists.
 * Safe to run any number of times: it only writes entries that differ.
 */
export function AdminMaintenanceActions() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function handleResync() {
    setBusy(true);
    setResult(null);
    const outcome = await adminResyncPaymentDetails();
    setResult(
      outcome.ok
        ? {
            tone: "ok",
            text: `Checked ${outcome.data.users} users — ${outcome.data.groupsUpdated} group${
              outcome.data.groupsUpdated === 1 ? "" : "s"
            } updated.`,
          }
        : { tone: "error", text: "Resync failed." },
    );
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Maintenance</h2>
      <p className="text-muted-foreground text-xs">
        Copies every user&apos;s PayPal/IBAN/PayPal.Me details from their profile into each of their
        groups. Only entries that differ are written.
      </p>
      <div>
        <Button variant="outline" size="sm" disabled={busy} onClick={handleResync}>
          {busy ? "Resyncing…" : "Resync payment details"}
        </Button>
      </div>
      {result && (
        <p
          role="status"
          className={
            result.tone === "ok" ? "text-muted-foreground text-xs" : "text-destructive text-xs"
          }
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
