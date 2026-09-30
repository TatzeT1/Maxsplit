"use client";

import { ChevronsRight, Crown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import {
  FATE_ICON,
  useFateLabelKeys,
  FATE_TEXT_CLASS,
} from "@/components/groups/split-game/tournament/tournament-fate";
import { layoutTree } from "@/lib/games/bracket-layout";
import { fateInMatch, type MatchFate } from "@/lib/games/tournament-status";
import { cn } from "@/lib/utils";
import type { GroupMember, Tournament, TournamentMatch } from "@/lib/types";

const CARD_WIDTH = 172;
const CARD_HEIGHT = 64;
const ROW_HEIGHT = 84;
const COLUMN_GAP = 40;
/** Breathing room inside the scroll area, so a card's ring, live dot and "Dein Match" tag never get clipped at its edges. */
const PAD = 8;

type Role = MatchFate | "champion";

function PlayerRow({
  uid,
  members,
  role,
  isYou,
}: {
  uid: string | null;
  members: Record<string, GroupMember>;
  /** How this slot reads once the match is done — undefined while it isn't. */
  role?: Role;
  isYou: boolean;
}) {
  const t = useT();
  const fateKeys = useFateLabelKeys();
  if (!uid) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-1 text-sm">
        <span className="border-border flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-xs">
          ?
        </span>
        <span className="truncate text-xs italic">{t("expenses.tournamentSlotOpen")}</span>
      </div>
    );
  }
  const name = members[uid]?.displayName ?? "?";
  const fate: MatchFate | undefined = role === "champion" ? "safe" : role;
  const FateIcon = fate ? FATE_ICON[fate] : null;
  return (
    <div className="flex min-w-0 items-center gap-2 py-1 text-sm">
      <GameAvatar
        name={name}
        className={cn("size-6 shrink-0 text-[10px]", fate === "pays" && "opacity-60 grayscale")}
      />
      <span
        className={cn(
          "min-w-0 truncate",
          isYou && "font-semibold",
          fate === "safe" && "text-success font-semibold",
          fate === "pays" && "text-destructive",
        )}
      >
        {name}
      </span>
      {isYou && (
        <span className="bg-primary/15 text-primary shrink-0 rounded px-1 text-[10px] leading-4 font-semibold">
          {t("expenses.tournamentYou")}
        </span>
      )}
      {fate && <span className="sr-only">— {t(fateKeys[fate])}</span>}
      {role === "champion" ? (
        <Crown aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-amber-400" />
      ) : fate === "pays" ? (
        <span className="bg-destructive/15 text-destructive ml-auto shrink-0 rounded px-1 text-[10px] leading-4 font-semibold">
          {t(fateKeys.pays)}
        </span>
      ) : (
        FateIcon && (
          <FateIcon
            aria-hidden="true"
            className={cn("ml-auto size-3.5 shrink-0", FATE_TEXT_CLASS[fate!])}
          />
        )
      )}
    </div>
  );
}

function MatchCard({
  match,
  members,
  advance,
  currentUid,
}: {
  match: TournamentMatch;
  members: Record<string, GroupMember>;
  advance: Tournament["advance"];
  currentUid?: string;
}) {
  const t = useT();
  const [a, b] = match.players;
  const isFinal = match.next === null;
  const isYours = !!currentUid && match.players.includes(currentUid);
  const isYourCurrent = isYours && match.status !== "done";

  function roleFor(uid: string | null): Role | undefined {
    if (!uid) return undefined;
    const fate = fateInMatch(advance, match, uid);
    if (fate === "safe" && advance === "winner" && isFinal) return "champion";
    return fate;
  }

  return (
    <div
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className={cn(
        "shadow-e1 ring-foreground/10 relative flex flex-col justify-center gap-0.5 rounded-xl px-2.5 ring-1 transition-shadow",
        isYourCurrent ? "bg-[color:color-mix(in_oklch,var(--card),var(--primary)_12%)]" : "bg-card",
        match.status === "ready" && "ring-primary ring-2",
        match.status === "playing" && "ring-primary/50 ring-2",
        match.status === "waiting" && "border-border border border-dashed shadow-none ring-0",
        isFinal && match.status === "done" && "ring-2 ring-amber-400/50",
      )}
    >
      {isYourCurrent && (
        <span className="bg-primary text-primary-foreground absolute -top-2 left-2 rounded-full px-1.5 text-[10px] leading-4 font-semibold shadow-sm">
          {t("expenses.tournamentYourMatchTag")}
        </span>
      )}
      {match.status === "playing" && (
        <span
          aria-hidden="true"
          title={t("expenses.tournamentLive")}
          className="bg-primary ring-card absolute -top-1 -right-1 size-2.5 animate-pulse rounded-full ring-2"
        />
      )}
      <PlayerRow uid={a} members={members} role={roleFor(a)} isYou={!!a && a === currentUid} />
      <div className="bg-border/60 h-px" />
      <PlayerRow uid={b} members={members} role={roleFor(b)} isYou={!!b && b === currentUid} />
    </div>
  );
}

/** What every mark on the bracket means — the first thing a first-time viewer needs and the one thing the tree alone can't say. */
export function BracketLegend({ className }: { className?: string }) {
  const t = useT();
  const fateKeys = useFateLabelKeys();
  const fates: MatchFate[] = ["safe", "advances", "pays"];
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px]",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="ring-primary size-3 rounded-[4px] ring-2" />
        {t("expenses.tournamentReady")}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="bg-primary size-2 animate-pulse rounded-full" />
        {t("expenses.tournamentLegendLive")}
      </span>
      {fates.map((fate) => {
        const Icon = FATE_ICON[fate];
        return (
          <span key={fate} className="flex items-center gap-1">
            <Icon aria-hidden="true" className={cn("size-3.5", FATE_TEXT_CLASS[fate])} />
            {t(fateKeys[fate])}
          </span>
        );
      })}
    </div>
  );
}

/** Tracks whether a horizontal scroller has more content hidden to either side. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 4;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    el.addEventListener("scroll", update, { passive: true });
    // Fires once right away on observe, which doubles as the initial measure.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  return [ref, edges] as const;
}

/**
 * Picks the match a tree's scroller should center on: the viewer's own
 * undecided match if they have one here, otherwise wherever play currently is
 * (the lowest-round ready or live match), otherwise — tree finished — its final.
 */
function focusMatchId(
  treeMatches: TournamentMatch[],
  finalMatchId: string,
  currentUid?: string,
): string {
  const own = currentUid
    ? treeMatches.find((m) => m.status !== "done" && m.players.includes(currentUid))
    : undefined;
  if (own) return own.id;
  const live = treeMatches
    .filter((m) => m.status === "ready" || m.status === "playing")
    .sort((x, y) => x.round - y.round)[0];
  return live?.id ?? finalMatchId;
}

function TreeBracket({
  tournament,
  treeIndex,
  members,
  currentUid,
}: {
  tournament: Tournament;
  treeIndex: number;
  members: Record<string, GroupMember>;
  currentUid?: string;
}) {
  const t = useT();
  const [scrollRef, edges] = useScrollEdges();
  const hasScrolledRef = useRef(false);

  const tree = tournament.trees[treeIndex];
  const treeMatches = Object.values(tournament.matches).filter((m) => m.treeIndex === treeIndex);
  const layout = layoutTree(treeMatches);
  const matchById = new Map(treeMatches.map((m) => [m.id, m]));
  const nodeByMatchId = new Map(layout.nodes.map((n) => [n.matchId, n]));

  const width = layout.maxRound * CARD_WIDTH + (layout.maxRound - 1) * COLUMN_GAP;
  const height = layout.rowCount * ROW_HEIGHT;
  const rounds = Array.from({ length: layout.maxRound }, (_, i) => i + 1);

  const xForRound = (round: number) => (round - 1) * (CARD_WIDTH + COLUMN_GAP);
  const yForRow = (row: number) => row * ROW_HEIGHT + ROW_HEIGHT / 2;

  const focusId = focusMatchId(treeMatches, tree.finalMatchId, currentUid);
  const focusRound = nodeByMatchId.get(focusId)?.round ?? 1;

  // Bring the viewer's own match (or wherever play is) into view — only when
  // that target actually changes, so a live update never yanks the bracket
  // away from wherever the viewer has scrolled it themselves.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = PAD + (focusRound - 1) * (CARD_WIDTH + COLUMN_GAP);
    const left = Math.max(0, x - (el.clientWidth - CARD_WIDTH) / 2);
    el.scrollTo({ left, behavior: hasScrolledRef.current ? "smooth" : "auto" });
    hasScrolledRef.current = true;
  }, [focusId, focusRound, scrollRef]);

  const fadeMask =
    edges.start && edges.end
      ? "linear-gradient(to right, transparent, #000 20px, #000 calc(100% - 36px), transparent)"
      : edges.end
        ? "linear-gradient(to right, #000 calc(100% - 36px), transparent)"
        : edges.start
          ? "linear-gradient(to right, transparent, #000 20px)"
          : undefined;

  const multipleTrees = tournament.trees.length > 1;
  // Kept mounted (just hidden) once the tree overflows at all, so scrolling to
  // the far end doesn't pull the header out and jump the bracket upward.
  const overflows = edges.start || edges.end;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {(multipleTrees || overflows) && (
        <div className="flex min-h-8 items-center justify-between gap-2">
          {multipleTrees ? (
            <span className="min-w-0 text-xs">
              <span className="font-semibold">
                {t("expenses.tournamentTreeLabel", { number: treeIndex + 1 })}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {tournament.advance === "loser"
                  ? t("expenses.tournamentTreeHintLoser")
                  : t("expenses.tournamentTreeHintWinner")}
              </span>
            </span>
          ) : (
            <span />
          )}
          {overflows && (
            <button
              type="button"
              tabIndex={edges.end ? undefined : -1}
              aria-hidden={edges.end ? undefined : true}
              onClick={() =>
                scrollRef.current?.scrollBy({
                  left: CARD_WIDTH + COLUMN_GAP,
                  behavior: "smooth",
                })
              }
              className={cn(
                "text-muted-foreground hover:text-foreground -mr-1 flex h-8 shrink-0 items-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-[color,opacity] duration-(--duration-fast)",
                !edges.end && "pointer-events-none opacity-0",
              )}
            >
              {t("expenses.tournamentSwipeHint")}
              <ChevronsRight aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        className="-mx-2 min-w-0 overflow-x-auto overscroll-x-contain"
        style={fadeMask ? { maskImage: fadeMask, WebkitMaskImage: fadeMask } : undefined}
      >
        <div style={{ width: width + PAD * 2, padding: PAD }} className="flex flex-col gap-2">
          <div className="flex" style={{ gap: COLUMN_GAP }}>
            {rounds.map((round) => (
              <span
                key={round}
                style={{ width: CARD_WIDTH }}
                className="text-muted-foreground shrink-0 text-center text-[11px] font-semibold tracking-[0.1em] uppercase"
              >
                {round === layout.maxRound
                  ? t("expenses.tournamentFinal")
                  : t("expenses.tournamentRound", { round })}
              </span>
            ))}
          </div>

          <div className="relative" style={{ width, height }}>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={width}
              height={height}
            >
              {layout.edges.map((edge) => {
                const from = nodeByMatchId.get(edge.fromMatchId)!;
                const to = nodeByMatchId.get(edge.toMatchId)!;
                const fromX = xForRound(from.round) + CARD_WIDTH;
                const fromY = yForRow(from.row);
                const toX = xForRound(to.round);
                const toY = yForRow(to.row);
                const midX = fromX + COLUMN_GAP / 2;
                const decided = matchById.get(edge.fromMatchId)?.status === "done";
                return (
                  <path
                    key={`${edge.fromMatchId}-${edge.toMatchId}`}
                    d={`M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={decided ? "text-primary/70" : "text-border"}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((node) => (
              <div
                key={node.matchId}
                className="absolute"
                style={{
                  left: xForRound(node.round),
                  top: yForRow(node.row) - CARD_HEIGHT / 2,
                }}
              >
                <MatchCard
                  match={matchById.get(node.matchId)!}
                  members={members}
                  advance={tournament.advance}
                  currentUid={currentUid}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The tournament tree, drawn as a real bracket: rounds left to right, each
 * match's card centered between the two matches feeding into it
 * (`lib/games/bracket-layout.ts`), connected by elbow lines whose color marks
 * a decided path. Multiple independent trees stack vertically, each labeled
 * with what its final decides. The viewer's own current match is tagged and
 * scrolled into view; a fade and a "swipe for more" hint mark a tree that's
 * wider than the screen.
 */
export function BracketView({
  tournament,
  members,
  currentUid,
}: {
  tournament: Tournament;
  members: Record<string, GroupMember>;
  currentUid?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {tournament.trees.map((tree, treeIndex) => (
        <TreeBracket
          key={tree.finalMatchId}
          tournament={tournament}
          treeIndex={treeIndex}
          members={members}
          currentUid={currentUid}
        />
      ))}
    </div>
  );
}
