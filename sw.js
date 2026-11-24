const CACHE="crossfit-tools-v4";
const ASSETS=["./","./index.html","./manifest.webmanifest?v=4","./assets/icon-192.png?v=4","./assets/icon-512.png?v=4","./apple-touch-icon.png?v=4","./favicon-32.png?v=4","./favicon.ico?v=4"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,x));return r})))});
