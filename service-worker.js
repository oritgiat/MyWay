// service-worker.js
// מטמון בסיסי כדי ש-MyWay ייחשב PWA תקין ויעבוד גם ללא רשת (קבצים מקומיים בלבד).
const CACHE_NAME = "myway-cache-v13";

// קבצים מקומיים בלבד. קבצים חיצוניים (Google/Leaflet) נטענים מהרשת.
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/waze.svg"
];

// התקנה: שמירת קבצי הליבה במטמון
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// הפעלה: ניקוי מטמונים ישנים
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// שליפה: אסטרטגיית "רשת קודם, ואם נכשל - מטמון" עבור בקשות ניווט,
// ו"מטמון קודם" עבור נכסים מקומיים.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // בקשות שאינן GET לא ממטמנים
  if (request.method !== "GET") return;

  // בקשות ניווט (טעינת הדף) - נסה רשת, נפילה למטמון
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // שאר הבקשות - מטמון קודם, אחרת רשת
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
