// What a chat message's plain text turns into: tappable links and @mentions.
// Pure and shared — the server works out who was mentioned from it, the chat
// renders the same ranges highlighted.

export type RichToken =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string }
  | { type: "mention"; value: string };

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** "(see https://x.com/a)." → the link without the closing ")" and "." that belong to the sentence. */
function trimUrl(raw: string): string {
  let end = raw.length;
  while (end > 0) {
    const char = raw[end - 1];
    const head = raw.slice(0, end);
    if (".,;:!?".includes(char)) end--;
    else if (char === ")" && count(head, ")") > count(head, "(")) end--;
    else break;
  }
  return raw.slice(0, end);
}

/** Only http(s) ever becomes a link — never `javascript:` or the like. */
function linkHref(url: string): string | null {
  const href = /^www\./i.test(url) ? `https://${url}` : url;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;
    return href;
  } catch {
    return null;
  }
}

export interface MentionRange {
  start: number;
  /** Exclusive; covers the "@". */
  end: number;
  /** The name as written in `names`, not as typed. */
  name: string;
}

/**
 * Every "@Name" in `text` that names one of `names` (case-insensitive, whole
 * word — "@Max" never matches inside "@Maxine"; the longest name wins, so
 * "@Max Mustermann" is one mention, not two).
 */
export function findMentionRanges(text: string, names: readonly string[]): MentionRange[] {
  const candidates = [...new Set(names.filter((name) => name.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  const ranges: MentionRange[] = [];
  let at = text.indexOf("@");
  while (at !== -1) {
    const before = at > 0 ? text[at - 1] : "";
    if (!before || !LETTER_OR_DIGIT.test(before)) {
      for (const name of candidates) {
        const end = at + 1 + name.length;
        const next = end < text.length ? text[end] : "";
        if (
          text.slice(at + 1, end).toLowerCase() === name.toLowerCase() &&
          (!next || !LETTER_OR_DIGIT.test(next))
        ) {
          ranges.push({ start: at, end, name });
          at = end - 1;
          break;
        }
      }
    }
    at = text.indexOf("@", at + 1);
  }
  return ranges;
}

/** Who a message names: the members whose display name follows an "@". */
export function findMentionedUids(
  text: string,
  members: readonly { uid: string; displayName: string }[],
): string[] {
  const ranges = findMentionRanges(
    text,
    members.map((member) => member.displayName),
  );
  const named = new Set(ranges.map((range) => range.name.toLowerCase()));
  return members
    .filter((member) => named.has(member.displayName.toLowerCase()))
    .map((member) => member.uid);
}

function splitMentions(text: string, names: readonly string[]): RichToken[] {
  if (!text) return [];
  const tokens: RichToken[] = [];
  let last = 0;
  for (const range of findMentionRanges(text, names)) {
    if (range.start > last) tokens.push({ type: "text", value: text.slice(last, range.start) });
    tokens.push({ type: "mention", value: text.slice(range.start, range.end) });
    last = range.end;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

/** Splits a message into plain text, links and mentions of `mentionNames`. */
export function tokenizeMessage(text: string, mentionNames: readonly string[] = []): RichToken[] {
  const tokens: RichToken[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    const href = linkHref(url);
    if (!href) continue;
    tokens.push(...splitMentions(text.slice(last, match.index), mentionNames));
    tokens.push({ type: "link", value: url, href });
    last = match.index + url.length;
  }
  tokens.push(...splitMentions(text.slice(last), mentionNames));
  return tokens;
}

/**
 * The "@…" being typed right at the caret — `start` is where its "@" sits,
 * `query` what follows it so far. Null when the caret isn't in one (an "@"
 * inside a word, like an email address, doesn't count).
 */
export function findMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(?:^|[^\p{L}\p{N}])@([^\s@]*)$/u.exec(before);
  if (!match) return null;
  return { start: before.length - match[1].length - 1, query: match[1] };
}

/** One line of at most `max` characters, "…" at the cut — for quotes and previews. */
export function shortenText(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
