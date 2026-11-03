/* Usha service worker. The build fills in the version and the file list.
   A new version installs quietly in the background and takes over only when
   the user accepts the update or reopens the app. */
const VERSION = '__VERSION__';
const NOTES = __NOTES__;
const CACHE = 'usha-__VERSION__-__BUILD__';
const ASSETS = __ASSETS__;

self.addEventListener('install', event => {
  /* All files must download, or the update fails and the current version stays. */
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('usha-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'APPLY_UPDATE') self.skipWaiting();
  if (data.type === 'GET_INFO' && event.ports[0]) event.ports[0].postMessage({ version: VERSION, notes: NOTES });
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(cache =>
    cache.match(request.mode === 'navigate' ? './' : request, { ignoreSearch: true }).then(hit => hit || fetch(request))
  ));
});
