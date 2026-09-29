"use client";

import { useCallback, useState } from "react";

/**
 * Tracks, for each Firestore listener behind one screen, whether its latest
 * snapshot came from the cache or the server. `live` turns true once every
 * source has delivered server data, and false again the moment one falls back
 * to the cache (offline). Listeners must subscribe with
 * `{ includeMetadataChanges: true }` — without it, that switch alone never
 * produces a snapshot.
 */
export function useLiveSources<Source extends string>(
  sources: readonly Source[],
): {
  live: boolean;
  /** Whether this source has delivered anything yet — cached or live. */
  received: (source: Source) => boolean;
  report: (source: Source, snapshot: { metadata: { fromCache: boolean } }) => void;
} {
  const [fromCache, setFromCache] = useState<Partial<Record<Source, boolean>>>({});

  const report = useCallback((source: Source, snapshot: { metadata: { fromCache: boolean } }) => {
    const cached = snapshot.metadata.fromCache;
    setFromCache((previous) =>
      previous[source] === cached ? previous : { ...previous, [source]: cached },
    );
  }, []);

  return {
    live: sources.every((source) => fromCache[source] === false),
    received: (source) => fromCache[source] !== undefined,
    report,
  };
}
