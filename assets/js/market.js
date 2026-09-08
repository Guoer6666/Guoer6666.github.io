/* ============================================================
   market.js · 行情数据层
   多源降级：腾讯 qt.gtimg.cn → 东方财富 push2 → Yahoo(直连/代理)
   ============================================================ */
const Market = (() => {

  const CACHE_KEY = 'mkt_cache';
  // 仅保留确实返回 CORS 头的公共代理，避免无效请求刷屏
  const PROXIES = [
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)
  ];

  /* ---------- 标的定义 ---------- */
  const SYMBOLS = {
    // A股
    sh:      { name: '上证指数',   tx: 'sh000001', em: '1.000001' },
    sz:      { name: '深证成指',   tx: 'sz399001', em: '0.399001' },
    cyb:     { name: '创业板指',   tx: 'sz399006', em: '0.399006' },
    kc50:    { name: '科创50',     tx: 'sh000688', em: '1.000688' },
    kcz:     { name: '科创综指',   tx: 'sh000680', em: '1.000680' },
    bz50:    { name: '北证50',     tx: 'bj899050', em: '0.899050' },
    hs300:   { name: '沪深300',    tx: 'sh000300', em: '1.000300' },
    // 港股
    hsi:     { name: '恒生指数',   tx: 'hkHSI',    em: '100.HSI' },
    hstech:  { name: '恒生科技',   tx: 'hkHSTECH', em: '124.HSTECH' },
    // 美股
    dji:     { name: '道琼斯',     tx: 'usDJI',    em: '100.DJIA' },
    ixic:    { name: '纳斯达克',   tx: 'usIXIC',   em: '100.NDX' },
    spx:     { name: '标普500',    tx: 'usINX',    em: '100.SPX' },
    // 美股重点个股（AI算力 / 存储 / 科技巨头 / 中概 / 新能源车）
    nvda:    { name: '英伟达',     tx: 'usNVDA',   em: '105.NVDA' },
    amd:     { name: '超威半导体', tx: 'usAMD',    em: '105.AMD' },
    avgo:    { name: '博通',       tx: 'usAVGO',   em: '105.AVGO' },
    tsm:     { name: '台积电',     tx: 'usTSM',    em: '106.TSM' },
    arm:     { name: '安谋',       tx: 'usARM',    em: '105.ARM' },
    mu:      { name: '美光科技',   tx: 'usMU',     em: '105.MU' },
    wdc:     { name: '西部数据',   tx: 'usWDC',    em: '105.WDC' },
    stx:     { name: '希捷科技',   tx: 'usSTX',    em: '105.STX' },
    aapl:    { name: '苹果',       tx: 'usAAPL',   em: '105.AAPL' },
    msft:    { name: '微软',       tx: 'usMSFT',   em: '105.MSFT' },
    googl:   { name: '谷歌',       tx: 'usGOOGL',  em: '105.GOOGL' },
    amzn:    { name: '亚马逊',     tx: 'usAMZN',   em: '105.AMZN' },
    meta:    { name: 'Meta',       tx: 'usMETA',   em: '105.META' },
    tsla:    { name: '特斯拉',     tx: 'usTSLA',   em: '105.TSLA' },
    baba:    { name: '阿里巴巴',   tx: 'usBABA',   em: '106.BABA' },
    pdd:     { name: '拼多多',     tx: 'usPDD',    em: '105.PDD' },
    jd:      { name: '京东',       tx: 'usJD',     em: '105.JD' },
    // 日韩
    n225:    { name: '日经225',    em: '100.N225',  yh: '^N225' },
    ks11:    { name: '韩国综合',   em: '100.KS11',  yh: '^KS11' },
    topix:   { name: '东证TOPIX',  em: '100.TPX',   yh: '^TOPX' },
    // 港股重点个股（腾讯源，实时真实行情，与 A 股联动最紧）
    hk_tx:   { name: '腾讯控股',   tx: 'hk00700' },
    hk_baba: { name: '阿里巴巴-W', tx: 'hk09988' },
    hk_mt:   { name: '美团-W',     tx: 'hk03690' },
    hk_xm:   { name: '小米集团',   tx: 'hk01810' },
    hk_ks:   { name: '快手-W',     tx: 'hk01024' },
    hk_aia:  { name: '友邦保险',   tx: 'hk01299' },
    hk_hsbc: { name: '汇丰控股',   tx: 'hk00005' },
    hk_ccb:  { name: '建设银行',   tx: 'hk00939' },
    hk_pa:   { name: '中国平安',   tx: 'hk02318' },
    hk_bydi: { name: '比亚迪股份', tx: 'hk01211' },
    hk_jd:   { name: '京东集团',   tx: 'hk09618' },
    hk_ntes: { name: '网易',       tx: 'hk09999' },
    hk_li:   { name: '理想汽车',   tx: 'hk02015' },
    // 欧洲（仅 Yahoo 可降级，CORS 失败则标记暂无，不虚构）
    dax:     { name: '德国DAX',    yh: '^GDAXI' },
    ftse:    { name: '英国富时',   yh: '^FTSE' },
    cac:     { name: '法国CAC',    yh: '^FCHI' },
    // 商品 / 汇率
    wti:     { name: '纽约原油',   tx: 'hf_CL',    em: '102.CL00Y' },
    brent:   { name: '布伦特原油', tx: 'hf_OIL',   em: '102.B00Y' },
    gold:    { name: '纽约黄金',   tx: 'hf_GC',    em: '102.GC00Y' },
    usdcnh:  { name: '离岸人民币', tx: 'hkUSDCNH', em: '133.USDCNH' },
    us10y:   { name: '美债10年',   em: '100.UST10Y', yh: '^TNX' }
  };

  /* ---------- 工具 ---------- */
  function timeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }
  function decodeGBK(buf) {
    try { return new TextDecoder('gbk').decode(buf); }
    catch (e) { return new TextDecoder('utf-8').decode(buf); }
  }
  const f = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };

  function usTradingDay() {
    /* 美股交易日：北京时间 21:30 之前属于上一交易日，21:30 之后开启当日美股交易
       收盘在北京时间次日 ~06:00，仍算同一交易日。简单规则：
       hour >= 21:30 时取当日，否则取昨日。 */
    const now = new Date();
    const beijing = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const dayShift = (beijing.getHours() >= 21 && beijing.getMinutes() >= 30) ? 0 : -1;
    const d = new Date(beijing);
    d.setDate(d.getDate() + dayShift);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- 数据源 1：腾讯 ---------- */
  async function fromTencent(codes) {
    if (!codes.length) return {};
    const url = 'https://qt.gtimg.cn/q=' + codes.join(',') + '&_=' + Date.now();
    const res = await timeout(fetch(url, { cache: 'no-store' }), 9000);
    if (!res.ok) throw new Error('tencent ' + res.status);
    const text = decodeGBK(await res.arrayBuffer());
    const out = {};
    text.split(';').forEach(line => {
      const m = line.match(/v_([A-Za-z0-9_.]+)="([^"]*)"/);
      if (!m || !m[2]) return;
      const code = m[1], raw = m[2];
      if (code.startsWith('hf_')) {
        const a = raw.split(',');
        const price = f(a[0]), prev = f(a[7]);
        out[code] = {
          name: a[13] || code, price, prevClose: prev,
          chg: (price != null && prev != null) ? price - prev : null,
          chgPct: f(a[1]), open: f(a[2]), high: f(a[4]), low: f(a[5]),
          time: a[6] || '', src: '腾讯'
        };
      } else {
        const a = raw.split('~');
        if (a.length < 33) return;
        out[code] = {
          name: a[1], price: f(a[3]), prevClose: f(a[4]), open: f(a[5]),
          chg: f(a[31]), chgPct: f(a[32]), high: f(a[33]), low: f(a[34]),
          volume: f(a[6]), amount: f(a[37]), time: fmtTxTime(a[30]), src: '腾讯',
          /* V4 新增：a[38]=换手率(%) a[44]=流通市值(亿) a[45]=总市值(亿)——供情绪模块换手维度与解禁占比测算 */
          turnover: f(a[38]), floatMcap: f(a[44]), totalMcap: f(a[45])
        };
      }
    });
    return out;
  }
  function fmtTxTime(t) {
    if (!t) return '';
    if (/^\d{14}$/.test(t)) return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)} ${t.slice(8,10)}:${t.slice(10,12)}`;
    return t.replace(/\//g, '-').slice(0, 16);
  }

  /* ---------- 数据源 2：东方财富 ---------- */
  async function fromEastmoney(secids) {
    if (!secids.length) return {};
    const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&np=1'
      + '&fields=f1,f2,f3,f4,f12,f13,f14,f15,f16,f17,f18,f124'
      + '&secids=' + secids.join(',') + '&_=' + Date.now();
    const res = await timeout(fetch(url, { cache: 'no-store' }), 9000);
    if (!res.ok) throw new Error('em ' + res.status);
    const j = await res.json();
    const list = (j && j.data && j.data.diff) || [];
    const out = {};
    (Array.isArray(list) ? list : Object.values(list)).forEach(d => {
      const id = d.f13 + '.' + d.f12;
      out[id] = {
        name: d.f14, price: f(d.f2), chgPct: f(d.f3), chg: f(d.f4),
        high: f(d.f15), low: f(d.f16), open: f(d.f17), prevClose: f(d.f18),
        time: '', src: '东财'
      };
    });
    return out;
  }

  /* ---------- 数据源 3：Yahoo（直连 → 代理） ---------- */
  async function fromYahoo(symbol) {
    const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
    const tries = [base].concat(PROXIES.map(p => p(base)));
    for (const url of tries) {
      try {
        const res = await timeout(fetch(url, { cache: 'no-store' }), 6000);
        if (!res.ok) continue;
        const j = await res.json();
        const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
        if (!m) continue;
        const price = f(m.regularMarketPrice), prev = f(m.chartPreviousClose ?? m.previousClose);
        if (price == null) continue;
        return {
          name: m.shortName || symbol, price, prevClose: prev,
          chg: prev != null ? price - prev : null,
          chgPct: prev ? (price - prev) / prev * 100 : null,
          high: f(m.regularMarketDayHigh), low: f(m.regularMarketDayLow),
          time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '',
          src: 'Yahoo'
        };
      } catch (e) { /* 继续下一个 */ }
    }
    throw new Error('yahoo fail ' + symbol);
  }

  /* ---------- 缓存 ---------- */
  function readCache() { return Store.get(CACHE_KEY, {}); }
  function writeCache(map) {
    const c = readCache();
    Object.keys(map).forEach(k => { c[k] = Object.assign({}, map[k], { cachedAt: Date.now() }); });
    Store.set(CACHE_KEY, c);
  }

  /* ============================================================
     主入口：quotes(['sh','dji',...]) → { key: quote }
     ============================================================ */
  async function quotes(keys, onPartial) {
    const want = keys.filter(k => SYMBOLS[k]);
    const result = {};
    const pending = new Set(want);

    // 第一轮：腾讯（批量）
    const txCodes = want.filter(k => SYMBOLS[k].tx).map(k => SYMBOLS[k].tx);
    if (txCodes.length) {
      try {
        const m = await fromTencent(txCodes);
        want.forEach(k => {
          const c = SYMBOLS[k].tx;
          if (c && m[c] && m[c].price != null) {
            result[k] = Object.assign({ key: k, label: SYMBOLS[k].name }, m[c]);
            pending.delete(k);
          }
        });
        // 先把已到手的数据回吐给界面，避免整页等待慢速源
        if (onPartial && Object.keys(result).length) {
          writeCache(result);
          try { onPartial(withFallback(result, pending)); } catch (e) { }
        }
      } catch (e) { console.warn('[腾讯源失败]', e.message); }
    }

    // 第二轮：东方财富（批量补齐）
    const emIds = Array.from(pending).filter(k => SYMBOLS[k].em).map(k => SYMBOLS[k].em);
    if (emIds.length) {
      try {
        const m = await fromEastmoney(emIds);
        Array.from(pending).forEach(k => {
          const id = SYMBOLS[k].em;
          if (id && m[id] && m[id].price != null) {
            result[k] = Object.assign({ key: k, label: SYMBOLS[k].name }, m[id]);
            pending.delete(k);
          }
        });
      } catch (e) { console.warn('[东财源失败]', e.message); }
    }

    // 第三轮：Yahoo（串行 + 重试，降低公共代理并发限流）
    const yhKeys = Array.from(pending).filter(k => SYMBOLS[k].yh);
    if (yhKeys.length) {
      for (const k of yhKeys) {
        let done = false;
        for (let attempt = 0; attempt < 2 && !done; attempt++) {
          try {
            const v = await fromYahoo(SYMBOLS[k].yh);
            if (v && v.price != null) {
              result[k] = Object.assign({ key: k, label: SYMBOLS[k].name }, v);
              pending.delete(k);
              done = true;
            }
          } catch (e) { /* 下一轮重试 */ }
          if (!done && attempt === 0) await new Promise(r => setTimeout(r, 450));
        }
        await new Promise(r => setTimeout(r, 220));   // 请求间隔，规避代理限流
      }
    }

    if (Object.keys(result).length) writeCache(result);
    return withFallback(result, pending);
  }

  /** 未取到的标的：先用本地缓存兜底，再标记不可用 */
  function withFallback(result, pending) {
    const out = Object.assign({}, result);
    const cache = readCache();
    pending.forEach(k => {
      if (out[k]) return;
      if (cache[k] && cache[k].price != null) {
        out[k] = Object.assign({}, cache[k], { key: k, label: SYMBOLS[k].name, stale: true });
      } else {
        out[k] = { key: k, label: SYMBOLS[k].name, price: null, chgPct: null, failed: true };
      }
    });
    return out;
  }

  /* ============================================================
     全市场情绪数据：涨跌家数 / 涨停跌停 / 炸板 / 最高连板 / 封板率
     数据源（全部为东方财富真实接口，已实测支持浏览器跨域直连）：
       1) 同源 /api/breadth 服务端代理（部署环境优先）
       2) push2ex 涨停池 getTopicZTPool（tc=涨停家数，lbc=连板数→最高连板）
       3) push2ex 跌停池 getTopicDTPool（tc=跌停家数）
       4) push2ex 炸板池 getTopicZBPool（tc=炸板家数）
       5) push2ex 涨跌分布 getTopicZDFenBu（全市场涨/跌/平家数）
     日期逻辑：盘中(09:30-15:00)查当日实时池；盘前/盘后/周末/节假日
     一律查最近交易日（tradingDay 已跳过周末与法定节假日）。
     失败返回 { ok:false }，由上层显示「实时获取中」而非写死占位值
     ============================================================ */
  const EM_UT = '7eea3edcaed734bea9cbfc24409ed989';
  async function emPool(kind, ymd, sort) {
    const url = 'https://push2ex.eastmoney.com/getTopic' + kind
      + '?ut=' + EM_UT + '&dpt=wz.ztzt&Pageindex=0&pagesize=1&sort=' + sort
      + '&date=' + ymd + '&_=' + Date.now();
    const res = await timeout(fetch(url, { cache: 'no-store' }), 9000);
    if (!res.ok) throw new Error(kind + ' ' + res.status);
    const j = await res.json();
    if (!j || j.rc !== 0 || !j.data) throw new Error(kind + ' bad payload');
    return j.data; // { tc, qdate, pool: [...] }
  }
  async function emFenBu(ymd) {
    const url = 'https://push2ex.eastmoney.com/getTopicZDFenBu?ut=' + EM_UT
      + '&dpt=wz.ztzt&date=' + ymd + '&_=' + Date.now();
    const res = await timeout(fetch(url, { cache: 'no-store' }), 9000);
    if (!res.ok) throw new Error('fenbu ' + res.status);
    const j = await res.json();
    const arr = j && j.data && j.data.fenbu;
    if (!Array.isArray(arr) || !arr.length) throw new Error('fenbu empty');
    let up = 0, down = 0, flat = 0;
    arr.forEach(o => {
      const k = Object.keys(o)[0], n = +o[k] || 0, v = parseInt(k, 10);
      if (v > 0) up += n; else if (v < 0) down += n; else flat += n;
    });
    return { up, down, flat };
  }
  async function breadth() {
    // 1) 同源服务端代理（部署环境最稳）
    try {
      const res = await timeout(fetch('/api/breadth?_=' + Date.now(), { cache: 'no-store' }), 15000);
      if (res.ok) {
        const j = await res.json();
        if (j && j.ok) {
          return {
            ok: true,
            date: j.date || tradingDay(),
            upCount: j.up, downCount: j.down, flatCount: j.flat,
            limitUp: j.limitUp, limitDown: j.limitDown,
            broken: j.broken, height: j.height, sealRate: j.sealRate,
            intraday: !!aSession().open,
            source: j.source || '服务端代理'
          };
        }
      }
    } catch (e) { console.warn('[同源涨跌家数失败，尝试东财盘口池]', e.message); }

    // 2) 东方财富真实盘口池（涨停/跌停/炸板/涨跌分布）
    //    盘中查当日；盘前/盘后/周末/节假日查最近交易日
    const sess = aSession();
    const ymd = (sess.open ? fmtDate(new Date()) : tradingDay()).replace(/-/g, '');
    const [rZt, rDt, rZb, rFb] = await Promise.allSettled([
      emPool('ZTPool', ymd, 'lbc:desc'),
      emPool('DTPool', ymd, 'fund:asc'),
      emPool('ZBPool', ymd, 'fbt:asc'),
      emFenBu(ymd)
    ]);
    const zt = rZt.status === 'fulfilled' ? rZt.value : null;
    const dt = rDt.status === 'fulfilled' ? rDt.value : null;
    const zb = rZb.status === 'fulfilled' ? rZb.value : null;
    const fb = rFb.status === 'fulfilled' ? rFb.value : null;
    if (!zt && !fb) {
      console.warn('[东财盘口池获取失败]', (rZt.reason && rZt.reason.message) || '');
      return { ok: false };
    }
    const limitUp = zt ? zt.tc : null;
    const limitDown = dt ? dt.tc : null;
    const broken = zb ? zb.tc : null;
    const height = (zt && zt.pool && zt.pool[0] && zt.pool[0].lbc) || null;
    const sealRate = (limitUp != null && broken != null && (limitUp + broken) > 0)
      ? Math.round(limitUp / (limitUp + broken) * 100) : null;
    return {
      ok: true,
      date: ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8),
      upCount: fb ? fb.up : null,
      downCount: fb ? fb.down : null,
      flatCount: fb ? fb.flat : null,
      limitUp, limitDown, broken, height, sealRate,
      intraday: !!sess.open,
      source: '东方财富盘口池'
    };
  }

  /* ============================================================
     连板梯队：涨停池全量（按连板数降序）
     日期逻辑同 breadth：盘中查当日实时，其余查最近交易日
     返回 { ok, date, intraday, items:[{code,name,price,chgPct,lbc,fbt,zbc,hybk,fund}], maxLbc }
     ============================================================ */
  async function ladder() {
    const sess = aSession();
    const ymd = (sess.open ? fmtDate(new Date()) : tradingDay()).replace(/-/g, '');
    const url = 'https://push2ex.eastmoney.com/getTopicZTPool?ut=' + EM_UT
      + '&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=lbc:desc&date=' + ymd + '&_=' + Date.now();
    try {
      const res = await timeout(fetch(url, { cache: 'no-store' }), 10000);
      if (!res.ok) throw new Error('zt ' + res.status);
      const j = await res.json();
      const pool = j && j.data && j.data.pool;
      if (!Array.isArray(pool)) throw new Error('zt empty');
      const items = pool.map(d => ({
        code: d.c, name: d.n,
        price: d.p != null ? d.p / 1000 : null,
        chgPct: d.zdp != null ? +d.zdp.toFixed(2) : null,
        lbc: d.lbc || 1,
        fbt: d.fbt ? String(d.fbt).padStart(6, '0').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2') : '',
        zbc: d.zbc || 0,
        hybk: d.hybk || '',
        fund: d.fund != null ? +(d.fund / 1e8).toFixed(2) : null
      }));
      return {
        ok: true,
        date: ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8),
        intraday: !!sess.open,
        items,
        maxLbc: items.length ? items[0].lbc : 0,
        source: '东方财富涨停池'
      };
    } catch (e) {
      console.warn('[连板梯队获取失败]', e.message);
      return { ok: false };
    }
  }

  /* ============================================================
     行业板块涨跌榜（真实）：涨幅榜 + 跌幅榜
     fs=m:90+t:2 为东方财富行业板块全集；f3 涨跌幅 / f62 主力净流入 / f128 领涨股
     ============================================================ */
  /* ============================================================
     美股行业板块 + 概念板块领涨榜（真实，与 A 股 sectorRank 同源）
     m:100+t:300 = 美股行业板块；m:100+t:301 = 美股概念板块
     字段：f12 代码 / f14 名称 / f3 涨跌幅 / f62 主力净流入(美元) / f128 领涨股
     多源降级：直连 push2 → push2delay 镜像 → allorigins 代理
     ============================================================ */
  async function usSectorRank() {
    const EM_UT = '7eea3edcaed734bea9cbfc24409ed989';
    const grab = async (fs, po) => {
      // 行业(t:300)/概念(t:301)各取前12条，更接近同花顺App列表长度
      const core = 'https://push2.eastmoney.com/api/qt/clist/get?np=1&fltt=2&invt=2&fid=f3&fs='
        + encodeURIComponent(fs)
        + '&fields=f12,f14,f3,f62,f128,f136,f140&pz=12&pn=1&po=' + po + '&ut=' + EM_UT + '&_=' + Date.now();
      const urls = [
        core,
        core.replace('push2.eastmoney.com', 'push2delay.eastmoney.com'),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(core)
      ];
      for (const u of urls) {
        try {
          const res = await timeout(fetch(u, { cache: 'no-store' }), 9000);
          if (!res.ok) continue;
          const j = await res.json();
          const list = j && j.data && j.data.diff;
          if (!Array.isArray(list) || !list.length) continue;
          return list.map(d => ({
            code: d.f12, name: d.f14,
            chgPct: d.f3 != null ? +(+d.f3).toFixed(2) : null,
            netInflow: d.f62 != null ? +(d.f62 / 1e8).toFixed(2) : null, // 亿美元
            leader: d.f128 || d.f140 || d.f136 || ''      // 多字段兜底领涨股名称
          }));
        } catch (e) { /* 尝试下一个源 */ }
      }
      return null;
    };
    try {
      const [indUp, conUp] = await Promise.all([
        grab('m:100+t:300', 1),
        grab('m:100+t:301', 1)
      ]);
      return {
        ok: !!(indUp && conUp),
        industry: indUp || [],
        concept: conUp || [],
        date: tradingDay(),
        usDate: usTradingDay(),
        source: '东方财富美股板块'
      };
    } catch (e) {
      console.warn('[美股板块获取失败]', e.message);
      return { ok: false, industry: [], concept: [] };
    }
  }

  async function sectorRank() {
    const base = 'https://push2.eastmoney.com/api/qt/clist/get?np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2'
      + '&fields=f12,f14,f3,f62,f128,f136&pz=10&pn=1&_=' + Date.now();
    const grab = async po => {
      const direct = base + '&po=' + po;
      // 直连 → push2delay 镜像 → allorigins 代理（push2 偶有 IP 限流，多通道兜底）
      const urls = [
        direct,
        direct.replace('push2.eastmoney.com', 'push2delay.eastmoney.com'),
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(direct)
      ];
      for (const u of urls) {
        try {
          const res = await timeout(fetch(u, { cache: 'no-store' }), 9000);
          if (!res.ok) continue;
          const j = await res.json();
          const list = j && j.data && j.data.diff;
          if (!Array.isArray(list) || !list.length) continue;
          return list.map(d => ({
            code: d.f12, name: d.f14,
            chgPct: d.f3 != null ? +d.f3.toFixed(2) : null,
            netInflow: d.f62 != null ? +(d.f62 / 1e8).toFixed(1) : null,
            leader: d.f128 || '', leaderChg: d.f136 != null ? +d.f136.toFixed(2) : null
          }));
        } catch (e) { /* 尝试下一个源 */ }
      }
      throw new Error('sector all sources failed');
    };
    try {
      const [up, down] = await Promise.all([grab(1), grab(0)]);
      return { ok: true, up, down, date: tradingDay(), source: '东方财富行业板块' };
    } catch (e) {
      console.warn('[板块榜获取失败]', e.message);
      return { ok: false };
    }
  }

  /* ============================================================
     龙虎榜（真实，datacenter-web 每日详情）
     收盘后约 18:00 披露；若目标日无数据自动回退上一交易日
     返回 { ok, date, items:[{code,name,chgPct,net(亿),buy(亿),sell(亿),reason,inst}], instItems }
     ============================================================ */
  async function billboard() {
    const fetchDay = async dateStr => {
      const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
        + '?reportName=RPT_DAILYBILLBOARD_DETAILS'
        + '&columns=SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,EXPLAIN,CLOSE_PRICE,CHANGE_RATE,BILLBOARD_NET_AMT,BILLBOARD_BUY_AMT,BILLBOARD_SELL_AMT,EXPLANATION'
        + '&filter=(TRADE_DATE%3C%3D%27' + dateStr + '%27)(TRADE_DATE%3E%3D%27' + dateStr + '%27)'
        + '&pageNumber=1&pageSize=50&sortColumns=BILLBOARD_NET_AMT&sortTypes=-1&source=WEB&client=WEB&_=' + Date.now();
      const res = await timeout(fetch(url, { cache: 'no-store' }), 10000);
      if (!res.ok) throw new Error('lhb ' + res.status);
      const j = await res.json();
      const list = j && j.result && j.result.data;
      return Array.isArray(list) ? list : [];
    };
    // tradingDay() 已实现：15:00 前（盘前/盘中）回退到上一交易日，盘后取当日；
    // 周末/节假日自动回退到最近交易日。龙虎榜约 18:00 披露，当日为空则再回退一天。
    let dateStr = tradingDay();
    try {
      let list = await fetchDay(dateStr);
      if (!list.length) {
        // 回退一天（再跳周末节假日）
        const d = new Date(dateStr.replace(/-/g, '/'));
        do { d.setDate(d.getDate() - 1); } while (!isATradingDay(d));
        dateStr = fmtDate(d);
        list = await fetchDay(dateStr);
      }
      if (!list.length) throw new Error('lhb empty');
      const items = list.map(d => ({
        code: d.SECURITY_CODE, name: d.SECURITY_NAME_ABBR,
        chgPct: d.CHANGE_RATE != null ? +(+d.CHANGE_RATE).toFixed(2) : null,
        net: d.BILLBOARD_NET_AMT != null ? +(d.BILLBOARD_NET_AMT / 1e8).toFixed(2) : null,
        buy: d.BILLBOARD_BUY_AMT != null ? +(d.BILLBOARD_BUY_AMT / 1e8).toFixed(2) : null,
        sell: d.BILLBOARD_SELL_AMT != null ? +(d.BILLBOARD_SELL_AMT / 1e8).toFixed(2) : null,
        reason: d.EXPLANATION || '',
        inst: d.EXPLAIN || ''
      }));
      // 机构相关（EXPLAIN 含「机构」）
      const instItems = items.filter(i => /机构/.test(i.inst));
      return { ok: true, date: dateStr, items, instItems, source: '东方财富龙虎榜' };
    } catch (e) {
      console.warn('[龙虎榜获取失败]', e.message);
      return { ok: false };
    }
  }

  /* ---------- 交易时段判断 ---------- */
  /* 用目标市场的本地时间判断（Intl 时区数据库自动处理夏令时），周末休市 */
  function tzHM(tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date());
    const get = k => (parts.find(p => p.type === k) || {}).value || '';
    const wd = get('weekday'); // Sun/Mon/...
    const h = parseInt(get('hour'), 10) % 24, m = parseInt(get('minute'), 10) || 0;
    return { weekend: wd === 'Sun' || wd === 'Sat', t: h * 60 + m };
  }
  function usSession() {
    // 美股常规时段 09:30-16:00 美东；盘前 04:00-09:30；盘后 16:00-20:00；周末休市
    const { weekend, t } = tzHM('America/New_York');
    if (weekend) return { open: false, text: '美股周末休市' };
    if (t >= 570 && t < 960) return { open: true, text: '美股盘中' };
    if (t >= 240 && t < 570) return { open: false, text: '美股盘前交易中' };
    if (t >= 960 && t < 1200) return { open: false, text: '美股盘后交易中' };
    return { open: false, text: '美股已收盘' };
  }
  function asiaSession() {
    // 东京/首尔 09:00-15:00（东京时间，首尔与东京同时区）
    const { weekend, t } = tzHM('Asia/Tokyo');
    if (weekend) return { open: false, text: '日韩周末休市' };
    if (t >= 540 && t < 900) return { open: true, text: '日韩盘中' };
    return { open: false, text: '日韩已收盘' };
  }
  /* ---------- 2026年A股节假日休市表（来源：上交所/深交所/北交所官方通知，上证公告〔2025〕45号） ---------- */
  const A_HOLIDAYS_2026 = [
    ['2026-01-01', '2026-01-03', '元旦'],
    ['2026-02-15', '2026-02-23', '春节'],
    ['2026-04-04', '2026-04-06', '清明节'],
    ['2026-05-01', '2026-05-05', '劳动节'],
    ['2026-06-19', '2026-06-21', '端午节'],
    ['2026-09-25', '2026-09-27', '中秋节'],
    ['2026-10-01', '2026-10-07', '国庆节']
  ];
  function fmtDate(d) { return `${d.getFullYear()}-${DT.pad(d.getMonth() + 1)}-${DT.pad(d.getDate())}`; }
  /* 返回该日期对应的节假日名，非节假日返回 null */
  function aHolidayName(dateStr) {
    for (const [s, e, name] of A_HOLIDAYS_2026) {
      if (dateStr >= s && dateStr <= e) return name;
    }
    return null;
  }
  /* 是否A股交易日：排除周末 + 法定节假日 */
  function isATradingDay(d) {
    const day = d.getDay();
    if (day === 0 || day === 6) return false;
    return !aHolidayName(fmtDate(d));
  }

  function aSession() {
    const d = new Date(), day = d.getDay(), t = d.getHours() * 60 + d.getMinutes();
    const holiday = aHolidayName(fmtDate(d));
    if (holiday) return { open: false, text: holiday + '休市', closed: true, reason: holiday };
    if (day === 0 || day === 6) return { open: false, text: '周末休市', closed: true, reason: '周末' };
    if ((t >= 9 * 60 + 30 && t <= 11 * 60 + 30) || (t >= 13 * 60 && t <= 15 * 60)) return { open: true, text: 'A股盘中' };
    if (t > 15 * 60) return { open: false, text: 'A股已收盘' };
    return { open: false, text: 'A股未开盘' };
  }

  /* ---------- 交易日判断 ----------
     收盘（15:00）之后视为"当日交易日"，否则为"上一交易日"；
     跳过周末与法定节假日，回退到最近一个交易日。用于收盘数据"当日/前一交易日"回退展示。 */
  function tradingDay() {
    const d = new Date();
    const t = d.getHours() * 60 + d.getMinutes();
    const cur = new Date(d);
    if (t < 15 * 60) cur.setDate(cur.getDate() - 1);
    while (!isATradingDay(cur)) cur.setDate(cur.getDate() - 1);
    return fmtDate(cur);
  }
  // 返回某内容的交易日状态：init(未标记/示例) / today(当日收盘) / prev(前一交易日)
  function tdMeta(key) {
    const date = Store.get(key + '_date', null);
    const cur = tradingDay();
    const state = !date ? 'init' : (date === cur ? 'today' : 'prev');
    return { date, cur, state };
  }

  /* 盘前总结所预测的"目标交易日"：
     盘中(09:30-15:00)目标为当日；其余（盘前/盘后）目标为下一交易日；跳过周末与法定节假日。 */
  function targetTradingDay() {
    const d = new Date();
    const t = d.getHours() * 60 + d.getMinutes();
    const isIntraday = t >= 9 * 60 + 30 && t <= 15 * 60;
    const target = new Date(d);
    if (!isIntraday) target.setDate(target.getDate() + 1);
    while (!isATradingDay(target)) target.setDate(target.getDate() + 1);
    return fmtDate(target);
  }

  /* ---------- 自动生成要闻摘要 ---------- */
  function autoBrief(q) {
    const line = (k, tpl) => {
      const d = q[k];
      if (!d || d.price == null) return null;
      const p = d.chgPct;
      const dir = p > 0.6 ? '明显走强' : p > 0 ? '小幅收涨' : p > -0.6 ? '小幅回落' : '明显走弱';
      return tpl(d, dir, p);
    };
    return {
      a: [
        line('sh', (d, dir, p) => `上证指数报 ${d.price.toFixed(2)} 点，${dir} ${UI.sign(p, 2, '%')}，${p > 0 ? '市场风险偏好回升' : '量能承接需观察'}。`),
        line('cyb', (d, dir, p) => `创业板指报 ${d.price.toFixed(2)} 点（${UI.sign(p, 2, '%')}），成长板块${p > 0 ? '情绪偏暖' : '仍在调整'}。`),
        line('hsi', (d, dir, p) => `恒生指数 ${d.price.toFixed(2)}（${UI.sign(p, 2, '%')}），港股走势对次日 A 股情绪有映射参考。`)
      ].filter(Boolean),
      us: [
        line('dji', (d, dir, p) => `道琼斯收报 ${d.price.toFixed(2)} 点，${dir} ${UI.sign(p, 2, '%')}。`),
        line('ixic', (d, dir, p) => `纳斯达克 ${d.price.toFixed(2)}（${UI.sign(p, 2, '%')}），${p > 0 ? '科技股回暖，利好次日国内科技映射板块' : '科技股承压，注意次日科技链低开风险'}。`),
        line('spx', (d, dir, p) => `标普500 ${d.price.toFixed(2)}（${UI.sign(p, 2, '%')}）。`),
        line('nvda', (d, dir, p) => `英伟达 ${d.price.toFixed(2)} 美元（${UI.sign(p, 2, '%')}），AI 算力链风向标。`)
      ].filter(Boolean),
      fed: [
        line('us10y', (d, dir, p) => `美债10年期收益率 ${d.price.toFixed(3)}%（${UI.sign(p, 2, '%')}），${p > 0 ? '收益率上行压制成长股估值' : '收益率回落利好成长风格'}。`),
        line('gold', (d, dir, p) => `纽约黄金 ${d.price.toFixed(2)} 美元/盎司（${UI.sign(p, 2, '%')}），避险与降息预期的直接映射。`),
        line('usdcnh', (d, dir, p) => `离岸人民币 ${d.price.toFixed(4)}（${UI.sign(p, 2, '%')}），${p > 0 ? '人民币走贬，关注外资流向' : '人民币走强，外资情绪偏暖'}。`)
      ].filter(Boolean),
      oil: [
        line('wti', (d, dir, p) => `WTI 纽约原油 ${d.price.toFixed(2)} 美元/桶，${dir} ${UI.sign(p, 2, '%')}。`),
        line('brent', (d, dir, p) => `布伦特原油 ${d.price.toFixed(2)} 美元/桶（${UI.sign(p, 2, '%')}），${Math.abs(p) > 2 ? '波动较大，石化产业链需重点跟踪' : '走势相对平稳'}。`),
        line('gold', (d, dir, p) => `纽约黄金 ${d.price.toFixed(2)}（${UI.sign(p, 2, '%')}），贵金属板块联动参考。`)
      ].filter(Boolean)
    };
  }

  /* ---------- 自动总结生成器（基于真实行情，不编造） ---------- */
  function pctWord(p) {
    if (p == null) return '持平';
    if (p > 2) return '大涨';
    if (p > 0.6) return '走强';
    if (p > 0) return '微涨';
    if (p > -0.6) return '微跌';
    if (p > -2) return '走弱';
    return '大跌';
  }
  function fmt(q, k) {
    const d = q[k];
    if (!d || d.price == null) return null;
    return { label: d.label, price: d.price, chgPct: d.chgPct || 0, chg: d.chg || 0 };
  }

  // 美股夜间总结
  function autoUsSummary(q) {
    const dji = fmt(q, 'dji'), ixic = fmt(q, 'ixic'), spx = fmt(q, 'spx');
    const nvda = fmt(q, 'nvda'), wti = fmt(q, 'wti'), gold = fmt(q, 'gold');
    if (!dji || !ixic || !spx) return '美股行情读取中，请稍后刷新…';
    const lead = ixic.chgPct >= spx.chgPct ? '纳斯达克' : '道琼斯';
    const tech = nvda ? `科技风向标英伟达${pctWord(nvda.chgPct)}${UI.sign(nvda.chgPct, 2, '%')}，` : '';
    const oil = wti ? `WTI原油${pctWord(wti.chgPct)}${UI.sign(wti.chgPct, 2, '%')}，` : '';
    const au = gold ? `黄金${pctWord(gold.chgPct)}${UI.sign(gold.chgPct, 2, '%')}` : '';
    /* 措辞按美股真实时段（美东时间）：盘中/盘前盘后/已收盘/周末休市 */
    const ss = usSession();
    const ctx = ss.text === '美股周末休市' ? '美股周五收盘'
      : ss.text === '美股已收盘' ? '美股收盘'
      : ss.text === '美股盘中' ? '美股盘中'
      : ss.text; // 盘前/盘后交易中（此时三大指数值为最近收盘价，如实表述）
    const dir = ss.open ? (ixic.chgPct >= 0 ? '震荡偏强：' : '震荡偏弱：') : '：';
    const track = ss.open ? '次日 A 股科技/周期映射需同步跟踪。' : '以上为该交易日收盘数据，下个交易日 A 股映射以最新开盘为准。';
    return `${ctx}${dir}道指${pctWord(dji.chgPct)}${UI.sign(dji.chgPct, 2, '%')}报${dji.price.toFixed(0)}，纳指${pctWord(ixic.chgPct)}${UI.sign(ixic.chgPct, 2, '%')}，标普${pctWord(spx.chgPct)}${UI.sign(spx.chgPct, 2, '%')}。${tech}${oil}${au}。市场整体由${lead}引领，风险偏好${ixic.chgPct >= 0 ? '偏暖' : '偏冷'}，${track}`;
  }

  // 日韩盘面总结
  function autoAsiaSummary(q) {
    const n225 = fmt(q, 'n225'), ks11 = fmt(q, 'ks11'), hsi = fmt(q, 'hsi');
    if (!n225 && !ks11 && !hsi) return '日韩/港股行情读取中，请稍后刷新…';
    const parts = [];
    if (n225) parts.push(`日经225 ${pctWord(n225.chgPct)}${UI.sign(n225.chgPct, 2, '%')}报 ${n225.price.toFixed(0)}`);
    if (ks11) parts.push(`韩国综合 ${pctWord(ks11.chgPct)}${UI.sign(ks11.chgPct, 2, '%')}报 ${ks11.price.toFixed(0)}`);
    if (hsi) parts.push(`恒生指数 ${pctWord(hsi.chgPct)}${UI.sign(hsi.chgPct, 2, '%')}报 ${hsi.price.toFixed(0)}`);
    const tone = (n225 && n225.chgPct < 0) || (ks11 && ks11.chgPct < 0) ? '偏冷' : '偏暖';
    const ss = asiaSession();
    const ctx = ss.open ? '亚太盘面' : (ss.text === '日韩周末休市' ? '日韩股市周五收盘' : '日韩股市收盘');
    return `${ctx}${tone}：${parts.join('，')}。日韩半导体/汽车/消费电子与 A 股产业链高度联动，${tone === '偏暖' ? '若强势板块延续，A 股对应方向高开概率较大' : '若弱势延续，A 股开盘承压，注意存储/消费电子等映射方向'}。`;
  }

  // 次日A股开盘前总结
  function autoOutlookSummary(q) {
    const dji = fmt(q, 'dji'), ixic = fmt(q, 'ixic'), spx = fmt(q, 'spx');
    const n225 = fmt(q, 'n225'), ks11 = fmt(q, 'ks11'), wti = fmt(q, 'wti');
    const gold = fmt(q, 'gold'), usdcnh = fmt(q, 'usdcnh'), us10y = fmt(q, 'us10y');
    const usOk = dji && ixic && spx;
    if (!usOk) return '隔夜关键变量读取中，请稍后刷新…';
    const targetDay = targetTradingDay();
    const risk = ixic.chgPct < -0.5 || dji.chgPct < -0.8 ? '偏谨慎' : (ixic.chgPct > 0.5 ? '偏积极' : '中性');
    const techPress = ixic.chgPct < 0 ? '科技链短期承压' : '科技链有映射暖意';
    const oilPress = wti && wti.chgPct < -2 ? '原油大跌缓和通胀担忧' : (wti && wti.chgPct > 2 ? '原油大涨推升成本端担忧' : '原油波动有限');
    const fx = usdcnh ? `离岸人民币${pctWord(usdcnh.chgPct)}${UI.sign(usdcnh.chgPct, 2, '%')}，` : '';
    const bond = us10y ? `美债10年收益率${us10y.price.toFixed(3)}%${pctWord(us10y.chgPct)}，` : '';
    const asia = n225 ? `日韩方面日经${pctWord(n225.chgPct)}${UI.sign(n225.chgPct, 2, '%')}，` : '';
    return `${targetDay} A股开盘前瞻：隔夜美股道指${UI.sign(dji.chgPct, 2, '%')}、纳指${UI.sign(ixic.chgPct, 2, '%')}、标普${UI.sign(spx.chgPct, 2, '%')}，${techPress}。${asia}${fx}${bond}${oilPress}。综合外围信号，${targetDay} A股开盘情绪${risk}，重点观察量能承接与主线持续性。`;
  }

  // 外围信号表（基于真实行情自动生成）
  function autoSignals(q) {
    const s = [];
    const ixic = fmt(q, 'ixic'), dji = fmt(q, 'dji'), spx = fmt(q, 'spx');
    if (ixic && dji && spx) {
      const dir = ixic.chgPct >= 0 ? '偏多' : '偏空';
      s.push({ name: '美股三大指数', detail: `纳指${UI.sign(ixic.chgPct, 2, '%')}，标普${UI.sign(spx.chgPct, 2, '%')}，道指${UI.sign(dji.chgPct, 2, '%')}`, impact: ixic.chgPct >= 0 ? '提振全球风险偏好' : '压制科技股映射', dir });
    }
    const nvda = fmt(q, 'nvda');
    if (nvda) s.push({ name: '英伟达风向标', detail: `英伟达${pctWord(nvda.chgPct)}${UI.sign(nvda.chgPct, 2, '%')}`, impact: nvda.chgPct >= 0 ? 'AI算力链偏暖' : 'AI算力链承压', dir: nvda.chgPct >= 0 ? '偏多' : '偏空' });
    const wti = fmt(q, 'wti');
    if (wti) s.push({ name: '原油价格', detail: `WTI ${pctWord(wti.chgPct)}${UI.sign(wti.chgPct, 2, '%')}报 ${wti.price.toFixed(2)} 美元`, impact: wti.chgPct >= 0 ? '石化/油服受益，航空成本承压' : '航空受益，石化链承压', dir: '中性' });
    const gold = fmt(q, 'gold');
    if (gold) s.push({ name: '黄金价格', detail: `黄金${pctWord(gold.chgPct)}${UI.sign(gold.chgPct, 2, '%')}`, impact: '避险与降息预期映射', dir: gold.chgPct >= 0 ? '偏多' : '偏空' });
    const usdcnh = fmt(q, 'usdcnh');
    if (usdcnh) s.push({ name: '离岸人民币', detail: `USDCNH ${pctWord(usdcnh.chgPct)}${UI.sign(usdcnh.chgPct, 2, '%')}报 ${usdcnh.price.toFixed(4)}`, impact: usdcnh.chgPct > 0 ? '外资流出压力' : '外资情绪偏暖', dir: usdcnh.chgPct > 0 ? '偏空' : '偏多' });
    const n225 = fmt(q, 'n225');
    if (n225) s.push({ name: '日经225', detail: `日经${pctWord(n225.chgPct)}${UI.sign(n225.chgPct, 2, '%')}`, impact: '亚太情绪映射', dir: n225.chgPct >= 0 ? '偏多' : '偏空' });
    return s;
  }

  /* ---------- 自动机会 / 风险方向（基于实时行情） ---------- */
  function autoOppRisk(q) {
    const dji = fmt(q, 'dji'), ixic = fmt(q, 'ixic'), spx = fmt(q, 'spx');
    const nvda = fmt(q, 'nvda'), wti = fmt(q, 'wti'), gold = fmt(q, 'gold');
    const usdcnh = fmt(q, 'usdcnh'), us10y = fmt(q, 'us10y'), n225 = fmt(q, 'n225');
    const opportunities = [];
    const risks = [];

    // 算力/AI方向
    if (nvda && nvda.chgPct > 0) {
      opportunities.push({ dir: 'AI算力/光模块/CPO', trigger: '英伟达走强映射，竞价相关方向高开或回踩企稳', logic: `英伟达${pctWord(nvda.chgPct)}${UI.sign(nvda.chgPct, 2, '%')}，算力链风险偏好回升`, level: '中' });
    } else if (nvda && nvda.chgPct < -2) {
      risks.push({ dir: 'AI算力/光模块', logic: `英伟达${pctWord(nvda.chgPct)}${UI.sign(nvda.chgPct, 2, '%')}，算力链承压`, level: '中' });
    }

    // 科技整体
    if (ixic && ixic.chgPct > 0.3) {
      opportunities.push({ dir: '科技成长映射', trigger: '纳指收涨，开盘观察半导体/消费电子承接', logic: `纳指${UI.sign(ixic.chgPct, 2, '%')}，风险偏好偏暖`, level: '中' });
    } else if (ixic && ixic.chgPct < -0.5) {
      risks.push({ dir: '科技股映射', logic: `纳指${UI.sign(ixic.chgPct, 2, '%')}，科技链短期承压`, level: '高' });
    }

    // 存储链（基于WTI/原油不作为存储，但保留逻辑）
    // 实际由 content.json 预填的 usnight_stocks 给出存储信号

    // 周期/红利
    if (wti && wti.chgPct > 2) {
      opportunities.push({ dir: '石油化工/油服', trigger: '原油大涨催化，板块高开', logic: `WTI原油${UI.sign(wti.chgPct, 2, '%')}，成本端传导利多`, level: '低' });
      risks.push({ dir: '航空/物流', logic: `油价上涨推升成本端`, level: '低' });
    } else if (wti && wti.chgPct < -2) {
      opportunities.push({ dir: '航空/化工', trigger: '油价大跌，成本压力缓解', logic: `WTI原油${UI.sign(wti.chgPct, 2, '%')}，成本端压力缓解`, level: '低' });
    }

    // 黄金/避险
    if (gold && gold.chgPct > 0.5) {
      opportunities.push({ dir: '黄金/贵金属', trigger: '黄金走强，避险情绪升温', logic: `黄金${pctWord(gold.chgPct)}${UI.sign(gold.chgPct, 2, '%')}`, level: '低' });
    }

    // 汇率
    if (usdcnh && usdcnh.chgPct > 0.3) {
      risks.push({ dir: '外资重仓白马/消费蓝筹', logic: `离岸人民币${pctWord(usdcnh.chgPct)}${UI.sign(usdcnh.chgPct, 2, '%')}，外资流出压力`, level: '中' });
    } else if (usdcnh && usdcnh.chgPct < -0.3) {
      opportunities.push({ dir: '北向偏好板块', trigger: '人民币升值，外资情绪回暖', logic: `离岸人民币${pctWord(usdcnh.chgPct)}${UI.sign(usdcnh.chgPct, 2, '%')}`, level: '低' });
    }

    // 美债
    if (us10y && us10y.chgPct > 1) {
      risks.push({ dir: '高估值成长股', logic: `美债10年收益率${us10y.price.toFixed(3)}%上行，成长股估值承压`, level: '中' });
    } else if (us10y && us10y.chgPct < -1) {
      opportunities.push({ dir: '成长股/创新药', trigger: '美债收益率回落，估值修复', logic: `美债10年收益率${us10y.price.toFixed(3)}%下行`, level: '低' });
    }

    // 亚太
    if (n225 && n225.chgPct > 0.5) {
      opportunities.push({ dir: '亚太映射方向', trigger: '日韩走强，开盘情绪偏暖', logic: `日经${pctWord(n225.chgPct)}${UI.sign(n225.chgPct, 2, '%')}`, level: '低' });
    } else if (n225 && n225.chgPct < -1) {
      risks.push({ dir: '半导体/汽车出口链', logic: `日经${pctWord(n225.chgPct)}${UI.sign(n225.chgPct, 2, '%')}，亚太情绪偏冷`, level: '中' });
    }

    return { opportunities, risks };
  }

  /* ---------- 按自选代码取价（个人持仓用） ---------- */
  function normalizeCode(input) {
    let c = String(input || '').trim().toLowerCase().replace(/\s/g, '');
    if (!c) return null;
    if (/^(sh|sz|bj|hk|us)/.test(c)) return c;
    if (/^\d{6}$/.test(c)) {
      if (/^(6|9)/.test(c)) return 'sh' + c;
      if (/^(0|2|3)/.test(c)) return 'sz' + c;
      if (/^(4|8)/.test(c)) return 'bj' + c;
    }
    if (/^\d{5}$/.test(c)) return 'hk' + c;
    if (/^[a-z.]{1,6}$/.test(c)) return 'us' + c.toUpperCase();
    return c;
  }
  async function priceOf(codes) {
    const norm = codes.map(normalizeCode).filter(Boolean);
    if (!norm.length) return {};
    try {
      const m = await fromTencent(norm);
      const out = {};
      codes.forEach((c, i) => { const n = norm[i]; if (n && m[n]) out[c] = m[n]; });
      return out;
    } catch (e) { return {}; }
  }

  return { SYMBOLS, quotes, breadth, ladder, sectorRank, usSectorRank, billboard, usSession, asiaSession, aSession, tradingDay, tdMeta, targetTradingDay, isATradingDay, aHolidayName, autoBrief, autoUsSummary, autoAsiaSummary, autoOutlookSummary, autoSignals, autoOppRisk, readCache, priceOf, normalizeCode };
})();
