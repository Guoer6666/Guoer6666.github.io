/* ============================================================
   views-pickscreen.js · 个股拆解选股 V1 —— 独立于 2560 的全市场选股系统
   ------------------------------------------------------------
   定位：与「2560战法」（贴25日线缩量回踩→放量确认的均值回归买点）彻底区分开。
   本系统找的是「有独立逻辑(α)、多模块确认、次日即可介入」的强势股：
     趋势强度 + 量能配合 + 相对大盘的超额收益(α) + 位置不追高 + 风险干净。
   大盘/海外影响：以【当日大盘总览】为主闸门（权重0.65），美股/日韩/恒生/离岸人民币
     为辅（权重0.35）——偏冷收紧D阈值/极端空仓，偏暖给映射板块个股加分。
   数据底座（全部浏览器实测可达，见 skill「a-share-data-sources」）：
     大盘/海外 = Market 模块（腾讯+东财+Yahoo 多源）；全市场快照 = 东财 clist；
     K线 = 三源降级（腾讯镜像 ifzq.gtimg.cn → 腾讯web → 东财push2his，前复权）。
   铁律：拉不到的数据如实标注，绝不编造；建议文本为本地规则引擎生成，非远程大模型；
        本系统不构成投资建议，D 级仅为盘后参考候选。
   ============================================================ */
V.pickscreen = (() => {

  /* ---------------- 小工具（自包含，不依赖 M2560） ---------------- */
  const isST = name => /ST|退|PT|\*/i.test(name || '');
  const f2 = v => (v == null || !isFinite(v)) ? '—' : (+v).toFixed(2);
  const pct1 = v => (v == null || !isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const ma = (arr, n, end) => { // 截止到 end(含) 的 n 日均线，end 默认最后一根
    const i = end == null ? arr.length - 1 : end;
    if (i - n + 1 < 0) return null;
    let s = 0; for (let k = i - n + 1; k <= i; k++) s += arr[k];
    return s / n;
  };
  const std = arr => { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map(x => (x - m) * (x - m)))); };

  /* 下一交易日（跳过周末+法定节假日）。返回 { date:'YYYY-MM-DD', label:'下周一 8/31 可买' / '次日可买' } */
  function nextTradeDate(from) {
    const base = from ? new Date(from.replace(/-/g, '/')) : new Date();
    const DT = (Store && Store.DT) || null;
    const isTd = d => DT ? DT.isTradeDay(d) : (d.getDay() !== 0 && d.getDay() !== 6);
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + 1);
    let guard = 0;
    while (!isTd(d) && guard++ < 30) d.setDate(d.getDate() + 1);
    const y = d.getFullYear(), mo = d.getMonth() + 1, da = d.getDate();
    const ds = y + '-' + String(mo).padStart(2, '0') + '-' + String(da).padStart(2, '0');
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    const gap = Math.round((d - base) / 86400000);
    const label = (gap <= 1 ? '次日可买' : (wd + ' ' + mo + '/' + da + ' 可买'));
    return { date: ds, wd, gap, label };
  }

  /* ---------------- 粗筛口径（流动性陷阱防护） ---------------- */
  const COARSE = { minPrice: 3, minAmount: 2e8, minMcap: 80e8, minListDays: 120, cap: 500 };

  /* ---------------- K线三源降级（独立实现，与 2560 同源策略但不调用它） ---------------- */
  let _klineSrc = null;
  async function kline(nc, n) {
    const code6 = nc.slice(2);
    const isSh = nc.startsWith('sh');
    const txMirror = 'https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + nc + ',day,,,' + n + ',qfq&_=' + Date.now();
    const txWeb = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + nc + ',day,,,' + n + ',qfq&_=' + Date.now();
    const emUrl = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + (isSh ? '1.' : '0.') + code6
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
    const chain = [['腾讯镜像', txMirror, tryTx], ['腾讯web', txWeb, tryTx], ['东财push2his', emUrl, tryEm]];
    let lastErr;
    for (const [label, u, fn] of chain) {
      try { const out = await fn(u, label); _klineSrc = label; return out; }
      catch (e) { lastErr = new Error(label + ':' + e.message); }
    }
    throw lastErr || new Error('K线获取失败（三源均不可用）');
  }

  /* ---------------- 全市场快照（东财 clist 主源 + 腾讯 qt.gtimg.cn 备用） ---------------- */
  let _snapSrc = null; // 'em' | 'tx'
  async function snapshot(say) {
    // ---- 主源：东财 clist（速度快，全量字段） ----
    const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';
    const fields = 'f12,f14,f2,f3,f6,f7,f8,f10,f20,f26,f100';
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
      if (!rows) { if (pn === 1) { _snapSrc = null; return await snapshotTencent(say); } break; }
      all.push(...rows);
      if (say) say('全市场快照 ' + all.length + ' 只（第 ' + pn + ' 页）…');
      const lastAmt = rows[rows.length - 1].f6;
      if (!Number.isFinite(lastAmt) || lastAmt < 1.5e8) break;
      if (all.length >= 800) break;
    }
    _snapSrc = 'em';
    return all;
  }

  /* ---- 备用：腾讯 qt.gtimg.cn 批量实时行情（东财双源不可用时自动降级） ---- */
  async function snapshotTencent(say) {
    try {
      // 1) 拉取 A 股代码清单
      const cr = await fetch('/api/reports/a_share_codes.json?_=' + Date.now(), { cache: 'no-store' });
      if (!cr.ok) throw new Error('代码清单 HTTP ' + cr.status);
      const rawCodes = await cr.json();
      if (!Array.isArray(rawCodes) || !rawCodes.length) throw new Error('代码清单为空');
      // 加 sh/sz 前缀
      const fullCodes = rawCodes.map(c => (/^[36]/.test(String(c)) ? 'sh' : 'sz') + String(c));
      // 2) 批量拉取行情（每批 80 只）
      const BATCH = 80;
      const results = [];
      for (let i = 0; i < fullCodes.length; i += BATCH) {
        const batch = fullCodes.slice(i, i + BATCH);
        const url = 'https://qt.gtimg.cn/q=' + batch.join(',');
        try {
          const res = await Promise.race([fetch(url, { cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
          const text = await res.text();
          // 解析 v_sh600519="1~贵州茅台~600519~1302~..." 格式
          for (const line of text.split(';')) {
            const m = line.match(/^v_([^=]+)="(.*)"$/);
            if (!m || m[2].length < 10) continue;
            const f = m[2].split('~');
            if (f.length < 46) continue;
            const code6 = f[2]; // 纯数字代码
            const price = parseFloat(f[3]);
            if (!Number.isFinite(price) || price <= 0) continue;
            // f[35] = 现价/成交量(手)/成交额(元); f[44]=流通市值(亿?); f[45]=总市值(亿?)
            const amtParts = String(f[35] || '').split('/');
            const amount = amtParts.length >= 3 ? parseFloat(amtParts[2]) || 0 : 0; // 成交额(元)
            const mcap = Math.max(parseFloat(f[44]) || 0, parseFloat(f[45]) || 0) * 1e8; // 总市值(元)，腾讯返回单位亿→转元
            const chg = f[32] ? parseFloat(f[32]) : undefined; // 涨跌幅%
            results.push({
              f12: code6, f14: f[1] || code6, f2: price,
              f3: chg != null ? chg : 0, f6: amount, f20: mcap,
              f26: 0, f100: '' // 备用源缺行业/上市日，粗筛时放宽这两项
            });
          }
        } catch (e) { /* 单批失败跳过 */ }
        if (say && (Math.floor(i / BATCH) % 5 === 0 || i + BATCH >= fullCodes.length))
          say('腾讯快照 ' + results.length + ' 只（已读 ' + Math.min(i + BATCH, fullCodes.length) + '/' + rawCodes.length + '）…');
      }
      // 3) 按成交额降序
      results.sort((a, b) => (b.f6 || 0) - (a.f6 || 0));
      _snapSrc = 'tx';
      if (say) say('腾讯快照完成，共 ' + results.length + ' 只');
      return results;
    } catch (e) {
      throw new Error('快照全源失败（东财+腾讯）：' + e.message);
    }
  }

  /* ============================================================
     大盘/海外闸门层：当日大盘总览为主(0.65) + 美股/日韩为辅(0.35)
     返回 { ok, aScore, ovScore, gate, state, noOpen, dThresh, maxD, bonus,
            aChips, ovRows, mapped:[{dir,note,keys}], note }
     ============================================================ */
  async function marketGate(say) {
    if (say) say('获取大盘总览 + 隔夜海外行情（闸门层）…');
    const g = {
      ok: false, aScore: 0, ovScore: 0, gate: 0, state: 'neutral', noOpen: false,
      dThresh: 78, maxD: 5, bonus: 0, aChips: [], ovRows: [], mapped: [], note: ''
    };
    const KEYS = ['sh', 'sz', 'cyb', 'hs300', 'dji', 'ixic', 'spx', 'n225', 'ks11', 'hsi', 'usdcnh'];
    let q = {}, br = null;
    try { q = await Market.quotes(KEYS); } catch (e) { g.note += '行情quotes异常:' + e.message + '；'; }
    try { br = await Market.breadth(); } catch (e) { g.note += '涨跌家数异常:' + e.message + '；'; }

    const cp = k => (q[k] && Number.isFinite(q[k].chgPct)) ? q[k].chgPct : null;
    // ---- 当日大盘总览（主） ----
    const idxVals = [cp('sh'), cp('hs300'), cp('cyb')].filter(v => v != null);
    const idxAvg = idxVals.length ? mean(idxVals) : null;
    let aScore = 0;
    if (idxAvg != null) aScore += clamp(idxAvg * 25, -50, 50);
    if (br && br.ok && Number.isFinite(br.upCount) && Number.isFinite(br.downCount) && (br.upCount + br.downCount) > 0) {
      const ratio = (br.upCount - br.downCount) / (br.upCount + br.downCount);
      aScore += clamp(ratio * 60, -40, 40);
      if (Number.isFinite(br.limitUp)) aScore += br.limitUp >= 60 ? 10 : (br.limitUp <= 20 ? -10 : 0);
      g.aChips.push({ label: '涨/跌家数', value: br.upCount + '/' + br.downCount, dir: br.upCount >= br.downCount ? 'up' : 'down' });
      if (Number.isFinite(br.limitUp)) g.aChips.push({ label: '涨停', value: br.limitUp + '家', dir: br.limitUp >= 50 ? 'up' : '' });
      if (Number.isFinite(br.sealRate)) g.aChips.push({ label: '封板率', value: br.sealRate + '%', dir: br.sealRate >= 70 ? 'up' : '' });
      if (Number.isFinite(br.height)) g.aChips.push({ label: '最高连板', value: br.height + '板', dir: '' });
    } else {
      g.aChips.push({ label: '涨跌家数', value: '未获取', dir: '' });
      g.note += '涨跌家数未获取；';
    }
    if (idxAvg == null) g.note += 'A股指数涨跌幅未获取；';
    ['sh', 'hs300', 'cyb'].forEach(k => { if (cp(k) != null) g.aChips.unshift({ label: q[k].label, value: pct1(cp(k) / 100), dir: cp(k) >= 0 ? 'up' : 'down' }); });
    aScore = clamp(aScore, -100, 100);
    g.aScore = Math.round(aScore);

    // ---- 隔夜海外（辅） ----
    const usVals = [cp('dji'), cp('ixic'), cp('spx')].filter(v => v != null);
    const asiaVals = [cp('n225'), cp('ks11')].filter(v => v != null);
    let ovScore = 0;
    if (usVals.length) ovScore += clamp(mean(usVals) * 30, -40, 40);
    if (asiaVals.length) ovScore += clamp(mean(asiaVals) * 20, -20, 20);
    if (cp('hsi') != null) ovScore += clamp(cp('hsi') * 15, -15, 15);
    if (cp('usdcnh') != null) ovScore += cp('usdcnh') > 0 ? -10 : 10; // 人民币升值(USDCNH下跌)→外资偏暖
    ovScore = clamp(ovScore, -100, 100);
    g.ovScore = Math.round(ovScore);
    // 海外明细行（如实展示，含映射）
    const ovLine = (k, mapNote) => {
      if (cp(k) == null) { g.ovRows.push([{ text: q[k] ? q[k].label : k, dir: '' }, { text: ' 未获取', dir: '' }]); return; }
      g.ovRows.push([{ text: (q[k].label) + ' ', dir: cp(k) >= 0 ? 'up' : 'down' }, { text: pct1(cp(k) / 100), dir: cp(k) >= 0 ? 'up' : 'down' }, { text: mapNote ? '  ' + mapNote : '', dir: '' }]);
    };
    ovLine('ixic', cp('ixic') != null ? (cp('ixic') >= 0 ? '科技映射偏暖' : '科技链承压') : '');
    ovLine('dji'); ovLine('spx');
    ovLine('n225', cp('n225') != null ? (cp('n225') >= 0 ? '亚太情绪偏暖' : '亚太情绪偏冷') : '');
    ovLine('ks11'); ovLine('hsi');
    ovLine('usdcnh', cp('usdcnh') != null ? (cp('usdcnh') > 0 ? '人民币走贬·外资流出压力' : '人民币走强·外资偏暖') : '');

    // ---- 映射方向（用于给命中板块个股加分） ----
    if (cp('ixic') != null && cp('ixic') >= 0.5) g.mapped.push({ dir: '科技成长映射', keys: /半导体|电子|计算机|通信|软件|IT|元件|光学|消费电子|互联网/, note: '纳指收涨 ' + pct1(cp('ixic') / 100) });
    if (cp('usdcnh') != null && cp('usdcnh') < 0) g.mapped.push({ dir: '人民币升值·外资偏好白马', keys: /白酒|食品|饮料|家电|医药|消费|金融|银行|保险/, note: '离岸人民币走强' });
    if (asiaVals.length && mean(asiaVals) >= 0.5) g.mapped.push({ dir: '亚太映射', keys: /汽车|出口|制造|机械|家电/, note: '日韩走强' });

    // ---- 合成闸门（大盘总览为主 0.65 / 海外为辅 0.35） ----
    const gate = clamp(g.aScore * 0.65 + g.ovScore * 0.35, -100, 100);
    g.gate = Math.round(gate);
    if (gate <= -45) { g.state = 'freeze'; g.noOpen = true; g.dThresh = 999; g.maxD = 0; }
    else if (gate <= -20) { g.state = 'risk_off'; g.dThresh = 85; g.maxD = 3; }
    else if (gate >= 25) { g.state = 'risk_on'; g.dThresh = 74; g.maxD = 5; g.bonus = 5; }
    else { g.state = 'neutral'; g.dThresh = 78; g.maxD = 5; }
    g.ok = true;
    return g;
  }

  /* ============================================================
     个股拆解 α 打分（独立逻辑，非 2560 的 MA25 回踩）
     输入 bars=[{d,o,c,h,l,v}], idxRet20=沪深300近20日涨幅, gate
     返回 { score, parts:{trend,vol,alpha,pos,risk}, alpha20, ret20, bias20,
            volRatio, posRank, atr, stopLoss, target, buyLimit, resist, mappedHit }
     ============================================================ */
  function scoreStock(bars, idxRet20, gate, industry) {
    if (!bars || bars.length < 60) return null;
    const closes = bars.map(b => b.c), vols = bars.map(b => b.v), highs = bars.map(b => b.h), lows = bars.map(b => b.l);
    const n = closes.length, i = n - 1;
    const c0 = closes[i];
    const ma5 = ma(closes, 5), ma10 = ma(closes, 10), ma20 = ma(closes, 20), ma60 = ma(closes, 60);
    const ma20_prev = ma(closes, 20, i - 5);
    if ([ma5, ma10, ma20, ma60, ma20_prev].some(v => v == null)) return null;

    // 1) 趋势强度（多头排列 + MA20向上 + 价在MA20上）
    let trend = 0;
    if (c0 > ma5) trend += 20;
    if (ma5 > ma10) trend += 20;
    if (ma10 > ma20) trend += 20;
    if (ma20 > ma20_prev) trend += 20; // MA20斜率向上
    if (c0 > ma20) trend += 20;

    // 2) 量能配合（温和放量为佳，异常放量减分）
    const v5 = mean(vols.slice(-5)), v20 = mean(vols.slice(-20));
    const volRatio = v20 > 0 ? v5 / v20 : 1;
    let vol = 30;
    if (volRatio >= 1.2 && volRatio <= 2.5) vol = 100;
    else if (volRatio >= 1.0 && volRatio < 1.2) vol = 65;
    else if (volRatio > 2.5 && volRatio <= 4) vol = 45;
    else if (volRatio > 4) vol = 15;
    // 近3日量价配合（价升量增）加分
    let pv = 0;
    for (let k = i - 2; k <= i; k++) if (closes[k] > closes[k - 1] && vols[k] > vols[k - 1]) pv++;
    if (pv >= 2) vol = clamp(vol + 10, 0, 100);

    // 3) 相对强度 α（近20日超额收益 = 独立逻辑核心）
    const ret20 = closes[i - 20] > 0 ? c0 / closes[i - 20] - 1 : 0;
    const alpha20 = ret20 - (idxRet20 || 0);
    let alpha = 50;
    if (alpha20 >= 0.08) alpha = 100;
    else if (alpha20 >= 0.04) alpha = 82;
    else if (alpha20 >= 0.01) alpha = 62;
    else if (alpha20 >= 0) alpha = 50;
    else if (alpha20 >= -0.03) alpha = 32;
    else alpha = 15;
    if (ret20 > 0.25) alpha = Math.round(alpha * 0.5); // 已暴涨 → 追高惩罚

    // 4) 位置（近60日区间分位，中低位启动为佳，不追高）
    const lo60 = Math.min.apply(null, lows.slice(-60)), hi60 = Math.max.apply(null, highs.slice(-60));
    const posRank = hi60 > lo60 ? (c0 - lo60) / (hi60 - lo60) : 0.5;
    let pos = 60;
    if (posRank >= 0.3 && posRank <= 0.7) pos = 100;
    else if (posRank >= 0.1 && posRank < 0.3) pos = 72;
    else if (posRank > 0.7 && posRank <= 0.9) pos = 48;
    else if (posRank > 0.9) pos = 20;

    // 5) 风险（近20日无跌停/大跌、乖离不过大）
    let risk = 100;
    for (let k = Math.max(1, i - 19); k <= i; k++) { const chg = closes[k] / closes[k - 1] - 1; if (chg <= -0.07) { risk = 55; break; } }
    const bias20 = (c0 - ma20) / ma20;
    if (Math.abs(bias20) > 0.15) risk = Math.min(risk, 60); // 乖离过大追高风险
    const rets = []; for (let k = Math.max(1, i - 19); k <= i; k++) rets.push(closes[k] / closes[k - 1] - 1);
    const std20 = std(rets);

    // 综合分
    let score = Math.round(0.25 * trend + 0.20 * vol + 0.25 * alpha + 0.15 * pos + 0.15 * risk);

    // 闸门加分：命中当日外围映射板块
    let mappedHit = '';
    if (gate && gate.bonus > 0 && gate.mapped && industry) {
      const hit = gate.mapped.find(m => m.keys.test(industry));
      if (hit) { score = clamp(score + gate.bonus, 0, 100); mappedHit = hit.dir; }
    }

    // 交易价位（真实K线计算）
    const tr = []; for (let k = Math.max(1, i - 13); k <= i; k++) tr.push(Math.max(highs[k] - lows[k], Math.abs(highs[k] - closes[k - 1]), Math.abs(lows[k] - closes[k - 1])));
    const atr = tr.length ? mean(tr) : c0 * 0.02;
    const low20 = Math.min.apply(null, lows.slice(-20));
    const resist = Math.max.apply(null, highs.slice(-20)); // 短线压力=近20日最高
    const stopLoss = Math.max(low20, c0 - 2 * atr);
    const target = +(c0 * 1.05).toFixed(2);
    const buyLimit = +(c0 * 1.03).toFixed(2); // 高开超3%放弃，不追高

    return { score, parts: { trend, vol, alpha, pos, risk }, alpha20, ret20, bias20, volRatio, posRank, atr, std20, stopLoss: +stopLoss.toFixed(2), target, buyLimit, resist: +resist.toFixed(2), mappedHit };
  }

  /* ---------------- D级「逻辑拆解最终投资建议」（本地规则引擎生成，非大模型） ---------------- */
  function advice(r, gate) {
    const p = r.parts;
    const trendTxt = p.trend >= 80 ? '均线多头排列且20日线上行' : p.trend >= 60 ? '趋势偏多' : '趋势一般';
    const volTxt = r.volRatio >= 1.2 && r.volRatio <= 2.5 ? '温和放量、量价配合' : r.volRatio > 2.5 ? '放量偏热需防分歧' : '量能平稳';
    const alphaTxt = '近20日超额收益 ' + pct1(r.alpha20) + '（独立α' + (r.alpha20 > 0.01 ? '显著' : r.alpha20 > 0 ? '为正' : '偏弱') + '）';
    const posTxt = r.posRank <= 0.7 ? '区间中低位启动，未追高' : '区间位置偏高，注意接力风险';
    const lines = [];
    lines.push('【核心逻辑】' + trendTxt + '；' + volTxt + '；' + alphaTxt + '；' + posTxt + '。多模块同向确认，非纯跟风。');
    if (r.mappedHit) lines.push('【外围映射】命中「' + r.mappedHit + '」方向，次日情绪面有外部加持。');
    lines.push('【介入方式】次日开盘价 ±2% 内分批介入；放量突破 ' + f2(r.resist) + '（近20日高）可加仓确认；高开超 ' + f2(r.buyLimit) + ' 则放弃，不追高。');
    lines.push('【风控纪律】止损 ' + f2(r.stopLoss) + '（近20日低点/2倍ATR）；目标 ' + f2(r.target) + '（+5%）附近分批止盈；跌破止损无条件离场。');
    if (gate && gate.state === 'risk_off') lines.push('【市况提示】当前大盘/外围偏冷，仓位减半、严格止损，宁可错过。');
    return lines;
  }

  /* ---------------- 盘中自动跟随（交易时段每 90 秒自动重算） ---------------- */
  const AUTO_MS = 90000;            // 90 秒一轮
  function inTradingHours() {
    const n = new Date();
    const day = n.getDay();         // 0=周日 6=周六
    if (day === 0 || day === 6) return false;
    const t = n.getHours() * 60 + n.getMinutes();
    // 9:15–11:30 午盘，13:00–15:00 午盘后；盘前盘后不刷
    return (t >= 555 && t <= 690) || (t >= 780 && t <= 900);
  }
  function autoEnabled() {
    // 用户开关（默认开），且当前处于交易时段才真正生效
    return Store.get('ps_auto', true) && inTradingHours();
  }
  function paintAutoBar() {
    const el = UI.$('#psAutoBar');
    if (!el) return;
    const on = autoEnabled();
    const autoSw = Store.get('ps_auto', true);
    el.innerHTML = on
      ? '<span class="live-dot"></span><b style="color:var(--pink-deep,#f2588a)">实时试算中</b> · 每 90 秒重算（仅供参考，非最终决策）· 下次 ' + new Date(Date.now() + AUTO_MS).toTimeString().slice(0, 5)
      : (inTradingHours()
          ? '自动跟随已暂停（点开关开启实时试算）'
          : (autoSw ? '非交易时段 · 自动同步官方跑批结果' : '自动跟随已关闭（非交易时段）'));
  }

  /* ---------------- 主流程：全市场选股 ---------------- */
  let _running = false;
  async function run() {
    if (_running) return;
    _running = true;
    const prog = () => UI.$('#psProg');
    const say = t => { const el = prog(); if (el) el.textContent = t; };
    try {
      // 1) 闸门层
      const gate = await marketGate(say);
      // 2) 指数20日涨幅（α基准）——用沪深300日K
      let idxRet20 = 0, idxNote = '沪深300 20日涨幅作为α基准';
      try {
        const ib = await kline('sh000300', 60);
        const cl = ib.map(b => b.c);
        idxRet20 = cl[cl.length - 21] > 0 ? cl[cl.length - 1] / cl[cl.length - 21] - 1 : 0;
      } catch (e) { idxNote = '沪深300日K获取失败，α基准按0处理（' + e.message + '）'; }

      // 3) 快照→粗筛
      const C = COARSE;
      const snap = await snapshot(say);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - C.minListDays);
      const minList = cutoff.getFullYear() * 10000 + (cutoff.getMonth() + 1) * 100 + cutoff.getDate();
      let coarse = snap.filter(d =>
        Number.isFinite(d.f2) && Number.isFinite(d.f6) && Number.isFinite(d.f20)
        && !isST(d.f14) && d.f2 >= C.minPrice && d.f6 >= C.minAmount && d.f20 >= C.minMcap
        && !(Number.isFinite(d.f26) && d.f26 > minList));
      const dropped = snap.length - coarse.length;
      coarse = coarse.slice(0, C.cap);
      say('粗筛通过 ' + coarse.length + ' 只，开始 α 精筛…');

      // 4) K线精筛 + α打分（8并发）
      const rows = []; let kFail = 0; const failSample = []; let done = 0;
      const queue = coarse.slice();
      const worker = async () => {
        while (queue.length) {
          const d = queue.shift();
          const code6 = String(d.f12);
          const nc = (/^6/.test(code6) ? 'sh' : 'sz') + code6;
          try {
            const bars = await kline(nc, 160);
            const s = scoreStock(bars, idxRet20, gate, d.f100 || '');
            if (!s) throw new Error('K线不足60根');
            rows.push({
              code: code6, name: d.f14 || code6, industry: d.f100 || '',
              amount: +(d.f6 / 1e8).toFixed(1), mcap: +(d.f20 / 1e8).toFixed(0),
              chgPct: d.f3, close: bars[bars.length - 1].c, date: bars[bars.length - 1].d,
              score: s.score, parts: s.parts, alpha20: s.alpha20, ret20: s.ret20,
              volRatio: s.volRatio, posRank: s.posRank, bias20: s.bias20,
              stopLoss: s.stopLoss, target: s.target, buyLimit: s.buyLimit, resist: s.resist, mappedHit: s.mappedHit
            });
          } catch (e) { kFail++; if (failSample.length < 8) failSample.push((d.f14 || code6) + '：' + e.message); }
          done++;
          if (done % 25 === 0 || done === coarse.length) say('α 精筛 ' + done + '/' + coarse.length + ' …');
        }
      };
      await Promise.all(Array.from({ length: 8 }, () => worker()));

      // 5) ABCD 分层
      rows.sort((a, b) => b.score - a.score);
      const isD = r => r.score >= gate.dThresh && r.parts.trend >= 60 && r.alpha20 > 0 && r.posRank >= 0.15 && r.posRank <= 0.92 && r.parts.risk >= 55;
      let dList = gate.noOpen ? [] : rows.filter(isD).slice(0, gate.maxD);
      const dSet = new Set(dList.map(r => r.code));
      const cList = rows.filter(r => !dSet.has(r.code) && r.score >= 68).slice(0, 15);
      const cSet = new Set(cList.map(r => r.code));
      const bList = rows.filter(r => !dSet.has(r.code) && !cSet.has(r.code) && r.score >= 58).slice(0, 15);
      const bSet = new Set(bList.map(r => r.code));
      const aList = rows.filter(r => !dSet.has(r.code) && !cSet.has(r.code) && !bSet.has(r.code)).slice(0, 12);

      dList.forEach(r => { r.advice = advice(r, gate); });

      const res = {
        date: DT.today(), runAt: DT.stamp(), klineSrc: _klineSrc, idxNote, idxRet20,
        gate: { aScore: gate.aScore, ovScore: gate.ovScore, gate: gate.gate, state: gate.state, noOpen: gate.noOpen, dThresh: gate.dThresh, maxD: gate.maxD, aChips: gate.aChips, ovRows: gate.ovRows, mapped: gate.mapped.map(m => ({ dir: m.dir, note: m.note })), note: gate.note },
        stats: { snapN: snap.length, dropped, coarseN: coarse.length, klineOk: rows.length, kFail, dN: dList.length, cAll: rows.filter(r => r.score >= 68).length, bAll: rows.filter(r => r.score >= 58).length, aAll: rows.length },
        dList, cList, bList, aList, failSample
      };
      Store.set('pickscreen_last', res);
      UI.toast('⚡ 盘中实时试算完成（非最终决策，以16:10官方跑批为准）：D ' + dList.length + ' / C ' + cList.length + ' / B ' + bList.length + ' / A ' + aList.length);
    } catch (e) {
      const errMsg = '实时试算失败：' + e.message;
      console.error('[pickscreen run]', errMsg, e);
      const el = UI.$('#psProg');
      if (el) { el.innerHTML = '<span style="color:var(--red,#e5534c);font-weight:bold">⚠️ ' + UI.esc(errMsg) + '</span>'; el.style.display = ''; }
      UI.toast(errMsg);
    } finally {
      _running = false;
      App.refresh();
    }
  }

  /* ============ 交易台账：信号 → 执行 → 结果 ============
     数据源 reports/verify_ledger.json（build_ledger.py 本地拼装，不重拉行情）。
     只读展示；与 2560 的 verify_m2560_* 物理隔离，绝不串台。 */
  let LEDGER = null;

  async function loadLedger() {
    try {
      const r = await fetch('/api/reports/verify_ledger.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.days) { LEDGER = j; if (current === 'pickscreen') App.refresh(); }
    } catch (e) { /* 台账缺失不影响主流程 */ }
  }

  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const fmtD = s => {
    if (!s || s.length < 10) return s || '';
    const d = new Date(s.slice(0, 10).replace(/-/g, '/'));
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')';
  };
  const pctS = v => (v == null || !isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
  const pctP = v => (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%';
  const dirCls = v => (v == null || !isFinite(v)) ? '' : (v > 0 ? 'm26-c-up' : v < 0 ? 'm26-c-down' : '');

  /* 相对日期词：今天/昨天/前天/明天/后天，其余回落 M/D(周X) */
  const relDay = s => {
    if (!s || s.length < 10) return s || '';
    const t = (LEDGER && LEDGER.today) || new Date().toISOString().slice(0, 10);
    if (s === t) return '今天';
    const d1 = new Date(s.slice(0, 10).replace(/-/g, '/'));
    const d0 = new Date(t.replace(/-/g, '/'));
    const diff = Math.round((d1 - d0) / 86400000);
    if (diff === -1) return '昨天';
    if (diff === -2) return '前天';
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    return fmtD(s);
  };

  /* 涨跌幅：当日收盘 vs 信号日收盘 */
  const dayChg = r => {
    const c = parseFloat(r.close), s = parseFloat(r.sigClose);
    if (!isFinite(c) || !isFinite(s) || s === 0) return { v: '—', cls: '' };
    const v = (c / s - 1);
    return { v: pctS(v), cls: dirCls(v) };
  };

  /* 单只票完整卡片：行情全貌 + 买入判定 + 收益闭环 */
  function ledgerRow(r, i, dayInfo) {
    /* dayInfo = { signal_date, buy_date, sell_date, phase } 从外层传入，让每张卡片有完整日期上下文 */
    const sd = dayInfo ? dayInfo.signal_date : '';
    const bd = dayInfo ? dayInfo.buy_date : '';
    const soldDay = dayInfo ? dayInfo.sell_date : '';

    const bought = r.status === 'OK';
    const retTxt = (r.ret == null) ? '—' : pctS(r.ret);
    const sold = r.exit_state === '已卖出';
    const dc = dayChg(r);

    /* 当日涨跌幅：直接用预计算字段，已卖出→T+2 涨跌，其余→T+1 */
    const o = parseFloat(r.open), c = parseFloat(r.close);
    const _dO = r._disp_open != null ? parseFloat(r._disp_open) : o;
    const _dC = r._disp_close != null ? parseFloat(r._disp_close) : c;
    const dayPct = (isFinite(_dO) && isFinite(_dC) && _dO > 0) ? (_dC / _dO - 1) : null;
    const dayPctTxt = dayPct != null ? pctS(dayPct) : '—';
    const dayPctCls = dirCls(dayPct);

    let badge, badgeCls, why;
    if (bought) {
      if (sold) {
        const rp = r.exit_reason === '止损' ? '止损卖出' : r.exit_reason === '达标' ? '达标卖出' : '收盘卖出';
        /* 卖出价：exit_price 有值用 exit_price；收盘卖且无 exit_price → 用当日 close */
        const ep = (r.exit_price != null) ? r.exit_price : ((r.exit_reason === '收盘') ? c : null);
        badge = fmtD(r.exit_date) + ' ' + rp + (ep != null ? ' @' + f2(ep) : '');
        badgeCls = r.exit_reason === '止损' ? 'lg-skip' : 'lg-buy';
        why = fmtD(bd) + ' 开盘买 @' + f2(r.open)
          + ' → ' + fmtD(r.exit_date) + ' ' + rp + (ep != null ? ' @' + f2(ep) : '')
          + '　收益 <b class="' + dirCls(r.ret) + '">' + retTxt + '</b>';
      } else {
        badge = '持仓中 · ' + fmtD(soldDay || '') + '(T+2) 可卖';
        badgeCls = 'lg-hold';
        why = fmtD(bd) + ' 开盘买 @' + f2(r.open)
          + ' → 持有中(现价 ' + f2(r.close) + ')'
          + '　浮动 <b class="' + dirCls(r.ret) + '">' + retTxt + '</b>';
      }
    } else if (r.status === '未触发') {
      badge = '未买入 · 高开超限'; badgeCls = 'lg-skip';
      why = fmtD(bd) + ' 开盘 ' + f2(r.open) + ' > 介入上限 ' + f2(r.buyLimit)
        + '（高开 +' + ((r.open/r.buyLimit-1)*100).toFixed(1) + '%）按纪律放弃';
    } else if (r.status === '破位回避') {
      badge = '未买入 · 开盘破位'; badgeCls = 'lg-skip';
      why = fmtD(bd) + ' 开盘 ' + f2(r.open) + ' ≤ 止损 ' + f2(r.stopLoss)
        + '（低 ' + ((1-r.open/r.stopLoss)*100).toFixed(1) + '%）直接破位不开仓';
    } else {
      badge = r.status || '数据缺失'; badgeCls = 'lg-skip'; why = '无有效行情数据';
    }

    /* 「若买入」的当日收益：让每条放弃规则的代价/收益可见 */
    const ifB = (r.ifBought != null && isFinite(r.ifBought)) ? r.ifBought : null;
    let ifBHtml = '';
    if (ifB != null) {
      const good = ifB < 0;    // 放弃后如果本会亏 → 规则有效
      ifBHtml = '<div class="lg-ifbought ' + (good ? 'lg-if-good' : 'lg-if-miss') + '">'
        + '<span class="lg-if-tag">' + (good ? '✅ 避开' : '⚠️ 错过') + '</span>'
        + '若买入当日 <b>' + (ifB >= 0 ? '+' : '') + (ifB * 100).toFixed(2) + '%</b>'
        + '<span class="lg-if-note">' + (good ? '（规则有效：避开亏损）' : '（规则代价：错过收益）') + '</span>'
        + '</div>';
    }

    const slS = r.touch_sl === '是' ? '已触及' : r.touch_sl === '否' ? '未触及' : '—';
    const tgS = r.reach_tg === '是' ? '已到达' : r.reach_tg === '否' ? '未到达' : '—';

    let gapHtml = '';
    if (!bought && r.buyLimit > 0 && r.open > 0) {
      gapHtml = '<span class="m26-c-down" style="font-weight:700">+' + ((r.open/r.buyLimit-1)*100).toFixed(1) + '%</span> 超限';
    } else if (!bought && r.stopLoss > 0 && r.open > 0) {
      gapHtml = '<span class="m26-c-down" style="font-weight:700">-' + ((1-r.open/r.stopLoss)*100).toFixed(1) + '%</span> 破位';
    }

    const slDist = bought && r.stopLoss > 0 ? (((r.low / r.stopLoss - 1)) * 100).toFixed(1) : '';
    const tgDist = bought && r.target > 0 ? (((r.high / r.target - 1)) * 100).toFixed(1) : '';

    /* 显示价格：直接用 build_ledger.py 预计算的 _disp_* 字段（已卖出→T+2，其余→T+1）。
       不再在 JS 端做 sold && r.open2 条件判断，避免手机 WebView 缓存旧 JS 导致走错分支。 */
    const dispO = r._disp_open != null ? r._disp_open : o;
    const dispC = r._disp_close != null ? r._disp_close : c;
    const dispL = r._disp_low != null ? r._disp_low : parseFloat(r.low);
    const dispH = r._disp_high != null ? r._disp_high : parseFloat(r.high);
    const dispDay = r._disp_day || (sold ? (r.exit_date || '') : bd);

    return '<div class="lg-card">'
      /* ---- 标题行：名称/代码 + 日期上下文 + 当日核心行情 ---- */
      + '<div class="lg-hd"><span class="lg-no">' + (i + 1) + '</span>'
      + '<b>' + UI.esc(r.name) + '</b><span class="lg-code">' + UI.esc(r.code) + '</span>'
      + (bought
        ? '<span class="lg-timeline ' + (sold ? '' : 'lg-tl-hold') + '">'
          + fmtD(sd) + '选出 → ' + fmtD(bd) + '买入'
          + (sold ? ' → ' + fmtD(r.exit_date || '') + '卖出' : '')
          + '</span>'
        : '<span class="lg-timeline lg-tl-skip">'
          + fmtD(bd) + ' 放弃'
          + '</span>')
      + '<span class="lg-day-chg ' + dc.cls + '">' + dc.v + '</span>'
      /* 当日涨跌幅（open→close）：已卖出用 T+2，其余用 T+1 */
      + '<span class="lg-day-pct ' + dayPctCls + '" title="' + (sold ? fmtD(r.exit_date||'') : fmtD(bd)) + ' 涨跌幅（收盘价÷开盘价−1）">' + dayPctTxt + '</span>'
      + '<span class="lg-ret ' + dirCls(r.ret) + '">' + retTxt + '</span></div>'
      /* ---- 行情快照行：直接显示 T+1 原始 open/close/low/high（买入价与价格条一致，22.7 永远正确）---- */
      + '<div class="lg-price-bar' + (sold ? ' lg-pb-sold' : '') + '">'
      + '<div class="lg-price-item"><span class="lg-pk">' + (sold ? 'T+2 ' + fmtD(dispDay) + ' ' : '') + '开盘</span><span class="lg-pv">' + f2(o) + '</span></div>'
      + '<div class="lg-price-item"><span class="lg-pk">' + (sold ? 'T+2 ' + fmtD(dispDay) + ' ' : '') + '收盘</span><span class="lg-pv">' + f2(c) + '</span></div>'
      + (bought ? '<div class="lg-price-item"><span class="lg-pk">' + (sold ? 'T+2 ' : '') + '盘中最低</span><span class="lg-pv m26-c-down">' + f2(parseFloat(r.low)) + '</span></div>'
                + '<div class="lg-price-item"><span class="lg-pk">' + (sold ? 'T+2 ' : '') + '盘中最高</span><span class="lg-pv m26-c-up">' + f2(parseFloat(r.high)) + '</span></div>' : '')
      + (bought && !sold ? '<div class="lg-price-item lg-yest-ret"><span class="lg-pk">持仓收益</span><span class="lg-pv ' + dirCls(r.ret) + '">' + retTxt + '</span></div>' : '')
      + (sold ? '<div class="lg-price-item lg-yest-ret"><span class="lg-pk">' + fmtD(r.exit_date || '') + '结算收益</span><span class="lg-pv ' + dirCls(r.ret) + '">' + retTxt + '</span></div>' : '')
      + '</div>'
      + '<div class="lg-badge ' + badgeCls + '">' + badge + '</div>'
      + '<div class="lg-grid5">'
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
      /* 「若买入」得失条（仅未买入样本） */
      + ifBHtml
      + '<div class="lg-foot">'
      + (bought ? '买入 <b>@' + f2(o) + '</b>　'
        + (sold ? '卖出 <b>@' + (r.exit_price != null ? f2(r.exit_price) : '—') + '</b>' : '持有中')
        + '　' + why
        : why)
      + '</div></div>';
  }

  /* 月/季/年汇总表格（按开仓月份统计胜率、收益等） */
  function periodHtml() {
    const p = (LEDGER && LEDGER.period) || {};
    const tab = Store.get('ledgerPeriod', 'month');
    const isTab = t => tab === t ? 'active' : '';
    const tabs = [
      { k: 'month', l: '月度' },
      { k: 'quarter', l: '季度' },
      { k: 'year', l: '年度' }
    ];
    let h = '<div class="m26-sec-t">📊 按开仓时间汇总（胜率 · 收益）</div>'
      + '<div class="card-body tight">'
      + '<div class="tab-bar" data-tabs="ledgerPeriod">';
    tabs.forEach(t => {
      h += '<button class="tab ' + isTab(t.k) + '" data-tab="' + t.k + '">' + t.l + '</button>';
    });
    h += '</div><div class="tab-panels">';
    tabs.forEach(t => {
      const list = p[t.k] || [];
      h += '<div class="tab-panel ' + isTab(t.k) + '" data-panel="' + t.k + '">';
      if (!list.length) {
        h += '<div class="m26-empty">暂无' + t.l + '汇总数据</div>';
      } else {
        h += '<div class="m26-tbl-wrap"><table class="m26-tbl"><thead><tr>'
          + '<th>周期</th><th>批次</th><th>选出/买入</th><th>止损</th><th>达标</th><th>盈利</th>'
          + '<th>胜率</th><th>止损率</th><th>达标率</th><th>平均收益</th><th>累计收益</th>'
          + '</tr></thead><tbody>';
        list.forEach(x => {
          h += '<tr>'
            + '<td><b>' + UI.esc(x.label) + '</b></td>'
            + '<td>' + x.count + '</td>'
            + '<td>' + x.pick_n + '/' + x.buy_n + '</td>'
            + '<td class="m26-c-down">' + x.sl_n + '</td>'
            + '<td class="m26-c-up">' + x.tg_n + '</td>'
            + '<td class="' + dirCls(x.win_rate - 0.5) + '">' + x.win_n + '</td>'
            + '<td><b class="' + dirCls(x.win_rate - 0.5) + '">' + pctP(x.win_rate) + '</b></td>'
            + '<td class="m26-c-down">' + pctP(x.sl_rate) + '</td>'
            + '<td class="m26-c-up">' + pctP(x.tg_rate) + '</td>'
            + '<td><b class="' + dirCls(x.avg_ret) + '">' + pctS(x.avg_ret) + '</b></td>'
            + '<td><b class="' + dirCls(x.total_ret) + '">' + pctS(x.total_ret) + '</b></td>'
            + '</tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</div>';
    });
    h += '</div></div>';
    return h;
  }

  /* 台账主区块：速览 → 规则 → 昨天买入 → 今天计划 → 历史已了结 */
  function ledgerHtml(todayList, ntdLabel, todayDate) {
    const days = (LEDGER && LEDGER.days) || [];
    const cum = (LEDGER && LEDGER.cum) || {};
    /* 版本水印：肉眼可验「我看到的到底是不是最新一版」 */
    const up = (LEDGER && LEDGER.updated) ? LEDGER.updated : '';
    const ver = window.__APP_VER__ || '';
    let h = '<div class="m26-sec-t">📒 交易台账 · 昨天买 → 今天卖 → 下个交易日执行'
      + '<span class="lg-ver" title="数据生成时间 / 前端版本号">数据 ' + UI.esc(up)
      + (ver ? '　前端 ' + UI.esc(ver) : '') + '</span></div>';

    /* ① 速览：累计战绩 */
    if (cum.n_total) {
      h += '<div class="m26-stats">'
        + '<span class="m26-stat">累计 <b>' + cum.n_total + '</b> 笔<i>（' + (cum.day_n || 0) + ' 个信号日）</i></span>'
        + '<span class="m26-stat">胜率 <b class="' + dirCls(cum.win_rate - 0.5) + '">' + pctP(cum.win_rate) + '</b></span>'
        + '<span class="m26-stat">平均收益 <b class="' + dirCls(cum.avg_ret) + '">' + pctS(cum.avg_ret) + '</b></span>'
        + '<span class="m26-stat">止损率 <b class="m26-c-down">' + pctP(cum.sl_rate) + '</b></span>'
        + '<span class="m26-stat">达标率 <b class="m26-c-up">' + pctP(cum.tg_rate) + '</b></span>'
        + '</div>';
    }

    /* ② 月/季/年汇总 */
    h += periodHtml();

    /* ③ 买卖规则（常驻，一眼看懂） */
    h += '<div class="lg-rules">'
      + '<div class="lg-rule"><b class="lg-rk">🎯 买入</b><span>下一交易日<b>开盘价 ≤ 介入上限</b>才买；高开超过上限 → <b>放弃不买</b>。介入上限 = 信号日收盘价。</span></div>'
      + '<div class="lg-rule"><b class="lg-rk">🛑 止损</b><span>盘中<b>最低价 ≤ 止损价</b> → 卖出。止损价 = max(最近支撑位×0.99, 信号日收盘×0.93)，取更高者（更保守）。</span></div>'
      + '<div class="lg-rule"><b class="lg-rk">✅ 达标</b><span>盘中<b>最高价 ≥ 目标价</b> → 卖出。目标价 = 高于现价的最近有效压力位。</span></div>'
      + '<div class="lg-rule"><b class="lg-rk">💰 卖出</b><span>T+1 开盘买入 → <b>T+2 才能卖</b>（A股 T+1）。顺序：<b>止损优先 &gt; 达标 &gt; 收盘价</b>。同一天既触止损又达目标，按止损算（保守）。</span></div>'
      + '<div class="lg-rule"><b class="lg-rk">🚫 不追高开</b><span>高开哪怕 1 分钱也放弃，<b>不留容差</b>。介入上限是按信号日收盘算的盈亏比基准，高开买入会抬高成本、压缩盈亏比；A股高开低走极常见，追高是亏损主因。</span></div>'
      + '<div class="lg-rule"><b class="lg-rk">🚫 不接破位</b><span>开盘价已在<b>止损线下方</b> → 不开仓。这说明隔夜有利空或情绪骤变，买入等于一开仓就浮亏且立即该止损，逻辑自相矛盾。</span></div>'
      + '</div>';

    /* ③ 昨天选出 → 今天买入（持仓中批次，默认展开） */
    const holdDay = days.find(d => d.phase === 'holding');
    if (holdDay) {
      const s = holdDay.summary || {};
      h += '<div class="lg-block">'
        + '<div class="lg-block-t">🟢 昨天 ' + fmtD(holdDay.signal_date) + ' 选出 → ' + relDay(holdDay.buy_date) + ' ' + fmtD(holdDay.buy_date) + ' 开盘买入'
        + '<span class="lg-tag lg-tag-hold">持仓中</span></div>'
        + '<div class="lg-sub">实盘开仓 ' + s.buy_n + '/' + s.pick_n + ' 只'
        + (s.skip_n ? '（' + s.skip_n + ' 只按纪律未买入）' : '')
        + '　平均 <b class="' + dirCls(s.avg_ret) + '">' + pctS(s.avg_ret) + '</b>'
        + '　可卖出日 ' + fmtD(holdDay.sell_date) + '</div>';
      (holdDay.rows || []).forEach((r, i) => { h += ledgerRow(r, i, holdDay); });
      h += '<div class="lg-foot">⚠️ 未了结：收益为按最新收盘价计算的<b>预览值</b>，实际卖出价以 ' + fmtD(holdDay.sell_date) + ' 的止损/达标/收盘为准。</div>'
        + '</div>';
    }

    /* ④ 今天选出 → 下一交易日执行 */
    if (todayList && todayList.length) {
      h += '<div class="lg-block">'
        + '<div class="lg-block-t">🔵 ' + relDay(todayDate) + ' ' + fmtD(todayDate) + ' 选出 → <b>' + (ntdLabel && ntdLabel.date ? fmtD(ntdLabel.date) : UI.esc(ntdLabel || '下一交易日')) + '</b> 开盘执行'
        + '<span class="lg-tag lg-tag-plan">待执行</span></div>';
      todayList.forEach(r => {
        h += '<div class="lg-plan">'
          + '<b>' + UI.esc(r.name) + '</b><span class="lg-code">' + UI.esc(r.code) + '</span>'
          + '<span class="lg-plan-g">'
          + '介入≤<b class="m26-c-warn">' + f2(r.buyLimit) + '</b>'
          + '　止损<b class="m26-c-down">' + f2(r.stopLoss) + '</b>'
          + '　目标<b class="m26-c-up">' + f2(r.target) + '</b>'
          + '　盈亏比<b>' + (r.rr ? r.rr.toFixed(1) : '—') + ':1</b>'
          + '</span></div>';
      });
      h += '<div class="lg-foot">开盘后本页自动核对：开盘价是否 ≤ 介入上限、盘中是否触止损/达目标，并算出收益率。</div></div>';
    }

    /* ⑥ 历史已了结：按信号月份分组折叠（基于完整 history，不再只显示最近 3 批） */
    const hist = (LEDGER && LEDGER.history) || [];
    const doneDays = hist.filter(d => d.phase === 'done');
    if (doneDays.length) {
      const groups = {};
      doneDays.forEach(d => {
        const k = d.signal_date.slice(0, 7);
        if (!groups[k]) groups[k] = [];
        groups[k].push(d);
      });
      const months = Object.keys(groups).sort().reverse();
      h += '<div class="m26-fold" id="lgHist"><div class="m26-fold-h" onclick="this.parentElement.classList.toggle(\'m26-open\')">'
        + '📁 历史已了结（共 ' + doneDays.length + ' 批，按信号月份分组）<span class="m26-fold-arrow">▸</span></div>'
        + '<div class="m26-fold-b">';
      months.forEach(m => {
        const list = groups[m];
        const monthLabel = m.replace('-', '年') + '月';
        const ms = list.reduce((acc, d) => {
          const s = d.summary || {};
          acc.pick_n += s.pick_n || 0;
          acc.buy_n += s.buy_n || 0;
          acc.sl_n += s.sl_n || 0;
          acc.tg_n += s.tg_n || 0;
          acc.win_n += s.win_n || 0;
          if (s.avg_ret) acc.avg_rets.push(s.avg_ret);
          return acc;
        }, { pick_n: 0, buy_n: 0, sl_n: 0, tg_n: 0, win_n: 0, avg_rets: [] });
        const mWinRate = ms.buy_n ? (ms.win_n / ms.buy_n) : 0;
        const mAvgRet = ms.avg_rets.length ? (ms.avg_rets.reduce((a, b) => a + b, 0) / ms.avg_rets.length) : 0;
        const mTotalRet = ms.avg_rets.length ? ms.avg_rets.reduce((a, b) => a + b, 0) : 0;
        h += '<div class="m26-fold">'
          + '<div class="m26-fold-h" onclick="this.parentElement.classList.toggle(\'m26-open\')">'
          + '📅 ' + monthLabel + '（' + list.length + ' 批）'
          + '　选出 ' + ms.pick_n + ' / 买入 ' + ms.buy_n
          + '　胜率 <b class="' + dirCls(mWinRate - 0.5) + '">' + pctP(mWinRate) + '</b>'
          + '　平均 <b class="' + dirCls(mAvgRet) + '">' + pctS(mAvgRet) + '</b>'
          + '　累计 <b class="' + dirCls(mTotalRet) + '">' + pctS(mTotalRet) + '</b>'
          + '<span class="m26-fold-arrow">▸</span></div>'
          + '<div class="m26-fold-b">';
        list.forEach(d => {
          const s = d.summary || {};
          h += '<div class="lg-block">'
            + '<div class="lg-block-t">📅 ' + fmtD(d.signal_date) + ' 选出 → ' + fmtD(d.buy_date) + ' 买入'
            + '<span class="lg-tag lg-tag-done">已了结</span></div>'
            + '<div class="lg-sub">开仓 ' + s.buy_n + '/' + s.pick_n + '　止损 ' + s.sl_n + '　达标 ' + s.tg_n
            + '　盈利 ' + s.win_n + '　平均 <b class="' + dirCls(s.avg_ret) + '">' + pctS(s.avg_ret) + '</b></div>';
          (d.rows || []).forEach((r, i) => { h += ledgerRow(r, i, d); });
          h += '</div>';
        });
        h += '</div></div>';
      });
      h += '</div></div>';
    }

    if (!days.length && !(todayList && todayList.length)) {
      h += '<div class="m26-empty">暂无历史执行记录（首次验证在信号日的下一个交易日收盘后生成）。</div>';
    }
    return h;
  }

  /* ---------------- 盘前预览图（Snapshot 长图） ---------------- */
  function imageDoc(res) {
    if (!res) return null;
    const g = res.gate || {};
    const stateTxt = { risk_on: '偏暖', neutral: '中性', risk_off: '偏冷', freeze: '极冷·空仓' }[g.state] || g.state;
    const ntd = nextTradeDate(res.date);
    const sec = [];
    sec.push({
      title: '🧭 当日大盘总览（主闸门）', blocks: [
        { t: 'chips', items: (g.aChips || []).map(c => ({ label: c.label, value: c.value, dir: c.dir })) },
        { t: 'text', text: '大盘总览分 ' + g.aScore + ' · 海外影响分 ' + g.ovScore + ' → 综合闸门 ' + g.gate + '（' + stateTxt + '）。' + (g.noOpen ? '⛔ 极冷市：本系统今日不给D级买入，空仓等待。' : 'D级阈值 ' + g.dThresh + ' 分，最多 ' + g.maxD + ' 只。') }
      ]
    });
    sec.push({ title: '🌐 隔夜海外映射（辅）', blocks: [{ t: 'rows', items: (g.ovRows || []) }] });
    sec.push({
      title: '📊 ABCD 分层统计', blocks: [{ t: 'chips', items: [
        { label: 'D ' + ntd.label, value: res.dList.length + ' 只', dir: 'up' },
        { label: 'C 待观察', value: res.cList.length + ' 只', dir: '' },
        { label: 'B 初级', value: res.bList.length + ' 只', dir: '' },
        { label: 'A 弱', value: res.aList.length + ' 只', dir: 'down' }
      ] }] }
    );
    if (res.dList && res.dList.length) {
      const rows = res.dList.map((r, i) => ([
        { text: (i + 1) + '. ' + r.name + '（' + r.code + '）', dir: 'up' },
        { text: '  评分 ' + r.score + '  介入≤' + f2(r.buyLimit) + '  止损 ' + f2(r.stopLoss) + '  目标 ' + f2(r.target), dir: '' }
      ]));
      // 追加每只的核心逻辑一行
      const logicRows = [];
      res.dList.forEach((r, i) => {
        logicRows.push([{ text: (i + 1) + '. ' + r.name + '（' + r.code + '）', dir: 'up' }, { text: '  评分 ' + r.score + ' · α ' + pct1(r.alpha20) + ' · 量比 ' + (r.volRatio ? r.volRatio.toFixed(1) : '—'), dir: '' }]);
        logicRows.push([{ text: '    ' + (r.advice ? r.advice[0].replace('【核心逻辑】', '') : ''), dir: '' }]);
        logicRows.push([{ text: '    介入≤' + f2(r.buyLimit) + ' · 止损 ' + f2(r.stopLoss) + ' · 目标 ' + f2(r.target) + (r.mappedHit ? ' · 映射:' + r.mappedHit : ''), dir: '' }]);
      });
      sec.push({ title: '🎯 D · 次日即可买入（含逻辑拆解建议）', blocks: [{ t: 'rows', items: logicRows }] });
    } else {
      sec.push({ title: '🎯 D · 次日即可买入', blocks: [{ t: 'text', text: g.noOpen ? '极冷市空仓，无D级。' : '今日达标D不足，宁缺毋滥。C预备队可关注次日确认。' }] });
    }
    if (res.cList && res.cList.length) {
      sec.push({ title: '⚠️ C · 待观察', blocks: [{ t: 'rows', items: res.cList.map(r => ([{ text: r.name + '（' + r.code + '）', dir: '' }, { text: '  评分 ' + r.score, dir: '' }])) }] });
    }
    sec.push({
      title: '⚠️ 风险提示', blocks: [{ t: 'text', text: '本报告为「个股拆解选股」系统盘后参考，独立于2560战法。D级为' + ntd.label + '候选，须' + ntd.label.replace('可买', '竞价/开盘') + '确认（不追高、严格止损）。数据=' + (res.klineSrc || '三源') + 'K线 + 东财快照 + Market海外；' + (res.idxNote || '') + '。本地规则引擎生成，非远程大模型，不构成投资建议。' }]
    });
    return { title: '个股拆解选股 · 盘前预览', sub: res.date + ' 跑批 · 目标交易日 ' + ntd.date + '(' + ntd.wd + ') · 闸门 ' + (g.gate != null ? g.gate : '—'), filename: '个股拆解选股_' + res.date + '.png', sections: sec };
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const res = Store.get('pickscreen_last', null);
    const g = res && res.gate;
    const stateMap = { risk_on: { t: '偏暖', c: 'm26-c-up' }, neutral: { t: '中性', c: '' }, risk_off: { t: '偏冷', c: 'm26-c-warn' }, freeze: { t: '极冷·空仓', c: 'm26-c-down' } };
    let h = '';

    // 顶部说明 + 操作
    const autoOn = Store.get('ps_auto', true);
    const ntd = nextTradeDate(res && res.date);
    h += '<div class="card"><div class="card-head"><h3>🧬 每日盘后选股（官方跑批为唯一决策源）</h3>'
      + '<span class="sub">每日 16:10 自动跑批（daily_pick.py）· 盘中可实时试算（仅供参考）</span>'
      + '<div class="right">'
      + '<label class="m26-switch" title="自动同步最新跑批结果">'
      + '<input type="checkbox" ' + (autoOn ? 'checked' : '') + ' onchange="V.pickscreen.act(\'auto\', this.checked)"> 自动同步</label>'
      + (res ? '<button class="btn btn-sm btn-ghost" onclick="V.pickscreen.act(\'img\')">🖼️ 盘前预览图</button>' : '')
      + (res ? '<button class="btn btn-sm btn-ghost" onclick="V.pickscreen.act(\'clear\')">清除结果</button>' : '')
      + '<button class="btn btn-sm btn-ghost" onclick="V.pickscreen.act(\'sync\')" title="拉取每日16:10官方跑批结果">🔄 同步跑批结果</button>'
      + '<button class="btn btn-sm btn-solid" onclick="V.pickscreen.act(\'run\')" title="浏览器内全市场实时重算，仅供参考，最终以16:10官方跑批为准">⚡ 盘中实时试算</button>'
      + '</div></div><div class="card-body">'
      + '<div class="m26-prog" id="psProg"></div>'
      + '<div class="live-bar" id="psAutoBar" style="margin-top:8px"></div>'
      + '<div class="m26-closehint" id="psCloseHint" style="display:none">'
      + '📊 今日盘后选股已生成（<span class="ts"></span>），本页即为结果展示区。</div>';

    // 双模式说明（始终展示）
    h += '<div class="m26-shields">'
      + '<div class="m26-shield"><div class="m26-shield-t">📌 唯一决策源 = 每日 16:10 官方跑批（daily_pick.py）</div><div class="m26-shield-d">简版大盘闸门（可开仓/轻仓/空仓）+ 全市场打分（趋势/量能/独立α/位置/风险）+ 主力资金流过滤；剔除银行与僵尸股（14日ATR≥1.5%）；盈亏比<1.5 不进名单。数据=腾讯实时行情+新浪K线(当日已补齐)+乐咕涨跌家数。</div></div>'
      + '<div class="m26-shield"><div class="m26-shield-t">⚡ 盘中实时试算（仅供参考，非最终决策）</div><div class="m26-shield-d">交易时段（9:15-11:30 / 13:00-15:00）每 90 秒在浏览器内全市场重算一次，用于盘中跟踪盘面变化；<b>次日买入请以 16:10 官方跑批结果为准</b>，两者冲突时永远以官方跑批为准。</div></div>'
      + '</div>';

    if (!res) {
      h += '<div class="m26-empty">暂无结果——点「🔄 同步跑批结果」拉取每日 16:10 官方选股结果（唯一决策源）；或点「⚡ 盘中实时试算」在浏览器内重算一遍（仅供参考，非最终决策）。</div>';
      h += '</div></div>';
      return h;
    }

    // 结果来源标识横幅
    if (res.official) {
      h += '<div class="m26-noopen" style="background:rgba(20,160,90,.10);border-color:rgba(20,160,90,.35);color:#1a8a50">✅ 官方跑批结果（唯一决策源）· ' + UI.esc(res.date || '') + ' ' + UI.esc((res.runAt || '').slice(11, 16)) + ' 生成</div>';
    } else {
      h += '<div class="m26-noopen" style="background:rgba(230,140,0,.10);border-color:rgba(230,140,0,.35);color:#b06a00">⚡ 盘中实时试算结果（非最终决策）· ' + UI.esc(res.date || '') + ' ' + UI.esc((res.runAt || '').slice(11, 19)) + ' 生成 · 最终以每日 16:10 官方跑批为准</div>';
    }

    // 闸门结论
    const sm = stateMap[g.state] || { t: g.state, c: '' };
    if (res.official) {
      h += '<div class="m26-sec-t">🧭 今日决策：<b class="' + sm.c + '">' + UI.esc(res.decision || sm.t) + '</b>（闸门分 ' + g.gate + ' · ' + UI.esc(res.date || '') + ' ' + UI.esc((res.runAt || '').slice(11, 16)) + ' 跑批）</div>';
    } else {
      h += '<div class="m26-sec-t">🧭 大盘/海外闸门：<b class="' + sm.c + '">' + sm.t + '</b>（综合 ' + g.gate + ' = 大盘 ' + g.aScore + '×0.65 + 海外 ' + g.ovScore + '×0.35）'
        + ' · D阈值 ' + g.dThresh + ' 分 · 最多 ' + g.maxD + ' 只</div>';
      if (g.noOpen) h += '<div class="m26-noopen">⛔ 极冷市：本系统今日不给 D 级买入信号，空仓等待（防护机制正常输出）。</div>';
    }
    if (g.note) h += '<div class="m26-cell-sub" style="margin:2px 0 6px">数据标注：' + UI.esc(g.note) + '</div>';

    // 大盘总览 chips + 海外映射
    h += '<div class="m26-stats">'
      + (g.aChips || []).map(c => '<span class="m26-stat">' + UI.esc(c.label) + ' <b class="' + (c.dir === 'up' ? 'm26-c-up' : c.dir === 'down' ? 'm26-c-down' : '') + '">' + UI.esc(c.value) + '</b></span>').join('')
      + '</div>';
    if (g.mapped && g.mapped.length) {
      h += '<div class="m26-cell-sub" style="margin:2px 0 6px">映射方向：' + g.mapped.map(m => '「' + UI.esc(m.dir) + '」' + UI.esc(m.note || '')).join('；') + '</div>';
    }

    // ABCD 统计
    const st = res.stats;
    if (res.official) {
      h += '<div class="m26-stats">'
        + '<span class="m26-stat">粗筛 <b>' + st.coarseN + '</b></span>'
        + '<span class="m26-stat">精筛成功 <b>' + st.klineOk + '</b>' + (st.kFail ? '<i>（失败 ' + st.kFail + '）</i>' : '') + '</span>'
        + '<span class="m26-stat m26-stat-hl">🎯 ' + ntd.label + ' <b>' + res.dList.length + '</b></span>'
        + '</div>';
    } else {
      h += '<div class="m26-stats">'
        + '<span class="m26-stat">快照 <b>' + st.snapN + '</b></span>'
        + '<span class="m26-stat">粗筛 <b>' + st.coarseN + '</b><i>（剔 ' + st.dropped + '）</i></span>'
        + '<span class="m26-stat">精筛成功 <b>' + st.klineOk + '</b>' + (st.kFail ? '<i>（失败 ' + st.kFail + '）</i>' : '') + '</span>'
        + '<span class="m26-stat m26-stat-hl">🎯 D 次日可买 <b>' + st.dN + '</b></span>'
        + '<span class="m26-stat">⚠️ C 待观察 <b>' + res.cList.length + '</b></span>'
        + '<span class="m26-stat">⏳ B 初级 <b>' + res.bList.length + '</b></span>'
        + '<span class="m26-stat">👁 A 弱 <b>' + res.aList.length + '</b></span>'
        + '</div>';
    }

    // 交易台账（昨日执行结果 + 今日操作计划 + 买卖规则）
    h += ledgerHtml(res.dList, ntd, res.date);

    // D 表（含建议）
    if (res.dList && res.dList.length) {
      h += '<div class="m26-sec-t">🎯 D · ' + ntd.label + '（Top ' + res.dList.length + '，含逻辑拆解最终建议）</div>'
        + '<div class="m26-tbl-wrap"><table class="m26-tbl"><thead><tr>'
        + '<th>#</th><th>标的</th><th>评分</th><th>现价</th><th>介入上限</th><th>止损价</th><th>目标价</th><th>α(20日)</th><th>量比</th><th>位置</th><th>行业</th><th>映射</th>'
        + '</tr></thead><tbody>';
      res.dList.forEach((r, i) => {
        h += '<tr class="m26-row-d">'
          + '<td>' + (i + 1) + '</td>'
          + '<td><b>' + UI.esc(r.name) + '</b><div class="m26-cell-sub">' + UI.esc(r.code) + '</div></td>'
          + '<td><b class="m26-c-up">' + r.score + '</b></td>'
          + '<td>' + f2(r.close) + '</td>'
          + '<td class="m26-c-warn">' + f2(r.buyLimit) + '<div class="m26-cell-sub">高开破此放弃</div></td>'
          + '<td class="m26-c-down">' + f2(r.stopLoss) + '</td>'
          + '<td class="m26-c-up">' + f2(r.target) + '</td>'
          + '<td class="' + (r.alpha20 > 0 ? 'm26-c-up' : 'm26-c-down') + '">' + pct1(r.alpha20) + '</td>'
          + '<td>' + (r.volRatio ? r.volRatio.toFixed(1) : '—') + '</td>'
          + '<td>' + (r.posRank != null ? Math.round(r.posRank * 100) + '%' : '—') + '</td>'
          + '<td>' + (r.industry ? UI.esc(r.industry) : '—') + '</td>'
          + '<td>' + (r.mappedHit ? '<span class="m26-c-up">' + UI.esc(r.mappedHit) + '</span>' : '—') + '</td>'
          + '</tr>'
          + '<tr><td colspan="12" style="text-align:left;background:rgba(0,0,0,0.03)"><div class="m26-cell-sub" style="white-space:normal;line-height:1.6">'
          + (r.advice || []).map(x => UI.esc(x)).join('<br>')
          + '</div></td></tr>';
      });
      h += '</tbody></table></div>';
    } else {
      h += '<div class="m26-empty">🎯 D · ' + ntd.label + '：' + (res.official ? UI.esc(res.decision || '今日无可买') : (g.noOpen ? '极冷市空仓，本系统不给D。' : '今日达标D不足（独立α+多模块确认未同时满足），宁缺毋滥。')) + '</div>';
    }

    // C/B/A 通用表
    const obs = (list, tag) => list.length ? ('<div class="m26-sec-t">' + tag + '（' + list.length + ' 只）</div>'
      + '<div class="m26-tbl-wrap"><table class="m26-tbl"><thead><tr><th>#</th><th>标的</th><th>评分</th><th>现价</th><th>α(20日)</th><th>量比</th><th>位置</th><th>行业</th></tr></thead><tbody>'
      + list.map((r, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + UI.esc(r.name) + '</b><div class="m26-cell-sub">' + UI.esc(r.code) + '</div></td>'
        + '<td><b>' + r.score + '</b></td><td>' + f2(r.close) + '</td>'
        + '<td class="' + (r.alpha20 > 0 ? 'm26-c-up' : 'm26-c-down') + '">' + pct1(r.alpha20) + '</td>'
        + '<td>' + (r.volRatio ? r.volRatio.toFixed(1) : '—') + '</td>'
        + '<td>' + (r.posRank != null ? Math.round(r.posRank * 100) + '%' : '—') + '</td>'
        + '<td>' + (r.industry ? UI.esc(r.industry) : '—') + '</td></tr>').join('')
      + '</tbody></table></div>') : '';
    h += obs(res.cList, '⚠️ C · 待观察（逻辑成立但某项未完全确认）');
    h += obs(res.bList, '⏳ B · 初级（趋势初现但α/量能不足）');
    h += obs(res.aList, '👁 A · 弱（通过粗筛但独立逻辑弱）');

    // 失败样本
    if (res.failSample && res.failSample.length) {
      h += '<div class="m26-fails"><b>K线获取失败样本（共 ' + st.kFail + ' 只，如实列出前 ' + res.failSample.length + ' 条，未编造）：</b>'
        + res.failSample.map(x => '<div class="m26-fail-item">· ' + UI.esc(x) + '</div>').join('') + '</div>';
    }

    if (res.official) {
      h += '<div class="m26-src">口径：每日 16:10 盘后跑批（daily_pick.py）；数据=腾讯实时行情(指数/当日收盘) + 新浪K线(qfq,当日bar已补齐) + 新浪资金流 + 乐咕涨跌家数。'
        + '综合分=趋势0.25/量能0.20/α0.25/位置0.15/风险0.15（本地规则引擎）。硬条件：评分达标 + 趋势多头 + α>0 + 盈亏比≥1.5:1 + 主力净流出<15%；剔除银行/僵尸股（14日ATR≥1.5%）。'
        + '<span class="m26-warn-text">⚠️ 本页与跑批结论永远一致（只读展示，不独立计算）；不构成投资建议；须次日竞价/开盘确认，不追高、严格止损。</span></div>';
    } else {
      h += '<div class="m26-src">口径：快照=东财沪深全市场（按成交额降序，封顶800）；K线=' + (res.klineSrc || '三源') + '前复权；α基准=' + UI.esc(res.idxNote || '沪深300 20日涨幅') + '；闸门=大盘总览(0.65)+海外(0.35)。'
        + '综合分=趋势0.25/量能0.20/α0.25/位置0.15/风险0.15（本地规则引擎，非大模型）。独立α=个股20日涨幅−沪深300同期涨幅。'
        + '<span class="m26-warn-text">⚠️ 本系统为盘后参考，独立于2560战法，不构成投资建议；D级须次日竞价/开盘确认，不追高、严格止损。</span></div>';
    }

    h += '</div></div>';
    return h;
  }

  /* ---------------- 官方结果同步（唯一决策源 = 每日16:10盘后跑批 daily_pick.py） ----------------
     双模式：官方跑批结果为唯一决策源；盘中实时试算（run()）仅供参考，页面明确标注来源。 */
  async function syncOfficial(manual) {
    const say = t => { const el = UI.$('#psProg'); if (el) el.textContent = t; };
    try {
      const r = await fetch('/api/reports/pick_latest.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || !j.date || !j.gate) throw new Error('跑批结果为空');
      const cur = Store.get('pickscreen_last', null);
      const changed = !cur || !cur.official || cur.date !== j.date || cur.runAt !== j.runAt;
      if (changed) Store.set('pickscreen_last', j);
      say('');
      if (manual) UI.toast('已同步每日跑批结果（' + j.date + ' ' + (j.runAt || '').slice(11, 16) + '）');
      if (changed && current === 'pickscreen') App.refresh();
      return true;
    } catch (e) {
      if (manual) UI.toast('未找到跑批结果 pick_latest.json：请等待每日 16:10 自动跑批，或手动运行 daily_pick.py');
      return false;
    }
  }

  /* ---------------- 动作 ---------------- */
  function act(fn, arg) {
    if (fn === 'run') run();              // ⚡ 盘中实时试算（浏览器内全市场重算，非最终决策）
    else if (fn === 'sync') syncOfficial(true);   // 🔄 同步官方跑批结果（每日16:10）
    else if (fn === 'auto') {
      Store.set('ps_auto', !!arg);
      paintAutoBar();
      UI.toast(arg ? '已开启自动跟随（交易时段每 90 秒实时试算，非交易时段自动同步官方跑批）' : '已关闭自动跟随');
    }
    else if (fn === 'clear') { Store.set('pickscreen_last', null); App.refresh(); }
    else if (fn === 'img') {
      const res = Store.get('pickscreen_last', null);
      if (!res) { UI.toast('暂无选股结果'); return; }
      Snapshot.show(imageDoc(res));
    }
  }

  /* ---------------- 挂载：进入页面先同步官方结果；交易时段实时试算，非交易时段定时同步 ---------------- */
  function mount(reg) {
    paintAutoBar();
    syncOfficial();
    loadLedger().catch(() => {});
    reg.interval(() => {
      paintAutoBar();
      if (!Store.get('ps_auto', true) || _running) return;
      if (inTradingHours()) {
        // 交易时段：静默实时试算，完成后刷新当前页
        run().then(() => { if (current === 'pickscreen') App.refresh(); }).catch(() => {});
      } else {
        // 非交易时段：静默同步官方跑批结果；有更新则刷新当前页
        syncOfficial().catch(() => {});
      }
    }, AUTO_MS);
    // 整点/跨时段时刷新状态条
    reg.interval(() => paintAutoBar(), 30000);
    // 盘后报告提示：检测 reports 目录是否有比当前结果更新的收盘图
    reg.interval(() => {
      if (current !== 'pickscreen') return;
      const last = Store.get('pickscreen_last', null);
      const lastTs = last && last.runAt ? new Date(String(last.runAt).replace(/-/g, '/')).getTime() : 0;
      fetch('/api/reports?ts=' + Date.now(), { cache: 'no-store' })
        .then(r => r.json())
        .then(j => {
          if (!j.ok || !j.items) return;
          const close = j.items.filter(x => /^pickscreen_\d{8}_/.test(x.file)); // 收盘选股图（pickscreen_YYYYMMDD_HHMM.png）
          if (!close.length) return;
          const latest = close.reduce((m, x) => Math.max(m, new Date(x.mtime.replace(/-/g, '/')).getTime()), 0);
          const bar = UI.$('#psCloseHint');
          if (latest > lastTs && bar) {
            bar.style.display = 'flex';
            bar.dataset.ts = latest;
            bar.querySelector('.ts').textContent = new Date(latest).toTimeString().slice(0, 5);
          }
        })
        .catch(() => {});
    }, 60000);
  }

  return {
    title: '每日盘后选股',
    desc: '每日16:10官方跑批（唯一决策源）· 盘中实时试算（仅供参考）',
    render, act, run, mount, imageDoc, marketGate, scoreStock, COARSE
  };
})();
