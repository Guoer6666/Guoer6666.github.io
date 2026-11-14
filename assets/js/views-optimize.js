/* ============================================================
   views-optimize.js · 策略优化看板（原生模块，无外部依赖）
   ------------------------------------------------------------
   作用：把 m2560 模型近期优化研究的结论，以「可交互 + 可对照」的方式
        直接呈现在工作台（PC / 手机 PWA 通用）。
   数据来源：reports/verify_ledger.json（台账 2026-11-13，75 笔已结算，
            手续费 0.102%/笔），与 _feasibility_data.json 一致。
   红线：数字全部来自真实回测，未编造；样本仅 75 笔（统计显著需 875 笔），
        结论级别为「线索 / 样本内」，落地前用双口径记账攒样本外验证。
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
  /* 净累计点数上色：负=红(亏损)，正=绿(改善) */
  function pnl(v) {
    if (v == null || isNaN(v)) return '<span class="opt-flat">—</span>';
    var cls = v > 0 ? 'opt-good' : (v < 0 ? 'opt-bad' : 'opt-flat');
    var s = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
    return '<span class="' + cls + '">' + s + '</span>';
  }
  function win(v) {
    if (v == null) return '<span class="opt-flat">—</span>';
    return '<span class="' + (v >= D.meta.breakeven ? 'opt-good' : 'opt-flat') + '">' + v.toFixed(1) + '%</span>';
  }

  /* ---------- 9:25 开盘决策器 ---------- */
  function judge(c0, o, stop) {
    if (!(c0 > 0) || !(o > 0)) {
      return { cls: 'warn', icon: '⚠️', title: '请输入有效的 c0 与 o',
        reason: 'c0 = 信号日收盘价；o = 次日开盘价，均为正数。' };
    }
    if (stop && stop > 0 && o <= stop) {
      return { cls: 'stop', icon: '🔴', title: '不开仓（破止损）',
        reason: 'o=' + o + ' ≤ 止损价 ' + stop + '，触发止损纪律，放弃。' };
    }
    if (o > c0) {
      return { cls: 'stop', icon: '🔴', title: '放弃（高开，零容差）',
        reason: 'o=' + o + ' > c0=' + c0 + '，高开哪怕 1 分钱也放弃（回测显示高开即弃最优）。' };
    }
    if (o === c0) {
      return { cls: 'buy', icon: '🟢', title: '可买（平开）',
        reason: 'o=c0 平开，属可买区间；仍按 T+2 开盘卖纪律执行。' };
    }
    var lowThr = c0 * 0.99;
    if (o >= lowThr) {
      return { cls: 'warn', icon: '🟡', title: '不买（小幅低开 -1%~0%）',
        reason: 'o=' + o + ' 落在 [' + lowThr.toFixed(2) + ', ' + c0.toFixed(2) + ')，即小幅低开——历史最大亏损源（32 笔净 -30%）。建议放弃。' };
    }
    return { cls: 'buy', icon: '🟢', title: '可买（低开≥1%，但别当强信号）',
      reason: 'o=' + o + ' < ' + lowThr.toFixed(2) + '，低开≥1%。可买；但回测显示低开>1% 与平开合并才转正，单独不算强信号。' };
  }

  /* ---------- 各区块渲染 ---------- */
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
    var h = '<div class="opt-card"><div class="opt-sec-h">🔎 亏损源诊断</div>';
    h += '<table class="opt-tbl">' + tblHead(['开盘跳空桶', '笔数', '净累计', '胜率', '说明']) + '<tbody>';
    D.lossSrc.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + pnl(r.total) + '</td><td>' +
        win(r.win) + '</td><td style="text-align:left;color:#888;font-size:12px">' + esc(r.note) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">砍掉「小幅低开」这口坑，整体从 <b>' + pnl(-28.79) +
      '</b> 翻正到 <b>' + pnl(4.54) + '</b>。这是优化第一刀。</div></div>';
    return h;
  }

  function renderHolding() {
    var h = '<div class="opt-card"><div class="opt-sec-h">⏱️ 持有期：开盘卖 vs 现行</div>';
    h += '<table class="opt-tbl">' + tblHead(['方案', '笔数', '胜率', '净累计']) + '<tbody>';
    D.holding.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + win(r.win) + '</td><td>' + pnl(r.total) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">「T+2 开盘无条件卖」把胜率从 37% 拉到 53%，但净累计仅 -0.21%（回测样本短）。' +
      '「开盘卖 + 剔小低开 / 外围跌」净累计转正，但样本仅 30~43 笔，需样本外验证。</div></div>';
    return h;
  }

  function renderEnv() {
    var h = '<div class="opt-card"><div class="opt-sec-h">🌐 环境分层（信号日可见，决定开不开仓）</div>';
    h += '<table class="opt-tbl">' + tblHead(['市场环境', '笔数', '净累计']) + '<tbody>';
    D.env.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + pnl(r.total) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">「大盘涨 + 外围涨」反而最坑（-25.19%）；「隔夜纳指涨>0.5%」后买入净 -38.73%。' +
      '这两类环境应<b>主动回避</b>。纳指与净收益相关系数 r=' + D.corr.r + '（p=' + D.corr.p +
      '），但未过 Bonferroni 校正 ' + D.corr.bonf + '，当线索、不当铁律。</div></div>';
    return h;
  }

  function renderPlan() {
    var h = '<div class="opt-card"><div class="opt-sec-h">🛠️ 落地方案（可行，样本外验证前先用双口径记账）</div>';
    h += '<table class="opt-tbl">' + tblHead(['方案', '笔数', '胜率', '净累计']) + '<tbody>';
    D.plan.forEach(function (r) {
      h += '<tr><td>' + esc(r.label) + '</td><td>' + r.n + '</td><td>' + win(r.win) + '</td><td>' + pnl(r.total) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip"><b>当前实盘做法</b>：现行结算照旧 + 另表记「开盘卖」对照，攒满 30 笔样本外再拍板是否正式切换。' +
      '外围闸门（剔除纳指涨>0.5%）是赔率最优且逻辑最硬的一条，可优先纳入观察。</div></div>';
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
    var h = '<div class="opt-card"><div class="opt-sec-h">📋 每日 9:25 决策卡</div>';
    h += '<table class="opt-tbl">' + tblHead(['开盘情形', '动作', '依据']) + '<tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td style="text-align:left;color:#666;font-size:12px">' + esc(r[2]) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="opt-tip">下单写死四价（限价单）；其余纪律：T+2 开盘无条件卖、外围涨环境回避、组合≥2 只小低开整批放弃。</div></div>';
    return h;
  }

  function renderDecision() {
    var h = '<div class="opt-decision" id="optDec">';
    h += '<div class="opt-sec-h">🎯 9:25 开盘决策器（交互）</div>';
    h += '<div class="opt-inputs">' +
      '<label>信号日收盘 c0<input id="optC0" type="number" step="0.01" placeholder="如 85.75"></label>' +
      '<label>次日开盘 o<input id="optO" type="number" step="0.01" placeholder="如 85.20"></label>' +
      '<label>止损价(可选)<input id="optStop" type="number" step="0.01" placeholder="如 80.95"></label>' +
      '<button class="btn btn-solid" id="optJudge">判定</button>' +
      '</div>';
    h += '<div class="opt-verdict warn" id="optVerdict">输入 c0 与 o，点「判定」看是否开仓。</div>';
    h += '<div class="opt-note">也可在下方「今日信号」直接填开盘价，逐只实时判定。</div>';
    h += '<div id="optPicks" style="margin-top:10px"></div>';
    h += '</div>';
    return h;
  }

  /* ---------- 主渲染 ---------- */
  V.optimize = {
    title: '策略优化看板',
    desc: '9:25决策器 · 亏损源 · 持有期 · 环境分层 · 落地方案',
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
        '.opt-decision{background:#fff;border:1px solid var(--pink-line,#ffd6e3);border-radius:14px;padding:16px;margin-bottom:14px}' +
        '.opt-inputs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end}' +
        '.opt-inputs label{font-size:12px;color:#666;display:flex;flex-direction:column;gap:3px}' +
        '.opt-inputs input{width:120px;padding:8px;border:1px solid var(--pink-line,#ffd6e3);border-radius:8px;font-size:14px}' +
        '.opt-verdict{border-radius:10px;padding:12px 14px;font-size:15px;font-weight:700;line-height:1.5}' +
        '.opt-verdict.stop{background:#fde8e8;color:#c02929;border:1px solid #f3b5b5}' +
        '.opt-verdict.warn{background:#fff7e0;color:#9a6b00;border:1px solid #f0d98a}' +
        '.opt-verdict.buy{background:#e7f8ee;color:#1f7a45;border:1px solid #a9e0c0}' +
        '.opt-note{font-size:12px;color:#666;margin-top:8px}' +
        '.opt-tip{font-size:12px;background:var(--pink-soft,#fff0f5);border-left:3px solid var(--pink,#ff7fa6);padding:8px 10px;border-radius:6px;margin-top:8px;line-height:1.5}' +
        '.opt-pickrow{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--pink-line,#ffd6e3);font-size:13px}' +
        '.opt-pickrow b{min-width:80px;display:inline-block}' +
        '.opt-pickrow input{width:84px;padding:5px;border:1px solid var(--pink-line,#ffd6e3);border-radius:6px}' +
        '.opt-foot{font-size:11px;color:#999;margin-top:6px;text-align:center}' +
        '</style>';
      var body = style +
        renderKpis() +
        renderDecision() +
        renderLoss() +
        renderHolding() +
        renderEnv() +
        renderPlan() +
        renderPlaybook() +
        '<div class="opt-foot">数据：台账 ' + D.meta.updated + ' · ' + D.meta.n + ' 笔已结算 · 费 ' +
        D.meta.cost + '%/笔 · 样本仅 ' + D.meta.n + ' 笔未达统计显著（需 ' + D.meta.nNeed +
        ' 笔），结论属线索级，落地前用双口径记账攒样本外验证。</div>';
      return '<div class="opt-wrap">' + body + '</div>';
    },
    mount: function (reg) {
      var dec = document.getElementById('optDec');
      if (!dec) return;

      function doJudge() {
        var c0 = num(document.getElementById('optC0').value);
        var o = num(document.getElementById('optO').value);
        var stop = num(document.getElementById('optStop').value);
        var r = judge(c0, o, stop);
        var v = document.getElementById('optVerdict');
        v.className = 'opt-verdict ' + r.cls;
        v.innerHTML = r.icon + ' <b>' + esc(r.title) + '</b><div style="font-weight:400;margin-top:4px;font-size:13px">' + esc(r.reason) + '</div>';
      }
      var btn = document.getElementById('optJudge');
      if (btn) btn.addEventListener('click', doJudge);
      ['optC0', 'optO', 'optStop'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJudge(); });
      });

      /* 今日信号自动加载（best-effort，经 crypto-gate 解密） */
      var box = document.getElementById('optPicks');
      function renderPicks(data) {
        if (!box) return;
        var lists = [];
        ['dList', 'cList', 'bList', 'aList'].forEach(function (k) {
          if (data && Array.isArray(data[k])) data[k].forEach(function (it) { lists.push(it); });
        });
        if (!lists.length) {
          box.innerHTML = '<div class="opt-note">今日信号：' +
            (data && data.decision ? esc(data.decision) : '暂无（空仓或数据未就绪）') + '</div>';
          return;
        }
        var html = '<div class="opt-sec-h" style="font-size:13px;margin-top:10px">📡 今日信号（填开盘价实时判定）</div>';
        lists.forEach(function (it, i) {
          var c0 = num(it.close != null ? it.close : it.c0);
          var stop = num(it.stopLoss != null ? it.stopLoss : it.buyLimit);
          var name = it.name || it.code || ('信号' + (i + 1));
          html += '<div class="opt-pickrow" data-c0="' + c0 + '" data-stop="' + stop + '" data-i="' + i + '">' +
            '<b>' + esc(name) + '</b>' +
            '<span style="color:#888">c0 ' + (isNaN(c0) ? '—' : c0.toFixed(2)) + '</span>' +
            '<input placeholder="开盘价" data-pick="' + i + '">' +
            '<span class="opt-pv" style="font-size:12px"></span></div>';
        });
        box.innerHTML = html;
        box.querySelectorAll('input[data-pick]').forEach(function (inp) {
          inp.addEventListener('input', function () {
            var row = inp.closest('.opt-pickrow');
            var c0 = num(row.getAttribute('data-c0'));
            var stop = num(row.getAttribute('data-stop'));
            var o = num(inp.value);
            var r = judge(c0, o, stop);
            var pv = row.querySelector('.opt-pv');
            pv.className = 'opt-pv opt-' + r.cls;
            pv.textContent = (r.cls === 'stop' ? '🔴' : r.cls === 'warn' ? '🟡' : '🟢') + ' ' + r.title;
          });
        });
      }
      try {
        fetch('./api/reports/pick_latest.json?ts=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { renderPicks(j); })
          .catch(function () { if (box) box.innerHTML = '<div class="opt-note">今日信号加载失败（未解锁或网络异常）。</div>'; });
      } catch (e) {
        if (box) box.innerHTML = '<div class="opt-note">今日信号加载失败。</div>';
      }
    }
  };
})();
