---
tags: [frontend, design, group-page, layout]
---

# Group Page

Route: `/groups/[groupId]` → `GroupDetailClient` (`src/components/groups/group-detail-client.tsx`).
Pieces: `balance-hero.tsx`, `activity-feed.tsx`, `balances-tab.tsx`, `games-tab.tsx`,
`group-settings-tab.tsx`, `chat-entry-card.tsx`, `tournament-banner.tsx`, and the generic
`src/components/ui/tabs.tsx`.

## Why it looks like this

It used to be ten sections of equal weight in one column: balance card, two buttons, chat,
tournament, **members** (a card per person, then "Gruppe löschen"), recurring rules, a
statistics card, the "vergambelt" leaderboard — and only then the expenses. With five
members the first expense sat at ~2,300px on a 390px-wide phone, almost three screens down,
and a destructive button sat in the middle of the page. The redesign orders the page by how
often each thing is needed:

```
header        ← back · icon · name · member stack ("5 Mitglieder · EUR" → Gruppe tab)
BalanceHero   where *you* stand, printed as a till receipt, with settle-up actions
banner        only while a tournament runs (time-critical, so above the tabs)
ChatEntryCard stays visible with the last message — the group uses chat regularly
tabs          Ausgaben (default) · Salden · Spiele · Gruppe   (sticky, pinned band)
action bar    "Ausgabe hinzufügen" + "Zahlung", sticky under the thumb
```

The chat card and a dedicated **Spiele** tab were the group's own call: asked what they use
besides expenses and balances, they picked chat and the games/leaderboard. Recurring rules
were not picked, so they live in the Gruppe tab.

## Tabs

| Tab          | Contents                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ausgaben** | Search (from 6 expenses on) · category chips with totals (filter _and_ spending breakdown, replaced the stats card and a `<select>`) · ledger grouped by month, each month one card with its total |
| **Salden**   | "Wer steht wo" diverging bars (everyone's net balance around a zero line) · "So werdet ihr quitt" (`simplifyDebts`, your transfers tinted) · "Bezahlt vs. Anteil" as a real `<table>` · PDF export |
| **Spiele**   | "Wer hat wie viel vergambelt?" podium (top 3) + list · "Bisher verschont" · last 5 game rounds with who lost                                                                                       |
| **Gruppe**   | Invite (native share sheet, copy fallback) · members (one card, rows) · recurring rules (actions in the ⋯ menu) · edit group · leave/delete, last and set apart                                    |

The active tab lives in `?tab=` (`expenses` is the default and drops the param). It's written
with `window.history.replaceState`, which Next integrates with `useSearchParams` — no server
round trip, and _replace_ rather than push, so Back doesn't walk through tab switches. Coming
back from the chat restores the tab you left. All four panels are `forceMount`ed and hidden
with `data-[state=inactive]:hidden`, so a typed search or picked filter survives a switch and
`animate-rise` replays on every reveal.

## Expense rows answer "what does this mean for me"

Each row is two independent lines: description + total, then "{payer} hat bezahlt" + your
side of it — "du bekommst 69,12 €" / "du schuldest 13,50 €" / "nicht dabei". That number is
`expenseImpactFor` (`src/lib/money/expense-impact.ts`): paid minus share, the same per-expense
term `computeBalances` sums, pinned by a test that the row impacts add up to the balance.
The day moved to the month header and the detail sheet — on a phone it only ever fit
truncated.

## The balance receipt

`BalanceHero` reuses the split games' receipt vocabulary (see [[Split Games]]): `.receipt-edges`
torn edges, cream paper via `.paper-tokens` in **both** themes (a receipt is an object, not a
surface), a mono eyebrow, the amount in Fraunces, and dotted leaders from name to amount like
item to price. Settled shows `InkStamp` "Quitt" — in success green (`ink` override), not the
group's ink, since a group's own color can be rose and red means debt here. It slams down
only if the group becomes square _while you watch_ (`animateIn`); opening an already-square
group shows it at rest.

`.paper-tokens` was extended with the light theme's status and control tokens (`--success`,
`--destructive`, `--secondary`, `--border`, `--input`, …): the dark theme's lifted greens and
reds drop to ~2:1 on cream, and its control surfaces would put dark buttons on light paper.

Each line carries its own actions — pay/GiroCode/record on "you owe", remind/show your
GiroCode on "owes you"; see [[Balances and Settlements]].

## Sticky gotchas (both learned the hard way)

- **No `overflow-hidden` on the page root.** It makes that box the scroll container and
  quietly disables every `position: sticky` inside it. The old root had it as a leftover from
  the blurred-blob backdrop; `AmbientBackdrop` is `fixed` now and needs no clipping.
- **Observe elements, not ref objects, for anything mounted after loading.** The pinned-state
  observer for the tab bar first took a `useRef` and ran its effect during the skeleton
  render, when the sentinel didn't exist — it never observed anything. It takes the element
  from a callback ref (`useState` setter) instead.

The action bar is `sticky`, not `fixed`: it keeps its own space at the end of the page, so
the last row is never trapped under it — no padding hack (see [[Mobile iOS Quirks]] for why
padding is the wrong tool). On touch devices it hides while a field on the page has focus
(`pointer-coarse:group-has-[input:focus]/page:hidden`): with Android's resizing keyboard it
would otherwise sit on top of half the remaining screen. On `md+` it becomes a floating dock.

## Related

[[Design System and Theming]] · [[Balances and Settlements]] · [[Split Games]] · [[Groups and Members]] · [[Mobile iOS Quirks]] · [[Routing Map]]
