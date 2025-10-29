const CACHE_NAME = 'hill-rd-setlist-manager-v5';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/performance/performance.html',
    '/performance/performance.js',
    '/performance/performance.css',
    '/assets/icons/icon-192x192.png',
    '/assets/icons/icon-512x512.png',
    '/assets/images/mylogo.png',
    'lib/mammoth.browser.min.js',
    'lib/idb.min.js',
    'lib/tesseract/tesseract.min.js',
    'lib/tesseract/worker.min.js',
    'lib/tesseract/tesseract-core.wasm',
    'lib/tesseract/tesseract-core-simd.wasm.js',
    'lib/tesseract/tesseract-core-simd.wasm',
    // Do NOT precache traineddata to avoid decompression/caching pitfalls
    // Prefer local Fuse build to avoid CDN + redirect issues
    'lib/fuse.js',
    // Editor assets
    '/editor/editor.html',
    '/editor/editor.js',
    '/editor/editor.css',
    '/editor/songs.js',
    '/editor/db.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            }).catch(err => { console.warn('Cache addAll failed', err); })
    );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

// Cache-first strategy with network fallback.
// For navigation (HTML) requests, ignore query string so cached pages work with ?params.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // only cache GET
  // Bypass cross-origin requests entirely to avoid redirect mode issues
  try {
    const u = new URL(req.url);
    if (u.origin !== self.location.origin) return;
  } catch {}

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const stripRedirect = async (response) => {
      try {
        if (!response || !response.redirected) return response;
        const body = await response.clone().blob();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) { return response; }
    };
    try {
      const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
      const urlObj = new URL(req.url);
      const isTrainedData = urlObj.pathname.endsWith('/lib/tesseract/eng.traineddata') || urlObj.pathname.endsWith('/lib/tesseract/eng.traineddata.gz');

      // Prefer cached HTML ignoring search so /performance/performance.html?x matches
      const cached = isTrainedData ? undefined : await caches.match(req, isHTML ? { ignoreSearch: true } : undefined);
      if (cached) return cached;

      let res;
      if (isHTML) {
        // SPA routing: for navigations to non-performance paths, serve /index.html
        if (!urlObj.pathname.startsWith('/performance/')) {
          const indexKey = new Request('/index.html');
          const cachedIndex = await caches.match(indexKey);
          if (cachedIndex) return cachedIndex;
          res = await fetch('/index.html', { redirect: 'follow' });
          res = await stripRedirect(res);
          if (res && res.status === 200) cache.put(indexKey, res.clone());
        } else {
          // For performance navigations, always serve the base document without query
          const perfKey = new Request('/performance/performance.html');
          const cachedPerf = await caches.match(perfKey);
          if (cachedPerf) return cachedPerf;
          res = await fetch('/performance/performance.html', { redirect: 'follow' });
          res = await stripRedirect(res);
          if (res && res.status === 200) cache.put(perfKey, res.clone());
        }
      } else {
        if (isTrainedData) {
          // Always fetch traineddata fresh; do not cache or transform
          res = await fetch(req.url, { redirect: 'follow', cache: 'no-store' });
          res = await stripRedirect(res);
        } else {
        // Ensure we don't return a redirected response to the page
        res = await fetch(new Request(req.url, { redirect: 'follow' }));
        res = await stripRedirect(res);
        }
      }

      // Cache same-origin successful responses
      if (!isTrainedData && res && res.status === 200 && req.url.startsWith(self.location.origin)) {
        const key = isHTML ? new Request(new URL(req.url).pathname) : req;
        cache.put(key, res.clone());
      }
      return res;
    } catch (err) {
      // Offline fallback for navigations
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
      throw err;
    }
  })());
});
