/* ============================================================
   views-summary.v1.js · 周期总结（SPA 内嵌栏目 + 独立页双模式）
   ------------------------------------------------------------
   - SPA 模式：注册 V.summary，由 app.js 渲染到主面板（正常栏目，无跳转）
   - 独立页模式：summary.html 直链时渲染到 #smRoot（缓存兜底入口）
   - 数据：fetch ./api/reports/period_summary.json（no-store 实时）
   注意：拼接 HTML 时所有 const/let 必须在 return / 使用之前声明（ASI 截断铁律）。
   ============================================================ */
(function () {
  'use strict';

  var DATA = null;
  var TAB = 'month';   /* month | quarter | year */

  /* ---------- 工具函数 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pct(v, digits) {
    if (v == null || isNaN(v)) return '—';
    var d = (digits === undefined) ? 2 : digits;
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
  }
  function pctPlain(v, digits) {
    if (v == null || isNaN(v)) return '—';
    var d = (digits === undefined) ? 1 : digits;
    return (v * 100).toFixed(d) + '%';
  }
  function cls(v) {
    if (v == null || isNaN(v)) return 'sm-flat';
    return v > 0 ? 'sm-up' : (v < 0 ? 'sm-down' : 'sm-flat');
  }
  function fmtD(s) {
    if (!s) return '—';
    var p = String(s).split('-');
    return p.length >= 3 ? (p[1] + '/' + p[2]) : s;
  }
  function num(v) {
    return (v == null || isNaN(v)) ? 0 : v;
  }

  /* ---------- 内嵌样式（只注入一次，两种模式共用） ---------- */
  var CSS_INJECTED = false;
  function injectCss() {
    if (CSS_INJECTED) return;
    CSS_INJECTED = true;
    var st = document.createElement('style');
    st.textContent = [
      '.sm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px;margin-bottom:14px}',
      '.sm-kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px 12px}',
      '.sm-kpi .k{font-size:11px;color:var(--ink-3);margin-bottom:3px}',
      '.sm-kpi .v{font-size:17px;font-weight:750;color:var(--ink);line-height:1.2}',
      '.sm-kpi .v small{font-size:11px;font-weight:500;color:var(--ink-3);margin-left:2px}',
      '.sm-tbl{width:100%;border-collapse:collapse;font-size:12px}',
      '.sm-tbl th,.sm-tbl td{padding:7px 8px;text-align:center;border-bottom:1px solid var(--line);white-space:nowrap}',
      '.sm-tbl th{color:var(--ink-3);font-weight:600;font-size:11.5px;background:var(--panel-2)}',
      '.sm-tbl td.l,.sm-tbl th.l{text-align:left}',
      '.sm-tbl tbody tr:hover{background:var(--panel-2)}',
      '.sm-up{color:#e5484d;font-weight:700}.sm-down{color:#12a150;font-weight:700}.sm-flat{color:var(--ink-3)}',
      '.sm-badge{display:inline-block;font-size:10.5px;padding:1px 7px;border-radius:999px;margin-left:6px;vertical-align:1px}',
      '.sm-badge.done{background:rgba(18,161,80,.13);color:#12a150}',
      '.sm-badge.hold{background:rgba(255,159,10,.15);color:#c47b00}',
      '.sm-badge.skip{background:rgba(140,140,150,.16);color:#6b6b76}',
      '.sm-badge.empty{background:rgba(56,110,216,.14);color:#2f6bd8}',
      '.sm-month{margin-top:10px}',
      '.sm-batch{border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--panel);padding:9px 11px;margin-top:8px}',
      '.sm-batch-t{font-size:12.5px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:7px;flex-wrap:wrap}',
      '.sm-batch-s{font-size:11px;color:var(--ink-3);margin:3px 0 7px;line-height:1.6}',
      '.sm-empty{padding:28px 12px;text-align:center;color:var(--ink-3);font-size:13px}',
      '.sm-tip{font-size:11.5px;color:var(--ink-3);padding:8px 12px;background:var(--panel-2);border:1px dashed var(--line);border-radius:var(--radius-sm);margin-top:12px;line-height:1.7}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- 汇总表格 ---------- */
  function periodTable(list) {
    if (!list || !list.length) {
      return '<div class="sm-empty">暂无数据</div>';
    }
    var h = [];
    h.push('<div style="overflow-x:auto"><table class="sm-tbl">');
    h.push('<thead><tr>'
      + '<th class="l">周期</th>'
      + '<th>批次</th>'
      + '<th>选出</th>'
      + '<th>买入</th>'
      + '<th>止损</th>'
      + '<th>达标</th>'
      + '<th>盈利</th>'
      + '<th>胜率</th>'
      + '<th>止损率</th>'
      + '<th>达标率</th>'
      + '<th>平均收益</th>'
      + '<th>累计收益</th>'
      + '<th class="l">区间</th>'
      + '</tr></thead><tbody>');
    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      h.push('<tr>'
        + '<td class="l"><b>' + esc(r.label) + '</b></td>'
        + '<td>' + num(r.count) + '</td>'
        + '<td>' + num(r.pick_n) + '</td>'
        + '<td>' + num(r.buy_n) + '</td>'
        + '<td>' + num(r.sl_n) + '</td>'
        + '<td>' + num(r.tg_n) + '</td>'
        + '<td>' + num(r.win_n) + '</td>'
        + '<td class="' + cls(r.win_rate == null ? null : (r.win_rate - 0.5)) + '">' + pctPlain(r.win_rate) + '</td>'
        + '<td>' + pctPlain(r.sl_rate) + '</td>'
        + '<td>' + pctPlain(r.tg_rate) + '</td>'
        + '<td class="' + cls(r.avg_ret) + '">' + pct(r.avg_ret) + '</td>'
        + '<td class="' + cls(r.total_ret) + '"><b>' + pct(r.total_ret) + '</b></td>'
        + '<td class="l">' + fmtD(r.min_date) + ' ~ ' + fmtD(r.max_date) + '</td>'
        + '</tr>');
    }
    h.push('</tbody></table></div>');
    return h.join('');
  }

  /* ---------- 单批次明细 ---------- */
  function batchHtml(b) {
    var s = b.summary || {};
    var h = [];
    var phase = b.phase || (b.settled ? 'done' : 'holding');
    var badgeCls = 'hold', badgeTxt = '持仓中';
    if (phase === 'done') { badgeCls = 'done'; badgeTxt = '已了结'; }
    else if (phase === 'skipped') { badgeCls = 'skip'; badgeTxt = '未触发/跳过'; }
    else if (phase === 'empty') { badgeCls = 'empty'; badgeTxt = '空仓'; }
    h.push('<div class="sm-batch">');
    if (phase === 'empty') {
      h.push('<div class="sm-batch-t">📅 ' + fmtD(b.signal_date) + ' 盘后选股'
        + '<span class="sm-badge ' + badgeCls + '">' + badgeTxt + '</span></div>');
      h.push('<div class="sm-batch-s">' + esc(b.empty_reason || '当日未产出选股名单（空仓 / 0 只入选）') + '</div>');
    } else {
      h.push('<div class="sm-batch-t">📅 ' + fmtD(b.signal_date) + ' 选出 → ' + fmtD(b.buy_date) + ' 买入'
        + '<span class="sm-badge ' + badgeCls + '">' + badgeTxt + '</span></div>');
      h.push('<div class="sm-batch-s">'
        + '选出 ' + num(s.pick_n) + '　开仓 ' + num(s.buy_n) + '　放弃 ' + num(s.skip_n)
        + '　止损 ' + num(s.sl_n) + '　达标 ' + num(s.tg_n) + '　盈利 ' + num(s.win_n)
        + '　胜率 <b>' + pctPlain(s.win_rate) + '</b>'
        + '　平均 <b class="' + cls(s.avg_ret) + '">' + pct(s.avg_ret) + '</b>'
        + '</div>');
    }

    var rows = b.rows || [];
    if (rows.length) {
      h.push('<div style="overflow-x:auto"><table class="sm-tbl">');
      h.push('<thead><tr><th class="l">标的</th><th>评分</th><th>介入上限</th><th>止损</th>'
        + '<th>目标</th><th>开盘</th><th>收盘</th><th class="l">判定</th><th>收益</th></tr></thead><tbody>');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var judge = esc(r.hit_buy || r.exit_reason || r.note || '');
        h.push('<tr>'
          + '<td class="l"><b>' + esc(r.name) + '</b> <span style="color:var(--ink-3)">' + esc(r.code) + '</span></td>'
          + '<td>' + (r.score == null ? '—' : Number(r.score).toFixed(0)) + '</td>'
          + '<td>' + (r.buyLimit == null ? '—' : Number(r.buyLimit).toFixed(2)) + '</td>'
          + '<td>' + (r.stopLoss == null ? '—' : Number(r.stopLoss).toFixed(2)) + '</td>'
          + '<td>' + (r.target == null ? '—' : Number(r.target).toFixed(2)) + '</td>'
          + '<td>' + (r._disp_open == null ? '—' : Number(r._disp_open).toFixed(2)) + '</td>'
          + '<td>' + (r._disp_close == null ? '—' : Number(r._disp_close).toFixed(2)) + '</td>'
          + '<td class="l">' + judge + '</td>'
          + '<td class="' + cls(r.ret) + '">' + pct(r.ret) + '</td>'
          + '</tr>');
      }
      h.push('</tbody></table></div>');
    }
    h.push('</div>');
    return h.join('');
  }

  /* ---------- 月度归档 ---------- */
  function monthsHtml(months) {
    if (!months || !months.length) return '<div class="sm-empty">暂无历史批次</div>';
    var h = [];
    for (var i = 0; i < months.length; i++) {
      var m = months[i] || {};
      var open = (i === 0) ? ' m26-open' : '';
      h.push('<div class="m26-fold sm-month' + open + '">');
      h.push('<div class="m26-fold-h" onclick="this.parentElement.classList.toggle(\'m26-open\')">'
        + '🗂 ' + esc(m.label) + '　' + m.batch_n + ' 批（了结 ' + m.done_n + '）'
        + '　买入 ' + m.buy_n + '　胜率 <b>' + pctPlain(m.win_rate) + '</b>'
        + '　平均 <b class="' + cls(m.avg_ret) + '">' + pct(m.avg_ret) + '</b>'
        + '<span class="m26-fold-arrow">▸</span></div>');
      h.push('<div class="m26-fold-b">');
      var bs = m.batches || [];
      for (var j = 0; j < bs.length; j++) {
        h.push(batchHtml(bs[j]));
      }
      h.push('</div></div>');
    }
    return h.join('');
  }

  /* ---------- KPI ---------- */
  function kpiHtml(cum) {
    var c = cum || {};
    var items = [
      ['累计样本', num(c.n_total) + '<small>只</small>'],
      ['总胜率', '<span class="' + cls(c.win_rate == null ? null : c.win_rate - 0.5) + '">' + pctPlain(c.win_rate) + '</span>'],
      ['平均收益', '<span class="' + cls(c.avg_ret) + '">' + pct(c.avg_ret) + '</span>'],
      ['止损率', pctPlain(c.sl_rate)],
      ['达标率', pctPlain(c.tg_rate)],
      ['覆盖批次', num(c.day_n) + '<small>批</small>']
    ];
    var h = ['<div class="sm-kpis">'];
    for (var i = 0; i < items.length; i++) {
      h.push('<div class="sm-kpi"><div class="k">' + esc(items[i][0]) + '</div>'
        + '<div class="v">' + items[i][1] + '</div></div>');
    }
    h.push('</div>');
    return h.join('');
  }

  /* ---------- 标签栏 ---------- */
  function tabBar() {
    var tabs = [['month', '月度'], ['quarter', '季度'], ['year', '年度']];
    var h = ['<div class="tab-bar" data-smtabs>'];
    for (var i = 0; i < tabs.length; i++) {
      var active = (tabs[i][0] === TAB) ? ' active' : '';
      h.push('<button class="tab-item' + active + '" data-p="' + tabs[i][0] + '">' + tabs[i][1] + '</button>');
    }
    h.push('</div>');
    return h.join('');
  }

  /* ---------- 主体内容（两种模式共用） ---------- */
  function bodyHtml() {
    var period = (DATA && DATA.period) || {};
    var h = [];
    h.push(kpiHtml(DATA ? DATA.cum : {}));
    h.push('<div class="card"><div class="card-head"><h3>📊 按开仓时间汇总</h3>'
      + '<span class="sub">口径：按买入执行日归集 · 含持仓中批次</span></div>'
      + '<div class="card-body tight">');
    h.push(tabBar());
    h.push('<div data-smperiod>' + periodTable(period[TAB] || []) + '</div>');
    h.push('</div></div>');

    h.push('<div class="card" style="margin-top:12px"><div class="card-head"><h3>🗂 历史批次归档</h3>'
      + '<span class="sub">共 ' + num(DATA && DATA.history_n) + ' 批 · 点击月份展开</span></div>'
      + '<div class="card-body">');
    h.push(monthsHtml((DATA && DATA.months) || []));
    h.push('</div></div>');

    h.push('<div class="sm-tip">'
      + '<b>两套口径，请勿直接横比：</b><br>'
      + '① 上方「按开仓时间汇总」= 按<b>买入执行日</b>所在月归集，<b>含</b>仍持仓未了结的批次；<br>'
      + '② 下方「历史批次归档」= 按<b>信号日</b>所在月分组，当月小计<b>只算已了结</b>批次（持仓中不计入，避免虚增胜率）。<br>'
      + '因此同一月份两处「批次数」可能相同、但「买入数/胜率」不同，这是口径差异，不是数据错误。'
      + '</div>');
    return h.join('');
  }

  /* ---------- 事件绑定 + 数据加载（渲染进指定容器后调用） ---------- */
  function wire(root) {
    var bar = root.querySelector('[data-smtabs]');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.tab-item') : null;
        if (!btn) return;
        TAB = btn.getAttribute('data-p') || 'month';
        var body = root.querySelector('[data-smperiod]');
        if (body) body.innerHTML = periodTable(((DATA || {}).period || {})[TAB] || []);
        var all = bar.querySelectorAll('.tab-item');
        for (var i = 0; i < all.length; i++) {
          all[i].classList.toggle('active', all[i] === btn);
        }
      });
    }
  }

  function loadInto(root, onFail) {
    fetch('./api/reports/period_summary.json?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        DATA = d;
        root.innerHTML = bodyHtml();
        wire(root);
      })
      .catch(function (err) {
        if (onFail) onFail(err);
        else root.innerHTML = '<div class="sm-empty">数据加载失败：' + esc(err.message)
          + '<br><br>请确认已运行 build_summary.py 生成 period_summary.json</div>';
      });
  }

  /* ============================================================
     模式一：SPA 内嵌栏目（由 app.js 调用）
     ============================================================ */
  var VIEW = {
    title: '周期总结',
    desc: '月度 / 季度 / 年度汇总 · 按月份归档历史批次',
    render: function () {
      injectCss();
      return '<div data-smroot><div class="sm-empty">加载中…</div></div>';
    },
    mount: function () {
      var root = document.querySelector('[data-smroot]');
      if (!root) return;
      loadInto(root);
    }
  };

  /* ============================================================
     模式二：独立页（summary.html 直链，缓存兜底入口）
     ============================================================ */
  function standalone() {
    var root = document.getElementById('smRoot');
    if (!root) return;
    injectCss();
    /* 更新时间 + 版本水印 */
    var u = document.getElementById('smUpdated');
    var ver = document.getElementById('smVer');
    if (ver && window.__APP_VER__) ver.textContent = '· ' + window.__APP_VER__;

    /* 「回工作台」：清缓存后带版本参数跳主页（仅独立页需要） */
    var back = document.getElementById('smBack');
    if (back) {
      back.addEventListener('click', function (e) {
        e.preventDefault();
        var tip = document.getElementById('smBackTip');
        if (tip) tip.style.display = 'block';
        var fired = false;
        function go() {
          if (fired) return;
          fired = true;
          var v = (window.__APP_VER__ || '');
          location.href = './index.html?v=' + encodeURIComponent(v) + '&_fresh=' + Date.now();
        }
        var todo = 0;
        function tick() { if (--todo <= 0) go(); }
        if (navigator.serviceWorker) {
          todo++;
          navigator.serviceWorker.getRegistrations()
            .then(function (regs) {
              return Promise.all(regs.map(function (r) { return r.unregister(); }));
            }).then(tick, tick);
        }
        if (window.caches) {
          todo++;
          caches.keys()
            .then(function (ks) {
              return Promise.all(ks.map(function (k) { return caches.delete(k); }));
            }).then(tick, tick);
        }
        if (todo === 0) go();
        setTimeout(go, 900);
      });
    }

    loadInto(root, function () {});
    /* 拿到数据后回填更新时间 */
    var timer = setInterval(function () {
      if (DATA) {
        if (u) u.textContent = '数据更新：' + (DATA.updated || '—');
        clearInterval(timer);
      }
    }, 200);
    setTimeout(function () { clearInterval(timer); }, 8000);
  }

  /* ---------- 注册到全局视图表（app.js 的路由用） ----------
     ⚠️ 必须用裸标识符 V：views-market.js 里的 `const V = {}` 是全局词法绑定，
     不会挂到 window 上；app.js 的 V[key] 查的也是这个词法绑定。
     若误写 window.V.summary 会挂到另一个对象上 → 路由查不到 → 点击菜单回退首页。 */
  try {
    V.summary = VIEW;
  } catch (e) {
    window.V = window.V || {};
    window.V.summary = VIEW;
  }

  /* ---------- 启动：仅当页面里存在 #smRoot（独立页）时才自动渲染 ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', standalone);
  } else {
    standalone();
  }
})();
