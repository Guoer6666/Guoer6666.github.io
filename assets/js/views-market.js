/* ============================================================
   views-market.js · A股每日复盘（一）
   全球隔夜要闻 / 夜盘美股 / 日韩股市 / 次日展望 / 市场情绪
   ============================================================ */
const V = {};   // 全局视图注册表（views-market2 / views-life 继续挂载）

/* ---------- 公共小工具 ---------- */
const MK = {
  quoteCard(q) {
    if (!q || q.price == null) {
      return `<div class="quote"><div class="name">${UI.esc(q ? q.label : '--')}</div>
        <div class="price flat">--</div>
        <div class="chg flat">${q && q.failed ? '暂无数据' : '读取中…'}</div>
        ${q && q.failed ? '<div class="meta">数据源不可达，可稍后刷新</div>' : ''}</div>`;
    }
    const cls = UI.dirCls(q.chgPct);
    const dec = q.price >= 1000 ? 2 : (q.price >= 10 ? 2 : 4);
    return `<div class="quote">
      <div class="name">${UI.esc(q.label)}${q.stale ? '<span class="tag tag-gray" style="font-size:9px;padding:0 5px">缓存</span>' : ''}</div>
      <div class="price ${cls}">${q.price.toFixed(dec)}</div>
      <div class="chg ${cls}">${UI.sign(q.chg, dec)} &nbsp;${UI.sign(q.chgPct, 2, '%')}</div>
      <div class="meta">${q.time ? UI.esc(q.time) : (q.src ? UI.esc(q.src) : '')}</div>
    </div>`;
  },
  grid(qs, keys, mini) {
    return `<div class="quote-grid${mini ? ' mini' : ''}">${keys.map(k => MK.quoteCard(qs[k])).join('')}</div>`;
  },
  loadingGrid(n, mini) {
    return `<div class="quote-grid${mini ? ' mini' : ''}">${Array(n).fill(0).map(() =>
      `<div class="quote"><div class="name">加载中</div><div class="price flat">--</div><div class="chg flat">···</div></div>`).join('')}</div>`;
  },
  briefList(items) {
    if (!items || !items.length) return `<div class="empty"><span class="ei">📡</span>行情数据加载中或暂不可用</div>`;
    return `<div class="news-list">${items.map(t => `
      <div class="news-item"><div class="nt"><span class="dot"></span><h4>${UI.esc(t)}</h4></div></div>`).join('')}</div>`;
  },
  stamp(extra) {
    return `<span class="sub">更新于 ${DT.clock()}${extra ? ' · ' + extra : ''}</span>`;
  }
};

/* ============================================================
   ① 全球 & 隔夜外围热点简报
   ============================================================ */
const OVERSEAS = {
  idx: ['dji', 'ixic', 'spx', 'n225', 'ks11', 'hsi', 'hstech', 'dax', 'ftse', 'cac'],
  cmt: ['wti', 'brent', 'gold'],
  fx: ['usdcnh']
};
V.overnight = {
  title: '全球 & 隔夜外围热点简报',
  desc: '隔夜重磅 & 盘中催化 · 真实快讯自动分类 · 当日要闻自动小结',
  render() {
    const opt = { cat: Store.get('news_cat', 'all'), hotOnly: Store.get('news_hot', false) };

    return `
      ${UI.card({
        title: '🔥 隔夜重磅 & 盘中催化',
        sub: '东财/新浪/央视财经/官方媒体 真实快讯聚合 · 自动分类 · 点标题跳原文',
        right: `<span class="stamp" id="newsStamp">读取中…</span>
                <button class="btn btn-sm btn-ghost" data-act="reload-news">刷新</button>`,
        tight: true,
        body: `
          <div id="newsChipsWrap">${News.renderChips(null, opt)}</div>
          <div id="newsFlash"><div class="flash-empty">正在拉取真实快讯…</div></div>`
      })}

      ${UI.card({
        title: '🧠 当日要闻自动小结',
        sub: '基于全量快讯自动统计 · 结合实时行情印证',
        tight: true,
        body: `<div id="newsDigest"><div class="flash-empty">快讯加载后自动生成</div></div>`
      })}

      ${UI.card({
        title: '🌍 外围指数实时',
        sub: '指数 / 商品 / 汇率 · 腾讯源实时',
        right: `<button class="btn btn-sm btn-ghost" data-act="reload-overnight">刷新</button>`,
        tight: true,
        body: `
          <div id="ovIdxGrid">${MK.loadingGrid(OVERSEAS.idx.length, true)}</div>
          <div class="mini-sep">大宗商品 / 汇率</div>
          <div id="ovCmtGrid">${MK.loadingGrid(OVERSEAS.cmt.length + OVERSEAS.fx.length, true)}</div>
          <div class="sub-title" style="margin-top:12px">盘面自动摘要</div>
          <div id="ovBrief"><div class="flash-empty">正在读取全球行情…</div></div>`
      })}
    `;
  },
  async mount(reg) {
    /* ---- ① 真实快讯 ---- */
    const paintNews = d => {
      const opt = { cat: Store.get('news_cat', 'all'), hotOnly: Store.get('news_hot', false) };
      const chips = UI.$('#newsChipsWrap'); if (chips) chips.innerHTML = News.renderChips(d, opt);
      const flash = UI.$('#newsFlash'); if (flash) flash.innerHTML = News.renderFlash(d, opt);
      const dig = UI.$('#newsDigest'); if (dig) dig.innerHTML = News.renderDigest(d, Market.readCache());
      const st = UI.$('#newsStamp');
      if (st) st.textContent = d && d.ok
        ? (d._offline ? '离线缓存 ' + (d.updatedAt || '') : (d.updatedAt || '').slice(11) + ' 更新')
        : '服务不可达';
    };
    let newsData = null;
    const loadNews = async force => { newsData = await News.fetchNews(force); paintNews(newsData); };

    /* 分类 / 只看重磅 —— 本地过滤，不重新请求 */
    reg.onNewsFilter = () => { if (newsData) paintNews(newsData); };
    reg.onNewsReload = () => loadNews(true);

    /* ---- ② 外围行情 ---- */
    const paintQ = q => {
      const a = UI.$('#ovIdxGrid'); if (a) a.innerHTML = MK.grid(q, OVERSEAS.idx, true);
      const b = UI.$('#ovCmtGrid'); if (b) b.innerHTML = MK.grid(q, OVERSEAS.cmt.concat(OVERSEAS.fx), true);
      const bb = UI.$('#ovBrief');
      if (bb) {
        const all = Market.autoBrief(q);
        const merged = [].concat(all.us || [], all.fed || [], all.oil || [], all.a || []).slice(0, 8);
        bb.innerHTML = merged.length ? MK.briefList(merged) : `<div class="flash-empty">行情数据加载中或暂不可用</div>`;
      }
      const dig = UI.$('#newsDigest');
      if (dig && newsData) dig.innerHTML = News.renderDigest(newsData, q);
    };
    const loadQ = async () =>
      paintQ(await Market.quotes(OVERSEAS.idx.concat(OVERSEAS.cmt, OVERSEAS.fx, ['sh', 'cyb']), paintQ));

    reg.onReload = loadQ;
    await Promise.all([loadNews(false), loadQ()]);

    /* 要闻每 2 分钟自动刷新一次（fetchNews 内部有 60s 短缓存，不会重复打接口），保证时效 */
    reg.interval(() => { loadNews(false); }, 120000);
  }
};

/* ============================================================
   ② 夜盘美股（5 分钟实时刷新 + 倒计时）
   ============================================================ */
/* 重点个股：分组 + A股映射方向 + 新闻匹配关键词（说明全部基于真实行情/真实新闻） */
const US_FOCUS = [
  {
    grp: 'AI 算力链', ico: '🧠', map: '国内算力 / 光模块 / PCB / 液冷 / 服务器',
    list: [
      { k: 'nvda', kw: ['英伟达', 'NVDA', 'Nvidia'], role: '全球 AI 芯片风向标' },
      { k: 'amd', kw: ['超威半导体', 'AMD'], role: 'AI 芯片第二供应商' },
      { k: 'avgo', kw: ['博通', 'AVGO'], role: '定制 ASIC 与网络交换' },
      { k: 'tsm', kw: ['台积电', 'TSM'], role: '先进制程代工晴雨表' },
      { k: 'arm', kw: ['安谋', 'ARM 公司', 'Arm '], role: '端侧 AI 架构授权' }
    ]
  },
  {
    grp: '存储链', ico: '💾', map: '国内存储 / HBM / 内存模组 / 利基存储',
    list: [
      { k: 'mu', kw: ['美光', 'Micron'], role: 'HBM 与 DRAM 定价核心' },
      { k: 'wdc', kw: ['西部数据', 'WDC'], role: 'HDD / NAND 供需风向' },
      { k: 'stx', kw: ['希捷', 'Seagate'], role: '企业级 HDD 龙头' }
    ]
  },
  {
    grp: '科技巨头', ico: '☁️', map: '风险偏好 / 消费电子（果链）/ 云与 AI 资本开支',
    list: [
      { k: 'aapl', kw: ['苹果', 'AAPL'], role: '消费电子与果链景气' },
      { k: 'msft', kw: ['微软', 'MSFT'], role: '云与 AI 资本开支' },
      { k: 'googl', kw: ['谷歌', 'GOOGL', 'Alphabet'], role: 'AI 模型与广告' },
      { k: 'amzn', kw: ['亚马逊', 'AMZN'], role: 'AWS 云开支' },
      { k: 'meta', kw: ['Meta', 'META'], role: 'AI 基建投入' }
    ]
  },
  {
    grp: '中概 & 新能源车', ico: '🚗', map: '港A互联网 / 跨境电商 / 电动车产业链',
    list: [
      { k: 'baba', kw: ['阿里巴巴', '阿里', 'BABA'], role: '中概情绪与云业务' },
      { k: 'pdd', kw: ['拼多多', 'PDD', 'Temu'], role: '跨境电商与消费' },
      { k: 'jd', kw: ['京东'], role: '国内零售景气' },
      { k: 'tsla', kw: ['特斯拉', 'TSLA', '马斯克'], role: '全球电动车链风向' }
    ]
  }
];
const US_KEYS = US_FOCUS.reduce((a, g) => a.concat(g.list.map(s => s.k)), []);

/* 日韩 / 港股 重点个股（与夜盘美股同构，数据均来自真实行情源）
   说明：港股通标的经腾讯源稳定可取真实行情，是与 A 股联动最紧的亚洲个股；
   日经 / 韩国综合指数经东财源稳定可取，故日本、韩国以指数 + 风险映射体现。 */
const ASIA_FOCUS = [
  {
    grp: '港股科技互联网', ico: '🌐', map: '平台经济 / 恒生科技 / AI 应用 / 消费',
    list: [
      { k: 'hk_tx',   kw: ['腾讯', '腾讯控股'], role: '港股科技风向标' },
      { k: 'hk_baba', kw: ['阿里巴巴', '阿里'], role: '电商与云业务晴雨表' },
      { k: 'hk_mt',   kw: ['美团'], role: '本地生活与到店景气' },
      { k: 'hk_xm',   kw: ['小米'], role: '智能硬件与汽车链' },
      { k: 'hk_ks',   kw: ['快手'], role: '短视频与电商' }
    ]
  },
  {
    grp: '港股金融高股息', ico: '🏦', map: '金融 / 高股息 / 南向资金 / 地产链',
    list: [
      { k: 'hk_aia',  kw: ['友邦', 'AIA'], role: '保险与寿险需求' },
      { k: 'hk_hsbc', kw: ['汇丰'], role: '离岸金融与息差' },
      { k: 'hk_ccb',  kw: ['建设银行'], role: '高股息银行锚' },
      { k: 'hk_pa',   kw: ['中国平安', '平安'], role: '综合金融景气' }
    ]
  },
  {
    grp: '港股汽车新消费', ico: '🚗', map: '新能源车 / 出海 / 电商 / 游戏',
    list: [
      { k: 'hk_bydi', kw: ['比亚迪'], role: '新能源车出海龙头' },
      { k: 'hk_jd',   kw: ['京东'], role: '电商与零售景气' },
      { k: 'hk_ntes', kw: ['网易'], role: '游戏与内容变现' },
      { k: 'hk_li',   kw: ['理想'], role: '智能电动车链' }
    ]
  }
];
const ASIA_KEYS = ASIA_FOCUS.reduce((a, g) => a.concat(g.list.map(s => s.k)), []);

const USM = {
  /* 基于真实涨跌幅生成客观描述，不做任何原因推测 */
  moveDesc(p) {
    if (p == null) return '行情暂不可用';
    const a = Math.abs(p).toFixed(2);
    if (p >= 5) return `大涨 ${a}%，显著强于板块`;
    if (p >= 2) return `上涨 ${a}%，走势偏强`;
    if (p > 0.2) return `小幅收涨 ${a}%`;
    if (p >= -0.2) return `基本平盘（${p >= 0 ? '+' : ''}${p.toFixed(2)}%）`;
    if (p > -2) return `小幅收跌 ${a}%`;
    if (p > -5) return `下跌 ${a}%，走势偏弱`;
    return `重挫 ${a}%，明显拖累板块`;
  },
  /* 单只个股卡片 */
  card(s, q) {
    const d = q[s.k] || {};
    const meta = Market.SYMBOLS[s.k] || {};
    const p = d.chgPct;
    const cls = UI.dirCls(p);
    const refs = News.match(s.kw, 1);
    const ref = refs[0];
    const price = d.price != null ? d.price.toFixed(2) : '--';
    return `<div class="ustock ${cls}">
      <div class="us-hd">
        <span class="us-name">${UI.esc(meta.name || s.k)}</span>
        <span class="us-chg ${cls}">${p == null ? '--' : UI.sign(p, 2, '%')}</span>
      </div>
      <div class="us-sub"><span class="us-last">${price}</span><span class="us-role">${UI.esc(s.role)}</span></div>
      <div class="us-desc">${UI.esc(USM.moveDesc(p))}</div>
      ${ref && /^https?:\/\//i.test(ref.url || '')
        ? `<a class="us-ref" href="${UI.esc(ref.url)}" target="_blank" rel="noopener noreferrer" title="${UI.esc(ref.title)}">📎 ${UI.esc(ref.title)}</a>`
        : `<div class="us-ref none">暂未匹配到相关快讯，仅按行情客观描述</div>`}
    </div>`;
  },
  /* 分组均值 → A股映射方向 */
  groupStat(g, q) {
    const vals = g.list.map(s => (q[s.k] || {}).chgPct).filter(v => v != null);
    if (!vals.length) return { avg: null, dir: '--', cls: 'flat', n: 0 };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const dir = avg >= 1 ? '映射偏多' : (avg <= -1 ? '映射偏空' : '映射中性');
    return { avg, dir, cls: UI.dirCls(avg), n: vals.length };
  },
  /* 重点个股全部分组 */
  focusBody(q) {
    return US_FOCUS.map(g => {
      const st = USM.groupStat(g, q);
      return `<div class="us-grp">
        <div class="us-grp-hd">
          <span class="ico">${g.ico}</span><b>${g.grp}</b>
          <span class="us-avg ${st.cls}">${st.avg == null ? '--' : '均值 ' + UI.sign(st.avg, 2, '%')}</span>
          <span class="tag ${st.cls === 'up' ? 'tag-red' : (st.cls === 'down' ? 'tag-green' : 'tag-gray')}">${st.dir}</span>
          <span class="us-map">→ ${UI.esc(g.map)}</span>
        </div>
        <div class="us-grid">${g.list.map(s => USM.card(s, q)).join('')}</div>
      </div>`;
    }).join('');
  },
  /* 对 A 股影响 & 风险预判（全部由真实数据推导） */
  impact(q, usSec) {
    const has = k => q[k] && q[k].chgPct != null;
    const pct = k => q[k].chgPct;
    if (!US_FOCUS.some(g => g.list.some(s => has(s.k))) && !has('ixic')) {
      return `<div class="flash-empty">行情读取后自动生成影响与风险研判</div>`;
    }

    /* ① 板块映射（按分组均值） */
    const rows = US_FOCUS.map(g => {
      const st = USM.groupStat(g, q);
      if (st.avg == null) return null;
      const strong = Math.abs(st.avg) >= 2;
      const lean = st.avg >= 1 ? '偏多' : (st.avg <= -1 ? '偏空' : '中性');
      const act = st.avg >= 2 ? '可顺势低吸，不追高开' :
        (st.avg >= 1 ? '关注是否高开回落，等分时企稳' :
          (st.avg <= -2 ? '规避高位股，等待情绪释放' :
            (st.avg <= -1 ? '低开可能，谨慎接力' : '跟随大盘，无独立方向')));
      return { g, st, lean, act, strong };
    }).filter(Boolean);

    /* ② 风险点（客观阈值触发） */
    const risks = [];
    US_FOCUS.forEach(g => {
      const st = USM.groupStat(g, q);
      if (st.avg != null && st.avg <= -2) {
        const worst = g.list.map(s => ({ s, p: (q[s.k] || {}).chgPct }))
          .filter(x => x.p != null).sort((a, b) => a.p - b.p)[0];
        risks.push({
          lv: st.avg <= -4 ? '高' : '中',
          t: `${g.grp}整体下挫 ${Math.abs(st.avg).toFixed(2)}%`,
          d: `${worst ? Market.SYMBOLS[worst.s.k].name + ' ' + UI.sign(worst.p, 2, '%') + '领跌，' : ''}对应 A 股 ${g.map} 方向承压，开盘易低开`
        });
      }
    });
    if (has('ixic') && pct('ixic') <= -1)
      risks.push({ lv: pct('ixic') <= -2 ? '高' : '中', t: `纳指下跌 ${Math.abs(pct('ixic')).toFixed(2)}%`, d: '成长股整体风险偏好回落，A 股科技成长板块情绪受压制' });
    if (has('us10y') && pct('us10y') >= 1.5)
      risks.push({ lv: '中', t: `美债 10 年收益率上行 ${pct('us10y').toFixed(2)}%`, d: '无风险利率抬升压制高估值成长股，利好红利与低估值防御方向' });
    if (has('usdcnh') && pct('usdcnh') >= 0.3)
      risks.push({ lv: '中', t: `离岸人民币贬值 ${pct('usdcnh').toFixed(2)}%`, d: '外资流入意愿下降，对核心资产与外资重仓股形成压力' });
    if (has('wti') && Math.abs(pct('wti')) >= 3)
      risks.push({ lv: '低', t: `原油波动 ${UI.sign(pct('wti'), 2, '%')}`, d: pct('wti') > 0 ? '成本端上行，中下游制造业毛利承压；利好石油石化' : '利好交运与化工中下游；石油开采板块承压' });

    const riskBody = risks.length ? `<ul class="risk-list">${risks.map(r => `
      <li class="rk-${r.lv === '高' ? 'hi' : (r.lv === '中' ? 'mid' : 'low')}">
        <span class="rk-lv">${r.lv}</span>
        <div class="rk-b"><b>${UI.esc(r.t)}</b><span>${UI.esc(r.d)}</span></div>
      </li>`).join('')}</ul>`
      : `<div class="ok-note">✅ 当前外围各分项均未触发风险阈值（分组跌幅未超 2%、纳指跌幅未超 1%、汇率与利率平稳）</div>`;

    /* ③ 美股强势板块 → 次日 A 股映射方向（基于真实板块榜，关键词映射到 A 股对应产业链） */
    let secMapBody = '';
    if (usSec && usSec.ok && (usSec.industry.length || usSec.concept.length)) {
      const MAP = [
        { kw: ['半导体', '芯片', '科技', 'AI', '软件', '互联网', '计算机', '电子'], a: 'A股半导体/消费电子/算力/AI应用（科创50、创业板成长方向）' },
        { kw: ['中概', '中国', '金龙', '电商', '互联网', '教育'], a: 'A股跨境电商/互联网平台/港股通互联网（外资偏好回归）' },
        { kw: ['新能源', '光伏', '锂电', '电动车', '汽车', '特斯拉'], a: 'A股新能源车链/锂电池/光伏（宁德时代、比亚迪产业链）' },
        { kw: ['银行', '金融', '保险', '券商'], a: 'A股银行/保险/券商（红利与指数权重方向）' },
        { kw: ['医药', '生物', '医疗', '健康'], a: 'A股创新药/CXO/医疗器械（成长避险兼顾）' },
        { kw: ['黄金', '金属', '矿', '铜', '铝'], a: 'A股有色金属/贵金属（资源品涨价传导）' },
        { kw: ['能源', '油', '天然气'], a: 'A股石油石化/油服（能源价格联动）' },
        { kw: ['消费', '零售', '食品', '饮料'], a: 'A股必选/可选消费（内需预期）' },
        { kw: ['房地产', '建筑', '建材'], a: 'A股地产链/建材/家居（政策预期博弈）' },
        { kw: ['工业', '机械', '制造'], a: 'A股工程机械/高端制造（出口链）' }
      ];
      // 美股独有、A股无直接对标的板块 → 解释跨市场情绪/资金含义，不强行映射到个股
      const UNIQUE = [
        { kw: ['标普', 'S&P', '500'], mean: '美股大盘基准整体强弱，反映全球风险偏好的总开关' },
        { kw: ['道琼', '道指'], mean: '传统蓝筹/价值股风向，影响 A 股红利与权重蓝筹情绪' },
        { kw: ['罗素', 'Russell', '小盘', '2000'], mean: '小盘股风险偏好温度计；小盘走强=资金愿冒风险，利好 A 股题材与小市值' },
        { kw: ['VIX', '恐慌', '波动率'], mean: '恐慌指数；飙升→全球避险收缩，A 股次日易低开；回落→风险偏好修复' },
        { kw: ['生物科技', 'XBI', '制药', '基因'], mean: '创新药风险偏好外溢，映射 A 股 CXO/创新药情绪，但非直接对标' },
        { kw: ['核能', '核电', '铀'], mean: 'A 股无纯铀标的，情绪外溢至核电运营/核岛设备/天然铀进口替代链' },
        { kw: ['太空', '卫星', '航天'], mean: '主题外溢至 A 股卫星互联网/商业航天/遥感链，偏事件驱动' },
        { kw: ['大麻', ' cannabis', 'Marijuana'], mean: '纯美股主题，A 股无对标；仅作另类风险偏好观察' },
        { kw: ['加密', '区块链', '比特币', 'Coin', 'MSTR'], mean: '风险资产情绪 proxy；走强→全球流动性宽松预期，利好 A 股风险资产' },
        { kw: ['REIT', '商业地产', '写字楼', '不动产'], mean: '美股地产信用风险温度计；走弱→警惕全球地产链与银行敞口' },
        { kw: ['量子', 'Quantum'], mean: '前沿科技主题外溢，映射 A 股量子通信/算力前沿概念，偏情绪' },
        { kw: ['人工智能', 'AIETF', '机器人'], mean: '与半导体/科技同向，放大 A 股 AI 应用与机器人主题强度' }
      ];
      const hitMap = (name) => MAP.filter(m => m.kw.some(k => name.indexOf(k) >= 0));
      const hitUnique = (name) => UNIQUE.filter(m => m.kw.some(k => name.toLowerCase().indexOf(k.toLowerCase()) >= 0));
      const lines = [];
      const uniqLines = [];
      const seen = {}; const seenU = {};
      const scan = (arr, label) => (arr || []).slice(0, 5).forEach(s => {
        if (!s.name) return;
        const ms = hitMap(s.name);
        if (ms.length) {
          ms.forEach(m => {
            if (seen[m.a]) return; seen[m.a] = true;
            lines.push({ sec: s.name, pct: s.chgPct, a: m.a, label });
          });
        } else {
          const us = hitUnique(s.name);
          if (us.length && !seenU[s.name]) {
            seenU[s.name] = true;
            uniqLines.push({ sec: s.name, pct: s.chgPct, mean: us[0].mean, label });
          }
        }
      });
      scan(usSec.industry, '行业板块');
      scan(usSec.concept, '概念板块');
      const items = lines.slice(0, 6).map(x => `<div class="map-item up">
          <div class="mi-hd"><span>🏆</span><b>${UI.esc(x.sec)}</b>
            <span class="mi-avg up">${x.pct == null ? '' : UI.sign(x.pct, 2, '%')}</span>
            <span class="mi-tag">${x.label}</span></div>
          <div class="mi-map">→ 次日 A 股可关注：${UI.esc(x.a)}</div>
        </div>`).join('');
      const uniqItems = uniqLines.slice(0, 6).map(x => `<div class="map-item uniq">
          <div class="mi-hd"><span>🌐</span><b>${UI.esc(x.sec)}</b>
            <span class="mi-avg ${x.pct >= 0 ? 'up' : 'down'}">${x.pct == null ? '' : UI.sign(x.pct, 2, '%')}</span>
            <span class="mi-tag">美股独有</span></div>
          <div class="mi-map">跨市场含义：${UI.esc(x.mean)}</div>
        </div>`).join('');
      if (items || uniqItems) {
        secMapBody = `<div class="sub-title" style="margin-top:14px">美股强势板块 → 次日 A 股资金映射方向（按真实领涨榜推导）</div>`
          + (items ? `<div class="map-grid">${items}</div>` : '')
          + (uniqItems ? `<div class="sub-title" style="margin-top:12px">美股独有板块信号（A 股无直接对标 · 看跨市场情绪）</div><div class="map-grid">${uniqItems}</div>` : '')
          + `<div class="dg-src">板块名称若为美股本地分类（如特定 ETF 主题），按语义映射；美股独有板块仅解释跨市场情绪/资金含义，不构成个股建议。</div>`;
      }
    }

    return `
      <div class="sub-title">板块映射（按分组真实均值推导）</div>
      <div class="map-grid">${rows.map(r => `
        <div class="map-item ${r.st.cls}">
          <div class="mi-hd"><span>${r.g.ico}</span><b>${r.g.grp}</b>
            <span class="mi-avg ${r.st.cls}">${UI.sign(r.st.avg, 2, '%')}</span></div>
          <div class="mi-map">${UI.esc(r.g.map)}</div>
          <div class="mi-act"><span class="tag ${r.st.cls === 'up' ? 'tag-red' : (r.st.cls === 'down' ? 'tag-green' : 'tag-gray')}">${r.lean}</span>${UI.esc(r.act)}</div>
        </div>`).join('')}</div>
      ${secMapBody}
      <div class="sub-title" style="margin-top:14px">风险预判（阈值自动触发）</div>
      ${riskBody}
      <div class="dg-src">以上映射与风险均由实时行情按固定规则推导，产业链对应关系为公开常识；不构成投资建议。</div>`;
  }
};

/* 日韩 / 港股：复用 USM 的通用卡片与分组均值逻辑，仅替换数据源与风险阈值 */
const ASIAM = {
  focusBody(q) {
    return ASIA_FOCUS.map(g => {
      const st = USM.groupStat(g, q);
      return `<div class="us-grp">
        <div class="us-grp-hd">
          <span class="ico">${g.ico}</span><b>${g.grp}</b>
          <span class="us-avg ${st.cls}">${st.avg == null ? '--' : '均值 ' + UI.sign(st.avg, 2, '%')}</span>
          <span class="tag ${st.cls === 'up' ? 'tag-red' : (st.cls === 'down' ? 'tag-green' : 'tag-gray')}">${st.dir}</span>
          <span class="us-map">→ ${UI.esc(g.map)}</span>
        </div>
        <div class="us-grid">${g.list.map(s => USM.card(s, q)).join('')}</div>
      </div>`;
    }).join('');
  },
  impact(q) {
    const has = k => q[k] && q[k].chgPct != null;
    const pct = k => q[k].chgPct;
    if (!ASIA_FOCUS.some(g => g.list.some(s => has(s.k))) && !has('n225')) {
      return `<div class="flash-empty">行情读取后自动生成影响与风险研判</div>`;
    }

    /* ① 板块映射（按分组均值） */
    const rows = ASIA_FOCUS.map(g => {
      const st = USM.groupStat(g, q);
      if (st.avg == null) return null;
      const lean = st.avg >= 1 ? '偏多' : (st.avg <= -1 ? '偏空' : '中性');
      const act = st.avg >= 2 ? '可顺势低吸，不追高开' :
        (st.avg >= 1 ? '关注是否高开回落，等分时企稳' :
          (st.avg <= -2 ? '规避高位股，等待情绪释放' :
            (st.avg <= -1 ? '低开可能，谨慎接力' : '跟随大盘，无独立方向')));
      return { g, st, lean, act };
    }).filter(Boolean);

    /* ② 风险点（客观阈值触发） */
    const risks = [];
    ASIA_FOCUS.forEach(g => {
      const st = USM.groupStat(g, q);
      if (st.avg != null && st.avg <= -2) {
        const worst = g.list.map(s => ({ s, p: (q[s.k] || {}).chgPct }))
          .filter(x => x.p != null).sort((a, b) => a.p - b.p)[0];
        risks.push({
          lv: st.avg <= -4 ? '高' : '中',
          t: `${g.grp}整体下挫 ${Math.abs(st.avg).toFixed(2)}%`,
          d: `${worst ? Market.SYMBOLS[worst.s.k].name + ' ' + UI.sign(worst.p, 2, '%') + '领跌，' : ''}对应 A 股 ${g.map} 方向承压，开盘易低开`
        });
      }
    });
    if (has('n225') && pct('n225') <= -1)
      risks.push({ lv: pct('n225') <= -2 ? '高' : '中', t: `日经225下跌 ${Math.abs(pct('n225')).toFixed(2)}%`, d: '亚太风险偏好回落，A 股科技成长与出口链情绪受压制' });
    if (has('ks11') && pct('ks11') <= -1)
      risks.push({ lv: pct('ks11') <= -2 ? '高' : '中', t: `韩国综合下跌 ${Math.abs(pct('ks11')).toFixed(2)}%`, d: '半导体（三星/海力士链）与电子制造情绪偏弱，A 股存储/面板/消费电子承压' });
    if (has('hsi') && pct('hsi') <= -1)
      risks.push({ lv: pct('hsi') <= -2 ? '高' : '中', t: `恒生指数下跌 ${Math.abs(pct('hsi')).toFixed(2)}%`, d: '港股走弱拖累 A 股核心资产与南向重仓方向，外资风险偏好下降' });
    if (has('usdcnh') && pct('usdcnh') >= 0.3)
      risks.push({ lv: '中', t: `离岸人民币贬值 ${pct('usdcnh').toFixed(2)}%`, d: '人民币走弱，外资流入意愿下降，对核心资产与外资重仓股形成压力' });

    const riskBody = risks.length ? `<ul class="risk-list">${risks.map(r => `
      <li class="rk-${r.lv === '高' ? 'hi' : (r.lv === '中' ? 'mid' : 'low')}">
        <span class="rk-lv">${r.lv}</span>
        <div class="rk-b"><b>${UI.esc(r.t)}</b><span>${UI.esc(r.d)}</span></div>
      </li>`).join('')}</ul>`
      : `<div class="ok-note">✅ 当前亚太各分项均未触发风险阈值（分组跌幅未超 2%、日经/韩国/恒生跌幅未超 1%、汇率平稳）</div>`;

    return `
      <div class="sub-title">板块映射（按分组真实均值推导）</div>
      <div class="map-grid">${rows.map(r => `
        <div class="map-item ${r.st.cls}">
          <div class="mi-hd"><span>${r.g.ico}</span><b>${r.g.grp}</b>
            <span class="mi-avg ${r.st.cls}">${UI.sign(r.st.avg, 2, '%')}</span></div>
          <div class="mi-map">${UI.esc(r.g.map)}</div>
          <div class="mi-act"><span class="tag ${r.st.cls === 'up' ? 'tag-red' : (r.st.cls === 'down' ? 'tag-green' : 'tag-gray')}">${r.lean}</span>${UI.esc(r.act)}</div>
        </div>`).join('')}</div>
      <div class="sub-title" style="margin-top:14px">风险预判（阈值自动触发）</div>
      ${riskBody}
      <div class="dg-src">以上映射与风险均由实时行情按固定规则推导，产业链对应关系为公开常识；不构成投资建议。</div>`;
  }
};

V.usnight = {
  title: '夜盘美股',
  desc: '总结置顶 · 指数与重点个股实时 · 关键事件同步 · 对A股影响与风险预判',
  render() {
    return `
      <div class="live-bar" id="usLiveBar">
        <span class="live-dot"></span>
        <b id="usLiveLabel">实时更新中</b>
        <span class="st" id="usSession">--</span>
        <span class="stamp" id="usLiveStamp">--</span>
      </div>

      ${UI.card({
        title: '🌙 夜盘美股总结',
        sub: '基于实时行情与真实快讯自动生成',
        right: `<span class="tag tag-amber" id="usStatus">读取中…</span>
                <button class="btn btn-sm btn-ghost" data-act="reload-us">立即刷新</button>`,
        body: `<div class="ai-summary" id="usAiSummary"><p>正在读取美股行情并生成总结…</p></div>`
      })}

      ${UI.card({
        title: '📊 指数与关键指标',
        sub: '三大指数 / 商品 / 美债 / 汇率 · 实时',
        right: `<span class="stamp" id="usCardStamp">--</span>`,
        tight: true,
        body: `<div style="padding:12px 14px">
          <div id="usIdx">${MK.loadingGrid(3, true)}</div>
          <div class="mini-sep">全球联动</div>
          <div id="usGlobal">${MK.loadingGrid(4, true)}</div>
        </div>`
      })}

      ${UI.card({
        title: '🔍 重点个股涨跌及说明',
        sub: '17 只代表性标的 · 涨跌为实时真实行情 · 说明附真实快讯依据',
        tight: true,
        body: `<div id="usFocus" class="us-focus"><div class="flash-empty">正在读取个股行情…</div></div>`
      })}

      ${UI.card({
        title: '🏆 美股领涨板块（行业 + 概念）',
        sub: '东方财富美股板块真实涨跌榜 · 对次日A股资金走向有领先映射',
        right: `<span class="stamp" id="usSecStamp">采集中…</span>
                <button class="btn btn-sm btn-ghost" data-act="reload-us">刷新</button>`,
        tight: true,
        body: `<div id="usSectors" class="us-sectors"><div class="flash-empty">正在采集美股行业/概念板块涨跌榜…</div></div>
               <div class="us-sec-note" id="usSecNote" style="margin-top:8px"></div>`
      })}

      ${UI.card({
        title: '📌 关键事件',
        sub: '美股 / 美联储相关真实快讯 · 随盘中动态更新',
        right: `<button class="btn btn-sm btn-ghost" data-act="reload-news">刷新事件</button>`,
        tight: true,
        body: `<div id="usEvents"><div class="flash-empty">正在拉取真实快讯…</div></div>`
      })}

      ${UI.card({
        title: '🇨🇳 对 A 股的影响与风险预判',
        sub: '由真实行情按固定规则自动推导',
        tight: true,
        body: `<div id="usImpact" style="padding:12px 14px"><div class="flash-empty">行情读取后自动生成</div></div>`
      })}
    `;
  },
  async mount(reg) {
    const IDX = ['dji', 'ixic', 'spx'];
    const GLB = ['wti', 'gold', 'us10y', 'usdcnh'];
    V.usnight._usSec = V.usnight._usSec || null;

    const paintUsSectors = () => {
      const el = UI.$('#usSectors');
      const note = UI.$('#usSecNote');
      const sec = V.usnight._usSec;
      if (!el) return;
      if (!sec || !sec.ok) {
        el.innerHTML = '<div class="flash-empty">美股板块数据暂不可达，点「刷新」重试。数据源：东方财富美股板块（盘前/盘中/盘后实时；周末显示最近交易日）。</div>';
        if (note) note.textContent = '';
        return;
      }
      const table = (arr, label) => {
        if (!arr || !arr.length) return '';
        const rows = arr.slice(0, 10).map((s, i) => {
          const p = s.chgPct == null ? '—' : UI.sign(s.chgPct, 2, '%');
          const cls = s.chgPct >= 0 ? 'up' : 'down';
          const leader = s.leader || '—';
          return `<tr>
            <td class="us-sec-rank-cell"><span class="us-sec-rank">${i + 1}</span></td>
            <td class="us-sec-name">${UI.esc(s.name)}</td>
            <td class="us-sec-pct ${cls}">${p}</td>
            <td class="us-sec-ld">${UI.esc(leader)}</td>
          </tr>`;
        }).join('');
        return `<div class="us-sec-group">
          <div class="us-sec-gtitle">${label}</div>
          <table class="us-sec-table">
            <thead><tr><th>排名</th><th>板块名称</th><th>涨幅</th><th>领涨股</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      };
      el.innerHTML = table(sec.industry, '🏭 美股行业板块领涨') + table(sec.concept, '💡 美股概念板块领涨');
      if (note) note.innerHTML = '美股交易日 <b>' + (sec.usDate || sec.date || '—') + '</b> · 来源：' + UI.esc(sec.source || '东方财富')
        + ' · 真实行情 · 映射关系见下方「对A股影响与风险预判」';
    };

    const paint = q => {
      const set = (id, keys) => { const el = UI.$('#' + id); if (el) el.innerHTML = MK.grid(q, keys, true); };
      set('usIdx', IDX);
      set('usGlobal', GLB);
      const fo = UI.$('#usFocus'); if (fo) fo.innerHTML = USM.focusBody(q);
      const im = UI.$('#usImpact'); if (im) im.innerHTML = USM.impact(q, V.usnight._usSec);
      const sum = UI.$('#usAiSummary'); if (sum) sum.innerHTML = `<p>${Market.autoUsSummary(q)}</p>`;
      paintUsSectors();
      const st = UI.$('#usLiveStamp'); if (st) st.textContent = '更新于 ' + DT.clock();
      const cs = UI.$('#usCardStamp'); if (cs) cs.textContent = '更新于 ' + DT.clock();
      const ss = UI.$('#usSecStamp'); if (ss) ss.textContent = '更新于 ' + DT.clock();
      /* 按美股真实开收盘时间（美东，自动夏令时）调整状态条 */
      const ss2 = Market.usSession();
      const se = UI.$('#usSession'); if (se) se.textContent = ss2.text;
      const lb = UI.$('#usLiveLabel');
      if (lb) lb.textContent = ss2.open ? '实时更新中' : '已收盘 · 显示最新数据';
      const bar = UI.$('#usLiveBar'); if (bar) bar.classList.toggle('off', !ss2.open);
      const su = UI.$('#usStatus'); if (su) su.textContent = ss2.text.replace(/^美股/, '');
    };

    let lastQ = {};
    const load = async () => {
      lastQ = await Market.quotes(IDX.concat(GLB, US_KEYS), q => { lastQ = q; paint(q); });
      paint(lastQ);
    };
    const loadUsSectors = async () => {
      try {
        V.usnight._usSec = await Market.usSectorRank();
        paintUsSectors();
      } catch (e) { /* 如实保留空态，不虚构 */ }
    };

    const paintEvents = () => {
      const el = UI.$('#usEvents');
      if (el) el.innerHTML = News.eventList(['us', 'fed'], 14, { hotFirst: true });
      paint(lastQ);   // 快讯到位后，个股卡片的「依据」也要重渲染
    };
    const loadNews = async force => { await News.fetchNews(force); paintEvents(); };

    reg.onReload = load;
    reg.onNewsReload = () => loadNews(true);
    await Promise.all([load(), loadNews(false), loadUsSectors()]);

    // 实时自动刷新（每 30 秒），不带倒计时提示
    reg.interval(() => { load(); loadNews(false); loadUsSectors(); }, 30000);
  }
};

/* ============================================================
   ③ 日韩股市（08:00 自动更新）
   ============================================================ */
V.asia = {
  title: '日韩股市',
  desc: '总结置顶 · 指数与重点个股实时 · 关键事件同步 · 对A股影响与风险预判',
  render() {
    return `
      <div class="live-bar" id="asiaLiveBar">
        <span class="live-dot"></span>
        <b id="asiaLiveLabel">实时更新中</b>
        <span class="st" id="asiaSession">--</span>
        <span class="stamp" id="asiaLiveStamp">--</span>
      </div>

      ${UI.card({
        title: '🌏 韩日股市总结',
        sub: '基于实时行情与真实快讯自动生成',
        right: `<span class="tag tag-amber" id="asiaStatus">读取中…</span>
                <button class="btn btn-sm btn-ghost" data-act="reload-asia">立即刷新</button>`,
        body: `<div class="ai-summary" id="asiaAiSummary"><p>正在读取日韩/港股行情并生成分析…</p></div>`
      })}

      ${UI.card({
        title: '📊 指数与关键指标',
        sub: '日经 / 韩国 / 东证 · 港股联动 · 实时',
        right: `<span class="stamp" id="asiaCardStamp">--</span>`,
        tight: true,
        body: `<div style="padding:12px 14px">
          <div id="asiaIdx">${MK.loadingGrid(3, true)}</div>
          <div class="mini-sep">港股联动</div>
          <div id="asiaHk">${MK.loadingGrid(2, true)}</div>
        </div>`
      })}

      ${UI.card({
        title: '🔍 重点个股涨跌及说明',
        sub: '港股通代表性标的（亚洲个股中数据最可靠、与 A 股联动最紧）· 涨跌为实时真实行情 · 说明附真实快讯依据',
        tight: true,
        body: `<div id="asiaFocus" class="us-focus"><div class="flash-empty">正在读取个股行情…</div></div>`
      })}

      ${UI.card({
        title: '📌 关键事件',
        sub: '日韩 / 港股 / 亚太相关真实快讯 · 随盘中动态更新',
        right: `<button class="btn btn-sm btn-ghost" data-act="reload-news">刷新事件</button>`,
        tight: true,
        body: `<div id="asiaEvents"><div class="flash-empty">正在拉取真实快讯…</div></div>`
      })}

      ${UI.card({
        title: '🇨🇳 对 A 股的影响与风险预判',
        sub: '由真实行情按固定规则自动推导',
        tight: true,
        body: `<div id="asiaImpact" style="padding:12px 14px"><div class="flash-empty">行情读取后自动生成</div></div>`
      })}
    `;
  },
  async mount(reg) {
    const IDX = ['n225', 'ks11', 'topix'];
    const HK = ['hsi', 'hstech'];
    const ALLK = IDX.concat(HK, ASIA_KEYS);

    const paint = q => {
      const set = (id, keys) => { const el = UI.$('#' + id); if (el) el.innerHTML = MK.grid(q, keys, true); };
      set('asiaIdx', IDX);
      set('asiaHk', HK);
      const fo = UI.$('#asiaFocus'); if (fo) fo.innerHTML = ASIAM.focusBody(q);
      const im = UI.$('#asiaImpact'); if (im) im.innerHTML = ASIAM.impact(q);
      const sum = UI.$('#asiaAiSummary'); if (sum) sum.innerHTML = `<p>${Market.autoAsiaSummary(q)}</p>`;
      const st = UI.$('#asiaLiveStamp'); if (st) st.textContent = '更新于 ' + DT.clock();
      const cs = UI.$('#asiaCardStamp'); if (cs) cs.textContent = '更新于 ' + DT.clock();
      /* 按日韩真实开收盘时间（东京时间）调整状态条 */
      const ss = Market.asiaSession();
      const se = UI.$('#asiaSession'); if (se) se.textContent = ss.text;
      const lb = UI.$('#asiaLiveLabel');
      if (lb) lb.textContent = ss.open ? '实时更新中' : '已收盘 · 显示最新数据';
      const bar = UI.$('#asiaLiveBar'); if (bar) bar.classList.toggle('off', !ss.open);
      const su = UI.$('#asiaStatus'); if (su) su.textContent = ss.text.replace(/^日韩/, '');
    };

    let lastQ = {};
    const load = async () => {
      lastQ = await Market.quotes(ALLK, q => { lastQ = q; paint(q); });
      paint(lastQ);
    };

    const paintEvents = () => {
      const el = UI.$('#asiaEvents');
      if (el) el.innerHTML = News.eventList(['global', 'a'], 14, { hotFirst: true });
      paint(lastQ);   // 快讯到位后，个股卡片的「依据」也要重渲染
    };
    const loadNews = async force => { await News.fetchNews(force); paintEvents(); };

    reg.onReload = load;
    reg.onNewsReload = () => loadNews(true);
    await Promise.all([load(), loadNews(false)]);

    // 实时自动刷新（每 30 秒），不带倒计时提示
    reg.interval(() => { load(); loadNews(false); }, 30000);
  }
};

/* ============================================================
   盘前总结 · 综合辅助模块（信号 / 机会 / 风险 / 情景 / 归档）
   把美股板块（USM）、日韩/港股板块（ASIAM）与宏观变量统一整合，
   全部基于真实行情推导，不编造结论；并支持按目标交易日归档。
   ============================================================ */
const OL = {
  /* 外围信号总表：宏观（美股指数/原油/黄金/人民币/美债/日经）
     + 美股板块（AI算力/存储/科技巨头/中概新能源）
     + 港股板块（科技互联网/金融高股息/汽车新消费）
     + 韩国/东证指数。列：信号 / 详情 / 对A股影响 / 方向 */
  buildSignals(q) {
    const out = (Market.autoSignals(q) || []).slice();
    const addGrp = (groups, prefix) => groups.forEach(g => {
      const st = USM.groupStat(g, q);
      if (st.avg == null) return;
      const dir = st.avg >= 1 ? '偏多' : (st.avg <= -1 ? '偏空' : '中性');
      out.push({
        name: prefix + g.grp,
        detail: `板块均值 ${UI.sign(st.avg, 2, '%')}（${st.n} 只样本）`,
        impact: '映射 A股：' + g.map,
        dir
      });
    });
    addGrp(US_FOCUS, '美股·');
    addGrp(ASIA_FOCUS, '港股·');
    [['ks11', '韩国综合'], ['topix', '东证TOPIX']].forEach(([k, nm]) => {
      const d = q[k];
      if (d && d.chgPct != null) {
        const dir = d.chgPct >= 0.5 ? '偏多' : (d.chgPct <= -1 ? '偏空' : '中性');
        out.push({
          name: nm,
          detail: `${nm} ${UI.sign(d.chgPct, 2, '%')}${d.price != null ? ' 报 ' + d.price.toFixed(0) : ''}`,
          impact: '亚太情绪与风险偏好映射', dir
        });
      }
    });
    return out;
  },

  /* 机会 / 风险方向：在 Market.autoOppRisk 基础上补充板块级信号 */
  buildOppRisk(q) {
    const base = Market.autoOppRisk(q) || { opportunities: [], risks: [] };
    const opp = base.opportunities.slice(), risk = base.risks.slice();
    const lvl = v => v >= 2 ? '高' : (v >= 1 ? '中' : '低');
    US_FOCUS.concat(ASIA_FOCUS).forEach(g => {
      const st = USM.groupStat(g, q);
      if (st.avg == null) return;
      const map0 = (g.map.split('/')[0] || g.map).trim();
      if (st.avg >= 1) opp.push({
        dir: map0,
        trigger: `${g.grp}板块均值 ${UI.sign(st.avg, 2, '%')}，竞价观察对应 A 股方向是否高开承接`,
        logic: `美股/港股${g.grp}整体${st.avg >= 2 ? '走强' : '偏强'}（${UI.sign(st.avg, 2, '%')}），映射 A 股 ${g.map}`,
        level: lvl(st.avg)
      });
      else if (st.avg <= -1) risk.push({
        dir: map0,
        logic: `美股/港股${g.grp}整体${st.avg <= -2 ? '走弱' : '偏弱'}（${UI.sign(st.avg, 2, '%')}），对应 A 股 ${g.map} 承压`,
        level: lvl(-st.avg)
      });
    });
    return { opportunities: opp, risks: risk };
  },

  /* 三种情景推演：由信号方向净差值推导概率，结合机会/风险给出触发与应对
     每个情景附带具体数据依据（基于真实行情指标），不编造 */
  buildScenarios(opp, risk, signals, q) {
    const m = (signals || []).filter(s => s.dir === '偏多').length;
    const k = (signals || []).filter(s => s.dir === '偏空').length;
    const net = m - k;
    let opt = Math.max(5, Math.min(80, 33 + net * 10));
    let pes = Math.max(5, Math.min(80, 33 - net * 10));
    let neu = Math.max(5, Math.min(90, 34));
    const sum = opt + neu + pes || 1;
    opt = Math.round(opt / sum * 100); neu = Math.round(neu / sum * 100);
    pes = 100 - opt - neu;
    const oppDirs = (opp || []).slice(0, 3).map(o => o.dir);
    const riskDirs = (risk || []).slice(0, 3).map(r => r.dir);
    const t = net > 0 ? '偏暖' : (net < 0 ? '偏冷' : '中性');

    // 收集具体数据依据
    const evidence = [];
    if (q) {
      const ixic = q.ixic, dji = q.dji, spx = q.spx, nvda = q.nvda;
      const wti = q.wti, gold = q.gold, usdcnh = q.usdcnh, us10y = q.us10y;
      const n225 = q.n225, ks11 = q.ks11, hsi = q.hsi;
      if (ixic) evidence.push(`纳指 ${UI.sign(ixic.chgPct, 2, '%')}`);
      if (dji) evidence.push(`道指 ${UI.sign(dji.chgPct, 2, '%')}`);
      if (spx) evidence.push(`标普 ${UI.sign(spx.chgPct, 2, '%')}`);
      if (nvda && Math.abs(nvda.chgPct) > 0.5) evidence.push(`英伟达 ${UI.sign(nvda.chgPct, 2, '%')}`);
      if (wti && Math.abs(wti.chgPct) > 1) evidence.push(`WTI原油 ${UI.sign(wti.chgPct, 2, '%')}`);
      if (gold && Math.abs(gold.chgPct) > 0.5) evidence.push(`黄金 ${UI.sign(gold.chgPct, 2, '%')}`);
      if (usdcnh && Math.abs(usdcnh.chgPct) > 0.2) evidence.push(`离岸人民币 ${UI.sign(usdcnh.chgPct, 2, '%')}`);
      if (us10y && Math.abs(us10y.chgPct) > 0.5) evidence.push(`美债10Y ${us10y.price.toFixed(3)}%`);
      if (n225 && Math.abs(n225.chgPct) > 0.5) evidence.push(`日经 ${UI.sign(n225.chgPct, 2, '%')}`);
      if (hsi && Math.abs(hsi.chgPct) > 0.5) evidence.push(`恒生 ${UI.sign(hsi.chgPct, 2, '%')}`);
    }
    const evStr = evidence.length ? evidence.join(' · ') : '行情数据加载中';

    return [
      { name: '乐观', prob: opt, cls: 'up', tone: t, icon: '📈',
        trigger: `外围${t}，美股/港股主线强势延续，A 股指数高开放量`,
        action: '顺主线低吸前排，仓位可控不追高；确认量能后再加',
        target: oppDirs.length ? oppDirs.join(' / ') : '主线前排',
        evidence: evStr },
      { name: '中性', prob: neu, cls: 'flat', icon: '➡️',
        trigger: '平开震荡，量能与昨日持平，主线分化',
        action: '只做计划内标的，快进快出，不轻易加仓',
        target: '低位补涨方向',
        evidence: evStr },
      { name: '悲观', prob: pes, cls: 'down', tone: t, icon: '📉',
        trigger: `外围${t}或突发放量利空，指数低开、高位股炸板`,
        action: '减仓观望 / 防守，不接飞刀，等情绪冰点再出手',
        target: riskDirs.length ? riskDirs.join(' / ') : '空仓 / 防守板块',
        evidence: evStr }
    ];
  },

  oppListHtml(list) {
    if (!list || !list.length) return '<div class="empty-prompt"><span class="ei">📡</span>暂无明确偏多信号，行情明朗后再定方向。</div>';
    return `<ul class="opp-risk-list opp">` + list.map((o, i) => `
      <li><span class="or-idx or-up">${i + 1}</span>
        <div class="or-body">
          <div class="or-title"><b>${UI.esc(o.dir)}</b>${o.level ? `<span class="tag tag-${o.level === '高' ? 'red' : (o.level === '中' ? 'amber' : 'gray')}">${o.level}优先级</span>` : ''}</div>
          <div class="or-logic">${UI.esc(o.logic)}</div>
          ${o.trigger ? `<div class="or-trigger">触发：${UI.esc(o.trigger)}</div>` : ''}
        </div></li>`).join('') + '</ul>';
  },
  riskListHtml(list) {
    if (!list || !list.length) return '<div class="empty-prompt"><span class="ei">📡</span>暂无明确偏空信号，行情明朗后再定方向。</div>';
    return `<ul class="opp-risk-list risk">` + list.map((o, i) => `
      <li><span class="or-idx or-down">${i + 1}</span>
        <div class="or-body">
          <div class="or-title"><b>${UI.esc(o.dir)}</b>${o.level ? `<span class="tag tag-${o.level === '高' ? 'red' : (o.level === '中' ? 'amber' : 'gray')}">${o.level}风险</span>` : ''}</div>
          <div class="or-logic">${UI.esc(o.logic)}</div>
        </div></li>`).join('') + '</ul>';
  },
  scenarioCardsHtml(arr) {
    if (!arr || !arr.length) return '';
    return `<div class="scn-grid">` + arr.map(s => `
      <div class="scn-box ${s.cls}">
        <div class="scn-box-hd">
          <span class="scn-box-icon">${s.icon || '📊'}</span>
          <div class="scn-box-title">
            <b>${UI.esc(s.name)}</b>
            <span>${UI.esc(s.tone || '')}</span>
          </div>
          <div class="scn-box-pct">${s.prob}%</div>
        </div>
        <div class="scn-box-bar"><i style="width:${s.prob}%"></i></div>
        <div class="scn-box-body">
          <div class="scn-item">
            <div class="scn-item-label">触发条件</div>
            <div class="scn-item-value">${UI.esc(s.trigger)}</div>
          </div>
          <div class="scn-item">
            <div class="scn-item-label">应对策略</div>
            <div class="scn-item-value">${UI.esc(s.action)}</div>
          </div>
          <div class="scn-item">
            <div class="scn-item-label">重点方向</div>
            <div class="scn-item-value">${UI.esc(s.target)}</div>
          </div>
        </div>
        ${s.evidence ? `<div class="scn-box-ev"><span>依据</span>${UI.esc(s.evidence)}</div>` : ''}
      </div>`).join('') + '</div>';
  },

  /* 组装一条归档记录（实时数据 + 用户文本域） */
  buildRecord(q, signals, oppRisk, scenarios) {
    const keys = ['dji', 'ixic', 'spx', 'n225', 'ks11', 'topix', 'wti', 'gold', 'usdcnh', 'us10y'];
    const quotes = keys.reduce((o, k) => {
      const d = q[k]; if (d && d.price != null) o[k] = { label: d.label, price: d.price, chgPct: d.chgPct };
      return o;
    }, {});
    return {
      id: Store.uid(),
      date: Market.targetTradingDay(),
      generatedAt: DT.stamp(),
      summary: Market.autoOutlookSummary(q),
      quotes, signals: signals || [],
      opportunities: (oppRisk || {}).opportunities || [],
      risks: (oppRisk || {}).risks || [],
      scenarios: scenarios || [],
      watch: Store.get('outlook_watch', ''),
      strategy: Store.get('outlook_strategy', ''),
      note: Store.get('outlook_summary', '')
    };
  },

  /* 归档写入：同一目标交易日只创建一次，force 时覆盖更新 */
  save(rec, force) {
    const list = Store.rows('outlook_archive', []);
    const idx = list.findIndex(r => r.date === rec.date);
    if (idx >= 0) { if (force) { list[idx] = rec; Store.set('outlook_archive', list); return 'updated'; } return 'exists'; }
    list.push(rec); Store.set('outlook_archive', list); return 'created';
  },

  /* 归档卡片（<details> 原生折叠，无需 JS 控制展开） */
  cardHtml(r) {
    const sc = r.scenarios || [];
    const tone = sc.length ? (sc[2].prob > sc[0].prob ? 'down' : (sc[0].prob > sc[2].prob ? 'up' : 'flat')) : 'flat';
    const m = (r.signals || []).filter(s => s.dir === '偏多').length;
    const k = (r.signals || []).filter(s => s.dir === '偏空').length;
    const toneTag = tone === 'up' ? '<span class="tag tag-red">偏暖</span>' : (tone === 'down' ? '<span class="tag tag-green">偏冷</span>' : '<span class="tag tag-gray">中性</span>');
    const search = [r.date, r.summary, (r.signals || []).map(s => s.name + s.impact).join(' '), (r.opportunities || []).map(o => o.dir).join(' ')].join(' ');
    return `<details class="arch-card" data-search="${UI.esc(search)}">
      <summary class="arch-card-hd">
        <div class="arch-date">📅 ${UI.esc(r.date)}<span class="arch-gen">生成 ${UI.esc(r.generatedAt || '')}</span></div>
        <div class="arch-meta">${toneTag}<span class="arch-bal">信号 偏多${m}/偏空${k}</span><span class="arch-arrow">▾</span></div>
      </summary>
      <div class="arch-sum">${UI.esc(r.summary || '')}</div>
      ${OL.detailHtml(r)}
    </details>`;
  },
  detailHtml(r) {
    const qs = r.quotes || {};
    const chips = Object.keys(qs).map(k => {
      const d = qs[k], p = d.chgPct || 0, cls = UI.dirCls(p);
      return `<span class="qchip ${cls}"><b>${UI.esc(d.label || k)}</b> ${d.price != null ? d.price.toFixed(2) : '--'} <i>${UI.sign(p, 2, '%')}</i></span>`;
    }).join('');
    return `<div class="arch-detail">
      <div class="sub-title">关键变量（归档快照）</div>
      <div class="arch-qs">${chips || '<span class="ei">—</span>'}</div>
      <div class="sub-title">外围信号</div>
      ${UI.signalTable(r.signals)}
      <div class="sub-title">机会方向</div>
      ${OL.oppListHtml(r.opportunities)}
      <div class="sub-title">风险方向</div>
      ${OL.riskListHtml(r.risks)}
      <div class="sub-title">三种情景推演</div>
      ${OL.scenarioCardsHtml(r.scenarios)}
      ${r.note ? `<div class="sub-title">开盘前定调</div><div class="arch-note">${UI.esc(r.note)}</div>` : ''}
      ${r.watch ? `<div class="sub-title">重点观察</div><div class="arch-note">${UI.esc(r.watch)}</div>` : ''}
      ${r.strategy ? `<div class="sub-title">策略建议</div><div class="arch-note">${UI.esc(r.strategy)}</div>` : ''}
      <div class="arch-actions">
        <button class="btn btn-sm btn-ghost" data-act="img-outlook" data-id="${UI.esc(r.id || '')}">🖼 存为长图</button>
        <button class="btn btn-sm btn-ghost arch-del" data-act="del-outlook" data-id="${UI.esc(r.id || '')}">🗑 删除此条总结</button>
      </div>
    </div>`;
  },

  /* 盘前总结归档 → 长图文档结构 */
  imageDoc(r) {
    const sec = [];
    if (r.summary) sec.push({ title: '综合研判', blocks: [{ t: 'text', text: r.summary }] });
    const qs = r.quotes || {};
    const keys = Object.keys(qs);
    if (keys.length) sec.push({
      title: '关键变量（归档快照）',
      blocks: [{ t: 'chips', items: keys.map(k => {
        const d = qs[k], p = d.chgPct || 0;
        return { label: d.label || k, value: (d.price != null ? d.price.toFixed(2) : '--') + ' ' + UI.sign(p, 2, '%'), dir: p > 0 ? 'up' : p < 0 ? 'down' : '' };
      }) }]
    });
    if ((r.signals || []).length) sec.push({
      title: '外围信号',
      blocks: [{ t: 'rows', items: r.signals.map(s => ([
        { text: s.name + ' ', bold: true },
        { text: s.dir, dir: s.dir === '偏多' ? 'up' : s.dir === '偏空' ? 'down' : '' },
        { text: '　' + (s.detail || '') + (s.impact ? '｜' + s.impact : '') }
      ])) }]
    });
    if ((r.opportunities || []).length) sec.push({
      title: '机会方向',
      blocks: [{ t: 'rows', items: r.opportunities.map(o => ([
        { text: o.dir + ' ', bold: true, dir: 'up' },
        { text: o.trigger || o.logic || '' }
      ])) }]
    });
    if ((r.risks || []).length) sec.push({
      title: '风险方向',
      blocks: [{ t: 'rows', items: r.risks.map(o => ([
        { text: o.dir + ' ', bold: true, dir: 'down' },
        { text: o.logic || '' }
      ])) }]
    });
    if ((r.scenarios || []).length) sec.push({
      title: '三种情景推演',
      blocks: [{ t: 'rows', items: r.scenarios.map(s => ([
        { text: s.name + ' ' + s.prob + '% ', bold: true, dir: s.cls === 'up' ? 'up' : s.cls === 'down' ? 'down' : '' },
        { text: (s.trigger || '') + '；应对：' + (s.action || '') + '；方向：' + (s.target || '') }
      ])) }]
    });
    if (r.note) sec.push({ title: '开盘前定调', blocks: [{ t: 'text', text: r.note }] });
    if (r.watch) sec.push({ title: '重点观察', blocks: [{ t: 'text', text: r.watch }] });
    if (r.strategy) sec.push({ title: '策略建议', blocks: [{ t: 'text', text: r.strategy }] });
    return {
      title: '次日盘前总结',
      sub: `目标交易日 ${r.date} · 生成于 ${r.generatedAt || ''}`,
      filename: `盘前总结_${r.date}.png`,
      sections: sec
    };
  }
};

/* ============================================================
   ④ 次日展望（04:00 / 07:00 自动更新）
   ============================================================ */
V.outlook = {
  title: '次日A股开盘前总结',
  desc: '隔夜要闻 · 夜盘美股 · 日韩股市 · 外围信号 → 开盘前综合研判',
  render() {
    return `
      <div class="live-bar">
        <span class="live-dot"></span>
        <b>实时更新中</b>
        <span class="st" id="olASess">A股 --</span>
        <span class="st" id="olTarget">目标交易日 --</span>
        <span class="stamp" id="olLiveStamp">--</span>
      </div>
      <div class="ol-closed-tip" id="olClosedTip" style="display:none"></div>

      ${UI.card({
        title: '🌅 次日A股开盘前总结',
        sub: '整合隔夜要闻 · 夜盘美股 · 日韩股市 · 外围信号 → 自动生成综合研判',
        right: `<span class="tag tag-amber" id="olStatus">读取中…</span>
                <button class="btn btn-sm btn-solid" data-act="save-outlook">💾 保存今日</button>`,
        body: `<div class="ai-summary" id="olAiSummary"><p>正在读取隔夜行情并生成开盘前瞻…</p></div>`
      })}

      ${UI.card({
        title: '🔑 关键变量（实时）',
        sub: '美股 / 商品汇率美债 / 日韩港股 · 实时',
        right: `<button class="btn btn-sm btn-ghost" data-act="reload-outlook">立即刷新</button>`,
        tight: true,
        body: `<div style="padding:12px 14px">
          <div class="mini-sep">美股</div>
          <div id="olUs">${MK.loadingGrid(3, true)}</div>
          <div class="mini-sep">外围（商品 / 汇率 / 美债）</div>
          <div id="olMacro">${MK.loadingGrid(4, true)}</div>
          <div class="mini-sep">亚太（日韩 / 港股联动）</div>
          <div id="olAsia">${MK.loadingGrid(5, true)}</div>
        </div>`
      })}

      ${UI.card({
        title: '📡 外围信号',
        sub: '美股板块 · 日韩港股板块 · 宏观变量 实时整理',
        tight: true,
        right: `<span class="tag tag-pink" id="olSigCnt">实时</span>`,
        body: `<div id="olSignals" class="signal-section"><div class="empty-prompt"><span class="ei">📡</span>行情读取后将根据美股 / 日韩板块自动生成外围信号。</div></div>`
      })}

      ${UI.card({
        title: '📰 隔夜要闻摘要',
        sub: '美股 / 美联储 / 原油 / 亚太相关真实快讯 · 自动摘要',
        right: `<button class="btn btn-sm btn-ghost" data-act="reload-news">刷新快讯</button>`,
        tight: true,
        body: `<div id="olNews"><div class="flash-empty">正在拉取隔夜要闻…</div></div>`
      })}

      ${UI.card({
        title: '🎯 机会方向',
        sub: '综合信号自动推导 · 偏多方向',
        tight: true,
        body: `<div id="olOpp"><div class="empty-prompt"><span class="ei">📡</span>行情读取后自动生成机会方向…</div></div>`
      })}

      ${UI.card({
        title: '🛡️ 风险方向',
        sub: '综合信号自动推导 · 偏空方向',
        tight: true,
        body: `<div id="olRisk"><div class="empty-prompt"><span class="ei">📡</span>行情读取后自动生成风险方向…</div></div>`
      })}

      ${UI.card({
        title: '📋 开盘前定调',
        sub: '依据：纳指/道指实时涨跌幅 + 外围信号净方向 + 机会/风险方向 · 全自动生成',
        body: `<div class="ol-auto" id="olAutoTone"><div class="flash-empty">正在生成定调判断…</div></div>`
      })}

      ${UI.card({
        title: '🎲 三种情景推演',
        sub: '按信号净方向自动推导概率 · 提前想好应对',
        tight: true,
        body: `<div id="olScn"><div class="empty-prompt"><span class="ei">📡</span>行情读取后自动生成三种情景推演。</div></div>`
      })}

      ${UI.card({
        title: '🔭 重点观察方向',
        sub: '依据：英伟达/纳指/原油/离岸人民币实时异动 + 板块级机会方向 · 全自动生成',
        body: `<div class="ol-auto" id="olAutoWatch"><div class="flash-empty">正在生成重点观察方向…</div></div>`
      })}

      ${UI.card({
        title: '🛡️ 策略建议',
        sub: '依据：信号净方向 + 三种情景概率 + 机会/风险方向 · 全自动生成',
        body: `<div class="ol-auto" id="olAutoStrategy"><div class="flash-empty">正在生成策略建议…</div></div>`
      })}

      ${UI.card({
        title: '🗂 盘前总结历史',
        sub: '按目标交易日归档 · 支持回忆查询 · 可删除 · 可存为长图',
        right: `<span class="tag tag-pink" id="olArchCnt">--</span>`,
        body: `<div style="padding:12px 16px">
          <input id="olArchSearch" class="arch-search" style="width:100%;margin-bottom:10px" placeholder="🔍 回忆查询：按日期(2026-08)或关键词(纳指/半导体/存储)…" />
          <div id="olArchList"><div class="flash-empty">读取归档中…</div></div>
        </div>`
      })}
    `;
  },
  async mount(reg) {
    const IDX = ['dji', 'ixic', 'spx'];
    const MAC = ['wti', 'gold', 'us10y', 'usdcnh'];
    const ASI = ['n225', 'ks11', 'topix', 'hsi', 'hstech'];

    let savedOnce = false;
    let lastQ = {};
    let lastSignals = [];
    let lastOppRisk = { opportunities: [], risks: [] };
    let lastScenarios = [];

    /* ---- 自动生成：开盘前定调 ---- */
    function autoTone(q, signals, oppRisk) {
      const m = signals.filter(s => s.dir === '偏多').length;
      const k = signals.filter(s => s.dir === '偏空').length;
      const net = m - k;
      const dji = q.dji, ixic = q.ixic;
      const targetDay = Market.targetTradingDay();

      // 判断开盘方向
      let openDir = '平开';
      let openReason = '外围信号中性';
      if (ixic && ixic.chgPct > 0.8 && dji && dji.chgPct > 0.5) {
        openDir = '偏高开'; openReason = '美股三大指数集体走强，科技领涨';
      } else if (ixic && ixic.chgPct > 0.3) {
        openDir = '小幅高开'; openReason = '纳指收涨，科技股映射偏暖';
      } else if (ixic && ixic.chgPct < -1) {
        openDir = '偏低开'; openReason = '美股明显走弱，科技链承压';
      } else if (ixic && ixic.chgPct < -0.3) {
        openDir = '小幅低开'; openReason = '美股小幅回落，情绪偏谨慎';
      }

      // 主攻方向
      const oppDirs = (oppRisk.opportunities || []).slice(0, 3).map(o => o.dir);
      const mainDir = oppDirs.length ? oppDirs.join(' / ') : '暂无明确主线';

      // 风险点
      const riskDirs = (oppRisk.risks || []).slice(0, 2).map(r => r.dir);
      const riskPoint = riskDirs.length ? riskDirs.join(' / ') : '暂无重大风险';

      // 信号强度描述
      let strength = '中性';
      if (net >= 3) strength = '明显偏多';
      else if (net >= 1) strength = '略偏多';
      else if (net <= -3) strength = '明显偏空';
      else if (net <= -1) strength = '略偏空';

      return `${targetDay} 开盘定调：${openDir}（${openReason}）。信号净方向${strength}（偏多${m}/偏空${k}）。主攻方向：${mainDir}。风险关注：${riskPoint}。`;
    }

    /* ---- 自动生成：重点观察方向 ---- */
    function autoWatch(q, signals, oppRisk) {
      const parts = [];
      const nvda = q.nvda;
      if (nvda && Math.abs(nvda.chgPct) > 1) {
        parts.push(`英伟达${UI.sign(nvda.chgPct, 2, '%')}，${nvda.chgPct > 0 ? 'AI算力链高开则关注承接力' : 'AI算力链承压，观察低开后的修复力度'}`);
      }
      const ixic = q.ixic;
      if (ixic && Math.abs(ixic.chgPct) > 0.5) {
        parts.push(`纳指${UI.sign(ixic.chgPct, 2, '%')}，${ixic.chgPct > 0 ? '科技成长方向观察半导体/消费电子竞价表现' : '科技股承压，注意高位股分歧'}`);
      }
      const wti = q.wti;
      if (wti && Math.abs(wti.chgPct) > 2) {
        parts.push(`WTI原油${UI.sign(wti.chgPct, 2, '%')}，${wti.chgPct > 0 ? '石化/油服关注高开持续性' : '航空/化工关注成本端利好'}`);
      }
      const usdcnh = q.usdcnh;
      if (usdcnh && Math.abs(usdcnh.chgPct) > 0.3) {
        parts.push(`离岸人民币${UI.sign(usdcnh.chgPct, 2, '%')}，${usdcnh.chgPct > 0 ? '北向资金可能流出，白马蓝筹承压' : '北向资金或回流，关注外资偏好板块'}`);
      }
      // 板块级观察
      (oppRisk.opportunities || []).slice(0, 2).forEach(o => {
        if (!parts.some(p => p.indexOf(o.dir) !== -1)) parts.push(`${o.dir}：${o.trigger || o.logic}`);
      });
      if (!parts.length) parts.push('外围信号中性，观察开盘量能与昨日涨停股溢价表现');
      return parts.join('\n');
    }

    /* ---- 自动生成：策略建议 ---- */
    function autoStrategy(q, signals, oppRisk, scenarios) {
      const m = signals.filter(s => s.dir === '偏多').length;
      const k = signals.filter(s => s.dir === '偏空').length;
      const net = m - k;
      const opt = scenarios && scenarios[0] ? scenarios[0].prob : 33;
      const pes = scenarios && scenarios[2] ? scenarios[2].prob : 33;

      const parts = [];
      // 仓位
      if (opt >= 50) parts.push('仓位：可维持6-7成，乐观情形概率较高，顺主线操作');
      else if (opt >= 35) parts.push('仓位：建议5成左右，信号中性偏暖，进可攻退可守');
      else parts.push('仓位：建议3-4成，偏谨慎，以防守为主');

      // 主攻与防守
      const oppDirs = (oppRisk.opportunities || []).slice(0, 2).map(o => o.dir);
      const riskDirs = (oppRisk.risks || []).slice(0, 2).map(r => r.dir);
      if (oppDirs.length) parts.push(`主攻：${oppDirs.join('、')}，回调不破支撑可低吸`);
      if (riskDirs.length) parts.push(`回避：${riskDirs.join('、')}，短期承压不接力`);

      // 止损纪律
      if (pes >= 40) parts.push('风控：悲观情形概率偏高，设好止损位（-5%~-7%），破位即走不犹豫');
      else parts.push('风控：按正常止损纪律执行，单票亏损不超过-7%');

      // 绝对不碰
      if (k > m) parts.push('禁碰：高位缩量板、无业绩支撑纯题材炒作股');
      else parts.push('禁碰：无流动性小票、连续一字板开板后接力');

      return parts.join('\n');
    }

    /* ---- 渲染隔夜要闻 ---- */
    function paintNews() {
      const el = UI.$('#olNews');
      if (!el) return;
      const d = News.data();
      if (!d || !d.items || !d.items.length) {
        el.innerHTML = '<div class="flash-empty">快讯暂不可达，点击右上角「刷新快讯」重试</div>';
        return;
      }
      // 筛选隔夜相关：美股、美联储、原油、国际市场
      const relevant = d.items.filter(i => ['us','fed','oil','global'].indexOf(i.cat) !== -1);
      if (!relevant.length) {
        el.innerHTML = '<div class="flash-empty">暂无隔夜外围相关快讯</div>';
        return;
      }
      // 按重要度+时间排序，取前12条
      relevant.sort((a, b) => ((b.hot ? 1 : 0) - (a.hot ? 1 : 0)) || ((b.ts || 0) - (a.ts || 0)));
      const show = relevant.slice(0, 12);
      el.innerHTML = `<div class="flash-list">${show.map(i => News.flashRow(i, true)).join('')}</div>`
        + (relevant.length > 12 ? `<div class="flash-tip">共 ${relevant.length} 条隔夜相关快讯，此处展示前 12 条 · 完整列表见「全球 & 隔夜要闻」</div>` : '');
    }

    /* ---- 主渲染函数 ---- */
    const paint = q => {
      lastQ = q;
      const setG = (id, keys) => { const el = UI.$('#' + id); if (el) el.innerHTML = MK.grid(q, keys, true); };
      setG('olUs', IDX);
      setG('olMacro', MAC);
      setG('olAsia', ASI);

      const st = UI.$('#olLiveStamp'); if (st) st.textContent = '更新于 ' + DT.clock();
      const sum = UI.$('#olAiSummary');
      if (sum) sum.innerHTML = `<p>${Market.autoOutlookSummary(q)}</p>`;
      const su = UI.$('#olStatus'); if (su) su.textContent = Market.usSession().open ? '美股盘中' : '美股收盘后';
      const tg = UI.$('#olTarget'); if (tg) tg.textContent = '目标交易日 ' + Market.targetTradingDay();

      // A股开收盘状态 + 休市提示
      const aSess = Market.aSession();
      const asEl = UI.$('#olASess');
      if (asEl) asEl.textContent = aSess.text;
      const tip = UI.$('#olClosedTip');
      if (tip) {
        const target = Market.targetTradingDay();
        const todayStr = DT.today();
        if (aSess.closed) {
          // 周末/节假日全天休市
          tip.style.display = '';
          tip.innerHTML = `🔕 今日A股休市（${UI.esc(aSess.reason || '')}），无盘中行情。本页总结面向下一交易日 <b>${target}</b>，所引用的A股收盘数据为最近交易日 <b>${Market.tradingDay()}</b>。`;
        } else if (aSess.text === 'A股已收盘') {
          tip.style.display = '';
          tip.innerHTML = `🌙 今日A股已收盘（15:00），本页总结面向下一交易日 <b>${target}</b>。收盘后如有重大公告/新闻，请以「隔夜要闻」最新快讯为准。`;
        } else if (aSess.text === 'A股未开盘') {
          tip.style.display = '';
          tip.innerHTML = `🌅 今日A股尚未开盘（09:30 开盘），本页总结面向今日 <b>${target}</b>，请在开盘前完成阅读。`;
        } else {
          tip.style.display = 'none';
        }
      }

      const signals = OL.buildSignals(q);
      const oppRisk = OL.buildOppRisk(q);
      const scenarios = OL.buildScenarios(oppRisk.opportunities, oppRisk.risks, signals, q);
      lastSignals = signals;
      lastOppRisk = oppRisk;
      lastScenarios = scenarios;

      const sig = UI.$('#olSignals'); if (sig) sig.innerHTML = UI.signalTable(signals);
      const sc = UI.$('#olSigCnt'); if (sc) sc.textContent = signals.length + ' 条信号';
      const opp = UI.$('#olOpp'); if (opp) opp.innerHTML = OL.oppListHtml(oppRisk.opportunities);
      const rsk = UI.$('#olRisk'); if (rsk) rsk.innerHTML = OL.riskListHtml(oppRisk.risks);
      const scn = UI.$('#olScn'); if (scn) scn.innerHTML = OL.scenarioCardsHtml(scenarios);

      // 自动生成定调/观察/策略（全部基于实时真实数据），并同步写入 Store 供归档使用
      const toneTxt = autoTone(q, signals, oppRisk);
      const watchTxt = autoWatch(q, signals, oppRisk);
      const stratTxt = autoStrategy(q, signals, oppRisk, scenarios);
      Store.set('outlook_summary', toneTxt);
      Store.set('outlook_watch', watchTxt);
      Store.set('outlook_strategy', stratTxt);
      const toneEl = UI.$('#olAutoTone');
      if (toneEl) toneEl.innerHTML = `<div class="ol-auto-text">${UI.esc(toneTxt)}</div>`;
      const watchEl = UI.$('#olAutoWatch');
      if (watchEl) watchEl.innerHTML = `<div class="ol-auto-text">${UI.esc(watchTxt).replace(/\n/g, '<br>')}</div>`;
      const stratEl = UI.$('#olAutoStrategy');
      if (stratEl) stratEl.innerHTML = `<div class="ol-auto-text">${UI.esc(stratTxt).replace(/\n/g, '<br>')}</div>`;

      // 行情就绪后自动归档一次（同日不覆盖，保留用户手动保存的最新版）
      if (!savedOnce) {
        OL.save(OL.buildRecord(q, signals, oppRisk, scenarios), false);
        savedOnce = true;
      }
      V.outlook.lastRec = OL.buildRecord(q, signals, oppRisk, scenarios);
    };

    const load = async () => {
      lastQ = await Market.quotes(IDX.concat(MAC, ASI), q => { lastQ = q; paint(q); });
      paint(lastQ);
    };

    const loadNews = async force => {
      await News.fetchNews(force);
      paintNews();
      // 快讯到位后重新渲染（个股卡片的「依据」需要快讯数据）
      if (lastQ && Object.keys(lastQ).length) paint(lastQ);
    };

    /* ---- 页底：盘前总结历史归档（与行情无关，先行渲染） ---- */
    const filterArch = q => {
      const cards = UI.$$('#olArchList .arch-card');
      let shown = 0;
      cards.forEach(c => {
        const txt = (c.getAttribute('data-search') || '').toLowerCase();
        const show = !q || txt.indexOf(q) >= 0;
        c.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      const cnt = UI.$('#olArchCnt');
      if (cnt) cnt.textContent = q ? (shown + ' / ' + cards.length + ' 条') : (cards.length + ' 条');
    };
    const paintArch = () => {
      const el = UI.$('#olArchList'); if (!el) return;
      const list = Store.rows('outlook_archive', []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      if (!list.length) {
        el.innerHTML = `<div class="empty-prompt"><span class="ei">📭</span>还没有保存的盘前总结。点上方「💾 保存今日」即可生成第一条归档。</div>`;
        const c = UI.$('#olArchCnt'); if (c) c.textContent = '0 条';
        return;
      }
      el.innerHTML = list.map(r => OL.cardHtml(r)).join('');
      const si = UI.$('#olArchSearch');
      filterArch(si ? (si.value || '').trim().toLowerCase() : '');
    };
    V.outlook.paintArch = paintArch; // 供保存/删除动作后刷新
    paintArch();
    const si = UI.$('#olArchSearch');
    if (si) si.addEventListener('input', e => filterArch((e.target.value || '').trim().toLowerCase()));

    reg.onReload = load;
    reg.onNewsReload = () => loadNews(true);
    await Promise.all([load(), loadNews(false)]);

    // 实时自动刷新（每 30 秒），不带倒计时提示
    reg.interval(() => { load(); loadNews(false); }, 30000);
  },
  /* 最新一次生成的归档记录（供 save-outlook 动作读取） */
  lastRec: null
};

/* ============================================================
   盘前总结历史已并入「次日盘前总结」页底（V.outlook 内 #olArchList），
   不再作为独立栏目存在；归档数据仍存于 outlook_archive。
   ============================================================ */

/* ============================================================
   ⑤ 大盘总览
   ============================================================ */
V.sentiment = {
  title: '大盘总览',
  desc: '当日收盘 · 实时同步最新数据',
  // 指数收盘涨跌幅顺序（与截图一比一）
  IDX: [
    { k: 'sh', name: '上证指数' },
    { k: 'sz', name: '深证成指' },
    { k: 'cyb', name: '创业板指' },
    { k: 'kcz', name: '科创综指' },
    { k: 'hs300', name: '沪深300' },
    { k: 'bz50', name: '北证50' }
  ],
  // 市场情绪总览 9 卡（顺序与截图一比一：3×3）
  EMO: [
    { k: 'limitUp', label: '涨停家数', unit: '家', cls: 'up', editable: true },
    { k: 'limitDown', label: '跌停家数', unit: '家', cls: 'down', editable: true },
    { k: 'broken', label: '炸板家数', unit: '家', cls: 'amber', editable: true },
    { k: 'amount', label: '两市成交额', unit: '万亿', cls: '', editable: false },
    { k: 'height', label: '最高连板', unit: '板', cls: 'up', editable: true },
    { k: 'sealRate', label: '封板率', unit: '%', cls: 'amber', editable: true },
    { k: 'north', label: '北向资金', unit: '', cls: 'amber', editable: false, fixed: '暂停披露' },
    { k: 'upCount', label: '上涨家数', unit: '家', cls: 'up', editable: true },
    { k: 'downCount', label: '下跌家数', unit: '家', cls: 'down', editable: true }
  ],
  loadEmo() {
    const ver = SEED.sentimentKpi._ver;
    const raw = Store.get('sentiment_kpi', null);
    const toNum = (v, fallback) => {
      if (v == null || v === '') return fallback;
      if (typeof v === 'string' && ['NaN', 'null', 'undefined', 'Infinity', '-Infinity'].includes(v.trim())) return fallback;
      const n = +v;
      return Number.isFinite(n) ? n : fallback;
    };
    // 干净骨架：除「北向资金（长期暂停披露）」外，情绪数字初始为 null，
    // 必须由实时接口（/api/breadth + 腾讯成交额）填充，绝不预填假数字。
    const skeleton = {
      _ver: ver,
      limitUp: null, limitDown: null, broken: null, amount: null,
      height: null, sealRate: null,
      north: '暂停披露',
      upCount: null, downCount: null, prevAmount: null,
      _manualAt: 0, _live: false, _date: null, _src: ''
    };
    const parse = src => ({
      _ver: ver,
      limitUp: toNum(src.limitUp, null),
      limitDown: toNum(src.limitDown, null),
      broken: toNum(src.broken, null),
      amount: toNum(src.amount, null),
      height: toNum(src.height, null),
      sealRate: toNum(src.sealRate, null),
      north: (src.north != null && String(src.north).trim() !== '') ? String(src.north) : '暂停披露',
      upCount: toNum(src.upCount, null),
      downCount: toNum(src.downCount, null),
      prevAmount: toNum(src.prevAmount, null),
      _manualAt: src._manualAt || 0,
      _live: !!src._live,
      _date: src._date || null,
      _src: src._src || ''
    });

    // 版本不一致 / 旧缓存含假数字 → 直接回到干净骨架（不再回退到写死的示例值）
    const badVersion = !raw || raw._ver !== ver;
    if (badVersion) { Store.set('sentiment_kpi', skeleton); return Object.assign({}, skeleton); }

    const fixed = parse(raw);
    const dirty = ['limitUp','limitDown','broken','amount','height','sealRate','upCount','downCount','prevAmount','north']
      .some(k => String(raw[k]) !== String(fixed[k]));
    if (dirty) Store.set('sentiment_kpi', fixed);
    return fixed;
  },
  emoValue(e, k) {
    if (k === 'north') return e.north || '暂停披露';
    if (k === 'amount') return Number.isFinite(e.amount) ? e.amount.toFixed(2) : '--';
    const v = e[k];
    return Number.isFinite(v) ? Math.round(v) : '--';
  },
  render() {
    const e = this.loadEmo();
    const emoCards = this.EMO.map(m => `
      <div class="emo-kpi ${m.cls}" ${m.editable ? 'data-editable="1"' : ''} data-k="${m.k}">
        <div class="emo-label">${m.label}</div>
        <div class="emo-value">${this.emoValue(e, m.k)}</div>
        <div class="emo-unit">${m.unit}</div>
        ${m.editable ? '<span class="emo-edit">✎</span>' : ''}
      </div>`).join('');

    const idxRows = this.IDX.map(x => `
      <tr data-idx="${x.k}"><td>${x.name}</td>
        <td class="num" data-c="price">读取中…</td>
        <td class="num" data-c="chg">--</td></tr>`).join('');

    const summary = Store.get('sentiment_summary', '');
    const tab = Store.get('sentimentTabs', 'review');
    const isTab = t => tab === t ? 'active' : '';

    // 标签页内容：全部实时采集，容器先占位，mount 后填充真实数据
    const ladderPanel = `
      <div class="sub-card">
        <div class="sub-card-title">🪜 连板梯队 <span class="sub-src" id="ladMeta">采集中…</span></div>
        <div id="ladLive"><div class="flash-empty">正在采集涨停池真实数据…</div></div>
      </div>`;

    const dragonPanel = `
      <div class="sub-card">
        <div class="sub-card-title">🏛️ 龙虎榜 <span class="sub-src" id="lhbMeta">采集中…</span></div>
        <div id="lhbLive"><div class="flash-empty">正在采集龙虎榜真实数据…</div></div>
      </div>`;

    const oppPanel = `
      <div class="sub-card">
        <div class="sub-card-title">🎯 机会方向（行业板块涨幅榜 · 真实）<span class="sub-src" id="secMeta">采集中…</span></div>
        <div id="oppLive"><div class="flash-empty">正在采集板块涨跌数据…</div></div>
      </div>`;

    const riskPanel = `
      <div class="sub-card">
        <div class="sub-card-title">🛡️ 风险避雷（行业板块跌幅榜 · 真实）<span class="sub-src" id="secMeta2"></span></div>
        <div id="riskLive"><div class="flash-empty">正在采集板块涨跌数据…</div></div>
      </div>`;

    const broadcastPanel = `
      <div class="sub-card">
        <div class="sub-card-title">📋 当日小结（按当日真实收盘数据自动生成 · 可手动修订）</div>
        <textarea class="rich-area" id="ovDayNote" placeholder="行情数据到位后自动生成当日小结…" style="min-height:220px"></textarea>
        <div class="broadcast-actions">
          <button class="btn btn-sm btn-pink" data-act="save-daynote">💾 保存小结</button>
          <span class="sub">自动生成基于真实收盘数据 · 手动修改后点保存</span>
        </div>
      </div>`;

    const reviewPanel = `
      <div class="sub-card">
        <div class="sub-card-title">🧭 结构化复盘 <span class="sub-src" id="rvMeta">指数量能 / 情绪周期 / 主线题材 / 情景推演 · 自动生成</span></div>
        <div id="reviewLive"><div class="flash-empty">等待行情与梯队数据采集完成后自动生成结构化复盘…</div></div>
      </div>`;

    return `
      <div class="ov-banner">
        <div class="ov-banner-main">
          <h2>大盘总览</h2>
          <div class="ov-date" id="ovDate">${DT.tradeToday()} ${DT.tradeCnDate().slice(-2)}</div>
        </div>
        <div class="ov-freshness" id="ovFreshness">数据时效核验中…</div>
        <div class="ov-tag" id="ovTag">数据加载中…</div>
      </div>

      ${UI.card({
        title: '📡 市场情绪总览',
        sub: '涨停/跌停/炸板/封板率/涨跌家数 · 东方财富盘口池真实数据 · 按交易日自动对齐 · 口径：涨停/炸板/跌停池不含 ST 股，涨跌家数不含北交所（与「含 ST/北交所」的媒体口径存在小差异属正常，如 2026-08-10 媒体口径涨停 103 家 = 本页 99 家 + ST 4 家）',
        right: `<button class="btn btn-sm btn-solid" data-act="save-sentiment">💾 保存当日记录</button><button class="btn btn-sm btn-ghost" data-act="reload-sentiment">刷新</button>`,
        body: `<div class="emo-grid" id="emoGrid">${emoCards}</div>`
      })}

      <div class="ov-summary-bar" id="ovSummaryBar">数据加载中…</div>

      ${UI.card({
        title: '📊 指数收盘涨跌幅',
        sub: '收盘实时 · 一目了然',
        tight: true,
        body: `<div class="table-wrap narrow readonly"><table>
          <thead><tr><th>指数</th><th class="num">收盘</th><th class="num">涨跌幅</th></tr></thead>
          <tbody id="ovIdxBody">${idxRows}</tbody>
        </table></div>`
      })}

      ${UI.card({
        title: '📝 当日市场总结',
        sub: '根据当日收盘后的情况进行总结整理 · 可手动修订',
        right: `<button class="btn btn-sm btn-pink" data-act="save-summary">保存</button>`,
        body: `<textarea class="rich-area" id="ovSummaryText" placeholder="点击自动生成或手动填写当日大盘总结…">${UI.esc(summary)}</textarea>`
      })}

      <div class="card" id="sentimentDetail">
        <div class="card-head">
          <h3>🔍 市场情绪详情</h3>
          <span class="sub">连板梯队 / 龙虎榜 / 板块机会 / 板块风险 / 当日小结 · 全部真实数据自动采集</span>
        </div>
        <div class="card-body tight">
          <div class="detail-note">📡 以下板块由<span class="src">东方财富真实接口（涨停池 / 龙虎榜 / 行业板块榜）</span>自动采集更新，数据日期跟随 A 股交易日（周末/节假日自动回退最近交易日），不展示任何虚构内容。</div>
          <div class="tab-bar" data-tabs="sentimentTabs">
            <button class="tab ${isTab('review')}" data-tab="review">结构化复盘</button>
            <button class="tab ${isTab('ladder')}" data-tab="ladder">连板梯队</button>
            <button class="tab ${isTab('dragon')}" data-tab="dragon">龙虎榜</button>
            <button class="tab ${isTab('opp')}" data-tab="opp">机会方向</button>
            <button class="tab ${isTab('risk')}" data-tab="risk">风险避雷</button>
            <button class="tab ${isTab('broadcast')}" data-tab="broadcast">当日小结</button>
          </div>
          <div class="tab-panels">
            <div class="tab-panel ${isTab('review')}" data-panel="review">${reviewPanel}</div>
            <div class="tab-panel ${isTab('ladder')}" data-panel="ladder">${ladderPanel}</div>
            <div class="tab-panel ${isTab('dragon')}" data-panel="dragon">${dragonPanel}</div>
            <div class="tab-panel ${isTab('opp')}" data-panel="opp">${oppPanel}</div>
            <div class="tab-panel ${isTab('risk')}" data-panel="risk">${riskPanel}</div>
            <div class="tab-panel ${isTab('broadcast')}" data-panel="broadcast">${broadcastPanel}</div>
          </div>
        </div>
      </div>

      ${UI.card({
        title: '🗂 大盘总览历史记录',
        sub: '按交易日保存的当日快照 · 可删除',
        right: `<span class="tag tag-pink" id="smArchCnt">--</span>`,
        tight: true,
        body: `<div id="smArchList" style="padding:12px 16px"><div class="flash-empty">读取历史记录…</div></div>`
      })}
    `;
  },
  paintIdx(q) {
    const body = UI.$('#ovIdxBody'); if (!body) return;
    this.IDX.forEach(x => {
      const d = q[x.k]; const tr = body.querySelector(`tr[data-idx="${x.k}"]`); if (!tr) return;
      const pc = tr.querySelector('[data-c="price"]'), cc = tr.querySelector('[data-c="chg"]');
      if (!d || d.price == null) {
        if (pc) { pc.textContent = '暂无'; pc.className = 'num flat'; }
        if (cc) { cc.textContent = '—'; cc.className = 'num flat'; }
        return;
      }
      const cls = UI.dirCls(d.chgPct);
      const dec = d.price >= 1000 ? 2 : (d.price >= 100 ? 2 : 4);
      if (pc) { pc.textContent = d.price.toFixed(dec); pc.className = 'num ' + cls; }
      if (cc) { cc.textContent = UI.sign(d.chgPct, 2, '%'); cc.className = 'num ' + cls; }
    });
  },
  paintEmo(e) {
    const grid = UI.$('#emoGrid'); if (!grid) return;
    this.EMO.forEach(m => {
      const card = grid.querySelector(`.emo-kpi[data-k="${m.k}"]`); if (!card) return;
      const v = card.querySelector('.emo-value'); if (v) v.textContent = this.emoValue(e, m.k);
    });
  },
  // 顶部情绪标签 + 粉色小结条 + 底部总结（全部由实时数据驱动，不写死结论）
  paintText(q, e) {
    const isNum = v => Number.isFinite(v);
    const fmtInt = v => isNum(v) ? Math.round(v).toLocaleString('zh-CN') : '—';
    const fmtAmt = v => isNum(v) ? v.toFixed(2) : '—';

    // 顶部日期条：A股开收盘 / 休市逻辑（周末与法定节假日由 tradingDay 回退到最近交易日）
    const dv = UI.$('#ovDate');
    if (dv) {
      const sess = Market.aSession();
      const dStr = e._date || Market.tradingDay();
      if (sess.open) {
        dv.textContent = dStr + ' · 盘中实时数据';
      } else if (sess.closed) {
        dv.textContent = '今日' + sess.text + ' · 展示最近交易日 ' + dStr + ' 收盘数据';
      } else if (sess.text === 'A股已收盘') {
        dv.textContent = dStr + ' · 已收盘 · 收盘数据';
      } else {
        dv.textContent = dStr + ' · 未开盘 · 上一交易日收盘数据';
      }
    }
    // 数据时效总览条：把各模块数据日期/实时状态汇总，确保「当日真实盘面」一眼可核验
    const fr = UI.$('#ovFreshness');
    if (fr) {
      const sess = Market.aSession();
      const dStr = e._date || Market.tradingDay();
      const liveMark = e._live ? '✅ 实时' : '🟡 缓存';
      const intradayMark = (sess.open && e._intraday) ? '当日盘中' : (e._intraday ? '盘中' : '收盘');
      const snap = self._snap || {};
      const ladDate = snap.lad && snap.lad.date ? snap.lad.date : '—';
      const lhbDate = snap.lhb && snap.lhb.date ? snap.lhb.date : '—';
      const secDate = snap.sec && snap.sec.date ? snap.sec.date : '—';
      const srcMark = e._src || (e._live ? '腾讯/东方财富' : '缓存');
      fr.innerHTML = '🔎 数据时效：'
        + '<b>' + liveMark + '</b> · '
        + '情绪/涨跌家数 <b>' + dStr + '</b>(' + intradayMark + ') · '
        + '连板梯队 <b>' + ladDate + '</b> · 龙虎榜 <b>' + lhbDate + '</b> · 行业板块 <b>' + secDate + '</b> · '
        + '来源 <b>' + UI.esc(srcMark) + '</b>'
        + (sess.open ? '' : ' · ⚠️ 当前非盘中，涨停池/龙虎榜为最近交易日收盘数据，非当日盘中');
    }

    const sh = q.sh, kc = q.kcz, sz = q.sz, cyb = q.cyb;
    // 顶部标签（由真实指数与真实涨跌家数推导）
    const tag = UI.$('#ovTag');
    if (tag) {
      const shUp = (sh && isNum(sh.chgPct) && sh.chgPct > 0);
      const amtBig = isNum(e.amount) && e.amount >= 2;
      const moreUp = isNum(e.upCount) && isNum(e.downCount) && e.upCount > e.downCount;
      const liveOk = e._live || (isNum(e.upCount) && isNum(e.amount));
      tag.textContent = !liveOk
        ? '实时数据获取中…'
        : `沪指${shUp ? '上涨' : '下跌'} · ${amtBig ? '放量' : '缩量'}${moreUp ? '普涨' : '分歧'}日`;
    }
    // 成交额较上日变化（需 prevAmount，否则省略）
    let amtChg = '';
    if (isNum(e.amount) && isNum(e.prevAmount) && e.prevAmount > 0) {
      const diff = (e.amount - e.prevAmount) * 10000;
      amtChg = `${diff >= 0 ? '放量约' : '缩量约'}${Math.abs(Math.round(diff))}亿 较上日`;
    }
    // 粉色小结条
    const bar = UI.$('#ovSummaryBar');
    if (bar) {
      const liveOk = e._live || (isNum(e.amount) && isNum(e.upCount));
      if (!liveOk) {
        bar.textContent = '实时行情获取中…（指数来自腾讯，涨跌家数/涨停池来自东方财富，联网后自动刷新）';
      } else {
        const seg1 = amtChg || (isNum(e.amount) ? `两市成交${fmtAmt(e.amount)}万亿` : '成交额读取中');
        const dateSeg = e._date ? `【${e._date}${e._intraday ? ' 盘中' : ' 收盘'}】` : '';
        const src = e._live ? ` · 数据：${e._src || '腾讯/东方财富'}实时` : ' · 缓存数据';
        bar.textContent = `${dateSeg}${seg1} · 上涨${fmtInt(e.upCount)}家/下跌${fmtInt(e.downCount)}家 · 涨停${fmtInt(e.limitUp)}家、跌停${fmtInt(e.limitDown)}家、炸板${fmtInt(e.broken)}家 · 最高${fmtInt(e.height)}板 · 封板率${isNum(e.sealRate) ? e.sealRate + '%' : '—'}${src}（东财口径：不含ST/北交所）`;
      }
    }
    // 底部总结（仅当未手动保存过时自动生成，全部由真实数据驱动）
    const ta = UI.$('#ovSummaryText');
    if (ta && !ta.dataset.touched) {
      const wk = DT.tradeCnDate().slice(-2);
      const pct = d => (d && isNum(d.chgPct)) ? UI.sign(d.chgPct, 2, '%') : '';
      const lead = (sh && isNum(sh.chgPct)) ? (sh.chgPct > 0 ? '上涨' : (sh.chgPct < 0 ? '下跌' : '平盘')) : '震荡';
      const shTxt = sh && isNum(sh.chgPct) ? `沪指${pct(sh)}收${sh && isNum(sh.price) ? sh.price.toFixed(2) : '—'}` : '沪指数据读取中';
      const kcTxt = (kc && isNum(kc.chgPct)) ? `科创综指${pct(kc)}` : '';
      const sum = `${wk}两市${lead}，${shTxt}${kcTxt ? '，' + kcTxt : ''}。`
        + (isNum(e.amount) ? `两市成交${fmtAmt(e.amount)}万亿${amtChg ? '，' + amtChg : ''}。` : '')
        + (isNum(e.upCount) && isNum(e.downCount)
            ? `上涨${fmtInt(e.upCount)}家、下跌${fmtInt(e.downCount)}家`
            : '涨跌家数获取中')
        + (isNum(e.limitUp) ? `，涨停${fmtInt(e.limitUp)}家、跌停${fmtInt(e.limitDown)}家` : '')
        + (isNum(e.sealRate) ? `，封板率${e.sealRate}%。` : '。');
      ta.value = sum;
      UI.autosize(ta);
    }
  },

  /* ---- 连板梯队渲染（真实涨停池数据） ---- */
  paintLadder(d) {
    const el = UI.$('#ladLive'); if (!el) return;
    const meta = UI.$('#ladMeta');
    if (!d || !d.ok || !d.items.length) {
      el.innerHTML = '<div class="flash-empty">涨停池数据暂不可达，点「刷新」重试。不展示虚构内容。</div>';
      if (meta) meta.textContent = '获取失败';
      return;
    }
    if (meta) meta.textContent = `${d.date}${d.intraday ? ' 盘中' : ' 收盘'} · 共${d.items.length}只涨停 · 来源：${d.source}`;
    // 按连板数分组
    const groups = {};
    d.items.forEach(i => { (groups[i.lbc] = groups[i.lbc] || []).push(i); });
    const rows = Object.keys(groups).map(Number).sort((a, b) => b - a).map(lbc => {
      const items = groups[lbc];
      const names = items.map(i =>
        `<span class="lad-stock" title="代码 ${i.code} · 首封 ${i.fbt || '--'}${i.zbc ? ' · 炸板' + i.zbc + '次' : ''}${i.hybk ? ' · ' + i.hybk : ''}">${UI.esc(i.name)}${i.zbc ? '<i class="lad-zb">炸' + i.zbc + '</i>' : ''}</span>`
      ).join('');
      return `<tr>
        <td class="num center"><b class="lad-lbc ${lbc >= 3 ? 'lad-hot' : ''}">${lbc}板</b></td>
        <td class="num center">${items.length}只</td>
        <td><div class="lad-stocks">${names}</div></td>
      </tr>`;
    }).join('');
    el.innerHTML = `<div class="table-wrap readonly"><table>
      <thead><tr><th class="num" style="width:70px">高度</th><th class="num" style="width:60px">家数</th><th>个股（悬停查看首封时间/行业/炸板次数）</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  },

  /* ---- 龙虎榜渲染（真实每日上榜数据） ---- */
  paintBillboard(d) {
    const el = UI.$('#lhbLive'); if (!el) return;
    const meta = UI.$('#lhbMeta');
    if (!d || !d.ok || !d.items.length) {
      el.innerHTML = '<div class="flash-empty">龙虎榜数据暂不可达（收盘后约18:00披露），点「刷新」重试。</div>';
      if (meta) meta.textContent = '获取失败';
      return;
    }
    const totalNet = d.items.reduce((s, i) => s + (i.net || 0), 0);
    if (meta) meta.textContent = `${d.date} · 全榜${d.items.length}只 · 合计净${totalNet >= 0 ? '买入' : '卖出'}${Math.abs(totalNet).toFixed(1)}亿 · 来源：${d.source}`;
    const fmtN = v => v == null ? '—' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v}</span>`;
    const top = d.items.slice(0, 15).map(i => `<tr>
      <td><b>${UI.esc(i.name)}</b><span class="sub"> ${i.code}</span></td>
      <td class="num ${UI.dirCls(i.chgPct)}">${i.chgPct != null ? UI.sign(i.chgPct, 2, '%') : '—'}</td>
      <td class="num">${fmtN(i.net)}</td>
      <td>${UI.esc(i.reason)}</td>
      <td class="sub">${UI.esc(i.inst)}</td>
    </tr>`).join('');
    const inst = d.instItems.slice(0, 10).map(i => `<tr>
      <td><b>${UI.esc(i.name)}</b></td>
      <td class="num">${fmtN(i.net)}</td>
      <td class="sub">${UI.esc(i.inst)}</td>
    </tr>`).join('');
    el.innerHTML = `
      <div class="sub-title" style="margin-top:2px">净买入 TOP15（单位：亿元）</div>
      <div class="table-wrap readonly"><table>
        <thead><tr><th style="width:130px">个股</th><th class="num" style="width:80px">涨跌幅</th><th class="num" style="width:80px">净买额</th><th>上榜原因</th><th style="width:180px">机构解读</th></tr></thead>
        <tbody>${top}</tbody></table></div>
      ${inst ? `<div class="sub-title">机构席位相关（${d.instItems.length}只）</div>
      <div class="table-wrap readonly"><table>
        <thead><tr><th style="width:130px">个股</th><th class="num" style="width:90px">净买额(亿)</th><th>机构动向</th></tr></thead>
        <tbody>${inst}</tbody></table></div>` : ''}`;
  },

  /* ---- 板块机会/风险渲染（真实行业板块榜） ---- */
  paintSectors(d) {
    const fmtNf = v => v == null ? '—' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v}亿</span>`;
    const tbl = (list, isUp) => `<div class="table-wrap readonly"><table>
      <thead><tr><th style="width:120px">板块</th><th class="num" style="width:80px">涨跌幅</th><th class="num" style="width:100px">主力净流入</th><th>领涨股</th><th>${isUp ? '关注逻辑' : '风险逻辑'}</th></tr></thead>
      <tbody>${list.map((s, i) => `<tr>
        <td><b>${UI.esc(s.name)}</b></td>
        <td class="num ${UI.dirCls(s.chgPct)}">${s.chgPct != null ? UI.sign(s.chgPct, 2, '%') : '—'}</td>
        <td class="num">${fmtNf(s.netInflow)}</td>
        <td>${UI.esc(s.leader)}${s.leaderChg != null ? ` <span class="sub">${UI.sign(s.leaderChg, 2, '%')}</span>` : ''}</td>
        <td class="sub">${isUp
          ? (i < 3 ? '板块涨幅居前且资金流入，次日观察持续性' : '跟随性机会，关注量能配合')
          : (i < 3 ? '板块明显走弱，短期回避接力' : '弱势方向，等企稳信号')}</td>
      </tr>`).join('')}</tbody></table></div>`;
    const meta1 = UI.$('#secMeta'), meta2 = UI.$('#secMeta2');
    const opp = UI.$('#oppLive'), risk = UI.$('#riskLive');
    if (!d || !d.ok) {
      if (opp) opp.innerHTML = '<div class="flash-empty">板块数据暂不可达，点「刷新」重试。</div>';
      if (risk) risk.innerHTML = '<div class="flash-empty">板块数据暂不可达，点「刷新」重试。</div>';
      return;
    }
    if (meta1) meta1.textContent = `来源：${d.source}`;
    if (meta2) meta2.textContent = `来源：${d.source}`;
    if (opp) opp.innerHTML = tbl(d.up, true);
    if (risk) risk.innerHTML = tbl(d.down, false);
  },

  /* ---- 当日小结：全部由真实采集数据生成 ---- */
  buildDayNote(q, e, lad, lhb, sec) {
    const isNum = v => Number.isFinite(v);
    const date = e._date || Market.tradingDay();
    const L = [];
    const pct = d => (d && isNum(d.chgPct)) ? UI.sign(d.chgPct, 2, '%') : null;
    // 指数
    const idxParts = ['sh', 'sz', 'cyb'].map(k => {
      const d = q[k]; if (!d || !isNum(d.chgPct)) return null;
      return `${d.label || k}${pct(d)}`;
    }).filter(Boolean);
    if (idxParts.length) L.push(`【指数】${idxParts.join('，')}${isNum(e.amount) ? `，两市成交${e.amount.toFixed(2)}万亿` : ''}。`);
    // 情绪
    if (isNum(e.upCount)) {
      L.push(`【情绪】上涨${e.upCount}家/下跌${e.downCount}家，涨停${e.limitUp ?? '—'}家、跌停${e.limitDown ?? '—'}家、炸板${e.broken ?? '—'}家，封板率${isNum(e.sealRate) ? e.sealRate + '%' : '—'}，最高连板${isNum(e.height) ? e.height + '板' : '—'}。`);
    }
    // 梯队
    if (lad && lad.ok && lad.items.length) {
      const top = lad.items[0];
      const grp = {}; lad.items.forEach(i => { grp[i.lbc] = (grp[i.lbc] || 0) + 1; });
      const lv = Object.keys(grp).map(Number).sort((a, b) => b - a).slice(0, 4).map(l => `${l}板${grp[l]}只`).join('、');
      L.push(`【梯队】空间高度${top.name}${top.lbc}板，梯队分布：${lv}。${top.lbc >= 5 ? '高位股情绪亢奋，注意分歧风险。' : top.lbc <= 2 ? '高度压制，接力情绪偏弱，宜低吸不宜追高。' : '高度适中，关注晋级赛。'}`);
    }
    // 板块
    if (sec && sec.ok) {
      const up3 = sec.up.slice(0, 3).map(s => `${s.name}${UI.sign(s.chgPct, 2, '%')}`).join('、');
      const dn3 = sec.down.slice(0, 3).map(s => `${s.name}${UI.sign(s.chgPct, 2, '%')}`).join('、');
      L.push(`【板块】领涨：${up3}；领跌：${dn3}。`);
    }
    // 龙虎榜
    if (lhb && lhb.ok && lhb.items.length) {
      const t = lhb.items[0];
      const totalNet = lhb.items.reduce((s, i) => s + (i.net || 0), 0);
      L.push(`【龙虎榜】全榜${lhb.items.length}只，合计净${totalNet >= 0 ? '买入' : '卖出'}${Math.abs(totalNet).toFixed(1)}亿；净买居首：${t.name}${t.net != null ? '（' + (t.net >= 0 ? '+' : '') + t.net + '亿）' : ''}。`);
    }
    // 定性
    if (isNum(e.upCount) && isNum(e.downCount)) {
      const mood = e.upCount / Math.max(1, e.downCount);
      const seal = isNum(e.sealRate) ? e.sealRate : 50;
      let tone;
      if (mood > 1.5 && seal >= 70) tone = '市场情绪偏暖，赚钱效应较好，次日可顺势关注主线持续性。';
      else if (mood < 0.7 || seal < 55) tone = '市场情绪偏弱，亏钱效应明显，次日以防守为主、控制仓位。';
      else tone = '市场情绪中性分歧，次日轻指数重个股，聚焦有承接的方向。';
      L.push(`【小结】${tone}（数据来源：腾讯行情 / 东方财富盘口池、龙虎榜、行业板块榜）`);
    }
    return L.join('\n');
  },

  /* ---- 结构化复盘：①指数量能 ②情绪周期 ③主线题材评分 ④条件-应对推演 ----
     全部由当日真实采集数据推导；量能对比/情绪方向变化读取本地归档中的前一交易日记录，
     无基准时如实说明，不编造；不预测点位，只给「条件—应对」。 */
  buildReview(q, e, lad, lhb, sec) {
    const isNum = Number.isFinite;
    const date = e._date || Market.tradingDay();
    const idxName = k => { const m = this.IDX.find(x => x.k === k); return m ? m.name : k; };

    // 前一交易日归档（量能/情绪对比基准，本地真实历史）
    const prev = Store.rows('sentiment_archive', [])
      .filter(r => r.date && r.date !== date && r.kpi && isNum(r.kpi.amount))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;

    /* ① 指数与成交量特征 */
    const idxKeys = ['sh', 'sz', 'cyb', 'kcz', 'hs300', 'bz50'];
    const idxList = idxKeys.filter(k => q[k] && isNum(q[k].chgPct)).map(k => ({ k, name: idxName(k), chgPct: q[k].chgPct, price: q[k].price }));
    const upN = idxList.filter(d => d.chgPct > 0).length;
    const dnN = idxList.filter(d => d.chgPct < 0).length;
    const sorted = idxList.slice().sort((a, b) => b.chgPct - a.chgPct);
    const lead = sorted[0] || null, lag = sorted[sorted.length - 1] || null;
    const resonance = !idxList.length ? '指数数据未到位'
      : upN === idxList.length ? '六大指数全线收涨，共振上行'
      : dnN === idxList.length ? '六大指数全线收跌，共振下行'
      : `指数分化（${upN}涨/${dnN}跌）${lead && lag ? `，${lead.name}领涨（${UI.sign(lead.chgPct, 2, '%')}）、${lag.name}最弱（${UI.sign(lag.chgPct, 2, '%')}）` : ''}`;
    let volRatio = null, volText;
    if (isNum(e.amount) && prev && isNum(prev.kpi.amount) && prev.kpi.amount > 0) {
      volRatio = e.amount / prev.kpi.amount;
      const pct = Math.round((volRatio - 1) * 100);
      volText = `两市成交 ${e.amount.toFixed(2)} 万亿，较 ${prev.date}（${prev.kpi.amount.toFixed(2)} 万亿）${volRatio >= 1.05 ? '放量' : volRatio <= 0.95 ? '缩量' : '量能持平'}（${pct >= 0 ? '+' : ''}${pct}%）`;
    } else if (isNum(e.amount)) {
      volText = `两市成交 ${e.amount.toFixed(2)} 万亿（暂无前一日归档基准，保存记录后可对比量能变化）`;
    } else volText = '成交额数据未到位';
    let vp;
    const mktUp = lead && lead.chgPct > 0 && (lag ? lag.chgPct >= 0 || upN >= dnN : true);
    if (volRatio != null && idxList.length) {
      if (mktUp && volRatio >= 1.05) vp = '量价齐升，上涨有量能支撑，结构相对健康';
      else if (mktUp && volRatio <= 0.95) vp = '缩量上涨，资金追涨意愿不足，持续性需要观察';
      else if (!mktUp && volRatio >= 1.05) vp = '放量下跌，资金离场迹象明显，注意风险释放';
      else if (!mktUp && volRatio <= 0.95) vp = '缩量调整，抛压有限，属良性消化';
      else vp = '量能平稳，量价配合中性';
    } else vp = '暂缺量能对比基准，量价关系留待后续记录验证';

    /* ② 情绪周期定位（冰点/修复/发酵/高潮/退潮） */
    const lu = e.limitUp, ld = e.limitDown, brk = e.broken, hg = e.height, sr = e.sealRate;
    const basis = [];
    if (isNum(lu)) basis.push(`涨停${lu}家`);
    if (isNum(ld)) basis.push(`跌停${ld}家`);
    if (isNum(brk)) basis.push(`炸板${brk}家`);
    if (isNum(sr)) basis.push(`封板率${sr}%`);
    if (isNum(hg)) basis.push(`最高${hg}板`);
    if (isNum(e.upCount)) basis.push(`涨${e.upCount}/跌${e.downCount}家`);
    let cooling = false, warming = false;
    if (prev && prev.kpi) {
      const p = prev.kpi;
      cooling = (isNum(lu) && isNum(p.limitUp) && lu < p.limitUp * 0.8) || (isNum(hg) && isNum(p.height) && hg < p.height) || (isNum(sr) && isNum(p.sealRate) && sr < p.sealRate - 10);
      warming = (isNum(lu) && isNum(p.limitUp) && lu > p.limitUp * 1.2) || (isNum(hg) && isNum(p.height) && hg > p.height);
      if (isNum(p.limitUp)) basis.push(`前日涨停${p.limitUp}家${isNum(lu) ? (lu >= p.limitUp ? '→升温' : '→降温') : ''}`);
    }
    let stage = null;
    if (isNum(lu) && isNum(sr) && isNum(hg)) {
      if ((lu < 30 && sr < 55) || (isNum(ld) && ld >= 30)) stage = '冰点';
      else if (lu >= 80 && sr >= 70 && hg >= 5) stage = '高潮';
      else if (lu >= 50 && sr >= 60 && hg >= 3) stage = '发酵';
      else stage = cooling ? '退潮' : (warming ? '发酵' : '修复');
      // 退潮优先：炸板失控（炸板≥涨停）或高潮/发酵后全面降温
      if (stage !== '冰点' && isNum(brk) && isNum(lu) && brk >= lu) stage = '退潮';
      else if (stage !== '冰点' && stage !== '退潮' && cooling && (!warming)) {
        if (stage === '高潮' || stage === '发酵') stage = '退潮';
      }
    }
    const stageDesc = {
      '冰点': '情绪极度低迷：涨停稀少、封板率低、亏钱效应明显。历史上冰点多对应短期情绪底部区域，等待恐慌释放后的修复契机，不宜再悲观杀跌。',
      '修复': '亏钱效应减缓：涨停数量回升但连板高度有限，资金试探性回流。观察能否打开高度、走出新周期主线，修复期适合轻仓试错。',
      '发酵': '赚钱效应扩散：连板高度打开、涨停成群、封板率健康，主线逐步清晰。发酵期是顺势窗口，围绕主线前排操作。',
      '高潮': '情绪亢奋：涨停潮 + 高封板率 + 高度板。高潮次日历来多分化，不宜再追高位一致性，持仓去弱留强、提防炸板负反馈。',
      '退潮': '亏钱效应显现：炸板率升高、高度回落、涨停锐减。退潮期以防守为主，控制仓位等下一轮冰点后的修复信号。'
    };

    /* ③ 主线题材及持续性评分（0-100）
       评分维度：题材内涨停家数 / 连板高度 / 是否登上行业涨幅榜 / 主力净流入 / 涨停股资金体量 */
    const themeMap = {};
    if (lad && lad.ok && lad.items) lad.items.forEach(i => {
      const k = i.hybk || '未分类';
      const t = themeMap[k] = themeMap[k] || { count: 0, maxLbc: 0, names: [], fund: 0 };
      t.count++;
      t.maxLbc = Math.max(t.maxLbc, i.lbc || 1);
      if (t.names.length < 6) t.names.push(i.name);
      t.fund += (i.fund || 0);
    });
    const secUp = (sec && sec.ok && sec.up) ? sec.up : [];
    const themes = Object.keys(themeMap).map(name => {
      const t = themeMap[name];
      const hit = secUp.find(s => s.name === name || name.indexOf(s.name) >= 0 || s.name.indexOf(name) >= 0);
      let score = 0; const why = [];
      if (t.count >= 5) { score += 30; why.push(`题材内涨停${t.count}家，梯队完整`); }
      else if (t.count >= 3) { score += 22; why.push(`题材内涨停${t.count}家`); }
      else { score += 12; why.push(`题材内涨停${t.count}家`); }
      if (t.maxLbc >= 4) { score += 22; why.push(`有${t.maxLbc}板高度龙头`); }
      else if (t.maxLbc === 3) { score += 16; why.push('有3板高度股'); }
      else if (t.maxLbc === 2) { score += 8; why.push('有2板股'); }
      if (hit) {
        if (hit.chgPct >= 3) { score += 15; why.push(`板块涨幅${UI.sign(hit.chgPct, 2, '%')}居前`); }
        else if (hit.chgPct >= 1) { score += 8; why.push(`板块涨${UI.sign(hit.chgPct, 2, '%')}`); }
        if (isNum(hit.netInflow) && hit.netInflow > 0) { score += 15; why.push(`主力净流入${hit.netInflow}亿`); }
      } else why.push('未登行业涨幅榜（纯题材炒作属性）');
      if (t.fund > 0) { score += 8; why.push(`涨停股资金体量约${t.fund.toFixed(1)}亿`); }
      score = Math.min(100, score);
      return { name, score, count: t.count, maxLbc: t.maxLbc, names: t.names, why,
        grade: score >= 70 ? '强持续' : score >= 50 ? '中等持续' : '偏弱/轮动',
        cls: score >= 70 ? 'up' : score >= 50 ? 'amber' : 'down' };
    }).filter(t => t.count >= 2).sort((a, b) => b.score - a.score).slice(0, 5);

    /* ④ 最需注意的机会 & 最需规避的两个风险
       与「机会方向 / 风险避雷」页签严格同源：机会取行业涨幅榜中首个被涨停主线交叉验证的板块
       （无交叉时取涨幅榜第一），风险取行业跌幅榜前二 —— 不臆测、不偏离页签数据 */
    const secDn = (sec && sec.ok && sec.down) ? sec.down : [];
    const secOk = !!(sec && sec.ok && (secUp.length || secDn.length));
    let oppPick = null;
    for (const s of secUp) {
      // 板块名匹配，或板块领涨股就是某主线题材的代表股（交叉验证，保证与「机会方向」页签首行一致）
      const t = themes.find(t => t.name === s.name || t.name.indexOf(s.name) >= 0 || s.name.indexOf(t.name) >= 0
        || (s.leader && t.names.some(n => n === s.leader)));
      if (t) {
        const viaLeader = !(t.name === s.name || t.name.indexOf(s.name) >= 0 || s.name.indexOf(t.name) >= 0);
        oppPick = { name: s.name, chgPct: s.chgPct, netInflow: s.netInflow, leader: s.leader, cross: true,
          why: `板块领涨股${s.leader || ''}即涨停主线「${t.name}」${viaLeader ? '代表股' : '成员'}（持续性${t.score}分 · ${t.count}只涨停 · 最高${t.maxLbc}板），涨幅榜与涨停池交叉验证，属有梯队支撑的强势方向` };
        break;
      }
    }
    if (!oppPick && secUp.length) {
      const s0 = secUp[0];
      oppPick = { name: s0.name, chgPct: s0.chgPct, netInflow: s0.netInflow, leader: s0.leader, cross: false,
        why: '板块涨幅居首但未被涨停池主线验证，属跟随性机会，需次日量能确认，不宜重仓追涨' };
    }
    const riskPicks = secDn.slice(0, 2).map(s => ({
      name: s.name, chgPct: s.chgPct, netInflow: s.netInflow, leader: s.leader,
      why: `板块${isNum(s.chgPct) ? '跌幅' + UI.sign(s.chgPct, 2, '%') : '明显走弱'}${isNum(s.netInflow) && s.netInflow < 0 ? `，主力净流出${Math.abs(s.netInflow)}亿` : ''}${s.leader ? `，领跌股${s.leader}` : ''}，短期回避接力、持仓逢反抽减仓`
    }));

    /* ⑤ 明日三种情景推演：只给「条件—应对」，不预测点位 */
    const mainTheme = themes[0] ? themes[0].name : '当日最强题材';
    const hgTxt = isNum(hg) ? `${hg}板` : '高度板';
    const scenarios = [
      { name: '走强延续', cls: 'up',
        cond: `竞价高开，${mainTheme}前排封单强势、昨日${hgTxt}龙头溢价高开，开盘30分钟量能明显放大`,
        action: `顺势：聚焦${mainTheme}前排换手承接或低位首板补涨，低吸不追高；情绪配合时仓位可至6-7成，仍守单票止损纪律` },
      { name: '高位分化', cls: 'flat',
        cond: `平开附近震荡，${mainTheme}前排分歧换手、后排开始掉队，昨日涨停股溢价分化，量能与今日大体持平`,
        action: `去弱留强：只留主线前排，后排冲高兑现；不开新仓追非主线杂毛；仓位5成左右，等分歧后的回流确认` },
      { name: '情绪退潮', cls: 'down',
        cond: `低开，昨日${hgTxt}龙头竞价无溢价甚至被核，${mainTheme}集体低开，炸板股次日无修复`,
        action: `防守：仓位降至3成以下，不接飞刀、不抄高位；等炸板率回落、涨停家数企稳的冰点信号出现后再试错` }
    ];

    return { date, indexVol: { resonance, volText, vp }, stage, stageDesc: stageDesc[stage] || '数据不足，暂无法定位情绪周期',
      basis, themes, oppRisk: { secOk, opp: oppPick, risks: riskPicks }, scenarios, prevDate: prev ? prev.date : null };
  },

  /* 数据齐套后生成并渲染结构化复盘（load 与 loadTabs 谁后完成谁触发） */
  refreshReview() {
    const s = this._snap || {};
    if (!s.e || !s.e._live) return;
    if (!s.lad || !s.sec) return;
    const rv = this.buildReview(s.q || {}, s.e, s.lad, s.lhb, s.sec);
    s.review = rv;
    this.paintReview(rv);
  },

  paintReview(rv) {
    const el = UI.$('#reviewLive'); if (!el) return;
    const meta = UI.$('#rvMeta');
    if (meta) meta.textContent = `${rv.date}${rv.prevDate ? ` · 对比基准 ${rv.prevDate}` : ''} · 全部由当日真实数据推导`;
    if (!rv.stage) {
      el.innerHTML = '<div class="flash-empty">情绪数据不完整，暂无法生成结构化复盘。点右上角「刷新」重试。</div>';
      return;
    }
    const stageCls = { '高潮': 'up', '发酵': 'up', '修复': 'amber', '冰点': 'down', '退潮': 'down' };
    const sc = stageCls[rv.stage] || 'flat';
    el.innerHTML = `
      <div class="rv-sec">
        <div class="rv-h"><span class="rv-no">①</span>当日大盘指数与成交量特征 <span class="rv-tip">依据：腾讯指数实时行情 + 东财两市成交统计 + 本地归档量能对比</span></div>
        <div class="rv-line">📊 ${UI.esc(rv.indexVol.resonance)}</div>
        <div class="rv-line">📦 ${UI.esc(rv.indexVol.volText)}</div>
        <div class="rv-line">⚖️ ${UI.esc(rv.indexVol.vp)}</div>
      </div>
      <div class="rv-sec">
        <div class="rv-h"><span class="rv-no">②</span>情绪周期定位 <span class="rv-tip">依据：东财涨停池 / 封板率 / 涨跌家数实时统计 + 前一日归档对比</span></div>
        <div class="rv-stage">
          <span class="rv-stage-badge ${sc}">${rv.stage}</span>
          <span class="rv-stage-basis">${rv.basis.map(b => `<span class="qchip"><i>${UI.esc(b)}</i></span>`).join('')}</span>
        </div>
        <div class="rv-line">💡 ${UI.esc(rv.stageDesc)}</div>
      </div>
      <div class="rv-sec">
        <div class="rv-h"><span class="rv-no">③</span>主线题材及持续性评分 <span class="rv-tip">依据：东财涨停池行业聚合 × 行业涨幅榜交叉验证</span></div>
        ${rv.themes.length ? `<div class="table-wrap readonly"><table>
          <thead><tr><th>题材</th><th class="num" style="width:90px">持续性</th><th style="width:90px">评级</th><th>评分依据 / 代表股</th></tr></thead>
          <tbody>${rv.themes.map(t => `<tr>
            <td><b>${UI.esc(t.name)}</b><div class="sub">${t.count}只涨停 · 最高${t.maxLbc}板</div></td>
            <td class="num"><b class="${t.cls === 'up' ? 'up' : t.cls === 'down' ? 'down' : ''}">${t.score}</b><div class="rv-bar"><i class="${t.cls}" style="width:${t.score}%"></i></div></td>
            <td><span class="tag ${t.cls === 'up' ? 'tag-red' : t.cls === 'down' ? 'tag-green' : 'tag-amber'}">${t.grade}</span></td>
            <td class="sub">${t.why.map(w => UI.esc(w)).join('；')}<br>代表：${t.names.map(n => UI.esc(n)).join('、')}</td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="flash-empty">当日涨停池未聚合出明确主线题材（题材分散或数据未到位）</div>'}
      </div>
      <div class="rv-sec">
        <div class="rv-h"><span class="rv-no">④</span>最需注意的机会 & 最需规避的风险 <span class="rv-tip">依据：行业涨/跌幅榜真实数据 · 与「机会方向 / 风险避雷」页签同源，不臆测</span></div>
        ${(() => {
          const or = rv.oppRisk || {};
          if (!or.secOk) return '<div class="flash-empty">板块涨跌数据未到位，机会 / 风险方向暂不生成（数据缺失时不臆测结论，请点「刷新」重试）。</div>';
          const o = or.opp;
          const oppLine = o ? `<div class="rv-line">🎯 <b class="up">${UI.esc(o.name)}</b>（板块${o.chgPct != null ? UI.sign(o.chgPct, 2, '%') : '—'}${Number.isFinite(o.netInflow) && o.netInflow > 0 ? `，主力净流入${o.netInflow}亿` : ''}${o.leader ? `，领涨股 ${UI.esc(o.leader)}` : ''}）${o.cross ? '<span class="tag tag-red">涨停主线交叉验证</span>' : '<span class="tag tag-amber">跟随性机会</span>'}<br><span class="sub">${UI.esc(o.why)}</span></div>` : '';
          const riskLines = (or.risks || []).map((r, i) => `<div class="rv-line">🛡️ 风险${i + 1}：<b class="down">${UI.esc(r.name)}</b> —— ${UI.esc(r.why)}</div>`).join('');
          return oppLine + riskLines;
        })()}
      </div>
      <div class="rv-sec">
        <div class="rv-h"><span class="rv-no">⑤</span>明日三种情景推演 <span class="rv-tip">只给条件—应对，不预测点位 · 条件基于当日真实情绪与主线数据</span></div>
        ${rv.scenarios.map(s => `<div class="rv-scn ${s.cls}">
          <div class="rv-scn-name">${s.name}</div>
          <div class="rv-scn-row"><b>条件</b>${UI.esc(s.cond)}</div>
          <div class="rv-scn-row"><b>应对</b>${UI.esc(s.action)}</div>
        </div>`).join('')}
      </div>`;
  },

  /* 结构化复盘 → 纯文本（归档卡片展示用） */
  reviewText(rv) {
    const L = [];
    L.push(`① 指数与量能：${rv.indexVol.resonance}；${rv.indexVol.volText}；${rv.indexVol.vp}`);
    L.push(`② 情绪周期：${rv.stage}（${rv.basis.join('，')}）。${rv.stageDesc}`);
    if (rv.themes.length) L.push(`③ 主线题材：${rv.themes.map(t => `${t.name}${t.score}分(${t.grade})`).join('，')}`);
    const or = rv.oppRisk || {};
    if (or.secOk) {
      if (or.opp) L.push(`④ 最需注意的机会：${or.opp.name}（板块${or.opp.chgPct != null ? (or.opp.chgPct >= 0 ? '+' : '') + or.opp.chgPct + '%' : '—'}${or.opp.cross ? '，涨停主线交叉验证' : '，跟随性机会'}）—— ${or.opp.why}`);
      (or.risks || []).forEach((r, i) => L.push(`④ 需规避的风险${i + 1}：${r.name} —— ${r.why}`));
    } else L.push(`④ 机会与风险：板块涨跌数据未到位，未生成（不臆测）`);
    L.push(`⑤ 明日推演：`);
    rv.scenarios.forEach(s => L.push(`【${s.name}】条件：${s.cond} → 应对：${s.action}`));
    return L.join('\n');
  },

  /* ---- 归档快照裁剪（控制 localStorage 体积） ---- */
  trimLad(lad) {
    if (!lad || !lad.ok || !lad.items || !lad.items.length) return null;
    return {
      date: lad.date, intraday: !!lad.intraday, source: lad.source || '',
      total: lad.items.length,
      items: lad.items.slice(0, 80).map(i => ({ name: i.name, lbc: i.lbc, chgPct: i.chgPct }))
    };
  },
  trimLhb(lhb) {
    if (!lhb || !lhb.ok || !lhb.items || !lhb.items.length) return null;
    return {
      date: lhb.date, source: lhb.source || '',
      total: lhb.items.length,
      totalNet: +(lhb.items.reduce((s, i) => s + (i.net || 0), 0)).toFixed(1),
      items: lhb.items.slice(0, 15).map(i => ({ name: i.name, chgPct: i.chgPct, net: i.net, reason: i.reason })),
      instItems: (lhb.instItems || []).slice(0, 8).map(i => ({ name: i.name, net: i.net, inst: i.inst }))
    };
  },
  trimSec(sec) {
    if (!sec || !sec.ok) return null;
    const cut = l => (l || []).slice(0, 10).map(s => ({ name: s.name, chgPct: s.chgPct, netInflow: s.netInflow, leader: s.leader }));
    return { source: sec.source || '', up: cut(sec.up), down: cut(sec.down) };
  },

  /* 大盘总览归档 → 长图文档结构 */
  imageDoc(r) {
    const sec = [];
    const kpi = r.kpi || {};
    const kp = (v, u) => (v != null ? v + u : '—');
    sec.push({
      title: '情绪快照',
      blocks: [{ t: 'chips', items: [
        { label: '涨停', value: kp(kpi.limitUp, '家'), dir: 'up' },
        { label: '跌停', value: kp(kpi.limitDown, '家'), dir: 'down' },
        { label: '炸板', value: kp(kpi.broken, '家'), dir: 'amber' },
        { label: '最高连板', value: kp(kpi.height, '板'), dir: 'up' },
        { label: '封板率', value: kp(kpi.sealRate, '%'), dir: 'amber' },
        { label: '上涨', value: kp(kpi.upCount, '家'), dir: 'up' },
        { label: '下跌', value: kp(kpi.downCount, '家'), dir: 'down' },
        { label: '两市成交', value: kpi.amount != null ? kpi.amount + '万亿' : '—', dir: '' }
      ] }]
    });
    if (r.indices) {
      const keys = Object.keys(r.indices);
      if (keys.length) sec.push({
        title: '指数收盘',
        blocks: [{ t: 'chips', items: keys.map(k => {
          const d = r.indices[k], p = d.chgPct || 0;
          return { label: d.label || k, value: (d.price != null ? d.price.toFixed(2) : '--') + ' ' + UI.sign(p, 2, '%'), dir: p > 0 ? 'up' : p < 0 ? 'down' : '' };
        }) }]
      });
    }
    if (r.note) sec.push({ title: '当日小结', blocks: [{ t: 'text', text: r.note }] });
    if (r.review) {
      const rv = r.review;
      const stageDir = { '高潮': 'up', '发酵': 'up', '修复': 'amber', '冰点': 'down', '退潮': 'down' }[rv.stage] || '';
      sec.push({
        title: '结构化复盘 ① 指数与量能特征',
        blocks: [{ t: 'rows', items: [rv.indexVol.resonance, rv.indexVol.volText, rv.indexVol.vp] }]
      });
      sec.push({
        title: `结构化复盘 ② 情绪周期：${rv.stage || '—'}`,
        blocks: [
          { t: 'chips', items: (rv.basis || []).map(b => ({ label: b, value: '', dir: '' })).concat([{ label: '阶段', value: rv.stage || '—', dir: stageDir }]) },
          { t: 'text', text: rv.stageDesc || '' }
        ]
      });
      if ((rv.themes || []).length) sec.push({
        title: '结构化复盘 ③ 主线题材（持续性评分）',
        blocks: [{ t: 'rows', items: rv.themes.map(t => ([
          { text: `${t.name} ${t.score}分 `, bold: true, dir: t.cls === 'up' ? 'up' : t.cls === 'down' ? 'down' : '' },
          { text: `（${t.grade}）${t.why.join('；')}；代表：${t.names.join('、')}` }
        ])) }]
      });
      if (rv.oppRisk && rv.oppRisk.secOk) {
        const or = rv.oppRisk;
        const items = [];
        if (or.opp) items.push([
          { text: `🎯 机会：${or.opp.name} `, bold: true, dir: 'up' },
          { text: `（板块${or.opp.chgPct != null ? (or.opp.chgPct >= 0 ? '+' : '') + or.opp.chgPct + '%' : '—'}${or.opp.cross ? '，涨停主线交叉验证' : '，跟随性机会'}）${or.opp.why}` }
        ]);
        (or.risks || []).forEach((r, i) => items.push([
          { text: `🛡️ 风险${i + 1}：${r.name} `, bold: true, dir: 'down' },
          { text: r.why }
        ]));
        if (items.length) sec.push({ title: '结构化复盘 ④ 机会与风险（与机会/风险页签同源）', blocks: [{ t: 'rows', items }] });
      }
      sec.push({
        title: '结构化复盘 ⑤ 明日情景推演（条件—应对，不预测点位）',
        blocks: [{ t: 'rows', items: (rv.scenarios || []).map(s => ([
          { text: `【${s.name}】`, bold: true, dir: s.cls === 'up' ? 'up' : s.cls === 'down' ? 'down' : '' },
          { text: `条件：${s.cond} → 应对：${s.action}` }
        ])) }]
      });
    }
    if (r.ladder && r.ladder.items && r.ladder.items.length) {
      const g = {};
      r.ladder.items.forEach(i => { (g[i.lbc] = g[i.lbc] || []).push(i.name); });
      const rows = Object.keys(g).map(Number).sort((a, b) => b - a).map(n => ([
        { text: n + '板 × ' + g[n].length + '　', bold: true, dir: n >= 3 ? 'up' : '' },
        { text: g[n].slice(0, 12).join('、') + (g[n].length > 12 ? ' …' : '') }
      ]));
      sec.push({ title: `连板梯队（${r.ladder.date || ''} · 共${r.ladder.total || r.ladder.items.length}只涨停）`, blocks: [{ t: 'rows', items: rows }] });
    }
    if (r.billboard && r.billboard.items && r.billboard.items.length) {
      const b = r.billboard;
      const rows = b.items.map(i => ([
        { text: i.name + ' ', bold: true },
        { text: (i.net >= 0 ? '+' : '') + i.net + '亿', dir: i.net >= 0 ? 'up' : 'down' },
        { text: '　' + (i.reason || '') }
      ]));
      (b.instItems || []).slice(0, 5).forEach(i => rows.push([
        { text: i.name + '（机构） ', bold: true },
        { text: (i.net >= 0 ? '+' : '') + i.net + '亿', dir: i.net >= 0 ? 'up' : 'down' },
        { text: '　' + (i.inst || '') }
      ]));
      sec.push({ title: `龙虎榜（${b.date || ''} · 全榜净${b.totalNet >= 0 ? '买入' : '卖出'}${Math.abs(b.totalNet)}亿）`, blocks: [{ t: 'rows', items: rows }] });
    }
    if (r.sectors && (r.sectors.up.length || r.sectors.down.length)) {
      const mk = (x, up) => ([
        { text: x.name + ' ', bold: true, dir: up ? 'up' : 'down' },
        { text: (x.chgPct != null ? (x.chgPct >= 0 ? '+' : '') + x.chgPct + '%' : ''), dir: up ? 'up' : 'down' },
        { text: (x.netInflow != null ? '　主力' + (x.netInflow >= 0 ? '+' : '') + x.netInflow + '亿' : '') + (x.leader ? '　领涨 ' + x.leader : '') }
      ]);
      sec.push({
        title: '板块涨跌（归档快照）',
        blocks: [{ t: 'rows', items: r.sectors.up.map(x => mk(x, true)).concat(r.sectors.down.map(x => mk(x, false))) }]
      });
    }
    return {
      title: '大盘总览记录',
      sub: `${r.date} 收盘 · 保存于 ${r.savedAt || ''}`,
      filename: `大盘总览_${r.date}.png`,
      sections: sec
    };
  },

  /* ---- 历史记录 ---- */
  paintArchive() {
    const el = UI.$('#smArchList'); if (!el) return;
    const cnt = UI.$('#smArchCnt');
    const list = Store.rows('sentiment_archive', []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (cnt) cnt.textContent = list.length + ' 条';
    if (!list.length) {
      el.innerHTML = '<div class="empty-prompt"><span class="ei">📭</span>暂无历史记录。数据加载完成后点上方「💾 保存当日记录」。</div>';
      return;
    }
    el.innerHTML = list.map(r => {
      // 连板梯队 / 龙虎榜 / 板块榜 详情文本（归档快照）
      let ladHtml = '';
      if (r.ladder && r.ladder.items && r.ladder.items.length) {
        const g = {};
        r.ladder.items.forEach(i => { (g[i.lbc] = g[i.lbc] || []).push(i.name); });
        const txt = Object.keys(g).map(Number).sort((a, b) => b - a)
          .map(n => `${n}板×${g[n].length}：${g[n].slice(0, 10).join('、')}${g[n].length > 10 ? ' …' : ''}`).join('\n');
        ladHtml = `<div class="sub-title">连板梯队（${r.ladder.date || ''} · 共${r.ladder.total || r.ladder.items.length}只涨停）</div><div class="arch-note">${UI.esc(txt).replace(/\n/g, '<br>')}</div>`;
      }
      let lhbHtml = '';
      if (r.billboard && r.billboard.items && r.billboard.items.length) {
        const b = r.billboard;
        const fmt = v => (v >= 0 ? '+' : '') + v + '亿';
        const top = b.items.slice(0, 5).map(i => `${i.name}(${fmt(i.net)})`).join('、');
        const inst = (b.instItems || []).slice(0, 3).map(i => `${i.name}(${fmt(i.net)})`).join('、');
        lhbHtml = `<div class="sub-title">龙虎榜（${b.date || ''} · 全榜净${b.totalNet >= 0 ? '买入' : '卖出'}${Math.abs(b.totalNet)}亿）</div><div class="arch-note">净买居前：${UI.esc(top)}${b.items.length > 5 ? ' 等' : ''}${inst ? '<br>机构席位：' + UI.esc(inst) : ''}</div>`;
      }
      let secHtml = '';
      if (r.sectors && (r.sectors.up.length || r.sectors.down.length)) {
        const fmtS = x => `${x.name}${x.chgPct != null ? (x.chgPct >= 0 ? '+' : '') + x.chgPct + '%' : ''}`;
        const up = r.sectors.up.slice(0, 3).map(fmtS).join('、');
        const dn = r.sectors.down.slice(0, 3).map(fmtS).join('、');
        secHtml = `<div class="sub-title">板块涨跌（归档快照）</div><div class="arch-note">领涨：${UI.esc(up) || '—'}<br>领跌：${UI.esc(dn) || '—'}</div>`;
      }
      return `<details class="arch-card">
      <summary class="arch-card-hd">
        <div class="arch-date">📅 ${UI.esc(r.date)}<span class="arch-gen">保存于 ${UI.esc(r.savedAt || '')}</span></div>
        <div class="arch-meta"><span class="arch-bal">涨停${r.kpi && r.kpi.limitUp != null ? r.kpi.limitUp : '—'} · 封板率${r.kpi && r.kpi.sealRate != null ? r.kpi.sealRate + '%' : '—'}</span><span class="arch-arrow">▾</span></div>
      </summary>
      <div class="arch-detail">
        <div class="sub-title">情绪快照</div>
        <div class="arch-qs">${['limitUp:涨停', 'limitDown:跌停', 'broken:炸板', 'height:最高连板', 'sealRate:封板率%', 'upCount:上涨', 'downCount:下跌', 'amount:成交(万亿)'].map(p => {
          const [k, lb] = p.split(':');
          const v = r.kpi ? r.kpi[k] : null;
          return `<span class="qchip"><b>${lb}</b> <i>${v != null ? v : '—'}</i></span>`;
        }).join('')}</div>
        ${r.indices ? `<div class="sub-title">指数收盘</div><div class="arch-qs">${Object.keys(r.indices).map(k => {
          const d = r.indices[k];
          return `<span class="qchip ${UI.dirCls(d.chgPct)}"><b>${UI.esc(d.label)}</b> ${d.price != null ? d.price.toFixed(2) : '--'} <i>${UI.sign(d.chgPct, 2, '%')}</i></span>`;
        }).join('')}</div>` : ''}
        ${ladHtml}
        ${lhbHtml}
        ${secHtml}
        ${r.review ? `<div class="sub-title">结构化复盘（${UI.esc(r.review.stage || '')}）</div><div class="arch-note">${UI.esc(V.sentiment.reviewText(r.review)).replace(/\n/g, '<br>')}</div>` : ''}
        ${r.note ? `<div class="sub-title">当日小结</div><div class="arch-note">${UI.esc(r.note).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="arch-actions">
          <button class="btn btn-sm btn-ghost" data-act="img-sentiment" data-id="${UI.esc(r.id)}">🖼 存为长图</button>
          <button class="btn btn-sm btn-ghost arch-del" data-act="del-sentiment" data-id="${UI.esc(r.id)}">🗑 删除此条记录</button>
        </div>
      </div>
    </details>`;
    }).join('');
  },
  saveArchive() {
    const s = this._snap;
    if (!s || !s.e || !s.e._live) { UI.toast('实时数据尚未到位，稍候再保存'); return; }
    const e = s.e;
    const date = e._date || Market.tradingDay();
    const list = Store.rows('sentiment_archive', []);
    const rec = {
      id: Store.uid(),
      date,
      savedAt: DT.clock(),
      kpi: {
        limitUp: e.limitUp, limitDown: e.limitDown, broken: e.broken,
        height: e.height, sealRate: e.sealRate, upCount: e.upCount,
        downCount: e.downCount, amount: e.amount
      },
      indices: s.indices || null,
      // 市场情绪详情（连板梯队 / 龙虎榜 / 板块榜）一并归档，裁剪后存储
      ladder: this.trimLad(s.lad),
      billboard: this.trimLhb(s.lhb),
      sectors: this.trimSec(s.sec),
      review: s.review || null, // 结构化复盘（指数量能/情绪周期/主线题材/情景推演）
      note: (UI.$('#ovDayNote') || {}).value || s.note || ''
    };
    const idx = list.findIndex(r => r.date === date);
    if (idx >= 0) { rec.id = list[idx].id; list[idx] = rec; } else list.push(rec);
    Store.set('sentiment_archive', list);
    this.paintArchive();
    UI.toast(idx >= 0 ? '已更新 ' + date + ' 的记录' : '已保存 ' + date + ' 的记录');
  },
  async mount(reg) {
    const self = this;
    self.paintArchive(); // 历史记录与行情无关，先行渲染
    const load = async () => {
      // 指数行情（含科创综指）
      const idxKeys = ['sh', 'sz', 'cyb', 'kcz', 'hs300', 'bz50'];
      const q = await Market.quotes(idxKeys, paint => self.paintIdx(paint));
      self.paintIdx(q);

      // 组装情绪数据（全部以实时接口为准，绝不预填假数字）
      const e = self.loadEmo();
      // 成交额：腾讯上证+深证（万元→万亿），真实数据
      const amtWan = (q.sh && q.sh.amount ? q.sh.amount : 0) + (q.sz && q.sz.amount ? q.sz.amount : 0);
      if (amtWan > 0) { e.amount = +(amtWan / 1e8).toFixed(2); e._live = true; } // 万元→万亿
      // 全市场涨跌家数 / 涨停跌停 / 炸板 / 最高连板 / 封板率（东方财富真实盘口池）
      // 手动编辑保护：5 分钟内不覆盖用户手动修正（用于纠错当日异常值）
      const manualProtect = Number.isFinite(e._manualAt) && (Date.now() - e._manualAt < 5 * 60 * 1000);
      if (!manualProtect) {
        try {
          const br = await Market.breadth();
          if (br && br.ok) {
            // 注意：0 是合法值（如跌停 0 家），必须用 != null 判断
            if (br.upCount != null) e.upCount = br.upCount;
            if (br.downCount != null) e.downCount = br.downCount;
            if (br.limitUp != null) e.limitUp = br.limitUp;
            if (br.limitDown != null) e.limitDown = br.limitDown;
            if (br.broken != null) e.broken = br.broken;
            if (br.height != null) e.height = br.height;
            if (br.sealRate != null) e.sealRate = br.sealRate;
            e._live = true;
            e._date = br.date || null;
            e._src = br.source || '';
            e._intraday = !!br.intraday;
          }
        } catch (err) { /* 保留已有缓存值，前端显示「实时获取中」 */ }
      }
      // 封板率兜底：服务端未返回时按 涨停/(涨停+炸板) 计算
      if (e.sealRate == null && Number.isFinite(e.limitUp) && Number.isFinite(e.broken) && (e.limitUp + e.broken) > 0) {
        e.sealRate = Math.round(e.limitUp / (e.limitUp + e.broken) * 100);
      }
      e._ver = SEED.sentimentKpi._ver;
      Store.set('sentiment_kpi', e);

      self.paintEmo(e);
      self.paintText(q, e);

      // 指数快照（供归档）
      const indices = {};
      ['sh', 'sz', 'cyb', 'kcz', 'hs300', 'bz50'].forEach(k => {
        const d = q[k];
        if (d && d.price != null) indices[k] = { label: d.label || k, price: d.price, chgPct: d.chgPct };
      });
      self._snap = self._snap || {};
      self._snap.e = e;
      self._snap.q = q;
      self._snap.indices = indices;
      self.refreshReview(); // 若梯队/板块已到位则生成结构化复盘

      // 当日小结：自动生成（若用户当日已手动修改则不覆盖）
      const noteKey = 'sentiment_daynote';
      const noteDate = Store.get(noteKey + '_date', '');
      const savedNote = Store.get(noteKey, '');
      const ta = UI.$('#ovDayNote');
      const autoNote = self.buildDayNote(q, e, self._snap.lad, self._snap.lhb, self._snap.sec);
      self._snap.note = autoNote;
      if (ta) {
        if (noteDate === (e._date || '') && savedNote) ta.value = savedNote; // 当日已保存过手动版
        else ta.value = autoNote;
        UI.autosize(ta);
      }
    };

    // 梯队 / 龙虎榜 / 板块榜（真实数据，独立并行加载）
    const loadTabs = async () => {
      const [lad, lhb, sec] = await Promise.all([
        Market.ladder().catch(() => ({ ok: false })),
        Market.billboard().catch(() => ({ ok: false })),
        Market.sectorRank().catch(() => ({ ok: false }))
      ]);
      self._snap = self._snap || {};
      self._snap.lad = lad; self._snap.lhb = lhb; self._snap.sec = sec;
      self.paintLadder(lad);
      self.paintBillboard(lhb);
      self.paintSectors(sec);
      self.refreshReview(); // 行情已到位时生成结构化复盘
    };

    await load();
    loadTabs(); // 不阻塞首屏，数据到位后自动填充
    self.paintArchive();
    reg.onReload = () => { load(); loadTabs(); };
    // 实时刷新：每 30 秒重新拉取最新指数与涨跌家数，保证数据及时更新
    if (V.sentiment._live) clearInterval(V.sentiment._live);
    V.sentiment._live = setInterval(() => { load().catch(() => { }); }, 30000);
  },
  unmount() {
    if (V.sentiment._live) { clearInterval(V.sentiment._live); V.sentiment._live = null; }
  }
};
