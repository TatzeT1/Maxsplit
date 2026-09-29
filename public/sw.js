// Split's service worker. Two jobs:
//
//  1. Offline start (view-only — brain: Features/Offline Mode): it keeps the
//     app's static files and the last copy of every page opened on this
//     device, so the installed app opens without a connection. The data on
//     those pages comes from Firestore's own cache (IndexedDB), not from here.
//  2. Push notifications (brain: Features/Push Notifications): it shows what
//     the server sends and opens the right page when one is tapped.
//
// Plain JS in public/, so its URL (/sw.js) stays the same across deploys — a
// service worker is identified by its script URL. Bump VERSION when the
// caching rules below or offline.html change: a device only reinstalls the
// worker (and re-saves offline.html) when this file's bytes change, and
// activate then drops every cache of an older version.

const VERSION = "v1";
const PAGES_CACHE = `split-pages-${VERSION}`;
const ASSETS_CACHE = `split-assets-${VERSION}`;
const OFFLINE_PAGE = "/offline.html";
/**
 * A page that takes longer than this comes from its last copy, if there is
 * one: Wi-Fi that's connected but goes nowhere shouldn't hold the app hostage.
 * Far above a normal load, cold server start included.
 */
const NAVIGATION_TIMEOUT_MS = 6000;
/** Build files pile up across deploys (their names change every build); past this many, the oldest go. */
const MAX_ASSETS = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = [PAGES_CACHE, ASSETS_CACHE];
      for (const name of await caches.keys()) {
        if (name.startsWith("split-") && !current.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Firestore, Firebase Auth, PayPal …: none of this worker's business.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // The API, and the public settlement PDF (made fresh on every request, for
    // people outside the group too) aren't pages to keep.
    const passThrough = url.pathname.startsWith("/api/") || url.pathname.startsWith("/share/");
    if (!passThrough) event.respondWith(navigate(event, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (["image", "font", "manifest"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // Everything else — RSC payloads, prefetches, Server Actions, the API — goes
  // to the network untouched. Offline, a failed RSC fetch makes Next fall
  // back to a full page load, which lands in navigate() below.
});

/**
 * Pages: the network first, so a signed-in page is always current; its last
 * copy when the network fails, or stalls while there is a copy to show. One
 * copy per path — `?tab=` is client state and the server renders the same
 * page either way.
 */
async function navigate(event, url) {
  const key = url.origin + url.pathname;
  // Registered synchronously: waitUntil can't be called once the response is
  // out, and a page that answers after the timeout should still be saved.
  let settle;
  event.waitUntil(new Promise((resolve) => (settle = resolve)));

  const network = fetch(event.request).then(
    (response) => {
      // Redirects (signed out, "/" → "/groups") and errors are never saved.
      if (response.ok && response.type === "basic" && !response.redirected) {
        const copy = response.clone();
        caches
          .open(PAGES_CACHE)
          .then((cache) => cache.put(key, copy))
          .catch(() => {})
          .finally(settle);
      } else {
        settle();
      }
      return response;
    },
    (error) => {
      settle();
      throw error;
    },
  );

  const fallback = await savedFallback(url, key);
  try {
    // With nothing saved to show instead, a slow page is simply waited for —
    // cutting it off would only swap it for offline.html.
    if (!fallback) return await network;
    return await Promise.race([
      network,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), NAVIGATION_TIMEOUT_MS),
      ),
    ]);
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    return fallback ?? (await cache.match(OFFLINE_PAGE)) ?? Response.error();
  }
}

/** What a page can fall back to: its own last copy — or, for "/", the saved group list. */
async function savedFallback(url, key) {
  const cache = await caches.open(PAGES_CACHE);
  // The installed app opens "/", which the server answers with a redirect to
  // /groups for anyone signed in — and redirects are never saved. A saved
  // /groups only exists while someone is signed in (sign-out clears these
  // caches), so it beats a landing page saved from before sign-in.
  if (url.pathname === "/" && (await cache.match(url.origin + "/groups"))) {
    return Response.redirect(new URL("/groups", url.origin).href, 302);
  }
  return cache.match(key);
}

/** Build files: their names change whenever their content does, so a saved one never goes stale. */
async function cacheFirst(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

/** Images, fonts and the manifest outside the build: answer from the copy, refresh it behind the scenes. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(ASSETS_CACHE);
  const saved = await cache.match(event.request);
  const refresh = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  });
  if (!saved) return refresh;
  event.waitUntil(refresh.catch(() => {}));
  return saved;
}

/** Drops the oldest entries past MAX_ASSETS (a cache lists its keys oldest first). */
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) {
    await cache.delete(key);
  }
}

// Push notifications. The server sends { title, body, url, tag } (see
// lib/push/deliver.ts), encrypted end to end — the push service in between
// can't read it.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // Every push must show something: Safari revokes the permission of a site
  // whose pushes stay silent.
  event.waitUntil(
    self.registration.showNotification(data.title || "Split", {
      body: data.body || "",
      icon: "/icon",
      // Same tag replaces the earlier notification quietly (a second "Du bist
      // dran" for the same match doesn't buzz again).
      tag: data.tag,
      data: { url: data.url || "/groups" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/groups", self.location.origin);
  // Only ever somewhere in this app.
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        const focused = await open.focus();
        try {
          await (focused ?? open).navigate(target.href);
          return;
        } catch {
          // Not controlled by this worker (yet): open a fresh window instead.
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
