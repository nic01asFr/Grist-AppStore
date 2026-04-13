const CACHE = 'scoutia-app-v1';
const ASSETS = ['./', './index.html', '../icons/icon-192.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  // Ne pas intercepter les appels API (LLM, Grist)
  const url = e.request.url;
  if (url.includes('/api/') || url.includes('llm.lab.sspcloud') || url.includes('grist')) return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)).catch(() => caches.match('./index.html')));
});
