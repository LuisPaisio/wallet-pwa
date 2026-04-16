const CACHE_NAME = "wallet-cache-v5";
const urlsToCache = [
  "/", 
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Instalar service worker y cachear archivos locales
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activar y limpiar caches viejos
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Interceptar peticiones y servir desde cache si está disponible
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response; // devolver desde cache
      }
      return fetch(event.request).then(res => {
        // cachear dinámicamente recursos externos (ej. Chart.js)
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, res.clone());
          return res;
        });
      }).catch(() => {
        // Fallback: si no hay conexión y no está en cache
        if (event.request.destination === "document") {
          return caches.match("/index.html");
        }
      });
    })
  );
});
