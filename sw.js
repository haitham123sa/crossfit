const CACHE="h-forge-v18";
const ASSETS=["./","./index.html","./firebase-config.js?v=14","./cloud.js?v=16","./wod-timer.js?v=18","./manifest.webmanifest?v=10","./assets/icon-192.png?v=4","./assets/icon-512.png?v=4","./apple-touch-icon.png?v=4","./favicon-32.png?v=4","./favicon.ico?v=4"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting()
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim()
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
      return response
    }).catch(async()=>await caches.match(request)||await caches.match("./index.html")));
    return
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
    return response
  })))
});
