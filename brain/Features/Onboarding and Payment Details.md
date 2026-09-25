---
tags: [feature, onboarding, payment]
---

# Onboarding and Payment Details

Onboarding: `src/lib/actions/onboarding.ts`, `src/components/onboarding/onboarding-flow.tsx`,
route `src/app/onboarding/page.tsx`. Payment details: `src/lib/actions/profile.ts`,
`src/lib/payment/{validate,paypal-me}.ts`, `payment-details-form.tsx`,
`payment-methods-guide.tsx`.

## Onboarding is a one-way flag, set by finish *or* skip

`completeOnboarding()` sets `users/{uid}.onboardingCompletedAt` to an ISO timestamp — and it's
called identically whether the user finished the guide or hit "Überspringen" (skip). Both
paths stop it from reappearing on future sign-ins; the field only distinguishes "seen it" from
"never seen it," not "completed" from "skipped." To make it reappear (support flow, testing),
an admin can clear it via `adminResetOnboarding` (see [[Admin Panel]]) — there's no user-facing
"replay" that resets this flag itself, though the profile page does link to replaying the
guide content without re-triggering the redirect flow.

## Payment details are for **display only**, no verification, no transfers

`updatePaymentDetails` (in `profile.ts`) lets a user set `paypalEmail`, `iban`, and/or
`paypalMeHandle` on their own `users/{uid}` doc. Nothing in this app ever moves money — these
fields exist purely so group members can see *how* to pay someone back after a settlement is
recorded (see `payment-methods-guide.tsx`). Each of the three fields is independently
optional; "leave empty to hide it" per the German copy in `de.ts`.

### Validation, `src/lib/payment/validate.ts`

- **IBAN**: format regex (`^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$`) **plus** the real ISO 7064
  mod-97-10 checksum every valid IBAN satisfies. This catches typos at entry time rather than
  letting a broken IBAN surface later as a failed bank transfer someone else attempts. `
  normalizeIban` strips whitespace and uppercases before either check.
- **PayPal.Me**: users can paste either a bare handle (`maxrobin`) or a full profile URL
  (`https://www.paypal.me/maxrobin/`, with or without scheme/`www.`/trailing slash).
  `normalizePaypalMeHandle` extracts just the handle from a pasted URL so the app always stores
  and works with the bare form internally (see `buildPaypalMeLink` in `paypal-me.ts` for how
  it's turned back into a link for display). Handles are case-sensitive on purpose — the regex
  doesn't touch case, only the URL-matching step is case-insensitive on the *domain*.
- **Email** (PayPal email): a permissive format check only — no delivery/ownership
  verification, consistent with "display only, no verification" above.

## Denormalization onto `GroupMember`

Once saved, `paypalEmail`/`iban`/`paypalMeHandle` are copied onto every `GroupMember` entry
the user currently holds (see [[Data Model]]) — so a group's member list can render payment
info without an extra `users/{uid}` read per member. This copy is **not the source of
truth**; `updatePaymentDetails` is the only writer, and it's responsible for keeping every
group's copy in sync when a user changes their details.

## Related
[[Data Model]] · [[Admin Panel]] · [[Balances and Settlements]] (what these details are ultimately used to display alongside)
