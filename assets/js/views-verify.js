/* ============================================================
   views-verify.js · 选股次日验证 · 长期命中率跟踪 + 交易台账
   ------------------------------------------------------------
   读 /api/reports/verify_ledger.json（build_ledger.py 拼装的结构化台账）
   展示：累计战绩 → 买卖规则 → 昨天买入(持仓中) → 今天待执行 → 历史已了结
   每只票展示完整闭环：买入价 → 卖出价 → 收益率 + 止损/达标判定
   ============================================================ */
V.verify = (() => {

  const TS = () => '?ts=' + Date.now();

  /* 相对日期词 */
  const relDay = s => {
    if (!s || s.length < 10) return s || '';
    const t = (_today || new Date().toISOString().slice(0, 10));
    const d1 = new Date(s.slice(0, 10).replace(/-/g, '/'));
    const d0 = new Date(t.replace(/-/g, '/'));
    const diff = Math.round((d1 - d0) / 86400000);
    if (diff === 0) return '今天';
    if (diff === -1) return '昨天';
    if (diff === -2) return '前天';
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    return (d1.getMonth() + 1) + '/' + d1.getDate() + '(' + ['日','一','二','三','四','五','六'][d1.getDay()] + ')';
  };

  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const fmtD = s => {
    if (!s || s.length < 10) return s || '';
    const d = new Date(s.slice(0, 10).replace(/-/g, '/'));
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')';
  };
  const f2 = v => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(2);
  const pctS = v => (v == null || !isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
  const pctP = v => (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%';
  const dirCls = v => (v == null || !isFinite(v)) ? '' : (v > 0 ? 'm26-c-up' : v < 0 ? 'm26-c-down' : '');

  /* 涨跌幅：当日收盘 vs 信号日收盘 */
  const dayChg = r => {
    const c = parseFloat(r.close), s = parseFloat(r.sigClose);
    if (!isFinite(c) || !isFinite(s) || s === 0) return { v: '—', cls: '' };
    const v = (c / s - 1);
    return { v: pctS(v), cls: dirCls(v) };
  };

  /* 单只票完整卡片：行情全貌 + 买入判定 + 收益闭环 */
  function card(r, i) {
    const bought = r.status === 'OK';
    const retTxt = (r.ret == null) ? '—' : pctS(r.ret);
    const sold = r.exit_state === '已卖出';
    const dc = dayChg(r);

    /* 状态徽章 */
    let badge, badgeCls, why;
    if (bought) {
      if (sold) {
        const rp = r.exit_reason === '止损' ? '止损卖出' : r.exit_reason === '达标' ? '达标卖出' : '收盘卖出';
        badge = fmtD(r.exit_date) + ' ' + rp + (r.exit_price != null ? ' @' + f2(r.exit_price) : '');
        badgeCls = r.exit_reason === '止损' ? 'lg-skip' : 'lg-buy';
        why = f2(r.open) + ' → ' + (r.exit_price != null ? f2(r.exit_price) : '—') + '　收益 <b class="' + dirCls(r.ret) + '">' + retTxt + '</b>';
      } else {
        badge = '持仓中 · ' + fmtD(r.exit_date || '') + ' 可卖';
        badgeCls = 'lg-hold';
        why = f2(r.open) + ' → ' + f2(r.close) + '　浮动 <b class="' + dirCls(r.ret) + '">' + retTxt + '</b>';
      }
    } else if (r.status === '未触发') {
      badge = '未买入 · 高开超限'; badgeCls = 'lg-skip';
      why = f2(r.open) + ' > ' + f2(r.buyLimit) + '（超' + ((r.open/r.buyLimit-1)*100).toFixed(1) + '%）按纪律放弃';
    } else if (r.status === '破位回避') {
      badge = '未买入 · 开盘破位'; badgeCls = 'lg-skip';
      why = f2(r.open) + ' ≤ ' + f2(r.stopLoss) + '（低' + ((1-r.open/r.stopLoss)*100).toFixed(1) + '%）直接破位不开仓';
    } else {
      badge = r.status || '数据缺失'; badgeCls = 'lg-skip'; why = '无有效行情数据';
    }

    const slS = r.touch_sl === '是' ? '已触及' : r.touch_sl === '否' ? '未触及' : '—';
    const tgS = r.reach_tg === '是' ? '已到达' : r.reach_tg === '否' ? '未到达' : '—';

    /* 高开超限幅度 / 破位幅度 */
    let gapHtml = '';
    if (!bought && r.buyLimit > 0 && r.open > 0) {
      const gp = ((r.open / r.buyLimit - 1) * 100).toFixed(1);
      gapHtml = '<span class="m26-c-down" style="font-weight:700">+' + gp + '%</span> 超限';
    } else if (!bought && r.stopLoss > 0 && r.open > 0) {
      const gp = ((1 - r.open / r.stopLoss) * 100).toFixed(1);
      gapHtml = '<span class="m26-c-down" style="font-weight:700">-' + gp + '%</span> 破位';
    }

    /* 距离止损/目标的百分比 */
    const slDist = bought && r.stopLoss > 0 ? (((r.low / r.stopLoss - 1)) * 100).toFixed(1) : '';
    const tgDist = bought && r.target > 0 ? (((r.high / r.target - 1)) * 100).toFixed(1) : '';

    return '<div class="lg-card">'
      /* ---- 标题行：名称/代码 + 收盘价 + 涨幅 + 收益 ---- */
      + '<div class="lg-hd"><span class="lg-no">' + (i + 1) + '</span>'
      + '<b>' + (r.name || '—') + '</b><span class="lg-code">' + (r.code || '') + '</span>'
      + '<span class="lg-day-chg ' + dc.cls + '">' + dc.v + '</span>'
      + '<span class="lg-ret ' + dirCls(r.ret) + '">' + retTxt + '</span></div>'

      /* ---- 状态条 ---- */
      + '<div class="lg-badge ' + badgeCls + '">' + badge + '</div>'

      /* ---- 行情五格：开盘/收盘/介入上限/止损/目标 ---- */
      + '<div class="lg-grid5">'
      + '<div class="lg-cell5"><span class="lg-k">开盘价</span><span class="lg-v">' + f2(r.open) + '</span></div>'
      + '<div class="lg-cell5"><span class="lg-k">收盘价</span><span class="lg-v">' + f2(r.close) + '</span></div>'
      + '<div class="lg-cell5"><span class="lg-k">介入上限</span><span class="lg-v m26-c-warn">' + f2(r.buyLimit) + '</span>'
        + (gapHtml ? '<span class="lg-s5">' + gapHtml + '</span>' : '<span class="lg-s5">' + (bought ? '已成交' : '高开放弃') + '</span>')
        + '</div>'
      + '<div class="lg-cell5"><span class="lg-k">止损价</span><span class="lg-v m26-c-down">' + f2(r.stopLoss) + '</span>'
        + (slDist ? '<span class="lg-s5 ' + (parseFloat(slDist) < 0 ? 'm26-c-up' : '') + '">' + (parseFloat(slDist) >= 0 ? '最低距止损 +' + slDist + '%' : '最低破止损 ' + slDist + '%') + '</span>' : '<span class="lg-s5">' + slS + '</span>')
        + '</div>'
      + '<div class="lg-cell5"><span class="lg-k">目标价</span><span class="lg-v m26-c-up">' + f2(r.target) + '</span>'
        + (tgDist ? '<span class="lg-s5 ' + (parseFloat(tgDist) >= 0 ? 'm26-c-up' : '') + '">' + (parseFloat(tgDist) >= 0 ? '最高距目标 -' + tgDist + '%' : '最高破目标 +' + (-parseFloat(tgDist)).toFixed(1) + '%') + '</span>' : '<span class="lg-s5">' + tgS + '</span>')
        + '</div>'
      + '</div>'

      /* ---- 买卖结果行 ---- */
      + '<div class="lg-foot">'
      + (bought ? '买入 <b>@' + f2(r.open) + '</b>　盘中 L:' + f2(r.low) + ' / H:' + f2(r.high) + '　'
        + (sold ? '卖出 <b>@' + (r.exit_price != null ? f2(r.exit_price) : '—') + '</b>' : '现价 <b>' + f2(r.close) + '</b>') + '　' + why
        : why)
      + '</div></div>';
  }

  function render() {
    return `
      <div class="page-head">
        <div>
          <h1 class="page-title">选股次日验证</h1>
          <p class="page-sub">验证盘后选股名单次日实际命中 · 长期准确率跟踪 · 交易台账</p>
        </div>
      </div>
      <div id="verifyRoot" class="verify-root">
        <div class="m26-card"><div class="m26-loading">加载中…</div></div>
      </div>`;
  }

  function mount() {
    const root = document.getElementById('verifyRoot');
    if (!root) return;
    _today = (V && V.store && V.store.DT && V.store.DT.today) ? V.store.DT.today() : new Date().toISOString().slice(0, 10);
    load(root);
    const t = setInterval(() => { if (document.body.contains(root)) load(root); else clearInterval(t); }, 60000);
  }

  let _today = '';

  async function load(root) {
    let html = '';
    try {
      const r = await fetch('/api/reports/verify_ledger.json' + TS(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const LEDGER = await r.json();
      if (!LEDGER || !LEDGER.days) {
        html = '<div class="m26-card"><div class="m26-empty">暂无验证数据。每日 16:15 自动化跑批后自动生成。</div></div>';
        root.innerHTML = html; return;
      }
      _today = _today || (LEDGER.today || '');
      const cum = LEDGER.cum || {};
      const days = LEDGER.days || [];

      /* ① 累计战绩 */
      html += '<div class="m26-sec-t">📊 累计战绩（' + (cum.day_n || 0) + ' 个信号日）</div>';
      if (cum.n_total) {
        html += '<div class="m26-stats">'
          + '<span class="m26-stat">总样本 <b>' + cum.n_total + '</b></span>'
          + '<span class="m26-stat">胜率 <b class="' + dirCls(cum.win_rate - 0.5) + '">' + pctP(cum.win_rate) + '</b></span>'
          + '<span class="m26-stat">平均收益 <b class="' + dirCls(cum.avg_ret) + '">' + pctS(cum.avg_ret) + '</b></span>'
          + '<span class="m26-stat">止损率 <b class="m26-c-down">' + pctP(cum.sl_rate) + '</b></span>'
          + '<span class="m26-stat">达标率 <b class="m26-c-up">' + pctP(cum.tg_rate) + '</b></span>'
          + '</div>';
      }

      /* ② 买卖规则 */
      html += '<div class="lg-rules">'
        + '<div class="lg-rule"><b class="lg-rk">🎯 买入</b><span>下一交易日<b>开盘价 ≤ 介入上限</b>才买；高开超过上限 → <b>放弃不买</b>。介入上限 = 信号日收盘价。</span></div>'
        + '<div class="lg-rule"><b class="lg-rk">🛑 止损</b><span>盘中<b>最低价 ≤ 止损价</b> → 卖出。止损价 = max(最近支撑位×0.99, 信号日收盘×0.93)，取更高者。</span></div>'
        + '<div class="lg-rule"><b class="lg-rk">✅ 达标</b><span>盘中<b>最高价 ≥ 目标价</b> → 卖出。目标价 = 高于现价的最近有效压力位。</span></div>'
        + '<div class="lg-rule"><b class="lg-rk">💰 卖出</b><span>T+1 开盘买入 → <b>T+2 才能卖</b>（A股 T+1）。顺序：<b>止损优先 &gt; 达标 &gt; 收盘价</b>。</span></div>'
        + '</div>';

      /* ③ 昨天选出 → 今天买入（持仓中） */
      const holdDay = days.find(d => d.phase === 'holding');
      if (holdDay) {
        const s = holdDay.summary || {};
        html += '<div class="lg-block">'
          + '<div class="lg-block-t">🟢 昨天 ' + fmtD(holdDay.signal_date) + ' 选出 → ' + relDay(holdDay.buy_date) + ' ' + fmtD(holdDay.buy_date) + ' 开盘买入'
          + '<span class="lg-tag lg-tag-hold">持仓中</span></div>'
          + '<div class="lg-sub">实盘开仓 ' + s.buy_n + '/' + s.pick_n + ' 只'
          + (s.skip_n ? '（' + s.skip_n + ' 只按纪律未买入）' : '')
          + '　平均 <b class="' + dirCls(s.avg_ret) + '">' + pctS(s.avg_ret) + '</b>'
          + '　可卖出日 ' + fmtD(holdDay.sell_date) + '</div>';
        (holdDay.rows || []).forEach((r, i) => { html += card(r, i); });
        html += '<div class="lg-foot">⚠️ 未了结：收益为按最新收盘价计算的<b>预览值</b>，实际卖出价以 ' + fmtD(holdDay.sell_date) + ' 的止损/达标/收盘为准。</div></div>';
      }

      /* ④ 今天选出 → 下个交易日执行 */
      /* 验证页没有今日 D 列表（那是 pickscreen 页的事），这里跳过或提示 */

      /* ⑤ 历史已了结（折叠） */
      const doneDays = days.filter(d => d.phase === 'done');
      if (doneDays.length) {
        html += '<div class="m26-fold" id="vHist"><div class="m26-fold-h" onclick="this.parentElement.classList.toggle(\'m26-open\')">'
          + '📁 历史已了结（' + doneDays.length + ' 批）<span class="m26-fold-arrow">▸</span></div>'
          + '<div class="m26-fold-b">';
        doneDays.forEach(d => {
          const s = d.summary || {};
          html += '<div class="lg-block">'
            + '<div class="lg-block-t">📅 ' + fmtD(d.signal_date) + ' 选出 → ' + fmtD(d.buy_date) + ' 买入'
            + '<span class="lg-tag lg-tag-done">已了结</span></div>'
            + '<div class="lg-sub">开仓 ' + s.buy_n + '/' + s.pick_n + '　止损 ' + s.sl_n + '　达标 ' + s.tg_n
            + '　盈利 ' + s.win_n + '　平均 <b class="' + dirCls(s.avg_ret) + '">' + pctS(s.avg_ret) + '</b></div>';
          (d.rows || []).forEach((r, i) => { html += card(r, i); });
          html += '</div>';
        });
        html += '</div></div>';
      }

    } catch (e) {
      html = '<div class="m26-card"><div class="m26-empty" style="color:var(--red,#e5534c)">加载失败：' + UI.esc(e.message) + '</div></div>';
    }
    root.innerHTML = html || '<div class="m26-card"><div class="m26-empty">暂无数据</div></div>';
  }

  return { title: '选股次日验证', desc: '盘后选股名单次日实际命中率 · 交易台账', render, mount };
})();
