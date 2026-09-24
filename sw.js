/**
 * Service Worker — คลังยา PWA
 * - แคชไฟล์หลักให้เปิดออฟไลน์ได้ (ข้อมูลอยู่ใน localStorage อยู่แล้ว)
 * - ไม่แคช Google Sheets / GAS / ฟอนต์ภายนอกแบบ network-only ที่จำเป็น
 */
var CACHE_NAME = 'pharma-shell-v108';
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './css/styles.css?v=108',
  './js/db.js?v=105',
  './js/remote.js?v=107',
  './js/api.js?v=107',
  './js/options.js?v=105',
  './js/thdate.js?v=105',
  './js/app.js?v=108',
  './js/auth.js?v=105',
  './js/pwa.js?v=1'
];

function sameOrigin_(url) {
  try {
    return new URL(url, self.location.href).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function shouldBypass_(url) {
  var u = String(url || '');
  if (/script\.google\.com/i.test(u)) return true;
  if (/googleapis\.com|gstatic\.com/i.test(u)) return true;
  if (/\/macros\/s\//i.test(u)) return true;
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () { /* ข้ามไฟล์ที่ยังไม่มี */ });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (shouldBypass_(req.url)) return;

  var accept = req.headers.get('accept') || '';
  var isNav = req.mode === 'navigate' || accept.indexOf('text/html') >= 0;

  if (isNav) {
    event.respondWith(networkFirst_(req));
    return;
  }

  if (!sameOrigin_(req.url)) return;

  event.respondWith(staleWhileRevalidate_(req));
});

function networkFirst_(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || caches.match('./index.html');
    });
  });
}

function staleWhileRevalidate_(req) {
  return caches.match(req).then(function (cached) {
    var fetching = fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return cached; });
    return cached || fetching;
  });
}
