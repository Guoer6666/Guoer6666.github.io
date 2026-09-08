/* ============================================================
   views-m2560.js · 2560战法信号扫描（前端移植版，对应 model_2560_optimized_v2.py v2.1）
   ------------------------------------------------------------
   忠实移植范围（参数与判定逻辑逐项一致）：
     · 6态市场状态机（强势上涨/弱势上涨/中性/高波动/弱势下跌/强势下跌）
       + 连续2日确认平滑切换（高波动立即生效）+ 炸板率情绪修正
     · 波动率分级（low/mid/high）→ 差异化 ATR 止损倍数
     · A/B/C/D 四态筛选（MA25趋势 × 5/60均量 × 20日涨幅上限 × 一字板过滤）
     · D 信号质量过滤 + 综合打分排序
   前端口径说明（如实标注，不虚构）：
     · 回测引擎需全市场历史数据，不在浏览器端运行（可本地运行 Python 原版）
     · 质量过滤的 净利润/利润同比/ROE/负债率/行业排名 维度浏览器接口不可得
       → 仅按「市值 + PE(TTM)」两个已验证维度判定，其余维度标注「未验证」
     · 行业动量维度无可靠浏览器数据源，打分中该项计 0 并如实说明
   数据源：腾讯日K（前复权）/ 腾讯实时行情 / 东财估值（RPT_VALUEANALYSIS_DET）
           / 东财盘口池（炸板率）
   风险提示：纯技术模型输出，不构成任何投资建议。
   ============================================================ */

const M2560 = (() => {

  /* ---------- 参数（与 Python base_params 逐项一致；仓位/成本类属回测配置，前端信号扫描不涉及） ---------- */
  const BASE = {
    ma25_window: 25, ma5v_window: 5, ma60v_window: 60,
    near_pct: 0.015, amp_thresh: 0.05, gain_thresh: 0.02, volume_ratio: 1.2,
    max_20d_return: 0.45, max_gap_up: 0.015,
    stop_loss_pct: 0.03, take_profit_pct: 0.05, trailing_stop_pct: 0.03, max_hold_days: 10,
    atr_window: 14,
    atr_stop_mult_low: 1.5, atr_stop_mult_mid: 2.0, atr_stop_mult_high: 2.5,
    atr_tp_mult: 2.0, tp_min_pct: 0.05, tp_max_pct: 0.15, trailing_atr_mult: 1.5,
    market_ret_thresh: 0.03, market_vol_low: 0.015, market_vol_high: 0.025, high_vol_ret_band: 0.01,
    limit_amp_thresh: 0.005, limit_up_tol: 0.095, limit_down_tol: 0.905,
    break_rate_thresh: 0.35,
    min_market_cap: 50, max_pe_ratio: 200,
    high_vol_pause_open: true, high_vol_max_positions: 2,
    score_weights: {
      trend_strength: 0.25, volume_quality: 0.20, deviation_health: 0.15,
      fundamental: 0.20, industry_momentum: 0.10, low_vol_bonus: 0.10
    }
  };

  /* ---------- 各市场状态参数（与 Python _regime_params 一致） ---------- */
  const REGIME_PARAMS = {
    strong_up:      { near_pct: 0.020, gain_thresh: 0.015, max_20d_return: 0.55, stop_loss_pct: 0.025, take_profit_pct: 0.08, trailing_stop_pct: 0.04, max_hold_days: 15, volume_ratio: 1.1, atr_stop_mult_mid: 2.2, atr_tp_mult: 2.5 },
    weak_up:        { near_pct: 0.018, gain_thresh: 0.018, max_20d_return: 0.50, stop_loss_pct: 0.025, take_profit_pct: 0.06, trailing_stop_pct: 0.035, max_hold_days: 12, volume_ratio: 1.2 },
    neutral:        { near_pct: 0.015, gain_thresh: 0.020, max_20d_return: 0.45, stop_loss_pct: 0.03, take_profit_pct: 0.05, trailing_stop_pct: 0.03, max_hold_days: 10, volume_ratio: 1.2 },
    high_volatility:{ near_pct: 0.010, gain_thresh: 0.025, max_20d_return: 0.30, stop_loss_pct: 0.02, take_profit_pct: 0.04, trailing_stop_pct: 0.02, max_hold_days: 5, volume_ratio: 1.5, atr_stop_mult_mid: 1.8 },
    weak_down:      { near_pct: 0.010, gain_thresh: 0.020, max_20d_return: 0.35, stop_loss_pct: 0.02, take_profit_pct: 0.04, trailing_stop_pct: 0.02, max_hold_days: 5, volume_ratio: 2.0, atr_stop_mult_mid: 1.5 },
    strong_down:    { near_pct: 0.008, gain_thresh: 0.030, max_20d_return: 0.25, stop_loss_pct: 0.015, take_profit_pct: 0.03, trailing_stop_pct: 0.015, max_hold_days: 3, volume_ratio: 2.5, atr_stop_mult_mid: 1.3 }
  };

  const REGIME_META = {
    strong_up:       { label: '强势上涨', cls: 'up',    icon: '🚀' },
    weak_up:         { label: '弱势上涨', cls: 'up',    icon: '📈' },
    neutral:         { label: '中性震荡', cls: 'flat',  icon: '➖' },
    high_volatility: { label: '高波动震荡', cls: 'warn', icon: '⚡' },
    weak_down:       { label: '弱势下跌', cls: 'down',  icon: '📉' },
    strong_down:     { label: '强势下跌', cls: 'down',  icon: '🔻' }
  };

  const STATUS_META = {
    D:              { label: 'D · 稳健买点', cls: 'd',   desc: 'C形态次日放量收阳确认，且通过质量过滤' },
    D_PAUSE:        { label: 'D · 暂停开仓', cls: 'warn', desc: '形态成立，但高波动/强跌市禁止新开仓' },
    D_REJECTED:     { label: 'D · 质量否决', cls: 'rej',  desc: '形态成立，但质量过滤未通过（不判假通过）' },
    C:              { label: 'C · 止跌观望', cls: 'c',   desc: '贴近MA25、振幅收敛、缩量——等次日放量阳线确认' },
    B:              { label: 'B · 等待回踩', cls: 'b',   desc: '多头排列中连阴或缩量回踩，等待企稳' },
    A:              { label: 'A · 观察候选', cls: 'a',   desc: '基础多头条件满足，未出现止跌/启动形态' },
    NONE:           { label: '— · 无信号',   cls: 'none', desc: '趋势/量能/位置基础条件不满足' },
    REJECT_SUSPEND: { label: '停牌',        cls: 'none', desc: '成交量为0，停牌剔除' }
  };

  /* ---------- 数值工具 ---------- */
  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
  function std0(a) { // 与 np.std 一致：总体标准差 ddof=0
    if (!a.length) return NaN;
    const m = mean(a);
    return Math.sqrt(mean(a.map(x => (x - m) * (x - m))));
  }
  function rollMean(arr, w) { // 滚动均值，前 w-1 个为 null（对齐 pandas rolling）
    const out = new Array(arr.length).fill(null);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= w) s -= arr[i - w];
      if (i >= w - 1) out[i] = s / w;
    }
    return out;
  }
  const num = v => (Number.isFinite(v) ? v : null);
  const f2 = v => num(v) == null ? '—' : (+v).toFixed(2);
  const pct1 = v => num(v) == null ? '—' : (v * 100).toFixed(1) + '%';

  /* ---------- 波动率分级（与 _classify_volatility 一致） ---------- */
  function classifyVol(closes) {
    if (!closes || closes.length < 31) return 'mid';
    const rets = [];
    for (let i = closes.length - 30; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
    if (rets.length < 10) return 'mid';
    const v = std0(rets);
    if (v < 0.015) return 'low';
    if (v < 0.035) return 'mid';
    return 'high';
  }
  function atrStopMult(p, volClass) {
    return { low: p.atr_stop_mult_low, mid: p.atr_stop_mult_mid, high: p.atr_stop_mult_high }[volClass] || 2.0;
  }

  /* ---------- ATR（与 _calc_atr 一致） ---------- */
  function calcATR(bars, w) {
    w = w || BASE.atr_window;
    if (!bars || bars.length < 2) return 1.0;
    const last = bars[bars.length - 1];
    if (bars.length < w + 1) return last.c * 0.02;
    const trs = [];
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i], pc = bars[i - 1].c;
      trs.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
    }
    const atr = mean(trs.slice(-w));
    return atr > 0 ? atr : last.c * 0.02;
  }

  function isST(name) {
    if (!name) return false;
    const n = String(name).toUpperCase();
    return n.indexOf('ST') >= 0 || n.indexOf('退') >= 0;
  }

  /* ---------- 一字板/准一字板（与 _is_limit_bar 一致，含原代码判定口径） ---------- */
  function isLimitBar(bars, i, p) {
    if (i <= 0) return false;
    const r = bars[i];
    if (r.h === r.l) return true;
    const prev = bars[i - 1].c;
    if (prev <= 0) return false;
    const amp = (r.h - r.l) / prev;
    if (amp >= p.limit_amp_thresh) return false;
    if (r.c >= prev * p.limit_up_tol) return true;
    if (r.c <= prev * p.limit_down_tol) return true;
    return false;
  }

  /* ---------- 6态市场状态机（与 adapt_params 一致；含平滑切换 + 炸板率情绪修正） ----------
     closesIdx：上证指数日收盘序列（需 ≥61 根）
     emotion：{ breakRate } —— 仅最新一日可得（东财盘口池），历史日不做情绪修正，如实说明 */
  function rawRegime(closes) {
    const n = closes.length;
    const c = closes;
    const ret20 = c[n - 1] / c[n - 21] - 1;
    const ret60 = n >= 61 ? c[n - 1] / c[n - 61] - 1 : ret20;
    const tail5 = c.slice(n - 5);
    const vol5 = std0(tail5) / mean(tail5);
    let st;
    if (ret20 > BASE.market_ret_thresh && vol5 < BASE.market_vol_low) {
      st = ret60 > 0.10 ? 'strong_up' : 'weak_up';
    } else if (ret20 < -BASE.market_ret_thresh && vol5 > BASE.market_vol_high) {
      st = ret60 < -0.15 ? 'strong_down' : 'weak_down';
    } else if (Math.abs(ret20) < BASE.high_vol_ret_band && vol5 > BASE.market_vol_high) {
      st = 'high_volatility';
    } else {
      st = 'neutral';
    }
    return { st, ret20, ret60, vol5 };
  }

  function regime(closesIdx, emotion) {
    if (!closesIdx || closesIdx.length < 61) {
      return { ok: false, state: 'neutral', params: Object.assign({}, BASE, REGIME_PARAMS.neutral), note: '指数K线样本不足（<61根），状态机降级为中性' };
    }
    let last = 'neutral';
    const hist = [];
    for (let i = 60; i < closesIdx.length; i++) {
      const r = rawRegime(closesIdx.slice(0, i + 1));
      let st = r.st;
      // 情绪修正（仅最新一日有真实炸板率）
      if (i === closesIdx.length - 1 && emotion && Number.isFinite(emotion.breakRate)) {
        if (emotion.breakRate > BASE.break_rate_thresh && (st === 'strong_up' || st === 'weak_up')) st = 'high_volatility';
        if (emotion.breakRate < 0.10 && st === 'weak_up') st = 'neutral';
      }
      // 平滑切换：连续2日确认（高波动立即生效）
      if (hist.length >= 3 && st !== last && st !== 'high_volatility') {
        const recent = hist.slice(-3);
        if (recent.filter(x => x === st).length < 2) st = last;
      }
      last = st;
      hist.push(st);
    }
    const fin = rawRegime(closesIdx);
    return {
      ok: true, state: last,
      params: Object.assign({}, BASE, REGIME_PARAMS[last]),
      ret20: fin.ret20, ret60: fin.ret60, vol5: fin.vol5,
      rawToday: fin.st, smoothed: last !== fin.st,
      histTail: hist.slice(-5)
    };
  }

  /* ---------- 核心筛选（与 screen() 一致） ----------
     bars: [{d,o,h,l,c,v}] 已按日期升序；name 用于 ST 过滤；p 为状态机调整后的参数 */
  function screen(bars, name, p) {
    const b = bars.filter(x => x.c > 0 && x.o > 0);
    if (b.length < 46) return { ok: false, reason: 'K线样本不足（' + b.length + '<46 根），无法计算' };
    const n = b.length;
    const close = b.map(x => x.c), vol = b.map(x => x.v);
    const ma25 = rollMean(close, p.ma25_window);
    const ma5v = rollMean(vol, p.ma5v_window);
    const ma60v = rollMean(vol, p.ma60v_window);
    const st = isST(name);

    const rows = [];
    for (let i = 0; i < n; i++) {
      const r = b[i];
      const suspend = !(r.v > 0);
      const trendUp = i >= 1 && ma25[i] != null && ma25[i - 1] != null && ma25[i] > ma25[i - 1];
      const volOk = ma5v[i] != null && ma60v[i] != null && ma5v[i] > ma60v[i];
      const ret20 = i >= 20 ? close[i] / close[i - 20] - 1 : null;
      const notHigh = ret20 != null && ret20 <= p.max_20d_return;
      const base = trendUp && volOk && notHigh && !st && !suspend;
      const deviation = ma25[i] ? (close[i] - ma25[i]) / ma25[i] : null;
      const amp = i >= 1 ? (r.h - r.l) / close[i - 1] : null;
      const shrink = ma5v[i] != null && r.v < ma5v[i];
      const invalid = isLimitBar(b, i, p);

      const isC = base && deviation != null && Math.abs(deviation) < p.near_pct
        && amp != null && amp < p.amp_thresh && shrink && !invalid;

      const gain = i >= 1 ? close[i] / close[i - 1] - 1 : null;
      const body = i >= 1 ? (r.c - r.o) / close[i - 1] : null;
      const todayBuy = i >= 1 && r.c > r.o && gain != null && gain >= p.gain_thresh
        && body != null && body >= 0.01 && r.v > vol[i - 1] * p.volume_ratio && !invalid;
      const prevC = i >= 1 && rows[i - 1] ? rows[i - 1].isC : false;
      const isD = base && prevC && todayBuy;

      const twoDn = i >= 2 && close[i] < close[i - 1] && close[i - 1] < close[i - 2];
      const isB = base && ma25[i] != null && close[i] > ma25[i]
        && deviation != null && Math.abs(deviation) <= (p.b_band || 0.08)
        && (twoDn || shrink) && !invalid && !isC;

      const isA = base && !isB && !isC && !isD && !invalid;

      rows.push({ isC, isD, isB, isA, base, invalid, suspend, deviation, amp, ret20, ma25: ma25[i], ma5v: ma5v[i], ma60v: ma60v[i] });
    }
    return { ok: true, bars: b, rows, closes: close };
  }

  /* ---------- 当日信号（与 get_signal_today 一致；质量过滤外置） ---------- */
  function signalToday(bars, name, reg) {
    const p = reg.params;
    const sc = screen(bars, name, p);
    if (!sc.ok) return { ok: false, reason: sc.reason };
    const i = sc.rows.length - 1;
    const t = sc.rows[i];
    const bar = sc.bars[i];

    const sig = {
      ok: true,
      date: bar.d,
      close: bar.c,
      ma25: num(t.ma25),
      deviation: num(t.deviation),
      ret20: num(t.ret20),
      isST: isST(name),
      isSuspend: t.suspend,
      buyLimit: bar.c * (1 + p.max_gap_up),
      stopLoss: t.ma25 != null ? t.ma25 * (1 - p.stop_loss_pct) : null,
      volClass: classifyVol(sc.closes),
      atr: calcATR(sc.bars, p.atr_window),
      flags: { base: t.base, isA: t.isA, isB: t.isB, isC: t.isC, isD: t.isD, invalid: t.invalid },
      klN: sc.bars.length
    };

    if (sig.isSuspend) { sig.status = 'REJECT_SUSPEND'; sig.qualityReason = '停牌'; return sig; }
    if (t.isC) sig.status = 'C';
    else if (t.isB) sig.status = 'B';
    else if (t.isA) sig.status = 'A';
    else sig.status = 'NONE';

    if (t.isD) {
      // 高波动/强势下跌禁止新开仓（与 Python 一致）
      if (p.high_vol_pause_open && (reg.state === 'high_volatility' || reg.state === 'strong_down')) {
        sig.status = 'D_PAUSE';
        sig.qualityReason = REGIME_META[reg.state].label + '市禁止开仓';
        return sig;
      }
      sig.status = 'D_PENDING'; // 待质量过滤
    }
    return sig;
  }

  /* ---------- 质量过滤（前端诚实版：仅市值 + PE 两个可得维度，其余标注未验证） ---------- */
  function qualityFront(val) {
    if (!val || (num(val.mcap) == null && num(val.pe) == null)) {
      return { verdict: 'unknown', pass: false, reason: '东财估值接口无数据，质量维度整体未验证（不判假通过）', score: 0 };
    }
    if (num(val.mcap) != null && val.mcap < BASE.min_market_cap) {
      return { verdict: 'fail', pass: false, reason: '总市值 ' + val.mcap.toFixed(0) + ' 亿 < ' + BASE.min_market_cap + ' 亿', score: 0 };
    }
    if (num(val.pe) != null && (val.pe > BASE.max_pe_ratio || val.pe <= 0)) {
      return { verdict: 'fail', pass: false, reason: 'PE(TTM)=' + val.pe.toFixed(1) + '（>200 或 ≤0，失真/超标）', score: 0 };
    }
    // 部分得分：市值(≤20) + PE(≤15)，折算满分 100 并如实标注口径
    let part = 0, dims = 0;
    if (num(val.mcap) != null) { part += Math.min(val.mcap / 500 * 20, 20); dims += 20; }
    if (num(val.pe) != null) { part += val.pe > 10 ? Math.max(0, 15 - (val.pe - 10) * 0.5) : 15; dims += 15; }
    const score = dims > 0 ? Math.round(part / dims * 1000) / 10 : 0;
    return {
      verdict: 'pass_partial', pass: true,
      reason: '市值+PE 两维度通过；净利润/利润同比/ROE/负债率/行业排名未获取（未验证维度不计分、不否决）',
      score
    };
  }

  /* ---------- 信号综合打分（与 score_signal 一致；行业动量前端不可得计 0 并标注） ---------- */
  function scoreSignal(sig, bars, name, reg, fundScore) {
    const p = reg.params, w = BASE.score_weights;
    const sc = screen(bars, name, p);
    if (!sc.ok) return 0;
    const n = sc.bars.length;
    const i = n - 1;
    const t = sc.rows[i];
    let total = 0;

    // 1. 趋势强度
    if (i >= 5 && t.ma25 != null && sc.rows[i - 5].ma25 != null) {
      const slope = t.ma25 / (sc.rows[i - 5].ma25 + 1e-9) - 1;
      const recent = sc.closes.slice(Math.max(0, n - 20));
      const lo = Math.min.apply(null, recent), hi = Math.max.apply(null, recent);
      const posPct = recent.length > 1 ? (sc.closes[i] - lo) / (hi - lo + 1e-9) : 0.5;
      const ts = (Math.min(Math.max(slope * 100, 0), 10) + posPct * 10) / 20;
      total += ts * 100 * w.trend_strength;
    }
    // 2. 量能
    if (t.ma5v != null && t.ma60v != null) {
      const vr = t.ma5v / (t.ma60v + 1e-9);
      total += Math.min(vr / 2.0, 1.0) * 100 * w.volume_quality;
    }
    // 3. 偏离健康度
    if (t.deviation != null) {
      total += Math.max(0, 1 - Math.abs(t.deviation) / 0.05) * 100 * w.deviation_health;
    }
    // 4. 基本面（前端部分维度折算分）
    total += (fundScore || 0) * w.fundamental;
    // 5. 行业动量：浏览器端无可靠数据源，计 0（如实标注）
    // 6. 低波动加分
    const lvs = { low: 100, mid: 60, high: 30 }[sig.volClass] || 50;
    total += lvs * w.low_vol_bonus;

    return Math.round(total * 10) / 10;
  }

  /* ---------- 全市场粗筛门槛（工作台增强，针对三大致命缺陷，非原模型参数） ----------
     流动性陷阱防护：成交额≥2亿、总市值≥80亿、股价≥3元、上市≥120天（剔除次新/仙股/微盘）
     范围：沪深主板+创业板+科创板（不含北交所，东财 fs 口径）；ST/退市按名称剔除 */
  const COARSE = { minPrice: 3, minAmount: 2e8, minMcap: 80e8, minListDays: 120, cap: 500 };

  /* ---------- 全市场精筛宽松口径（工作台增强，参考「2560战法·每日精选」规则概要） ----------
     观察层（A/B/C）基础条件对齐参考报告：25日线向上 ∧ 5均量>60均量（不做20日涨幅硬剔除）；
     C 贴线阈值 ×1.5（封顶3%），B 偏离带 8%→12%；
     D 买点纪律不放宽：20日涨幅阈值、放量/涨幅/量比阈值、质量过滤与打分全部维持原模型口径 */
  function relaxParams(p) {
    return Object.assign({}, p, {
      near_pct: Math.min(p.near_pct * 1.5, 0.03),
      b_band: 0.12,
      max_20d_return: Infinity
    });
  }

  return { BASE, REGIME_PARAMS, REGIME_META, STATUS_META, regime, signalToday, qualityFront, scoreSignal, calcATR, atrStopMult, classifyVol, isST, f2, pct1, COARSE, relaxParams };
})();

/* ============================================================
   V.m2560 · 视图：市场状态机 + 股票池 + 信号扫描结果
   ============================================================ */
V.m2560 = {
  title: '2560战法信号',
  desc: 'MA25趋势 × 量能 × 位置 · A/B/C/D四态 · 6态市场状态机 · 真实数据可复核',

  _scanning: false,

  /* ---------- 数据获取 ---------- */
  // K线三源降级链：腾讯镜像(ifzq.gtimg.cn，绕WAF) → 腾讯web(web.ifzq) → 东财push2his
  // 任一源成功即返回；全部失败抛最后一个错误。CORS：腾讯系与东财均支持跨域。
  _klineSrc: null, // 记录最近一次成功源（统计用）
  async _kline(nc, n) {
    const code6 = nc.slice(2);
    const isSh = nc.startsWith('sh');
    const txUrlMirror = 'https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + nc + ',day,,,' + n + ',qfq&_=' + Date.now();
    const txUrlWeb    = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + nc + ',day,,,' + n + ',qfq&_=' + Date.now();
    const secid = (isSh ? '1.' : '0.') + code6;
    const emUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + secid
      + '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=0&end=20500101&lmt=' + n + '&_=' + Date.now();

    const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
    const tryTx = async (u, label) => {
      const res = await Promise.race([fetch(u, { cache: 'no-store' }), timeout(12000)]);
      const j = await res.json();
      const d = j && j.data && j.data[nc];
      const arr = d && (d.qfqday || d.day);
      if (!Array.isArray(arr) || !arr.length) throw new Error(label + ' K线为空');
      return arr.map(a => ({ d: a[0], o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }))
        .filter(b => Number.isFinite(b.c) && Number.isFinite(b.o) && Number.isFinite(b.h) && Number.isFinite(b.l));
    };
    const tryEm = async (u, label) => {
      const res = await Promise.race([fetch(u, { cache: 'no-store' }), timeout(12000)]);
      const j = await res.json();
      const list = j && j.data && j.data.klines;
      if (!Array.isArray(list) || !list.length) throw new Error(label + ' K线为空');
      return list.map(s => { const a = String(s).split(','); return { d: a[0], o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }; })
        .filter(b => Number.isFinite(b.c) && Number.isFinite(b.o) && Number.isFinite(b.h) && Number.isFinite(b.l));
    };

    const chain = [
      ['腾讯镜像', txUrlMirror, tryTx],
      ['腾讯web', txUrlWeb, tryTx],
      ['东财push2his', emUrl, tryEm],
    ];
    let lastErr;
    for (const [label, u, fn] of chain) {
      try {
        const out = await fn(u, label);
        this._klineSrc = label;
        return out;
      } catch (e) { lastErr = new Error(label + ':' + e.message); }
    }
    throw lastErr || new Error('K线获取失败（三源均不可用）');
  },

  async _valuation(code6, secu) {
    const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=ALL'
      + '&filter=' + encodeURIComponent('(SECUCODE="' + secu + '")')
      + '&pageNumber=1&pageSize=3&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB&_=' + Date.now();
    const res = await Promise.race([fetch(url, { cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
    const j = await res.json();
    const list = (j && j.result && j.result.data) || [];
    if (!list.length) return null;
    const cur = list[0];
    return {
      date: String(cur.TRADE_DATE || '').slice(0, 10),
      pe: cur.PE_TTM != null ? +cur.PE_TTM.toFixed(1) : null,
      mcap: cur.TOTAL_MARKET_CAP != null ? +(cur.TOTAL_MARKET_CAP / 1e8).toFixed(0) : null
    };
  },

  /* ---------- 全市场快照（东财 clist，按成交额降序翻页，取到低于粗筛门槛即停） ---------- */
  async _snapshot(say) {
    const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'; // 沪深主板+创业板+科创板（不含北交所）
    const fields = 'f12,f14,f2,f3,f6,f7,f8,f10,f20,f26,f100'; // f100=所属行业
    const all = [];
    for (let pn = 1; pn <= 40; pn++) {
      const base = 'https://push2.eastmoney.com/api/qt/clist/get?np=1&fltt=2&invt=2&fid=f6&po=1&pz=100&pn=' + pn
        + '&fs=' + encodeURIComponent(fs) + '&fields=' + fields + '&_=' + Date.now();
      const urls = [base, base.replace('push2.eastmoney.com', 'push2delay.eastmoney.com')];
      let rows = null;
      for (const u of urls) {
        try {
          const res = await Promise.race([fetch(u, { cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
          const j = await res.json();
          const list = j && j.data && j.data.diff;
          if (Array.isArray(list) && list.length) { rows = list; break; }
        } catch (e) { /* 换源 */ }
      }
      if (!rows) { if (pn === 1) throw new Error('全市场快照获取失败（东财 clist 双源均不可用）'); break; }
      all.push(...rows);
      if (say) say('全市场快照 ' + all.length + ' 只（第 ' + pn + ' 页）…');
      const lastAmt = rows[rows.length - 1].f6;
      if (!Number.isFinite(lastAmt) || lastAmt < 1.5e8) break; // 成交额已降到粗筛门槛以下区间
      if (all.length >= 800) break; // 封顶防失控
    }
    return all;
  },

  /* ---------- 后端预计算扫描（run_m2560.py 产出 m2560_latest.json） ---------- */
  /* 2560 模块为完全独立后端模块：浏览器不再直连腾讯/东财（WAF 拦截），
     改为读取后端预计算 JSON，渲染层(Store 形状)完全复用。 */
  _backendScanning: false,
  async backendScan(showToast) {
    if (this._backendScanning) return;
    /* 若用户手动清除了结果，自动跟随恢复时不强制刷新页面（避免闪烁循环） */
    const forceRefresh = !this._userCleared;
    this._backendScanning = true;
    const prog = UI.$('#m26fullprog');
    const say = t => { if (prog) prog.textContent = t; };
    say('从后端读取预计算扫描结果…');
    try {
      const jsonUrl = '/api/reports/m2560_latest.json?ts=' + Date.now();
      const res = await Promise.race([
        fetch(jsonUrl, { cache: 'no-store' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('读取超时(12s)')), 12000))
      ]);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || !data.regime) throw new Error('后端 JSON 结构异常');

      /* 数据未变则跳过刷新（避免每90秒全页面重渲染导致闪烁） */
      const prev = Store.get('m2560_full', null);
      if (prev && prev.date === data.date && prev.runAt === data.runAt
          && !showToast && !forceRefresh) {
        this._backendScanning = false;
        return;
      }

      const st = data.regime.state || 'neutral';
      const rp = M2560.REGIME_PARAMS[st] || M2560.REGIME_PARAMS.neutral;
      const regimeBlock = {
        ok: !!data.regime.ok, state: st, idxDate: data.regime.idxDate || '',
        ret20: data.regime.ret20 || 0, ret60: 0, vol5: data.regime.vol5 || 0,
        breakRate: null, emoNote: '后端预计算（每日 16:20 跑批）',
        params: {
          gain_thresh: rp.gain_thresh, volume_ratio: rp.volume_ratio,
          stop_loss_pct: rp.stop_loss_pct, max_hold_days: rp.max_hold_days,
          trailing_stop_pct: rp.trailing_stop_pct, take_profit_pct: rp.take_profit_pct,
          near_pct: rp.near_pct, near_pct_obs: rp.near_pct, b_band_obs: 0.08,
          max_20d_return: rp.max_20d_return
        }
      };
      // 渲染层同时读 m2560_result.regime 与 m2560_full.regime，两份都写
      Store.set('m2560_result', { date: data.date, runAt: data.runAt, regime: regimeBlock });
      // 防御性适配：stats/列表项缺字段时补 fallback，避免页面出现 undefined
      const s0 = data.stats || {};
      const stats = Object.assign({
        klineOk: (s0.coarseN || 0) - (s0.kFail || 0),
        baseAll: (s0.dN || 0) + (s0.cN || 0) + (s0.bN || 0) + (s0.aN || 0),
        dropped: (s0.snapN || 0) - (s0.coarseN || 0),
        cAll: s0.cN, bAll: s0.bN, aAll: s0.aN, noneAll: s0.noneN,
        rejN: s0.noneN || 0, pausedN: 0
      }, s0);
      const fixRow = r => {
        // amount/mcap 若仍是元单位（>1e6）自动转亿
        if (r.amount > 1e6) r.amount = +(r.amount / 1e8).toFixed(1);
        if (r.mcap > 1e6) r.mcap = +(r.mcap / 1e8).toFixed(0);
        if (r.resist == null) r.resist = r.close;
        if (!r.date) r.date = data.date || '';
        return r;
      };
      Store.set('m2560_full', {
        date: data.date, runAt: data.runAt,
        regime: regimeBlock,
        stats: stats,
        recs: (data.recs || []).map(fixRow), cands: (data.cands || []).map(fixRow),
        bList: (data.bList || []).map(fixRow), aList: (data.aList || []).map(fixRow),
        paused: [], failSample: data.failSample || []
      });
      const sc = data.stats || {};
      if (showToast) UI.toast('已重新载入今日快照（云端为每日跑批静态数据，无实时重算）');
    } catch (e) {
      UI.toast('后端扫描读取失败：' + e.message + '（可能尚未跑批，每日 16:20 自动生成）');
    } finally {
      this._backendScanning = false;
      /* 用户手动清除后，自动恢复数据但不刷新页面（避免闪烁）；手动点"重新精筛"时 forceRefresh=true 正常刷新 */
      if (forceRefresh) App.refresh();
    }
  },

  /* ---------- 双系统胜率对比数据加载（2560 与盘后个股筛选各自独立，不串台） ---------- */
  async loadVerifyData() {
    const load = async (url, key) => {
      try {
        const r = await fetch(url + '?ts=' + Date.now(), { cache: 'no-store' });
        if (r.ok) Store.set(key, await r.json());
      } catch (e) { /* 文件可能尚未生成，忽略 */ }
    };
    await Promise.all([
      load('/api/reports/verify_m2560_track.json', 'm2560_verify'),
      load('/api/reports/verify_track.json', 'pick_verify')
    ]);
    if (current === 'm2560') App.refresh();
  },

  _renderCompare() {
    const m = Store.get('m2560_verify', null);
    const p = Store.get('pick_verify', null);
    const pct = x => (x == null ? '—' : (x * 100).toFixed(1) + '%');
    const sec = (d, label, method) => {
      if (!d) return '<div class="m26-cmp-col"><div class="m26-cmp-h">' + label + '</div>'
        + '<div class="m26-cmp-empty">暂无样本（每日跑批累积中）</div>'
        + '<div class="m26-cmp-method">' + method + '</div></div>';
      const wr = d.win_rate != null ? d.win_rate : (d.n_total ? d.win_total / d.n_total : null);
      return '<div class="m26-cmp-col"><div class="m26-cmp-h">' + label + '</div>'
        + '<div class="m26-cmp-metric"><span>样本</span><b>' + (d.n_total || d.n || 0) + '</b></div>'
        + '<div class="m26-cmp-metric"><span>胜率</span><b class="' + (wr >= 0.5 ? 'm26-c-up' : 'm26-c-down') + '">' + pct(wr) + '</b></div>'
        + '<div class="m26-cmp-metric"><span>平均收益</span><b class="' + ((d.avg_ret || 0) >= 0 ? 'm26-c-up' : 'm26-c-down') + '">' + pct(d.avg_ret) + '</b></div>'
        + '<div class="m26-cmp-method">' + method + '</div></div>';
    };
    return '<div class="card"><div class="card-head"><h3>📊 双系统胜率对比</h3>'
      + '<span class="sub">各自独立验证 · 口径不同仅作参考对比，互不干扰</span></div><div class="card-body">'
      + '<div class="m26-cmp">' + sec(p, '🟦 盘后个股筛选', '次日(T+1)收益率：开盘买入、T+2可卖，看次日收盘')
      + sec(m, '🟥 2560战法' + (m && m.preview ? ' · 预览' : ''), (m && m.preview ? '信号后' + m.hold_days + '日（预览·未满' + (m.canonical_days || 5) + '日）' : '信号后' + (m ? m.hold_days : 5) + '日') + '收益率：趋势回踩确认后最小持有' + (m ? (m.canonical_days || 5) : 5) + '天')
      + '</div>'
      + '<div class="m26-cmp-note">两套系统选股逻辑、持有周期、触发条件完全不同，胜率不可直接横比；此处仅并列展示各自历史表现作为风格参考。2560 为「中短线趋势·非超短」系统。'
      + (m && m.preview ? '<br><b style="color:var(--amber)">⚠️ 2560 当前为预览数据</b>：样本来自 A 观察池（D=0 暂无稳健买点样本），窗口未满 ' + (m.canonical_days || 5) + ' 日，待满期后转正为真实 D 信号胜率。' : '') + '</div>'
      + '</div></div>';
  },

  /* ---------- 全市场精筛主流程（浏览器直连版，已被 backendScan 取代，保留不删） ---------- */
  _fullScanning: false,
  async fullScan() {
    if (this._fullScanning) return;
    this._fullScanning = true;
    const prog = UI.$('#m26fullprog');
    const say = t => { if (prog) prog.textContent = t; };
    try {
      // 1) 市场状态机 + 炸板率情绪修正
      say('获取上证指数K线（状态机）…');
      let reg;
      try {
        const idxBars = await this._kline('sh000001', 130);
        let breakRate = null, emoNote = '炸板率未获取，情绪修正未启用';
        try {
          const br = await Market.breadth();
          if (br && br.ok && Number.isFinite(br.limitUp) && Number.isFinite(br.broken) && (br.limitUp + br.broken) > 0) {
            breakRate = br.broken / (br.limitUp + br.broken);
            emoNote = '炸板率 ' + (breakRate * 100).toFixed(1) + '%（' + br.date + '，东财口径不含ST）';
          }
        } catch (e) { /* 降级 */ }
        reg = M2560.regime(idxBars.map(b => b.c), { breakRate });
        reg.idxDate = idxBars[idxBars.length - 1].d;
        reg.emoNote = emoNote; reg.breakRate = breakRate;
      } catch (e) {
        reg = M2560.regime(null, null);
        reg.emoNote = '指数K线获取失败：' + e.message + '（状态机降级为中性）';
      }
      const p = reg.params;

      // 2) 全市场快照 → 粗筛（流动性陷阱防护）
      const C = M2560.COARSE;
      const snap = await this._snapshot(say);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - C.minListDays);
      const minList = cutoff.getFullYear() * 10000 + (cutoff.getMonth() + 1) * 100 + cutoff.getDate();
      let coarse = snap.filter(d =>
        Number.isFinite(d.f2) && Number.isFinite(d.f6) && Number.isFinite(d.f20)
        && !M2560.isST(d.f14)
        && d.f2 >= C.minPrice
        && d.f6 >= C.minAmount
        && d.f20 >= C.minMcap
        && !(Number.isFinite(d.f26) && d.f26 > minList) // 上市未满120天剔除
      );
      const dropped = snap.length - coarse.length;
      coarse = coarse.slice(0, C.cap); // 快照已按成交额降序，截断至 500
      say('粗筛通过 ' + coarse.length + ' 只，开始K线精筛…');

      // 3) K线精筛（8 并发，观察层宽松口径：对齐参考报告基础条件，D 买点纪律不放宽）
      const pObs = M2560.relaxParams(p);
      const regObs = Object.assign({}, reg, { params: pObs });
      const rows = [];
      let kFail = 0; const failSample = [];
      let done = 0;
      const queue = coarse.slice();
      const worker = async () => {
        while (queue.length) {
          const d = queue.shift();
          const code6 = String(d.f12);
          const nc = (/^6/.test(code6) ? 'sh' : 'sz') + code6;
          try {
            const bars = await this._kline(nc, 160);
            const sig = M2560.signalToday(bars, d.f14, regObs);
            if (!sig.ok) throw new Error(sig.reason);
            rows.push({
              code: code6, name: d.f14 || code6, industry: d.f100 || '',
              amount: +(d.f6 / 1e8).toFixed(1), mcap: +(d.f20 / 1e8).toFixed(0),
              chgPct: d.f3, turnoverR: d.f8, volR: d.f10,
              status: sig.status, date: sig.date, close: sig.close, ma25: sig.ma25,
              deviation: sig.deviation, ret20: sig.ret20, volClass: sig.volClass, atr: sig.atr, klN: sig.klN,
              resist: +Math.max.apply(null, bars.slice(-20).map(x => x.h)).toFixed(2), // 短线压力位=近20日最高价
              _bars: bars, _sig: sig
            });
          } catch (e) {
            kFail++;
            if (failSample.length < 8) failSample.push((d.f14 || code6) + '：' + e.message);
          }
          done++;
          if (done % 25 === 0 || done === coarse.length) say('K线精筛 ' + done + '/' + coarse.length + ' …');
        }
      };
      await Promise.all(Array.from({ length: 8 }, () => worker.call(this)));

      // 4) D 候选 → 买点纪律严格校验（20日涨幅阈值不放宽）→ 质量过滤 + 综合打分 + 价位
      rows.forEach(r => {
        if (r.status === 'D_PENDING' && r.ret20 != null && r.ret20 > p.max_20d_return) {
          r.status = 'D_REJECTED';
          r.qualityReason = '20日涨幅 ' + (r.ret20 * 100).toFixed(1) + '% 超状态阈值 ' + (p.max_20d_return * 100).toFixed(0) + '%（买点纪律不放宽）';
        }
      });
      const dPend = rows.filter(r => r.status === 'D_PENDING');
      let qi = 0;
      for (const r of dPend) {
        qi++; say('质量过滤与打分 ' + qi + '/' + dPend.length + ' …');
        const secu = r.code + (/^6/.test(r.code) ? '.SH' : '.SZ');
        const val = await this._valuation(r.code, secu).catch(() => null);
        const qz = M2560.qualityFront(val);
        r.quality = qz; r.valDate = val && val.date; r.pe = val && val.pe;
        if (qz.pass) {
          r.score = M2560.scoreSignal(r._sig, r._bars, r.name, reg, qz.score);
          const vm = M2560.atrStopMult(p, r.volClass);
          r.stopLoss = Math.max(r.ma25 * (1 - p.stop_loss_pct), r.close - vm * r.atr);
          r.target = Math.min(Math.max(r.close + p.atr_tp_mult * r.atr, r.close * (1 + p.tp_min_pct)), r.close * (1 + p.tp_max_pct));
          r.buyLimit = r.close * (1 + p.max_gap_up);
          // R/R 硬约束（与个股拆解选股一致）：盈亏比 < 1.5:1 视为性价比不足，降级为否决，不进 D 买入池
          const rr = (r.target - r.buyLimit) / (r.buyLimit - r.stopLoss);
          r.rr = rr;
          if (!(rr >= 1.5)) {
            r.status = 'D_REJECTED';
            r.qualityReason = '盈亏比 ' + (Number.isFinite(rr) ? rr.toFixed(2) : '∞') + ':1 < 1.5:1（止损空间大于目标空间，性价比不足）';
          } else {
            r.status = 'D';
            // 风控纪律参考（与 Python v2.1 一致）：移动止盈=盈利>3%后从最高点回撤 trailing_stop_pct；强制离场=max_hold_days
            r.trailPct = p.trailing_stop_pct; r.maxHold = p.max_hold_days;
          }
        } else {
          r.status = qz.verdict === 'unknown' ? 'D_PENDING' : 'D_REJECTED';
          r.qualityReason = qz.reason;
        }
      }
      rows.forEach(r => { delete r._bars; delete r._sig; });

      // 5) DCBA 分层（各层内按 |偏离MA25| 升序，贴近25日线优先；精选上限 D8/C15/B15/A12）
      const byDev = (a, b) => Math.abs(a.deviation == null ? 9 : a.deviation) - Math.abs(b.deviation == null ? 9 : b.deviation);
      const recs = rows.filter(r => r.status === 'D').sort((a, b) => b.score - a.score).slice(0, 8);
      const paused = rows.filter(r => r.status === 'D_PAUSE').slice(0, 10);
      const cands = rows.filter(r => r.status === 'C').sort(byDev).slice(0, 15);
      const bList = rows.filter(r => r.status === 'B').sort(byDev).slice(0, 15);
      const aList = rows.filter(r => r.status === 'A').sort(byDev).slice(0, 12);
      const rejN = rows.filter(r => r.status === 'D_REJECTED' || r.status === 'D_PENDING').length;
      const cAll = rows.filter(r => r.status === 'C').length;
      const bAll = rows.filter(r => r.status === 'B').length;
      const aAll = rows.filter(r => r.status === 'A').length;
      const noneAll = rows.filter(r => r.status === 'NONE' || r.status === 'REJECT_SUSPEND').length;
      const baseAll = rows.length - noneAll; // 基础条件达标池（宽松口径：MA25向上 ∧ 5均量>60均量）

      Store.set('m2560_full', {
        date: DT.today(), runAt: DT.stamp(),
        regime: {
          ok: reg.ok, state: reg.state, idxDate: reg.idxDate || '',
          ret20: reg.ret20, vol5: reg.vol5, breakRate: reg.breakRate, emoNote: reg.emoNote,
          params: { gain_thresh: p.gain_thresh, volume_ratio: p.volume_ratio, stop_loss_pct: p.stop_loss_pct, max_hold_days: p.max_hold_days,
            trailing_stop_pct: p.trailing_stop_pct, take_profit_pct: p.take_profit_pct, near_pct: p.near_pct,
            near_pct_obs: pObs.near_pct, b_band_obs: pObs.b_band, max_20d_return: p.max_20d_return }
        },
        stats: { snapN: snap.length, dropped, coarseN: coarse.length, klineOk: rows.length, kFail, baseAll, dPendN: dPend.length, dN: recs.length, pausedN: paused.length, rejN, cN: cands.length, cAll, bN: bList.length, bAll, aN: aList.length, aAll, noneAll },
        recs, cands, bList, aList, paused, failSample
      });
      UI.toast('全市场精筛完成：D ' + recs.length + ' / C ' + cAll + ' / B ' + bAll + ' / A ' + aAll);
    } catch (e) {
      UI.toast('精筛失败：' + e.message);
    } finally {
      this._fullScanning = false;
      App.refresh();
    }
  },

  /* ---------- 扫描主流程 ---------- */
  async scan() {
    if (this._scanning) return;
    const pool = Store.get('m2560_pool', []);
    if (!pool.length) { UI.toast('股票池为空，请先添加标的或从持仓导入'); return; }
    this._scanning = true;
    const prog = UI.$('#m26prog');
    const say = t => { if (prog) prog.textContent = t; };
    const fails = [];
    try {
      say('正在获取上证指数K线（市场状态机）…');
      let reg;
      try {
        const idxBars = await this._kline('sh000001', 130);
        const closes = idxBars.map(b => b.c);
        say('正在获取市场情绪（炸板率修正）…');
        let breakRate = null, emoNote = '炸板率未获取，情绪修正未启用';
        try {
          const br = await Market.breadth();
          if (br && br.ok && Number.isFinite(br.limitUp) && Number.isFinite(br.broken) && (br.limitUp + br.broken) > 0) {
            breakRate = br.broken / (br.limitUp + br.broken);
            emoNote = '炸板率 ' + (breakRate * 100).toFixed(1) + '%（' + br.date + '，东财口径不含ST）';
          }
        } catch (e) { /* 情绪修正降级 */ }
        reg = M2560.regime(closes, { breakRate });
        reg.idxDate = idxBars[idxBars.length - 1].d;
        reg.emoNote = emoNote;
        reg.breakRate = breakRate;
      } catch (e) {
        fails.push({ code: 'sh000001', name: '上证指数', reason: '指数K线获取失败：' + e.message + '（状态机降级为中性）' });
        reg = M2560.regime(null, null);
        reg.emoNote = '指数K线获取失败';
      }

      say('正在批量获取实时行情…');
      const codes = pool.map(x => x.code);
      const pxMap = await Market.priceOf(codes).catch(() => ({}));

      const rows = [];
      let done = 0;
      const runOne = async item => {
        const nc = Market.normalizeCode(item.code);
        const code6 = String(item.code).replace(/^(sh|sz|bj)/i, '');
        try {
          if (!nc || !/^\d{6}$/.test(code6)) throw new Error('代码格式不支持（仅限A股6位代码）');
          const bars = await this._kline(nc, 160);
          const name = item.name || (pxMap[item.code] && pxMap[item.code].name) || '';
          const sig = M2560.signalToday(bars, name, reg);
          if (!sig.ok) throw new Error(sig.reason);
          const row = {
            code: code6, name: name || code6,
            status: sig.status, date: sig.date, close: sig.close, ma25: sig.ma25,
            deviation: sig.deviation, ret20: sig.ret20,
            buyLimit: sig.buyLimit, stopLoss: sig.stopLoss,
            volClass: sig.volClass, atr: sig.atr, klN: sig.klN,
            live: pxMap[item.code] && pxMap[item.code].price != null ? pxMap[item.code].price : null,
            quality: null, score: null
          };
          // D 信号 → 质量过滤 + 综合打分（与 Python 流程一致：仅 D 进入质量过滤与打分排序）
          if (sig.status === 'D_PENDING') {
            const secu = code6 + (nc.indexOf('sh') === 0 ? '.SH' : (nc.indexOf('bj') === 0 ? '.BJ' : '.SZ'));
            const val = await this._valuation(code6, secu).catch(() => null);
            const qz = M2560.qualityFront(val);
            row.quality = qz;
            row.valDate = val && val.date;
            if (qz.pass) {
              row.status = 'D';
              row.score = M2560.scoreSignal(sig, bars, name, reg, qz.score);
            } else {
              row.status = qz.verdict === 'unknown' ? 'D_PENDING' : 'D_REJECTED';
              row.qualityReason = qz.reason;
            }
          }
          rows.push(row);
        } catch (e) {
          fails.push({ code: item.code, name: item.name || '', reason: e.message });
        }
        done++;
        say('扫描中 ' + done + '/' + pool.length + ' …');
      };
      // 并发 4 路
      const queue = pool.slice();
      const workers = [];
      for (let k = 0; k < 4; k++) workers.push((async () => { while (queue.length) await runOne(queue.shift()); })());
      await Promise.all(workers);

      // 排序：D 优先按综合分降序，其余按状态优先级
      const rank = { D: 0, D_PENDING: 1, D_PAUSE: 2, D_REJECTED: 3, C: 4, B: 5, A: 6, NONE: 7, REJECT_SUSPEND: 8 };
      rows.sort((a, b) => (rank[a.status] - rank[b.status]) || ((b.score || 0) - (a.score || 0)));

      Store.set('m2560_result', {
        date: DT.today(), runAt: DT.stamp(),
        regime: {
          ok: reg.ok, state: reg.state, idxDate: reg.idxDate || '',
          ret20: reg.ret20, ret60: reg.ret60, vol5: reg.vol5,
          breakRate: reg.breakRate, emoNote: reg.emoNote,
          rawToday: reg.rawToday, smoothed: reg.smoothed,
          params: {
            near_pct: reg.params.near_pct, gain_thresh: reg.params.gain_thresh,
            volume_ratio: reg.params.volume_ratio, max_20d_return: reg.params.max_20d_return,
            stop_loss_pct: reg.params.stop_loss_pct, take_profit_pct: reg.params.take_profit_pct,
            max_hold_days: reg.params.max_hold_days
          }
        },
        rows, fails
      });
      UI.toast('扫描完成：' + rows.length + ' 只' + (fails.length ? '，失败 ' + fails.length + ' 只（已如实列出）' : ''));
    } catch (e) {
      UI.toast('扫描失败：' + e.message);
    } finally {
      this._scanning = false;
      App.refresh();
    }
  },

  /* ---------- 池管理 ---------- */
  add(code) {
    code = String(code || '').trim();
    const nc = Market.normalizeCode(code);
    const code6 = String(code).replace(/^(sh|sz|bj)/i, '');
    if (!nc || !/^\d{6}$/.test(code6)) { UI.toast('请输入正确的6位A股代码'); return; }
    const pool = Store.get('m2560_pool', []);
    if (pool.some(x => String(x.code).replace(/^(sh|sz|bj)/i, '') === code6)) { UI.toast('已在池中'); return; }
    pool.push({ code: code6, name: '' });
    Store.set('m2560_pool', pool);
    App.refresh();
  },
  remove(code6) {
    Store.set('m2560_pool', Store.get('m2560_pool', []).filter(x => String(x.code).replace(/^(sh|sz|bj)/i, '') !== code6));
    App.refresh();
  },
  importHoldings() {
    const hs = Store.get('holdings', []);
    const pool = Store.get('m2560_pool', []);
    let added = 0;
    hs.forEach(h => {
      const code6 = String(h.code || '').replace(/^(sh|sz|bj)/i, '');
      if (/^\d{6}$/.test(code6) && !pool.some(x => String(x.code).replace(/^(sh|sz|bj)/i, '') === code6)) {
        pool.push({ code: code6, name: h.name || '' });
        added++;
      }
    });
    Store.set('m2560_pool', pool);
    UI.toast(added ? '已导入 ' + added + ' 只' : '持仓中没有可导入的新标的');
    App.refresh();
  },

  act(fn, arg) {
    if (fn === 'scan') this.scan();
    else if (fn === 'fullScan') { this._userCleared = false; this.backendScan(); }
    else if (fn === 'auto') {
      Store.set('m2560_auto', !!arg);
      this._userCleared = false;
      _m2560_paintAutoBar();
      UI.toast(arg ? '已开启自动跟随（交易时段每 90 秒刷新）' : '已关闭自动跟随');
      /* 开启时立即触发一次扫描，不用等下一个 90 秒 tick */
      if (arg) this.backendScan();
    }
    else if (fn === 'clearFull') { this._userCleared = true; Store.del('m2560_full'); App.refresh(); }
    else if (fn === 'add') { const el = UI.$('#m26code'); this.add(el && el.value); }
    else if (fn === 'remove') this.remove(arg);
    else if (fn === 'import') this.importHoldings();
    else if (fn === 'clearResult') { Store.del('m2560_result'); App.refresh(); }
  },

  /* ---------- 渲染（数据优先：首屏=扫描结果，说明折叠置底） ---------- */
  render() {
    const res = Store.get('m2560_result', null);
    const pool = Store.get('m2560_pool', []);
    const full = Store.get('m2560_full', null);
    const autoOn = Store.get('m2560_auto', true);
    const M = M2560.REGIME_META, S = M2560.STATUS_META;
    const reg = (full && full.regime) || (res && res.regime) || null;
    const liveState = reg && reg.state;
    const B0 = M2560.BASE;
    const lp = (k, d) => (reg && reg.params && reg.params[k] != null ? reg.params[k] : d);
    let h = '';

    /* 顶部标识条：明确 2560 是中短线趋势系统、非超短战法，与盘后个股筛选互不串台 */
    h += '<div class="m26-idbar"><span class="m26-id-tag">中短线趋势系统</span>'
      + '<span class="m26-id-note">2560战法 · 趋势回踩+放量确认 · 持仓 5-12 天 · <b>非超短/打板战法</b> · 与「盘后个股筛选」为两套独立体系，互不干扰</span></div>';

    /* ① 全市场精筛结果（首屏最高优先级） */
    if (full) {
      const st = full.stats;
      const noOpen = liveState === 'high_volatility' || liveState === 'strong_down';
      const C0 = M2560.COARSE;
      h += '<div class="card"><div class="card-head"><h3>🌐 全市场精筛结果</h3>'
        + '<span class="sub">' + UI.esc(full.date || '') + ' · 真实数据 · D/C/B/A 四层</span>'
        + '<div class="right">'
        + '<label class="m26-switch" title="交易时段每 90 秒自动重算（收盘后休眠）">'
        + '<input type="checkbox" ' + (autoOn ? 'checked' : '') + ' onchange="V.m2560.act(\'auto\', this.checked)"> 自动跟随</label>'
        + (full ? '<button class="btn btn-sm btn-ghost" onclick="V.m2560.act(\'clearFull\')" title="清除本次扫描结果，保留后端数据">清除结果</button>' : '')
        + '<button class="btn btn-sm btn-solid" onclick="V.m2560.backendScan(true)">' + (this._backendScanning ? '读取中…' : '🔄 重新精筛') + '</button>'
        + '</div></div><div class="card-body">';

      /* 紧凑统计条 */
      h += '<div class="m26-stats">'
        + '<span class="m26-stat m26-stat-hl">🎯 D <b>' + (st.dN || 0) + '</b></span>'
        + '<span class="m26-stat">⚠️ C <b>' + (st.cAll != null ? st.cAll : (st.cN || 0)) + '</b></span>'
        + '<span class="m26-stat">⏳ B <b>' + (st.bAll != null ? st.bAll : (st.bN || 0)) + '</b></span>'
        + '<span class="m26-stat">👁 A <b>' + (st.aAll != null ? st.aAll : (st.aN || 0)) + '</b></span>'
        + (st.rejN ? '<span class="m26-stat">✖ 否决 <b>' + st.rejN + '</b></span>' : '')
        + '<span class="m26-stat">快照 ' + (st.snapN || 0) + ' → 粗筛 ' + (st.coarseN || 0) + ' → K线OK ' + (st.klineOk || 0) + (st.kFail ? ' / 失败' + st.kFail : '') + '</span>'
        + '</div>';

      /* 三大防护条（紧凑） */
      h += '<div class="m26-shields">'
        + '<div class="m26-shield"><div class="m26-shield-t">🌀 震荡市防护</div><div class="m26-shield-d">6态状态机：高波动/强跌市 D 一律暂停开仓'
        + (reg ? '（当前 <b class="' + (noOpen ? 'm26-c-down' : 'm26-c-up') + '">' + ((M[liveState] || {}).label || liveState) + (noOpen ? '·禁止开仓' : '·允许开仓') + '</b>）' : '') + '</div></div>'
        + '<div class="m26-shield"><div class="m26-shield-t">⚔️ 内卷防护</div><div class="m26-shield-d">买入上限=收盘×' + (1 + M2560.BASE.max_gap_up) + '，次日高开破限放弃不追价</div></div>'
        + '<div class="m26-shield"><div class="m26-shield-t">🕳️ 流动性防护</div><div class="m26-shield-d">门槛：成交额≥' + (C0.minAmount / 1e8) + '亿 ∧ 市值≥' + (C0.minMcap / 1e8) + '亿 ∧ 股价≥' + C0.minPrice + '元' + (full ? '（本次剔除 ' + st.dropped + ' 只）' : '') + '</div></div>'
        + '</div>';

      /* D / A / C / B 表 */
      h += this._renderDTable(full.recs || [], reg);
      h += this._renderObsTable('👁 A · 观察候选', full.aList || [], '趋势正常，远离25日线不追高');
      if (full.cands && full.cands.length) h += this._renderObsTable('⚠️ C · 止跌观望', full.cands, '25日线附近缩量止跌，仅观察、禁止买入');
      if (full.bList && full.bList.length) h += this._renderObsTable('⏳ B · 等待回踩', full.bList, '回调缩量靠近25日线，等待企稳');
      if (full.paused && full.paused.length) {
        h += '<div class="m26-sec-t">⏸️ D信号但暂停开仓（状态机防护，' + full.paused.length + ' 只）</div><div class="m26-paused-list">' + full.paused.map(r => '<span class="m26-chip">' + UI.esc(r.name) + ' <i>' + UI.esc(r.code) + '</i></span>').join('') + '</div>';
      }
      if (full.failSample && full.failSample.length) {
        h += '<div class="m26-fails"><b>K线获取失败（' + st.kFail + ' 只）：</b>' + full.failSample.map(x => '<div class="m26-fail-item">· ' + UI.esc(x) + '</div>').join('') + '</div>';
      }
      h += '<div class="m26-src">口径：沪深全市场流动性粗筛至 ' + C0.cap + ' 只 → 真实K线精筛 → D/C/B/A 四层。综合分=趋势0.25/量能0.20/偏离0.15/基本面0.20/低波动0.10（行业动量无可靠源计0）。'
        + '<span class="m26-warn-text">⚠️ 纯技术模型输出，不构成投资建议；C/B/A 为观察信号禁止标记买点。</span></div>';
      h += '</div></div>';
    } else {
      h += '<div class="card"><div class="card-body" style="padding:30px 16px;text-align:center">'
        + '<div style="font-size:28px;margin-bottom:8px">🔍</div>'
        + '<div style="font-size:13px;color:var(--ink-3);margin-bottom:14px">尚未加载扫描数据</div>'
        + '<button class="btn btn-solid" onclick="V.m2560.backendScan()">🌐 运行全市场精筛</button>'
        + '</div></div>';
    }

    /* ② 市场状态紧凑卡 */
    h += '<div class="card"><div class="card-head"><h3>🧭 市场状态机（6态）</h3><span class="sub">上证指数日K · 平滑切换 · 炸板率情绪修正</span></div><div class="card-body">';
    if (reg) {
      const m = M[liveState] || M.neutral;
      const noOpen = liveState === 'high_volatility' || liveState === 'strong_down';
      h += '<div class="m26-regime-row"><div class="m26-regime-main"><span class="m26-regime-icon">' + m.icon + '</span>'
        + '<div><div class="m26-regime-name m26-c-' + m.cls + '">' + m.label + '</div>'
        + '<div class="m26-regime-sub">指数K线 ' + (reg.idxDate || '—') + '</div></div></div>'
        + '<div class="m26-regime-nums"><span>20日 <b class="' + (reg.ret20 >= 0 ? 'm26-c-up' : 'm26-c-down') + '">' + M2560.pct1(reg.ret20) + '</b></span>'
        + '<span>60日 <b class="' + (reg.ret60 >= 0 ? 'm26-c-up' : 'm26-c-down') + '">' + M2560.pct1(reg.ret60) + '</b></span>'
        + '<span>5日波动 <b>' + M2560.pct1(reg.vol5) + '</b></span></div></div>'
        + (noOpen ? '<div class="m26-noopen">⛔ 当前为「' + m.label + '」市：模型规则禁止新开仓</div>' : '')
        + (reg.params ? '<div class="m26-params">生效参数：贴线 ' + (reg.params.near_pct * 100).toFixed(1) + '% · 涨幅阈值 ' + (reg.params.gain_thresh * 100).toFixed(1) + '% · 量比≥' + reg.params.volume_ratio + ' · 20日涨幅上限 ' + (reg.params.max_20d_return * 100).toFixed(0) + '% · 止损 ' + (reg.params.stop_loss_pct * 100).toFixed(1) + '% · 止盈 ' + (reg.params.take_profit_pct * 100).toFixed(0) + '% · 最长持仓 ' + reg.params.max_hold_days + ' 天</div>' : '');
    } else {
      h += '<div class="m26-empty">尚未运行扫描——点击「运行全市场精筛」后展示真实状态判定。</div>';
    }
    h += '</div></div>';

    /* ④ 股票池（折叠）——JS 驱动，不依赖原生 <details> */
    h += '<div class="m26-fold" id="m26poolFold">'
      + '<div class="m26-fold-h" onclick="this.parentElement.classList.toggle(\'m26-open\')">🎯 扫描股票池（' + pool.length + '）<span class="m26-fold-arrow">▸</span></div>'
      + '<div class="m26-fold-b">'
      + '<div class="card"><div class="card-body">'
      + '<div class="m26-pool">' + (pool.length ? pool.map(x => { const c6 = String(x.code).replace(/^(sh|sz|bj)/i, ''); return '<span class="m26-chip">' + UI.esc(x.name || c6) + ' <i>' + c6 + '</i><button class="m26-chip-x" onclick="V.m2560.act(\'remove\',\'' + c6 + '\')" title="移出">×</button></span>'; }).join('') : '<span class="m26-empty">股票池为空</span>')
      + '</div><div class="m26-pool-ops">'
      + '<input id="m26code" class="m26-input" placeholder="输入6位代码，如 002413" maxlength="8" inputmode="numeric" onkeydown="if(event.key===\'Enter\')V.m2560.act(\'add\')">'
      + '<button class="btn btn-sm" onclick="V.m2560.act(\'add\')">＋ 添加</button>'
      + '<button class="btn btn-sm btn-ghost" onclick="V.m2560.act(\'import\')">📥 从持仓导入</button>'
      + '<button class="btn btn-sm btn-solid" id="m26scan" onclick="V.m2560.act(\'scan\')">' + (this._scanning ? '扫描中…' : '▶ 运行扫描') + '</button>'
      + '<span class="m26-prog" id="m26prog"></span></div>'
      + (res && res.rows && res.rows.length ? this._renderPoolResults(res, S) : '')
      + '</div></div></div></div>';

    /* ⑤ 双系统胜率对比（独立验证，不串台） */
    h += this._renderCompare();

    /* ⑥ 策略说明（折叠置底） */
    h += this._renderDoc(M, S);

    return h;
  },

  _renderDTable(recs, rg) {
    if (!recs || !recs.length) {
      return ''; /* D:0 已在顶部统计条展示，此处不重复渲染 */
    }
    let h = '<div class="m26-sec-t">🎯 D · 稳健买点（综合打分 Top ' + recs.length + '，信号日 ' + UI.esc(recs[0].date || '') + '）</div>'
      + '<div class="m26-tbl-wrap"><table class="m26-tbl"><thead><tr>'
      + '<th>#</th><th>标的</th><th>综合分</th><th>操作建议</th><th>现价</th><th>25日线</th><th>买入上限</th><th>止损价</th><th>目标价</th><th>盈亏比</th><th>偏离</th><th>20日涨幅</th><th>成交额</th><th>市值</th><th>PE</th>'
      + '</tr></thead><tbody>';
    recs.forEach((r, i) => {
      const adv = r.score >= 80 ? { t: '优先买入·正常仓位', c: 'm26-c-up' } : r.score >= 60 ? { t: '减半/观望', c: 'm26-c-warn' } : { t: '低确定性·放弃', c: 'm26-c-down' };
      h += '<tr class="m26-row-d">'
        + '<td>' + (i + 1) + '</td>'
        + '<td><b>' + UI.esc(r.name) + '</b><div class="m26-cell-sub">' + UI.esc(r.code) + '</div></td>'
        + '<td><b class="m26-c-up">' + r.score + '</b></td>'
        + '<td><b class="' + adv.c + '">' + adv.t + '</b></td>'
        + '<td>' + M2560.f2(r.close) + '</td>'
        + '<td>' + M2560.f2(r.ma25) + '</td>'
        + '<td class="m26-c-warn">' + M2560.f2(r.buyLimit) + '<div class="m26-cell-sub">高开破此价放弃</div></td>'
        + '<td class="m26-c-down">' + M2560.f2(r.stopLoss) + (r.trailPct != null ? '<div class="m26-cell-sub">移动止盈：盈利&gt;3%后回撤 ' + (r.trailPct * 100).toFixed(1) + '%</div>' : '') + '</td>'
        + '<td class="m26-c-up">' + M2560.f2(r.target) + (r.maxHold != null ? '<div class="m26-cell-sub">满 ' + r.maxHold + ' 天离场</div>' : '') + '</td>'
        + '<td class="' + (r.rr != null && r.rr >= 1.5 ? 'm26-c-up' : 'm26-c-down') + '"><b>' + (r.rr != null ? r.rr.toFixed(2) : '—') + ':1</b></td>'
        + '<td>' + M2560.pct1(r.deviation) + '</td>'
        + '<td class="' + (r.ret20 > 0 ? 'm26-c-up' : r.ret20 < 0 ? 'm26-c-down' : '') + '">' + M2560.pct1(r.ret20) + '</td>'
        + '<td>' + r.amount + '亿</td><td>' + r.mcap + '亿</td>'
        + '<td>' + (r.pe != null ? (+r.pe).toFixed(1) : '—') + '</td>'
        + '</tr>';
    });
    return h + '</tbody></table></div>';
  },

  _renderObsTable(title, list, desc) {
    if (!list || !list.length) return '';
    let h = '<div class="m26-sec-t">' + title + '（' + list.length + ' 只｜' + desc + '）</div>'
      + '<div class="m26-tbl-wrap"><table class="m26-tbl"><thead><tr>'
      + '<th>#</th><th>标的</th><th>现价</th><th>25日线</th><th>偏离</th><th>20日涨幅</th><th>成交额</th><th>市值</th><th>波动</th><th>ATR</th>'
      + '</tr></thead><tbody>';
    list.forEach((r, i) => {
      h += '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td><b>' + UI.esc(r.name) + '</b><div class="m26-cell-sub">' + UI.esc(r.code) + '</div></td>'
        + '<td>' + M2560.f2(r.close) + '</td>'
        + '<td>' + M2560.f2(r.ma25) + '</td>'
        + '<td>' + M2560.pct1(r.deviation) + '</td>'
        + '<td class="' + (r.ret20 > 0 ? 'm26-c-up' : r.ret20 < 0 ? 'm26-c-down' : '') + '">' + M2560.pct1(r.ret20) + '</td>'
        + '<td>' + r.amount + '亿</td>'
        + '<td>' + r.mcap + '亿</td>'
        + '<td>' + ((({ low: '低', mid: '中', high: '高' })[r.volClass]) || '—') + '</td>'
        + '<td>' + M2560.f2(r.atr) + '</td>'
        + '</tr>';
    });
    return h + '</tbody></table></div>';
  },

  _renderPoolResults(res, S) {
    let h = '<div class="m26-sec-t">📡 股票池信号（' + res.rows.length + ' 只）</div>';
    h += '<div class="m26-tbl-wrap"><table class="m26-tbl"><thead><tr>'
      + '<th>状态</th><th>标的</th><th>综合分</th><th>K线收盘</th><th>实时价</th><th>MA25</th><th>偏离</th><th>20日涨幅</th><th>买入上限</th><th>止损价</th><th>质量</th>'
      + '</tr></thead><tbody>';
    res.rows.forEach(r => {
      const sm = S[r.status] || S.NONE;
      const devCls = r.deviation == null ? '' : (Math.abs(r.deviation) < 0.015 ? 'm26-c-up' : (r.deviation > 0 ? 'm26-c-warn' : 'm26-c-flat'));
      h += '<tr class="' + (r.status === 'D' ? 'm26-row-d' : '') + '">'
        + '<td><span class="m26-badge m26-' + sm.cls + '" title="' + UI.esc(sm.desc) + '">' + sm.label + '</span>' + (r.qualityReason ? '<div class="m26-cell-sub">' + UI.esc(r.qualityReason) + '</div>' : '') + '</td>'
        + '<td><b>' + UI.esc(r.name) + '</b><div class="m26-cell-sub">' + UI.esc(r.code) + '</div></td>'
        + '<td>' + (r.score != null ? '<b class="m26-c-up">' + r.score + '</b>' : '<span class="m26-c-flat">—</span>') + '</td>'
        + '<td>' + M2560.f2(r.close) + '<div class="m26-cell-sub">' + UI.esc(r.date || '') + '</div></td>'
        + '<td>' + (r.live != null ? M2560.f2(r.live) : '<span class="m26-c-flat">—</span>') + '</td>'
        + '<td>' + M2560.f2(r.ma25) + '</td>'
        + '<td class="' + devCls + '">' + M2560.pct1(r.deviation) + '</td>'
        + '<td class="' + (r.ret20 > 0 ? 'm26-c-up' : r.ret20 < 0 ? 'm26-c-down' : '') + '">' + M2560.pct1(r.ret20) + '</td>'
        + '<td>' + (r.status === 'D' ? M2560.f2(r.buyLimit) : '<span class="m26-c-flat">—</span>') + '</td>'
        + '<td>' + (r.status === 'D' ? M2560.f2(r.stopLoss) : '<span class="m26-c-flat">—</span>') + '</td>'
        + '<td>' + (r.quality ? (r.quality.pass ? '<span class="m26-c-up">通过·' + r.quality.score + '分</span>' : '<span class="m26-c-down">未通过</span>') + '<div class="m26-cell-sub">' + UI.esc(r.quality.reason) + '</div>' : '<span class="m26-c-flat">非D不过滤</span>') + '</td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    if (res.fails && res.fails.length) {
      h += '<div class="m26-fails"><b>获取失败 ' + res.fails.length + ' 只：</b>' + res.fails.map(x => '<div class="m26-fail-item">· ' + UI.esc(x.name || x.code) + '（' + UI.esc(x.code) + '）：' + UI.esc(x.reason) + '</div>').join('') + '</div>';
    }
    return h;
  },

  _renderDoc(M, S) {
    const full = Store.get('m2560_full', null);
    const res = Store.get('m2560_result', null);
    const reg = (full && full.regime) || (res && res.regime) || null;
    const liveState = reg && reg.state;
    const B0 = M2560.BASE;
    const lp = (k, d) => (reg && reg.params && reg.params[k] != null ? reg.params[k] : d);
    let h = '<div class="m26-fold" id="m26docFold" style="margin-top:12px">'
      + '<div class="m26-fold-h" onclick="this.parentElement.classList.toggle(\'m26-open\')" style="font-size:14px;font-weight:600">📐 2560战法 v2.1 · 五层机制拆解<span class="sub" style="font-weight:400;margin-left:8px">趋势回踩+缩量止跌+放量确认</span><span class="m26-fold-arrow">▸</span></div>'
      + '<div class="m26-fold-b">'
      + '<div style="margin-top:10px">'
      + '<div class="m26-legend">'
      + ['D', 'C', 'B', 'A', 'NONE'].map(k => '<div class="m26-lg-item"><span class="m26-badge m26-' + S[k].cls + '">' + S[k].label + '</span><span class="m26-lg-desc">' + S[k].desc + '</span></div>').join('')
      + '</div>'
      + '<div class="m26-flow">';
    h += '<div class="m26-layer"><div class="m26-layer-h">L1 · 基础硬条件（四把钥匙，缺一不可）</div><div class="m26-layer-d">'
      + '<span class="m26-step">① <b>MA25 向上</b>（MA25&gt;前日MA25，不做下跌反弹）</span>'
      + '<span class="m26-step">② <b>量能活跃</b>（5均量&gt;60均量）</span>'
      + '<span class="m26-step">③ <b>非高位站岗</b>（20日涨幅≤<b>' + (lp('max_20d_return', B0.max_20d_return) * 100).toFixed(0) + '%</b>，D买点严格校验）</span>'
      + '<span class="m26-step">④ <b>排除毒瘤</b>（非ST / 停牌 / 一字板）</span>'
      + '</div></div><div class="m26-arrow">▼</div>';
    h += '<div class="m26-layer"><div class="m26-layer-h">L2 · 四档状态判定（A→B→C→D 逐步靠近买点）</div><div class="m26-layer-d">'
      + '<span class="m26-step"><b>A 观察</b>：趋势正常但远离 25 日线</span>'
      + '<span class="m26-step"><b>B 回踩</b>：靠近 25 日线（偏离≤<b>' + (lp('b_band_obs', 0.08) * 100).toFixed(0) + '%</b>）且连跌/缩量</span>'
      + '<span class="m26-step"><b>C 止跌</b>：贴线±<b>' + (lp('near_pct_obs', lp('near_pct', B0.near_pct)) * 100).toFixed(1) + '%</b> + 振幅&lt;5% + 缩量（只观察，禁止买入）</span>'
      + '<span class="m26-step"><b>D 买点</b>：昨日 C + 今日放量阳线（涨幅≥<b>' + (lp('gain_thresh', B0.gain_thresh) * 100).toFixed(1) + '%</b>、实体≥1%、量&gt;前日×<b>' + lp('volume_ratio', B0.volume_ratio) + '</b>）</span>'
      + '<span style="display:block;margin-top:4px;color:var(--amber);font-weight:650">—— 没有 C 就没有 D</span>'
      + '</div></div><div class="m26-arrow">▼</div>';
    h += '<div class="m26-layer"><div class="m26-layer-h">L3 · 质量过滤 + 6维加权打分（解决多只D买哪只）</div><div class="m26-layer-d">'
      + '<span class="m26-step"><b>质量排雷</b>：市值≥50亿 ∧ 0&lt;PE(TTM)≤200（已验证维度）；净利润/利润同比/行业排名/北向 浏览器不可得，<b>标注未验证、不判假通过</b></span>'
      + '<span class="m26-step"><b>综合分</b> = 趋势0.25 + 量能0.20 + 偏离0.15 + 基本面0.20 + 行业动量0.10（无可靠数据源计0）+ 低波动0.10，仅对 D 信号计算</span>'
      + '<span class="m26-step"><b>分级</b>：<b class="m26-c-up">≥80 优先买入·正常仓位</b> / <b class="m26-c-warn">60-80 减半仓位或观望</b> / <b class="m26-c-down">&lt;60 放弃</b></span>'
      + '</div></div><div class="m26-arrow">▼</div>';
    h += '<div class="m26-layer"><div class="m26-layer-h">L4 · 市场状态自适应（6态动态调参' + (liveState ? '，当前：<b>' + ((M[liveState] || {}).label || liveState) + '</b>' : '') + '）</div><div class="m26-layer-d">'
      + '按上证指数 20日/60日收益+5日波动率判 强上涨/弱上涨/中性/高波动/弱下跌/强下跌 6 态，连续2日确认切换（高波动立即生效），炸板率&gt;35% 情绪修正；高波动/强跌市 <b>D 一律暂停开仓</b>。强势市让利润奔跑，弱势市保住本金。'
      + '</div></div><div class="m26-arrow">▼</div>';
    h += '<div class="m26-layer"><div class="m26-layer-h">L5 · 入场与出场风控（实盘执行层）</div><div class="m26-layer-d">'
      + '<span class="m26-step"><b>入场</b>：仅 D 信号，收盘确认后次日开盘执行；高开&gt;1.5% 放弃；9:30-9:45 放量确认（无前视偏差）</span>'
      + '<span class="m26-step"><b>动态止损</b> = MAX(MA25下方<b>' + (lp('stop_loss_pct', B0.stop_loss_pct) * 100).toFixed(1) + '%</b>, 入场-波动率分级×ATR)</span>'
      + '<span class="m26-step"><b>动态止盈</b> = 入场+2×ATR（限界5%-15%）；<b>移动止盈</b> = 盈利&gt;3%后回撤 <b>' + (lp('trailing_stop_pct', 0.03) * 100).toFixed(1) + '%</b></span>'
      + '<span class="m26-step"><b>强制离场</b>：满 <b>' + lp('max_hold_days', B0.max_hold_days) + ' 天</b>；可分批止盈</span>'
      + '</div></div>';
    h += '</div>';
    h += '<div class="m26-note"><b>前端口径（诚实标注）</b>：①回测引擎不在浏览器运行（需全市场历史数据，可本地跑 Python 原版）；②仓位/总仓位上限/主线行业过滤属实盘执行参数，扫描器不管理持仓；③行业动量计0、基本面仅两维度已验证；④综合分仅对 D 计算。<br><b>数据源</b>：腾讯日K（前复权）/ 腾讯实时行情 / 东财估值 / 东财快照 / 东财盘口池炸板率。<span class="m26-warn-text">⚠️ 纯技术模型输出，不构成任何投资建议。</span></div>';
    h += '</div></div></div>';
    return h;
  },

  mount(reg) {
    this._userCleared = false;
    _m2560_paintAutoBar();
    // 进入页面立即读取后端预计算结果（不再浏览器直连腾讯/东财）
    this.backendScan().then(() => { if (current === 'm2560') App.refresh(); }).catch(() => {});
    // 并行加载双系统胜率对比数据（2560 与盘后个股筛选各自独立，不串台）
    this.loadVerifyData().then(() => { if (current === 'm2560') App.refresh(); }).catch(() => {});
    reg.interval(() => {
      _m2560_paintAutoBar();
      // 后端为每日 16:20 跑批的快照，交易时段仅轻量重读缓存 JSON（无前视偏差）
      if (_m2560_autoEnabled() && !this._backendScanning) {
        this.backendScan().then(() => { if (current === 'm2560') App.refresh(); }).catch(() => {});
      }
    }, _M2560_AUTO_MS);
    reg.interval(() => _m2560_paintAutoBar(), 30000);
  }
};

/* ---------- 盘中自动跟随辅助函数（IIFE 顶层，对象外） ---------- */
const _M2560_AUTO_MS = 90000;
function _m2560_inTradingHours() {
  const n = new Date();
  const day = n.getDay();
  if (day === 0 || day === 6) return false;
  const t = n.getHours() * 60 + n.getMinutes();
  return (t >= 555 && t <= 690) || (t >= 780 && t <= 900);
}
function _m2560_autoEnabled() { return Store.get('m2560_auto', true) && _m2560_inTradingHours(); }
function _m2560_paintAutoBar() {
  const el = UI.$('#m26AutoBar');
  if (!el) return;
  const on = _m2560_autoEnabled();
  // 实时大盘态（来自最近一次 fullScan 写入的 m2560_full.regime，自动跟随每次重算都会刷新）
  const fullR = Store.get('m2560_full', null);
  const reg = fullR && fullR.regime;
  let gateTxt = '';
  if (reg && reg.state) {
    const m = M2560.REGIME_META[reg.state] || M2560.REGIME_META.neutral;
    const noOpen = reg.state === 'high_volatility' || reg.state === 'strong_down';
    gateTxt = ' · 大盘 <b class="m26-c-' + m.cls + '">' + m.label + '</b> · ' + (noOpen ? '⛔ 闸门关闭' : '✅ 闸门开启');
  }
  el.innerHTML = on
    ? '<span class="live-dot"></span><b style="color:var(--pink-deep,#f2588a)">自动跟随中</b> · 每 90 秒刷新 · 下次 ' + new Date(Date.now() + _M2560_AUTO_MS).toTimeString().slice(0, 5) + gateTxt
    : (_m2560_inTradingHours() ? '自动跟随已暂停（点开关开启）' : '非交易时段 · 自动跟随休眠');
}
