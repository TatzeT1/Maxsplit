// Split's service worker. Two jobs:
//
//  1. Offline start (view-only — brain: Features/Offline Mode): it keeps the
//     app's static files and the last copy of every page opened on this
//     device, so the installed app opens without a connection. The data on
//     those pages comes from Firestore's own cache (IndexedDB), not from here.
//     Most page changes never reach this worker as navigations — the app moves
//     between pages client-side — so the app also reports each page it shows
//     ("save-page", from components/service-worker-registration.tsx).
//  2. Push notifications (brain: Features/Push Notifications): it shows what
//     the server sends and opens the right page when one is tapped.
//
// Plain JS in public/, so its URL (/sw.js) stays the same across deploys — a
// service worker is identified by its script URL. Bump VERSION when the
// caching rules below or offline.html change: a device only reinstalls the
// worker (and re-saves offline.html) when this file's bytes change, and
// activate then drops every cache of an older version.

const VERSION = "v2";
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
/** A saved page younger than this isn't fetched again when the app shows it. */
const RESAVE_AFTER_MS = 10 * 60 * 1000;
/**
 * On every saved page: when it was saved. The browser stops this worker
 * between visits, so the copy itself has to remember.
 */
const SAVED_AT = "X-Split-Saved-At";

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
        // The app reports this page as soon as it shows it; that's no reason
        // to fetch it a second time.
        saving.add(key);
        caches
          .open(PAGES_CACHE)
          .then((cache) => cache.put(key, savedCopy(copy.body, copy.headers)))
          .catch(() => {})
          .finally(() => {
            saving.delete(key);
            settle();
          });
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

/** Pages that are never saved: the API, the public settlement PDF, and the fallback itself. */
function isSavablePage(url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/share/") &&
    url.pathname !== OFFLINE_PAGE
  );
}

/**
 * Pages being saved right now — by a page load, or because the app showed
 * them (a new worker taking over even hears about the page on screen twice).
 */
const saving = new Set();
/**
 * Bumped by "forget-pages" (sign-out): a save still in flight from before
 * must not put the previous person's page back into the emptied cache.
 */
let pagesGeneration = 0;

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "save-page" && typeof data.path === "string") {
    const url = new URL(data.path, self.location.origin);
    if (isSavablePage(url)) event.waitUntil(savePage(url).catch(() => {}));
  } else if (data?.type === "forget-pages") {
    pagesGeneration++;
    event.waitUntil(forgetPages());
  }
});

/**
 * Saves the page the app is showing — fetched afresh with the session cookie,
 * as a full page load would get it — plus the build files it needs, so it
 * opens offline even though this browser never loaded it as a whole page.
 */
async function savePage(url) {
  const key = url.origin + url.pathname;
  if (saving.has(key)) return;
  saving.add(key);
  try {
    const cache = await caches.open(PAGES_CACHE);
    const saved = await cache.match(key);
    if (saved && Date.now() - Number(saved.headers.get(SAVED_AT)) < RESAVE_AFTER_MS) return;

    const generation = pagesGeneration;
    // A redirect (signed out, "/" → "/groups") isn't followed: nothing to keep
    // there, and the app reports the page it lands on by itself.
    const response = await fetch(url.pathname, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    if (!response.ok || response.type !== "basic") return;
    const html = await response.text();
    if (generation !== pagesGeneration) return;
    await cache.put(key, savedCopy(html, { "Content-Type": "text/html; charset=utf-8" }));
    await saveBuildFiles(html);
  } finally {
    saving.delete(key);
  }
}

/** A page's copy for PAGES_CACHE, stamped with when it was saved. */
function savedCopy(body, headers) {
  const stamped = new Headers(headers);
  stamped.set(SAVED_AT, String(Date.now()));
  return new Response(body, { headers: stamped });
}

/** The /_next/static files a saved page refers to, so its scripts, styles and fonts load offline. */
async function saveBuildFiles(html) {
  const cache = await caches.open(ASSETS_CACHE);
  const paths = new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) ?? []);
  for (const path of [...paths].slice(0, 80)) {
    if (await cache.match(path)) continue;
    try {
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
    } catch {
      // One missing file only matters offline; the next save tries again.
    }
  }
  await trim(cache);
}

/** Empties the saved pages, keeping only the offline fallback. */
async function forgetPages() {
  const cache = await caches.open(PAGES_CACHE);
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname !== OFFLINE_PAGE) await cache.delete(request);
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
