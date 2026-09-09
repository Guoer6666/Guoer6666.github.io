/* 过儿的工作台 · 数据访问密码门（crypto-gate.js）
 * 设计原则：
 *  - 口令【绝不】写入本文件/仓库，只由用户登录框输入，驻留内存。
 *  - 与 encrypt_reports.py 格式对齐：密文文件 = salt(16) + iv(12) + ciphertext(含GCM tag)。
 *  - 密钥 = PBKDF2(口令, salt, SHA-256, 100000) -> 32B；AES-GCM 256 解密。
 *  - 零侵入：monkey-patch window.fetch，app.js 与各视图一行不改。
 *  - 时序：app.js 初次 fetch 在口令未输入时进入 pending 队列，用户输入后统一重放。
 */
(function () {
  'use strict';
  var REPORTS = '/api/reports/';
  var PROBE = '/api/reports/verify_ledger.json.enc';
  var GATE_KEY = null;
  var pending = [];
  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  // ---- 注入样式 + 登录遮罩 ----
  var css = [
    '#wbGateMask{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;',
    'justify-content:center;background:rgba(18,18,28,.92);font-family:-apple-system,',
    'Segoe UI,Roboto,sans-serif;backdrop-filter:blur(6px);}',
    '#wbGateCard{width:320px;max-width:86vw;background:#fff;border-radius:16px;padding:26px 22px;',
    'box-shadow:0 16px 48px rgba(0,0,0,.35);text-align:center;}',
    '#wbGateCard h2{margin:0 0 6px;font-size:18px;color:#222;}',
    '#wbGateCard p{margin:0 0 16px;font-size:13px;color:#888;line-height:1.5;}',
    '#wbGateInput{width:100%;box-sizing:border-box;padding:11px 12px;font-size:15px;border:1px solid #ddd;',
    'border-radius:9px;outline:none;margin-bottom:12px;}',
    '#wbGateInput:focus{border-color:#ff7fa6;}',
    '#wbGateBtn{width:100%;padding:11px 0;font-size:15px;color:#fff;background:#ff7fa6;border:none;',
    'border-radius:9px;cursor:pointer;font-weight:600;}',
    '#wbGateBtn:active{background:#ec6b94;}',
    '#wbGateErr{color:#e23b3b;font-size:12px;min-height:16px;margin-top:8px;}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var mask = document.createElement('div');
  mask.id = 'wbGateMask';
  mask.innerHTML =
    '<div id="wbGateCard">' +
      '<h2>过儿的工作台</h2>' +
      '<p>数据已加密，请输入访问口令</p>' +
      '<input id="wbGateInput" type="password" placeholder="访问口令" autocomplete="off" />' +
      '<button id="wbGateBtn">进入</button>' +
      '<div id="wbGateErr"></div>' +
    '</div>';
  document.body.appendChild(mask);

  var input = mask.querySelector('#wbGateInput');
  var errEl = mask.querySelector('#wbGateErr');
  function showGate(msg) {
    mask.style.display = 'flex';
    if (msg) errEl.textContent = msg;
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
  }
  function hideGate() { mask.style.display = 'none'; }

  function deriveKey(pw, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw),
      { name: 'PBKDF2' }, false, ['deriveKey']).then(function (mat) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        mat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    });
  }
  function decryptBuf(buf, pw) {
    var salt = new Uint8Array(buf.slice(0, 16));
    var iv = new Uint8Array(buf.slice(16, 28));
    var ct = buf.slice(28);
    return deriveKey(pw, salt).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    }).then(function (plain) {
      return new TextDecoder().decode(plain);
    });
  }

  function gated(url, opts) {
    if (GATE_KEY && url.indexOf(REPORTS) === 0 && url.indexOf('.enc') < 0) {
      return realFetch(url + '.enc', opts).then(function (res) {
        if (!res.ok) return res;
        return res.arrayBuffer().then(function (buf) {
          return decryptBuf(buf, GATE_KEY).then(function (text) {
            return new Response(text, {
              status: res.status, statusText: res.statusText,
              headers: new Headers({ 'Content-Type': 'application/json; charset=utf-8' })
            });
          });
        });
      });
    }
    return realFetch(url, opts);
  }

  // ---- 安装 fetch 拦截 ----
  if (realFetch) {
    window.fetch = function (u, o) {
      var url = (typeof u === 'string') ? u : (u && u.url) || '';
      if (url.indexOf(REPORTS) === 0 && url.indexOf('.enc') < 0 && !GATE_KEY) {
        showGate();
        return new Promise(function (resolve, reject) {
          pending.push({ url: url, opts: o, resolve: resolve, reject: reject });
        });
      }
      return gated(url, o);
    };
  }

  function unlock(pw) {
    if (!pw) { showGate('请输入口令'); return; }
    realFetch(PROBE).then(function (r) {
      return r.arrayBuffer();
    }).then(function (buf) {
      return decryptBuf(buf, pw); // 仅验证口令能否解密
    }).then(function () {
      GATE_KEY = pw;
      hideGate();
      var items = pending.splice(0);
      items.forEach(function (it) {
        gated(it.url, it.opts).then(it.resolve).catch(it.reject);
      });
    }).catch(function () {
      showGate('口令错误，请重试');
    });
  }
  window.__wbGateUnlock = unlock;

  function submit() { unlock(input.value); }
  mask.querySelector('#wbGateBtn').addEventListener('click', submit);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

  // 首屏即显示登录框（若 app.js 尚未发起 fetch，这里也能兜住）
  showGate();
})();
