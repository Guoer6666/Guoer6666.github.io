/* ============================================================
   snapshot.js · 归档记录长图生成器
   纯 Canvas 2D 手绘，零依赖，电脑直接下载 / 手机长按保存
   doc 结构：
   {
     title: '大盘总览记录', sub: '2026-08-08 · 保存于 22:30:11',
     filename: '大盘总览_2026-08-08.png',
     sections: [
       { title: '情绪快照', blocks: [
         { t: 'chips', items: [{ label: '涨停', value: '74家', dir: 'up' }] },
         { t: 'text', text: '多行文本…' },
         { t: 'rows', items: ['列表行1', '列表行2'] }   // 行内 **text** 段可着色
       ] }
     ]
   }
   rows 行支持 [{text:'中国稀土', dir:'up'}, {text:' +6.32亿'}] 分段着色
   ============================================================ */
const Snapshot = (() => {
  const SCALE = 2;                 // 2 倍清晰度，手机查看不糊
  const W = 920;                   // 逻辑宽度
  const PAD = 36;                  // 页边距
  const SPAD = 24;                 // 卡片内边距
  const CW = W - PAD * 2;          // 内容宽
  const BW = CW - SPAD * 2;        // 卡片内内容宽
  const C = {
    bg: '#fff5f8', card: '#ffffff', ink: '#413237', sub: '#a08b94',
    pink: '#f2588a', pinkDeep: '#d6336c', line: '#ffd6e3',
    up: '#e03131', down: '#2f9e44', amber: '#e8890c', gray: '#868e96'
  };
  const CHIP = {
    up:   { bg: '#ffe3e3', fg: '#e03131' },
    down: { bg: '#d3f9d8', fg: '#2b8a3e' },
    amber:{ bg: '#fff0c2', fg: '#d67900' },
    '':   { bg: '#f1f3f5', fg: '#495057' }
  };
  const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 逐字符换行（兼容中英文混排），保留 \n */
  function wrap(ctx, text, maxW) {
    const out = [];
    String(text == null ? '' : text).split('\n').forEach(p => {
      if (!p) { out.push(''); return; }
      let cur = '';
      for (const ch of p) {
        if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; }
        else cur += ch;
      }
      out.push(cur);
    });
    return out;
  }

  /* ---------- 块高度测量 ---------- */
  function blockH(ctx, b) {
    if (b.t === 'chips') {
      ctx.font = '400 22px ' + FONT;
      let cx = 0, lines = 1;
      (b.items || []).forEach(it => {
        const w = ctx.measureText(it.label + ' ' + it.value).width + 34;
        if (cx + w > BW && cx > 0) { lines++; cx = 0; }
        cx += w + 10;
      });
      return lines * 50 - 8;
    }
    if (b.t === 'text') {
      ctx.font = '400 22px ' + FONT;
      return wrap(ctx, b.text, BW).length * 32;
    }
    if (b.t === 'rows') {
      ctx.font = '400 21px ' + FONT;
      let h = 0;
      (b.items || []).forEach(row => {
        const txt = Array.isArray(row) ? row.map(s => s.text).join('') : row;
        h += wrap(ctx, txt, BW - 24).length * 30;
      });
      return h;
    }
    return 0;
  }

  /* ---------- 块绘制 ---------- */
  function drawBlock(ctx, b, x, y) {
    if (b.t === 'chips') {
      ctx.font = '400 22px ' + FONT;
      ctx.textBaseline = 'alphabetic';
      let cx = x, cy = y;
      (b.items || []).forEach(it => {
        const txt = it.label + ' ' + it.value;
        const w = ctx.measureText(txt).width + 34;
        if (cx + w > x + BW && cx > x) { cx = x; cy += 50; }
        const sty = CHIP[it.dir] || CHIP[''];
        rr(ctx, cx, cy, w, 40, 20);
        ctx.fillStyle = sty.bg; ctx.fill();
        ctx.fillStyle = sty.fg;
        ctx.fillText(txt, cx + 17, cy + 28);
        cx += w + 10;
      });
      return blockH(ctx, b);
    }
    if (b.t === 'text') {
      ctx.font = '400 22px ' + FONT;
      ctx.fillStyle = C.ink;
      const lines = wrap(ctx, b.text, BW);
      lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * 32 + 23));
      return lines.length * 32;
    }
    if (b.t === 'rows') {
      ctx.font = '400 21px ' + FONT;
      let cy = y;
      (b.items || []).forEach(row => {
        const segs = Array.isArray(row) ? row : [{ text: row }];
        const full = segs.map(s => s.text).join('');
        const lines = wrap(ctx, full, BW - 24);
        // 圆点
        ctx.fillStyle = C.pink;
        ctx.beginPath(); ctx.arc(x + 7, cy + 16, 4, 0, Math.PI * 2); ctx.fill();
        if (lines.length === 1) {
          // 单行：分段着色绘制
          let sx = x + 24;
          segs.forEach(s => {
            ctx.fillStyle = s.dir ? (C[s.dir] || C.ink) : C.ink;
            if (s.bold) ctx.font = '700 21px ' + FONT;
            ctx.fillText(s.text, sx, cy + 23);
            sx += ctx.measureText(s.text).width;
            ctx.font = '400 21px ' + FONT;
          });
        } else {
          ctx.fillStyle = C.ink;
          lines.forEach((ln, i) => ctx.fillText(ln, x + 24, cy + i * 30 + 23));
        }
        cy += lines.length * 30;
      });
      return cy - y;
    }
    return 0;
  }

  /* ---------- 整图排版（draw=false 时仅测量） ---------- */
  function flow(ctx, doc, draw) {
    const headH = 128;
    if (draw) {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 100000);
      // 头部粉带
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, C.pink); g.addColorStop(1, C.pinkDeep);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 34px ' + FONT;
      ctx.fillText(doc.title || '', PAD, 56);
      ctx.font = '400 21px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.fillText(doc.sub || '', PAD, 92);
      ctx.textAlign = 'right';
      ctx.font = '700 22px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillText('过儿的工作台', W - PAD, 56);
      ctx.font = '400 18px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText('数据来自真实公开接口 · 本地生成', W - PAD, 88);
      ctx.textAlign = 'left';
    }
    let y = headH + 24;

    (doc.sections || []).forEach(sec => {
      const blocks = sec.blocks || [];
      let bodyH = 0;
      blocks.forEach((b, i) => { bodyH += blockH(ctx, b) + (i < blocks.length - 1 ? 14 : 0); });
      const cardH = SPAD + 40 + 10 + bodyH + SPAD - 6;
      if (draw) {
        // 阴影 + 卡片
        ctx.save();
        ctx.shadowColor = 'rgba(242,88,138,.14)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
        rr(ctx, PAD, y, CW, cardH, 18);
        ctx.fillStyle = C.card; ctx.fill();
        ctx.restore();
        // 标题
        ctx.fillStyle = C.pink;
        rr(ctx, PAD + SPAD, y + SPAD + 6, 8, 26, 4); ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.font = '700 25px ' + FONT;
        ctx.fillText(sec.title || '', PAD + SPAD + 20, y + SPAD + 28);
      }
      let by = y + SPAD + 40 + 10;
      blocks.forEach(b => {
        const h = drawBlock(ctx, b, PAD + SPAD, by);
        by += h + 14;
      });
      y += cardH + 20;
    });

    // 页脚
    const footH = 54;
    if (draw) {
      ctx.font = '400 18px ' + FONT;
      ctx.fillStyle = C.sub;
      ctx.textAlign = 'center';
      ctx.fillText(doc.footer || '过儿的工作台 · 个人复盘归档 · 仅此一图，随时回看', W / 2, y + 30);
      ctx.textAlign = 'left';
    }
    return y + footH + 10;
  }

  /* ---------- 生成并弹出预览 ---------- */
  function show(doc) {
    try {
      // 第一遍测量
      const mc = document.createElement('canvas');
      const mctx = mc.getContext('2d');
      const H = Math.ceil(flow(mctx, doc, false));

      // 第二遍正式绘制
      const canvas = document.createElement('canvas');
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext('2d');
      ctx.scale(SCALE, SCALE);
      // 裁剪测量高度重新走一遍（背景铺满）
      flow(ctx, doc, true);

      const url = canvas.toDataURL('image/png');
      openPreview(url, doc.filename || '归档记录.png');
    } catch (e) {
      if (window.UI && UI.toast) UI.toast('长图生成失败：' + e.message);
    }
  }

  function openPreview(url, filename) {
    const old = document.getElementById('snapOverlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'snapOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(40,20,28,.82);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(3px)';
    ov.innerHTML = `
      <div style="max-width:94vw;max-height:74vh;overflow:auto;border-radius:14px;box-shadow:0 12px 48px rgba(0,0,0,.4);background:#fff">
        <img src="${url}" style="display:block;width:100%;height:auto" alt="归档长图"/>
      </div>
      <div style="display:flex;gap:12px;margin-top:16px">
        <button id="snapDl" style="min-height:46px;padding:0 26px;border:none;border-radius:23px;background:#f2588a;color:#fff;font-size:16px;font-weight:700;cursor:pointer">💾 下载长图</button>
        <button id="snapClose" style="min-height:46px;padding:0 26px;border:1px solid rgba(255,255,255,.5);border-radius:23px;background:transparent;color:#fff;font-size:16px;cursor:pointer">✕ 关闭</button>
      </div>
      <div style="margin-top:10px;color:rgba(255,255,255,.75);font-size:13px">手机端如未自动下载，可长按图片「存储到照片」</div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#snapClose').addEventListener('click', close);
    ov.querySelector('#snapDl').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (window.UI && UI.toast) UI.toast('已触发下载，请在下载目录查看');
    });
  }

  return { show };
})();
