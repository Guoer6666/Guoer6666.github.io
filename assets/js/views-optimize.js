/* ============================================================
   views-optimize.js · 策略优化看板（原生模块，无外部依赖）
   ------------------------------------------------------------
   作用：把你那个选股程序（daily_pick.py）的"副驾驶"。
        选股程序一行不改、照样跑、照样出名单；
        本看板负责——
        ① 每天自动加载当日入选名单（来自 16:10 跑批）；
        ② 9:25 自动拉实时开盘价 → 红/黄/绿自动判定买不买（不手填）；
        ③ 你点「已买入」后，到卖出日自动拉开盘价 → 自动告诉卖不卖、按什么价卖。
   数据来源：
        - 名单：api/reports/pick_latest.json.enc（16:10 自动部署）
        - 实时行情：腾讯 qt.gtimg.cn（f[5]=今开，f[3]=现价）
        - 体检报告：reports/verify_ledger.json（75 笔已结算，静态）
   红线：数字全部来自真实回测，未编造；样本仅 75 笔（显著需 875 笔），
        体检结论属线索级，落地前用双口径记账攒样本外验证。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 真实回测数据（来自 _feasibility_data.json） ---------- */
  var D = {
    meta: { updated: '2026-11-13', n: 75, cost: 0.102, breakeven: 43.12, nNeed: 875, maxDD: -57.14 },
    baseline: { n: 75, win: 37.3, total: -28.79, worst: -10.67 },
    lossSrc: [
      { label: '小幅低开（-1%~0%）', n: 32, total: -30.07, win: null, note: '历史最大亏损源，单独剔除即翻正' },
      { label: '平开 + 低开>1%（其余）', n: 43, total: 4.54, win: 39.5, note: '剔除小低开后整体转正' },
      { label: '基准合计', n: 75, total: -28.79, win: 37.3, note: '现行结算口径（净）' }
    ],
    holding: [
      { label: '基准（现行结算）', n: 75, win: 37.3, total: -28.79 },
      { label: 'T+2 开盘无条件卖', n: 75, win: 53.3, total: -0.21 },
      { label: '剔除小低开 + 开盘卖', n: 43, win: 60.5, total: 27.32 },
      { label: '外围跌>0.5% + 开盘卖', n: 30, win: 60.0, total: 36.38 }
    ],
    env: [
      { label: '大盘涨 × 外围涨（避开）', n: 14, total: -25.19 },
      { label: '大盘跌 × 外围跌（最稳）', n: 29, total: 14.15 },
      { label: '隔夜纳指涨 >+0.5%（避开）', n: 22, total: -38.73 },
      { label: '隔夜纳指跌 <-0.5%', n: 30, total: 25.5 },
      { label: '信号日振幅 >1.8%（避开）', n: 16, total: -38.42 },
      { label: '大盘涨 × 外围跌', n: 7, total: 24.44 }
    ],
    plan: [
      { label: '剔除「隔夜纳指涨>0.5%」闸门', n: 53, win: 41.5, total: 9.94 },
      { label: '外围闸门 + 开盘卖', n: 53, win: 60.4, total: 29.17 },
      { label: '外围跌>0.5% + 开盘卖（最优·样本小）', n: 30, win: 60.0, total: 36.38 }
    ],
    corr: { f: '隔夜纳指', r: -0.315, p: 0.00457, bonf: 0.00385 }
  };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) {
    if (v == null) return NaN;
    var n = parseFloat(String(v).replace(/,/g, ''));
    return n;
  }
  function pnl(v) {
    if (v == null || isNaN(v)) return '<span class="opt-flat">—</span>';
    var cls = v > 0 ? 'opt-good' : (v < 0 ? 'opt-bad' : 'opt-flat');
    return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(2) + '%</span>';
  }
  function win(v) {
    if (v == null) return '<span class="opt-flat">—</span>';
    return '<span class="' + (v >= D.meta.breakeven ? 'opt-good' : 'opt-flat') + '">' + v.toFixed(1) + '%</span>';
  }
  /* 日期工具（YYYY-MM-DD，本地时区） */
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function nextTrade(d) { d = addDays(d, 1); while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1); return d; }
  function shPrefix(code) { return /^6/.test(String(code)) ? 'sh' : 'sz'; }

  /* ---------- 9:25 开盘决策规则（零容差） ---------- */
  function judge(c0, o, stop) {
    if (!(c0 > 0) || !(o > 0)) {
      return { cls: 'warn', icon: '⚠️', title: '等待开盘价' };
    }
    if (stop && stop > 0 && o <= stop) {
      return { cls: 'stop', icon: '🔴', title: '不开仓（破止损）', reason: 'o=' + o + ' ≤ 止损 ' + stop };
    }
    if (o > c0) {
      return { cls: 'stop', icon: '🔴', title: '放弃（高开）', reason: 'o=' + o + ' > c0=' + c0 + '，高开哪怕 1 分也弃' };
    }
    if (o === c0) {
      return { cls: 'buy', icon: '🟢', title: '可买（平开）', reason: 'o=c0 平开，按 T+2 开盘卖执行' };
    }
    var lowThr = c0 * 0.99;
    if (o >= lowThr) {
      return { cls: 'warn', icon: '🟡', title: '不买（小幅低开）', reason: 'o=' + o + ' 落在 [' + lowThr.toFixed(2) + ',' + c0.toFixed(2) + ')，历史最大亏损源' };
    }
    return { cls: 'buy', icon: '🟢', title: '可买（低开≥1%）', reason: 'o=' + o + ' < ' + lowThr.toFixed(2) + '，低开≥1%' };
  }

  /* ---------- 实时行情（腾讯 qt.gtimg.cn，f[5]=今开 f[3]=现价） ---------- */
  function fetchQuotes(codes) {
    return new Promise(function (resolve) {
      if (!codes || !codes.length) { resolve({}); return; }
      var full = codes.map(function (c) { return shPrefix(c) + c; });
      var url = 'https://qt.gtimg.cn/q=' + full.join(',');
      fetch(url, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (text) {
        var map = {};
        text.split(';').forEach(function (line) {
          var m = line.match(/^v_([^=]+)="(.*)"$/);
          if (!m || m[2].length < 10) return;
          var f = m[2].split('~');
          if (f.length < 46) return;
          map[f[2]] = {
            open: parseFloat(f[5]), price: parseFloat(f[3]),
            prevClose: parseFloat(f[4]), name: f[1], pct: parseFloat(f[32])
          };
        });
        resolve(map);
      }).catch(function () { resolve({}); });
    });
  }

  /* ---------- 持仓（localStorage，本机记录你买了什么） ---------- */
  var POS_KEY = 'm2560_positions_v1';
  function getPositions() { try { return JSON.parse(localStorage.getItem(POS_KEY) || '[]'); } catch (e) { return []; } }
  function addPosition(p) {
    var a = getPositions();
    if (!a.some(function (x) { return x.code === p.code; })) a.push(p);
    localStorage.setItem(POS_KEY, JSON.stringify(a));
  }
  function removePosition(code) {
    var a = getPositions().filter(function (x) { return x.code !== code; });
    localStorage.setItem(POS_KEY, JSON.stringify(a));
  }

  /* ===================== 各区块渲染 ===================== */

  function renderBanner() {
    return '<div class="opt-banner">' +
      '<div class="opt-banner-h">📌 这看板是干嘛的（30 秒看懂）</div>' +
      '<ul>' +
      '<li><b>它不是新选股程序</b>：你的选股程序一行没改，照样每天 16:10 出名单。</li>' +
      '<li><b>它是"副驾驶"</b>：自动把名单变成<b>红/黄/绿买卖指令</b>——买不买、哪天卖、按什么价卖，全帮你算好，不用手填。</li>' +
      '<li><b>每天变的是「今日操作」</b>（下方自动加载名单 + 自动判定）。</li>' +
      '<li><b>不变的是「策略体检报告」</b>（亏损源/持有期/环境分层/落地方案）——那几张表是 75 笔历史台账的体检，解释"为什么亏、怎么改"，<b>不每天变</b>。</li>' +
      '</ul></div>';
  }

  /* --- 手动决策器（备用：行情加载失败才用） --- */
  function renderDecision() {
    var h = '<div class="opt-card"><div class="opt-sec-h">🎯 手动核对（备用）</div>';
    h += '<div class="opt-note">正常情况下看板自动判定，无需手填。仅当自动行情加载失败时，在此手填：</div>';
    h += '<div class="opt-inputs">' +
      '<label>信号日收盘 c0<input id="optC0" type="number" step="0.01" placeholder="85.75"></label>' +
      '<label>次日开盘 o<input id="optO" type="number" step="0.01" placeholder="85.20"></label>' +
      '<label>止损价<input id="optStop" type="number" step="0.01" placeholder="80.95"></label>' +
      '<button class="btn btn-solid" id="optJudge">判定</button></div>';
    h += '<div class="opt-verdict warn" id="optVerdict">输入 c0 与 o，点「判定」。</div>';
    h += '<div class="opt-note">规则：开&gt;c0→放弃(高开)；c0×0.99≤开&lt;c0→不买(小幅低开)；开=c0→可买(平开)；开&lt;c0×0.99→可买(低开≥1%)；开≤止损→不开仓。</div>';
    h += '</div>';
    return h;
  }

  /* --- 今日操作：自动加载名单 + 9:25 自动判定 --- */
  function renderPicksShell() {
    return '<div class="opt-card" id="optPicksCard"><div class="opt-sec-h">📅 今日操作（每天自动更新）</div>' +
      '<div id="optPicks"><div class="opt-note">正在加载今日信号…</div></div></div>';
  }
  function renderPicks(j, box) {
    if (!box) return;
    var sigDate = (j && j.date) ? j.date : '';
    var lists = [];
    ['dList', 'cList', 'bList', 'aList'].forEach(function (k) {
      if (j && Array.isArray(j[k])) j[k].forEach(function (it) { lists.push(it); });
    });
    var today = new Date();
    var todayStr = fmtDate(today);
    var buyDayStr = sigDate ? fmtDate(nextTrade(parseDate(sigDate))) : '';

    if (!lists.length) {
      box.innerHTML = '<div class="opt-sigtip">信号日 <b>' + esc(sigDate || '?') + '</b>：' +
        esc((j && j.decision) || '今日空仓，无需操作') + '</div>';
      return;
    }
    var isBuyDay = (todayStr === buyDayStr);
    var future = (todayStr < buyDayStr);
    var modeLabel = isBuyDay ? '今日买入日 · 实时' : (future ? '等待买入日' : '演示（非买入日·用最近行情）');
    var html = '<div class="opt-sigtip">信号日 <b>' + esc(sigDate) + '</b> · 入选 <b>' + lists.length +
      '</b> 只 · 买入日 <b>' + buyDayStr + '</b> · <span class="opt-mode">' + modeLabel + '</span>' +
      ' · 每 10 秒自动刷新</div>';
    html += '<div id="optPickRows"></div>';
    box.innerHTML = html;

    var rowsBox = document.getElementById('optPickRows');
    rowsBox.innerHTML = lists.map(function (it, i) {
      var c0 = num(it.close != null ? it.close : it.c0);
      var stop = num(it.stopLoss != null ? it.stopLoss : it.buyLimit);
      var tgt = num(it.target != null ? it.target : it.buyLimit);
      var code = String(it.code || '');
      var name = it.name || it.code || ('信号' + (i + 1));
      return '<div class="opt-pickrow" data-code="' + esc(code) + '" data-c0="' + c0 + '" data-stop="' + stop +
        '" data-tgt="' + tgt + '" data-name="' + esc(name) + '">' +
        '<b>' + esc(name) + '</b>' +
        '<span>' + (isNaN(c0) ? '' : 'c0 ' + c0.toFixed(2)) + (isNaN(stop) ? '' : ' · 止损 ' + stop.toFixed(2)) +
        (isNaN(tgt) ? '' : ' · 目标 ' + tgt.toFixed(2)) + '</span>' +
        '<span class="opt-live" style="color:#888">行情加载中…</span>' +
        '<button class="opt-buybtn" data-i="' + i + '">✅ 我已买入</button></div>';
    }).join('');

    rowsBox.querySelectorAll('.opt-buybtn').forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('.opt-pickrow');
        addPosition({
          code: row.getAttribute('data-code'), name: row.getAttribute('data-name'),
          c0: num(row.getAttribute('data-c0')), stopLoss: num(row.getAttribute('data-stop')),
          target: num(row.getAttribute('data-tgt')), buyDate: todayStr
        });
        b.textContent = '✅ 已记录'; b.disabled = true;
        if (typeof window.__optRenderPos === 'function') window.__optRenderPos();
      });
    });

    if (future) {
      rowsBox.querySelectorAll('.opt-live').forEach(function (el) {
        el.innerHTML = '<span class="opt-badge warn">⏳ 等待 ' + buyDayStr + ' 9:25 开盘</span>';
      });
      return;
    }
    fetchQuotes(lists.map(function (it) { return String(it.code); })).then(function (map) {
      rowsBox.querySelectorAll('.opt-pickrow').forEach(function (row) {
        var code = row.getAttribute('data-code');
        var q = map[code];
        var c0 = num(row.getAttribute('data-c0'));
        var stop = num(row.getAttribute('data-stop'));
        var live = row.querySelector('.opt-live');
        if (!q || !(q.open > 0)) {
          live.innerHTML = '<span class="opt-badge warn">⏳ 等待 9:25 开盘价</span>';
          return;
        }
        var r = judge(c0, q.open, stop);
        var cls = r.cls === 'stop' ? 'stop' : (r.cls === 'warn' ? 'warn' : 'buy');
        var emoji = cls === 'stop' ? '🔴' : (cls === 'warn' ? '🟡' : '🟢');
        live.innerHTML = '今开 <b>' + q.open.toFixed(2) + '</b> · 现 ' + q.price.toFixed(2) +
          ' <span class="opt-badge ' + cls + '">' + emoji + ' ' + r.title + '</span>';
      });
    });
  }

  /* --- 我的持仓：自动跟踪卖出 --- */
  function renderPositionsShell() {
    return '<div class="opt-card" id="optPosCard"><div class="opt-sec-h">💼 我的持仓（自动跟踪卖出）</div>' +
      '<div id="optPositions"><div class="opt-note">暂无持仓。</div></div></div>';
  }
  function renderPositions(box) {
    if (!box) return;
    var pos = getPositions();
    if (!pos.length) {
      box.innerHTML = '<div class="opt-sigtip">暂无持仓。在上方「今日信号」点「✅ 我已买入」后，到卖出日这里会自动告诉你卖不卖、按什么价卖。</div>';
      return;
    }
    var todayStr = fmtDate(new Date());
    var html = '<div class="opt-sigtip">规则：买入后下一交易日（T+2）开盘卖。到卖出日自动拉开盘价 → ' +
      '🔴止损 / 🟢达标 / 🟡开盘卖。</div><div id="optPosRows"></div>';
    box.innerHTML = html;
    var rowsBox = document.getElementById('optPosRows');
    rowsBox.innerHTML = pos.map(function (p) {
      var sellDay = fmtDate(nextTrade(parseDate(p.buyDate)));
      return '<div class="opt-posrow" data-code="' + esc(p.code) + '" data-c0="' + p.c0 +
        '" data-stop="' + p.stopLoss + '" data-tgt="' + p.target + '" data-sellday="' + sellDay + '">' +
        '<b>' + esc(p.name) + '</b> <span>c0 ' + p.c0.toFixed(2) + ' · 止损 ' + p.stopLoss.toFixed(2) +
        ' · 目标 ' + p.target.toFixed(2) + '</span>' +
        '<span class="opt-live">计算中…</span>' +
        '<button class="opt-sellbtn">✅ 已卖出</button></div>';
    }).join('');
    rowsBox.querySelectorAll('.opt-sellbtn').forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('.opt-posrow');
        removePosition(row.getAttribute('data-code'));
        if (typeof window.__optRenderPos === 'function') window.__optRenderPos();
      });
    });
    fetchQuotes(pos.map(function (p) { return p.code; })).then(function (map) {
      rowsBox.querySelectorAll('.opt-posrow').forEach(function (row) {
        var code = row.getAttribute('data-code');
        var c0 = num(row.getAttribute('data-c0'));
        var stop = num(row.getAttribute('data-stop'));
        var tgt = num(row.getAttribute('data-tgt'));
        var sellDay = row.getAttribute('data-sellday');
        var live = row.querySelector('.opt-live');
        var q = map[code];
        if (todayStr < sellDay) {
          live.innerHTML = '<span class="opt-badge warn">持有中 · 卖出日 ' + sellDay + '</span>';
          return;
        }
        if (!q || !(q.open > 0)) {
          live.innerHTML = '<span class="opt-badge warn">⏳ 等待 ' + sellDay + ' 9:25 开盘价</span>';
          return;
        }
        var o2 = q.open, cls, title, pct = (o2 / c0 - 1) * 100;
        if (o2 <= stop) { cls = 'stop'; title = '止损卖出 @' + o2.toFixed(2); }
        else if (o2 >= tgt) { cls = 'buy'; title = '达标卖出 @' + o2.toFixed(2); }
        else { cls = 'warn'; title = '开盘卖出 @' + o2.toFixed(2); }
        var emoji = cls === 'stop' ? '🔴' : (cls === 'buy' ? '🟢' : '🟡');
        live.innerHTML = '开盘 ' + o2.toFixed(2) + ' <span class="opt-badge ' + cls + '">' + emoji + ' ' +
          title + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)</span>';
      });
    });
  }

  /* --- 策略体检报告（静态，不每天变） --- */
  function renderKpis() {
    var m = D.meta, b = D.baseline;
    var cards = [
      { l: '基准胜率', v: b.win + '%', c: 'opt-flat' },
      { l: '净累计（75笔）', v: pnl(b.total), c: '' },
      { l: '盈亏平衡胜率', v: m.breakeven + '%', c: 'opt-bad', s: '当前未达标' },
      { l: '最大回撤', v: pnl(m.maxDD), c: '' },
      { l: '样本', v: m.n + ' 笔', c: 'opt-flat', s: '显著需 ' + m.nNeed + ' 笔' },
      { l: '最优可行方案', v: pnl(36.38), c: '', s: '外围跌+开盘卖·30笔' }
    ];
    var h = '<div class="opt-kpis">';
    cards.forEach(function (c) {
      h += '<div class="opt-kpi"><div class="l">' + esc(c.l) + '</div>' +
        '<div class="v ' + c.c + '">' + c.v + '</div>' +
        (c.s ? '<div class="s">' + esc(c.s) + '</div>' : '') + '</div>';
    });
    h += '</div>';
    return h;
  }
  function tblHead(cols) {
    return '<thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead>';
  }
  function renderLoss() {
    var h = '<div class="opt-card"><div class="opt-sec-h">🔎 亏损源诊断（为什么亏）</div>';
    h += '<table class="opt-tbl">' + tblHead(['开盘跳空桶', '笔数', '净累计', '胜率', '说明']) + '<tbody>';
    D.lossSrc.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + pnl(r.total) + '</td><td>' +
        win(r.win) + '</td><td style="text-align:left;color:#888;font-size:12px">' + esc(r.note) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">砍掉「小幅低开」这口坑，整体从 ' + pnl(-28.79) + ' 翻正到 ' + pnl(4.54) +
      '。这是优化第一刀。</div></div>';
    return h;
  }
  function renderHolding() {
    var h = '<div class="opt-card"><div class="opt-sec-h">⏱️ 持有期：开盘卖 vs 现行（怎么卖更好）</div>';
    h += '<table class="opt-tbl">' + tblHead(['方案', '笔数', '胜率', '净累计']) + '<tbody>';
    D.holding.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + win(r.win) + '</td><td>' + pnl(r.total) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">「T+2 开盘卖」把胜率从 37% 拉到 53%；「开盘卖 + 剔小低开 / 外围跌」净累计转正，但样本仅 30~43 笔，需样本外验证。</div></div>';
    return h;
  }
  function renderEnv() {
    var h = '<div class="opt-card"><div class="opt-sec-h">🌐 环境分层（什么时候该躲）</div>';
    h += '<table class="opt-tbl">' + tblHead(['市场环境', '笔数', '净累计']) + '<tbody>';
    D.env.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + pnl(r.total) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">「大盘涨+外围涨」反而最坑（-25.19%）；「隔夜纳指涨>0.5%」后买入净 -38.73%，应<b>主动回避</b>。' +
      '纳指与净收益 r=' + D.corr.r + '，但未过校正 ' + D.corr.bonf + '，当线索、不当铁律。</div></div>';
    return h;
  }
  function renderPlan() {
    var h = '<div class="opt-card"><div class="opt-sec-h">🛠️ 落地方案（可行，样本外验证前先用双口径记账）</div>';
    h += '<table class="opt-tbl">' + tblHead(['方案', '笔数', '胜率', '净累计']) + '<tbody>';
    D.plan.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + win(r.win) + '</td><td>' + pnl(r.total) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip"><b>当前实盘做法</b>：现行结算照旧 + 另表记「开盘卖」对照，攒满 30 笔样本外再拍板是否正式切换。</div></div>';
    return h;
  }
  function renderPlaybook() {
    var rows = [
      ['o > c0', '放弃', '高开哪怕 1 分也弃（零容差）'],
      ['o ≤ 止损价', '不开仓', '破止损纪律，放弃'],
      ['c0×0.99 ≤ o < c0', '不买', '小幅低开，历史最大亏损源'],
      ['o = c0', '可买', '平开，按 T+2 开盘卖执行'],
      ['o < c0×0.99', '可买·别当强信号', '低开≥1%，合并平开才转正']
    ];
    var h = '<div class="opt-card"><div class="opt-sec-h">📋 每日 9:25 决策卡（判定规则速查）</div>';
    h += '<table class="opt-tbl">' + tblHead(['开盘情形', '动作', '依据']) + '<tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td style="text-align:left;color:#666;font-size:12px">' + esc(r[2]) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">下单写死四价（限价单）；其余纪律：T+2 开盘无条件卖、外围涨环境回避、组合≥2 只小低开整批放弃。</div></div>';
    return h;
  }

  /* ===================== 主渲染 ===================== */
  V.optimize = {
    title: '策略优化看板',
    desc: '自动买卖副驾驶 · 亏损源 · 持有期 · 环境分层',
    render: function () {
      var style = '<style>' +
        '.opt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}' +
        '.opt-kpi{background:var(--pink-soft,#fff0f5);border:1px solid var(--pink-line,#ffd6e3);border-radius:12px;padding:12px}' +
        '.opt-kpi .l{font-size:12px;color:var(--pink-deep,#f2588a);opacity:.85}' +
        '.opt-kpi .v{font-size:22px;font-weight:700;margin-top:2px}' +
        '.opt-kpi .s{font-size:11px;color:#888;margin-top:2px}' +
        '.opt-card{background:#fff;border:1px solid var(--pink-line,#ffd6e3);border-radius:14px;padding:14px;margin-bottom:14px}' +
        '.opt-sec-h{font-size:15px;font-weight:700;margin:0 0 10px;display:flex;align-items:center;gap:6px}' +
        '.opt-tbl{width:100%;border-collapse:collapse;font-size:13px}' +
        '.opt-tbl th,.opt-tbl td{padding:7px 8px;border-bottom:1px solid var(--pink-line,#ffd6e3);text-align:right}' +
        '.opt-tbl th:first-child,.opt-tbl td:first-child{text-align:left}' +
        '.opt-tbl th{color:var(--pink-deep,#f2588a);font-weight:600}' +
        '.opt-bad{color:#e23b3b;font-weight:700}.opt-good{color:#1f9d55;font-weight:700}.opt-flat{color:#888}' +
        '.opt-inputs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end}' +
        '.opt-inputs label{font-size:12px;color:#666;display:flex;flex-direction:column;gap:3px}' +
        '.opt-inputs input{width:120px;padding:8px;border:1px solid var(--pink-line,#ffd6e3);border-radius:8px;font-size:14px}' +
        '.opt-verdict{border-radius:10px;padding:12px 14px;font-size:15px;font-weight:700;line-height:1.5}' +
        '.opt-verdict.stop{background:#fde8e8;color:#c02929;border:1px solid #f3b5b5}' +
        '.opt-verdict.warn{background:#fff7e0;color:#9a6b00;border:1px solid #f0d98a}' +
        '.opt-verdict.buy{background:#e7f8ee;color:#1f7a45;border:1px solid #a9e0c0}' +
        '.opt-note{font-size:12px;color:#666;margin-top:8px}' +
        '.opt-tip{font-size:12px;background:var(--pink-soft,#fff0f5);border-left:3px solid var(--pink,#ff7fa6);padding:8px 10px;border-radius:6px;margin-top:8px;line-height:1.5}' +
        '.opt-pickrow,.opt-posrow{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--pink-line,#ffd6e3);font-size:13px;flex-wrap:wrap}' +
        '.opt-pickrow b,.opt-posrow b{min-width:80px;display:inline-block}' +
        '.opt-pickrow span,.opt-posrow span{color:#888;font-size:12px}' +
        '.opt-live{font-size:13px;font-weight:600}' +
        '.opt-buybtn,.opt-sellbtn{margin-left:auto;padding:4px 10px;border:1px solid var(--pink,#ff7fa6);background:var(--pink-soft,#fff0f5);color:var(--pink-deep,#f2588a);border-radius:8px;font-size:12px;cursor:pointer}' +
        '.opt-buybtn:disabled{opacity:.5;cursor:default}' +
        '.opt-badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700}' +
        '.opt-badge.buy{background:#e7f8ee;color:#1f7a45}.opt-badge.warn{background:#fff7e0;color:#9a6b00}.opt-badge.stop{background:#fde8e8;color:#c02929}' +
        '.opt-sigtip{font-size:12.5px;color:#555;background:var(--pink-soft,#fff0f5);border:1px solid var(--pink-line,#ffd6e3);border-radius:8px;padding:8px 10px;margin-bottom:8px;line-height:1.6}' +
        '.opt-mode{font-weight:700;color:var(--pink-deep,#f2588a)}' +
        '.opt-sigdate{font-size:11px;font-weight:600;color:#1f7a45;background:#e7f8ee;border:1px solid #a9e0c0;border-radius:10px;padding:1px 8px;margin-left:4px}' +
        '.opt-foot{font-size:11px;color:#999;margin-top:6px;text-align:center}' +
        '.opt-banner{background:linear-gradient(135deg,#fff3f8,#fdeaf3);border:1px solid var(--pink,#ff7fa6);border-radius:14px;padding:12px 14px;margin-bottom:14px}' +
        '.opt-banner-h{font-size:14px;font-weight:700;color:var(--pink-deep,#f2588a);margin-bottom:6px}' +
        '.opt-banner ul{margin:0;padding-left:18px}' +
        '.opt-banner li{font-size:12.5px;line-height:1.7;color:#444}' +
        '.opt-banner b{color:var(--pink-deep,#f2588a)}' +
        '</style>';
      var body = style +
        renderBanner() +
        renderPicksShell() +
        renderPositionsShell() +
        renderDecision() +
        '<div class="opt-card"><div class="opt-sec-h">📊 策略体检报告（静态·不每天变）</div>' +
        renderKpis() + renderLoss() + renderHolding() + renderEnv() + renderPlan() + renderPlaybook() +
        '<div class="opt-foot">数据：台账 ' + D.meta.updated + ' · ' + D.meta.n + ' 笔已结算 · 费 ' +
        D.meta.cost + '%/笔 · 样本仅 ' + D.meta.n + ' 笔未达统计显著（需 ' + D.meta.nNeed +
        ' 笔），结论属线索级，落地前用双口径记账攒样本外验证。</div></div>';
      return '<div class="opt-wrap">' + body + '</div>';
    },
    mount: function (reg) {
      /* 手动决策器 */
      var dec = document.getElementById('optDec');
      function doJudge() {
        var c0 = num(document.getElementById('optC0').value);
        var o = num(document.getElementById('optO').value);
        var stop = num(document.getElementById('optStop').value);
        var r = judge(c0, o, stop);
        var v = document.getElementById('optVerdict');
        v.className = 'opt-verdict ' + r.cls;
        v.innerHTML = r.icon + ' <b>' + esc(r.title) + '</b>' + (r.reason ? '<div style="font-weight:400;margin-top:4px;font-size:13px">' + esc(r.reason) + '</div>' : '');
      }
      var btn = document.getElementById('optJudge');
      if (btn) btn.addEventListener('click', doJudge);
      ['optC0', 'optO', 'optStop'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJudge(); });
      });

      /* 自动买卖副驾驶 */
      var picksBox = document.getElementById('optPicks');
      var posBox = document.getElementById('optPositions');

      function loadPicks() {
        if (!picksBox) return;
        fetch('./api/reports/pick_latest.json?ts=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j) { picksBox.innerHTML = '<div class="opt-note">今日信号未部署或空仓。可手填上方决策器核对。</div>'; return; }
            renderPicks(j, picksBox);
          })
          .catch(function () { picksBox.innerHTML = '<div class="opt-note">今日信号加载失败（未解锁或网络异常）。可手填上方决策器核对。</div>'; });
      }
      function loadPos() { renderPositions(posBox); }
      window.__optRenderPos = loadPos;

      loadPicks();
      loadPos();

      /* 每 10 秒自动刷新行情（开盘价判定 + 卖出判定） */
      if (window.__optTimer) clearInterval(window.__optTimer);
      window.__optTimer = setInterval(function () {
        loadPicks();
        loadPos();
      }, 10000);
    }
  };
})();
