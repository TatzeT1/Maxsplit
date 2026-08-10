import { NextResponse, type NextRequest } from "next/server";
import { materializeDueRecurringRules } from "@/lib/recurring/materialize";

/**
 * Triggered daily by Vercel Cron (see vercel.json) — not a user-facing
 * route. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`
 * when invoking cron jobs if that env var is set, so checking it here is
 * enough to keep this from being triggered by anyone else; there is no user
 * session involved, unlike every other write path in this app.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await materializeDueRecurringRules(today);
  return NextResponse.json(result);
}
