/* RCRNIS service worker
   - ไฟล์หน้าเว็บ: ดึงจากเซิร์ฟเวอร์ก่อน (ได้เวอร์ชันล่าสุด) ใช้ไฟล์ในเครื่องเฉพาะตอนออฟไลน์
   - /api/*: ไม่แคชเลย ข้อมูลมาจากเซิร์ฟเวอร์เสมอ
   - แผนที่ (tile): แคชไว้จำนวนจำกัด ช่วยให้เปิดซ้ำเร็วขึ้นและพอดูได้ตอนสัญญาณอ่อน */
const VERSION = 'rcrnis-v10';
const STATIC = `${VERSION}-static`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 600;
const PRECACHE = [
  '/', '/app.js', '/report.js', '/style.css', '/manifest.webmanifest',
  '/vendor/leaflet.js', '/vendor/leaflet.css', '/vendor/xlsx.full.min.js',
  '/vendor/images/marker-icon.png', '/vendor/images/marker-icon-2x.png', '/vendor/images/marker-shadow.png',
  '/vendor/images/layers.png', '/vendor/images/layers-2x.png',
  '/fonts/THSarabunNew-Regular.woff2', '/fonts/THSarabunNew-Bold.woff2',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    // หน้าเว็บ (SPA) ทุก path ใช้หน้าแรก '/' (อย่าใช้ /index.html เพราะเซิร์ฟเวอร์ redirect มาที่ '/')
    const key = req.mode === 'navigate' ? '/' : req;
    // network-first: ได้เวอร์ชันล่าสุดเสมอเมื่อมีเน็ต ใช้ไฟล์ที่เก็บไว้เฉพาะตอนออฟไลน์
    e.respondWith(caches.open(STATIC).then(async (c) => {
      try {
        // คำขอเปิดหน้า (navigate) สร้างใหม่จาก URL เพราะใส่ option ให้คำขอแบบ navigate ไม่ได้
        const res = await fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' }));
        // ไม่เก็บคำตอบที่ถูก redirect: เบราว์เซอร์ไม่ยอมใช้กับการเปิดหน้า
        if (res.ok && !res.redirected) c.put(key, res.clone());
        return res;
      } catch {
        return (await c.match(key, { ignoreSearch: req.mode === 'navigate' })) || Response.error();
      }
    }));
    return;
  }

  if (/tile\.openstreetmap\.org|arcgisonline\.com/.test(url.host)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); }
      return res;
    }));
  }
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
