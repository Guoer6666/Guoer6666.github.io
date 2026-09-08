/* ============================================================
   views-analysis.js · 个股逻辑拆解 V4 —— 九大分析模块系统（精准·真实·落地版）
   多模块并行 → 数据校验/误差溯源 → 多空辩论（逐条证伪规则引擎）→ 风险终审 → 完整报告

   V4 升级总览（在 V3 基础上逐条精准化，每条对应一处代码改造）：
   ⑦ 技术计算层扩容：BOLL(20,2) 带宽收口识别、40 日箱体突破/跌破有效性校验（无量突破剔除）、
     量加权筹码分布近似（筹码峰/获利盘/套牢盘/峰迁移，C级口径如实标注）、MA20 支撑压力有效性计数、
     MACD 二次钝化识别——原因：V3 缺筹码维度与形态有效性校验，无法回答「这个突破是不是真的」。
   ⑧ 信号胜率标注：关键趋势信号附经验胜率区间（win 字段，规则经验口径非回测，逐处标注）——
     原因：规范要求「标注历史相似胜率区间，给出信号可信度评级」。
   ⑨ 主力资金流通道：东财 push2 fflow（ACAO:* 已实测）→ 连续净流入/流出天数、5日累计、
     主力/小单背离诱多识别（主力流出+小单涌入+股价上涨=拉高出货嫌疑）——原因：V3 只有单日龙虎榜，
     无法追踪连续 3-5 日资金行为。
   ⑩ 舆情权威源分级：权威财经媒体白名单（证券三大报/财联社/每经/澎湃等），非权威源信号降 C 级——
     原因：规范要求「只采信监管公告、公司公告、权威财经媒体」，自媒体不直接进多空计分。
   ⑪ 估值横向对比：RPT_VALUEANALYSIS_DET 全市场最新交易日快照（24h 缓存）→ PE/PB 全市场分位，
     补足「自身历史分位」之外的横向锚——原因：V3 只有纵向分位，低分位可能是全行业低估。
   ⑫ 席位次日校验：龙虎榜上榜日 × 真实 K 线次日表现 → 一日游砸盘/锁仓/溢价席位识别（C级推断）——
     原因：规范要求判断席位风格「隔日超短/波段锁仓/一日游」，不以单日龙虎榜定结论。
   ⑬ 胜率公式化 + 黑天鹅扫描：胜率区间 = f(净评分, 可信度)（经验口径标注），舆情关键词扫描
     立案/退市/质押/处罚生成黑天鹅清单——原因：V3 胜率为固定 45%~60% 话术，属 AI 套话。
   ⑭ 任务重跑：已完成任务一键重跑（同代码同口径新任务）——原因：规范要求任务全生命周期控制含「重跑」。

   V3 既有机制（保留）：信号 A/B/C 可信度分级加权 · 量能确认过滤 · 通稿去重 · 名称过滤 ·
   孤证降级 · 财报时效校验 · 震荡市金叉死叉剔除 · 赔率闸门 · 可信度闸门 · 12+ 通道误差溯源。
   数据源（全部浏览器实测可达，见 skill「a-share-data-sources」）：
     腾讯行情/K线 · 同花顺行情（双源交叉验证）· 东财数据中心（财报/预告/估值/股东户数/解禁/龙虎榜/大宗）
     东财融资融券 · 东财主力资金流（push2 fflow）· 东财全网新闻搜索 · 工作台五通道快讯流
   铁律：拉不到的数据如实标注「无法验证」，绝不编造；
        「多空辩论」由本地规则引擎基于真实信号生成，非远程大模型，报告中如实标注；
        所有胜率区间为规则经验口径，非统计回测，逐处标注；
        北向资金实时流向自 2024-08 起交易所停止披露，本系统不做北向结论（如实标注）。
   ============================================================ */
/* 旧版 V.holdings（views-market2.js）保留为数据底座复用件 */
const AnaLegacy = V.holdings;

const Ana = (() => {
  const MODULES = [
    { id: 'tech', name: '技术分析', icon: '📈', desc: '均线排列/斜率/乖离率 · MACD背离钝化 · 量价九态 · 震荡过滤' },
    { id: 'sentiment', name: '市场情绪', icon: '🌡️', desc: '五级量化评级 · 两融 · 散户筹码' },
    { id: 'news', name: '新闻舆情', icon: '📰', desc: '时间切片统计 · 通稿去重 · TOP3事件归因' },
    { id: 'fundamental', name: '基本面', icon: '🏦', desc: '扣非剥离 · 财报时效校验 · 估值百分位' },
    { id: 'policy', name: '政策分析', icon: '🏛️', desc: '业务匹配度分级 · 落地/预期/传闻区分' },
    { id: 'capital', name: '游资追踪', icon: '🐉', desc: '龙虎榜连续行为 · 席位性质 · 大宗折溢价' },
    { id: 'lift', name: '解禁减持', icon: '🔓', desc: '刚性/软性压力分级 · 流动性冲击测算' },
    { id: 'debate', name: '多空辩论', icon: '⚔️', desc: '逐条证伪 · 孤证识别 · 逻辑漏洞清单' },
    { id: 'risk', name: '风险评估', icon: '🛡️', desc: '可信度打分 · 仓位档位 · 点位/赔率/触发条件' }
  ];
  const POS_KW = /涨停|大涨|飙升|利好|中标|签约|预增|扭亏|增长|突破|创新高|回购|增持|获批|订单|投产|涨价|分红|超预期/;
  const NEG_KW = /跌停|大跌|暴跌|利空|减持|处罚|立案|预减|亏损|下滑|退市|质押|诉讼|违规|戴帽|ST|爆雷|低于预期|风险警示/;
  /* 信号可信度等级权重：A=官方披露/双源验证 B=单源权威数据 C=规则推断
     修改原因：旧版所有信号等权计分，推断类结论与财报披露同级，评分精度虚高 */
  const GRADE_W = { A: 1, B: 0.85, C: 0.6 };
  const effW = s => +(s.w * (GRADE_W[s.grade || 'B'] || 0.85)).toFixed(2);

  /* ---------- Store ---------- */
  const tasks = () => Store.rows('ana_tasks', []);
  const saveTask = t => {
    const list = tasks();
    const i = list.findIndex(x => x._id === t._id);
    t.updatedAt = DT.stamp();
    if (i >= 0) list[i] = t; else list.unshift(t);
    // 最多保留 30 条，优先删最旧的已完成/已停止任务
    while (list.length > 30) {
      const j = (() => { for (let k = list.length - 1; k >= 0; k--) if (list[k].status === 'done' || list[k].status === 'stopped') return k; return list.length - 1; })();
      list.splice(j, 1);
    }
    Store.set('ana_tasks', list);
  };
  const getTask = id => tasks().find(x => x._id === id) || null;

  function cfg() {
    return Object.assign({ depth: 'standard', kline: 320, newsDays: 30, rounds: 3, riskLevel: 'standard' }, Store.get('ana_cfg', {}));
  }

  /* ---------- 通用请求 ---------- */
  async function dcGet(reportName, filter, extra) {
    const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=' + reportName
      + '&columns=ALL&filter=' + encodeURIComponent(filter) + '&pageNumber=1' + (extra || '&pageSize=10')
      + '&source=WEB&client=WEB&_=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    const j = await res.json();
    return (j && j.result && j.result.data) || [];
  }
  async function searchNews(keyword, n) {
    const param = { uid: '', keyword, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web', clientVersion: 'curr',
      param: { cmsArticleWebOld: { searchScope: 'default', sort: 'time', pageIndex: 1, pageSize: n || 6, preTag: '', postTag: '' } } };
    const url = 'https://search-api-web.eastmoney.com/search/jsonp?cb=anacb&param=' + encodeURIComponent(JSON.stringify(param)) + '&_=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    const txt = await res.text();
    const m = txt.match(/^anacb\(([\s\S]*)\)\s*;?$/);
    if (!m) return [];
    const j = JSON.parse(m[1]);
    const list = j && j.result && j.result.cmsArticleWebOld;
    if (!Array.isArray(list)) return [];
    return list.map(x => ({
      title: String(x.title || '').replace(/<[^>]+>/g, ''),
      content: String(x.content || '').replace(/<[^>]+>/g, '').slice(0, 140),
      media: x.mediaName || '', date: String(x.date || '').slice(0, 10),
      url: String(x.url || '').replace(/^http:/, 'https:')
    })).filter(x => x.title && x.url);
  }
  /* sig(side, text, w, src, grade, level, win)
     grade: A=官方披露/双源验证 B=单源权威 C=规则推断（默认 B）
     level: trend=趋势级信号 / swing=短线波动信号（辩论计分时波动级权重减半）
     win: 经验胜率区间文本（V4 新增，如 '55~65%'）——规则经验口径非统计回测，渲染时逐处标注
     修改原因：旧版信号无分级无分层无胜率，短线噪声与趋势证据混同计分 */
  const sig = (side, text, w, src, grade, level, win) => ({ side, text, w: w || 1, src: src || '', grade: grade || 'B', level: level || 'trend', win: win || '' });
  /* 辩论/风险计分统一入口：等级加权 × 波动级减半 */
  const scoreW = s => +(effW(s) * (s.level === 'swing' ? 0.5 : 1)).toFixed(2);

  /* 同名干扰消歧（V5 反张冠李戴增强）：公司简称若是常见词组（如「中国长城」），
     「中国长城资产管理股份有限公司」等更长实体会误命中普通名称过滤（子串匹配），
     导致别家公司的利好/利空被算到本股头上（实测：000066 舆情 6 条中 5 条是「长城资产」）。
     规则：把文本中「简称+实体后缀」复合词全部剥离后，剩余文本仍含独立简称才算真正提及本公司。
     返回 { ok, kind:'drop'|'conf', conf }——conf 记录混淆实体名供报告如实展示。 */
  function mentionReal(name, title, content) {
    if (!name) return { ok: true };
    const txt = (title || '') + ' ' + (content || '');
    if (txt.indexOf(name) === -1) return { ok: false, kind: 'drop' };
    const re = new RegExp(name + '(?:资产|证券|银行|保险|人寿|基金|信托|期货|地产|置业|控股|集团|投资|资本)', 'g');
    const stripped = txt.replace(re, '');
    if (stripped.indexOf(name) === -1) {
      const m = txt.match(re);
      return { ok: false, kind: 'conf', conf: m ? m[0] : name + '系同名实体' };
    }
    return { ok: true };
  }

  /* ---------- 名称→代码解析（沿用实测方案，缓存24小时） ---------- */
  async function codeMap() {
    const c = Store.get('ana_codemap', null);
    if (c && c.list && c.at && Date.now() - c.at < 24 * 3600e3) return c.list;
    const base = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET';
    const one = await (async () => {
      const res = await fetch(base + '&columns=SECURITY_CODE%2CSECURITY_NAME_ABBR%2CTRADE_DATE&pageNumber=1&pageSize=1&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB&_=' + Date.now(), { cache: 'no-store' });
      const j = await res.json();
      return (j && j.result && j.result.data) || [];
    })();
    if (!one.length) throw new Error('代码表获取失败');
    const latest = String(one[0].TRADE_DATE).slice(0, 10);
    const res = await fetch(base + '&columns=SECURITY_CODE%2CSECURITY_NAME_ABBR&filter=' + encodeURIComponent("(TRADE_DATE='" + latest + "')") + '&pageNumber=1&pageSize=6000&sortColumns=SECURITY_CODE&sortTypes=1&source=WEB&client=WEB&_=' + Date.now(), { cache: 'no-store' });
    const j = await res.json();
    const data = (j && j.result && j.result.data) || [];
    const list = data.map(x => [x.SECURITY_CODE, x.SECURITY_NAME_ABBR]).filter(x => x[0] && x[1]);
    Store.set('ana_codemap', { at: Date.now(), date: latest, list });
    return list;
  }
  /* V4：全市场估值快照（全A最新交易日 PE/PB 序列，24h 缓存）——横向对比锚
     修改原因：V3 只有自身历史分位（纵向），低分位可能是全行业系统性低估，需全市场横向分位交叉验证 */
  async function mktValSnapshot() {
    const c = Store.get('ana_mktval', null);
    if (c && c.at && c.pes && Date.now() - c.at < 24 * 3600e3) return c;
    const base = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET';
    const one = await (async () => {
      const res = await fetch(base + '&columns=TRADE_DATE&pageNumber=1&pageSize=1&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB&_=' + Date.now(), { cache: 'no-store' });
      const j = await res.json();
      return (j && j.result && j.result.data) || [];
    })();
    if (!one.length) throw new Error('全市场快照获取失败');
    const latest = String(one[0].TRADE_DATE).slice(0, 10);
    const res = await fetch(base + '&columns=SECURITY_CODE%2CPE_TTM%2CPB_MRQ&filter=' + encodeURIComponent("(TRADE_DATE='" + latest + "')") + '&pageNumber=1&pageSize=6000&source=WEB&client=WEB&_=' + Date.now(), { cache: 'no-store' });
    const j = await res.json();
    const data = (j && j.result && j.result.data) || [];
    /* 剔极端值：PE>500 或 PB>100 为失真值，不参与分位 */
    const snap = { at: Date.now(), date: latest,
      pes: data.map(x => x.PE_TTM).filter(x => x != null && x > 0 && x < 500).sort((a, b) => a - b),
      pbs: data.map(x => x.PB_MRQ).filter(x => x != null && x > 0 && x < 100).sort((a, b) => a - b) };
    if (snap.pes.length > 2000) Store.set('ana_mktval', snap);
    return snap;
  }
  const pctOf = (sortedArr, v) => {
    if (!sortedArr || !sortedArr.length || v == null || !(v > 0)) return null;
    let lo = 0, hi = sortedArr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedArr[mid] <= v) lo = mid + 1; else hi = mid; }
    return Math.round(lo / sortedArr.length * 100);
  };

  async function resolveStock(input) {
    input = (input || '').trim();
    if (!input) return null;
    if (/^(sh|sz|bj)?\d{6}$/i.test(input)) return { code: input.replace(/^(sh|sz|bj)/i, ''), name: '' };
    const list = await codeMap();
    const exact = list.find(x => x[1] === input);
    if (exact) return { code: exact[0], name: exact[1] };
    const part = list.filter(x => x[1].indexOf(input) >= 0);
    if (part.length) return { code: part[0][0], name: part[0][1], cand: part.slice(0, 5).map(x => x[1] + '(' + x[0] + ')') };
    return null;
  }

  /* 同花顺实时行情（第二独立数据源，与腾讯行情交叉验证，差异>0.5%必须明示） */
  async function thsQuote(code6) {
    const url = 'https://d.10jqka.com.cn/v6/line/hs_' + code6 + '/01/today.js?_=' + Date.now();
    const res = await Promise.race([
      fetch(url, { cache: 'no-store' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    const m = txt.match(/^[^(]*\((\{[\s\S]*\})\)\s*;?\s*$/);
    if (!m) throw new Error('bad jsonp');
    const j = JSON.parse(m[1]);
    const q = j && j['hs_' + code6];
    if (!q || q['11'] == null) throw new Error('no quote');
    return {
      date: q['1'] || '', low: +q['7'], high: +q['8'], prevClose: +q['9'],
      price: +q['11'], vol: +q['13'] || null, amount: +q['19'] || null,
      name: q.name || ''
    };
  }

  /* ============================================================
     calcTech2 · 精准技术分析计算层（V3 重写）
     输入腾讯真实K线，输出：均线5档+排列+斜率+乖离率 / MACD背离+钝化 /
     震荡市缠绕度 / 金叉死叉扫描 / 量价九态 / 摆动高低点（支撑压力）/ 阶段涨跌 / 日均成交额
     全部本地计算，可对照任意行情软件复核；背离/缠绕为近似识别，输出处标注口径。
     ============================================================ */
  function calcTech2(klines) {
    const bars = klines.map(s => { const a = s.split(','); return { d: a[0], o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }; })
      .filter(b => Number.isFinite(b.c) && Number.isFinite(b.h) && Number.isFinite(b.l));
    if (bars.length < 30) return null;
    const n = bars.length, i = n - 1;
    const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
    const f2 = v => v == null ? null : +v.toFixed(2);
    /* 均线序列（支持回看取值，供斜率计算） */
    const maS = m => closes.map((_, j) => j + 1 >= m ? closes.slice(j - m + 1, j + 1).reduce((s, x) => s + x, 0) / m : null);
    const ma5s = maS(5), ma10s = maS(10), ma20s = maS(20), ma60s = maS(60), ma120s = maS(120), ma250s = maS(250);
    const ma5 = f2(ma5s[i]), ma10 = f2(ma10s[i]), ma20 = f2(ma20s[i]), ma60 = f2(ma60s[i]), ma120 = f2(ma120s[i]), ma250 = f2(ma250s[i]);
    /* 趋势斜率：MA20 近5日变化率%（量化口径：>0.8% 明确向上 / <-0.8% 明确向下 / 其间走平） */
    const slope20 = (ma20s[i] != null && ma20s[i - 5] != null) ? +(((ma20s[i] / ma20s[i - 5]) - 1) * 100).toFixed(2) : null;
    /* 乖离率 BIAS */
    const bias20 = ma20 != null ? +(((closes[i] / ma20) - 1) * 100).toFixed(1) : null;
    const bias60 = ma60 != null ? +(((closes[i] / ma60) - 1) * 100).toFixed(1) : null;
    /* 均线排列五级判定 */
    const arrState = (ma5 != null && ma10 != null && ma20 != null && ma60 != null && ma120 != null)
      ? (ma5 > ma10 && ma10 > ma20 && ma20 > ma60 && ma60 > ma120 ? '完美多头排列'
        : ma5 < ma10 && ma10 < ma20 && ma20 < ma60 && ma60 < ma120 ? '完美空头排列'
        : (ma20 > ma60 && ma60 > ma120 ? '多头排列（短周期缠绕）'
        : (ma20 < ma60 && ma60 < ma120 ? '空头排列（短周期缠绕）' : '均线缠绕，方向未明')))
      : (ma20 != null && ma60 != null ? (ma20 > ma60 ? '偏多排列（长周期样本不足）' : '偏空排列（长周期样本不足）') : '样本不足无法判定');
    const bull = ma20 != null && ma60 != null && ma120 != null && ma20 > ma60 && ma60 > ma120;
    /* 震荡市识别：MA20/MA60 缠绕度 <3% 且 MA20 斜率绝对值 <0.8% → 区间市，金叉死叉无效 */
    const entangle = (ma20 != null && ma60 != null) ? +(((Math.max(ma20, ma60) - Math.min(ma20, ma60)) / closes[i]) * 100).toFixed(2) : null;
    const rangeBound = entangle != null && entangle < 3 && slope20 != null && Math.abs(slope20) < 0.8;
    /* MACD(12,26,9) 全序列（背离识别需要） */
    const ema = (arr, m) => { const k = 2 / (m + 1); const out = [arr[0]]; for (let j = 1; j < arr.length; j++) out.push(arr[j] * k + out[j - 1] * (1 - k)); return out; };
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const dif = closes.map((_, j) => e12[j] - e26[j]);
    const dea = ema(dif, 9);
    const hist = dif.map((d, j) => (d - dea[j]) * 2);
    /* KDJ(9,3,3) 全序列（钝化识别需要） */
    const Js = [];
    {
      let K = 50, D = 50;
      for (let j = 0; j < n; j++) {
        const st = Math.max(0, j - 8);
        const hh = Math.max(...highs.slice(st, j + 1)), ll = Math.min(...lows.slice(st, j + 1));
        const rsv = hh > ll ? (closes[j] - ll) / (hh - ll) * 100 : 50;
        K = 2 / 3 * K + 1 / 3 * rsv; D = 2 / 3 * D + 1 / 3 * K;
        Js.push(3 * K - 2 * D);
      }
      var kdjK = +K.toFixed(1), kdjD = +D.toFixed(1);
    }
    const kdjJ = +Js[i].toFixed(1);
    /* RSI(6) */
    let g6 = 0, l6 = 0;
    for (let j = n - 6; j <= i; j++) { const ch = closes[j] - closes[j - 1]; if (ch > 0) g6 += ch; else l6 -= ch; }
    const rsi6 = l6 === 0 ? 100 : +(100 - 100 / (1 + g6 / l6)).toFixed(1);
    /* 钝化天数：J 连续 >100 或 <0；MACD 柱连续同向（≥10 日为动能钝化） */
    let jHiDays = 0, jLoDays = 0, histUpDays = 0, histDnDays = 0;
    for (let j = i; j >= 0 && Js[j] > 100; j--) jHiDays++;
    for (let j = i; j >= 0 && Js[j] < 0; j--) jLoDays++;
    for (let j = i; j >= 0 && hist[j] > 0; j--) histUpDays++;
    for (let j = i; j >= 0 && hist[j] < 0; j--) histDnDays++;
    /* MACD 背离近似识别：近 120 根分前后两段，价格极值与 DIF 极值背离比较
       口径声明：两段极值法为近似识别，非严格缠论笔段划分，输出标注 C 级 */
    const div = (() => {
      const win = Math.min(120, n), st = n - win, mid = Math.floor((st + n) / 2);
      let hi1 = -1, hi1i = -1, hi2 = -1, hi2i = -1, lo1 = Infinity, lo1i = -1, lo2 = Infinity, lo2i = -1;
      for (let j = st; j < mid; j++) { if (highs[j] > hi1) { hi1 = highs[j]; hi1i = j; } if (lows[j] < lo1) { lo1 = lows[j]; lo1i = j; } }
      for (let j = mid; j < n; j++) { if (highs[j] > hi2) { hi2 = highs[j]; hi2i = j; } if (lows[j] < lo2) { lo2 = lows[j]; lo2i = j; } }
      if (hi1i < 0 || hi2i < 0 || lo1i < 0 || lo2i < 0) return { top: false, bottom: false };
      return {
        top: hi2 > hi1 * 1.005 && dif[hi2i] < dif[hi1i],
        topDetail: `前段高点 ${f2(hi1)}(${bars[hi1i].d}) vs 后段高点 ${f2(hi2)}(${bars[hi2i].d})，DIF ${+dif[hi1i].toFixed(3)} → ${+dif[hi2i].toFixed(3)}`,
        bottom: lo2 < lo1 * 0.995 && dif[lo2i] > dif[lo1i],
        bottomDetail: `前段低点 ${f2(lo1)}(${bars[lo1i].d}) vs 后段低点 ${f2(lo2)}(${bars[lo2i].d})，DIF ${+dif[lo1i].toFixed(3)} → ${+dif[lo2i].toFixed(3)}`
      };
    })();
    /* 金叉/死叉扫描（近60根 DIF×DEA 交叉），震荡市内一律标记无效 */
    const crosses = [];
    for (let j = Math.max(1, n - 60); j < n; j++) {
      const d0 = dif[j - 1] - dea[j - 1], d1 = dif[j] - dea[j];
      if (d0 <= 0 && d1 > 0) crosses.push({ type: 'gold', date: bars[j].d, above: dif[j] > 0, valid: !rangeBound });
      else if (d0 >= 0 && d1 < 0) crosses.push({ type: 'dead', date: bars[j].d, above: dif[j] > 0, valid: !rangeBound });
    }
    /* 摆动高低点（近120根，3根翼展局部极值）→ 支撑/压力位 */
    const swL = [], swH = [];
    for (let j = Math.max(2, n - 120); j < n - 2; j++) {
      if (lows[j] < lows[j - 1] && lows[j] < lows[j - 2] && lows[j] <= lows[j + 1] && lows[j] <= lows[j + 2]) swL.push({ p: f2(lows[j]), d: bars[j].d });
      if (highs[j] > highs[j - 1] && highs[j] > highs[j - 2] && highs[j] >= highs[j + 1] && highs[j] >= highs[j + 2]) swH.push({ p: f2(highs[j]), d: bars[j].d });
    }
    /* 量比与均量 */
    const prev5 = vols.slice(-6, -1);
    const volAvg5 = prev5.length ? prev5.reduce((s, x) => s + x, 0) / prev5.length : 0;
    const volRatio = volAvg5 > 0 ? +(vols[i] / volAvg5).toFixed(2) : null;
    const avgV = m => { const s = vols.slice(-m - 1, -1); return s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(0) : null; };
    const avgV5 = avgV(5), avgV20 = avgV(20);
    /* 近20日日均成交额（近似：量(手)×100×收盘价），供解禁冲击/流动性测算 */
    let avgAmt20 = null;
    { const s = bars.slice(-21, -1); if (s.length >= 10) avgAmt20 = +(s.reduce((a, b) => a + b.v * 100 * b.c, 0) / s.length / 1e8).toFixed(2); }
    /* 区间与阶段涨跌 */
    const hi52 = Math.max(...highs), lo52 = Math.min(...lows);
    const pos52 = hi52 > lo52 ? Math.round((closes[i] - lo52) / (hi52 - lo52) * 100) : null;
    const yearChg = +((closes[i] / closes[0] - 1) * 100).toFixed(1);
    const chg = m => n > m + 1 ? +(((closes[i] / closes[i - 1 - m]) - 1) * 100).toFixed(2) : null;
    const chg5 = chg(5), chg10 = chg(10), chg30 = chg(30);
    /* 量价九态判定（量化口径：涨跌幅 ±0.3% 为方向阈值，量比 1.5/0.8 为量能阈值） */
    const prev = bars[i - 1];
    const chg1 = prev ? +(((closes[i] / prev.c) - 1) * 100).toFixed(2) : null;
    let volState = null;
    if (volRatio != null && chg1 != null) {
      const up = chg1 >= 0.3, dn = chg1 <= -0.3, big = volRatio >= 1.5, small = volRatio <= 0.8;
      volState = big && up ? '放量上涨' : small && up ? '缩量上涨（动能存疑）' : big && dn ? '放量下跌（筹码松动）' : small && dn ? '缩量下跌（抛压衰减）'
        : big ? '放量滞涨/滞跌（方向待确认）' : small ? '缩量整理' : '量价常态';
    }
    /* ---- V4 扩容计算（全部本地可复算） ---- */
    /* BOLL(20,2)：中轨=MA20，上下轨=中轨±2σ；带宽=(上-下)/中×100%；
       收口判定：当前带宽处于近120日带宽序列的 20% 分位以下 → 波动率挤压（变盘前兆） */
    let boll = null;
    if (ma20 != null && n >= 40) {
      const seg = closes.slice(n - 20);
      const sd = Math.sqrt(seg.reduce((s, x) => s + (x - ma20) * (x - ma20), 0) / 20);
      const upper = f2(ma20 + 2 * sd), lower = f2(ma20 - 2 * sd);
      const bw = +(((upper - lower) / ma20) * 100).toFixed(2);
      const pctB = upper > lower ? +(((closes[i] - lower) / (upper - lower))).toFixed(2) : null;
      /* 近120日带宽序列分位（近似：每5日采样一次以控制计算量） */
      const bws = [];
      for (let j = Math.max(25, n - 120); j < n; j += 5) {
        const m2 = ma20s[j]; if (m2 == null) continue;
        const sg = closes.slice(j - 19, j + 1);
        const sd2 = Math.sqrt(sg.reduce((s, x) => s + (x - m2) * (x - m2), 0) / 20);
        bws.push(((m2 + 2 * sd2) - (m2 - 2 * sd2)) / m2 * 100);
      }
      const bwPct = bws.length >= 8 ? Math.round(bws.filter(x => x <= bw).length / bws.length * 100) : null;
      boll = { mid: ma20, upper, lower, bw, pctB, bwPct, squeeze: bwPct != null && bwPct <= 20 };
    }
    /* 40 日箱体（不含当日）：突破有效性 = 收盘越界 ≥1% 且量比 ≥1.5，否则判假突破剔除 */
    let box = null;
    if (n >= 42) {
      const win40 = bars.slice(n - 41, n - 1);
      const boxH = f2(Math.max(...win40.map(b => b.h))), boxL = f2(Math.min(...win40.map(b => b.l)));
      const hDate = win40.find(b => f2(b.h) === boxH), lDate = win40.find(b => f2(b.l) === boxL);
      const brkUp = closes[i] > boxH * 1.01, brkDn = closes[i] < boxL * 0.99;
      const volOk = volRatio != null && volRatio >= 1.5;
      box = { h: boxH, l: boxL, hDate: hDate ? hDate.d : '', lDate: lDate ? lDate.d : '',
        range: +(((boxH / boxL) - 1) * 100).toFixed(1),
        brkUp, brkDn, upValid: brkUp && volOk, dnValid: brkDn && volOk,
        upFake: brkUp && !volOk, dnFake: brkDn && !volOk };
    }
    /* 量加权筹码分布近似（C级口径）：近120根按 (H+L+C)/3 典型价落 24 个价格桶，按成交量加权。
       输出：筹码峰价、峰集中度（峰桶量占比）、获利盘%（成本低于现价的量占比）、套牢盘%、
       峰迁移（前60根峰 vs 后60根峰方向）。与券商筹码分布存在口径差异，仅作近似参考。 */
    let chips = null;
    if (n >= 60) {
      const winN = Math.min(120, n), st = n - winN;
      const lo = Math.min(...lows.slice(st)), hi = Math.max(...highs.slice(st));
      if (hi > lo) {
        const BN = 24, step = (hi - lo) / BN;
        const buckets = new Array(BN).fill(0), b1 = new Array(BN).fill(0), b2 = new Array(BN).fill(0);
        const mid = st + Math.floor(winN / 2);
        for (let j = st; j < n; j++) {
          const tp = (bars[j].h + bars[j].l + bars[j].c) / 3;
          const bi = Math.min(BN - 1, Math.floor((tp - lo) / step));
          buckets[bi] += vols[j];
          if (j < mid) b1[bi] += vols[j]; else b2[bi] += vols[j];
        }
        const tot = buckets.reduce((s, x) => s + x, 0) || 1;
        const peakI = buckets.indexOf(Math.max(...buckets));
        const peakP = f2(lo + (peakI + 0.5) * step);
        const peakShare = Math.round(buckets[peakI] / tot * 100);
        /* 集中度：量最大的 4 个桶合计占比（>50% 视为筹码集中） */
        const top4 = buckets.slice().sort((a, b) => b - a).slice(0, 4).reduce((s, x) => s + x, 0);
        const concentration = Math.round(top4 / tot * 100);
        let below = 0;
        for (let j = 0; j < BN; j++) if (lo + (j + 0.5) * step < closes[i]) below += buckets[j];
        const profitPct = Math.round(below / tot * 100);
        const p1 = b1.indexOf(Math.max(...b1)), p2 = b2.indexOf(Math.max(...b2));
        const migration = p2 > p1 ? '上移（成本重心抬高，多头换手健康）' : p2 < p1 ? '下移（成本重心下沉，套牢盘加重）' : '未迁移';
        chips = { peakP, peakShare, concentration, profitPct, trapPct: 100 - profitPct, migration,
          nearPeak: Math.abs(closes[i] - peakP) / closes[i] <= 0.03,
          days: winN };
      }
    }
    /* MA20 支撑/压力有效性计数（近60日）：
       价格在 MA20 上方时，低点触及 MA20±1% 且当日收回 → 有效支撑次数；
       价格在 MA20 下方时，高点触及 MA20±1% 且当日回落 → 有效压力次数 */
    let ma20Test = null;
    if (ma20 != null && n >= 62) {
      let supHit = 0, resHit = 0;
      for (let j = n - 61; j < n - 1; j++) {
        const m2 = ma20s[j]; if (m2 == null) continue;
        if (closes[j] >= m2 && lows[j] <= m2 * 1.01 && closes[j] >= m2 * 0.995) supHit++;
        if (closes[j] < m2 && highs[j] >= m2 * 0.99 && closes[j] <= m2 * 1.005) resHit++;
      }
      ma20Test = { supHit, resHit };
    }
    /* MACD 二次钝化识别：长钝化（≥10日同向柱）结束后 10 日内再次同向放大 → 二次钝化 */
    let macd2nd = null;
    {
      let lastFlip = -1;
      for (let j = i; j >= 1; j--) { if ((hist[j] > 0) !== (hist[j - 1] > 0)) { lastFlip = j; break; } }
      if (lastFlip > 0 && i - lastFlip <= 10) {
        let prevRun = 0;
        for (let j = lastFlip - 1; j >= 0 && (hist[j] > 0) === (hist[lastFlip - 1] > 0); j--) prevRun++;
        if (prevRun >= 10) {
          const curDir = hist[i] > 0 ? 'red' : 'green';
          const prevDir = hist[lastFlip - 1] > 0 ? 'red' : 'green';
          macd2nd = curDir === prevDir
            ? { type: 'same', txt: `${curDir === 'red' ? '红' : '绿'}柱长钝化 ${prevRun} 日后再次同向放大——二次钝化，原趋势动能超预期延续` }
            : { type: 'flip', txt: `${prevDir === 'red' ? '红' : '绿'}柱长钝化 ${prevRun} 日后翻${curDir === 'red' ? '红' : '绿'}——钝化后反转，动能切换需二次确认` };
        }
      }
    }
    return {
      date: bars[i].d, close: closes[i], n,
      open: bars[i].o,
      ma5, ma10, ma20, ma60, ma120, ma250, bull, arrState, slope20, bias20, bias60,
      entangle, rangeBound,
      dif: +dif[i].toFixed(3), dea: +dea[i].toFixed(3),
      hist: +hist[i].toFixed(3), histPrev: +hist[i - 1].toFixed(3),
      k: kdjK, d: kdjD, j: kdjJ, rsi6,
      jHiDays, jLoDays, histUpDays, histDnDays,
      div, crosses: crosses.slice(-4),
      swL: swL.slice(-6), swH: swH.slice(-6),
      vol: vols[i], volRatio, avgV5, avgV20, avgAmt20, volState, chg1,
      hi52: f2(hi52), lo52: f2(lo52), pos52, yearChg, chg5, chg10, chg30,
      boll, box, chips, ma20Test, macd2nd,
      /* 精简K线序列（日期/收盘/量），供席位次日校验与边界复核 */
      seq: bars.map(b => ({ d: b.d, c: b.c, v: b.v }))
    };
  }

  /* 深度数据（K线天数可配置版；V3 起改用 calcTech2 精准计算层） */
  async function deepFetch2(r, cnt) {
    const out = { tech: null, techW: null, val: null, holder: null };
    const nc = (Market.normalizeCode && r.code) ? Market.normalizeCode(r.code) : '';
    const code6 = (r.code || '').replace(/^(sh|sz|bj)/i, '');
    if (!code6 || !nc) return out;
    const secu = code6 + (nc.indexOf('sh') === 0 ? '.SH' : (nc.indexOf('bj') === 0 ? '.BJ' : '.SZ'));
    const kl = async (period, n2) => {
      const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + nc + ',' + period + ',,,' + n2 + ',qfq&_=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json();
      const d = j && j.data && j.data[nc];
      const arr = d && (d['qfq' + period] || d[period]);
      return (arr || []).map(a => a.slice(0, 6).join(','));
    };
    const jobs = [
      kl('day', cnt || 320).then(l => {
        out.tech = calcTech2(l);
        if (out.tech && out.tech.n >= 22) {
          const t = out.tech, b30i = Math.max(0, t.n - 31);
          out.extra = {
            open: t.open, date: t.date, avgV5: t.avgV5, avgV20: t.avgV20,
            chg30: t.chg30, from30: null, close30: null
          };
          /* from30/close30 需要从原始序列补一次（calcTech2 不保留全量 bars 引用） */
          const bars = l.map(s => { const a = s.split(','); return { d: a[0], c: +a[2] }; }).filter(b => Number.isFinite(b.c));
          if (bars.length >= 31) { out.extra.from30 = bars[bars.length - 31].d; out.extra.close30 = bars[bars.length - 31].c; }
        }
      })
        .catch(e => console.warn('[日K获取失败]', e.message)),
      kl('week', 200).then(l => { out.techW = AnaLegacy.calcWeekly(l); })
        .catch(e => console.warn('[周K获取失败]', e.message)),
      (async () => {
        const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=ALL'
          + '&filter=' + encodeURIComponent('(SECUCODE="' + secu + '")')
          + '&pageNumber=1&pageSize=250&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB&_=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        const j = await res.json();
        const list = (j && j.result && j.result.data) || [];
        if (!list.length) return;
        const cur = list[0];
        const pct = (key, v) => {
          if (v == null || !(v > 0)) return null;
          const s = list.map(x => x[key]).filter(x => x != null && x > 0);
          if (s.length < 20) return null;
          return Math.round(s.filter(x => x <= v).length / s.length * 100);
        };
        out.val = {
          date: String(cur.TRADE_DATE || '').slice(0, 10),
          pe: cur.PE_TTM != null ? +cur.PE_TTM.toFixed(1) : null,
          pb: cur.PB_MRQ != null ? +cur.PB_MRQ.toFixed(2) : null,
          ps: cur.PS_TTM != null ? +cur.PS_TTM.toFixed(1) : null,
          pcf: cur.PCF_OCF_TTM != null ? +cur.PCF_OCF_TTM.toFixed(1) : null,
          peg: cur.PEG_CAR != null ? +cur.PEG_CAR.toFixed(2) : null,
          mcap: cur.TOTAL_MARKET_CAP != null ? +(cur.TOTAL_MARKET_CAP / 1e8).toFixed(0) : null,
          pePct: pct('PE_TTM', cur.PE_TTM), pbPct: pct('PB_MRQ', cur.PB_MRQ), days: list.length
        };
      })().catch(e => console.warn('[估值获取失败]', e.message)),
      (async () => {
        const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_HOLDERNUMLATEST&columns=ALL'
          + '&filter=' + encodeURIComponent('(SECURITY_CODE="' + code6 + '")')
          + '&pageNumber=1&pageSize=2&source=WEB&client=WEB&_=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        const j = await res.json();
        const list = (j && j.result && j.result.data) || [];
        const d = list[0];
        if (d) out.holder = {
          num: d.HOLDER_NUM, prev: d.PRE_HOLDER_NUM,
          ratio: d.HOLDER_NUM_RATIO != null ? +d.HOLDER_NUM_RATIO.toFixed(1) : null,
          date: String(d.END_DATE || '').slice(0, 10), prevDate: String(d.PRE_END_DATE || '').slice(0, 10)
        };
      })().catch(e => console.warn('[股东户数获取失败]', e.message))
    ];
    await Promise.allSettled(jobs);
    return out;
  }

  /* ---------- 数据底座（共享，各模块复用）· V3 起全程登记数据质量 ---------- */
  async function buildBase(task) {
    const r = { code: task.code, name: task.name };
    const base = { r, quality: [] };
    /* 数据通道登记器：name 通道 / ok 状态 / note 时效与误差说明（误差溯源用） */
    const q = (name, ok, note) => base.quality.push({ name, ok: !!ok, note: note || '' });
    const pxMap = task.code ? await Market.priceOf([task.code]).catch(() => ({})) : {};
    base.px = pxMap[task.code] || null;
    q('腾讯实时行情', base.px && base.px.price != null, base.px && base.px.price != null ? `现价 ${base.px.price} 元` : '未获取，价格维度降级为K线收盘价口径');
    if (base.px && base.px.name && !task.name) { task.name = base.px.name; r.name = task.name; }
    const [mkt, web, deep] = await Promise.all([
      AnaLegacy.ensureMkt(false).catch(() => ({})),
      AnaLegacy.webFetch(r).catch(() => ({ news: [], newsOk: false, fund: null, predict: null })),
      deepFetch2(r, task.cfg && task.cfg.kline).catch(() => ({ tech: null, techW: null, val: null, holder: null }))
    ]);
    base.mkt = mkt; base.web = web; base.deep = deep;
    q('腾讯日K线样本', deep.tech != null, deep.tech ? `${deep.tech.n} 根（${deep.tech.n >= 250 ? '满足 MA250 全指标' : deep.tech.n >= 120 ? 'MA250 缺失，长周期指标降级' : '样本 <120 根，长周期指标不可信，结论降权'}）` : '未获取，技术模块失效');
    q('东财估值序列', deep.val != null, deep.val ? `近一年 ${deep.val.days} 个交易日序列（${deep.val.date}）` : '未获取，估值百分位无法计算');
    q('东财财报', !!(web.fund), web.fund ? `${web.fund.datatype || web.fund.qdate} · ${web.fund.notice || '—'} 披露` : '未检索到（次新股或接口无记录）');
    q('东财业绩预告', !!(web.predict), web.predict ? `${web.predict.notice} 披露，报告期 ${web.predict.reportdate || '—'}` : '当前无在披露期预告');
    q('东财全网新闻检索', web.newsOk === true, web.newsOk ? `返回 ${(web.news || []).length} 条（相关度排序，需名称过滤）` : '检索失败或无结果');
    q('股东户数', !!(deep.holder), deep.holder ? `${deep.holder.date} 披露 ${deep.holder.num != null ? deep.holder.num.toLocaleString() + ' 户' : '—'}` : '未检索到披露记录');
    // 大盘情绪阶段（与复盘同规则）
    const br = mkt.br;
    let stage = null;
    if (br && br.ok && Number.isFinite(br.limitUp) && Number.isFinite(br.sealRate) && Number.isFinite(br.height)) {
      const lu = br.limitUp, sr = br.sealRate, hg = br.height, ld = br.limitDown, bk = br.broken;
      if ((lu < 30 && sr < 55) || (Number.isFinite(ld) && ld >= 30)) stage = '冰点';
      else if (lu >= 80 && sr >= 70 && hg >= 5) stage = '高潮';
      else if (lu >= 50 && sr >= 60 && hg >= 3) stage = '发酵';
      else stage = '修复';
      if (stage !== '冰点' && Number.isFinite(bk) && bk >= lu) stage = '退潮';
    }
    base.stage = stage;
    q('大盘情绪数据', !!stage, stage ? `阶段「${stage}」（涨停 ${br.limitUp} 家/封板率 ${br.sealRate}%/最高 ${br.height} 板，东财口径不含 ST）` : '未获取，大盘环境维度失效');
    // 两市成交额
    try {
      const iq = await Market.quotes(['sh', 'sz']);
      if (iq && iq.sh && iq.sz && iq.sh.amount != null && iq.sz.amount != null)
        base.amount = +((iq.sh.amount + iq.sz.amount) / 1e8).toFixed(2);
    } catch (e) {}
    q('两市成交额', base.amount != null, base.amount != null ? `约 ${base.amount} 万亿（沪深实时加总）` : '未获取');
    const code6 = (task.code || '').replace(/^(sh|sz|bj)/i, '');
    let name = task.name || '';
    base.code6 = code6;
    // 同花顺实时行情（第二独立数据源，与腾讯行情交叉验证）
    base.ths = code6 ? await thsQuote(code6).catch(() => null) : null;
    q('同花顺实时行情', !!(base.ths && base.ths.price != null), base.ths && base.ths.price != null ? `${base.ths.price} 元（${base.ths.date}）` : '未获取，双源验证降级为单源');
    if (base.ths && base.ths.name && !task.name) { task.name = base.ths.name; r.name = task.name; name = task.name; }
    if (base.ths && base.px && base.px.price != null) {
      const diff = Math.abs(base.ths.price - base.px.price) / base.px.price;
      base.pxCheck = diff <= 0.005
        ? { ok: true, diff: +(diff * 100).toFixed(3), text: `腾讯 ${base.px.price} 元 vs 同花顺 ${base.ths.price} 元 → 双源一致（差异 ${(diff * 100).toFixed(3)}% ≤ 0.5% 阈值）✅（均截至各自最新交易日）` }
        : { ok: false, diff: +(diff * 100).toFixed(2), text: `腾讯 ${base.px.price} 元 vs 同花顺 ${base.ths.price} 元 → 双源差异 ${(diff * 100).toFixed(2)}% 超 0.5% 阈值 ⚠️ 请对照行情软件复核，本报告价格口径以腾讯为准` };
      base.quality.push({ name: '价格双源交叉验证', ok: diff <= 0.005, note: base.pxCheck.text });
    } else if (base.ths) {
      base.pxCheck = { ok: true, diff: null, text: `同花顺 ${base.ths.price} 元（${base.ths.date}）· 腾讯实时价未获取，单源标注` };
    } else {
      base.pxCheck = { ok: false, diff: null, text: '同花顺行情未获取，价格仅腾讯单源——如实标注' };
    }
    /* V4：东财主力资金流通道（push2 fflow，ACAO:* 已实测可达）——主力/大单/中单/小单净流入日序列
       用途：连续 3-5 日资金行为追踪、主力/小单背离诱多识别；失败则如实标注降级 */
    base._fflow = null;
    if (code6) {
      /* 双通道兜底：push2 → push2his（同一接口两个域名，实测偶发单点失败） */
      const secid = (/^(6|9)/.test(code6) ? '1.' : '0.') + code6;
      const grab = async host => {
        const res = await Promise.race([
          fetch('https://' + host + '.eastmoney.com/api/qt/stock/fflow/kline/get?secid=' + secid + '&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55&klt=101&lmt=12&ut=b2884a393a59ad64002292a3e90d46a5&_=' + Date.now(), { cache: 'no-store' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))
        ]);
        const j = await res.json();
        const kl = j && j.data && j.data.klines;
        if (!kl || kl.length < 5) throw new Error('no klines');
        return kl;
      };
      let kl = null;
      try { kl = await grab('push2'); } catch (e) { try { kl = await grab('push2his'); } catch (e2) {} }
      if (kl) {
        const rows = kl.map(s => { const a = s.split(','); return { d: a[0], main: +a[1] / 1e8, small: +a[2] / 1e8, mid: +a[3] / 1e8, big: +a[4] / 1e8 }; })
          .filter(x => x.d && Number.isFinite(x.main));
        if (rows.length >= 5) {
          const last5 = rows.slice(-5);
          const sum5 = +last5.reduce((s, x) => s + x.main, 0).toFixed(2);
          let run = 0;
          const dir0 = rows[rows.length - 1].main >= 0 ? 1 : -1;
          for (let k = rows.length - 1; k >= 0; k--) { if ((rows[k].main >= 0 ? 1 : -1) === dir0) run++; else break; }
          base._fflow = { date: rows[rows.length - 1].d, days: rows.length, sum5,
            runDays: run, runDir: dir0 > 0 ? 'in' : 'out',
            todayMain: +rows[rows.length - 1].main.toFixed(2), todaySmall: +rows[rows.length - 1].small.toFixed(2),
            last5: last5.map(x => ({ d: x.d, main: +x.main.toFixed(2) })) };
        }
      }
      q('东财主力资金流', !!base._fflow, base._fflow ? `截至 ${base._fflow.date}，近${base._fflow.days} 日序列（push2/push2his 双通道兜底）` : '未获取（双通道均失败，该接口偶发限流），连续资金行为维度降级为龙虎榜口径');
    }
    q('北向资金实时流向', false, '2024-08 起交易所停止披露北向实时流向与每日净买卖额（官方口径），本系统不做北向结论——如实标注，不编造');
    base.zt = (mkt.lad && mkt.lad.ok && mkt.lad.items) ? mkt.lad.items.find(i2 => i2.code === code6 || (name && i2.name === name)) : null;
    base.lb = (mkt.lhb && mkt.lhb.ok && mkt.lhb.items) ? mkt.lhb.items.find(i2 => i2.code === code6 || (name && i2.name === name)) : null;
    base.secUpHit = null; base.secDnHit = null;
    if (mkt.sec && mkt.sec.ok) {
      const matchS = s => (base.zt && base.zt.hybk && (s.name === base.zt.hybk || s.name.indexOf(base.zt.hybk) >= 0 || base.zt.hybk.indexOf(s.name) >= 0)) || (name && s.leader === name);
      base.secUpHit = (mkt.sec.up || []).find(matchS) || null;
      base.secDnHit = (mkt.sec.down || []).find(matchS) || null;
    }
    const nd = News.data ? News.data() : null;
    base.flashHits = name && nd && nd.items
      ? nd.items.filter(i2 => (i2.title + ' ' + (i2.summary || '')).indexOf(name) >= 0).slice(0, 8)
          .map(i2 => ({ title: i2.title, url: i2.url, time: i2.time, date: i2.date, src: i2.src || '' }))
      : [];
    base.flashItems = (nd && nd.items) || [];
    q('工作台五通道快讯流', !!(nd && nd.items && nd.items.length), nd && nd.items ? `在库 ${nd.items.length} 条，命中本公司 ${base.flashHits.length} 条` : '快讯流为空');
    return base;
  }

  /* ---------- 模块 ① 技术分析（V3 精准重写：量化+防失真） ---------- */
  function modTech(base, task) {
    const t = base.deep.tech, w = base.deep.techW;
    const points = [], signals = [], filtered = [];
    if (!t) return { summary: 'K线数据未获取（请确认代码正确），技术指标无法计算——如实标注，未编造。', points, signals, filtered, bounds: '技术模块失效：无K线样本。' };
    /* 价格可信度：双源一致 → 技术信号基底 A- 级可信度；单源 → B 级并标注 */
    const baseGrade = base.pxCheck && base.pxCheck.ok && base.pxCheck.diff != null ? 'A' : 'B';
    const macdState = t.dif > 0 && t.dea > 0 ? '0轴上方' : (t.dif < 0 && t.dea < 0 ? '0轴下方' : '0轴附近');
    const histState = t.hist > 0 ? (t.hist < t.histPrev ? '红柱开始缩短（多头动能衰减）' : '红柱放大（多头动能增强）') : (t.hist > t.histPrev ? '绿柱开始缩短（空头动能衰减）' : '绿柱放大（空头动能增强）');
    const slopeTxt = t.slope20 == null ? '—' : t.slope20 > 0.8 ? `+${t.slope20}%（明确向上）` : t.slope20 < -0.8 ? `${t.slope20}%（明确向下）` : `${t.slope20}%（走平）`;

    points.push(`趋势快照：截至 ${t.date} 收盘 ${t.close} 元；均线排列「${t.arrState}」；MA20 斜率 ${slopeTxt}；乖离率 BIAS20 ${t.bias20 != null ? t.bias20 + '%' : '—'} / BIAS60 ${t.bias60 != null ? t.bias60 + '%' : '—'}（腾讯日K ${t.n} 根）`);
    points.push(`市场状态：${t.rangeBound ? `震荡市（MA20/MA60 缠绕度 ${t.entangle}% < 3% 且斜率走平）——金叉死叉类信号无效，已按规则剔除` : `趋势市（缠绕度 ${t.entangle != null ? t.entangle + '%' : '—'}）——趋势级信号有效`}`);
    points.push(`周线：${w ? 'MA10W ' + w.ma10w + ' / MA30W ' + w.ma30w + '，中期趋势' + (w.up ? '向上' : '向下') + '（截至 ' + w.date + '）' : '数据不足无法判断'}`);
    points.push(`MACD：DIF ${t.dif} / DEA ${t.dea}（${macdState}），${histState}${t.histUpDays >= 10 ? `；红柱已连续 ${t.histUpDays} 日，多头动能钝化，警惕二次见顶` : ''}${t.histDnDays >= 10 ? `；绿柱已连续 ${t.histDnDays} 日，空头动能钝化，杀跌动能边际衰竭` : ''}`);
    points.push(`背离扫描（近120根两段极值近似法，C级口径）：${t.div.top ? '⚠️ 顶背离确认——' + t.div.topDetail : '无顶背离'}；${t.div.bottom ? '✅ 底背离确认——' + t.div.bottomDetail : '无底背离'}`);
    points.push(`KDJ：K ${t.k} / D ${t.d} / J ${t.j}${t.jHiDays >= 5 ? `（J 值连续 ${t.jHiDays} 日 >100，超买钝化——强势趋势中钝化可延续，不作为单独卖出依据）` : t.j > 100 ? '（超买区）' : ''}${t.jLoDays >= 5 ? `（J 值连续 ${t.jLoDays} 日 <0，超卖钝化——下跌趋势中钝化可延续，不作为单独买入依据）` : t.j < 0 ? '（超卖区）' : ''}；RSI(6) ${t.rsi6}${t.rsi6 > 80 ? '（超买）' : t.rsi6 < 20 ? '（超卖）' : ''}`);
    points.push(`量价：最新成交量 ${t.vol} 手，量比 ${t.volRatio != null ? t.volRatio + ' 倍' : '—'}，量价结构判定「${t.volState || '—'}」（口径：涨跌幅阈值 ±0.3%，量比阈值 1.5/0.8）；区间：近 ${t.n} 日累计 ${t.yearChg > 0 ? '+' : ''}${t.yearChg}%，处 [${t.lo52}, ${t.hi52}] 的 ${t.pos52 != null ? t.pos52 + '%' : '—'} 分位`);
    if (t.crosses && t.crosses.length) {
      points.push(`近60日 MACD 交叉扫描：${t.crosses.map(c => `${c.date} ${c.type === 'gold' ? '金叉' : '死叉'}${c.above ? '（0轴上）' : '（0轴下）'}${c.valid ? '' : '——震荡市无效信号，已剔除'}`).join('；')}`);
    }
    /* V4：BOLL / 箱体 / 筹码分布 / 支撑有效性 / 二次钝化 */
    if (t.boll) {
      const bo = t.boll;
      points.push(`BOLL(20,2)：上轨 ${bo.upper} / 中轨 ${bo.mid} / 下轨 ${bo.lower}，带宽 ${bo.bw}%（近120日 ${bo.bwPct != null ? bo.bwPct + '%' : '—'} 分位）${bo.squeeze ? '——⚠️ 带宽极度收口（≤20% 分位），波动率挤压，变盘前兆，方向待量能确认' : ''}；%b ${bo.pctB != null ? bo.pctB : '—'}（>1 超买上轨外 / <0 超卖下轨外）`);
    }
    if (t.box) {
      const bx = t.box;
      points.push(`40日箱体：[${bx.l}（${bx.lDate}）~ ${bx.h}（${bx.hDate}）]，振幅 ${bx.range}%${bx.upValid ? `；当日放量突破箱顶（量比 ${t.volRatio} ≥1.5）——有效突破` : bx.upFake ? `；当日收盘越箱顶但量比仅 ${t.volRatio != null ? t.volRatio : '—'} <1.5——无量假突破，已剔除不入信号` : bx.dnValid ? `；当日放量跌破箱底（量比 ${t.volRatio} ≥1.5）——有效破位` : bx.dnFake ? `；当日收盘破箱底但量能不足（量比 ${t.volRatio != null ? t.volRatio : '—'}）——破位有效性存疑，降级观察` : '；价格处箱体内运行'}`);
    }
    if (t.chips) {
      const c2 = t.chips;
      points.push(`筹码分布（近${c2.days}日量加权近似，C级口径）：筹码峰 ${c2.peakP} 元（峰桶量占比 ${c2.peakShare}%），集中度 ${c2.concentration}%（前4价区量占比，>50% 为集中）；获利盘 ${c2.profitPct}% / 套牢盘 ${c2.trapPct}%；峰迁移：${c2.migration}${c2.nearPeak ? '；现价贴近筹码峰（±3% 内），峰位构成短期争夺中枢' : ''}`);
      if (c2.profitPct >= 90) signals.push(sig('bear', `获利盘 ${c2.profitPct}%（量加权近似），全盘获利状态，兑现压力累积`, 1, '筹码分布近似', 'C', 'swing'));
      if (c2.profitPct <= 10) signals.push(sig('bull', `获利盘仅 ${c2.profitPct}%（量加权近似），全盘套牢，抛压接近枯竭但需量能确认`, 1, '筹码分布近似', 'C', 'swing'));
      if (c2.migration.indexOf('上移') >= 0 && c2.profitPct > 50) signals.push(sig('bull', `筹码峰上移且获利盘 ${c2.profitPct}%，换手健康、成本重心抬高`, 1, '筹码分布近似', 'C', 'trend'));
      if (c2.migration.indexOf('下移') >= 0 && c2.trapPct > 60) signals.push(sig('bear', `筹码峰下移且套牢盘 ${c2.trapPct}%，反弹将遇密集解套抛压`, 1, '筹码分布近似', 'C', 'trend'));
    }
    if (t.ma20Test) {
      const mt = t.ma20Test;
      const above = t.ma20 != null && t.close >= t.ma20;
      points.push(`MA20 有效性检验（近60日）：${above ? `低点回踩 MA20±1% 并收回 ${mt.supHit} 次——${mt.supHit >= 3 ? '支撑经过多次验证，可信度高' : mt.supHit >= 1 ? '支撑有验证记录' : '无回踩验证记录，支撑成色未经检验'}` : `高点反抽 MA20±1% 并回落 ${mt.resHit} 次——${mt.resHit >= 3 ? '压力经过多次验证，反弹至 MA20 大概率遇阻' : mt.resHit >= 1 ? '压力有验证记录' : '无反抽验证记录'}`}`);
      if (above && mt.supHit >= 3) signals.push(sig('bull', `MA20 支撑经 ${mt.supHit} 次回踩验证有效，趋势防守位明确`, 1, '腾讯日K', 'B', 'trend', '55~65%'));
      if (!above && mt.resHit >= 3) signals.push(sig('bear', `MA20 压力经 ${mt.resHit} 次反抽验证有效，反弹即减仓窗口`, 1, '腾讯日K', 'B', 'trend', '55~65%'));
    }
    if (t.macd2nd) points.push(`MACD 二次钝化识别：${t.macd2nd.txt}（规则近似，C级口径）`);
    if (t.box && t.box.upValid) signals.push(sig('bull', `放量突破 40 日箱顶 ${t.box.h} 元（量比 ${t.volRatio}，量能确认通过）——箱体上沿转支撑`, 2, '腾讯日K', baseGrade, 'trend', '50~60%'));
    if (t.box && t.box.upFake) filtered.push(`收盘 ${t.close} 越过 40 日箱顶 ${t.box.h} 但量比仅 ${t.volRatio != null ? t.volRatio : '—'} <1.5——无量假突破，一律剔除（规则：突破类信号必须量能确认）`);
    if (t.box && t.box.dnValid) signals.push(sig('bear', `放量跌破 40 日箱底 ${t.box.l} 元（量比 ${t.volRatio}，量能确认通过）——平台破位`, 2, '腾讯日K', baseGrade, 'trend'));
    if (t.box && t.box.dnFake) filtered.push(`收盘 ${t.close} 跌破 40 日箱底 ${t.box.l} 但量能不足（量比 ${t.volRatio != null ? t.volRatio : '—'}）——疑似诱空破位，降级为观察项不计分`);
    if (t.boll && t.boll.squeeze) signals.push(sig('neu', `BOLL 带宽收口至近120日 ${t.boll.bwPct}% 分位，波动率挤压——变盘临近，方向未定，等待放量选择方向`, 1, '技术指标', 'B', 'trend'));

    /* ---- 信号生成（全部叠加量能确认 + 趋势/波动分层 + 可信度分级） ---- */
    // 趋势级信号
    if (t.bull && (t.slope20 == null || t.slope20 > 0)) {
      const strong = t.volRatio != null && t.volRatio >= 1.2;
      if (strong || t.rangeBound === false) signals.push(sig('bull', `均线多头排列（MA20 ${t.ma20} > MA60 ${t.ma60} > MA120 ${t.ma120}）且斜率向上，中长期趋势向上${strong ? '，量能确认（量比 ' + t.volRatio + '）' : ''}`, 2, '腾讯日K', baseGrade, 'trend', '50~60%'));
      else signals.push(sig('bull', `均线多头排列但量能未确认（量比 ${t.volRatio != null ? t.volRatio : '—'}），趋势成色降级`, 1, '腾讯日K', 'B', 'trend'));
    }
    if (t.arrState.indexOf('空头排列') >= 0) signals.push(sig('bear', `均线${t.arrState}，价格持续承压，中期趋势向下`, 2, '腾讯日K', baseGrade, 'trend', '50~60%'));
    if (t.ma20 != null && t.close < t.ma20) signals.push(sig('bear', `收盘价 ${t.close} 跌破 MA20(${t.ma20})，短线趋势转弱`, 1, '腾讯日K', 'B', 'swing'));
    if (w) { if (w.up) signals.push(sig('bull', `周线 MA10W(${w.ma10w}) > MA30W(${w.ma30w})，中期趋势向上`, 1, '腾讯周K', 'B', 'trend')); else signals.push(sig('bear', '周线 MA10W < MA30W，中期趋势向下，反弹持续性存疑', 1, '腾讯周K', 'B', 'trend')); }
    // 背离信号（C级近似识别）
    if (t.div.top) signals.push(sig('bear', `MACD 顶背离：${t.div.topDetail}`, 2, '技术指标·近似识别', 'C', 'trend', '40~55%'));
    if (t.div.bottom) signals.push(sig('bull', `MACD 底背离：${t.div.bottomDetail}`, 2, '技术指标·近似识别', 'C', 'trend', '40~55%'));
    // 波动级信号（短线噪声，计分减半）
    if (t.jHiDays >= 5) filtered.push(`KDJ 超买钝化 ${t.jHiDays} 日——钝化期超买信号失效，剔除（规则：钝化≥5日不单独作为卖出依据）`);
    else if (t.j > 100) signals.push(sig('bear', `KDJ-J 值 ${t.j} > 100，超买区（波动级信号，需趋势确认）`, 1, '技术指标', 'B', 'swing'));
    if (t.jLoDays >= 5) filtered.push(`KDJ 超卖钝化 ${t.jLoDays} 日——钝化期超卖信号失效，剔除（规则：下跌趋势中指标可长期钝化，接飞刀是主要亏损来源）`);
    else if (t.j < 0) signals.push(sig('bull', `KDJ-J 值 ${t.j} < 0，超卖区（波动级信号，需趋势确认）`, 1, '技术指标', 'B', 'swing'));
    if (t.rsi6 > 80) signals.push(sig('bear', `RSI(6) ${t.rsi6} > 80，短线超买`, 1, '技术指标', 'B', 'swing'));
    if (t.rsi6 < 20) signals.push(sig('bull', `RSI(6) ${t.rsi6} < 20，短线超卖`, 1, '技术指标', 'B', 'swing'));
    if (t.hist > 0 && t.hist < t.histPrev) signals.push(sig('bear', 'MACD 红柱开始缩短，多头动能衰减', 1, '技术指标', 'B', 'swing'));
    if (t.hist < 0 && t.hist > t.histPrev) signals.push(sig('bull', 'MACD 绿柱开始缩短，空头动能衰减', 1, '技术指标', 'B', 'swing'));
    // 量价信号（量能确认规则：突破类信号量比 <1.2 一律判弱势假信号，剔除并列清单）
    if (t.volRatio != null && t.volRatio >= 1.5 && base.px && base.px.chgPct > 3) signals.push(sig('bull', `量比 ${t.volRatio} 倍放量上涨，增量资金进场（量能确认通过）`, 1, '腾讯日K', baseGrade, 'trend'));
    if (t.volRatio != null && t.volRatio < 1.2 && base.px && base.px.chgPct > 3) filtered.push(`大涨 ${base.px.chgPct}% 但量比仅 ${t.volRatio} < 1.2——无量上涨判定为弱势假信号，不采信（规则：无量突破一律剔除）`);
    if (t.volRatio != null && t.volRatio < 0.8 && base.px && base.px.chgPct > 5) signals.push(sig('bear', `大涨但量比仅 ${t.volRatio}，缩量上涨动能存疑`, 1, '腾讯日K', 'B', 'swing'));
    if (t.volRatio != null && t.volRatio >= 1.5 && base.px && base.px.chgPct < -3) signals.push(sig('bear', `量比 ${t.volRatio} 倍放量下跌，筹码松动（量能确认通过）`, 1, '腾讯日K', baseGrade, 'trend'));
    // 区间位置信号
    if (t.pos52 != null && t.pos52 >= 90) signals.push(sig('bear', `处区间 ${t.pos52}% 分位，接近样本期顶部区域`, 1, '腾讯日K', 'B', 'trend'));
    if (t.pos52 != null && t.pos52 <= 10) signals.push(sig('bull', `处区间 ${t.pos52}% 分位，接近样本期底部区域`, 1, '腾讯日K', 'B', 'trend'));
    if (t.yearChg != null && t.yearChg >= 100) signals.push(sig('bear', `近一年已涨 ${t.yearChg}%，累计涨幅巨大、获利盘丰厚`, 1, '腾讯日K', 'B', 'trend'));
    // 乖离率极值
    if (t.bias20 != null && Math.abs(t.bias20) > 15) signals.push(sig(t.bias20 > 0 ? 'bear' : 'bull', `BIAS20 乖离率 ${t.bias20}%，严重偏离均线，均值回归概率上升`, 1, '技术指标', 'B', 'swing'));

    const summary = (t.bull
      ? `技术面偏多：${t.arrState}，MA20 斜率 ${slopeTxt}，${macdState}运行，${histState}；区间 ${t.pos52 != null ? t.pos52 + '%' : '—'} 分位。`
      : t.arrState.indexOf('空头') >= 0
      ? `技术面偏空：${t.arrState}，MA20 斜率 ${slopeTxt}，${macdState}运行；小级别反弹仅为超跌修复，非趋势反转（除非放量收复 MA20）。`
      : `技术面中性：${t.arrState}，${macdState}运行，${histState}；区间 ${t.pos52 != null ? t.pos52 + '%' : '—'} 分位。`)
      + (t.rangeBound ? ' 当前为震荡市，金叉死叉类信号已按规则剔除。' : '')
      + (filtered.length ? ` 已过滤假信号 ${filtered.length} 条。` : '')
      + (base.pxCheck ? ` 价格双源验证：${base.pxCheck.text}` : '');

    /* 结构化表格（指标/当前值/位置关系/信号，全部可对照行情软件复核） */
    const posRel = m => (m == null ? '—' : t.close >= m ? `价格 ${t.close} ≥ ${m}` : `价格 ${t.close} < ${m}（跌破）`);
    const maSig = (m, tag) => (m == null ? '—' : t.close >= m ? `🟢 站上${tag}` : `🔴 ${tag}空头`);
    const tables = [
      { title: `均线系统（${t.arrState} · MA20斜率 ${slopeTxt}）`, cols: ['指标', '当前值（' + t.date.slice(5) + '）', '价格位置关系', '多空信号'],
        rows: [['MA5', t.ma5 != null ? t.ma5 : '—', posRel(t.ma5), maSig(t.ma5, '超短')],
               ['MA10', t.ma10 != null ? t.ma10 : '—', posRel(t.ma10), maSig(t.ma10, '短线')],
               ['MA20', t.ma20 != null ? t.ma20 : '—', posRel(t.ma20), maSig(t.ma20, '短期')],
               ['MA60', t.ma60 != null ? t.ma60 : '—', posRel(t.ma60), maSig(t.ma60, '中期')],
               ['MA120', t.ma120 != null ? t.ma120 : '—', posRel(t.ma120), maSig(t.ma120, '中长期')],
               ['MA250', t.ma250 != null ? t.ma250 : '—（样本不足）', posRel(t.ma250), maSig(t.ma250, '长期')]],
        notes: [
          `乖离率：BIAS20 ${t.bias20 != null ? t.bias20 + '%' : '—'} / BIAS60 ${t.bias60 != null ? t.bias60 + '%' : '—'}${t.bias20 != null && Math.abs(t.bias20) > 15 ? '——严重偏离，警惕均值回归或趋势加速' : '（±15% 内为正常波动区间）'}。`,
          `缠绕度 ${t.entangle != null ? t.entangle + '%' : '—'}（<3% 且斜率走平 = 震荡市，当前：${t.rangeBound ? '震荡市，交叉信号无效' : '趋势市'}）。`
        ] },
      { title: `MACD（${macdState}运行 · ${t.hist > 0 ? '多方' : '空方'}动能${(t.hist > 0 && t.hist < t.histPrev) || (t.hist < 0 && t.hist > t.histPrev) ? '衰减' : '增强'}${t.histUpDays >= 10 || t.histDnDays >= 10 ? ' · 钝化' + Math.max(t.histUpDays, t.histDnDays) + '日' : ''}）`, cols: ['指标', '当前值', '信号'],
        rows: [['MACD 主线（DIF）', String(t.dif), t.dif < 0 ? '🔴 持续负值，空头主导' : '🟢 正值，多头主导'],
               ['趋势方向', macdState, t.dif < 0 && t.dea < 0 ? '🔴 中期趋势偏空' : t.dif > 0 && t.dea > 0 ? '🟢 中期趋势偏多' : '⚪ 方向切换区'],
               ['动量变化', `柱值 ${t.hist}（前值 ${t.histPrev}）`, t.hist > 0 ? (t.hist < t.histPrev ? '🔴 红柱缩短，多头动能衰减' : '🟢 红柱放大，多头动能增强') : (t.hist > t.histPrev ? '🟢 绿柱缩短，空头动能衰减' : '🔴 绿柱放大，空头动能增强')],
               ['背离结构', t.div.top ? '顶背离' : t.div.bottom ? '底背离' : '无', (t.div.top ? '🔴 ' + t.div.topDetail : t.div.bottom ? '🟢 ' + t.div.bottomDetail : '⚪ 近120根未见背离') + '（两段极值近似法，C级口径）']] },
      { title: 'KDJ / RSI / 量价（短线温度 + 量能确认）', cols: ['指标', '当前值', '信号'],
        rows: [['KDJ（K/D/J）', `${t.k} / ${t.d} / ${t.j}`, t.jHiDays >= 5 ? `⚪ J 连续 ${t.jHiDays} 日超买钝化，信号失效` : t.jLoDays >= 5 ? `⚪ J 连续 ${t.jLoDays} 日超卖钝化，信号失效` : t.j > 100 ? '🔴 J>100 超买区' : t.j < 0 ? '🟢 J<0 超卖区' : '⚪ 中性区'],
               ['RSI(6)', String(t.rsi6), t.rsi6 > 80 ? '🔴 超买' : t.rsi6 < 20 ? '🟢 超卖' : '⚪ 中性'],
               ['量价结构', `量比 ${t.volRatio != null ? t.volRatio : '—'} · ${t.volState || '—'}`, /放量上涨|放量突破/.test(t.volState || '') ? '🟢 量能确认' : /缩量上涨|滞涨/.test(t.volState || '') ? '🔴 量能不配合' : '⚪ 常态'],
               ['周线趋势（MA10W/MA30W）', w ? `${w.ma10w} / ${w.ma30w}` : '—', w ? (w.up ? '🟢 中期趋势向上' : '🔴 中期趋势向下') : '⚪ 数据不足']] },
      ...(t.boll || t.box || t.chips ? [{ title: 'BOLL / 箱体 / 筹码分布（V4 形态有效性校验层）', cols: ['维度', '数值', '判定'],
        rows: [
          ...(t.boll ? [['BOLL 上/中/下轨', `${t.boll.upper} / ${t.boll.mid} / ${t.boll.lower}`, t.boll.pctB != null ? (t.boll.pctB > 1 ? '🔴 %b ' + t.boll.pctB + ' 出轨超买' : t.boll.pctB < 0 ? '🟢 %b ' + t.boll.pctB + ' 破轨超卖' : '⚪ %b ' + t.boll.pctB + ' 轨内运行') : '—'],
            ['BOLL 带宽', `${t.boll.bw}%（近120日 ${t.boll.bwPct != null ? t.boll.bwPct + '%' : '—'} 分位）`, t.boll.squeeze ? '⚠️ 极度收口，变盘前兆' : '⚪ 常态波动']] : []),
          ...(t.box ? [['40日箱体', `[${t.box.l} ~ ${t.box.h}] 振幅 ${t.box.range}%`, t.box.upValid ? '🟢 放量有效突破箱顶' : t.box.upFake ? '🚫 无量假突破已剔除' : t.box.dnValid ? '🔴 放量有效跌破箱底' : t.box.dnFake ? '⚠️ 缩量破位存疑（诱空可能）' : '⚪ 箱体内运行']] : []),
          ...(t.chips ? [['筹码峰（量加权近似）', `${t.chips.peakP} 元 · 峰占比 ${t.chips.peakShare}% · 集中度 ${t.chips.concentration}%`, t.chips.concentration >= 50 ? '筹码集中' : '筹码分散'],
            ['获利盘/套牢盘', `${t.chips.profitPct}% / ${t.chips.trapPct}%`, t.chips.profitPct >= 90 ? '🔴 全盘获利，兑现压力' : t.chips.profitPct <= 10 ? '🟢 全盘套牢，抛压枯竭' : '⚪ 常态'],
            ['筹码峰迁移', t.chips.migration, t.chips.migration.indexOf('上移') >= 0 ? '🟢 成本重心抬高' : t.chips.migration.indexOf('下移') >= 0 ? '🔴 成本重心下沉' : '⚪ 稳定']] : [])
        ],
        notes: ['筹码分布为近120日 (H+L+C)/3 典型价 × 成交量 的 24 桶近似（C级口径），与券商筹码图存在口径差异，仅供方向参考。'] }] : [])
    ];
    return { summary, points, signals, filtered, tables,
      bounds: '边界：技术指标为右侧确认工具，对突发利空/利好无预测能力；背离与缠绕为近似识别（C级口径）；样本不足 120 根时长周期指标不可信。',
      confNote: '信号可信度口径：A=双源价格验证，B=单源权威数据，C=规则近似推断；波动级信号（超买超卖类）计分减半。胜率区间为规则经验口径，非统计回测。' };
  }

  /* ---------- 模块 ② 市场情绪（V3：五级量化评级） ---------- */
  async function modSentiment(base, task) {
    const points = [], signals = [];
    const scoreRows = [];
    let score = 50; // 中性基准分
    const br = base.mkt.br;
    if (base.stage) {
      points.push(`大盘情绪阶段：「${base.stage}」（涨停 ${br.limitUp} 家 / 封板率 ${br.sealRate}% / 最高 ${br.height} 板${Number.isFinite(br.broken) ? ' / 炸板 ' + br.broken + ' 家' : ''}，东财实盘数据，口径不含 ST）`);
      const stScore = { '发酵': 15, '修复': 5, '高潮': -5, '退潮': -20, '冰点': -25 }[base.stage] || 0;
      score += stScore;
      scoreRows.push(['大盘情绪阶段', base.stage, (stScore >= 0 ? '+' : '') + stScore]);
      if (base.stage === '发酵' || base.stage === '修复') signals.push(sig('bull', `大盘情绪「${base.stage}」，属顺势操作窗口`, 1, '东财情绪数据', 'A'));
      if (base.stage === '高潮') signals.push(sig('bear', '大盘情绪「高潮」，次日历来多分化（经验口径）', 2, '东财情绪数据', 'B'));
      if (base.stage === '退潮' || base.stage === '冰点') signals.push(sig('bear', `大盘情绪「${base.stage}」，亏钱效应环境`, 2, '东财情绪数据', 'A'));
    } else points.push('大盘情绪阶段：数据未获取，无法验证（不参与评分）');
    if (base.amount != null) {
      points.push(`两市成交额约 ${base.amount} 万亿（沪深实时行情加总）——量能是行情的燃料`);
      const amtScore = base.amount >= 1.5 ? 10 : base.amount < 0.8 ? -10 : 0;
      score += amtScore;
      scoreRows.push(['两市成交额', base.amount + ' 万亿', (amtScore >= 0 ? '+' : '') + amtScore]);
      if (base.amount >= 1.5) signals.push(sig('bull', `两市成交 ${base.amount} 万亿，流动性充裕`, 1, '腾讯行情', 'A'));
      else if (base.amount < 0.8) signals.push(sig('bear', `两市成交仅 ${base.amount} 万亿，流动性收紧`, 1, '腾讯行情', 'A'));
    } else points.push('两市成交额：未获取，无法验证');
    // 融资融券（资金情绪）
    try {
      const list = await dcGet('RPTA_WEB_RZRQ_GGMX', `(SCODE="${base.code6}")`, '&pageSize=6&sortColumns=DATE&sortTypes=-1');
      if (list.length) {
        const cur = list[0], prev = list[1];
        const rz = +(cur.RZYE / 1e8).toFixed(2);
        const d = prev ? +((cur.RZYE - prev.RZYE) / 1e8).toFixed(2) : null;
        const net = cur.RZMRE != null && cur.RZCHE != null ? +((cur.RZMRE - cur.RZCHE) / 1e8).toFixed(2) : null;
        points.push(`融资融券（东财 ${String(cur.DATE).slice(0, 10)}）：融资余额 ${rz} 亿${d != null ? '，较上日 ' + (d >= 0 ? '+' : '') + d + ' 亿' : ''}${net != null ? '，当日融资净' + (net >= 0 ? '买入' : '偿还') + ' ' + Math.abs(net) + ' 亿' : ''}${cur.RQYL != null ? '，融券余量 ' + cur.RQYL + ' 股' : ''}`);
        if (d != null && d > 0) { signals.push(sig('bull', `融资余额单日 +${d} 亿，杠杆资金在加仓`, 1, '东财两融', 'A')); score += 5; scoreRows.push(['融资余额变化', '+' + d + ' 亿', '+5']); }
        if (d != null && d < 0) { signals.push(sig('bear', `融资余额单日 ${d} 亿，杠杆资金在撤离`, 1, '东财两融', 'A')); score -= 5; scoreRows.push(['融资余额变化', d + ' 亿', '-5']); }
        base._rzrq = { date: String(cur.DATE).slice(0, 10), rz, d, net };
        base.quality.push({ name: '融资融券', ok: true, note: `截至 ${String(cur.DATE).slice(0, 10)}（两融数据 T+1 披露，存在一日滞后）` });
      } else { points.push('融资融券：该股非两融标的或无记录（如实标注）'); base.quality.push({ name: '融资融券', ok: false, note: '非两融标的或无记录' }); }
    } catch (e) { points.push('融资融券：接口获取失败，无法验证'); base.quality.push({ name: '融资融券', ok: false, note: '接口获取失败' }); }
    // 散户筹码（股东户数）
    const h = base.deep.holder;
    if (h) {
      points.push(`散户筹码（股东户数，东财披露）：${h.date} 为 ${h.num != null ? h.num.toLocaleString() : '—'} 户，较 ${h.prevDate} ${h.ratio != null ? (h.ratio > 0 ? '增加 ' + h.ratio + '%' : '减少 ' + Math.abs(h.ratio) + '%') : '变化未知'}——${h.ratio != null ? (h.ratio > 10 ? '户数激增，典型主力派发特征' : h.ratio > 0 ? '筹码趋于分散' : h.ratio < -10 ? '筹码快速集中' : '筹码趋于集中') : '需结合多期判断'}`);
      if (h.ratio != null && h.ratio >= 10) { signals.push(sig('bear', `股东户数激增 ${h.ratio}%，主力派发特征`, 2, '东财披露', 'A')); score -= 5; scoreRows.push(['股东户数变化', '+' + h.ratio + '%', '-5']); }
      else if (h.ratio != null && h.ratio <= -10) { signals.push(sig('bull', `股东户数减少 ${Math.abs(h.ratio)}%，筹码快速集中`, 1, '东财披露', 'A')); score += 5; scoreRows.push(['股东户数变化', h.ratio + '%', '+5']); }
      else if (h.ratio != null && h.ratio > 0) signals.push(sig('bear', `股东户数增加 ${h.ratio}%，筹码趋于分散`, 1, '东财披露', 'A'));
      else if (h.ratio != null) signals.push(sig('bull', `股东户数减少 ${Math.abs(h.ratio)}%，筹码趋于集中`, 1, '东财披露', 'A'));
    } else points.push('散户筹码（股东户数）：未检索到披露记录，无法验证');
    /* V4：换手率（腾讯行情 a[38] 真实字段）——个股热度量化 */
    if (base.px && base.px.turnover != null) {
      const to = base.px.turnover;
      points.push(`换手率：${to}%（腾讯行情实时字段）——${to >= 20 ? '极端高换手，筹码剧烈交换，多为情绪顶点或出货' : to >= 10 ? '高换手，短线博弈激烈' : to >= 3 ? '活跃区间' : '低换手，筹码沉淀/无人问津'}`);
      if (to >= 20) { signals.push(sig('bear', `换手率 ${to}% 极端水平，情绪透支特征`, 1, '腾讯行情', 'A', 'swing')); score -= 5; scoreRows.push(['换手率', to + '%', '-5']); }
      else if (to >= 5 && to < 15) { score += 3; scoreRows.push(['换手率', to + '%', '+3']); }
    } else points.push('换手率：行情字段未获取，无法验证');
    /* V4：主力资金流（东财 fflow 真实序列）——连续 3-5 日行为 + 主力/小单背离诱多识别 */
    const ff = base._fflow;
    if (ff) {
      points.push(`主力资金流（东财 ${ff.date}，近${ff.days} 日序列）：当日主力净流入 ${ff.todayMain} 亿 / 小单净流入 ${ff.todaySmall} 亿；近5日主力累计净${ff.sum5 >= 0 ? '流入' : '流出'} ${Math.abs(ff.sum5)} 亿；当前连续${ff.runDir === 'in' ? '净流入' : '净流出'} ${ff.runDays} 日（${ff.last5.map(x => x.d.slice(5) + ' ' + (x.main >= 0 ? '+' : '') + x.main).join(' / ')}）`);
      if (ff.runDir === 'in' && ff.runDays >= 3) { signals.push(sig('bull', `主力资金连续 ${ff.runDays} 日净流入（近5日累计 +${ff.sum5} 亿），连续行为确认非单日噪声`, 2, '东财资金流', 'A', 'trend', '50~58%')); score += 8; scoreRows.push(['主力连续净流入', ff.runDays + ' 日', '+8']); }
      if (ff.runDir === 'out' && ff.runDays >= 3) { signals.push(sig('bear', `主力资金连续 ${ff.runDays} 日净流出（近5日累计 ${ff.sum5} 亿），趋势性撤离`, 2, '东财资金流', 'A', 'trend', '50~58%')); score -= 8; scoreRows.push(['主力连续净流出', ff.runDays + ' 日', '-8']); }
      /* 诱多识别：主力流出 + 小单大幅流入 + 当日上涨 → 拉高出货嫌疑（规则推断 C级） */
      const up1 = base.px && base.px.chgPct != null && base.px.chgPct > 1;
      if (ff.todayMain < 0 && ff.todaySmall > 0 && up1) signals.push(sig('bear', `主力净流出 ${ff.todayMain} 亿但小单净流入 ${ff.todaySmall} 亿且股价上涨——典型主力出货散户接盘结构，诱多嫌疑（规则推断）`, 2, '东财资金流', 'C', 'swing'));
      if (ff.todayMain > 0 && ff.todaySmall < 0 && base.px && base.px.chgPct != null && base.px.chgPct < 0) signals.push(sig('bull', `股价下跌但主力净流入 ${ff.todayMain} 亿、小单流出——主力低位承接特征（规则推断）`, 1, '东财资金流', 'C', 'swing'));
    } else points.push('主力资金流：东财资金流通道未获取，连续资金行为维度失效（如实标注，降级为龙虎榜单日口径）');
    /* 北向资金：官方停披如实标注（反造假：不引用任何非官方北向估算值） */
    points.push('北向资金：2024-08 起交易所停止披露北向实时流向与每日净买卖额——本系统不引用任何第三方估算值，该维度不评分（如实标注）');
    /* V4：筹码结构并入情绪画像（量加权近似，详见技术模块口径） */
    const tc = base.deep.tech && base.deep.tech.chips;
    if (tc) points.push(`筹码结构（量加权近似 C级口径）：获利盘 ${tc.profitPct}% / 套牢盘 ${tc.trapPct}% / 集中度 ${tc.concentration}% / 峰迁移${tc.migration}——${tc.profitPct >= 90 ? '全盘获利，人人赚钱时警惕一致性兑现' : tc.profitPct <= 10 ? '全盘套牢，反弹即解套抛压' : '多空筹码交织'}`);
    /* 五级量化评级（量化口径：基准 50 分 + 分项加减，0-100 截断）
       V4：同步映射「恐慌贪婪指数」五档（同一分数系，双命名便于交叉理解） */
    score = Math.max(0, Math.min(100, score));
    const lv = score < 20 ? '极弱' : score < 40 ? '偏弱' : score < 60 ? '中性' : score < 80 ? '偏强' : '极强';
    const fg = score < 15 ? '极度恐惧' : score < 35 ? '恐惧' : score < 65 ? '中性' : score < 85 ? '贪婪' : '极度贪婪';
    const tables = [{ title: `情绪量化评级：${lv}（${score}/100）· 恐慌贪婪指数：「${fg}」`, cols: ['评分项', '观测值', '分值'], rows: scoreRows.length ? scoreRows : [['无有效观测项', '—', '基准 50 分不变']],
      notes: ['评级口径：<20 极弱 / 20-40 偏弱 / 40-60 中性 / 60-80 偏强 / ≥80 极强；基准分 50，各分项加减见表。',
        `恐慌贪婪映射：<15 极度恐惧 / 15-35 恐惧 / 35-65 中性 / 65-85 贪婪 / ≥85 极度贪婪——极度贪婪区反向警惕，极度恐惧区关注错杀（经验口径）。`] }];
    const bullN = signals.filter(s => s.side === 'bull').length, bearN = signals.filter(s => s.side === 'bear').length;
    return { summary: `市场情绪五级评级：「${lv}」（${score}/100，恐慌贪婪指数「${fg}」）；多头信号 ${bullN} 项 / 空头信号 ${bearN} 项；大盘阶段「${base.stage || '未知'}」。`,
      points, signals, tables, level: lv, score,
      bounds: '边界：被动资金/主动资金/诱多资金区分需要逐笔委托数据，浏览器通道不可达——本模块以两融、户数、龙虎榜席位性质近似刻画，对倒与虚假净流入无法从公开数据证伪，相关结论降权处理（如实标注）。' };
  }

  /* ---------- 模块 ③ 新闻舆情（V3：时间切片 + 通稿去重 + 影响分级） ---------- */
  function modNews(base, task) {
    const points = [], signals = [];
    const items = [];
    const stockName = task.name || (base.r && base.r.name) || '';
    /* 名称过滤：全网搜索是相关度排序，未提及本公司的泛行业/其他公司新闻一律剔除（反张冠李戴）；
       V5 增强：同名干扰消歧（如「中国长城」vs「中国长城资产」），剥离复合实体后无独立提及才算真相关 */
    let dropped = 0, nameConf = 0; const confSet = {};
    (base.web.news || []).forEach(n2 => {
      const mc = mentionReal(stockName, n2.title, n2.content);
      if (!mc.ok) { if (mc.kind === 'conf') { nameConf++; confSet[mc.conf] = 1; } else dropped++; return; }
      items.push({ title: n2.title, content: n2.content, media: n2.media, date: n2.date, url: n2.url, from: '全网检索' });
    });
    base.flashHits.forEach(n2 => {
      if (!mentionReal(stockName, n2.title, '').ok) return;
      items.push({ title: n2.title, content: '', media: n2.src || '快讯', date: (n2.date || '') + ' ' + (n2.time || ''), url: n2.url, from: '实时快讯' });
    });
    const cutoff = Date.now() - (task.cfg.newsDays || 30) * 864e5;
    const win = items.filter(n2 => { const t2 = Date.parse(String(n2.date).slice(0, 10).replace(/-/g, '/')); return !Number.isFinite(t2) || t2 >= cutoff; });
    /* 通稿去重（反造假：同一事件多媒体转载只计一次，避免重复通稿放大舆情占比） */
    const seen = {};
    let dupes = 0;
    const dedup = win.filter(n2 => {
      const key = n2.title.replace(/[\s《》「」【】]/g, '').slice(0, 15);
      if (seen[key]) { dupes++; return false; }
      seen[key] = 1; return true;
    });
    let pos = 0, neg = 0, neu = 0;
    /* V4：权威源白名单（监管/交易所/公司公告/证券三大报/主流财经媒体）——非权威源信号降 C 级（反自媒体噪声） */
    const AUTH_RE = /证监会|交易所|深交所|上交所|北交所|巨潮|公司公告|中国证券报|上海证券报|证券时报|证券日报|财联社|第一财经|每日经济新闻|每经|澎湃|界面|21世纪经济报道|经济观察报|央视|新华社|人民日报|财新|中国基金报|券商中国/;
    const stat = dedup.map(n2 => {
      const txt = n2.title + ' ' + (n2.content || '');
      const p = POS_KW.test(txt), g = NEG_KW.test(txt);
      const dir = (p && !g) ? 'pos' : (g && !p) ? 'neg' : 'neu';
      if (dir === 'pos') pos++; else if (dir === 'neg') neg++; else neu++;
      return Object.assign({ dir, auth: AUTH_RE.test(n2.media || '') }, n2);
    });
    const total = stat.length;
    const authN = stat.filter(x => x.auth).length;
    const authNeg = stat.filter(x => x.auth && x.dir === 'neg').length;
    const authPos = stat.filter(x => x.auth && x.dir === 'pos').length;
    /* 时间切片统计：当日 / 近3日 / 近7日（量化口径：按报道日期自然日） */
    const todayStr = DT.today();
    const slice = { d1: { pos: 0, neg: 0, neu: 0 }, d3: { pos: 0, neg: 0, neu: 0 }, d7: { pos: 0, neg: 0, neu: 0 } };
    stat.forEach(n2 => {
      const t2 = Date.parse(String(n2.date).slice(0, 10).replace(/-/g, '/'));
      if (!Number.isFinite(t2)) return;
      const age = Date.now() - t2;
      const ds = String(n2.date).slice(0, 10);
      if (ds === todayStr) slice.d1[n2.dir]++;
      if (age <= 3 * 864e5) slice.d3[n2.dir]++;
      if (age <= 7 * 864e5) slice.d7[n2.dir]++;
    });
    if (total) {
      const posPct = Math.round(pos / total * 100), negPct = Math.round(neg / total * 100);
      points.push(`舆情统计（近 ${task.cfg.newsDays} 天，共 ${total} 条真实报道/快讯${dupes ? `，已去重剔除 ${dupes} 条重复通稿` : ''}${dropped ? `，另剔除 ${dropped} 条未提及本公司的泛相关结果` : ''}${nameConf ? `，同名干扰剔除 ${nameConf} 条（「${Object.keys(confSet).slice(0, 2).join('」「')}」等名称包含本公司简称的其他实体，防张冠李戴）` : ''}）：正向 ${pos} 条（${posPct}%）/ 负向 ${neg} 条（${negPct}%）/ 中性 ${neu} 条（${100 - posPct - negPct}%）——关键词规则判定，可逐条点链接核对原文`);
      points.push(`权威源分级：权威媒体/监管源 ${authN} 条（正 ${authPos} / 负 ${authNeg}），非权威源 ${total - authN} 条——多空计分只采信权威源，非权威源仅作参考降 C 级（反自媒体噪声）`);
      points.push(`时间切片：当日 正${slice.d1.pos}/负${slice.d1.neg}/中${slice.d1.neu} · 近3日 正${slice.d3.pos}/负${slice.d3.neg}/中${slice.d3.neu} · 近7日 正${slice.d7.pos}/负${slice.d7.neg}/中${slice.d7.neu}${slice.d3.neg > 0 && slice.d3.pos === 0 ? '——近3日纯负向，舆情边际恶化' : slice.d3.pos > slice.d3.neg ? '——近3日正向占优，舆情边际转暖' : ''}`);
      stat.slice(0, 8).forEach(n2 => points.push(`${n2.dir === 'pos' ? '🟢' : n2.dir === 'neg' ? '🔴' : '⚪'} 《${n2.title}》（${n2.media} ${n2.date}）${n2.content ? '——' + n2.content : ''}`));
      if (negPct >= 40 && neg >= 2) signals.push(sig('bear', `舆情负向占比 ${negPct}%（${neg}/${total} 条），消息面压制明显${authNeg ? '' : '（全部为非权威源，降级参考）'}`, 2, '舆情统计', authNeg ? 'B' : 'C'));
      else if (posPct >= 50 && pos >= 2) signals.push(sig('bull', `舆情正向占比 ${posPct}%（${pos}/${total} 条），媒体聚焦强化人气${authPos ? '' : '（全部为非权威源，降级参考）'}`, 1, '舆情统计', authPos ? 'B' : 'C'));
      if (slice.d3.neg >= 2 && slice.d3.pos === 0) signals.push(sig('bear', `近3日舆情纯负向（负 ${slice.d3.neg} 条），边际恶化中`, 1, '舆情时间切片', authNeg ? 'B' : 'C'));
      if (base.flashHits.length) signals.push(sig('bull', `实时快讯今日提及 ${base.flashHits.length} 条，消息面有实时催化`, 1, '快讯流', 'B', 'swing'));
    } else {
      points.push(nameConf
        ? `近 ${task.cfg.newsDays} 天检索返回的结果全部为同名干扰（「${Object.keys(confSet).slice(0, 2).join('」「')}」等名称包含本公司简称的其他实体，共 ${nameConf} 条已剔除）——本公司无有效舆情，舆情维度记为中性、不纳入多空计分（如实标注，绝不把别家公司新闻算到本股头上）`
        : `近 ${task.cfg.newsDays} 天未检索到该股相关报道/快讯（东财全网搜索 + 工作台快讯流均无命中，如实标注）——无消息催化，舆情维度记为中性`);
    }
    /* 影响级别分类（短期情绪 / 中期逻辑 / 长期基本面） */
    const LV_KW = [
      { lv: '长期基本面影响', kw: /预增|预亏|预减|财报|业绩|净利|营收|毛利|产能|投产|亏损|扭亏/ },
      { lv: '中期逻辑影响', kw: /中标|签约|订单|获批|政策|补贴|合同|规划|批复|许可|专利/ },
      { lv: '短期情绪影响', kw: /涨停|跌停|龙虎榜|资金|概念|题材|异动|连板|游资/ }
    ];
    const lvOf = n2 => { const txt = n2.title + ' ' + (n2.content || ''); const hit = LV_KW.find(x => x.kw.test(txt)); return hit ? hit.lv : '短期情绪影响'; };
    /* TOP3 核心舆情事件（按负向>正向、影响级别权重排序，剔除无实质影响口水新闻） */
    const LVW = { '长期基本面影响': 3, '中期逻辑影响': 2, '短期情绪影响': 1 };
    const top3 = stat.slice().sort((a, b) => {
      const wa = (a.dir === 'neg' ? 2 : a.dir === 'pos' ? 1.5 : 0.5) * (LVW[lvOf(a)] || 1);
      const wb = (b.dir === 'neg' ? 2 : b.dir === 'pos' ? 1.5 : 0.5) * (LVW[lvOf(b)] || 1);
      return wb - wa;
    }).slice(0, 3).map(n2 => ({ title: n2.title, media: n2.media, date: n2.date, url: n2.url, dir: n2.dir, lv: lvOf(n2), content: n2.content || '' }));
    /* 检索概况 + 主题聚类（保留原结构） */
    const dates = stat.map(n2 => Date.parse(String(n2.date).slice(0, 10).replace(/-/g, '/'))).filter(Number.isFinite);
    const srcSet = {};
    stat.forEach(n2 => { if (n2.media) srcSet[n2.media] = 1; });
    const repr = dir => { const x = stat.find(n2 => n2.dir === dir); return x ? x.title : '—'; };
    const stats = {
      total, pos, neg, neu, dupes, dropped, nameConf, confNames: Object.keys(confSet).slice(0, 3), slice, authN, authPos, authNeg,
      range: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) + ' ~ ' + new Date(Math.max(...dates)).toISOString().slice(0, 10) : '—',
      sources: Object.keys(srcSet).slice(0, 6).join('、') || '—',
      repr: { pos: repr('pos'), neg: repr('neg'), neu: repr('neu') }
    };
    const BUCKETS = [
      { name: '业绩与财报', kw: /业绩|财报|净利|营收|预亏|预减|预增|扭亏|亏损|毛利/ },
      { name: '减持与解禁', kw: /减持|解禁|质押|爆仓/ },
      { name: '板块与概念', kw: /板块|概念|题材|芯片|军工|太赫兹|无人机|雷达|卫星/ },
      { name: '资金与龙虎榜', kw: /资金|主力|龙虎榜|净流入|净流出|融资|游资|涨停|跌停/ },
      { name: '政策与事件', kw: /政策|获批|中标|签约|合同|订单|处罚|立案|调研|公告/ }
    ];
    const IMPACT = {
      '业绩与财报': { neg: '⚠️ 强负面（长期基本面影响）：散户对「亏损/预减」极度敏感，易出现恐慌性质疑', pos: '✅ 正面（长期基本面影响）：业绩兑现强化持股信心，是中期逻辑的硬支撑', neu: '⚪ 中性：财报信息待市场消化' },
      '减持与解禁': { neg: '⚠️ 负面（中期逻辑影响）：产业资本退出信号压制估值，需盯减持比例与方式', pos: '✅ 正面：供给压力解除', neu: '⚪ 中性：供给端信息待观察' },
      '板块与概念': { neg: '⚠️ 负面（短期情绪影响）：所属概念系统性下跌形成拖累，个股难独善其身', pos: '✅ 正面（短期情绪影响）：概念板块情绪共振，个股享受题材溢价', neu: '⚪ 中性：板块轮动中的跟随者' },
      '资金与龙虎榜': { neg: '⚠️ 负面（短期情绪影响）：资金撤离信号，短期流动性承压', pos: '✅ 正面（短期情绪影响）：增量资金进场，短线动能强化', neu: '⚪ 中性：资金信号不明朗' },
      '政策与事件': { neg: '⚠️ 负面（中期逻辑影响）：监管/处罚类事件压制风险偏好', pos: '✅ 正面（中期逻辑影响）：政策或订单催化，提升未来预期', neu: '⚪ 中性：事件影响待确认' }
    };
    const themes = BUCKETS.map(bk => {
      const its = stat.filter(n2 => bk.kw.test(n2.title + ' ' + (n2.content || '')));
      if (!its.length) return null;
      const negN = its.filter(x => x.dir === 'neg').length, posN = its.filter(x => x.dir === 'pos').length;
      const dir = negN > posN ? 'neg' : posN > negN ? 'pos' : 'neu';
      const top = its[0];
      const mDelta = (top.content || '').match(/[^。；]*(同比|环比|收窄|扩大|增长|下降|减少|增加)[^。；]*/);
      return {
        name: bk.name, count: its.length, dir,
        src: (top.media || '') + (top.date ? '（' + String(top.date).slice(0, 10) + '）' : ''),
        title: top.title,
        content: top.content || top.title,
        delta: mDelta ? mDelta[0].slice(0, 80) : '',
        impact: (IMPACT[bk.name] || {})[dir] || '⚪ 中性：影响待观察'
      };
    }).filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 3);
    let concl = '';
    if (total) {
      const negPct = Math.round(neg / total * 100), posPct = Math.round(pos / total * 100);
      if (negPct >= 40) concl = `结论：负面报道占比 ${negPct}%，正面信号稀少，市场整体情绪承压严重。`;
      else if (posPct >= 50) concl = `结论：正面报道占比 ${posPct}%，舆情偏暖，媒体聚焦强化市场关注。`;
      else concl = `结论：正负交织（正 ${posPct}% / 负 ${negPct}%），舆情分歧明显，以中性观察为主。`;
    }
    return { summary: total ? `舆情画像：正向 ${pos} / 负向 ${neg} / 中性 ${neu}（共 ${total} 条${dupes ? '，去重 ' + dupes + ' 条通稿' : ''}，正负同等权重统计）。` : '舆情中性：检索窗口内无相关报道（如实标注）。',
      points, signals, items: stat.slice(0, 8), stats, themes, concl, top3,
      bounds: '边界：关键词规则判定存在误分类率（经验误差约 ±10%），逐条附原文链接供人工复核；自媒体与过期旧闻已通过来源与时间窗过滤，但无法 100% 剔除——残留噪声以「中性」计，不进多空信号。' };
  }

  /* ---------- 模块 ④ 基本面（V3：扣非剥离 + 时效校验 + 隐雷扫描边界） ---------- */
  async function modFundamental(base, task) {
    const points = [], signals = [];
    const f = base.web.fund, p = base.web.predict, v = base.deep.val;
    if (f) {
      /* 财报时效校验：披露日距今 >120 天 → 数据滞后警示（误差溯源） */
      const noticeT = Date.parse(String(f.notice || '').replace(/-/g, '/'));
      const ageDays = Number.isFinite(noticeT) ? Math.round((Date.now() - noticeT) / 864e5) : null;
      if (ageDays != null && ageDays > 120) points.push(`⚠️ 财报时效警示：最新财报披露于 ${ageDays} 天前（${f.notice}），数据滞后明显，基本面结论置信度降级`);
      points.push(`最新财报（东财 · ${f.datatype || f.qdate}${f.notice ? ' · ' + f.notice + ' 披露' : ''}）：营收 ${f.rev != null ? f.rev + ' 亿' : '—'}（同比 ${f.revYoy != null ? (f.revYoy > 0 ? '+' : '') + f.revYoy + '%' : '—'}），归母净利 ${f.np != null ? f.np + ' 亿' : '—'}（同比 ${f.npYoy != null ? (f.npYoy > 0 ? '+' : '') + f.npYoy + '%' : '—'}）${f.roe != null ? '，ROE ' + f.roe + '%' : ''}${f.gross != null ? '，毛利率 ' + f.gross + '%' : ''}${f.board ? '，所属板块：' + f.board : ''}`);
      if (f.npYoy != null && f.npYoy >= 30) signals.push(sig('bull', `归母净利同比 +${f.npYoy}%，业绩高增长托底`, 2, '东财财报', 'A'));
      else if (f.npYoy != null && f.npYoy < 0) signals.push(sig('bear', `归母净利同比 ${f.npYoy}%，基本面恶化`, 2, '东财财报', 'A'));
      if (f.revYoy != null && f.revYoy >= 20) signals.push(sig('bull', `营收同比 +${f.revYoy}%，收入端真实扩张`, 1, '东财财报', 'A'));
      if (f.roe != null && f.roe >= 10) signals.push(sig('bull', `ROE ${f.roe}%，股东回报效率良好`, 1, '东财财报', 'A'));
      if (f.gross != null && f.gross < 15) signals.push(sig('bear', `毛利率仅 ${f.gross}%，主业盈利空间单薄`, 1, '东财财报', 'A'));
    } else points.push('最新财报：未检索到（次新股或接口无记录，如实标注），盈利与估值维度部分失效');
    /* 扣非净利润剥离（反财报修饰）：动态探测报表全字段中的扣非键，探测不到如实标注 */
    try {
      const l = await dcGet('RPT_LICO_FN_CPD', `(SECURITY_CODE="${base.code6}")`, '&pageSize=1&sortColumns=NOTICE_DATE&sortTypes=-1');
      const d = l[0];
      if (d) {
        const kfKey = Object.keys(d).find(k => /KCFJCXSYJLR$|DEDUCT_PARENT_NETPROFIT/i.test(k));
        const kfYoyKey = Object.keys(d).find(k => /KCFJCXSYJLRTZ|DEDUCT.*YOY/i.test(k));
        if (kfKey && d[kfKey] != null) {
          const kf = +(d[kfKey] / 1e8).toFixed(2);
          const kfYoy = kfYoyKey && d[kfYoyKey] != null ? +(+d[kfYoyKey]).toFixed(1) : null;
          const nonRecur = f && f.np != null ? +(f.np - kf).toFixed(2) : null;
          points.push(`扣非净利润（剥离非经常性损益，东财同报表）：${kf} 亿${kfYoy != null ? '（同比 ' + (kfYoy > 0 ? '+' : '') + kfYoy + '%）' : ''}${nonRecur != null ? '；非经常性损益约 ' + nonRecur + ' 亿' + (Math.abs(nonRecur) > Math.abs(kf) * 0.5 && kf > 0 ? '——⚠️ 利润水分占比高，警惕一次性收益粉饰' : kf < 0 && f && f.np > 0 ? '——⚠️ 归母盈利但扣非亏损，主业实际亏损，典型修饰性财报' : '（占比正常）') : ''}`);
          if (kf < 0 && f && f.np != null && f.np > 0) signals.push(sig('bear', `扣非净利润 ${kf} 亿亏损而归母净利为正——主业实际亏损，盈利靠非经常性损益`, 2, '东财财报·扣非', 'A'));
          else if (kfYoy != null && kfYoy >= 30 && kf > 0) signals.push(sig('bull', `扣非净利润同比 +${kfYoy}%，主业真实增长（非粉饰）`, 2, '东财财报·扣非', 'A'));
        } else {
          points.push('扣非净利润：当前报表未披露扣非字段（浏览器通道能力边界）——请对照年报原文「扣非净利润」科目人工核验，本系统不编造该值');
        }
      }
      base.quality.push({ name: '扣非净利润字段', ok: !!(l[0] && Object.keys(l[0]).some(k => /KCFJCXSYJLR$|DEDUCT_PARENT/i.test(k))), note: '动态字段探测' });
    } catch (e) { points.push('扣非净利润：接口获取失败，无法验证'); }
    if (p) {
      points.push(`业绩预告（${p.notice} 披露，报告期 ${p.reportdate || '—'}）：预计净利 ${p.lo != null ? p.lo : '—'}~${p.hi != null ? p.hi : '—'} 亿元，同比 ${p.incLo != null ? p.incLo + '%' : '—'}~${p.incHi != null ? p.incHi + '%' : '—'}${p.content ? '——' + p.content : ''}`);
      if (p.incLo != null && p.incLo > 0) signals.push(sig('bull', `业绩预告预增（同比 +${p.incLo}%~+${p.incHi}%），业绩兑现可见`, 2, '东财业绩预告', 'A'));
      else if (p.incHi != null && p.incHi < 0) signals.push(sig('bear', `业绩预告预减（同比 ${p.incLo}%~${p.incHi}%），业绩证伪风险`, 2, '东财业绩预告', 'A'));
    } else points.push('业绩预告：当前无在披露期预告（如实标注）');
    if (v) {
      /* V5 失真识别：PE>200 或 ≤0 属微利/亏损边缘失真——此时 PE 数值及其历史分位都不作估值锚，
         以 PB/PS 为主锚（中国长城实测 PE(TTM) 2369.7，系微利失真而非「历史低位低估」） */
      const peBad = v.pe != null && (v.pe > 200 || v.pe <= 0);
      const pegBad = v.peg != null && (v.peg > 10 || v.peg < 0);
      points.push(`估值（东财 ${v.date} 收盘，百分位基于近一年 ${v.days} 个交易日真实序列）：PE(TTM) ${v.pe != null ? v.pe : '—（亏损股不适用）'}${peBad ? '——微利/亏损边缘，PE 数值失真，其历史分位同步失效，不作估值锚（如实标注）' : v.pePct != null ? ' · 近一年 ' + v.pePct + '% 分位' : ''}；PB ${v.pb != null ? v.pb : '—'}${v.pbPct != null ? ' · ' + v.pbPct + '% 分位' : ''}；PS ${v.ps != null ? v.ps : '—'}；PEG ${v.peg != null ? v.peg + (pegBad ? '（失真，不采用）' : '') : '—'}；总市值 ${v.mcap != null ? v.mcap + ' 亿' : '—'}`);
      if (!peBad && v.pePct != null && v.pePct >= 80) signals.push(sig('bear', `PE(TTM) ${v.pe} 处近一年 ${v.pePct}% 分位，估值历史极高位`, 2, '东财估值', 'A'));
      else if (!peBad && v.pePct != null && v.pePct <= 20) signals.push(sig('bull', `PE(TTM) ${v.pe} 处近一年 ${v.pePct}% 分位，估值历史低位`, 1, '东财估值', 'A'));
      if (peBad) signals.push(sig('bear', `PE(TTM) ${v.pe} 属微利失真——盈利极薄，估值失去盈利锚，实为资产/筹码定价，不能用 PE 分位论证低估`, 1, '东财估值·失真识别', 'B'));
      if (v.pbPct != null && v.pbPct >= 80) signals.push(sig('bear', `PB ${v.pb} 处近一年 ${v.pbPct}% 分位，资产端估值极高位`, 1, '东财估值', 'A'));
      if (v.pe == null && f && f.np != null && f.np < 0) signals.push(sig('bear', '亏损股无 PE 估值锚，纯筹码博弈属性', 1, '东财估值', 'B'));
    } else points.push('估值序列：未获取（如实标注），PE/PB 历史百分位无法计算');
    /* V4：全市场横向分位（纵向历史分位之外的第二锚，防止「全行业低估」误判为「个股低估」）
       V5：PE 失真（微利/亏损边缘）时不参与横向比较，解读以 PB 为锚 */
    if (v && (v.pe != null || v.pb != null)) {
      const peBad = v.pe != null && (v.pe > 200 || v.pe <= 0);
      try {
        const snap = await mktValSnapshot();
        const peM = pctOf(snap.pes, v.pe), pbM = pctOf(snap.pbs, v.pb);
        const midPe = snap.pes.length ? +snap.pes[Math.floor(snap.pes.length / 2)].toFixed(1) : null;
        const midPb = snap.pbs.length ? +snap.pbs[Math.floor(snap.pbs.length / 2)].toFixed(2) : null;
        const pbRead = pbM != null && v.pbPct != null
          ? (pbM >= 70 && v.pbPct <= 30 ? `PB 锚解读：自身历史 ${v.pbPct}% 分位（中低位）但处全市场 ${pbM}% 分位（偏高）——相对全市场并不便宜，「低估」结论不成立` : pbM <= 30 && v.pbPct <= 30 ? `PB 锚解读：自身历史 ${v.pbPct}% 分位 + 全市场 ${pbM}% 分位双低——低估结论双锚确认` : pbM >= 70 && v.pbPct >= 70 ? `PB 锚解读：自身历史 ${v.pbPct}% 分位 + 全市场 ${pbM}% 分位双高——高估结论双锚确认` : `PB 锚解读：自身历史 ${v.pbPct}% 分位 vs 全市场 ${pbM}% 分位，方向一致`)
          : 'PB 样本不足仅作参考';
        points.push(`全市场横向对比（东财 ${snap.date} 全A快照，PE 样本 ${snap.pes.length} 只 / PB 样本 ${snap.pbs.length} 只，已剔 PE>500、PB>100 失真值）：全A中位数 PE ${midPe != null ? midPe : '—'} / PB ${midPb != null ? midPb : '—'}；本股 PE ${peBad ? '微利失真，不参与横向比较' : peM != null ? '处全市场 ' + peM + '% 分位' : '—（亏损无PE）'}、PB 处 ${pbM != null ? pbM + '%' : '—'} 分位——${peBad ? pbRead : peM != null && v.pePct != null ? (peM < 30 && v.pePct < 30 ? '纵向+横向双低，低估结论双锚确认' : peM >= 70 && v.pePct <= 30 ? '自身历史低位但全市场高位——行业系统性溢价，低估结论存疑' : peM <= 30 && v.pePct >= 70 ? '全市场低位但自身历史高位——自身经营改善定价中，需辨真伪' : '纵横两锚方向一致') : pbRead}`);
        if (!peBad && peM != null && peM >= 90) signals.push(sig('bear', `PE 处全市场 ${peM}% 分位（全A中位数 ${midPe}），横向估值极高`, 1, '东财全市场快照', 'A'));
        else if (!peBad && peM != null && peM <= 10) signals.push(sig('bull', `PE 处全市场 ${peM}% 分位（全A中位数 ${midPe}），横向估值极低`, 1, '东财全市场快照', 'A'));
        if (pbM != null && pbM >= 90) signals.push(sig('bear', `PB 处全市场 ${pbM}% 分位（全A中位数 ${midPb}），横向资产端估值极高`, 1, '东财全市场快照', 'A'));
      } catch (e) { points.push('全市场横向对比：快照获取失败，无法验证（横向分位维度失效，如实标注）'); }
    }
    /* 隐雷扫描能力边界（不编造：浏览器通道无实测可达的资产负债表明细报表） */
    points.push('隐雷扫描（现金流恶化/应收账款激增/存货积压/商誉风险）：浏览器数据通道无实测可达的资产负债表明细接口——本系统不编造这些科目数值；请对照最新年报/季报「经营现金流净额、应收账款、存货、商誉」四个科目人工核验（能力边界，如实标注）');
    const bullN = signals.filter(s => s.side === 'bull').length, bearN = signals.filter(s => s.side === 'bear').length;
    return { summary: `基本面维度录得多头信号 ${bullN} 项 / 空头信号 ${bearN} 项${f ? '；最新报告期：' + (f.datatype || f.qdate) : ''}。`,
      points, signals,
      bounds: '边界：财报为披露口径存在滞后；扣非字段依赖报表披露完整性；现金流/应收/存货/商誉四科目浏览器通道不可达，已如实标注需人工核验；行业均值横向对比需行业全样本数据，超出当前通道能力。' };
  }

  /* ---------- 模块 ⑤ 政策分析（V3：业务匹配度 + 落地阶段分级） ---------- */
  async function modPolicy(base, task) {
    const points = [], signals = [];
    const POL = /央行|国务院|财政部|发改委|证监会|工信部|国常会|政治局|降准|降息|LPR|MLF|专项债|产业基金|补贴|规划|行动方案|指导意见/;
    const GEO = /关税|制裁|出口管制|地缘|冲突|军演|协议|谈判/;
    /* 落地阶段判定：已落地 / 预期 / 传闻（传闻不计分，仅提示） */
    const stageOf = txt => /消息称|传闻|据传|有望|或将|拟|征求意见/.test(txt) ? '传闻/预期（不计分）'
      : /印发|落地|实施|批复|中标|签约|公告|正式|启动|获批/.test(txt) ? '已落地' : '政策预期';
    const flash = base.flashItems || [];
    const polHits = flash.filter(x => POL.test(x.title)).slice(0, 4);
    const geoHits = flash.filter(x => GEO.test(x.title)).slice(0, 3);
    const board = base.web.fund && base.web.fund.board;
    const stockName = task.name || '';
    let indNews = [];
    try { indNews = await searchNews((board || task.name || '') + ' 政策', 4); } catch (e) {}
    /* 业务匹配度分级：直接相关（命中公司名）/ 行业相关（命中板块词）/ 宏观背景（泛政策） */
    const matchLv = txt => stockName && txt.indexOf(stockName) >= 0 ? '直接相关'
      : board && txt.indexOf(board.replace(/板块$/, '')) >= 0 ? '行业相关' : '宏观背景';
    if (polHits.length) {
      points.push(`宏观政策（实时快讯匹配 ${polHits.length} 条）：${polHits.map(x => `《${x.title}》(${x.date || ''} · ${matchLv(x.title)} · ${stageOf(x.title)})`).join('；')}——匹配度为关键词规则判定，具体业务影响需人工确认`);
      polHits.forEach(x => {
        const lv2 = matchLv(x.title), st = stageOf(x.title);
        if (lv2 === '直接相关' && st === '已落地') signals.push(sig('bull', `政策直接命中本公司且已落地：《${x.title.slice(0, 30)}》`, 1, '快讯流', 'B'));
      });
    } else points.push('宏观政策：今日快讯流中未匹配到「央行/国务院/财政部/证监会/降准降息」类条目（如实标注）');
    if (indNews.length) {
      points.push(`行业政策（全网检索「${board || task.name} 政策」${indNews.length} 条）：${indNews.map(n2 => `《${n2.title}》(${n2.media} ${n2.date} · ${stageOf(n2.title + n2.content)})`).join('；')}`);
      const real = indNews.filter(n2 => stageOf(n2.title + n2.content) !== '传闻/预期（不计分）');
      const posN = real.filter(n2 => POS_KW.test(n2.title + n2.content)).length;
      const negN = real.filter(n2 => NEG_KW.test(n2.title + n2.content)).length;
      if (posN > negN && posN >= 1) signals.push(sig('bull', `行业政策面检索偏暖（${posN} 条正向落地信息，如《${indNews[0].title}》）`, 1, '全网检索', 'B'));
      if (negN > posN && negN >= 1) signals.push(sig('bear', `行业政策面检索偏紧（${negN} 条负向落地信息）`, 1, '全网检索', 'B'));
    } else points.push(`行业政策：全网检索「${board || task.name || '该股'} 政策」无有效结果（如实标注）`);
    if (geoHits.length) points.push(`地缘/国际事件（快讯匹配 ${geoHits.length} 条）：${geoHits.map(x => `《${x.title}》`).join('；')}——对该股产业链的影响需人工判断，不计入自动评分`);
    else points.push('地缘/国际事件：快讯流中未匹配到直接相关条目（如实标注）');
    if (!signals.length) points.push('政策面结论：当前无强相关政策信号命中，记为中性——政策维度以「无利空」处理，不作为加分项');
    return { summary: signals.length ? `政策面录得${signals[0].side === 'bull' ? '偏多' : '偏空'}信号：${signals[0].text}` : '政策面中性：未检索到强相关政策信号（如实标注，未编造）。',
      points, signals, items: indNews.slice(0, 4),
      bounds: '边界：政策-业务匹配度为关键词规则判定（直接/行业/宏观三级），补贴变动对利润的具体增厚幅度需对照公司公告测算，本系统不做泛行业空泛解读；传闻类一律不计分。' };
  }

  /* ---------- 模块 ⑥ 游资追踪（V3：连续行为 + 意图推断 + 反虚假龙虎榜） ---------- */
  async function modCapital(base, task) {
    const points = [], signals = [];
    let hist = [];
    // 今日龙虎榜（全市场榜命中）
    if (base.lb) {
      points.push(`今日龙虎榜（东财 ${base.mkt.lhb.date}）：净${base.lb.net >= 0 ? '买入' : '卖出'} ${Math.abs(base.lb.net)} 亿${base.lb.reason ? '（' + base.lb.reason + '）' : ''}${base.lb.inst ? '，' + base.lb.inst : ''}`);
      if (base.lb.net >= 0) signals.push(sig('bull', `龙虎榜净买入 ${base.lb.net} 亿，大资金进场（单日口径，需连续验证）`, 1, '东财龙虎榜', 'A', 'swing'));
      else signals.push(sig('bear', `龙虎榜净卖出 ${Math.abs(base.lb.net)} 亿，大资金兑现离场（单日口径）`, 2, '东财龙虎榜', 'A', 'swing'));
    } else points.push('今日龙虎榜：未上榜（如实标注）——无当日大资金公开席位信号');
    // 历史龙虎榜：连续行为分析（反「单日定结论」）
    try {
      hist = await dcGet('RPT_DAILYBILLBOARD_DETAILS', `(SECURITY_CODE="${base.code6}")`, '&pageSize=12&sortColumns=TRADE_DATE&sortTypes=-1');
      if (hist.length) {
        const recent = hist[0];
        const d90 = Date.now() - 90 * 864e5;
        const cnt90 = hist.filter(x => Date.parse(String(x.TRADE_DATE).slice(0, 10).replace(/-/g, '/')) >= d90).length;
        const daysSince = Math.round((Date.now() - Date.parse(String(recent.TRADE_DATE).slice(0, 10).replace(/-/g, '/'))) / 864e5);
        points.push(`历史上榜：近一年龙虎榜记录 ${hist.length >= 12 ? '12+ ' : hist.length} 次，近90日上榜 ${cnt90} 次，最近一次 ${String(recent.TRADE_DATE).slice(0, 10)}（${daysSince} 天前，当日涨跌 ${recent.CHANGE_RATE != null ? recent.CHANGE_RATE + '%' : '—'}，换手 ${recent.TURNOVERRATE != null ? recent.TURNOVERRATE + '%' : '—'}${recent.EXPLAIN ? '，' + recent.EXPLAIN : ''}）——${cnt90 >= 3 ? '游资持续活跃' : daysSince > 60 ? '游资已长期未光顾，历史席位参考意义衰减' : '游资间歇性参与'}`);
        if (recent.EXPLAIN && /机构.*买入/.test(recent.EXPLAIN)) signals.push(sig('bull', `最近一次龙虎榜「${recent.EXPLAIN}」，机构席位买入（${daysSince} 天前）`, 1, '东财龙虎榜', 'A'));
        if (recent.EXPLAIN && /机构.*卖出/.test(recent.EXPLAIN)) signals.push(sig('bear', `最近一次龙虎榜「${recent.EXPLAIN}」，机构席位卖出（${daysSince} 天前）`, 1, '东财龙虎榜', 'A'));
        base.quality.push({ name: '历史龙虎榜', ok: true, note: `近一年 ${hist.length} 次，最近 ${daysSince} 天前` });
      } else { points.push('历史龙虎榜：近一年无上榜记录（如实标注）——游资关注度低'); base.quality.push({ name: '历史龙虎榜', ok: false, note: '近一年无上榜记录' }); }
    } catch (e) { points.push('历史龙虎榜：接口获取失败，无法验证'); base.quality.push({ name: '历史龙虎榜', ok: false, note: '接口获取失败' }); }
    /* V4：连续资金行为摘要（fflow 已在情绪模块计分，此处仅展示，避免重复加权） */
    if (base._fflow) {
      const ff = base._fflow;
      points.push(`主力资金连续行为（东财 ${ff.date}）：当前连续${ff.runDir === 'in' ? '净流入' : '净流出'} ${ff.runDays} 日，近5日累计净${ff.sum5 >= 0 ? '流入' : '流出'} ${Math.abs(ff.sum5)} 亿——连续口径优先于单日龙虎榜（该维度信号计分见市场情绪模块，此处不重复加权）`);
    }
    /* V4：席位风格校验——上榜日 × 真实K线次日表现（识别一日游砸盘/锁仓/溢价，不以单日龙虎榜定结论） */
    const tech0 = base.deep.tech;
    if (hist.length && tech0 && tech0.seq) {
      const d0 = String(hist[0].TRADE_DATE).slice(0, 10);
      const idx = tech0.seq.findIndex(b => b.d === d0);
      if (idx >= 0 && idx + 1 < tech0.seq.length) {
        const b0 = tech0.seq[idx], b1 = tech0.seq[idx + 1];
        const nextChg = +(((b1.c / b0.c) - 1) * 100).toFixed(2);
        points.push(`席位风格校验（最近上榜日 ${d0} × 次日 ${b1.d} 真实K线）：次日涨跌 ${nextChg > 0 ? '+' : ''}${nextChg}%——${nextChg <= -3 ? '次日大跌，上榜席位呈一日游砸盘特征，席位溢价为负' : nextChg >= 3 ? '次日继续大涨，席位有锁仓/号召力特征' : '次日平稳，席位风格中性'}（C级规则推断，单一样本有限）`);
        if (nextChg <= -3) signals.push(sig('bear', `上榜次日大跌 ${nextChg}%（K线实证），席位一日游砸盘特征，跟榜风险高`, 1, '龙虎榜×K线', 'B', 'swing'));
        else if (nextChg >= 3) signals.push(sig('bull', `上榜次日续涨 +${nextChg}%（K线实证），席位有溢价号召力`, 1, '龙虎榜×K线', 'B', 'swing'));
      } else if (idx < 0) points.push('席位风格校验：最近上榜日超出K线样本窗口，无法校验次日表现（如实标注）');
    }
    // 营业部席位（识别拉萨散户席位/机构席位；对倒与假机构识别为能力边界，如实标注）
    try {
      const seats = await dcGet('RPT_BILLBOARD_DAILYDETAILSBUY', `(SECURITY_CODE="${base.code6}")`, '&pageSize=40&sortColumns=TRADE_DATE&sortTypes=-1');
      if (seats.length) {
        const lastDate = String(seats[0].TRADE_DATE).slice(0, 10);
        const latest = seats.filter(s => String(s.TRADE_DATE).slice(0, 10) === lastDate);
        const top = latest.slice().sort((a, b) => Math.abs(b.NET || 0) - Math.abs(a.NET || 0)).slice(0, 5);
        const fmt = s => `${s.OPERATEDEPT_NAME}${/拉萨/.test(s.OPERATEDEPT_NAME) ? '（散户集中营席位）' : /机构专用/.test(s.OPERATEDEPT_NAME) ? '（机构席位）' : /量化|华鑫|华泰总部/.test(s.OPERATEDEPT_NAME) ? '（疑似量化席位）' : ''} 净${(s.NET || 0) >= 0 ? '买' : '卖'} ${(Math.abs(s.NET || 0) / 1e8).toFixed(2)} 亿`;
        points.push(`最近上榜日 ${lastDate} 营业部席位（按净额排序）：${top.map(fmt).join('；')}`);
        const lasa = latest.filter(s => /拉萨/.test(s.OPERATEDEPT_NAME)).length;
        const inst = latest.filter(s => /机构专用/.test(s.OPERATEDEPT_NAME)).length;
        if (lasa >= 2) signals.push(sig('bear', `最近上榜日拉萨系席位 ${lasa} 个——散户接力特征，机构游资参与度低`, 1, '东财席位', 'A'));
        if (inst >= 2) signals.push(sig('bull', `最近上榜日机构专用席位 ${inst} 个——机构真实参与`, 1, '东财席位', 'A'));
        /* 资金意图推断（C级规则推断，非真实席位穿透，报告中如实标注） */
        const tech = base.deep.tech;
        if (base.lb && tech) {
          const posLow = tech.pos52 != null && tech.pos52 <= 30;
          const posHigh = tech.pos52 != null && tech.pos52 >= 70;
          if (base.lb.net > 0 && posLow) signals.push(sig('bull', `资金意图推断：低位净买入 ${base.lb.net} 亿，疑似试盘/建仓（规则推断，非席位穿透）`, 1, '规则引擎推断', 'C', 'swing'));
          if (base.lb.net < 0 && posHigh) signals.push(sig('bear', `资金意图推断：高位净卖出 ${Math.abs(base.lb.net)} 亿，疑似出货兑现（规则推断，非席位穿透）`, 1, '规则引擎推断', 'C', 'swing'));
        }
      } else points.push('营业部席位：无明细记录（如实标注）');
    } catch (e) { points.push('营业部席位：接口获取失败，无法验证'); }
    // 大宗交易
    try {
      const bt = await dcGet('RPT_DATA_BLOCKTRADE', `(SECURITY_CODE="${base.code6}")`, '&pageSize=10&sortColumns=TRADE_DATE&sortTypes=-1');
      if (bt.length) {
        const half = Date.now() - 180 * 864e5;
        const recent = bt.filter(x => Date.parse(String(x.TRADE_DATE).slice(0, 10).replace(/-/g, '/')) >= half);
        if (recent.length) {
          const amt = recent.reduce((s, x) => s + (x.DEAL_AMT || 0), 0) / 1e8;
          const avgPrem = recent.reduce((s, x) => s + (x.PREMIUM_RATIO || 0), 0) / recent.length * 100;
          points.push(`大宗交易（近半年 ${recent.length} 笔，东财）：合计成交约 ${amt.toFixed(2)} 亿，平均${avgPrem >= 0 ? '溢价' : '折价'} ${Math.abs(avgPrem).toFixed(1)}%——${avgPrem <= -5 ? '深度折价大宗需警惕变相减持' : avgPrem >= 0 ? '溢价大宗显示接盘资金意愿' : '折价幅度正常'}`);
          if (avgPrem <= -5) signals.push(sig('bear', `近半年大宗平均折价 ${Math.abs(avgPrem).toFixed(1)}%，疑似变现通道`, 1, '东财大宗', 'A'));
        } else points.push('大宗交易：近半年无记录（最近一笔 ' + String(bt[0].TRADE_DATE).slice(0, 10) + '，如实标注）');
      } else points.push('大宗交易：无历史记录（如实标注）');
    } catch (e) { points.push('大宗交易：接口获取失败，无法验证'); }
    return { summary: signals.length ? `资金面录得${signals.filter(s => s.side === 'bear').length > signals.filter(s => s.side === 'bull').length ? '偏空' : '偏多'}信号 ${signals.length} 项。` : '资金面中性：无龙虎榜/大宗有效信号（如实标注）。',
      points, signals,
      bounds: '边界：对倒上榜、假机构、量化刷单无法从公开席位数据证伪（无逐笔委托），本模块以席位性质（拉萨/机构/疑似量化）+ 连续上榜频率 + 折溢价近似刻画，单日龙虎榜一律标注「单日口径需连续验证」，不以单日数据定结论。' };
  }

  /* ---------- 模块 ⑦ 解禁减持（V3：刚性/软性分级 + 流动性冲击测算 + 无效利空排除） ---------- */
  async function modLift(base, task) {
    const points = [], signals = [];
    const tech = base.deep.tech;
    const avgAmt = tech && tech.avgAmt20; // 近20日日均成交额（亿，K线近似）
    try {
      const list = await dcGet('RPT_LIFT_STAGE', `(SECURITY_CODE="${base.code6}")`, '&pageSize=20&sortColumns=FREE_DATE&sortTypes=-1');
      const today = DT.today();
      const future = list.filter(x => String(x.FREE_DATE).slice(0, 10) >= today).sort((a, b) => String(a.FREE_DATE).localeCompare(String(b.FREE_DATE)));
      const past = list.filter(x => String(x.FREE_DATE).slice(0, 10) < today);
      if (future.length) {
        const n2 = future[0];
        const days = Math.round((Date.parse(n2.FREE_DATE.slice(0, 10).replace(/-/g, '/')) - Date.now()) / 864e5);
        const mcap = n2.LIFT_MARKET_CAP != null ? +(n2.LIFT_MARKET_CAP / 1e4).toFixed(2) : null; // 万元→亿
        /* 流动性冲击测算：解禁市值 / 近20日日均成交额（量化口径：>3 倍=高冲击，1-3 倍=中冲击，<1 倍=低冲击） */
        const impact = (mcap != null && avgAmt) ? +(mcap / avgAmt).toFixed(1) : null;
        /* 刚性/软性/观察 三级压力分级 */
        const rigid = days <= 30 && (impact == null || impact > 1);
        const soft = !rigid && days <= 90;
        /* V4：解禁占总股本比例估算（解禁股数×现价 ÷ 总市值，口径近似如实标注）
           占比 >10% 为高比例解禁（供给冲击权重上调），<3% 为低比例 */
        const px0 = base.px && base.px.price != null ? base.px.price : (tech ? tech.close : null);
        const totalMc = base.deep.val && base.deep.val.mcap;
        const liftRatio = (n2.CURRENT_FREE_SHARES != null && px0 != null && totalMc != null && totalMc > 0)
          ? +((n2.CURRENT_FREE_SHARES * 1e4 * px0) / (totalMc * 1e8) * 100).toFixed(1) : null;
        points.push(`未来解禁（东财解禁数据）：最近一批 ${n2.FREE_DATE.slice(0, 10)}（约 ${days} 天后），解禁 ${n2.CURRENT_FREE_SHARES != null ? n2.CURRENT_FREE_SHARES + ' 万股' : '—'}${liftRatio != null ? `，约占总股本 ${liftRatio}%（估算口径：解禁股数×现价÷总市值，>10% 为高比例）` : ''}${mcap != null ? '，对应市值约 ' + mcap + ' 亿' : ''}${n2.FREE_SHARES_TYPE ? '，股份类型：' + n2.FREE_SHARES_TYPE : ''}；未来共 ${future.length} 个批次`);
        if (liftRatio != null && liftRatio >= 10) signals.push(sig('bear', `解禁规模约占总股本 ${liftRatio}%，高比例解禁，股东结构将显著变化`, 1, '东财解禁·估算', 'B'));
        points.push(`流动性冲击测算：解禁市值 ${mcap != null ? mcap + ' 亿' : '—'} ÷ 近20日日均成交额 ${avgAmt != null ? avgAmt + ' 亿' : '—'} = ${impact != null ? impact + ' 倍' : '无法测算'}——${impact != null ? (impact > 3 ? '高冲击（>3倍日均成交，真实抛压沉重）' : impact >= 1 ? '中冲击（1-3倍日均成交）' : '低冲击（<1倍日均成交，市场可自然消化）') : '成交额数据不足'}；压力分级：${rigid ? '🔴 刚性压力（30日内临近）' : soft ? '🟡 软性压力（90日内）' : '⚪ 远期观察（90日外）'}`);
        if (rigid) signals.push(sig('bear', `${days} 天后解禁 ${mcap != null ? mcap + ' 亿' : ''}（冲击 ${impact != null ? impact + ' 倍日均成交' : '未测'}），刚性供给压力临近`, 2, '东财解禁', 'A'));
        else if (soft) signals.push(sig('bear', `90 日内有解禁批次（最近 ${n2.FREE_DATE.slice(0, 10)}，冲击 ${impact != null ? impact + ' 倍' : '—'}），软性供给压力`, 1, '东财解禁', 'A'));
        else signals.push(sig('neu', `未来解禁最近一批在 ${days} 天后且冲击 ${impact != null ? impact + ' 倍（可消化）' : '低'}，短期无实质供给冲击`, 1, '东财解禁', 'A'));
        base.quality.push({ name: '解禁批次', ok: true, note: `未来 ${future.length} 批，最近 ${days} 天后` });
      } else if (list.length) {
        points.push(`解禁：全部批次已解禁完成（最近一批 ${String(list[0].FREE_DATE).slice(0, 10)}），未来无已知解禁压力（东财解禁数据）`);
        /* 无效利空排除：已解禁很久且无减持报道 → 不再作为利空 */
        const lastDays = Math.round((Date.now() - Date.parse(String(past[0].FREE_DATE).slice(0, 10).replace(/-/g, '/'))) / 864e5);
        if (lastDays > 180) points.push(`无效利空排除：最后一批解禁已过去 ${lastDays} 天且无后续减持证据——该历史解禁不再作为做空依据（反造假：排除已消化的过期利空）`);
        signals.push(sig('bull', '未来无已知解禁批次，无供给端定时炸弹', 1, '东财解禁', 'A'));
      } else points.push('解禁：无解禁记录（如实标注）');
    } catch (e) { points.push('解禁：接口获取失败，无法验证'); }
    // 减持公告（全网检索，强制名称过滤——反张冠李戴）
    let red = [];
    const stockName = task.name || base.r.name || '';
    try { red = await searchNews((stockName || base.code6) + ' 减持', 10); } catch (e) {}
    const redRaw = red.length;
    if (stockName) red = red.filter(n2 => mentionReal(stockName, n2.title, n2.content).ok);
    if (red.length) {
      const half = Date.now() - 180 * 864e5;
      const recent = red.filter(n2 => { const t2 = Date.parse(n2.date.replace(/-/g, '/')); return Number.isFinite(t2) && t2 >= half; });
      points.push(`减持检索（全网「${stockName || base.code6} 减持」，已按名称过滤仅保留提及本公司的报道）：命中 ${red.length} 条${recent.length ? '，其中近半年 ' + recent.length + ' 条' : ''}：${red.slice(0, 3).map(n2 => `《${n2.title}》(${n2.media} ${n2.date})`).join('；')}`);
      if (recent.length) signals.push(sig('bear', `近半年有 ${recent.length} 条本公司减持相关报道（如《${recent[0].title}》），产业资本在退出`, 2, '全网检索·已过滤', 'B'));
    } else points.push(`减持检索：全网「${stockName || base.code6} 减持」返回 ${redRaw} 条，经名称过滤+同名干扰消歧后无一条真正提及本公司——无公开减持公告信号（如实标注，不过滤就会造成张冠李戴）`);
    return { summary: signals.some(s => s.side === 'bear') ? '解禁/减持维度存在供给端压力信号，需重点盯防。' : '解禁/减持维度干净：无临近解禁批次、无公开减持信号。',
      points, signals, items: red.slice(0, 3),
      bounds: '边界：解禁市值为公告日口径，实际抛压取决于股东意愿（国资/PE/高管差异大）；减持明细无专用报表（浏览器通道实测），以全网检索+名称过滤兜底；冲击测算的日均成交额为K线近似值（量×价），与实际成交额存在小口径误差。' };
  }

  /* ---------- 模块 ⑧ 多空辩论（V3：逐条证伪 + 孤证识别 + 逻辑漏洞清单） ---------- */
  const REBUT_BEAR = [ // 空方反驳多方论据
    [/超卖|J 值 .*< 0|RSI\(6\) .* < 20/, '超卖不等于反转：下跌趋势中指标可长期钝化，接飞刀是主要亏损来源'],
    [/涨停|连板/, '涨停是资金一致性的结果而非原因，一致性之后只有分歧，高位开板即是派发'],
    [/放量|量比/, '放量本身中性：关键位放量突破才是买点，高位放量滞涨恰恰是对倒出货'],
    [/净买入|大资金进场/, '龙虎榜净买入只代表当日，游资隔日砸盘是常态，席位溢价已大不如前'],
    [/预增|高增长|业绩.*托底|主业真实增长/, '业绩是后视镜：股价炒的是预期，兑现日常见「利好出尽是利空」'],
    [/估值.*低位|分位.*低/, '低估值可能是价值陷阱：需先区分错杀与基本面恶化，便宜不是买入理由'],
    [/筹码.*集中|户数.*减少/, '筹码集中也可能是下跌中继的锁仓，需放量突破确认而非静态推断'],
    [/主线|板块.*涨幅榜|媒体聚焦|人气|催化/, '板块强势不等于个股安全：跟风股在退潮期跌幅最大，人气是反向指标的一种'],
    [/融资余额.*加仓/, '杠杆资金是双刃剑：助涨同样助跌，融资盘爆仓会放大下杀'],
    [/无.*解禁|供给/, '无解禁不等于无减持：二级市场竞价减持与大宗通道随时可能发生'],
    [/底背离/, '背离可以再背离：弱势股底背离后横盘阴跌是常态，需放量阳线确认']
  ];
  const REBUT_BULL = [ // 多方反驳空方论据
    [/解禁/, '解禁不等于减持：需看股东结构与减持预披露公告，恐慌情绪常提前消化'],
    [/预减|净利同比 -|基本面恶化|主业实际亏损/, '业绩下滑若已被股价充分定价，利空出尽反而是反弹起点'],
    [/超买|J 值 .*> 100|RSI\(6\) .* > 80/, '强势股可以超买再超买：用震荡指标给趋势股判顶是典型逆势操作'],
    [/涨幅巨大|顶部区域|获利盘/, '位置高不是卖出理由，趋势才是：右侧交易只跟随不预测顶'],
    [/减持/, '减持的冲击取决于比例与方式：大宗/协议减持对二级市场直接冲击有限'],
    [/户数.*激增|派发/, '户数激增需结合位置判断：底部激增是恐慌换手，只有顶部激增才是派发'],
    [/大盘情绪「退潮」|「冰点」|亏钱效应/, '大盘弱势错杀的是β，若个股有独立α逻辑，恐慌期恰是左侧布局窗口'],
    [/机构.*卖出|净卖出/, '单日席位卖出可能是调仓而非看空：需连续多日数据才能确认趋势性撤离'],
    [/估值.*极高|分位.*高/, '高估值可由高成长消化：PEG 比 PE 分位更能说明问题'],
    [/折价/, '大宗折价是通道费常态，只要接盘方锁定期长，反而减少二级供给'],
    [/顶背离/, '强趋势中顶背离可多次失效：背离只警示减速，不等于反转']
  ];
  const GENERIC_BEAR = ['该论据孤证不立：单一信号不构成趋势依据，需多维度共振', '这是典型的幸存者偏差：同样的信号在下跌样本中同样大量出现', '该信号滞后于价格：等它出现时，先知先觉的资金已完成布局或撤离'];
  const GENERIC_BULL = ['该风险已被市场知晓并部分定价：公开信息的杀伤力随时间递减', '风险与机会一体两面：该因素若证伪，反而是预期差来源', '单点风险需对照仓位管理化解，而非否定全部多头逻辑'];

  /* 辩论前置处理：证据有效性逐条证伪
     证伪规则（全部可复核）：
     ① C级信号（规则推断/近似识别）→ 标记「被削弱」
     ② 该信号所属模块同向证据仅 1 条 → 孤证，标记「孤证不立」
     ③ 与技术模块过滤清单冲突 → 「被证伪」
     ④ A/B级且有跨模块同向旁证 → 「成立」 */
  function modDebate(base, task) {
    const done = task.done || {};
    const byMod = {};
    let bull = [], bear = [];
    ['tech', 'sentiment', 'news', 'fundamental', 'policy', 'capital', 'lift'].forEach(k => {
      const m = done[k];
      if (!m || !m.signals) return;
      byMod[k] = m.signals;
      m.signals.forEach(s => { if (s.side === 'bull') bull.push(Object.assign({ mod: k }, s)); else if (s.side === 'bear') bear.push(Object.assign({ mod: k }, s)); });
    });
    /* 被技术模块过滤的假信号文本（证伪对照表） */
    const filteredTxt = (done.tech && done.tech.filtered) || [];
    /* 跨模块旁证检查：同向信号是否出现在 ≥2 个模块 */
    const corroborated = (s, pool) => pool.filter(x => x !== s && x.mod !== s.mod).length > 0;
    const judge = (s, pool) => {
      if (filteredTxt.some(ft => s.text.indexOf(ft.slice(0, 12)) >= 0)) return { v: '被证伪', why: '与技术模块过滤清单冲突：该信号已被判定为假信号（' + filteredTxt[0].slice(0, 40) + '…）' };
      if (s.grade === 'C') return { v: '被削弱', why: 'C级规则推断/近似识别，无官方数据直接支撑' };
      if (!corroborated(s, pool)) return { v: '孤证', why: '孤证不立：该信号在本模块外无同向旁证，置信度降级' };
      return { v: '成立', why: '有跨模块同向旁证，证据链闭合' };
    };
    bull = bull.slice().sort((a, b) => scoreW(b) - scoreW(a));
    bear = bear.slice().sort((a, b) => scoreW(b) - scoreW(a));
    bull.forEach(s => { s.judge = judge(s, bull); });
    bear.forEach(s => { s.judge = judge(s, bear); });
    const validBull = bull.filter(s => s.judge.v === '成立');
    const validBear = bear.filter(s => s.judge.v === '成立');
    const weakBull = bull.filter(s => s.judge.v !== '成立');
    const weakBear = bear.filter(s => s.judge.v !== '成立');
    /* 逻辑漏洞清单：矛盾对 + 孤证 + 被证伪 */
    const flaws = [];
    weakBull.forEach(s => flaws.push(`多方漏洞：「${s.text.slice(0, 36)}…」${s.judge.v}——${s.judge.why}`));
    weakBear.forEach(s => flaws.push(`空方漏洞：「${s.text.slice(0, 36)}…」${s.judge.v}——${s.judge.why}`));
    /* 矛盾对检测（跨模块逻辑冲突） */
    const has = (pool, re) => pool.some(s => re.test(s.text));
    if (has(bull, /预增|高增长|主业真实增长/) && has(bear, /舆情负向占比/)) flaws.push('多空矛盾：基本面「业绩预增」与舆情「负向占比过高」直接冲突——市场可能知晓财报未披露的信息，需人工核对最新公告');
    if (has(bull, /龙虎榜净买入|机构席位买入/) && has(bear, /空头排列|中期趋势向下/)) flaws.push('多空矛盾：资金「席位买入」与技术「空头排列」冲突——席位为单日口径，趋势为连续口径，以趋势为准、席位降级');
    if (has(bull, /估值.*低位|分位.*低/) && has(bear, /净利同比 -|基本面恶化|主业实际亏损/)) flaws.push('多空矛盾：「估值低位」与「基本面恶化」并存——典型价值陷阱特征，低估值可能正是恶化的定价结果');
    if (has(bull, /融资余额.*加仓/) && has(bear, /股东户数激增|派发/)) flaws.push('多空矛盾：杠杆资金加仓与股东户数激增并存——散户与杠杆同步涌入是顶部特征之一，需警惕');
    const rounds = Math.max(2, Math.min(4, task.cfg.rounds || 3));
    const dialog = [];
    const usedB = new Set(), usedW = new Set();
    let gi = 0;
    for (let r2 = 1; r2 <= rounds; r2++) {
      const bs = bull.find((s, i2) => !usedB.has(i2));
      if (bs) {
        const bi = bull.indexOf(bs); usedB.add(bi);
        dialog.push({ side: 'bull', round: r2, text: `多方论据：${bs.text}（${bs.src} · ${bs.grade}级 · 证伪结论「${bs.judge.v}」）——这是支撑做多的第 ${usedB.size} 号证据。` });
        const rule = REBUT_BEAR.find(x => x[0].test(bs.text));
        dialog.push({ side: 'bear', round: r2, text: `空方驳斥：${rule ? rule[1] : GENERIC_BEAR[gi++ % GENERIC_BEAR.length]}——所以「${bs.text.slice(0, 26)}…」${bs.judge.v === '成立' ? '虽成立但不足以扭转结论' : '本身' + bs.judge.v + '，不能作为做多依据'}。` });
      } else {
        dialog.push({ side: 'bull', round: r2, text: '多方：本轮已无新增实锤论据，重申既有核心逻辑。' });
        dialog.push({ side: 'bear', round: r2, text: `空方驳斥：${GENERIC_BEAR[gi++ % GENERIC_BEAR.length]}。` });
      }
      const ws = bear.find((s, i2) => !usedW.has(i2));
      if (ws) {
        const wi = bear.indexOf(ws); usedW.add(wi);
        dialog.push({ side: 'bear', round: r2, text: `空方论据：${ws.text}（${ws.src} · ${ws.grade}级 · 证伪结论「${ws.judge.v}」）——这是压制做多的第 ${usedW.size} 号证据。` });
        const rule = REBUT_BULL.find(x => x[0].test(ws.text));
        dialog.push({ side: 'bull', round: r2, text: `多方驳斥：${rule ? rule[1] : GENERIC_BULL[gi % GENERIC_BULL.length]}——所以「${ws.text.slice(0, 26)}…」${ws.judge.v === '成立' ? '的风险需盯防但可控' : '本身' + ws.judge.v + '，压制力有限'}。` });
      } else {
        dialog.push({ side: 'bear', round: r2, text: '空方：本轮已无新增实锤论据，重申既有风险提示。' });
        dialog.push({ side: 'bull', round: r2, text: `多方驳斥：${GENERIC_BULL[gi++ % GENERIC_BULL.length]}。` });
      }
    }
    /* 有效证据计分（只有「成立」的信号按全权重，被削弱/孤证按半价，被证伪计 0） */
    const validW = s => s.judge.v === '成立' ? scoreW(s) : s.judge.v === '被证伪' ? 0 : +(scoreW(s) * 0.5).toFixed(2);
    const bullW = +bull.reduce((s2, x) => s2 + validW(x), 0).toFixed(1);
    const bearW = +bear.reduce((s2, x) => s2 + validW(x), 0).toFixed(1);
    const net = +(bullW - bearW).toFixed(1);
    let verdict;
    if (net >= 4) verdict = `辩论裁决：多方证据链更重（有效权重 ${bullW} vs ${bearW}，净 +${net}），空方驳斥多停留在「可能性」层面而未能证伪核心多头证据。`;
    else if (net <= -4) verdict = `辩论裁决：空方证据链更重（有效权重 ${bearW} vs ${bullW}，净 ${net}），多方驳斥未能化解核心风险，防守优先。`;
    else verdict = `辩论裁决：多空势均（${bullW} vs ${bearW}，净 ${net > 0 ? '+' : ''}${net}），任何一方都未形成压倒性证据链，应以「不预测、只应对」的纪律处理。`;
    const summary = `经 ${rounds} 轮攻防（本地规则引擎基于 ${bull.length + bear.length} 条真实信号逐条证伪，非远程大模型）：多方有效论据 ${validBull.length} 条 / 空方有效论据 ${validBear.length} 条 / 逻辑漏洞 ${flaws.length} 条，${net >= 4 ? '多方占优' : net <= -4 ? '空方占优' : '多空胶着'}。`;
    /* 三视角长篇论述（保留原结构，内容升级为证伪口径） */
    const name = task.name || task.code;
    const bullRebuts = dialog.filter(x => x.side === 'bull' && /驳斥/.test(x.text)).map(x => x.text.replace(/^多方驳斥：/, ''));
    const bearRebuts = dialog.filter(x => x.side === 'bear' && /驳斥/.test(x.text)).map(x => x.text.replace(/^空方驳斥：/, ''));
    const evLine = (s, i2, tag) => `${tag} #${i2 + 1}：${s.text}（依据：${s.src} · ${s.grade}级 · 证伪结论「${s.judge.v}」${s.judge.v !== '成立' ? '：' + s.judge.why : ''}）`;
    const bullEssay = [
      { h: '一、核心多头逻辑（Bull Case）', paras: bull.length
          ? bull.slice(0, 4).map((s, i2) => evLine(s, i2, '催化剂'))
          : ['本次分析未录得实锤多头证据——多方研究员如实承认：当前做多缺乏数据支撑。'] },
      { h: '二、对空方论据的逐条驳斥', paras: bear.length
          ? bear.slice(0, 4).map((s, i2) => `针对「${s.text.slice(0, 30)}…」（证伪结论「${s.judge.v}」）：${bullRebuts[i2] ? bullRebuts[i2].replace(/——所以.*$/, '') : '该风险已被市场知晓并部分定价，公开信息的杀伤力随时间递减。'}`)
          : ['空方本轮未提出实锤论据，无需驳斥。'] },
      { h: '三、多方结论', paras: [`多方有效论据 ${validBull.length} 条（有效权重 ${bullW}），${net >= 4 ? '在本场辩论中占优' : '尚不足以压倒空方'}——${net >= 4 ? '建议顺势但不追高，按纪律持有' : '承认分歧，等待更多确认信号'}。`] }
    ];
    const bearEssay = [
      { h: '一、核心空头逻辑（Bear Case）', paras: bear.length
          ? bear.slice(0, 4).map((s, i2) => evLine(s, i2, '风险点'))
          : ['本次分析未录得实锤空头证据——空方研究员如实承认：当前做空缺乏数据支撑。'] },
      { h: '二、对多方论据的逐条驳斥', paras: bull.length
          ? bull.slice(0, 4).map((s, i2) => `针对「${s.text.slice(0, 30)}…」（证伪结论「${s.judge.v}」）：${bearRebuts[i2] ? bearRebuts[i2].replace(/——所以.*$/, '') : '该论据孤证不立，单一信号不构成趋势依据。'}`)
          : ['多方本轮未提出实锤论据，无需驳斥。'] },
      { h: '三、空方结论', paras: [`空方有效论据 ${validBear.length} 条（有效权重 ${bearW}），${net <= -4 ? '在本场辩论中占优' : '与多方互有攻守'}——${net <= -4 ? '防守优先，任何反抽视为降仓机会' : '风险点需逐条盯防，触发即执行纪律'}。`] }
    ];
    const mgrEssay = [
      { h: '辩论质量校验', paras: [`本场辩论共 ${rounds} 轮，多方出示证据 ${bull.length} 条（成立 ${validBull.length} / 被削弱或孤证 ${weakBull.filter(s => s.judge.v !== '被证伪').length} / 被证伪 ${weakBull.filter(s => s.judge.v === '被证伪').length}），空方出示证据 ${bear.length} 条（成立 ${validBear.length} / 被削弱或孤证 ${weakBear.filter(s => s.judge.v !== '被证伪').length} / 被证伪 ${weakBear.filter(s => s.judge.v === '被证伪').length}），全部来自技术/情绪/舆情/基本面/政策/资金/解禁七个模块的真实数据，无一条凭空编造。`] },
      { h: '逻辑漏洞清单（双方互查结果）', paras: flaws.length ? flaws.slice(0, 8) : ['本场未发现明显逻辑漏洞——双方证据链均完整（罕见情形，仍请按纪律执行）。'] },
      { h: '裁决', paras: [verdict.replace(/^辩论裁决：/, '')] },
      { h: '给交易员的备注', paras: ['辩论的价值不在「谁赢」，而在把多空双方最硬的证据同时摆上桌面。最终信号请结合风险评估的止损纪律执行——观点可以被证伪，纪律不能。'] }
    ];
    return { summary, points: [], signals: [], dialog, verdict, bullN: bull.length, bearN: bear.length,
      validBull: validBull.map(s => s.text), validBear: validBear.map(s => s.text), flaws,
      bullW, bearW, net, bullEssay, bearEssay, mgrEssay, name };
  }

  /* ---------- 模块 ⑨ 风险评估 + 终极操作建议（V3：可信度打分 + 仓位档位 + 点位/赔率/触发条件） ---------- */
  function modRisk(base, task) {
    const done = task.done || {};
    let bull = [], bear = [];
    ['tech', 'sentiment', 'news', 'fundamental', 'policy', 'capital', 'lift'].forEach(k => {
      const m = done[k];
      if (!m || !m.signals) return;
      m.signals.forEach(s => { if (s.side === 'bull') bull.push(s); else if (s.side === 'bear') bear.push(s); });
    });
    bull.sort((a, b) => scoreW(b) - scoreW(a)); bear.sort((a, b) => scoreW(b) - scoreW(a));
    const bullW = +bull.reduce((s2, x) => s2 + scoreW(x), 0).toFixed(1);
    const bearW = +bear.reduce((s2, x) => s2 + scoreW(x), 0).toFixed(1);
    const net = +(bullW - bearW).toFixed(1);
    /* 综合可信度打分（量化口径）：
       数据完整度 = 质量登记通道成功率；证据优势度 = 强势方权重占比
       可信度 = 100 × (0.45×完整度 + 0.55×优势度)，<45 视为「数据不足」，评级封顶「持有」 */
    const q = base.quality || [];
    const qOk = q.filter(x => x.ok).length;
    const completeness = q.length ? qOk / q.length : 0.5;
    const dominance = (bullW + bearW) > 0 ? Math.max(bullW, bearW) / (bullW + bearW) : 0.5;
    const confidence = Math.round(100 * (0.45 * completeness + 0.55 * dominance));
    /* V4 胜率公式化（替代 V3 固定话术「45%~60%」——按证据强度逐案推算）：
       胜率中值 = 50 + 净评分×1.2 + (可信度-50)×0.15，截断 [25,75]，区间 ±7%
       规则经验口径，非统计回测——公式本身在报告中披露，可复算 */
    const winMid = Math.max(25, Math.min(75, Math.round(50 + net * 1.2 + (confidence - 50) * 0.15)));
    const winRange = (winMid - 7) + '%~' + (winMid + 7) + '%';
    /* 五级评级（净分门槛 + 可信度闸门） */
    let rating, ratingCls;
    if (net >= 8) { rating = '强烈看多'; ratingCls = 'up'; }
    else if (net >= 3) { rating = '偏多'; ratingCls = 'up'; }
    else if (net >= -3) { rating = '多空博弈'; ratingCls = 'amber'; }
    else if (net >= -7) { rating = '偏空'; ratingCls = 'down'; }
    else { rating = '强烈看空'; ratingCls = 'down'; }
    let signal;
    if (net >= 8) signal = { en: 'BUY', cn: '买入', cls: 'up' };
    else if (net >= 3) signal = { en: 'OVERWEIGHT', cn: '增持', cls: 'up' };
    else if (net >= -3) signal = { en: 'HOLD', cn: '持有', cls: 'amber' };
    else if (net >= -7) signal = { en: 'UNDERWEIGHT', cn: '减持', cls: 'down' };
    else signal = { en: 'SELL', cn: '卖出', cls: 'down' };
    if (confidence < 45 && (signal.en === 'BUY' || signal.en === 'OVERWEIGHT')) {
      signal = { en: 'HOLD', cn: '持有', cls: 'amber' };
      rating = '多空博弈（数据不足封顶）'; ratingCls = 'amber';
    }
    /* 赔率闸门（V3 反空话机制）：先算止损与目标位，盈亏比 <1 时看多信号强制降级 HOLD——
       胜率未可知而赔率不足的交易直接否决，杜绝「方向对但没法做」的假建议 */
    let oddsVeto = '';
    /* 量化仓位档位：0/2/3/5/7/满仓，受风控严格等级调节（严格降一档/宽松升一档）
       注意：最终仓位在赔率测算之后确定（赔率闸门可能先降级信号） */
    const POS_MAP = { BUY: 7, OVERWEIGHT: 5, HOLD: 3, UNDERWEIGHT: 2, SELL: 0 };
    const RL = (task.cfg && task.cfg.riskLevel) || 'standard';
    let pos = 0, posTxt = '—', posNote = '';
    const t = base.deep.tech, px = base.px;
    const cur = px && px.price != null ? px.price : (t ? t.close : null);
    // 大盘环境证据
    const envBits = [];
    if (base.stage) {
      const br0 = base.mkt && base.mkt.br;
      envBits.push(`大盘情绪阶段「${base.stage}」${br0 && br0.ok ? `（涨停 ${br0.limitUp} 家 / 封板率 ${br0.sealRate}% / 最高 ${br0.height} 板）` : ''}`);
    }
    if (base.amount != null) envBits.push(`两市成交额 ${base.amount} 万亿`);
    envBits.push('数据源：东财涨停池/行业榜/两市行情实时采集，与「大盘总览」页同一数据底座');
    /* 支撑位/压力位（真实摆动高低点 + 均线 + 区间极值，去重聚类） */
    const sups = [], ress = [];
    if (t && cur != null) {
      const pushLv = (arr, p2, tag) => { if (p2 != null && !arr.some(x => Math.abs(x.p - p2) / cur < 0.015)) arr.push({ p: p2, tag }); };
      (t.swL || []).slice().reverse().forEach(s => { if (s.p < cur * 0.995) pushLv(sups, s.p, '前低 ' + s.d); });
      (t.swH || []).slice().reverse().forEach(s => { if (s.p > cur * 1.005) pushLv(ress, s.p, '前高 ' + s.d); });
      [t.ma20, t.ma60, t.ma120].forEach((m, mi) => {
        if (m == null) return;
        if (m < cur * 0.995) pushLv(sups, m, 'MA' + [20, 60, 120][mi]);
        else if (m > cur * 1.005) pushLv(ress, m, 'MA' + [20, 60, 120][mi]);
      });
      if (t.lo52 != null && t.lo52 < cur) pushLv(sups, t.lo52, '区间低点');
      if (t.hi52 != null && t.hi52 > cur) pushLv(ress, t.hi52, '区间高点');
      sups.sort((a, b) => b.p - a.p); ress.sort((a, b) => a.p - b.p);
    }
    /* 止损绝对点位：最近支撑下浮 1% 与 7% 机械纪律取较高者（ tighter 优先） */
    const stops = [];
    let stopPx = null;
    if (t && cur != null) {
      const mech = +(cur * 0.93).toFixed(2);
      if (sups.length) {
        stopPx = +Math.max(sups[0].p * 0.99, mech).toFixed(2);
        stops.push(`绝对止损位 ${stopPx} 元（最近支撑 ${sups[0].p} 元（${sups[0].tag}）下浮 1% 与 7% 机械位 ${mech} 元取较高者）——收盘跌破即执行，不与市场争辩`);
      } else {
        stopPx = mech;
        stops.push(`绝对止损位 ${stopPx} 元（当前价下方 7% 机械纪律，无可识别支撑位）——收盘跌破即执行`);
      }
      if (t.ma60 != null) stops.push(cur > t.ma60
        ? `趋势止损：跌破 MA60（${t.ma60} 元）→ 无条件离场（中期趋势转空）`
        : `当前价已在 MA60（${t.ma60} 元）下方，中期趋势已转空：反弹至 MA60 附近视为减仓窗口`);
      if (t.lo52 != null && cur > t.lo52) stops.push(`极限止损：跌破样本区间低点 ${t.lo52} 元 → 任何仓位清零（平台破位）`);
    } else stops.push('实时价格未获取，无法计算精确止损位——请手工设定成本价下方 5%~7% 机械止损');
    /* 止盈分批区间 */
    const tps = [];
    if (t && cur != null && ress.length) {
      tps.push(`第一止盈 ${ress[0].p} 元（${ress[0].tag}，+${(((ress[0].p / cur) - 1) * 100).toFixed(1)}%）→ 减仓 1/3 锁定利润`);
      if (ress[1]) tps.push(`第二止盈 ${ress[1].p} 元（${ress[1].tag}，+${(((ress[1].p / cur) - 1) * 100).toFixed(1)}%）→ 再减 1/3，余仓移动止盈（跌破 MA10 清仓）`);
    } else if (t && cur != null && t.hi52 != null && t.hi52 > cur) {
      tps.push(`止盈参考 ${t.hi52} 元（样本区间高点，+${(((t.hi52 / cur) - 1) * 100).toFixed(1)}%）→ 到达减仓 1/3，余仓移动止盈`);
    } else tps.push('无可识别压力位——以移动止盈纪律代替固定点位（跌破 MA10 减半，跌破 MA20 清仓）');
    /* 赔率测算：盈亏比 = (第一止盈-现价) / (现价-绝对止损)；胜率区间为规则经验口径 */
    let rr = null, winNote = '';
    if (cur != null && stopPx != null && ress.length && cur > stopPx) {
      rr = +(((ress[0].p - cur) / (cur - stopPx))).toFixed(1);
      winNote = rr >= 3 ? '盈亏比 ≥3:1，赔率优良' : rr >= 1.5 ? '盈亏比 ' + rr + ':1，赔率尚可' : '盈亏比仅 ' + rr + ':1，赔率不足，不值得开仓';
    }
    /* 赔率闸门生效：盈亏比 <1 时看多信号强制降级（修改原因：杜绝「方向对但赔率不足」的不可执行建议） */
    if (rr != null && rr < 1 && (signal.en === 'BUY' || signal.en === 'OVERWEIGHT')) {
      oddsVeto = `赔率闸门触发：盈亏比仅 ${rr}:1 < 1:1，${signal.cn}信号强制降级为「持有」——方向信号与空间测算冲突时以空间为准`;
      signal = { en: 'HOLD', cn: '持有', cls: 'amber' };
      if (ratingCls === 'up') { rating = rating + '（赔率不足降级）'; ratingCls = 'amber'; }
    }
    /* 最终仓位（信号经可信度闸门与赔率闸门校正后定档） */
    pos = POS_MAP[signal.en];
    if (RL === 'strict') pos = { 7: 5, 5: 3, 3: 2, 2: 0, 0: 0 }[pos];
    if (RL === 'loose') pos = { 7: 10, 5: 7, 3: 5, 2: 3, 0: 0 }[pos];
    if (confidence < 45 && pos > 2) { pos = 2; posNote = '（数据可信度不足 45 分，仓位强制封顶 2 成）'; }
    posTxt = pos === 10 ? '满仓' : pos === 0 ? '0 成（空仓）' : pos + ' 成';
    const oddsTxt = rr != null
      ? `赔率测算：盈亏比 ${rr}:1（目标 ${ress[0].p} / 止损 ${stopPx}）——${winNote}；胜率区间 ${winRange}（公式：50 + 净评分${net > 0 ? '+' : ''}${net}×1.2 + (可信度${confidence}-50)×0.15，±7% 带宽，规则经验口径非回测），期望值为正才具备开仓价值`
      : `赔率测算：价格或支撑/压力位数据不足，无法测算——如实标注；胜率区间 ${winRange}（经验口径，仅供参考）`;
    /* 入场条件清单（全部条件化，可执行） */
    const entryRules = [];
    if (t && cur != null) {
      if (ress.length) entryRules.push(`右侧确认：放量突破 ${ress[0].p} 元（${ress[0].tag}）且量比 ≥1.5 → 按仓位档位入场`);
      if (sups.length) entryRules.push(`左侧试错：回踩 ${sups[0].p} 元（${sups[0].tag}）附近连续 2 日收盘不破 → ≤2 成轻仓试错`);
      entryRules.push(`趋势过滤：收盘价站稳 MA20（${t.ma20 != null ? t.ma20 + ' 元' : '—'}）以上才可持有波段仓`);
      if (t.rangeBound) entryRules.push('当前为震荡市：不追涨不杀跌，只在区间下沿试、上沿减');
    }
    entryRules.push('环境过滤：大盘情绪处于「退潮/冰点」时，所有入场信号降一档执行');
    if (!entryRules.length) entryRules.push('数据不足，无法生成入场条件——一律观望');
    // 持仓者 / 空仓者策略
    const holder = [], watcher = [];
    if (net >= 3) {
      holder.push(`按止损纪律持股待涨，不追加高位仓位；跌破绝对止损位 ${stopPx != null ? stopPx + ' 元' : ''} 减半，跌破 MA60 离场`);
      if (base.stage === '高潮') holder.push('大盘「高潮」期次日多分化：只卖不买，竞价低于预期先兑现一半');
      watcher.push(`不追高：严格按入场条件清单执行，首仓 ≤ ${Math.min(pos, 3)} 成`);
    } else if (net >= -3) {
      holder.push(`多空均衡期不加仓：反弹至压力位（${ress.length ? ress[0].p + ' 元' : '前高'}）分批降仓至半仓以下，严格按止损位执行`);
      watcher.push('观望为主：等待入场条件清单任一条件触发再行动，不提前埋伏');
    } else {
      holder.push(`减仓/回避为主：任何反抽至压力位（${ress.length ? ress[0].p + ' 元' : 'MA20'}）视为降仓机会，不格局不补仓摊低成本`);
      watcher.push('回避：风险信号未解除前不开新仓，现金等待更好的赔率');
    }
    if (base.stage === '退潮' || base.stage === '冰点') { holder.push(`大盘「${base.stage}」期总仓位从严：持股以兑现为主`); watcher.push(`大盘「${base.stage}」期新开仓一律暂缓`); }
    /* 未来重点监测指标与风险触发条件 */
    const monitors = [];
    if (t) monitors.push(`技术触发：收盘跌破绝对止损位 ${stopPx != null ? stopPx + ' 元' : '—'} → 机械执行减半`);
    const f0 = base.web.fund;
    if (f0 && f0.qdate) monitors.push(`基本面触发：下一财报/预告披露（当前为 ${f0.datatype || f0.qdate}）若扣非继续恶化 → 评级下调一档`);
    if (done.lift && done.lift.signals && done.lift.signals.some(s => s.side === 'bear')) monitors.push('供给触发：解禁批次临近或新增减持公告 → 立即重估');
    if (base._rzrq) monitors.push(`资金触发：融资余额（当前 ${base._rzrq.rz} 亿）连续 3 日下降 → 杠杆资金撤离确认，降仓`);
    monitors.push('舆情触发：近3日舆情转为纯负向（关键词统计）→ 检查是否有未披露利空');
    monitors.push('黑天鹅兜底：任何无法解释的放量跳空低开（缺口 >3%）→ 先减半再查原因，顺序不可颠倒');
    // 替代配置
    const alt = [];
    const sec = base.mkt.sec;
    if (sec && sec.ok && sec.up && sec.up.length) {
      const top = sec.up.slice(0, 3);
      alt.push(`若本股风险信号成立，资金可切换至当日强势板块：${top.map(s => `「${s.name}」(${UI.sign(s.chgPct, 2, '%')}${s.leader ? '，领涨 ' + s.leader : ''})`).join('、')}——板块内选强不选弱（东财行业榜真实数据）`);
    }
    if (base.zt && base.zt.hybk) alt.push(`同题材「${base.zt.hybk}」内可做换强不换弱：对照涨停梯队前排标的`);
    if (!alt.length) alt.push('当前无明确强势主线可替代，空仓/低仓即是配置（如实标注）');
    // 风险清单 + 逻辑冲突点
    const riskList = bear.slice(0, 5).map(s => s.text + '（' + s.src + '）');
    if (!riskList.length) riskList.push('本次分析未录得重大风险信号——仍请执行机械止损纪律，市场永远存在未知风险');
    /* V4 黑天鹅扫描（舆情真实标题关键词实证，非臆测清单） */
    const swans = [];
    {
      const SWAN_KW = [
        [/立案|被调查|证监会.*调查/, '监管立案调查风险'], [/退市|终止上市|摘牌/, '退市风险'],
        [/质押/, '股权质押平仓风险'], [/处罚|警示函|监管函|责令改正/, '监管处罚风险'],
        [/商誉/, '商誉减值风险'], [/冻结|轮候冻结/, '股份冻结风险'], [/造假|虚增/, '财务造假风险']
      ];
      const nwItems = (done.news && done.news.items) || [];
      const hitSet = {};
      nwItems.forEach(n2 => {
        const txt = n2.title + ' ' + (n2.content || '');
        SWAN_KW.forEach(([re, label]) => {
          if (re.test(txt) && !hitSet[label]) { hitSet[label] = 1; swans.push(`${label}：《${n2.title}》（${n2.media} ${n2.date}）`); }
        });
      });
      if ((task.name || '').indexOf('ST') >= 0) swans.unshift('ST 股特别风险：涨跌幅 5% 限制、退市整理期规则适用，仓位纪律需额外从严');
    }
    const swanTxt = swans.length ? `黑天鹅扫描：命中 ${swans.length} 项——${swans.join('；')}` : '黑天鹅扫描：舆情窗口内未命中立案/退市/质押/处罚/商誉/造假关键词（不代表风险不存在，仅代表公开舆情未披露）';
    swans.slice(0, 3).forEach(s2 => riskList.unshift('🦢 ' + s2));
    const conflicts = (done.debate && done.debate.flaws) || [];
    const points = [
      `综合评分：多头 ${bullW} vs 空头 ${bearW}（净 ${net > 0 ? '+' : ''}${net}，可信度加权口径），评级「${rating}」，最终信号 ${signal.en}（${signal.cn}）`,
      `综合可信度：${confidence}/100（数据完整度 ${Math.round(completeness * 100)}%（${qOk}/${q.length} 通道可用）× 证据优势度 ${Math.round(dominance * 100)}%）${confidence < 45 ? '——低于 45 分，评级与仓位已强制降级' : ''}`,
      `量化仓位建议：${posTxt}${posNote}（风控等级：${RL === 'strict' ? '严格' : RL === 'loose' ? '宽松' : '标准'}）`,
      oddsVeto ? `⚠️ ${oddsVeto}（目标 ${ress.length ? ress[0].p : '—'} / 止损 ${stopPx != null ? stopPx : '—'}）；胜率区间 ${winRange}（公式：50 + 净评分${net > 0 ? '+' : ''}${net}×1.2 + (可信度${confidence}-50)×0.15，±7% 带宽，规则经验口径非回测），期望值为正才具备开仓价值` : oddsTxt,
      `大盘环境（当日大盘总览真实数据）：${envBits.join(' · ')}`,
      `核心支撑：${bull.length ? bull.slice(0, 2).map(s => s.text).join('；') : '无明确多头支撑'}`,
      `主要压制：${bear.length ? bear.slice(0, 2).map(s => s.text).join('；') : '无明显压制信号'}`,
      swanTxt
    ];
    if (conflicts.length) points.push(`逻辑冲突点（来自辩论漏洞清单）：${conflicts.slice(0, 3).join('；')}`);
    const rationale = `本轮多维度交叉验证中，多方最硬的论据是：${bull.length ? bull.slice(0, 2).map(s => s.text).join('；') : '（无实锤多头证据）'}；空方最有力的反驳是：${bear.length ? bear.slice(0, 2).map(s => s.text).join('；') : '（无实锤空头证据）'}。`
      + `逐条校验后：多头信号 ${bull.length} 项（加权 ${bullW}）对空头信号 ${bear.length} 项（加权 ${bearW}），净评分 ${net > 0 ? '+' : ''}${net}，综合可信度 ${confidence}/100。`
      + (net >= 8 ? '多头证据链显著更重且赔率达到要求，给出买入信号——严格执行止损纪律，观点随时可能被新数据证伪。'
        : net >= 3 ? '多头占优，给出增持信号——按仓位档位执行，不追加高位仓位。'
        : net >= -3 ? '多空均未形成压倒性证据链，给出持有/观望信号——不预测、只应对，等入场条件触发再行动。'
        : net >= -7 ? '空头证据链更重，给出减持信号——任何反抽视为降仓机会，不与趋势争辩。'
        : '空头证据链压倒性更重，给出卖出信号——清仓回避，不与趋势争辩。')
      + (oddsVeto ? `但${oddsVeto.replace('赔率闸门触发：', '')}。` : '');
    return {
      summary: `最终信号 ${signal.en}（${signal.cn}）· 评级「${rating}」· 仓位 ${posTxt} · 净评分 ${net > 0 ? '+' : ''}${net} · 可信度 ${confidence}/100。本建议由本地规则引擎基于真实数据推演，非投资指导。`,
      points, signals: [], rating, ratingCls, signal, net, bullW, bearW, confidence, completeness: Math.round(completeness * 100), pos, posTxt, posNote,
      holder, watcher, stops, tps, entryRules, monitors, alt, riskList, rationale, stopPx, rr,
      sups: sups.slice(0, 3), ress: ress.slice(0, 3),
      bull: bull.slice(0, 8), bear: bear.slice(0, 8)
    };
  }

  /* ---------- 任务控制 ---------- */
  let _running = null;
  const onUpdate = () => { if (V.holdings && V.holdings._paint) V.holdings._paint(); };

  function start(code, date, cfgIn, name) {
    code = (code || '').trim();
    if (!/^\d{6}$/.test(code) && !/^(sh|sz|bj)\d{6}$/i.test(code)) { UI.toast('请输入正确的 6 位股票代码'); return null; }
    if (_running) { UI.toast('已有任务在运行，请先暂停或停止'); return null; }
    const c = cfg();
    if (cfgIn) { Object.assign(c, cfgIn); Store.set('ana_cfg', c); }
    const t = {
      _id: Store.uid(), code, name: name || '', date: date || DT.today(), cfg: c,
      status: 'running', stage: 'base', done: {}, report: null,
      createdAt: DT.stamp(), updatedAt: DT.stamp(), err: ''
    };
    saveTask(t);
    _running = t._id;
    _run(t._id);
    return t._id;
  }
  function pause(id) { const t = getTask(id); if (t && t.status === 'running') { t.status = 'paused'; saveTask(t); if (_running === id) _running = null; onUpdate(); UI.toast('已暂停（在跑的网络请求完成后生效）'); } }
  function resume(id) {
    const t = getTask(id);
    if (!t || (t.status !== 'paused' && t.status !== 'stopped' && t.status !== 'error')) return;
    if (_running) { UI.toast('已有任务在运行'); return; }
    t.status = 'running'; saveTask(t);
    _running = id;
    _run(id);
    onUpdate();
  }
  function stop(id) { const t = getTask(id); if (t && (t.status === 'running' || t.status === 'paused')) { t.status = 'stopped'; saveTask(t); if (_running === id) _running = null; onUpdate(); UI.toast('已停止（已完成模块保留，可随时恢复续跑）'); } }
  function del(id) {
    if (_running === id) { UI.toast('任务运行中，请先停止'); return; }
    Store.set('ana_tasks', tasks().filter(x => x._id !== id));
    onUpdate();
  }
  /* V4：一键重跑（同代码/同口径/同风控配置发起新任务，旧报告留痕历史记录） */
  function rerun(id) {
    const t = getTask(id);
    if (!t) return null;
    if (_running) { UI.toast('已有任务在运行，请先暂停或停止'); return null; }
    if (t.cfg) Store.set('ana_cfg', t.cfg);
    return start(t.code, t.date, null, t.name);
  }
  const alive = id => { const t = getTask(id); return t && t.status === 'running'; };

  async function _run(id) {
    const t = getTask(id);
    if (!t) { _running = null; return; }
    try {
      /* 阶段 0：数据底座 */
      let base = t._base;
      if (!base) {
        t.stage = 'base'; saveTask(t); onUpdate();
        base = await buildBase(t);
        t._base = {
          px: base.px, stage: base.stage, amount: base.amount,
          zt: base.zt ? { lbc: base.zt.lbc, hybk: base.zt.hybk, fund: base.zt.fund, fbt: base.zt.fbt, zbc: base.zt.zbc } : null,
          lb: base.lb ? { net: base.lb.net, reason: base.lb.reason || '', date: base.mkt.lhb.date } : null,
          secUp: base.secUpHit ? { name: base.secUpHit.name, chgPct: base.secUpHit.chgPct, netInflow: base.secUpHit.netInflow, leader: base.secUpHit.leader } : null,
          secDn: base.secDnHit ? { name: base.secDnHit.name, chgPct: base.secDnHit.chgPct } : null,
          web: { fund: base.web.fund, predict: base.web.predict, news: (base.web.news || []).slice(0, 6) },
          deep: base.deep, flashN: base.flashHits.length, code6: base.code6,
          rzrq: base._rzrq || null,
          ths: base.ths, pxCheck: base.pxCheck,
          quality: base.quality || []
        };
        saveTask(t);
        // base 中的大对象只在本次运行内存中保留；恢复任务时重建
      }
      if (!alive(id)) { _running = null; onUpdate(); return; }

      /* 阶段 1：模块 1-7 并行 */
      t.stage = 'modules'; saveTask(t); onUpdate();
      const loaders = { tech: modTech, sentiment: modSentiment, news: modNews, fundamental: modFundamental, policy: modPolicy, capital: modCapital, lift: modLift };
      // 恢复场景：base 大对象需重建（若 _base 是精简版则重新拉一次底座供模块使用）
      let fullBase = base;
      if (!fullBase.mkt) fullBase = await buildBase(t);
      await Promise.all(Object.keys(loaders).map(async mid => {
        const cur = getTask(id);
        if (!cur || cur.done[mid]) return;
        cur.done[mid] = { status: 'running', at: DT.stamp() };
        saveTask(cur); onUpdate();
        try {
          const res = await loaders[mid](fullBase, cur);
          const c2 = getTask(id);
          if (c2) { c2.done[mid] = Object.assign({ status: 'done', at: DT.stamp() }, res); saveTask(c2); }
        } catch (e) {
          const c2 = getTask(id);
          if (c2) { c2.done[mid] = { status: 'error', at: DT.stamp(), summary: '模块执行失败：' + e.message, points: [], signals: [] }; saveTask(c2); }
        }
        onUpdate();
      }));
      if (!alive(id)) { _running = null; onUpdate(); return; }

      /* 阶段 2：多空辩论 */
      let c3 = getTask(id);
      c3.stage = 'debate'; saveTask(c3); onUpdate();
      c3.done.debate = { status: 'running', at: DT.stamp() }; saveTask(c3); onUpdate();
      const deb = modDebate(fullBase, c3);
      c3 = getTask(id);
      c3.done.debate = Object.assign({ status: 'done', at: DT.stamp() }, deb); saveTask(c3); onUpdate();
      if (!alive(id)) { _running = null; onUpdate(); return; }

      /* 阶段 3：风险校验 + 最终报告 */
      c3.done.risk = { status: 'running', at: DT.stamp() }; saveTask(c3); onUpdate();
      const risk = modRisk(fullBase, c3);
      c3 = getTask(id);
      c3.done.risk = Object.assign({ status: 'done', at: DT.stamp() }, risk);
      c3.report = {
        finishedAt: DT.stamp(),
        name: c3.name, code: c3.code, date: c3.date,
        rating: risk.rating, ratingCls: risk.ratingCls, signal: risk.signal,
        net: risk.net, bullW: risk.bullW, bearW: risk.bearW,
        confidence: risk.confidence, posTxt: risk.posTxt,
        base: c3._base
      };
      c3.status = 'done'; c3.stage = 'done';
      delete c3._base;
      saveTask(c3);
      Store.set('ana_view', c3._id); // 新股分析完成直接显示新报告，旧报告留痕历史记录
      _running = null;
      onUpdate();
      UI.toast(`「${c3.name || c3.code}」九大模块分析完成：${risk.signal.en}（${risk.signal.cn}）· 仓位 ${risk.posTxt}`);
    } catch (e) {
      const c = getTask(id);
      if (c) { c.status = 'error'; c.err = e.message; saveTask(c); }
      _running = null;
      onUpdate();
      UI.toast('分析任务出错：' + e.message);
    }
  }

  return { MODULES, tasks, getTask, start, pause, resume, stop, del, rerun, cfg, resolveStock, runningId: () => _running };
})();

/* ============================================================
   V.holdings · 九大模块分析系统界面 V3（覆盖旧版）
   ============================================================ */
V.holdings = {
  title: '个股逻辑拆解',
  desc: '九大模块并行 → 数据校验 → 多空证伪辩论 → 风险终审 → 落地报告 · 全部真实数据，拉不到如实标注',

  _paint() { App.refresh(); },

  /* ---------- 报告渲染（V3：信号横幅+仓位 → 最终建议 → 行情概览 → 七模块折叠 → 辩论 → 数据校验附录） ---------- */
  reportHtml(t) {
    const d = t.done || {}, b = (t.report && t.report.base) || t._base || {};
    const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const wd = ds => { try { return WD[new Date(String(ds).slice(0, 10) + 'T00:00:00').getDay()]; } catch (e) { return ''; } };
    const tbl = (cols, rows) => `<table class="ana-tbl"><thead><tr>${cols.map(c => `<th>${UI.esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r2 => `<tr>${r2.map(c => `<td>${UI.esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const pts = m => (m && m.points && m.points.length) ? `<ul class="ana-pts">${m.points.map(p => `<li>${UI.esc(p)}</li>`).join('')}</ul>` : '';
    /* 信号标签带可信度等级（A/B/C）与层级（趋势/波动） */
    const sigTags = m => (m && m.signals && m.signals.length) ? `<div class="ana-sigs">${m.signals.map(s => `<span class="ana-sig ${s.side}">${s.side === 'bull' ? '多' : s.side === 'bear' ? '空' : '中'} · ${UI.esc(s.text)}${s.src ? `<i>${UI.esc(s.src)} · ${s.grade || 'B'}级${s.level === 'swing' ? ' · 波动级' : ''}${s.win ? ' · 经验胜率 ' + UI.esc(s.win) + '（非回测）' : ''}</i>` : ''}</span>`).join('')}</div>` : '';
    /* 被过滤假信号清单（反造假） */
    const filteredBlk = m => (m && m.filtered && m.filtered.length) ? `
      <div class="ana-sub" style="margin-top:8px">🧹 已过滤假信号（${m.filtered.length} 条 · 反造假机制，不计入评分）</div>
      <ul class="ana-pts">${m.filtered.map(x => `<li>🚫 ${UI.esc(x)}</li>`).join('')}</ul>` : '';
    /* 模块能力边界声明 */
    const boundsBlk = m => (m && m.bounds) ? `<div class="rv-line" style="margin-top:6px">🔒 <b>能力边界</b>：${UI.esc(m.bounds)}</div>` : '';
    const tbls = m => (m && m.tables && m.tables.length) ? m.tables.map((tb, i2) => `
      <div class="ana-sub"><span class="ana-sub-n">${i2 + 1}</span> ${UI.esc(tb.title)}</div>
      ${tbl(tb.cols, tb.rows)}
      ${(tb.notes || []).length ? `<ul class="ana-pts">${tb.notes.map(n2 => `<li>${UI.esc(n2)}</li>`).join('')}</ul>` : ''}`).join('') : '';
    const modBlk = (m, withSigs) => (m && m.status === 'done')
      ? `<div class="ana-sum">${UI.esc(m.summary || '')}</div>${tbls(m)}${pts(m)}${withSigs !== false ? sigTags(m) : ''}${filteredBlk(m)}${boundsBlk(m)}`
      : `<div class="sub">该模块${m && m.status === 'error' ? '执行失败（' + UI.esc(m.summary || '') + '）' : '未完成'}</div>`;
    const newsLinks = m => (m && m.items && m.items.length) ? `<div class="sl-news">${m.items.map(n2 => `<a class="news-link" href="${UI.esc(n2.url)}" target="_blank" rel="noopener noreferrer">${UI.esc(n2.title)}</a><span class="sub"> ${UI.esc((n2.media || '') + ' ' + (n2.date || ''))}</span>`).join('<br>')}</div>` : '';
    const fold = (icon, title, inner, open, extra) => `
      <details class="ana-fold" ${open ? 'open' : ''}><summary>${icon} ${UI.esc(title)}${extra ? `<span class="sub">　${UI.esc(extra)}</span>` : ''}</summary><div class="ana-fold-bd">${inner}</div></details>`;

    const rk = d.risk;
    /* ① TRADING SIGNAL 大横幅（V3：含仓位档位与可信度）；
       兼容旧版报告：risk 无 signal 字段时降级展示，不抛异常（白屏根因修复） */
    const dlBtns = `
      <div class="ana-dl">
        <button class="btn btn-sm btn-pink" id="anaImg_${t._id}">🖼 保存报告卡（精简版）</button>
        <button class="btn btn-sm btn-ghost" id="anaMd_${t._id}">⬇ 下载完整 Markdown</button>
      </div>`;
    const banner = (rk && rk.status === 'done' && rk.signal) ? `
      <div class="ana-banner ${rk.signal.cls}">
        <div class="ana-banner-k">TRADING SIGNAL</div>
        <div class="ana-banner-s">${rk.signal.en}</div>
        <div class="ana-banner-sub">${UI.esc(t.code)} ${UI.esc(t.name || '')} · ${UI.esc(t.date)} · ${rk.signal.cn} · 评级「${rk.rating}」 · 仓位 ${rk.posTxt || '—'} · 可信度 ${rk.confidence != null ? rk.confidence + '/100' : '—'}</div>
      </div>
      <div class="ana-banner-note">⚠️ 本报告由本地规则引擎基于真实数据自动生成，信号经可信度加权与假信号过滤，仅供学习研究，不构成投资建议。</div>
      ${dlBtns}` : (rk && rk.status === 'done') ? `
      <div class="ana-banner">
        <div class="ana-banner-k">TRADING SIGNAL</div>
        <div class="ana-banner-s">—</div>
        <div class="ana-banner-sub">${UI.esc(t.code)} ${UI.esc(t.name || '')} · ${UI.esc(t.date)} · 评级「${UI.esc(rk.rating || '—')}」 · 可信度 ${rk.confidence != null ? rk.confidence + '/100' : '—'}</div>
      </div>
      <div class="ana-banner-note">⚠️ 该报告由旧版本引擎生成，缺少信号字段，已按兼容模式降级展示；建议点击「🔁 重跑」用 V4 引擎重新生成完整报告。</div>
      ${dlBtns}` : '<div class="sub">风险模块未完成，信号未生成</div>';

    /* ①.5 一页速览（V5 反冗余：核心结论与关键数据一屏掌握，明细全部下沉折叠模块，每行可溯源） */
    const tk0 = b.deep && b.deep.tech, vl0 = b.deep && b.deep.val;
    const find1 = re => (((rk && rk.points) || []).find(p => re.test(p)) || '');
    const ov2 = [];
    if (rk && rk.status === 'done' && rk.signal) {
      ov2.push(['🎯 最终结论', `${rk.signal.en}（${rk.signal.cn}）· 评级「${rk.rating}」· 建议仓位 ${rk.posTxt || '—'} · 可信度 ${rk.confidence != null ? rk.confidence + '/100' : '—'}`]);
      const winM = find1(/胜率区间/).match(/胜率区间 (\d+%~\d+%)/);
      const rrM = find1(/赔率测算|赔率闸门/).match(/盈亏比[^\d]*([\d.]+)\s*:1/);
      ov2.push(['📐 胜率 × 赔率', `经验胜率 ${winM ? winM[1] : '—'}（规则经验口径非回测）· 盈亏比 ${rrM ? rrM[1] + ':1' : '—'}${rk.posNote || ''}`]);
      ov2.push(['⚖️ 多空比分', `多 ${rk.bullW} vs 空 ${rk.bearW}（净 ${rk.net > 0 ? '+' : ''}${rk.net} · A/B/C 可信度加权，波动级减半）`]);
    }
    if (tk0 && tk0.close != null) ov2.push(['💰 价格与趋势', `${tk0.close} 元（${tk0.date} 收盘${b.pxCheck && b.pxCheck.ok ? '，双源一致✅' : ''}）· MA20 ${tk0.ma20 != null ? tk0.ma20 + ' 元（' + (tk0.close >= tk0.ma20 ? '站上' : '跌破') + '）' : '—'} · 52周位置 ${tk0.pos52 != null ? tk0.pos52 + '%' : '—'} · 近5日 ${tk0.chg5 != null ? (tk0.chg5 > 0 ? '+' : '') + tk0.chg5 + '%' : '—'}`]);
    if (vl0) {
      const peBad0 = vl0.pe != null && (vl0.pe > 200 || vl0.pe <= 0);
      ov2.push(['🏷 估值锚', peBad0 ? `PE(TTM) ${vl0.pe} 微利失真不作锚 · 以 PB 为锚：${vl0.pb != null ? vl0.pb : '—'}（近一年 ${vl0.pbPct != null ? vl0.pbPct + '%' : '—'} 分位）` : `PE(TTM) ${vl0.pe != null ? vl0.pe + '（' + (vl0.pePct != null ? vl0.pePct + '%' : '—') + ' 分位）' : '—（亏损不适用）'} · PB ${vl0.pb != null ? vl0.pb + '（' + (vl0.pbPct != null ? vl0.pbPct + '%' : '—') + ' 分位）' : '—'}`]);
    }
    const sup1 = find1(/^核心支撑：/), pre1 = find1(/^主要压制：/), swan1 = find1(/^黑天鹅扫描：/);
    if (sup1) ov2.push(['🐂 核心支撑', sup1.replace(/^核心支撑：/, '')]);
    if (pre1) ov2.push(['🐻 主要压制', pre1.replace(/^主要压制：/, '')]);
    if (swan1) ov2.push(['🦢 黑天鹅', swan1.replace(/^黑天鹅扫描：/, '')]);
    if (rk && rk.completeness != null) ov2.push(['🧪 数据通道', `可用率 ${rk.completeness}%（失败通道已降级并如实标注，详见「四、数据校验与误差溯源」）`]);
    const glance = ov2.length ? `
      <div class="ana-sec">
        <div class="ana-sec-t">⚡ 一页速览 <span class="sub">核心结论一屏掌握 · 每行均可溯源到下方对应模块 · 明细默认折叠</span></div>
        ${tbl(['维度', '结论'], ov2)}
      </div>` : '';

    /* ② 最终投资建议（V3：六级行动——持仓/空仓/入场条件/止损止盈/监测触发/替代配置）；
       兼容旧版报告：数组字段缺失时以占位项兜底 */
    const arr1 = x => (Array.isArray(x) && x.length) ? x : ['—（旧版报告无此字段）'];
    const advice = (rk && rk.status === 'done' && rk.signal) ? `
      <div class="ana-sec">
        <div class="ana-sec-t">📊 最终投资建议 <span class="sub">Recommendation: ${rk.signal.en}（${rk.signal.cn}）· 仓位 ${rk.posTxt || '—'}</span></div>
        <div class="rv-line"><b>Rationale</b>：${UI.esc(rk.rationale || '')}</div>
        ${(rk.points || []).length ? `<ul class="ana-pts" style="margin-top:6px">${rk.points.map(p => `<li>${UI.esc(p)}</li>`).join('')}</ul>` : ''}
        ${(rk.sups && rk.sups.length) || (rk.ress && rk.ress.length) ? `
        <div class="ana-sub" style="margin-top:8px">关键价位（真实摆动高低点 + 均线，可对照行情软件复核）</div>
        ${tbl(['类型', '价位', '依据'], (rk.ress || []).map(x => ['压力位', x.p + ' 元', x.tag]).concat((rk.sups || []).map(x => ['支撑位', x.p + ' 元', x.tag])))}` : ''}
        <div class="ana-sub" style="margin-top:8px">Strategic Actions</div>
        <div class="ana-acts">
          <div class="ana-act"><span class="ana-act-n">1</span><div><b>现有持仓</b>：${arr1(rk.holder).map(x => UI.esc(x)).join('；')}</div></div>
          <div class="ana-act"><span class="ana-act-n">2</span><div><b>场外观望者</b>：${arr1(rk.watcher).map(x => UI.esc(x)).join('；')}</div></div>
          <div class="ana-act"><span class="ana-act-n">3</span><div><b>入场条件清单</b>：${arr1(rk.entryRules).map(x => UI.esc(x)).join('；')}</div></div>
          <div class="ana-act"><span class="ana-act-n">4</span><div><b>止损点位（绝对点位）</b>：${arr1(rk.stops).map(x => UI.esc(x)).join('；')}</div></div>
          <div class="ana-act"><span class="ana-act-n">5</span><div><b>止盈分批区间</b>：${arr1(rk.tps).map(x => UI.esc(x)).join('；')}</div></div>
          <div class="ana-act"><span class="ana-act-n">6</span><div><b>监测指标与触发条件</b>：${arr1(rk.monitors).map(x => UI.esc(x)).join('；')}</div></div>
        </div>
        <div class="rv-line">🔄 <b>替代配置</b>：${arr1(rk.alt).map(x => UI.esc(x)).join('；')}</div>
        <div class="rv-line">⚠️ <b>风险清单</b>：${arr1(rk.riskList).map(x => UI.esc(x)).join('；')}</div>
      </div>` : '';

    /* ③ 行情概览（V3：含阶段涨跌幅与量价定性结论） */
    const px = b.px, tech = b.deep && b.deep.tech, ex = b.deep && b.deep.extra;
    const close0 = px && px.price != null ? px.price : (tech ? tech.close : null);
    const close = close0 != null && isFinite(parseFloat(close0)) ? parseFloat(close0) : null;
    const ovRows = [];
    if (close != null) ovRows.push(['最新收盘价', close.toFixed(2) + ' 元' + (px && px.chgPct != null ? `（${UI.sign(px.chgPct, 2, '%')}）` : '')]);
    if (tech && tech.date) ovRows.push(['最新交易日', `${tech.date}（${wd(tech.date)}）`]);
    if (close != null && ex && ex.open != null && isFinite(parseFloat(ex.open)) && px && px.chgPct != null) ovRows.push(['当日涨跌幅', `${UI.sign(px.chgPct, 2, '%')}（开盘 ${parseFloat(ex.open).toFixed(2)} → 收盘 ${close.toFixed(2)}）`]);
    if (tech && tech.chg5 != null) ovRows.push(['阶段涨跌幅', `近5日 ${tech.chg5 > 0 ? '+' : ''}${tech.chg5}% · 近10日 ${tech.chg10 != null ? (tech.chg10 > 0 ? '+' : '') + tech.chg10 + '%' : '—'} · 近30日 ${tech.chg30 != null ? (tech.chg30 > 0 ? '+' : '') + tech.chg30 + '%' : '—'}`]);
    if (ex && ex.chg30 != null && close != null && ex.from30) ovRows.push(['近30日累计明细', `${ex.chg30 > 0 ? '+' : ''}${ex.chg30}%（从 ${ex.from30} 收盘 ${ex.close30} 元${ex.chg30 >= 0 ? '上涨至' : '下跌至'} ${close.toFixed(2)} 元）`]);
    if (tech && tech.volState) ovRows.push(['量价结构定性', `${tech.volState}（口径：涨跌幅阈值 ±0.3%，量比阈值 1.5/0.8）`]);
    if (b.deep && b.deep.val && b.deep.val.mcap != null) ovRows.push(['总市值', b.deep.val.mcap + ' 亿（东财 ' + b.deep.val.date + '）']);
    if (tech && tech.avgAmt20 != null) ovRows.push(['近20日日均成交额', `约 ${tech.avgAmt20} 亿（K线量×价近似口径，供流动性测算）`]);
    if (b.pxCheck) ovRows.push(['价格双源交叉验证', b.pxCheck.text]);
    ovRows.push(['行情数据来源', '腾讯证券实时行情（web.ifzq.gtimg.cn 日K/周K，前复权）+ 同花顺实时行情（d.10jqka.com.cn）· 技术指标由本地按真实K线计算（MA/MACD/KDJ/RSI/背离/缠绕度），可对照任意行情软件复核']);
    const volChk = [];
    if (ex && ex.avgV5 != null && ex.avgV20 != null && ex.avgV20 > 0) {
      const r2 = Math.round(ex.avgV5 / ex.avgV20 * 1000) / 10;
      const wan = v2 => (v2 / 1e4).toFixed(1) + ' 万手';
      volChk.push(`近5日平均成交量：${wan(ex.avgV5)}`);
      volChk.push(`近20日平均成交量：${wan(ex.avgV20)}`);
      const pxChg = px && px.chgPct != null ? px.chgPct : null;
      const volState = r2 > 115 ? '明显放量' : r2 < 85 ? '明显缩量' : '基本持平';
      const combo = pxChg == null ? '' : (r2 < 85 && pxChg < 0 ? '，呈缩量下跌态势（抛压衰减但承接亦不足）' : r2 > 115 && pxChg > 0 ? '，呈放量上涨态势（增量资金进场）' : r2 > 115 && pxChg < 0 ? '，呈放量下跌态势（筹码松动）' : r2 < 85 && pxChg > 0 ? '，呈缩量上涨态势（动能存疑）' : '');
      volChk.push(`5日/20日均量比：${r2}% → 成交量${volState}${combo}`);
    } else volChk.push('量能数据未获取，无法验证');
    const chips = [];
    if (b.zt) chips.push(`<span class="tag tag-red">今日涨停 · ${b.zt.lbc || 1} 连板 · ${UI.esc(b.zt.hybk || '未分类')}</span>`);
    if (b.secUp) chips.push(`<span class="tag tag-red">板块 ${UI.esc(b.secUp.name)} ${UI.sign(b.secUp.chgPct, 2, '%')}</span>`);
    if (b.secDn) chips.push(`<span class="tag tag-green">板块 ${UI.esc(b.secDn.name)} ${UI.sign(b.secDn.chgPct, 2, '%')}</span>`);
    if (b.lb) chips.push(`<span class="tag ${b.lb.net >= 0 ? 'tag-red' : 'tag-green'}">龙虎榜净${b.lb.net >= 0 ? '买' : '卖'} ${Math.abs(b.lb.net)} 亿</span>`);
    if (b.stage) chips.push(`<span class="tag ${b.stage === '退潮' || b.stage === '冰点' ? 'tag-green' : 'tag-amber'}">大盘 · ${b.stage}</span>`);
    if (tech && tech.pos52 != null) chips.push(`<span class="tag">52周位置 ${tech.pos52}%</span>`);
    const overview = `
      ${ovRows.length ? tbl(['项目', '数据'], ovRows) : '<div class="sub">行情数据未获取（代码可能有误）</div>'}
      <div class="ana-sub" style="margin-top:8px">量价关系检查：</div>
      <ul class="ana-pts">${volChk.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>
      ${chips.length ? `<div class="ana-ov" style="margin-top:8px">${chips.join(' ')}</div>` : ''}
      <div class="sub" style="margin-top:6px">分析标的：${UI.esc(t.name || '—')}（${UI.esc(t.code)}） · 分析日期 ${UI.esc(t.date)}${t.date < DT.today() ? '（历史日期：K线/行情以最新可得数据为准，非历史回测，如实标注）' : ''} · 完成于 ${UI.esc((t.report && t.report.finishedAt) || t.updatedAt)}</div>`;

    /* ④ 新闻舆情（V3：检索概况 + 时间切片 + 比例表 + TOP3事件 + 主题榜） */
    const nw = d.news;
    const newsHtml = (nw && nw.status === 'done') ? (() => {
      const st = nw.stats || {};
      const repr = st.repr || {};
      const total = st.total || 0;
      const pct = n2 => total ? Math.round(n2 / total * 100) + '%' : '—';
      const ratioTbl = total ? tbl(['情绪分类', '数量', '占比', '代表内容'], [
        ['🔴 负面', String(st.neg || 0), pct(st.neg || 0), repr.neg || '—'],
        ['🟢 正面', String(st.pos || 0), pct(st.pos || 0), repr.pos || '—'],
        ['⚪ 中性', String(st.neu || 0), pct(st.neu || 0), repr.neu || '—']
      ]) : '';
      const sl = st.slice || {};
      const sliceTbl = (total && sl.d1 && sl.d3 && sl.d7) ? tbl(['时间切片', '正向', '负向', '中性'], [
        ['当日', String(sl.d1.pos || 0), String(sl.d1.neg || 0), String(sl.d1.neu || 0)],
        ['近3日', String(sl.d3.pos || 0), String(sl.d3.neg || 0), String(sl.d3.neu || 0)],
        ['近7日', String(sl.d7.pos || 0), String(sl.d7.neg || 0), String(sl.d7.neu || 0)]
      ]) : '';
      const top3Html = (nw.top3 && nw.top3.length) ? `
        <div class="ana-sub" style="margin-top:10px">TOP ${nw.top3.length} 核心舆情事件（按影响级别加权排序，已剔除口水新闻）</div>
        ${nw.top3.map((e, i2) => `
          <div class="ana-theme">
            <div class="ana-theme-t">${['🥇', '🥈', '🥉'][i2]} 《${UI.esc(e.title)}》 <span class="ana-sig ${e.dir === 'pos' ? 'bull' : e.dir === 'neg' ? 'bear' : ''}">${e.dir === 'pos' ? '正面' : e.dir === 'neg' ? '负面' : '中性'} · ${UI.esc(e.lv)}</span></div>
            <ul class="ana-pts"><li>来源：${UI.esc((e.media || '') + ' ' + (e.date || ''))}${e.content ? ' · ' + UI.esc(e.content) : ''}</li></ul>
          </div>`).join('')}` : '';
      const medals = ['🥇', '🥈', '🥉'];
      const themeHtml = (nw.themes && nw.themes.length) ? `
        <div class="ana-sub" style="margin-top:10px">排名前 ${nw.themes.length} 的舆情主题</div>
        ${nw.themes.map((th, i2) => `
          <div class="ana-theme">
            <div class="ana-theme-t">${medals[i2]} 第 ${i2 + 1} 位：${UI.esc(th.name)} <span class="ana-sig ${th.dir === 'pos' ? 'bull' : th.dir === 'neg' ? 'bear' : ''}">${th.dir === 'pos' ? '正面' : th.dir === 'neg' ? '负面' : '中性'} · ${th.count || 0} 条</span></div>
            <ul class="ana-pts">
              <li>来源：${UI.esc(th.src)}</li>
              <li>核心内容：《${UI.esc(th.title)}》${th.content && th.content !== th.title ? '——' + UI.esc(th.content) : ''}</li>
              ${th.delta ? `<li>边际变化：${UI.esc(th.delta)}</li>` : ''}
              <li>情绪影响：${UI.esc(th.impact)}</li>
            </ul>
          </div>`).join('')}` : '';
      return `
        <div class="ana-sum">${UI.esc(nw.summary || '')}</div>
        <div class="ana-sub">新闻检索概况</div>
        ${tbl(['项目', '数值'], [['有效新闻条数', String(total) + ' 条'], ['权威源（监管/三大报/主流财经）', String(st.authN != null ? st.authN : '—') + ' 条（正 ' + (st.authPos || 0) + ' / 负 ' + (st.authNeg || 0) + '）'], ['非权威源（仅参考不直接计分）', String(st.authN != null ? total - st.authN : '—') + ' 条'], ['通稿去重剔除', String(st.dupes || 0) + ' 条'], ['泛相关剔除', String(st.dropped || 0) + ' 条'], ['同名干扰剔除', String(st.nameConf || 0) + ' 条' + (st.confNames && st.confNames.length ? '（如 ' + st.confNames.join('、') + '）' : '')], ['时间范围', st.range || '—'], ['数据来源', st.sources || '—']])}
        ${sliceTbl ? `<div class="ana-sub" style="margin-top:10px">舆情时间切片（当日 / 近3日 / 近7日）</div>${sliceTbl}` : ''}
        ${ratioTbl ? `<div class="ana-sub" style="margin-top:10px">正面 / 负面 / 中性新闻比例</div>${ratioTbl}` : ''}
        ${nw.concl ? `<div class="rv-line">${UI.esc(nw.concl)}</div>` : ''}
        ${top3Html}
        ${themeHtml}
        ${boundsBlk(nw)}
        <div class="ana-sub" style="margin-top:10px">原文链接（可逐条核对）</div>
        ${newsLinks(nw) || '<div class="sub">无</div>'}`;
    })() : '<div class="sub">舆情模块未完成</div>';

    /* ⑤ 多空辩论（多方 / 空方 / 研究经理 三Tab + 有效论据与漏洞清单） */
    const deb = d.debate;
    const essay = arr => (Array.isArray(arr) ? arr : []).map(s => {
      if (typeof s === 'string') return `<p class="ana-essay-p">${UI.esc(s)}</p>`;
      const paras = s && Array.isArray(s.paras) ? s.paras : [];
      return `<div class="ana-essay-h">${UI.esc(s && s.h || '')}</div>${paras.map(p => `<p class="ana-essay-p">${UI.esc(p)}</p>`).join('')}`;
    }).join('');
    const debHtml = (deb && deb.status === 'done') ? `
      <div class="ana-sum">${UI.esc(deb.summary)}</div>
      ${(deb.validBull && deb.validBull.length) || (deb.validBear && deb.validBear.length) ? `
      <div class="ana-sub" style="margin-top:8px">证伪后有效论据（成立 = 有跨模块同向旁证且非规则推断）</div>
      ${tbl(['阵营', '有效论据'], (deb.validBull || []).slice(0, 4).map(x => ['🐂 多方', x]).concat((deb.validBear || []).slice(0, 4).map(x => ['🐻 空方', x])))}` : ''}
      ${(deb.flaws && deb.flaws.length) ? `
      <div class="ana-sub" style="margin-top:8px">逻辑漏洞清单（${deb.flaws.length} 条 · 双方互查，可证伪）</div>
      <ul class="ana-pts">${deb.flaws.slice(0, 8).map(x => `<li>🕳 ${UI.esc(x)}</li>`).join('')}</ul>` : ''}
      <details class="ana-fold"><summary>📖 完整论述（多方 / 空方 / 研究经理三视角长文 · 点击展开）</summary><div class="ana-fold-bd">
      <div class="ana-dtabs" id="anaDebate">
        <button class="ana-dtab on" data-dtab="bull">🐂 多方</button>
        <button class="ana-dtab" data-dtab="bear">🐻 空方</button>
        <button class="ana-dtab" data-dtab="mgr">⚖️ 研究经理</button>
      </div>
      <div class="ana-dpanel" data-dpanel="bull">${essay(deb.bullEssay)}</div>
      <div class="ana-dpanel" data-dpanel="bear" style="display:none">${essay(deb.bearEssay)}</div>
      <div class="ana-dpanel" data-dpanel="mgr" style="display:none">${essay(deb.mgrEssay)}</div>
      </div></details>
      <details class="ana-fold"><summary>📜 辩论实录（${(deb.dialog || []).length} 条攻防对话 · 每条带证伪结论）</summary>
        <div class="ana-debate" style="margin-top:8px">
          ${(deb.dialog || []).map(x => `<div class="ana-dline ${x.side}"><span class="ana-dtag">${x.side === 'bull' ? '🐂 多方研究员' : '🐻 空方研究员'} · 第${x.round}轮</span><div>${UI.esc(x.text)}</div></div>`).join('')}
        </div>
      </details>`
      : '<div class="sub">辩论模块未完成</div>';

    /* ⑥ 数据校验与误差溯源（V3 新增章节） */
    const quality = (b.quality || []);
    const qOk = quality.filter(x => x.ok).length;
    const qualityHtml = quality.length ? `
      <div class="ana-sum">数据通道可用率 ${Math.round(qOk / quality.length * 100)}%（${qOk}/${quality.length}）；所有失败通道已在对应模块降级处理并如实标注，未编造任何数据。</div>
      ${tbl(['数据通道', '状态', '时效 / 误差说明'], quality.map(x => [x.name, x.ok ? '✅ 可用' : '❌ 不可用', x.note || '—']))}
      <div class="rv-line" style="margin-top:8px">📐 <b>系统边界声明</b>：①本系统为本地规则引擎，非远程大模型，所有结论可复算；②胜率区间为规则经验口径，非统计回测；③K线为前复权口径，盘中价与收盘价存在时点差异；④浏览器通道无法获取逐笔委托/资产负债表明细/筹码分布，相关维度一律标注能力边界；⑤历史日期分析以最新可得数据为准，非历史回测。</div>` : '<div class="sub">数据校验信息未生成</div>';

    return `
      ${banner}
      ${glance}
      ${advice}
      <div class="ana-sec"><div class="ana-sec-t">📋 一、行情概览</div>${overview}</div>
      <div class="ana-sec">
        <div class="ana-sec-t">🗂 二、多维分析模块 <span class="sub">七个子报告 · 点击展开/收起 · 每条信号带可信度等级</span></div>
        ${fold('📈', '技术分析', modBlk(d.tech), false, '排列/斜率/乖离率 · 背离钝化 · 量能确认 · 震荡过滤')}
        ${fold('🌡️', '市场情绪', modBlk(d.sentiment), false, '五级量化评级 · 两融 · 散户筹码')}
        ${fold('📰', '新闻舆情', newsHtml, false, '时间切片 · 通稿去重 · TOP3事件')}
        ${fold('🏦', '基本面', modBlk(d.fundamental), false, '扣非剥离 · 时效校验 · 估值百分位')}
        ${fold('🏛️', '政策分析', modBlk(d.policy), false, '匹配度分级 · 落地/预期/传闻')}
        ${fold('🐉', '游资追踪', modBlk(d.capital), false, '连续行为 · 席位性质 · 大宗折溢价')}
        ${fold('🔓', '解禁减持', modBlk(d.lift), false, '刚性/软性分级 · 冲击测算')}
      </div>
      <div class="ana-sec"><div class="ana-sec-t">⚔️ 三、多空辩论 <span class="sub">逐条证伪 · 孤证识别 · 漏洞清单 · 本地规则引擎模拟 · 非远程大模型</span></div>${debHtml}</div>
      <div class="ana-sec"><div class="ana-sec-t">🧪 四、数据校验与误差溯源 <span class="sub">通道状态 · 时效 · 系统边界</span></div>${qualityHtml}</div>`;
  },

  /* ---------- 报告渲染安全网：旧版本数据/异常字段不拖垮整页 ---------- */
  safeReport(t) {
    try { return this.reportHtml(t); }
    catch (e) {
      console.warn('report render error', t && t._id, e);
      return `
        <div class="ana-err">
          <div class="ana-sum">⚠️ 该报告由旧版本引擎生成，数据结构与当前 V4 渲染不兼容，已自动降级保护（${UI.esc(e && e.message || '未知错误')}）。</div>
          <div class="ana-pts" style="margin-top:6px">建议操作：点击「🔁 重跑」用 V4 引擎按原代码原口径重新生成；或「🗑 删除」该历史记录。您的其他数据不受影响。</div>
          <div class="ana-task-ops" style="margin-top:10px">
            <button class="btn btn-sm btn-pink" id="anaRerun_${t._id}">🔁 重跑</button>
            <button class="btn btn-sm btn-ghost" id="anaDel_${t._id}">🗑 删除</button>
          </div>
        </div>`;
    }
  },

  /* ---------- 任务卡 ---------- */
  taskCard(t) {
    const mods = Ana.MODULES;
    const doneN = mods.filter(m => t.done && t.done[m.id] && t.done[m.id].status === 'done').length;
    const stMap = { running: ['🟢 运行中', 'up'], paused: ['⏸ 已暂停', 'amber'], stopped: ['⏹ 已停止', 'down'], done: ['✅ 已完成', 'up'], error: ['❌ 出错', 'down'] };
    const [stTxt, stCls] = stMap[t.status] || ['—', ''];
    const chip = m => {
      const r2 = t.done && t.done[m.id];
      const st = r2 ? r2.status : (t.status === 'running' && (t.stage === 'modules' || t.stage === 'debate') ? 'wait' : 'idle');
      const ic = st === 'done' ? '✅' : st === 'running' ? '⏳' : st === 'error' ? '❌' : '·';
      return `<span class="ana-mchip ${st}">${ic} ${m.icon}${m.name}</span>`;
    };
    return `
      <div class="ana-task ${t.status}">
        <div class="ana-task-hd">
          <b>${UI.esc(t.name || '（解析中…）')}</b><span class="sub">${UI.esc(t.code)} · 分析日期 ${UI.esc(t.date)}</span>
          <span class="tag tag-${stCls === 'up' ? 'red' : stCls === 'down' ? 'green' : 'amber'}">${stTxt}</span>
          ${t.report && t.report.signal ? `<span class="tag tag-${t.report.signal.cls === 'up' ? 'red' : t.report.signal.cls === 'down' ? 'green' : 'amber'}">${t.report.signal.en} ${t.report.signal.cn}</span>` : ''}
          ${t.report && t.report.posTxt ? `<span class="tag">仓位 ${UI.esc(t.report.posTxt)}</span>` : ''}
          <span class="sub" style="margin-left:auto">${doneN}/9 模块 · ${UI.esc(t.updatedAt)}</span>
        </div>
        <div class="ana-mrow">${mods.map(chip).join('')}</div>
        ${t.err ? `<div class="sub" style="color:var(--up)">${UI.esc(t.err)}</div>` : ''}
        <div class="ana-task-ops">
          ${t.status === 'running' ? `<button class="btn btn-sm btn-ghost" id="anaPause_${t._id}">⏸ 暂停</button><button class="btn btn-sm btn-ghost" id="anaStop_${t._id}">⏹ 停止</button>` : ''}
          ${t.status === 'paused' || t.status === 'stopped' || t.status === 'error' ? `<button class="btn btn-sm btn-pink" id="anaResume_${t._id}">▶ 恢复续跑</button>` : ''}
          ${t.status === 'done' ? `<button class="btn btn-sm btn-pink" id="anaView_${t._id}">📄 查看报告</button><button class="btn btn-sm btn-ghost" id="anaRerun_${t._id}">🔁 重跑</button><button class="btn btn-sm btn-ghost" id="anaImg_${t._id}">🖼 报告卡</button>` : ''}
          <button class="btn btn-sm btn-ghost" id="anaDel_${t._id}">🗑 删除</button>
        </div>
      </div>`;
  },

  render() {
    const list = Ana.tasks();
    const active = list.filter(t => t.status === 'running' || t.status === 'paused' || t.status === 'stopped' || t.status === 'error');
    const done = list.filter(t => t.status === 'done');
    const cfg = Ana.cfg();
    const cur = done.find(t => Store.get('ana_view', '') === t._id) || done[0];
    const running = Ana.runningId();
    return `
      ${UI.kpi([
        { label: '历史报告', value: done.length, delta: '全部可回溯' },
        { label: '未完成任务', value: active.length, delta: active.length ? '可恢复续跑' : '无', dir: active.length ? 'up' : '' },
        { label: '分析引擎', value: '<span style="font-size:13px">本地规则引擎 V4</span>', delta: '证伪式辩论 · 非远程大模型' },
        { label: '防造假机制', value: '9 重', delta: '双源验证/量能确认/通稿去重/名称过滤/同名消歧/孤证降级/时效校验/赔率闸门/权威源分级' }
      ])}

      ${UI.card({
        title: '🚀 新建分析任务',
        sub: '输入股票代码与分析日期启动 · 九大模块并行采集真实数据 → 数据校验 → 多空证伪辩论 → 风险终审 → 落地报告',
        body: `
        <div class="sl-addbar">
          <input id="anaCode" class="sl-inp" placeholder="代码或名称，如 002413 / 雷科防务" style="min-width:220px">
          <input id="anaDate" class="sl-inp" type="date" value="${DT.today()}">
          <button class="btn btn-pink" id="anaStart" ${running ? 'disabled' : ''}>▶ 开始分析</button>
        </div>
        <details class="ana-cfg" style="margin-top:10px">
          <summary class="sub">⚙️ 模型配置（引擎参数 · 本系统为本地规则引擎，无远程大模型，参数决定数据窗口、辩论轮数与风控口径）</summary>
          <div class="ana-cfg-grid">
            <label>分析深度
              <select id="anaDepth">
                <option value="standard" ${cfg.depth === 'standard' ? 'selected' : ''}>标准（常规数据通道）</option>
                <option value="deep" ${cfg.depth === 'deep' ? 'selected' : ''}>深度（更长新闻窗口 + 更多辩论轮）</option>
              </select></label>
            <label>K线样本
              <select id="anaKline">
                <option value="160" ${cfg.kline == 160 ? 'selected' : ''}>160 日</option>
                <option value="320" ${cfg.kline == 320 ? 'selected' : ''}>320 日（推荐）</option>
              </select></label>
            <label>新闻窗口
              <select id="anaNewsDays">
                <option value="7" ${cfg.newsDays == 7 ? 'selected' : ''}>近 7 天</option>
                <option value="30" ${cfg.newsDays == 30 ? 'selected' : ''}>近 30 天（推荐）</option>
                <option value="90" ${cfg.newsDays == 90 ? 'selected' : ''}>近 90 天</option>
              </select></label>
            <label>辩论轮数
              <select id="anaRounds">
                <option value="2" ${cfg.rounds == 2 ? 'selected' : ''}>2 轮</option>
                <option value="3" ${cfg.rounds == 3 ? 'selected' : ''}>3 轮（推荐）</option>
                <option value="4" ${cfg.rounds == 4 ? 'selected' : ''}>4 轮</option>
              </select></label>
            <label>风控严格等级
              <select id="anaRiskLevel">
                <option value="loose" ${cfg.riskLevel === 'loose' ? 'selected' : ''}>宽松（仓位升一档）</option>
                <option value="standard" ${!cfg.riskLevel || cfg.riskLevel === 'standard' ? 'selected' : ''}>标准（推荐）</option>
                <option value="strict" ${cfg.riskLevel === 'strict' ? 'selected' : ''}>严格（仓位降一档）</option>
              </select></label>
          </div>
        </details>
        <div class="sub" style="margin-top:8px">铁律：所有结论来自腾讯行情×同花顺行情（双源交叉验证）/ 东财数据中心 / 融资融券 / 全网新闻 / 五通道快讯等真实数据；拉不到的维度在报告中如实标注「无法验证」并附误差溯源表；技术信号经量能确认过滤、新闻经通稿去重与名称过滤、辩论逐条证伪并输出逻辑漏洞清单——全部为本地规则引擎，非远程大模型。</div>`
      })}

      ${active.length ? `<div class="card"><div class="card-body">
        <div class="section-title">⏱ 任务状态（未完成任务 ${active.length} 个 · 可暂停 / 恢复 / 停止）</div>
        ${active.map(t => this.taskCard(t)).join('')}
      </div></div>` : ''}

      ${cur ? `<div class="card"><div class="card-body">
        <div class="section-title">📄 完整分析报告 · ${UI.esc(cur.name || cur.code)}（${UI.esc(cur.code)}）
          <span class="sub">　分析日期 ${UI.esc(cur.date)} · 完成于 ${UI.esc(cur.report ? cur.report.finishedAt : cur.updatedAt)}</span>
        </div>
        ${this.safeReport(cur)}
      </div></div>` : (!active.length ? `<div class="card"><div class="card-body">
        <div class="empty"><span class="ei">🔬</span>还没有分析报告。在上方输入股票代码或名称（如 002413 或 雷科防务）点「开始分析」，系统将并行运行九大模块生成完整报告。</div>
      </div></div>` : '')}

      ${done.length ? `<div class="card"><div class="card-body">
        <div class="section-title">🗂 历史记录（${done.length} 份报告 · 点击可回溯）</div>
        ${done.map(t => `<div class="ana-his ${cur && cur._id === t._id ? 'cur' : ''}">
          <b>${UI.esc(t.name || '—')}</b><span class="sub">${UI.esc(t.code)} · ${UI.esc(t.date)}</span>
          ${t.report && t.report.signal ? `<span class="tag tag-${t.report.signal.cls === 'up' ? 'red' : t.report.signal.cls === 'down' ? 'green' : 'amber'}">${t.report.signal.en} ${t.report.signal.cn}</span>` : ''}
          ${t.report ? `<span class="sub">评级「${t.report.rating}」净 ${t.report.net > 0 ? '+' : ''}${t.report.net}${t.report.confidence != null ? ' · 可信度 ' + t.report.confidence : ''}</span>` : ''}
          <span style="margin-left:auto;display:flex;gap:6px">
            <button class="btn btn-sm btn-pink" id="anaView_${t._id}">查看</button>
            <button class="btn btn-sm btn-ghost" id="anaRerun_${t._id}">🔁 重跑</button>
            <button class="btn btn-sm btn-ghost" id="anaImg_${t._id}">🖼</button>
            <button class="btn btn-sm btn-ghost" id="anaDel_${t._id}">🗑</button>
          </span>
        </div>`).join('')}
      </div></div>` : ''}`;
  },

  /* ---------- 报告 → Markdown（V3 全字段） ---------- */
  mdDoc(t) {
    const d = t.done || {}, r2 = t.report || {};
    const L = [];
    L.push(`# ${t.name || ''}（${t.code}）九大模块分析报告（V4 精准版）`);
    L.push(`> 过儿的工作台 · 分析日期 ${t.date} · 生成于 ${r2.finishedAt || t.updatedAt} · 本地规则引擎基于真实数据推演，非投资指导\n`);
    const mPts = m => (m && m.points ? m.points : []).map(p => `- ${p}`).join('\n');
    const mSig = m => (m && m.signals && m.signals.length) ? '\n' + m.signals.map(s => `- [${s.side === 'bull' ? '多' : s.side === 'bear' ? '空' : '中'}|${s.grade || 'B'}级${s.level === 'swing' ? '|波动级' : ''}${s.win ? '|胜率 ' + s.win + '(经验口径)' : ''}] ${s.text}${s.src ? '（' + s.src + '）' : ''}`).join('\n') : '';
    const mFil = m => (m && m.filtered && m.filtered.length) ? '\n\n已过滤假信号：\n' + m.filtered.map(x => `- 🚫 ${x}`).join('\n') : '';
    const mBnd = m => (m && m.bounds) ? `\n\n> 能力边界：${m.bounds}` : '';
    const mTbl = m => (m && m.tables ? m.tables : []).map(tb => `\n### ${tb.title}\n| ${tb.cols.join(' | ')} |\n| ${tb.cols.map(() => '---').join(' | ')} |\n${tb.rows.map(rw => '| ' + rw.join(' | ') + ' |').join('\n')}\n${(tb.notes || []).map(n2 => '- ' + n2).join('\n')}`).join('\n');
    if (d.risk && d.risk.status === 'done') {
      const rk = d.risk;
      L.push(`\n## TRADING SIGNAL：${rk.signal.en}（${rk.signal.cn}）· 评级「${rk.rating}」· 仓位 ${rk.posTxt || '—'} · 可信度 ${rk.confidence != null ? rk.confidence + '/100' : '—'}\n`);
      L.push(`**Rationale**：${rk.rationale || ''}\n`);
      if ((rk.sups && rk.sups.length) || (rk.ress && rk.ress.length)) {
        L.push(`**关键价位**\n${(rk.ress || []).map(x => `- 压力位 ${x.p} 元（${x.tag}）`).join('\n')}\n${(rk.sups || []).map(x => `- 支撑位 ${x.p} 元（${x.tag}）`).join('\n')}\n`);
      }
      L.push(`**Strategic Actions**\n1. 现有持仓：${rk.holder.join('；')}\n2. 场外观望者：${rk.watcher.join('；')}\n3. 入场条件清单：${rk.entryRules.join('；')}\n4. 止损点位：${rk.stops.join('；')}\n5. 止盈分批：${rk.tps.join('；')}\n6. 监测触发条件：${rk.monitors.join('；')}\n`);
      L.push(`**替代配置**：${rk.alt.join('；')}\n`);
      L.push(`**风险清单**：${rk.riskList.join('；')}\n`);
    }
    L.push('\n## 一、行情概览\n');
    const b = r2.base || {};
    if (b.px && b.px.price != null) L.push(`- 最新收盘价 ${b.px.price.toFixed(2)} 元（${UI.sign(b.px.chgPct, 2, '%')}）`);
    if (b.pxCheck) L.push(`- 价格双源交叉验证：${b.pxCheck.text}`);
    L.push('- 行情来源：腾讯证券实时行情 + 同花顺实时行情（d.10jqka.com.cn），技术指标本地按真实K线计算');
    if (b.deep && b.deep.tech) { const t2 = b.deep.tech; L.push(`- 最新交易日 ${t2.date}；近5日 ${t2.chg5 != null ? t2.chg5 + '%' : '—'} / 近10日 ${t2.chg10 != null ? t2.chg10 + '%' : '—'} / 近30日 ${t2.chg30 != null ? t2.chg30 + '%' : '—'}；量价结构「${t2.volState || '—'}」`); }
    const sec = (title, m) => { if (m && m.status === 'done') L.push(`\n## ${title}\n${m.summary || ''}\n${mTbl(m)}\n${mPts(m)}${mSig(m)}${mFil(m)}${mBnd(m)}`); };
    sec('二、技术分析', d.tech);
    sec('三、市场情绪', d.sentiment);
    if (d.news && d.news.status === 'done') {
      const nw = d.news, st = nw.stats || {};
      L.push(`\n## 四、新闻舆情\n${nw.summary || ''}\n- 有效 ${st.total || 0} 条（去重通稿 ${st.dupes || 0} / 泛相关剔除 ${st.dropped || 0} / 同名干扰剔除 ${st.nameConf || 0}${st.confNames && st.confNames.length ? '：' + st.confNames.join('、') : ''}），范围 ${st.range || '—'}，来源 ${st.sources || '—'}`);
      if (st.slice) L.push(`- 时间切片：当日 正${st.slice.d1.pos}/负${st.slice.d1.neg}/中${st.slice.d1.neu} · 近3日 正${st.slice.d3.pos}/负${st.slice.d3.neg}/中${st.slice.d3.neu} · 近7日 正${st.slice.d7.pos}/负${st.slice.d7.neg}/中${st.slice.d7.neu}`);
      L.push(`- 负面 ${st.neg}（${st.total ? Math.round(st.neg / st.total * 100) : 0}%）：${st.repr ? st.repr.neg : ''}`);
      L.push(`- 正面 ${st.pos}（${st.total ? Math.round(st.pos / st.total * 100) : 0}%）：${st.repr ? st.repr.pos : ''}`);
      L.push(`- 中性 ${st.neu}（${st.total ? Math.round(st.neu / st.total * 100) : 0}%）：${st.repr ? st.repr.neu : ''}`);
      if (nw.concl) L.push(nw.concl);
      (nw.top3 || []).forEach((e, i2) => L.push(`\n### TOP${i2 + 1} 舆情事件：${e.title}（${e.dir === 'neg' ? '负面' : e.dir === 'pos' ? '正面' : '中性'} · ${e.lv}）\n- 来源：${e.media} ${e.date}`));
      (nw.themes || []).forEach((th, i2) => L.push(`\n### 主题 ${i2 + 1}：${th.name}（${th.dir === 'neg' ? '负面' : th.dir === 'pos' ? '正面' : '中性'} · ${th.count} 条）\n- 来源：${th.src}\n- 核心内容：《${th.title}》${th.content && th.content !== th.title ? '——' + th.content : ''}${th.delta ? '\n- 边际变化：' + th.delta : ''}\n- 情绪影响：${th.impact}`));
      (nw.items || []).forEach(n2 => L.push(`- [${n2.title}](${n2.url})（${n2.media} ${n2.date}）`));
      if (nw.bounds) L.push(`\n> 能力边界：${nw.bounds}`);
    }
    sec('五、基本面', d.fundamental);
    sec('六、政策分析', d.policy);
    sec('七、游资追踪', d.capital);
    sec('八、解禁减持', d.lift);
    if (d.debate && d.debate.status === 'done') {
      const deb = d.debate;
      const es = (t3, arr) => `\n### ${t3}\n` + (arr || []).map(s => `**${s.h}**\n${s.paras.map(p => p).join('\n\n')}`).join('\n\n');
      L.push(`\n## 九、多空辩论（逐条证伪 · 本地规则引擎模拟 · 非远程大模型）\n${deb.summary}`);
      if (deb.flaws && deb.flaws.length) L.push(`\n**逻辑漏洞清单**\n${deb.flaws.slice(0, 8).map(x => '- 🕳 ' + x).join('\n')}`);
      L.push(es('🐂 多方', deb.bullEssay) + '\n' + es('🐻 空方', deb.bearEssay) + '\n' + es('⚖️ 研究经理', deb.mgrEssay));
    }
    if (b.quality && b.quality.length) {
      L.push(`\n## 十、数据校验与误差溯源\n| 数据通道 | 状态 | 时效/误差说明 |\n| --- | --- | --- |\n${b.quality.map(x => `| ${x.name} | ${x.ok ? '✅' : '❌'} | ${x.note || '—'} |`).join('\n')}`);
      L.push('\n> 系统边界：本地规则引擎非大模型；胜率区间为经验口径非回测；前复权口径；浏览器通道无逐笔委托/资产负债表明细/筹码分布；历史日期分析非历史回测。');
    }
    return L.join('\n');
  },

  /* ---------- 报告 → 长图（V3 全字段） ---------- */
  imageDoc(t) {
    const d = t.done || {}, r2 = t.report || {};
    const sec = [];
    const rows = m => (m && m.points ? m.points : []).map(p => ([{ text: '· ', bold: true }, { text: p }]));
    const sigs = m => (m && m.signals ? m.signals : []).map(s => ([{ text: (s.side === 'bull' ? '多 · ' : s.side === 'bear' ? '空 · ' : '中 · ') + (s.grade || 'B') + '级 ', bold: true, dir: s.side === 'bull' ? 'up' : s.side === 'bear' ? 'down' : '' }, { text: s.text + (s.src ? '（' + s.src + (s.win ? ' · 经验胜率 ' + s.win + '，非回测' : '') + '）' : '') }]));
    const fils = m => (m && m.filtered ? m.filtered : []).map(x => ([{ text: '🚫 已过滤 ', bold: true, dir: 'down' }, { text: x }]));
    const b = r2.base || {};
    const chips = [];
    if (b.px && b.px.price != null) chips.push({ label: '现价', value: b.px.price.toFixed(2) + ' ' + (b.px.chgPct != null ? UI.sign(b.px.chgPct, 2, '%') : ''), dir: b.px.chgPct > 0 ? 'up' : b.px.chgPct < 0 ? 'down' : '' });
    if (b.zt) chips.push({ label: '涨停', value: (b.zt.lbc || 1) + ' 连板 ' + (b.zt.hybk || ''), dir: 'up' });
    if (b.secUp) chips.push({ label: b.secUp.name, value: UI.sign(b.secUp.chgPct, 2, '%'), dir: 'up' });
    if (b.stage) chips.push({ label: '大盘情绪', value: b.stage, dir: (b.stage === '退潮' || b.stage === '冰点') ? 'down' : 'amber' });
    if (r2.signal) chips.push({ label: '最终信号', value: r2.signal.en + ' ' + r2.signal.cn, dir: r2.signal.cls === 'up' ? 'up' : r2.signal.cls === 'down' ? 'down' : 'amber' });
    if (r2.posTxt) chips.push({ label: '仓位建议', value: r2.posTxt, dir: 'amber' });
    if (r2.confidence != null) chips.push({ label: '可信度', value: r2.confidence + '/100', dir: r2.confidence >= 60 ? 'up' : r2.confidence < 45 ? 'down' : 'amber' });
    sec.push({ title: `行情概览（分析日期 ${t.date} · 完成于 ${r2.finishedAt || t.updatedAt}）`, blocks: [{ t: 'chips', items: chips }] });
    const push = (title, m, withSigs) => {
      if (!m || m.status !== 'done') return;
      const blocks = [{ t: 'text', text: m.summary || '' }];
      if (m.tables && m.tables.length) m.tables.forEach(tb => {
        blocks.push({ t: 'rows', items: tb.rows.map(rw => ([{ text: rw[0] + '：', bold: true }, { text: rw.slice(1).join(' · ') }])) });
      });
      blocks.push({ t: 'rows', items: rows(m) });
      if (withSigs !== false && m.signals && m.signals.length) blocks.push({ t: 'rows', items: sigs(m) });
      if (m.filtered && m.filtered.length) blocks.push({ t: 'rows', items: fils(m) });
      if (m.bounds) blocks.push({ t: 'text', text: '🔒 能力边界：' + m.bounds });
      sec.push({ title, blocks });
    };
    push('二、技术分析', d.tech);
    push('三、市场情绪', d.sentiment);
    push('四、新闻舆情', d.news, false);
    if (d.news && d.news.status === 'done' && d.news.stats) {
      const st = d.news.stats, nw = d.news;
      const blocks = [{ t: 'rows', items: [
        [{ text: '检索概况：', bold: true }, { text: `有效 ${st.total} 条（去重 ${st.dupes || 0}/剔除 ${st.dropped || 0}） · ${st.range} · 来源 ${st.sources}` }],
        [{ text: '负面 ', bold: true, dir: 'down' }, { text: `${st.neg} 条（${st.total ? Math.round(st.neg / st.total * 100) : 0}%）— ${st.repr.neg}` }],
        [{ text: '正面 ', bold: true, dir: 'up' }, { text: `${st.pos} 条（${st.total ? Math.round(st.pos / st.total * 100) : 0}%）— ${st.repr.pos}` }],
        [{ text: '中性 ', bold: true }, { text: `${st.neu} 条 — ${st.repr.neu}` }]
      ] }];
      if (st.slice) blocks.push({ t: 'rows', items: [[{ text: '时间切片：', bold: true }, { text: `当日 正${st.slice.d1.pos}/负${st.slice.d1.neg}/中${st.slice.d1.neu} · 近3日 正${st.slice.d3.pos}/负${st.slice.d3.neg}/中${st.slice.d3.neu} · 近7日 正${st.slice.d7.pos}/负${st.slice.d7.neg}/中${st.slice.d7.neu}` }]] });
      if (nw.concl) blocks.push({ t: 'text', text: nw.concl });
      (nw.top3 || []).forEach((e, i2) => blocks.push({ t: 'rows', items: [
        [{ text: `TOP${i2 + 1} `, bold: true, dir: e.dir === 'neg' ? 'down' : e.dir === 'pos' ? 'up' : '' }, { text: `《${e.title}》（${e.lv}）` }]
      ] }));
      (nw.themes || []).forEach((th, i2) => blocks.push({ t: 'rows', items: [
        [{ text: `主题${i2 + 1} ${th.name} `, bold: true, dir: th.dir === 'neg' ? 'down' : th.dir === 'pos' ? 'up' : '' }, { text: `（${th.count} 条）${th.src}` }],
        [{ text: '· 情绪影响：', bold: true }, { text: th.impact }]
      ] }));
      sec.push({ title: '四、舆情专题（切片 / 比例 / TOP事件 / 主题榜）', blocks });
    }
    push('五、基本面', d.fundamental);
    push('六、政策分析', d.policy);
    push('七、游资追踪', d.capital);
    push('八、解禁减持', d.lift);
    if (d.debate && d.debate.status === 'done') {
      const dblocks = [
        { t: 'rows', items: (d.debate.dialog || []).map(x => ([{ text: (x.side === 'bull' ? '🐂多方 ' : '🐻空方 ') + 'R' + x.round + '：', bold: true, dir: x.side === 'bull' ? 'up' : 'down' }, { text: x.text }])) },
        { t: 'text', text: '⚖️ ' + d.debate.verdict }
      ];
      if (d.debate.flaws && d.debate.flaws.length) dblocks.push({ t: 'rows', items: d.debate.flaws.slice(0, 6).map(x => ([{ text: '🕳 ', bold: true }, { text: x }])) });
      sec.push({ title: '九、多空辩论（逐条证伪 · 本地规则引擎模拟）', blocks: dblocks });
    }
    if (d.risk && d.risk.status === 'done') {
      const rk = d.risk;
      sec.push({ title: `十、风险评估与最终建议：${rk.signal.en}（${rk.signal.cn}）· 评级「${rk.rating}」· 仓位 ${rk.posTxt || '—'} · 可信度 ${rk.confidence != null ? rk.confidence + '/100' : '—'}`, blocks: [
        { t: 'rows', items: rk.points.map(p => ([{ text: '· ', bold: true }, { text: p }])) },
        { t: 'rows', items: (rk.ress || []).map(x => ([{ text: '压力位 ', bold: true, dir: 'down' }, { text: x.p + ' 元（' + x.tag + '）' }])).concat((rk.sups || []).map(x => ([{ text: '支撑位 ', bold: true, dir: 'up' }, { text: x.p + ' 元（' + x.tag + '）' }]))) },
        { t: 'rows', items: rk.holder.map(p => ([{ text: '💼 ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.watcher.map(p => ([{ text: '👀 ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.entryRules.map(p => ([{ text: '✅ ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.stops.map(p => ([{ text: '🛑 ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.tps.map(p => ([{ text: '🎯 ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.monitors.map(p => ([{ text: '📡 ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.alt.map(p => ([{ text: '🔄 ', bold: true }, { text: p }])) },
        { t: 'rows', items: rk.riskList.map(p => ([{ text: '⚠️ ', bold: true }, { text: p }])) },
        { t: 'text', text: '本报告由本地规则引擎基于真实数据推演生成，拉不到的维度已如实标注；仅为数据推演纪律，非投资指导。' }
      ] });
    }
    if (b.quality && b.quality.length) {
      sec.push({ title: '十一、数据校验与误差溯源', blocks: [{ t: 'rows', items: b.quality.map(x => ([{ text: x.ok ? '✅ ' : '❌ ', bold: true, dir: x.ok ? 'up' : 'down' }, { text: x.name + ' — ' + (x.note || '—') }])) }] });
    }
    return { title: `${t.name || '未命名'}（${t.code}）九大模块分析报告`, sub: `过儿的工作台 · 个股逻辑拆解 V4 · 分析日期 ${t.date} · ${r2.finishedAt || t.updatedAt}`, filename: `九大模块分析_${t.name || t.code}_${t.date}`, sections: sec };
  },

  /* ---------- 报告 → 精简报告卡（V5：一页速览式长图——精简·真实·有效，替代冗长全量长图） ---------- */
  imageDocLite(t) {
    const d = t.done || {}, r2 = t.report || {}, b = r2.base || t._base || {};
    const rk = d.risk || {};
    const tk = b.deep && b.deep.tech, vl = b.deep && b.deep.val;
    const A1 = x => (Array.isArray(x) && x.length) ? x : [];
    const find1 = re => ((rk.points || []).find(p => re.test(p)) || '');
    const row = (k, v, dir) => ([{ text: k + ' ', bold: true, dir: dir || '' }, { text: v }]);

    /* 头部 chips：信号 / 仓位 / 可信度 / 现价 / 大盘情绪 */
    const chips = [];
    if (r2.signal) chips.push({ label: '最终信号', value: r2.signal.en + ' ' + r2.signal.cn, dir: r2.signal.cls === 'up' ? 'up' : r2.signal.cls === 'down' ? 'down' : 'amber' });
    if (r2.rating) chips.push({ label: '评级', value: r2.rating, dir: 'amber' });
    if (r2.posTxt) chips.push({ label: '仓位建议', value: r2.posTxt, dir: 'amber' });
    if (r2.confidence != null) chips.push({ label: '可信度', value: r2.confidence + '/100', dir: r2.confidence >= 60 ? 'up' : r2.confidence < 45 ? 'down' : 'amber' });
    if (b.px && b.px.price != null) chips.push({ label: '现价', value: (+b.px.price).toFixed(2) + ' ' + (b.px.chgPct != null ? UI.sign(b.px.chgPct, 2, '%') : '') + (b.pxCheck && b.pxCheck.ok ? '（双源✅）' : ''), dir: b.px.chgPct > 0 ? 'up' : b.px.chgPct < 0 ? 'down' : '' });
    if (b.stage) chips.push({ label: '大盘情绪', value: b.stage, dir: (b.stage === '退潮' || b.stage === '冰点') ? 'down' : 'amber' });

    /* 核心结论 */
    const core = [];
    const winM = find1(/胜率区间/).match(/胜率区间 (\d+%~\d+%)/);
    const rrM = find1(/赔率测算|赔率闸门/).match(/盈亏比[^\d]*([\d.]+)\s*:1/);
    core.push(row('⚖️ 多空比分', `多 ${r2.bullW != null ? r2.bullW : '—'} vs 空 ${r2.bearW != null ? r2.bearW : '—'}（净 ${r2.net != null ? (r2.net > 0 ? '+' : '') + r2.net : '—'} · 可信度加权）`));
    core.push(row('📐 胜率×赔率', `经验胜率 ${winM ? winM[1] : '—'}（规则口径非回测）· 盈亏比 ${rrM ? rrM[1] + ':1' : '—'}`));
    if (tk && tk.close != null) core.push(row('💰 价格趋势', `${tk.close} 元（${tk.date}）· MA20 ${tk.ma20 != null ? tk.ma20 + '（' + (tk.close >= tk.ma20 ? '站上' : '跌破') + '）' : '—'} · 52周位 ${tk.pos52 != null ? tk.pos52 + '%' : '—'} · 近5日 ${tk.chg5 != null ? (tk.chg5 > 0 ? '+' : '') + tk.chg5 + '%' : '—'}`));
    if (vl) {
      const peBad = vl.pe != null && (vl.pe > 200 || vl.pe <= 0);
      core.push(row('🏷 估值锚', peBad ? `PE(TTM) ${vl.pe} 微利失真不作锚 · PB ${vl.pb != null ? vl.pb : '—'}（${vl.pbPct != null ? vl.pbPct + '%' : '—'} 分位）` : `PE ${vl.pe != null ? vl.pe + '（' + (vl.pePct != null ? vl.pePct + '%' : '—') + '分位）' : '—'} · PB ${vl.pb != null ? vl.pb + '（' + (vl.pbPct != null ? vl.pbPct + '%' : '—') + '分位）' : '—'}`));
    }
    const sup1 = find1(/^核心支撑：/), pre1 = find1(/^主要压制：/), swan1 = find1(/^黑天鹅扫描：/);
    if (sup1) core.push(row('🐂 核心支撑', sup1.replace(/^核心支撑：/, ''), 'up'));
    if (pre1) core.push(row('🐻 主要压制', pre1.replace(/^主要压制：/, ''), 'down'));
    if (swan1) core.push(row('🦢 黑天鹅', swan1.replace(/^黑天鹅扫描：/, '')));

    /* 关键价位与纪律（可执行） */
    const act = [];
    A1(rk.ress).slice(0, 2).forEach(x => act.push(row('压力位', x.p + ' 元（' + x.tag + '）', 'down')));
    A1(rk.sups).slice(0, 2).forEach(x => act.push(row('支撑位', x.p + ' 元（' + x.tag + '）', 'up')));
    A1(rk.stops).slice(0, 1).forEach(x => act.push(row('🛑 止损', x)));
    A1(rk.entryRules).slice(0, 2).forEach(x => act.push(row('✅ 入场', x)));

    /* 风险清单 top3 */
    const risks = A1(rk.riskList).slice(0, 3).map(x => row('⚠️', x, 'down'));

    const qN = (b.quality || []).length, qOk = (b.quality || []).filter(x => x.ok).length;
    const sec = [
      { title: `核心结论（分析日期 ${t.date} · ${r2.finishedAt || t.updatedAt || ''}）`, blocks: [{ t: 'chips', items: chips }, { t: 'rows', items: core }] },
      { title: '关键价位与执行纪律', blocks: [{ t: 'rows', items: act.length ? act : [row('—', '数据不足，以机械纪律为准（成本价下方 5%~7% 止损）')] }] },
      { title: '风险清单（前 3 条）', blocks: [{ t: 'rows', items: risks.length ? risks : [row('—', '无显著风险信号')] }] },
      { title: '数据校验', blocks: [{ t: 'text', text: `数据通道可用率 ${qN ? Math.round(qOk / qN * 100) : '—'}%（${qOk}/${qN}）· 拉不到的维度已如实标注「无法验证」· 本地规则引擎非远程大模型 · 仅供研究非投资指导` }] }
    ];
    return { title: `${t.name || '未命名'}（${t.code}）投研报告卡`, sub: `过儿的工作台 · 个股逻辑拆解 · 精简版一页速览 · 每行均可溯源`, filename: `报告卡_${t.name || t.code}_${t.date}`, sections: sec };
  },

  mount() {
    const $ = id => document.getElementById(id);
    const start = $('anaStart');
    if (start) start.onclick = async () => {
      const raw = (($('anaCode') || {}).value || '').trim();
      if (!raw) { UI.toast('请输入股票代码或名称'); return; }
      const date = ($('anaDate') || {}).value || DT.today();
      const depth = ($('anaDepth') || {}).value || 'standard';
      const cfgIn = {
        depth,
        kline: parseInt(($('anaKline') || {}).value || '320', 10),
        newsDays: depth === 'deep' ? Math.max(90, parseInt(($('anaNewsDays') || {}).value || '30', 10)) : parseInt(($('anaNewsDays') || {}).value || '30', 10),
        rounds: depth === 'deep' ? 4 : parseInt(($('anaRounds') || {}).value || '3', 10),
        riskLevel: ($('anaRiskLevel') || {}).value || 'standard'
      };
      start.disabled = true;
      try {
        UI.toast(/^\d{6}$/.test(raw) ? '正在启动分析…' : `正在解析「${raw}」…`);
        const r2 = await Ana.resolveStock(raw).catch(() => null);
        if (!r2) { UI.toast(`未找到「${raw}」对应的A股标的，请检查名称或直接输入 6 位代码`); return; }
        if (r2.cand && r2.cand.length > 1) UI.toast(`模糊匹配到 ${r2.name}（候选：${r2.cand.join('、')}），如不符请直接输入代码`);
        Ana.start(r2.code, date, cfgIn, r2.name);
        App.refresh();
      } finally { start.disabled = false; }
    };
    // 多空辩论三Tab切换
    const dtabs = $('anaDebate');
    if (dtabs) dtabs.onclick = e => {
      const btn = e.target.closest('[data-dtab]');
      if (!btn) return;
      dtabs.querySelectorAll('.ana-dtab').forEach(x => x.classList.toggle('on', x === btn));
      const root = dtabs.parentElement;
      root.querySelectorAll('[data-dpanel]').forEach(p => { p.style.display = p.dataset.dpanel === btn.dataset.dtab ? '' : 'none'; });
    };
    Ana.tasks().forEach(t => {
      const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
      bind('anaPause_' + t._id, () => Ana.pause(t._id));
      bind('anaStop_' + t._id, () => Ana.stop(t._id));
      bind('anaResume_' + t._id, () => { Ana.resume(t._id); App.refresh(); });
      bind('anaView_' + t._id, () => { Store.set('ana_view', t._id); App.refresh(); window.scrollTo(0, 0); });
      bind('anaRerun_' + t._id, () => { if (Ana.rerun(t._id)) { UI.toast('已按原口径发起重跑'); App.refresh(); } });
      bind('anaDel_' + t._id, () => {
        if (!confirm(`确定删除「${t.name || t.code}」（${t.date}）的分析任务/报告吗？删除后不可恢复。`)) return;
        Ana.del(t._id);
      });
      bind('anaImg_' + t._id, () => { try { Snapshot.show(this.imageDocLite(t)); } catch (e) { console.warn('imageDocLite error', e); UI.toast('该报告为旧版本数据，暂不支持导出报告卡，请先「重跑」'); } });
      bind('anaMd_' + t._id, () => {
        let md;
        try { md = this.mdDoc(t); } catch (e) { console.warn('mdDoc error', e); UI.toast('该报告为旧版本数据，暂不支持导出 Markdown，请先「重跑」'); return; }
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `九大模块分析_${t.name || t.code}_${t.date}.md`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        UI.toast('Markdown 已导出');
      });
    });
  }
};
