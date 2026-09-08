/* ============================================================
   ui.js · 通用 UI 组件与工具
   ============================================================ */
const UI = (() => {

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, action) {
    const el = $('#toast'); if (!el) return;
    el.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    if (action && action.label) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.onclick = () => { el.classList.remove('show'); clearTimeout(toastTimer); if (action.onClick) action.onClick(); };
      el.appendChild(btn);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 1900);
  }

  /* ---------- Modal ---------- */
  function modal({ title, body, buttons }) {
    $('#modalTitle').textContent = title || '';
    $('#modalBody').innerHTML = body || '';
    const foot = $('#modalFoot'); foot.innerHTML = '';
    (buttons || [{ label: '关闭', close: true }]).forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || 'btn-ghost');
      btn.textContent = b.label;
      btn.onclick = () => { if (b.onClick) { if (b.onClick() === false) return; } if (b.close !== false) closeModal(); };
      foot.appendChild(btn);
    });
    $('#modalMask').classList.add('show');
  }
  function closeModal() { $('#modalMask').classList.remove('show'); }

  function confirm(msg, onYes) {
    modal({
      title: '确认操作',
      body: `<p style="font-size:13.5px;line-height:1.7">${esc(msg)}</p>`,
      buttons: [{ label: '取消' }, { label: '确定', cls: 'btn-solid', onClick: onYes }]
    });
  }

  /* ---------- 数字格式 ---------- */
  const num = (v, d = 2) => {
    const n = parseFloat(v);
    return isNaN(n) ? '--' : n.toFixed(d);
  };
  const sign = (v, d = 2, suffix = '') => {
    const n = parseFloat(v);
    if (isNaN(n)) return '--';
    return (n > 0 ? '+' : '') + n.toFixed(d) + suffix;
  };
  const dirCls = v => {
    const n = parseFloat(v);
    if (isNaN(n) || n === 0) return 'flat';
    return n > 0 ? 'up' : 'down';
  };
  const big = v => {
    const n = parseFloat(v);
    if (isNaN(n)) return '--';
    const a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (a >= 1e4) return (n / 1e4).toFixed(2) + '万';
    return n.toFixed(0);
  };

  /* ============================================================
     可编辑表格组件
     cols: [{k,label,type,w,num,center,opts,ph,compute,cls,readonly}]
     ============================================================ */
  const tableRegistry = {};

  function table(cfg) {
    const { key, cols, seed, addLabel, defaults, wide, narrow, tip, noAdd, readonly } = cfg;
    tableRegistry[key] = cfg;
    const data = Store.rows(key, seed);

    const head = cols.map(c =>
      `<th class="${c.num ? 'num' : ''} ${c.center ? 'center' : ''}" ${c.w ? `style="min-width:${c.w}px"` : ''}>${esc(c.label)}</th>`
    ).join('') + (noAdd || readonly ? '' : '<th style="width:38px"></th>');

    const body = data.length ? data.map(row => {
      const tds = cols.map(c => {
        if (c.compute) {
          const r = c.compute(row);
          const val = (r && typeof r === 'object') ? r.text : r;
          const cls = (r && typeof r === 'object') ? (r.cls || '') : '';
          return `<td class="${c.num ? 'num' : ''} ${c.center ? 'center' : ''} ${cls}" data-comp="${c.k}" data-id="${row._id}">${val == null ? '--' : esc(val)}</td>`;
        }
        if (readonly) {
          const v = row[c.k] == null ? '' : row[c.k];
          const cls = c.cls ? (typeof c.cls === 'function' ? c.cls(row) : c.cls) : '';
          const text = v === '' || v == null ? '—' : esc(v);
          return `<td class="${c.num ? 'num' : ''} ${c.center ? 'center' : ''} ${cls} ro-cell">${text}</td>`;
        }
        return `<td class="${c.center ? 'center' : ''}">${cellInput(key, row, c)}</td>`;
      }).join('');
      return `<tr data-row="${row._id}">${tds}${noAdd || readonly ? '' : `<td class="center"><button class="row-del" data-del="${row._id}" data-tk="${esc(key)}" title="删除">×</button></td>`}</tr>`;
    }).join('') : `<tr><td colspan="${cols.length + (noAdd || readonly ? 0 : 1)}"><div class="empty"><span class="ei">🗒️</span>暂无记录</div></td></tr>`;

    return `
      <div class="scroll-hint">左右滑动查看完整表格</div>
      <div class="table-wrap ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''} ${readonly ? 'readonly' : ''}">
        <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      </div>
      ${noAdd || readonly ? '' : `<div class="table-foot">
        <button class="btn btn-pink btn-sm" data-add="${esc(key)}">${esc(addLabel || '+ 添加一行')}</button>
        <span class="table-tip">${esc(tip || '点击单元格直接编辑，自动保存')}</span>
      </div>`}
    `;
  }

  function cellInput(key, row, c) {
    const v = row[c.k] == null ? '' : row[c.k];
    const attrs = `data-tk="${esc(key)}" data-id="${row._id}" data-f="${esc(c.k)}"`;
    const cls = `cell-input ${c.num ? 'num' : ''} ${c.cls ? (typeof c.cls === 'function' ? c.cls(row) : c.cls) : ''}`;
    if (c.type === 'select') {
      return `<select class="${cls}" ${attrs}>` +
        (c.opts || []).map(o => `<option value="${esc(o)}" ${String(v) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('') +
        `</select>`;
    }
    if (c.type === 'textarea') {
      return `<textarea class="${cls}" rows="1" ${attrs} placeholder="${esc(c.ph || '')}">${esc(v)}</textarea>`;
    }
    const t = c.type === 'number' ? 'number' : (c.type === 'date' ? 'date' : 'text');
    const step = c.type === 'number' ? 'step="any"' : '';
    return `<input type="${t}" ${step} class="${cls}" ${attrs} value="${esc(v)}" placeholder="${esc(c.ph || '')}">`;
  }

  function recompute(key, id, fireChange) {
    const cfg = tableRegistry[key]; if (!cfg) return;
    const row = Store.rows(key).find(r => r._id === id); if (!row) return;
    cfg.cols.filter(c => c.compute).forEach(c => {
      const cell = document.querySelector(`td[data-comp="${c.k}"][data-id="${id}"]`);
      if (!cell) return;
      const r = c.compute(row);
      const val = (r && typeof r === 'object') ? r.text : r;
      const cls = (r && typeof r === 'object') ? (r.cls || '') : '';
      cell.textContent = val == null ? '--' : val;
      cell.className = `${c.num ? 'num' : ''} ${c.center ? 'center' : ''} ${cls}`;
    });
    if (fireChange && cfg.onChange) cfg.onChange();
  }

  function getTableCfg(k) { return tableRegistry[k]; }

  /* ---------- 卡片包装 ---------- */
  function card({ title, sub, right, body, tight }) {
    return `<div class="card">
      ${title ? `<div class="card-head"><h3>${title}</h3>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${right ? `<div class="right">${right}</div>` : ''}</div>` : ''}
      <div class="card-body ${tight ? 'tight' : ''}">${body}</div>
    </div>`;
  }

  function kpi(list) {
    return `<div class="kpi-grid">` + list.map(k => `
      <div class="kpi ${k.dir || ''}">
        <div class="label">${esc(k.label)}</div>
        <div class="value ${k.cls || ''}">${k.value}</div>
        ${k.delta ? `<div class="delta ${k.deltaCls || ''}">${k.delta}</div>` : ''}
      </div>`).join('') + `</div>`;
  }

  /* ---------- 自动保存文本域 ---------- */
  function textarea(key, ph, minH) {
    const v = Store.get(key, '');
    return `<textarea class="rich-area" data-note="${esc(key)}" placeholder="${esc(ph || '')}" ${minH ? `style="min-height:${minH}px"` : ''}>${esc(v)}</textarea>`;
  }

  /* ---------- 文本域高度自适应（贴合内容，不留大段空白） ---------- */
  function autosize(ta) {
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    // 折叠面板（details 未展开 / 隐藏 tab）内 scrollHeight=0：
    // 已算过高度则保持不塌；首次渲染则跳过，展开时由 ontoggle 触发重算
    if (ta.offsetParent === null && ta.style.height) return;
    const min = parseInt(ta.style.minHeight) || 96;
    ta.style.height = 'auto';
    ta.style.height = Math.max(min, ta.scrollHeight + 2) + 'px';
  }
  function autosizeAll(root) {
    $$('textarea.rich-area', root).forEach(autosize);
  }

  /* ---------- Markdown 新闻渲染（仅 [标题](http(s)链接) 可点击） ---------- */
  function renderMdInline(text) {
    let s = esc(text);
    // [文字](http(s)://...) → 安全外链（已先 esc，属性里的 & 会变成 &amp;，符合规范）
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) =>
      `<a class="news-link" href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // 把多行 Markdown 渲染为新闻列表；空内容返回"请粘贴真实链接"的合规提示
  function mdNews(md, opt) {
    opt = opt || {};
    const raw = String(md || '').trim();
    if (!raw) {
      const src = opt.domestic ? '同花顺 / 东方财富 / 财联社 / 证券时报' : '同花顺 / 东方财富 / 财联社 / 路透';
      return `<div class="empty-prompt">
        <span class="ei">🔗</span>
        本栏暂无真实新闻。<br>
        请粘贴 <b>${src}</b> 的<b>原始新闻链接</b>，每行一条，格式：<br>
        <code>[新闻标题](完整原文URL) ｜ 对A股的潜在影响：xxx</code><br>
        <small>本工具不编造新闻与链接；拿不到原文链接时请勿填写，留空即可。</small>
      </div>`;
    }
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return `<ul class="news-md">` + lines.map(line => {
      const body = line.replace(/^[-•*]\s*/, '');
      return `<li>${renderMdInline(body)}</li>`;
    }).join('') + `</ul>`;
  }

  /* ---------- 交易日状态横幅 ----------
     用于收盘类数据（情绪/题材/连板/龙虎榜/机会/风险/口播）：
     当日收盘 → 🟢；前一交易日 → 🟡（待今日收盘后更新）；未标记 → ⚪（示例数据）。
     含"标记为今日收盘"按钮，由 app.js 的 mark-today 动作处理。 */
  function tdBanner(key, label) {
    const m = (Market && Market.tdMeta) ? Market.tdMeta(key) : { date: null, state: 'init' };
    const map = {
      today: { cls: 'td-today', icon: '🟢', txt: `当日收盘（${m.date}）· 数据已更新` },
      prev: { cls: 'td-prev', icon: '🟡', txt: `前一交易日（${m.date}）· 待今日收盘后更新` },
      init: { cls: 'td-init', icon: '⚪', txt: `示例 / 未标记 · 请更新为今日收盘数据` }
    };
    const s = map[m.state];
    return `<div class="notice td-banner ${s.cls}">
      <span class="td-ico">${s.icon}</span>
      <span class="td-txt"><b>${esc(label || '本页数据')}</b>：${s.txt}</span>
      <button class="btn btn-xs btn-ghost" data-act="mark-today" data-key="${esc(key)}">📌 标记为今日收盘</button>
    </div>`;
  }

  /* ---------- 新闻卡片与信号表（调用 AI 整理器） ---------- */
  function newsCards(list) { return AI.renderNewsCards(list); }
  function signalTable(list) { return AI.renderSignalTable(list); }

  /* ---------- 方向标签（偏多 / 偏空 / 中性） ---------- */
  function dirTag(d) {
    const t = String(d || '中性');
    if (t.includes('多') || t.includes('暖') || t.includes('升') || t.includes('好') || t.includes('积极')) return '<span class="tag tag-red">↑ 偏多</span>';
    if (t.includes('空') || t.includes('冷') || t.includes('跌') || t.includes('差') || t.includes('谨慎') || t.includes('悲观') || t.includes('压力') || t.includes('警惕')) return '<span class="tag tag-green">↓ 偏空</span>';
    return '<span class="tag tag-gray">→ 中性</span>';
  }

  /* 自动整理素材输入框：rawKey 存储原始粘贴文本，kind 为 news/stocks/points/signals */
  function autoBox({ kind, rawKey, targetKey, title, ph }) {
    const v = Store.get(rawKey, '');
    return `
      <div class="auto-box" data-kind="${esc(kind)}" data-raw="${esc(rawKey)}" data-target="${esc(targetKey)}">
        <div class="auto-box-head">
          <span class="ab-title">${esc(title || '素材整理')}</span>
          <button class="btn btn-sm btn-solid" data-act="auto-parse" data-kind="${esc(kind)}" data-raw="${esc(rawKey)}" data-target="${esc(targetKey)}">✨ 自动整理</button>
        </div>
        <textarea class="rich-area auto-area" data-note="${esc(rawKey)}" placeholder="${esc(ph || '')}" style="min-height:90px">${esc(v)}</textarea>
        <div class="auto-tip">本工具<b>不编造新闻与数据</b>，请粘贴真实来源的原文或链接。</div>
      </div>`;
  }

  return { $, $$, esc, toast, modal, closeModal, confirm, num, sign, dirCls, big, table, card, kpi, textarea, autosize, autosizeAll, recompute, getTableCfg, mdNews, tdBanner, newsCards, signalTable, autoBox, dirTag };
})();
