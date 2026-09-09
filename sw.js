/* 过儿的工作台 Service Worker
   策略：
   - 同源静态资源（HTML/CSS/JS/图标）：网络优先，失败回退缓存（保证永远拿到最新版本，离线也能打开）
   - 跨域请求（腾讯行情/东方财富/代理等实时数据接口）：完全放行，不缓存（保证行情永远实时）
   - 版本升级时自动清理旧缓存并立即接管页面 */
const CACHE = 'guoer-wb-v127';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=guoer-wb-v127',
  './assets/css/style.css?v=guoer-wb-v127',
  './assets/js/store.js?v=guoer-wb-v127',
  './assets/js/ui.js?v=guoer-wb-v127',
  './assets/js/seed.js?v=guoer-wb-v127',
  './assets/js/market.js?v=guoer-wb-v127',
  './assets/js/news.js?v=guoer-wb-v127',
  './assets/js/snapshot.js?v=guoer-wb-v127',
  './assets/js/ai.js?v=guoer-wb-v127',
  './assets/js/views-market.js?v=guoer-wb-v127',
  './assets/js/views-market2.js?v=guoer-wb-v127',
  './assets/js/views-analysis.js?v=guoer-wb-v127',
  './assets/js/views-m2560.js?v=guoer-wb-v127',
  './assets/js/views-pickscreen.v105.js?v=guoer-wb-v127',
  './assets/js/views-life.js?v=guoer-wb-v127',
  './assets/js/views-summary.v1.js?v=guoer-wb-v127',
  './assets/js/crypto-gate.v127.js?v=guoer-wb-v127',
  './assets/js/app.js?v=guoer-wb-v127',
  './assets/icons/icon-192.png?v=guoer-wb-v127',
  './assets/icons/icon-512.png?v=guoer-wb-v127'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 只接管同源 GET 请求；行情/新闻等跨域实时接口一律直连网络，绝不缓存
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // 本机动态 API（/api/reports、/api/breadth 等）绝不缓存：
  // 本地服务未启动时必须真实失败，让前端显示"请启动 server.py"提示，
  // 而不是回退到旧缓存造成"列表有数据但删除/刷新全部失败"的假象
  if (url.pathname.startsWith('/api/')) return;
  const isNav = e.request.mode === 'navigate';
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        // 成功则写入缓存副本（键含完整 URL）
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: false })
        .then(hit => {
          if (hit) return hit;
          // 仅页面导航请求兜底到首页；JS/CSS 等资源失败必须如实报错，
          // 绝不能把 HTML 当 JS 返回（会导致脚本解析失败、页面白屏）
          if (isNav) return caches.match('./index.html');
          return Response.error();
        }))
  );
});
