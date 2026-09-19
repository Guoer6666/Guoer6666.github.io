/* ============================================================
   views-life.js · 日常打卡 / 周期挑战 / 兴趣边角
   ============================================================ */

/* ================= 📝 复盘学习笔记 ================= */
V.notes = {
  title: '复盘学习笔记',
  desc: '每日心得记录 · 复利来自复盘',
  render() {
    const rows = Store.rows('notes_log', SEED.notes);
    const days = rows.filter(r => r.date).length;
    return `
      ${UI.kpi([
        { label: '累计笔记', value: days, delta: '篇' },
        { label: '本月记录', value: rows.filter(r => (r.date || '').startsWith(DT.monthKey())).length, delta: DT.monthKey() },
        { label: '今日状态', value: rows.some(r => r.date === DT.today()) ? '<span class="up">已记录</span>' : '<span class="flat">未记录</span>', delta: DT.cnDate() }
      ])}

      ${UI.card({
        title: '✍️ 今日心得',
        sub: '自动保存 · 写完记得归档到下表',
        right: `<button class="btn btn-sm btn-pink" data-act="archive-note">📥 存入笔记本</button>`,
        body: UI.textarea('notes_today',
          '今天学到了什么？\n· 做对的一件事：\n· 做错的一件事：\n· 下次遇到同样情况我会：', 190)
      })}

      ${UI.card({
        title: '📚 笔记本',
        tight: true,
        body: UI.table({
          key: 'notes_log',
          wide: true,
          addLabel: '+ 添加笔记',
          seed: SEED.notes,
          cols: [
            { k: 'date', label: '日期', w: 118, type: 'date' },
            { k: 'topic', label: '主题', w: 130, ph: '如：打板时机' },
            { k: 'type', label: '类型', w: 92, type: 'select', opts: ['技术', '情绪', '资金', '题材', '心态'], center: true },
            { k: 'content', label: '心得内容', w: 300, type: 'textarea' },
            { k: 'rate', label: '价值', w: 82, type: 'select', opts: ['★★★', '★★', '★'], center: true }
          ]
        })
      })}
    `;
  }
};

/* ================= 📝 作息运动记录 ================= */
V.routine = {
  title: '作息运动记录',
  desc: '起床 / 睡觉 / 运动 · 身体是交易的本钱',
  render() {
    const rows = Store.rows('routine_log', SEED.routine);
    const recent = rows.slice(-7);
    const sportDays = recent.filter(r => parseFloat(r.sport) > 0).length;
    const avgSleep = (() => {
      const v = recent.map(r => parseFloat(r.sleepHours)).filter(x => x > 0);
      return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '--';
    })();
    return `
      ${UI.kpi([
        { label: '近7日运动', value: sportDays, delta: '天', dir: sportDays >= 4 ? 'up' : 'down' },
        { label: '平均睡眠', value: avgSleep, delta: '小时/天', dir: parseFloat(avgSleep) >= 7 ? 'up' : 'down' },
        { label: '连续实盘打卡', value: '<b data-streak>—</b>', delta: '天 · 取自台账' },
        { label: '本月记录', value: rows.filter(r => (r.date || '').startsWith(DT.monthKey())).length, delta: '天' }
      ])}

      ${UI.card({
        title: '🛌 作息与运动',
        sub: '早起的人才能吃到早盘的肉',
        tight: true,
        body: UI.table({
          key: 'routine_log',
          wide: true,
          addLabel: '+ 打卡今日',
          seed: SEED.routine,
          onChange: () => App.refresh(),
          cols: [
            { k: 'date', label: '日期', w: 118, type: 'date' },
            { k: 'wake', label: '起床', w: 82, ph: '06:40' },
            { k: 'sleep', label: '睡觉', w: 82, ph: '23:20' },
            { k: 'sleepHours', label: '睡眠(h)', w: 84, type: 'number', num: true },
            { k: 'sport', label: '运动(分钟)', w: 100, type: 'number', num: true },
            { k: 'sportType', label: '运动方式', w: 106, type: 'select', opts: ['跑步', '快走', '健身', '游泳', '骑行', '瑜伽', '无'], center: true },
            { k: 'energy', label: '精力', w: 78, type: 'select', opts: ['充沛', '一般', '疲惫'], center: true },
            { k: 'note', label: '备注', w: 160 }
          ]
        })
      })}

      ${UI.card({
        title: '🎯 作息目标',
        tight: true,
        body: checklist('routine_goals', SEED.routineGoals)
      })}
    `;
  },
  mount() {
    loadLedger().then(function (L) {
      setTxt('[data-streak]', ledgerStreak(L));
    });
  }
};

function streak(rows) {
  const set = new Set(rows.map(r => r.date).filter(Boolean));
  let n = 0, d = new Date();
  for (; ;) {
    const k = `${d.getFullYear()}-${DT.pad(d.getMonth() + 1)}-${DT.pad(d.getDate())}`;
    if (set.has(k)) { n++; d.setDate(d.getDate() - 1); } else break;
    if (n > 400) break;
  }
  return n;
}

/* ============ 自动数据源（接实盘台账 / 选股，免手填） ============ */
let _ledgerPromise = null;
function loadLedger() {
  if (_ledgerPromise) return _ledgerPromise;
  _ledgerPromise = fetch('./api/reports/verify_ledger.json?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
  return _ledgerPromise;
}
function ledgerMonth(L, key) {
  if (!L || !L.period || !L.period.month) return null;
  return L.period.month.filter(function (m) { return m.key === key; })[0] || null;
}
function ledgerStreak(L) {
  if (!L) return 0;
  var set = {};
  (L.history || []).forEach(function (h) {
    if (h.signal_date) set[h.signal_date] = 1;
    if (h.buy_date) set[h.buy_date] = 1;
    if (h.sell_date) set[h.sell_date] = 1;
  });
  (L.days || []).forEach(function (d) { if (d.signal_date) set[d.signal_date] = 1; });
  function fmt(x) { return x.getFullYear() + '-' + DT.pad(x.getMonth() + 1) + '-' + DT.pad(x.getDate()); }
  // 锚点：今天或最近一个有记录的日子（兼容周末/非交易日）
  var anchor = null, t = new Date();
  for (var k = 0; k < 6; k++) {
    if (set[fmt(t)]) { anchor = new Date(t); break; }
    t.setDate(t.getDate() - 1);
  }
  if (!anchor) return 0;
  var n = 0, d = anchor;
  for (;;) {
    if (set[fmt(d)]) { n++; d.setDate(d.getDate() - 1); } else break;
    if (n > 400) break;
  }
  return n;
}
function setTxt(sel, val) { var el = document.querySelector(sel); if (el) el.innerHTML = val; }

/* ================= 📝 交易心态周记 ================= */
V.mindset = {
  title: '交易心态周记',
  desc: '心态评分 + 每周复盘',
  render() {
    const cur = Store.get('mindset_cur', { fomo: 3, patience: 3, discipline: 3, stop: 3, calm: 3 });
    const dims = [
      { k: 'fomo', label: '抗追高（不FOMO）' },
      { k: 'patience', label: '耐心等待信号' },
      { k: 'discipline', label: '执行纪律' },
      { k: 'stop', label: '止损果断' },
      { k: 'calm', label: '亏损后情绪稳定' }
    ];
    const total = dims.reduce((s, d) => s + (parseInt(cur[d.k]) || 0), 0);
    const pct = Math.round(total / (dims.length * 5) * 100);

    return `
      ${UI.card({
        title: '🧠 本周心态评分',
        sub: `${DT.weekKey()} · 每项 1-5 分`,
        right: `<span class="sub">总分 <b class="${pct >= 70 ? 'up' : pct >= 50 ? '' : 'down'}">${total}/25</b></span>`,
        body: dims.map(d => `
          <div style="margin-bottom:13px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <span style="font-size:13px">${d.label}</span>
              <b style="margin-left:auto;font-family:var(--mono);color:var(--pink-deep)">${cur[d.k] || 0}</b>
            </div>
            <input type="range" min="1" max="5" step="1" value="${cur[d.k] || 3}" data-mind="${d.k}"
              style="width:100%;accent-color:var(--pink)">
          </div>`).join('') + `
          <div style="margin-top:6px">
            <div style="font-size:11.5px;color:var(--ink-3);margin-bottom:6px">心态健康度 ${pct}%</div>
            <div class="progress ${pct >= 70 ? 'green' : pct >= 50 ? '' : 'red'}"><i style="width:${pct}%"></i></div>
          </div>`
      })}

      ${UI.card({
        title: '📖 本周复盘',
        sub: '自动保存',
        right: `<button class="btn btn-sm btn-pink" data-act="archive-week">📥 归档本周</button>`,
        body: UI.textarea('mindset_week',
          '这周最失控的一次操作是：\n\n当时的情绪是：\n\n如果重来一次，我会：\n\n下周要改掉的一个动作：', 200)
      })}

      ${UI.card({
        title: '🗓️ 周记归档',
        tight: true,
        body: UI.table({
          key: 'mindset_log',
          wide: true,
          addLabel: '+ 添加周记',
          seed: SEED.mindset,
          cols: [
            { k: 'week', label: '周次', w: 106, ph: '2026-W32' },
            { k: 'score', label: '心态分', w: 84, type: 'number', num: true },
            { k: 'pnl', label: '本周盈亏%', w: 100, type: 'number', num: true, cls: r => UI.dirCls(r.pnl) },
            { k: 'best', label: '做得最好', w: 180 },
            { k: 'worst', label: '最大问题', w: 180 },
            { k: 'fix', label: '下周改进', w: 200 }
          ]
        })
      })}
    `;
  },
  mount() {
    UI.$$('[data-mind]').forEach(el => {
      el.addEventListener('input', () => {
        const cur = Store.get('mindset_cur', {});
        cur[el.dataset.mind] = parseInt(el.value);
        Store.set('mindset_cur', cur);
        App.refresh();
      });
    });
  }
};

/* ================= 🎯 月度交易收益目标（目标自设·当前自动） ================= */
V.goal = {
  title: '月度交易收益目标',
  desc: '目标自设 · 当前收益自动取自实盘台账',
  render() {
    const g = Store.get('goal_' + DT.monthKey(), { target: 10, current: 0, capital: 100000, maxDd: 5 });
    const pct = g.target ? Math.max(0, Math.min(100, (parseFloat(g.current) || 0) / parseFloat(g.target) * 100)) : 0;
    const d = new Date();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const passed = d.getDate();
    const timePct = Math.round(passed / daysInMonth * 100);

    const inp = (k, label, unit, step) => `
      <div class="field">
        <label>${label}${unit ? `（${unit}）` : ''}</label>
        <input type="number" step="${step || 'any'}" data-goal="${k}" value="${UI.esc(g[k] == null ? '' : g[k])}">
      </div>`;

    return `
      ${UI.card({
        title: `🎯 ${DT.monthKey()} 月度目标`,
        sub: `本月已过 ${passed}/${daysInMonth} 天`,
        body: `
          <div class="form-row">
            ${inp('capital', '本金', '元')}
            ${inp('target', '目标收益', '%')}
            ${inp('maxDd', '最大回撤容忍', '%')}
          </div>

          <div class="section-title">时间进度 ${timePct}%</div>
          <div class="progress"><i style="width:${timePct}%;background:linear-gradient(90deg,#c9d4ff,#7f9bff)"></i></div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-top:5px">
            ${pct >= timePct ? '✅ 进度领先于时间，保持节奏' : '⚠️ 进度落后于时间，但不要为了赶进度放大仓位'}
          </div>

          <div class="section-title">折算金额（按目标值估算）</div>
          <div class="kpi-grid">
            ${kpiMini('目标金额', ((parseFloat(g.capital) || 0) * (parseFloat(g.target) || 0) / 100).toFixed(0) + ' 元')}
            ${kpiMini('回撤红线', '-' + UI.num(g.maxDd, 1) + '%', 'down')}
          </div>`
      })}

      ${UI.card({
        title: '📊 本月实盘进度（自动）',
        sub: '当前收益取自 verify_ledger，每日跑批更新',
        tight: true,
        body: '<div data-goal-auto><div class="sm-empty">加载中…</div></div>'
      })}

      ${UI.card({
        title: '📆 月度目标历史',
        tight: true,
        body: UI.table({
          key: 'goal_history',
          wide: true,
          addLabel: '+ 添加月度记录',
          seed: SEED.goalHistory,
          cols: [
            { k: 'month', label: '月份', w: 100, ph: '2026-07' },
            { k: 'target', label: '目标%', w: 80, type: 'number', num: true },
            { k: 'actual', label: '实际%', w: 80, type: 'number', num: true },
            {
              k: 'done', label: '达成', w: 80, center: true, compute: r => {
                const t = parseFloat(r.target), a = parseFloat(r.actual);
                if (isNaN(t) || isNaN(a)) return '--';
                return { text: a >= t ? '达成' : '未达成', cls: a >= t ? 'up' : 'down' };
              }
            },
            { k: 'maxDd', label: '最大回撤%', w: 100, type: 'number', num: true },
            { k: 'review', label: '月度总结', w: 240 }
          ]
        })
      })}
    `;
  },
  mount() {
    UI.$$('[data-goal]').forEach(el => {
      el.addEventListener('change', () => {
        const key = 'goal_' + DT.monthKey();
        const g = Store.get(key, {});
        g[el.dataset.goal] = el.value;
        Store.set(key, g);
        App.refresh();
      });
    });
    loadLedger().then(function (L) {
      var el = document.querySelector('[data-goal-auto]');
      if (!el) return;
      var m = ledgerMonth(L, DT.monthKey());
      if (!m) { el.innerHTML = '<div class="sm-empty">本月暂无实盘结算记录</div>'; return; }
      var cur = (m.total_ret || 0) * 100;
      var g = Store.get('goal_' + DT.monthKey(), {});
      var target = parseFloat(g.target) || 0;
      var pct = target ? Math.min(100, cur / target * 100) : 0;
      var remain = target - cur;
      el.innerHTML =
        '<div class="section-title">实盘收益进度 ' + pct.toFixed(0) + '%</div>'
        + '<div class="progress ' + (pct >= 100 ? 'green' : cur < 0 ? 'red' : '') + '"><i style="width:' + pct + '%"></i></div>'
        + '<div class="kpi-grid">'
        + kpiMini('当前实盘', (cur >= 0 ? '+' : '') + cur.toFixed(2) + '%', cur >= 0 ? 'up' : 'down')
        + kpiMini('月度目标', UI.num(target, 1) + '%')
        + kpiMini('还差', (remain >= 0 ? '+' : '') + remain.toFixed(2) + '%', remain >= 0 ? 'up' : 'down')
        + kpiMini('信号/买入', (m.pick_n || 0) + ' / ' + (m.buy_n || 0))
        + '</div>';
    });
  }
};
function kpiMini(label, value, cls) {
  return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls || ''}" style="font-size:17px">${value}</div></div>`;
}

/* ================= 🎯 短线操作纪律清单 ================= */
V.discipline = {
  title: '短线操作纪律清单',
  desc: '8 条纪律 · 每日逐项检查',
  render() {
    const items = SEED.discipline;
    const key = 'discipline_' + DT.today();
    const state = Store.get(key, {});
    const done = items.filter((_, i) => state[i]).length;
    const pct = Math.round(done / items.length * 100);
    const hist = Store.rows('discipline_log', []);

    return `
      ${UI.card({
        title: `✅ 今日纪律执行 ${done}/${items.length}`,
        sub: DT.cnDate(),
        right: `<button class="btn btn-sm btn-ghost" data-act="save-discipline">存入记录</button>`,
        body: `<div class="progress ${pct === 100 ? 'green' : pct >= 60 ? '' : 'red'}"><i style="width:${pct}%"></i></div>
          <div style="font-size:11.5px;color:var(--ink-3);margin-top:6px">
            ${pct === 100 ? '🎉 全部执行到位，这才是可复制的交易' : pct >= 60 ? '还有几条没做到，盘后想想为什么' : '⚠️ 执行率偏低，明天先只做一条'}
          </div>`
      })}

      <div class="card">
        <div class="card-head"><h3>📋 纪律条目</h3><span class="sub">点击勾选</span></div>
        <div class="check-list">
          ${items.map((it, i) => `
            <div class="check-item ${state[i] ? 'done' : ''}" data-disc="${i}">
              <div class="check-box">✓</div>
              <div>
                <div class="ci-title">${i + 1}. ${UI.esc(it.t)}</div>
                <div class="ci-desc">${UI.esc(it.d)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      ${UI.card({
        title: '📈 执行率记录',
        sub: hist.length ? `已记录 ${hist.length} 天` : '点击上方「存入记录」开始积累',
        tight: true,
        body: UI.table({
          key: 'discipline_log',
          narrow: true,
          addLabel: '+ 手动添加',
          seed: [],
          cols: [
            { k: 'date', label: '日期', w: 118, type: 'date' },
            { k: 'done', label: '完成条数', w: 96, type: 'number', num: true },
            { k: 'rate', label: '执行率%', w: 90, type: 'number', num: true, cls: r => parseFloat(r.rate) >= 80 ? 'up' : 'down' },
            { k: 'broken', label: '破戒的是哪条', w: 200 }
          ]
        })
      })}

      ${UI.card({
        title: '📝 破戒反思',
        sub: '自动保存',
        body: UI.textarea('discipline_note', '今天哪一条没守住？当时在想什么？下次用什么办法拦住自己…', 110)
      })}
    `;
  }
};

/* ================= 🎨 交易素材归档区 ================= */
V.material = {
  title: '交易素材归档区',
  desc: '好图 / 好文 / 好案例 都存这儿',
  render() {
    return `
      ${UI.card({
        title: '💡 今日自动候选（自动）',
        sub: '来自今日个股拆解选股 · 每日跑批更新，免手填',
        tight: true,
        body: '<div data-mat-auto><div class="sm-empty">加载中…</div></div>'
      })}

      ${UI.card({
        title: '🗃️ 素材库',
        sub: '经典案例、图表、金句',
        tight: true,
        body: UI.table({
          key: 'materials',
          wide: true,
          addLabel: '+ 添加素材',
          seed: SEED.materials,
          cols: [
            { k: 'title', label: '标题', w: 150 },
            { k: 'type', label: '类型', w: 96, type: 'select', opts: ['案例', '图表', '文章', '视频', '金句', '数据'], center: true },
            { k: 'tag', label: '标签', w: 120, ph: '打板/情绪周期' },
            { k: 'link', label: '链接', w: 190, ph: 'https://' },
            { k: 'desc', label: '说明', w: 220, type: 'textarea' },
            { k: 'date', label: '收集日期', w: 118, type: 'date' }
          ]
        })
      })}

      ${UI.card({
        title: '💬 灵感速记',
        sub: '自动保存 · 想到什么随手记',
        body: UI.textarea('materials_scratch', '碎片灵感、想验证的假设、想复盘的个股…', 150)
      })}
    `;
  },
  mount() {
    var el = document.querySelector('[data-mat-auto]');
    if (!el) return;
    Promise.all([
      fetch('./api/reports/pick_latest.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('./api/reports/m2560_latest.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var pick = res[0], m2 = res[1], html = '';
      if (pick && pick.dList && pick.dList.length) {
        html += '<div class="section-title">📌 今日个股拆解选股（' + pick.dList.length + '只）</div><div class="news-list">' + pick.dList.slice(0, 8).map(function (p) {
          var adv = (p.advice && p.advice.length) ? p.advice[0] : (p.industry || '');
          return '<div class="news-item"><div class="nt"><span class="dot"></span><h4>' + UI.esc(p.name || '') + ' <span class="tag">' + UI.esc(p.code || '') + '</span> <span class="tag tag-pink">评分' + UI.esc(p.score != null ? p.score : '') + '</span></h4></div><p>' + UI.esc(adv) + '</p></div>';
        }).join('') + '</div>';
      }
      if (m2 && m2.records && m2.records.length) {
        html += '<div class="section-title">🔭 2560 观察池（' + m2.records.length + '只）</div><div class="news-list">' + m2.records.slice(0, 8).map(function (p) {
          return '<div class="news-item"><div class="nt"><span class="dot"></span><h4>' + UI.esc(p.name || '') + ' <span class="tag">' + UI.esc(p.code || '') + '</span> <span class="tag">' + UI.esc(p.status || '') + '</span></h4></div><p>' + UI.esc(p.reason || p.note || '') + '</p></div>';
        }).join('') + '</div>';
      }
      el.innerHTML = html || '<div class="sm-empty">今日暂无选股产出</div>';
    });
  }
};

/* ================= 🎨 AI复盘工具技巧库 ================= */
V.tools = {
  title: 'AI复盘工具技巧库',
  desc: '常用工具链接 + 提效技巧',
  render() {
    const list = Store.rows('tools_list', SEED.tools);
    return `
      ${UI.card({
        title: '🔗 常用工具',
        sub: '点击卡片直接打开',
        right: `<button class="btn btn-sm btn-pink" data-act="add-tool">+ 添加工具</button>`,
        body: list.length ? `<div class="mini-grid">${list.map(t => `
          <div class="mini">
            <button class="mini-del" data-tooldel="${t._id}" title="删除">×</button>
            <h4>${UI.esc(t.icon || '🔧')} ${UI.esc(t.name || '未命名')}</h4>
            <p>${UI.esc(t.desc || '')}</p>
            ${t.url ? `<a href="${UI.esc(t.url)}" target="_blank" rel="noopener">打开 →</a>` : ''}
          </div>`).join('')}</div>`
          : `<div class="empty"><span class="ei">🧰</span>还没有工具，点击右上角添加</div>`
      })}

      ${UI.card({
        title: '💡 AI 复盘提示词',
        sub: '点击右侧复制',
        tight: true,
        body: `<div class="news-list">${SEED.prompts.map((p, i) => `
          <div class="news-item">
            <div class="nt"><span class="dot"></span><h4>${UI.esc(p.t)}</h4></div>
            <p>${UI.esc(p.p)}</p>
            <div class="nm">
              <span class="tag tag-pink">${UI.esc(p.tag)}</span>
              <button class="btn btn-sm btn-ghost" data-copyprompt="${i}">复制提示词</button>
            </div>
          </div>`).join('')}</div>`
      })}

      ${UI.card({
        title: '🛠️ 我的技巧笔记',
        sub: '自动保存',
        body: UI.textarea('tools_note', '哪个工具解决了什么问题？有什么使用小窍门…', 130)
      })}
    `;
  }
};

/* ================= 🎨 实盘每日记录（自动同步） ================= */
V.journal = {
  title: '实盘每日记录',
  desc: '自动同步自实盘台账 · 数据来自 verify_ledger，无需手填',
  render() {
    return `
      ${UI.kpi([
        { label: '累计信号', value: '<b data-j-n>—</b>', delta: '笔', dir: 'up' },
        { label: '胜率', value: '<b data-j-wr>—</b>', delta: '已结算', dir: 'up' },
        { label: '平均收益', value: '<b data-j-avg>—</b>', delta: '每笔', dir: 'up' },
        { label: '止损率', value: '<b data-j-sl>—</b>', delta: '触止损占比', dir: 'down' }
      ])}

      ${UI.card({
        title: '📔 实盘台账（自动）',
        sub: '数据来自 verify_ledger.json，每日跑批自动更新 · 不重复手填',
        tight: true,
        body: '<div data-j-body><div class="sm-empty">加载中…</div></div>'
      })}

      ${UI.card({
        title: '📝 复盘备注',
        sub: '可选 · 自动保存（不影响上方自动数据）',
        body: UI.textarea('journal_note_auto', '对今日实盘的补充感想…', 110)
      })}
    `;
  },
  mount() {
    loadLedger().then(function (L) {
      if (!L) { setTxt('[data-j-body]', '<div class="sm-empty">台账加载失败，请确认已跑批生成 verify_ledger.json</div>'); return; }
      var cum = L.cum || {};
      setTxt('[data-j-n]', cum.n_total != null ? cum.n_total : '—');
      setTxt('[data-j-wr]', cum.win_rate != null ? (cum.win_rate * 100).toFixed(1) + '%' : '—');
      setTxt('[data-j-avg]', cum.avg_ret != null ? (cum.avg_ret >= 0 ? '+' : '') + (cum.avg_ret * 100).toFixed(2) + '%' : '—');
      setTxt('[data-j-sl]', cum.sl_rate != null ? (cum.sl_rate * 100).toFixed(1) + '%' : '—');
      var hist = (L.history || []).slice().sort(function (a, b) { return (b.signal_date || '') > (a.signal_date || '') ? 1 : -1; });
      var rows = hist.map(function (h) {
        var s = h.summary || {};
        var nm = (h.rows && h.rows[0]) ? (h.rows[0].name || h.rows[0].code || '') : '—';
        return '<tr><td>' + UI.esc(h.signal_date || '') + '</td>'
          + '<td>' + UI.esc(nm) + '</td>'
          + '<td>' + (h.rows ? h.rows.length : 0) + '只</td>'
          + '<td>' + (s.win_n || 0) + '/' + (s.pick_n || 0) + '</td>'
          + '<td class="' + ((s.avg_ret || 0) >= 0 ? 'up' : 'down') + '">' + ((s.avg_ret || 0) >= 0 ? '+' : '') + (s.avg_ret * 100).toFixed(2) + '%</td>'
          + '<td>' + (h.settled ? '✅已结算' : '⏳' + UI.esc(h.phase || '')) + '</td></tr>';
      }).join('');
      setTxt('[data-j-body]', '<table class="tbl"><thead><tr><th>信号日</th><th>代表标的</th><th>标的数</th><th>胜/总</th><th>平均收益</th><th>状态</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6">暂无记录</td></tr>') + '</tbody></table>');
    });
  }
};

/* ---------- 通用清单组件 ---------- */
function checklist(key, seed) {
  const state = Store.get(key + '_state', {});
  return `<div class="check-list">${seed.map((it, i) => `
    <div class="check-item ${state[i] ? 'done' : ''}" data-check="${key}" data-i="${i}">
      <div class="check-box">✓</div>
      <div><div class="ci-title">${UI.esc(it.t)}</div><div class="ci-desc">${UI.esc(it.d || '')}</div></div>
    </div>`).join('')}</div>`;
}
