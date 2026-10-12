/* ============================================================
   news.js · 真实财经快讯聚合（五通道并行）
   通道：东方财富 7×24 快讯 + 新浪财经 7×24 + 央视《正点财经》(CCTV-2 官方)
        + 官方媒体要闻（财联社/中国证券报/证券时报/新华社等白名单，东财全网聚合）
        + 同花顺快讯（tapp push 接口，浏览器直连）
   降级链：同源 /api/news 服务端代理 → 五通道直连 → 本地缓存
   隔夜重磅 / 盘中催化 / 分类筛选/ 当日要闻自动小结
   数据全部来自真实接口，拉不到的通道如实降级，不虚构任何标题与链接
   ============================================================ */
const News = (() => {

  const CATS = [
    { k: 'all', label: '全部' },
    { k: 'a', label: 'A股' },
    { k: 'us', label: '美股' },
    { k: 'fed', label: '美联储' },
    { k: 'oil', label: '国际原油' },
    { k: 'global', label: '国际市场' }
  ];

  let cache = null;          // 最近一次 API 数据
  let lastAt = 0;

  /* ---------------- 关键词分类（计分制） ----------------
     踩坑记录：旧版按 CAT_KW 顺序「首个命中即返回」，且同花顺通道把接口自带的
     tag 字段（频道级垃圾桶标签，如台风新闻被标 "美股,港股"）拼进分类文本，
     导致台风/野火等社会新闻误入「美股」分类。现改为：
     ①分类文本只含标题+摘要（任何接口的 tag/channel 字段不得参与分类）
     ②按各类命中关键词次数计分，分高者胜，避免顺序偏置
     ③平分优先级：a（国内）> fed > us > oil > global（离A股决策越近越优先）
     ④无任何金融关键词命中 → other（诚实地归入其他，不硬套金融分类） */
  const CAT_KW = {
    us: ['美股','纳斯达克','道琼斯','标普','纳指','道指','纽交所','英伟达','特斯拉','苹果','谷歌','微软','亚马逊','Meta','AMD','博通','台积电','美光','SpaceX','OpenAI','美股盘','标普500','存储板块','光通信','中概'],
    fed: ['美联储','鲍威尔','非农','就业','CPI','PPI','利率','降息','加息','国债','美债','逆回购','美元指数','联储','联邦基金','FOMC','耶伦','财政部','特朗普','白宫','参议院','众议院','利率期货'],
    oil: ['原油','WTI','布伦特','石油','OPEC','油价','汽油','柴油','炼油','油井','石油钻井','天然气','霍尔木兹','管道','油轮','航运'],
    global: ['国际','全球','欧洲','日本','韩国','英国','德国','法国','巴西','印度','乌克兰','俄罗斯','伊朗','朝鲜','北约','欧盟','东盟','中东','拉美','非洲','亚洲','联合国','WTO','瑞士','瑞典','澳大利亚','加拿大','墨西哥','土耳其','沙特','阿联酋'],
    a: ['A股','沪深','创业板','上证','深证','北证','科创','涨停','跌停','两市','成交','北向','南向','港股','恒生','基金','ETF','可转债','IPO','退市','深交所','上交所','证监会','国务院','央行','银保监','统计局','PMI','社融','LPR','MLF','逆回购','沪深港通','融资融券']
  };
  /* 灾害/社会事件关键词：命中且无金融分类命中时，影响评估走「关联度低」诚实口径 */
  const DISASTER_KW = ['台风','地震','洪水','暴雨','海啸','火山','野火','山火','泥石流','滑坡','干旱','红色预警','橙色预警','紧急状态','疏散','撤离家园','坠毁','空难','沉船'];
  const CAT_PRIORITY = ['a', 'fed', 'us', 'oil', 'global'];
  const HOT_KW = ['重磅','突发','紧急','利好','利空','暴跌','暴涨','重大','重要','央行','国务院','证监会','美联储','非农','加息','降息','熔断','黑天鹅','崩盘','历史新高','历史新低','紧急召开','突然','意外'];
  const POS_KW = ['利好','上涨','涨','升','增长','超预期','回升','复苏','突破','新高','提升','增加','扩大','强劲','暖','积极','乐观','回暖','大涨','飙升','强劲增长','超预期增长'];
  const NEG_KW = ['利空','下跌','跌','降','下滑','低于预期','回落','衰退','暴跌','重挫','减少','缩小','疲软','冷','消极','悲观','下行','承压','大跌','重挫','暴跌','崩盘','亏损','违约','制裁','调查','处罚','警告','风险','危机'];

  /* 国内宏观/监管语境：命中且无明确美股市场词时，即便提到 Meta/苹果/微软 等
     美股关键词也归 A股（踩坑：「我国4万亿投资启幕」因提及 Meta 曾误入美股；
     「7月CPI同比上涨」属国家统计局发布，应归 A股） */
  const CN_MACRO = /我国|全国|国家统计局|发展改革委|发改委|工信部|商务部|财政部|央行|国务院|证监会|银保监会|人民银行|海关总署|税务总局|市场监管总局/;
  const HARD_US = /美股|纳斯达克|道琼斯|标普|纳指|道指|纽交所|美联储/;
  function categorize(text) {
    if (CN_MACRO.test(text) && !HARD_US.test(text)) return 'a';
    let best = 'other', bestScore = 0;
    for (const cat of CAT_PRIORITY) {
      const n = countKw(text, CAT_KW[cat]);
      if (n > bestScore) { best = cat; bestScore = n; }
    }
    return best;
  }
  function isDisaster(text) { return DISASTER_KW.some(kw => text.indexOf(kw) !== -1); }
  function isHot(text) { return HOT_KW.some(kw => text.indexOf(kw) !== -1); }
  function countKw(text, kws) { return kws.reduce((s, kw) => s + (text.indexOf(kw) !== -1 ? 1 : 0), 0); }

  /* 来源权重：官方源为主（东财/央视/白名单媒体），新浪为辅
     用于 ①打分排序 ②同一新闻多源转载时决定去留（保留权重最高的来源）
     打分原则：score 只衡量「消息强度」（多空词频绝对值 pos+neg），不按方向加分——
     利空新闻与利多新闻同等重要，方向由 pos/neg 字段单独用于偏多/偏空标签展示，
     避免利空消息被系统性降权、在条数截断时被优先丢弃（全面性要求）。 */
  const SRC_W = s => s === '央视财经' ? 4 : s === '东财快讯' ? 3 : s === '新浪7×24' ? 1 : (s ? 2 : 0);
  function normTitle(t) {
    return String(t || '').replace(/^【[^】]*】/, '').replace(/[【】]/g, '').replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 18);
  }

  /* ---------------- A股交易时段定义 ---------------- */
  // A股 09:30 开盘, 15:00 收盘
  // 隔夜: 上一交易日 15:00 收盘后 → 当日 09:30 开盘前
  // 盘中: 当日 09:30 → 15:00
  function determineSeg(time, dateStr) {
    if (!time) return 'overnight';
    const parts = time.split(':');
    const h = +parts[0], m = +parts[1] || 0;
    const t = h * 60 + m;
    // 盘中: 09:30 - 15:00
    if (t >= 570 && t <= 900) return 'intraday';
    return 'overnight';
  }

  /* 返回当前处于 A 股的哪个时段 */
  function aShareSession() {
    const d = new Date();
    const t = d.getHours() * 60 + d.getMinutes();
    const day = d.getDay();
    if (day === 0 || day === 6) return { session: 'closed', text: '周末休市' };
    if (t >= 570 && t <= 690) return { session: 'morning', text: '上午盘中' };
    if (t >= 780 && t <= 900) return { session: 'afternoon', text: '下午盘中' };
    if (t > 690 && t < 780) return { session: 'lunch', text: '午间休市' };
    if (t < 570) return { session: 'pre', text: '盘前' };
    return { session: 'post', text: '盘后' };
  }

  function nightStartStr() {
    const d = new Date(); const t = d.getHours() * 60 + d.getMinutes();
    const cur = new Date(d);
    if (t < 570) cur.setDate(cur.getDate() - 1);
    while (cur.getDay() === 0 || cur.getDay() === 6) cur.setDate(cur.getDate() - 1);
    return DT.pad(cur.getFullYear()) + '-' + DT.pad(cur.getMonth()+1) + '-' + DT.pad(cur.getDate()) + ' 15:00';
  }

  /* ---------------- 对A股影响评估 ----------------
     内容感知版（v41 重写）：旧版按分类套固定模板，导致台风新闻下写
     「美股走强提振A股开盘情绪」这种与内容毫不相关的评语。
     现分三层：①灾害/社会事件 → 诚实口径 + 相关行业提示
              ②无金融关键词（other）→ 如实标注关联度低
              ③金融类 → 按分类 + 多空词频给方向评估 */
  function impactA(item) {
    const text = (item.title || '') + ' ' + (item.summary || '');
    const cat = item.cat || 'other';
    const pos = item.pos || 0;
    const neg = item.neg || 0;

    /* ① 灾害/社会事件：与金融市场无直接分类关联时，诚实口径 + 可推断的行业提示 */
    if (isDisaster(text) && (cat === 'other' || cat === 'global')) {
      let impact = '灾害/社会事件，与A股整体关联度低';
      if (/台风|暴雨|洪水|海啸/.test(text)) impact += '；农业种植、保险、航运港口或受扰动，灾后重建关注建材/工程机械';
      else if (/地震|泥石流|滑坡/.test(text)) impact += '；关注当地上市公司停产公告、保险赔付与灾后重建链条';
      else if (/野火|山火/.test(text)) impact += '；对A股无直接传导，仅当涉及中资资产或大宗商品产区时需跟踪';
      else impact += '，作为背景参考';
      return item.hot ? '【重要】' + impact : impact;
    }

    /* ② 无金融关键词：不硬套金融评语 */
    if (cat === 'other') return '与A股关联度较低，作为背景参考';

    /* ③ 金融类：按分类给出基础影响方向 */
    const catImpact = {
      us: pos > neg ? '美股走强提振A股开盘情绪，科技成长方向有映射暖意'
          : neg > pos ? '美股走弱压制A股风险偏好，注意科技链低开风险'
          : '美股波动有限，对A股影响中性',
      fed: pos > neg ? '美联储政策偏鸽，全球流动性预期改善，利好A股估值修复'
          : neg > pos ? '美联储政策偏鹰，流动性收紧预期升温，压制成长股估值'
          : '美联储政策信号中性，关注后续数据指引',
      oil: pos > neg ? '原油价格上涨，石化/油服受益，航空成本承压'
          : neg > pos ? '原油价格下跌，航空/化工成本端利好，石化链承压'
          : '原油价格平稳，对A股影响有限',
      global: pos > neg ? '国际市场情绪偏暖，外围环境对A股形成支撑'
          : neg > pos ? '国际市场波动加剧，注意外围风险传导至A股'
          : '国际市场中性，对A股影响有限',
      a: pos > neg ? '国内政策面偏暖，市场情绪积极，关注量能承接'
          : neg > pos ? '国内消息面偏谨慎，注意市场调整压力'
          : '国内消息面中性，关注结构性机会'
    };
    let impact = catImpact[cat] || '与A股关联度较低，作为背景参考';

    // 重磅新闻增强描述
    if (item.hot) {
      if (pos > neg) impact = '【重磅】' + impact + '，重要性较高需重点关注';
      else if (neg > pos) impact = '【重磅】' + impact + '，风险级别较高需警惕';
      else impact = '【重磅】' + impact + '，事件重大需密切跟踪';
    }
    return impact;
  }

  /* ---------------- 对A股影响评估标签 ---------------- */
  function impactTag(item) {
    const pos = item.pos || 0;
    const neg = item.neg || 0;
    if (pos > neg + 1) return '<span class="imp-tag imp-pos">偏多</span>';
    if (neg > pos + 1) return '<span class="imp-tag imp-neg">偏空</span>';
    return '<span class="imp-tag imp-neu">中性</span>';
  }

  /* ---------------- 重要级别 ---------------- */
  function impLevel(item) {
    const score = item.score || 0;
    if (item.hot) return 'high';
    if (score >= 30) return 'mid';
    return 'low';
  }

  /* ---------------- 东方财富快讯采集 ---------------- */
  /* 接口单页上限 100 条，需分页拉取：第 1~3 页 × 100 条 = 300 条
     注意：newsapi.eastmoney.com 不带 CORS 头，浏览器 fetch 直连必败；
     但其返回格式为 "var ajson={...}"，天然支持 <script> 标签加载（JSONP 原理），
     无任何跨域限制，作为主通道；fetch+代理仅作兜底。 */

  /* JSONP 方式加载一页：注入 script 标签，读取 window.ajson */
  function fetchViaScript(apiUrl) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      let settled = false;
      const finish = val => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        try { delete window.ajson; } catch (e) { window.ajson = undefined; }
        resolve(val);
      };
      const timer = setTimeout(() => finish(null), 8000);
      s.onload = () => {
        const d = window.ajson;
        finish(d && Array.isArray(d.LivesList) && d.LivesList.length ? d.LivesList : null);
      };
      s.onerror = () => finish(null);
      s.src = apiUrl + '?_=' + Date.now();
      document.head.appendChild(s);
    });
  }

  async function fetchOnePage(page) {
    const apiUrl = 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_101_ajson_100_' + page + '_.html';
    // 1) script 标签加载（无跨域限制，最稳最快）
    const viaJs = await fetchViaScript(apiUrl);
    if (viaJs) return viaJs;
    // 2) 兜底：fetch 直连 → allorigins 代理（海外网络环境下可能可用）
    const urls = [apiUrl, 'https://api.allorigins.win/raw?url=' + encodeURIComponent(apiUrl)];
    let text = null;
    for (const u of urls) {
      try {
        const res = await Promise.race([
          fetch(u, { cache: 'no-store' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
        if (!res.ok) continue;
        text = await res.text();
        if (text && text.indexOf('ajson') !== -1) break;
        text = null;
      } catch (e) { /* 继续下一个 */ }
    }
    if (!text) return null;
    try {
      const json = text.replace(/^var\s+ajson\s*=\s*/, '').replace(/;\s*$/, '');
      const data = JSON.parse(json);
      return (data && data.LivesList) || null;
    } catch (e) { return null; }
  }

  /* 新浪财经 7×24 JSONP 独立兜底源
     接口原生支持 callback= 参数，Content-Type 为 application/javascript，script 加载稳定
     注意：服务端校验 callback 名，必须以字母开头（下划线开头如 __sinaCb_ 会被拒绝，
     返回 text/html 错误文本导致脚本解析失败），因此回调名固定以字母开头 */
  function fetchSinaPage(page) {
    return new Promise(resolve => {
      const cb = 'sinaCb_' + page + '_' + Date.now();
      const s = document.createElement('script');
      let settled = false;
      const finish = val => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        resolve(val);
      };
      const timer = setTimeout(() => finish(null), 8000);
      window[cb] = data => {
        const list = data && data.result && data.result.data && data.result.data.feed && data.result.data.feed.list;
        finish(Array.isArray(list) && list.length ? list : null);
      };
      s.onload = () => setTimeout(() => finish(null), 300); // 加载完但未回调视为失败
      s.onerror = () => finish(null);
      s.src = 'https://zhibo.sina.com.cn/api/zhibo/feed?page=' + page
        + '&page_size=50&zhibo_id=152&tag_id=0&dire=f&dpc=1&callback=' + cb;
      document.head.appendChild(s);
    });
  }
  /* 新浪快讯字段映射到统一结构（rich_text 正文 / create_time 时间 / docurl 真实链接） */
  function mapSinaItem(it) {
    const text = (it.rich_text || '').trim();
    if (!text) return null;
    const ct = it.create_time || '';
    const parts = ct.split(' ');
    const date = parts[0] || '';
    const time = (parts[1] || '').slice(0, 5);
    const firstSentence = text.split(/[。！？!?\n]/).filter(Boolean)[0] || text;
    const title = firstSentence.slice(0, 45);
    const url = (it.docurl || '').replace(/^http:/, 'https:');
    if (!url) return null;
    const cat = categorize(text);
    const hot = isHot(text);
    const seg = determineSeg(time);
    const pos = countKw(text, POS_KW);
    const neg = countKw(text, NEG_KW);
    const score = (hot ? 100 : 0) + (pos + neg) * 10;
    return {
      title, url, time, date, cat, hot,
      summary: text.slice(0, 120),
      seg, ts: new Date(ct.replace(/-/g, '/')).getTime() || 0, score, pos, neg,
      src: '新浪7×24'
    };
  }

  /* 东财单通道：script 加载 → fetch 直连 → 代理，顺序拉取第 1~2 页
     （v45 降噪：3页→2页，减少低价值长尾快讯）
     注意：Chromium 系浏览器对 text/html 响应做 ORB 拦截，script 方式必败（仅 WebKit 可能成功）；
     fetch 直连无 CORS 头也必败，故此通道在 Chrome/Edge 下整体不可用，仅作补充 */
  async function fetchEmChannel() {
    const page1 = await fetchOnePage(1);
    if (!page1) return null;
    const allRaw = page1.slice();
    for (let p = 2; p <= 2; p++) {
      const pg = await fetchOnePage(p);
      if (pg && pg.length) allRaw.push.apply(allRaw, pg);
    }
    return allRaw.map(raw => {
      const showtime = raw.showtime || raw.ordertime || '';
      const parts = showtime.split(' ');
      const date = parts[0] || '';
      const time = (parts[1] || '').slice(0, 5);
      const title = (raw.title || '').replace(/^【.*?】/, '');
      const digest = raw.digest || raw.simdigest || '';
      const url = (raw.url_w || raw.url_unique || '').replace(/^http:/, 'https:');
      const fullText = title + ' ' + digest;
      const cat = categorize(fullText);
      const hot = isHot(fullText);
      const seg = determineSeg(time);
      const pos = countKw(fullText, POS_KW);
      const neg = countKw(fullText, NEG_KW);
      const score = (hot ? 100 : 0) + (pos + neg) * 10 + (parseInt(raw.commentnum) || 0) / 10 + 12; // 官方主源加权
      return {
        title, url, time, date, cat, hot,
        summary: digest.replace(/^【.*?】/, '').slice(0, 120),
        seg, ts: new Date(showtime.replace(/-/g,'/')).getTime() || 0, score, pos, neg,
        src: '东财快讯'
      };
    }).filter(i => i.title && i.url);
  }

  /* 新浪通道：2 页并行 × 50 条 = 最多 100 条（v45 降噪：4页→2页） */
  async function fetchSinaChannel() {
    const s1 = await fetchSinaPage(1);
    if (!s1) return null;
    const rest = await Promise.all([fetchSinaPage(2)]);
    let raw = s1.slice();
    rest.forEach(pg => { if (pg && pg.length) raw = raw.concat(pg); });
    return raw.map(mapSinaItem).filter(Boolean);
  }

  /* ---------------- 央视《正点财经》（CCTV-2 官方财经新闻，cntv 官方 JSONP 接口） ---------------- */
  function fetchCctvChannel() {
    return new Promise(resolve => {
      const cb = 'cctvCb' + Date.now();
      const s = document.createElement('script');
      let settled = false;
      const finish = val => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        resolve(val);
      };
      const timer = setTimeout(() => finish(null), 9000);
      window[cb] = data => {
        const list = data && data.data && data.data.list;
        finish(Array.isArray(list) && list.length ? list : null);
      };
      s.onload = () => setTimeout(() => finish(null), 400); // 加载完未回调视为失败
      s.onerror = () => finish(null);
      s.src = 'https://api.cntv.cn/NewVideo/getVideoListByColumn?id=TOPC1453100395512779&n=12&sort=desc&p=1&mode=0&serviceId=tvcctv&cb=' + cb + '&_=' + Date.now();
      document.head.appendChild(s);
    }).then(list => list && list.map(mapCctvItem).filter(Boolean));
  }

  /* 央视字段映射：brief 为「本期节目主要内容：…（《正点财经》 20260807 17:00）」，拆出要点 */
  function mapCctvItem(it) {
    const rawBrief = (it.brief || '').replace(/\s+/g, ' ').trim();
    const brief = rawBrief.replace(/^本期节目主要内容：?/, '').replace(/（《正点财经》[^）]*）\s*$/, '').trim();
    const topics = brief.split(/[；;]/).map(x => x.trim()).filter(Boolean);
    const title = topics[0] ? topics[0].slice(0, 45) : (it.title || '').trim();
    const url = (it.url || '').replace(/^http:/, 'https:');
    if (!title || !url) return null;
    const ct = (it.time || '').trim(); // 2026-08-07 17:00:00
    const date = ct.slice(0, 10), time = ct.slice(11, 16);
    if (!date) return null;
    const fullText = title + ' ' + brief;
    /* 央视 brief 是整期节目要点合集（一条涵盖国内外多个话题），用全文分类会被
       次要话题带偏（如国内消费新闻因文末提特朗普误入美联储）；
       先按标题（首个要点）分类，标题无命中再退回全文 */
    let cat = categorize(title);
    if (cat === 'other') cat = categorize(fullText);
    const hot = isHot(fullText);
    const seg = determineSeg(time);
    const pos = countKw(fullText, POS_KW);
    const neg = countKw(fullText, NEG_KW);
    const score = (hot ? 100 : 0) + (pos + neg) * 10 + 15; // 央视官方源最高加权
    return {
      title, url, time, date, cat, hot,
      summary: (topics.length > 1 ? '本期要点：' + topics.slice(0, 4).join('；') : brief).slice(0, 120),
      seg, ts: new Date(ct.replace(/-/g, '/')).getTime() || 0, score, pos, neg,
      src: '央视财经'
    };
  }

  /* ---------------- 官方媒体要闻（东财全网搜索聚合 + 正规媒体白名单） ----------------
     财联社 / 中国证券报 / 证券时报 等官网接口均不开放浏览器直连（CORS/签名校验），
     改用东财全网搜索按时间排序拉取，仅保留白名单内正规媒体的真实报道（可点链接核对原文） */
  const MEDIA_WL = ['财联社', '中国证券报', '上海证券报', '证券时报', '新华财经', '新华社', '每日经济新闻', '第一财经',
    '21世纪经济报道', '中国基金报', '券商中国', '证券日报', '界面', '澎湃', '中新经纬', '央视财经', '央视新闻',
    '人民网', '经济观察报', '华夏时报', '北京商报', '中国经济网', '金融时报'];

  async function fetchMediaQuery(keyword) {
    const param = { uid: '', keyword, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web', clientVersion: 'curr',
      param: { cmsArticleWebOld: { searchScope: 'default', sort: 'time', pageIndex: 1, pageSize: 30, preTag: '', postTag: '' } } };
    const url = 'https://search-api-web.eastmoney.com/search/jsonp?cb=emSchCb&param=' + encodeURIComponent(JSON.stringify(param)) + '&_=' + Date.now();
    const res = await Promise.race([
      fetch(url, { cache: 'no-store' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))
    ]);
    const txt = await res.text();
    const m = txt.match(/^emSchCb\(([\s\S]*)\)\s*;?$/);
    if (!m) return [];
    const j = JSON.parse(m[1]);
    return (j && j.result && j.result.cmsArticleWebOld) || [];
  }

  function mapMediaItem(it) {
    const media = String(it.mediaName || '');
    if (!MEDIA_WL.some(w => media.indexOf(w) >= 0)) return null;
    const title = String(it.title || '').replace(/<[^>]+>/g, '').trim();
    const summary = String(it.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 120);
    const url = String(it.url || '').replace(/^http:/, 'https:');
    if (!title || !url) return null;
    const dt = String(it.date || ''); // 2026-08-09 11:04:00
    const date = dt.slice(0, 10), time = dt.slice(11, 16);
    const fullText = title + ' ' + summary;
    const cat = categorize(fullText);
    const hot = isHot(fullText);
    const seg = determineSeg(time);
    const pos = countKw(fullText, POS_KW);
    const neg = countKw(fullText, NEG_KW);
    const score = (hot ? 100 : 0) + (pos + neg) * 10 + 10; // 白名单官方媒体加权
    return {
      title, url, time, date, cat, hot, summary, seg,
      ts: new Date(dt.replace(/-/g, '/')).getTime() || 0, score, pos, neg,
      src: media
    };
  }

  async function fetchMediaChannel() {
    const lists = await Promise.all(['A股', '财经要闻', '全球市场', '风险提示'].map(q => fetchMediaQuery(q).catch(() => [])));
    const seen = new Set();
    const out = [];
    lists.flat().forEach(it => {
      const mi = mapMediaItem(it);
      if (!mi) return;
      const k = mi.title + '|' + mi.date;
      if (seen.has(k)) return;
      seen.add(k); out.push(mi);
    });
    return out.slice(0, 40);
  }

  /* ---------------- 同花顺快讯（tapp push 接口，浏览器实测直连可达、带 CORS 头） ---------------- */
  /* 字段：title/digest/url/ctime(unix秒)/tag/import(>=3 为红字重要) */
  async function fetchThsPage(page) {
    const url = 'https://news.10jqka.com.cn/tapp/news/push/stock/?page=' + page + '&tag=&track=website&pagesize=40';
    try {
      const res = await Promise.race([
        fetch(url, { cache: 'no-store' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ]);
      if (!res.ok) return null;
      const j = await res.json();
      const list = j && j.data && j.data.list;
      return Array.isArray(list) && list.length ? list : null;
    } catch (e) { return null; }
  }

  function mapThsItem(it) {
    const title = String(it.title || '').trim();
    const digest = String(it.digest || it.short || '').trim();
    const url = String(it.url || '').replace(/^http:/, 'https:');
    const ts = (parseInt(it.ctime, 10) || 0) * 1000;
    if (!title || !url || !ts) return null;
    const d = new Date(ts);
    const date = DT.pad(d.getFullYear()) + '-' + DT.pad(d.getMonth() + 1) + '-' + DT.pad(d.getDate());
    const time = DT.pad(d.getHours()) + ':' + DT.pad(d.getMinutes());
    /* 注意：不得把 it.tag 拼入分类文本——同花顺 push 接口的 tag 是频道级标签，
       实测台风新闻被标 "美股,港股"，直接拼入会污染分类（v41 踩坑修复） */
    const fullText = title + ' ' + digest;
    const cat = categorize(fullText);
    const important = parseInt(it.import, 10) >= 3; // 同花顺红字重要标记
    const hot = isHot(fullText) || important;
    const seg = determineSeg(time);
    const pos = countKw(fullText, POS_KW);
    const neg = countKw(fullText, NEG_KW);
    const score = (hot ? 100 : 0) + (pos + neg) * 10 + (important ? 20 : 0);
    return {
      title, url, time, date, cat, hot,
      summary: digest.slice(0, 120),
      seg, ts, score, pos, neg,
      src: '同花顺'
    };
  }

  async function fetchThsChannel() {
    const p1 = await fetchThsPage(1);
    if (!p1) return null;
    const p2 = await fetchThsPage(2);
    const raw = p2 ? p1.concat(p2) : p1;
    return raw.map(mapThsItem).filter(Boolean);
  }

  

  async function fetchDirect() {
    // 五通道并行采集：东财快讯 + 新浪7×24 + 央视财经 + 官方媒体要闻 + 同花顺快讯
    // 任一成功即可，都成功则合并（去重在后置流程处理）
    const [emItems, sinaItems, cctvItems, mediaItems, thsItems] = await Promise.all([
      fetchEmChannel().catch(() => null),
      fetchSinaChannel().catch(() => null),
      fetchCctvChannel().catch(() => null),
      fetchMediaChannel().catch(() => null),
      fetchThsChannel().catch(() => null)
    ]);
    const srcs = [];
    if (emItems && emItems.length) srcs.push('eastmoney');
    if (sinaItems && sinaItems.length) srcs.push('sina');
    if (cctvItems && cctvItems.length) srcs.push('cctv');
    if (mediaItems && mediaItems.length) srcs.push('media');
    if (thsItems && thsItems.length) srcs.push('ths');
    if (!srcs.length) throw new Error('all sources unreachable');
    const newItems = (emItems || []).concat(sinaItems || [], cctvItems || [], mediaItems || [], thsItems || []);
    const source = srcs.join('+');
    if (!newItems.length) throw new Error('all sources unreachable');

    /* 跨源去重：同一新闻多源转载时，保留权重最高的官方来源（东财>央视>白名单媒体>新浪） */
    const tseen = new Set();
    const deduped = [];
    newItems.slice().sort((a, b) => (SRC_W(b.src) - SRC_W(a.src)) || ((b.ts || 0) - (a.ts || 0))).forEach(i => {
      const k = (i.date || '') + '|' + normTitle(i.title);
      if (normTitle(i.title) && tseen.has(k)) return;
      tseen.add(k); deduped.push(i);
    });

    // 与本地缓存合并去重（按 来源+标题+日期+时间 去重）
    const cached = Store.get('news_cache', null);
    const oldItems = (cached && cached.items) || [];
    const seen = new Set();
    const merged = [];
    const keyOf = i => (i.src || '') + '|' + i.title + '|' + i.date + '|' + i.time;
    /* 新数据的归一化标题集合：旧缓存中与新数据同题的（不同来源转载）直接丢弃 */
    const newNorm = new Set(deduped.map(i => (i.date || '') + '|' + normTitle(i.title)).filter(k => k.length > 2));

    // 新数据优先（更重要、更新）
    deduped.forEach(i => {
      const key = keyOf(i);
      if (!seen.has(key)) { seen.add(key); merged.push(i); }
    });
    // 旧缓存补充（不覆盖新数据；与新数据同题的旧转载也丢弃；超过36小时的旧闻不再带入，保证时效）
    const expire = Date.now() - 36 * 3600 * 1000;
    oldItems.forEach(i => {
      const key = keyOf(i);
      if (seen.has(key)) return;
      if ((i.ts || 0) < expire) return;
      const nk = (i.date || '') + '|' + normTitle(i.title);
      if (normTitle(i.title) && newNorm.has(nk)) return;
      /* 旧缓存条目必须用当前分类器重算：旧版本存在 tag 污染/顺序偏置/无国内语境规则，
         不重算的话错误分类（如台风进美股）会在缓存里继续存活 36 小时（v45 踩坑修复） */
      const ft = (i.title || '') + ' ' + (i.summary || '');
      i.cat = categorize(ft);
      i.hot = isHot(ft) || i.hot === true;
      i.pos = countKw(ft, POS_KW);
      i.neg = countKw(ft, NEG_KW);
      seen.add(key); merged.push(i);
    });

    // 按重要度+时间排序，保留前200条，删除最旧最不重要的（v45 降噪：300→200）
    merged.sort((a, b) => ((b.score || 0) - (a.score || 0)) || ((b.ts || 0) - (a.ts || 0)));
    const items = merged.slice(0, 200);

    // 生成 digest
    const cats = ['us','fed','oil','global','a','other'];
    const catLabel = { us:'美股', fed:'美联储', oil:'国际原油', global:'国际市场', a:'A股', other:'其他' };
    const totalPos = items.reduce((s, i) => s + (i.pos || 0), 0);
    const totalNeg = items.reduce((s, i) => s + (i.neg || 0), 0);
    const ratio = totalPos + totalNeg > 0 ? Math.round(totalPos / (totalPos + totalNeg) * 100) : 50;
    const overall = ratio >= 60 ? '偏多' : ratio <= 40 ? '偏空' : '中性';

    const catDigest = cats.map(k => {
      const ci = items.filter(i => i.cat === k);
      if (!ci.length) return null;
      const cp = ci.reduce((s, i) => s + (i.pos || 0), 0);
      const cn = ci.reduce((s, i) => s + (i.neg || 0), 0);
      const dir = cp > cn ? '偏多' : cn > cp ? '偏空' : '中性';
      const top = ci.sort((a, b) => (b.score - a.score)).slice(0, 3).map(i => ({ title: i.title, url: i.url, date: i.date, time: i.time }));
      return { k, label: catLabel[k], dir, n: ci.length, pos: cp, neg: cn, top };
    }).filter(Boolean);

    const counts = {
      all: items.length,
      overnight: items.filter(i => i.seg === 'overnight').length,
      intraday: items.filter(i => i.seg === 'intraday').length,
      hot: items.filter(i => i.hot).length
    };

    return {
      ok: true, items, counts,
      digest: { overall, pos: totalPos, neg: totalNeg, ratio, cats: catDigest },
      updatedAt: DT.clock(),
      nightStart: nightStartStr(),
      catLabel,
      _source: source
    };
  }

  /* ---------------- 拉取（降级链） ---------------- */
  async function fetchNews(force) {
    if (!force && cache && Date.now() - lastAt < 60000) return cache;

    // 1) 同源服务端代理
    try {
      const r = await fetch('/api/news' + (force ? '?force=1' : ''), { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d && d.ok && Array.isArray(d.items)) {
          cache = d; lastAt = Date.now();
          try { Store.set('news_cache', d); } catch (e) { }
          return d;
        }
      }
    } catch (e) { /* 降级 */ }

    // 2) 东方财富直连
    try {
      const d = await fetchDirect();
      if (d && d.ok && d.items && d.items.length) {
        cache = d; lastAt = Date.now();
        try { Store.set('news_cache', d); } catch (e) { }
        return d;
      }
    } catch (e) { console.warn('[东方财富直连失败]', e.message); }

    // 3) 本地缓存
    const local = Store.get('news_cache', null);
    if (local && local.items) { local._offline = true; return local; }

    return { ok: false, error: '全部新闻通道均暂不可达(v4a)', items: [], counts: {}, digest: null };
  }

  /* ---------------- 单条要闻（紧凑行） ---------------- */
  function flashRow(i, showDate) {
    const cat = i.cat || 'other';
    const label = (cache && cache.catLabel && cache.catLabel[cat]) || '其他';
    const t = showDate ? (i.date || '').slice(5) + ' ' + i.time : i.time;
    const safe = /^https?:\/\//i.test(i.url || '') ? i.url : '';
    const tag = `<span class="fc fc-${cat}">${UI.esc(label)}</span>`;
    const srcB = i.src ? `<span class="fsrc">${UI.esc(i.src)}</span>` : '';
    const hot = i.hot ? '<span class="fhot">重磅</span>' : '';
    const seg = i.seg === 'intraday' ? '<span class="fseg fseg-intraday">盘中</span>'
      : (i.seg === 'overnight' ? '<span class="fseg fseg-overnight">隔夜</span>' : '');
    const sum = i.summary ? `<span class="fs">${UI.esc(i.summary)}</span>` : '';
    const inner = `<span class="ft">${seg}${UI.esc(t)}</span>${tag}
      <span class="fb"><span class="fh">${hot}${UI.esc(i.title)}</span>${sum}</span>`;
    return safe
      ? `<a class="flash" href="${UI.esc(safe)}" target="_blank" rel="noopener noreferrer">${inner}<span class="fgo">↗</span></a>`
      : `<div class="flash">${inner}</div>`;
  }

/* ---------------- 要闻流主体（分类折叠手风琴） ----------------
   按分类整理：美股 / 美联储 / 国际原油 / 国际市场 / A股 / 其他，
   每类一个可折叠区块（点标题展开/收起）；块内按「重要程度→发布时间」排序，
   重磅始终置顶；单类条目过多时块内再提供「展开剩余 N 条」。
   全部来自真实接口（东财/新浪/央视/官方媒体白名单），含原文链接，不虚构任何标题；
   每条附带对A股影响评估，行内仍保留「隔夜 / 盘中」时段标，便于区分。 */
const INNER_LIMIT = 8; // v45 降噪：每类默认展示 12→8 条，其余折叠「展开剩余 N 条」
const CAT_ORDER = ['us', 'fed', 'oil', 'global', 'a', 'other'];
const CAT_META = {
  us:     { label: '美股',     ico: '🇺🇸', open: true },
  fed:    { label: '美联储',   ico: '🏛️', open: true },
  oil:    { label: '国际原油', ico: '🛢️', open: true },
  global: { label: '国际市场', ico: '🌐', open: true },
  a:      { label: 'A股',      ico: '🇨🇳', open: false },
  other:  { label: '其他',     ico: '📌', open: false }
};
function renderFlash(d, opt) {
  opt = opt || {};
  if (!d || !d.items || !d.items.length) {
    return `<div class="flash-empty">${d && d.error
      ? '快讯服务暂不可达（' + UI.esc(d.error) + '），稍后点刷新重试。不展示任何虚构内容。'
      : '暂无快讯数据'}</div>`
      + renderPasteHint();
  }
  const cat = opt.cat || 'all';
  const hotOnly = !!opt.hotOnly;
  let list = d.items.slice();
  if (cat !== 'all') list = list.filter(i => i.cat === cat);
  if (hotOnly) list = list.filter(i => i.hot);
  if (!list.length) return `<div class="flash-empty">当前筛选下没有要闻，试试切换分类或关闭「只看重磅」</div>`;

  const onlyOne = cat !== 'all';
  /* 分层排序：层级 = 重磅 + 来源权重（央视4/东财3/白名单媒体2/新浪1），
     官方源整体排在新浪之前（官方为主、新浪为辅），同层按时间倒序 */
  const tier = i => (i.hot ? 1 : 0) + SRC_W(i.src);
  const byImp = (a, b) => (tier(b) - tier(a)) || ((b.ts || 0) - (a.ts || 0));

  const blocks = CAT_ORDER.filter(k => CAT_META[k]).map(k => {
    const items = list.filter(i => (i.cat || 'other') === k).sort(byImp);
    if (!items.length) return '';
    const meta = CAT_META[k];
    const isOpen = onlyOne ? true : Store.get('news_coll_' + k, meta.open);
    const expanded = onlyOne ? true : !!Store.get('news_exp_' + k, false);
    const show = expanded ? items : items.slice(0, INNER_LIMIT);
    const more = items.length - show.length;
    const body = `<div class="fa-body">${show.map(i => flashRowFull(i, true)).join('')}`
      + (more > 0 || (expanded && !onlyOne)
        ? `<button class="flash-more" data-newsexp="${k}">${expanded ? '收起 ▴' : `展开剩余 ${more} 条 ▾`}</button>`
        : '')
      + `</div>`;
    return `<div class="flash-acc ${isOpen ? '' : 'collapsed'}" data-acc="${k}">
      <button class="fa-hd" data-newscoll="${k}">
        <span class="fa-ico">${meta.ico}</span>
        <span class="fa-name">${meta.label}</span>
        <span class="fa-cnt">${items.length}</span>
        <span class="fa-hd-note"></span>
        <span class="fa-arrow">▾</span>
      </button>
      ${body}
    </div>`;
  }).filter(Boolean);

  return `<div class="flash-accs">${blocks.join('')}</div>`;
}

/* 单条要闻完整行（含影响评估） */
function flashRowFull(i, showDate) {
  const cat = i.cat || 'other';
  const label = (cache && cache.catLabel && cache.catLabel[cat]) || '其他';
  const t = showDate ? (i.date || '').slice(5) + ' ' + i.time : i.time;
  const safe = /^https?:\/\//i.test(i.url || '') ? i.url : '';
  const seg = i.seg === 'intraday' ? '<span class="fseg fseg-intraday">盘中</span>'
    : (i.seg === 'overnight' ? '<span class="fseg fseg-overnight">隔夜</span>' : '');
  const hot = i.hot ? '<span class="fhot">重磅</span>' : '';
  const level = impLevel(i);
  const lvBadge = level === 'high' ? '<span class="fl-lv fl-lv-high">🔴 重要</span>'
    : (level === 'mid' ? '<span class="fl-lv fl-lv-mid">🟡 关注</span>' : '');
  const impact = impactA(i);
  const itag = impactTag(i);

    const inner = `<div class="fl-main">
    <div class="fl-meta">${seg}${hot}${lvBadge}<span class="fc fc-${cat}">${UI.esc(label)}</span>${i.src ? `<span class="fsrc">${UI.esc(i.src)}</span>` : ''}<span class="fl-time">${UI.esc(t)}</span></div>
    <div class="fl-title">${safe
      ? `<a href="${UI.esc(safe)}" target="_blank" rel="noopener noreferrer">${UI.esc(i.title)}</a>`
      : UI.esc(i.title)}</div>
    ${i.summary ? `<div class="fl-summary">${UI.esc(i.summary)}</div>` : ''}
    <div class="fl-impact">${itag}<span class="fl-impact-label">对A股影响：</span>${UI.esc(impact)}</div>
  </div>`;
  return safe
    ? `<div class="fl-row">${inner}<a class="fl-go" href="${UI.esc(safe)}" target="_blank" rel="noopener noreferrer">↗</a></div>`
    : `<div class="fl-row">${inner}</div>`;
}

/* 数据不可达时的粘贴提示 */
function renderPasteHint() {
  return `<div class="nw-paste">
    <div class="nw-paste-hd">
      <span class="nw-paste-ico">📋</span>
      <div>
        <div class="nw-paste-title">无法获取真实快讯数据</div>
        <div class="nw-paste-desc">请粘贴同花顺原始收盘数据及新闻链接，格式：每行一条，支持 Markdown 链接</div>
      </div>
    </div>
    <textarea class="nw-paste-area" id="nwPaste" rows="6" placeholder="粘贴新闻数据...&#10;例如：&#10;[美股三大指数集体收涨](https://finance.eastmoney.com/a/xxx.html) | 美股 | 隔夜&#10;[美联储宣布维持利率不变](https://finance.sina.com.cn/xxx) | 美联储 | 隔夜&#10;[央行开展500亿逆回购](https://www.pbc.gov.cn/xxx) | A股 | 盘中"></textarea>
    <button class="btn btn-solid" data-act="parse-news-paste">解析并保存</button>
  </div>`;
}

  /* ---------------- 筛选条 ---------------- */
  function renderChips(d, opt) {
    opt = opt || {};
    const cat = opt.cat || 'all';
    /* 计数口径与实际展示条目一致，避免「全部」小于分类之和 */
    const items = (d && d.items) || [];
    const c = { all: items.length, hot: 0 };
    items.forEach(i => { c[i.cat] = (c[i.cat] || 0) + 1; if (i.hot) c.hot++; });
    return `<div class="chips" id="newsChips">
      ${CATS.map(x => `<button class="chip ${x.k === cat ? 'active' : ''}" data-newscat="${x.k}">${x.label}<i>${c[x.k] || 0}</i></button>`).join('')}
      <button class="chip chip-hot ${opt.hotOnly ? 'active' : ''}" data-newshot="1">🔥 只看重磅<i>${c.hot || 0}</i></button>
    </div>`;
  }

  /* ---------------- 当日要闻自动小结 ---------------- */
  /* 按实际可用通道生成数据源描述（如实标注，不夸大） */
  function srcDesc(source) {
    const map = {
      eastmoney: '东方财富 7×24 快讯',
      sina: '新浪财经 7×24',
      cctv: '央视《正点财经》(CCTV-2 官方)',
      media: '官方媒体要闻（财联社/中国证券报/证券时报/新华社等，东财全网聚合）',
      ths: '同花顺快讯',
      paste: '手动粘贴数据'
    };
    if (!source) return '本地缓存';
    return source.split('+').map(k => map[k] || k).join(' + ');
  }

  function renderDigest(d, quotes) {
    if (!d || !d.digest) {
      return `<div class="flash-empty">快讯加载后自动生成小结</div>`;
    }
    const g = d.digest, c = d.counts || {};
    const toneCls = t => t === '偏多' || t === '偏暖' ? 'up' : (t === '偏空' || t === '偏冷' ? 'down' : 'flat');
    const arrow = t => t === '偏多' || t === '偏暖' ? '↑' : (t === '偏空' || t === '偏冷' ? '↓' : '→');

    /* 一段话小结（全部基于真实统计，不虚构） */
    const parts = [];
    parts.push(`截至 <b>${UI.esc(d.updatedAt || DT.clock())}</b>，自上一交易日收盘（${UI.esc(d.nightStart || '')}）以来共采集 <b>${c.all || 0}</b> 条财经快讯，其中隔夜 ${c.overnight || 0} 条、盘中 ${c.intraday || 0} 条，重磅 <b>${c.hot || 0}</b> 条。`);
    parts.push(`按利多/利空词频统计，整体消息面 <b class="${toneCls(g.overall)}">${g.overall}</b>（利多 ${g.pos} / 利空 ${g.neg}，暖度 ${g.ratio}%）。`);
    if (g.cats && g.cats.length) {
      parts.push('分项来看：' + g.cats.map(x =>
        `${x.label}<b class="${toneCls(x.dir)}">${x.dir}</b>`).join('、') + '。');
    }
    /* 行情侧印证 */
    if (quotes) {
      const seg = [];
      const push = (k, name) => {
        const q = quotes[k];
        if (q && q.chgPct != null) seg.push(`${name} ${UI.sign(q.chgPct, 2, '%')}`);
      };
      push('ixic', '纳指'); push('spx', '标普'); push('wti', 'WTI原油'); push('gold', '黄金'); push('usdcnh', '离岸人民币');
      if (seg.length) parts.push(`行情印证：${seg.join('、')}。`);
    }

    const catRows = (g.cats || []).map(x => `
      <div class="dg-cat">
        <div class="dg-cat-hd">
          <span class="fc fc-${x.k}">${UI.esc(x.label)}</span>
          <span class="dg-dir ${toneCls(x.dir)}">${arrow(x.dir)} ${UI.esc(x.dir)}</span>
          <span class="dg-n">${x.n} 条 · 多${x.pos}/空${x.neg}</span>
        </div>
        ${x.top && x.top.length ? `<ul class="dg-top">${x.top.map(t =>
      /^https?:\/\//i.test(t.url || '')
        ? `<li><a href="${UI.esc(t.url)}" target="_blank" rel="noopener noreferrer">${UI.esc(t.title)}</a><span class="tm">${UI.esc((t.date || '').slice(5))} ${UI.esc(t.time)}</span></li>`
        : `<li>${UI.esc(t.title)}<span class="tm">${UI.esc(t.time)}</span></li>`).join('')}</ul>` : ''}
      </div>`).join('');

    return `
      <div class="digest">
        <div class="dg-hd">
          <span class="dg-badge ${toneCls(g.overall)}">消息面${UI.esc(g.overall)}</span>
          <div class="dg-bar"><i class="${toneCls(g.overall)}" style="width:${Math.max(4, Math.min(100, g.ratio))}%"></i></div>
          <span class="dg-pct">${g.ratio}%</span>
        </div>
        <p class="dg-text">${parts.join(' ')}</p>
        <div class="dg-cats">${catRows}</div>
        <div class="dg-src">数据源：${srcDesc(d._source)} · 全部为真实接口/官方媒体原文（可点链接核对）· 倾向由关键词统计自动判定，仅供参考，不构成投资建议</div>
      </div>`;
  }

  /* ---------------- 供其他页面复用 ---------------- */
  /* 当前已拉取的快讯（无则回落本地缓存） */
  function data() { return cache || Store.get('news_cache', null); }

  /* 按关键词匹配真实新闻（给个股异动找「依据」，匹配不到就不编造） */
  function match(keys, limit) {
    const d = data();
    if (!d || !d.items) return [];
    const ks = (keys || []).filter(Boolean);
    if (!ks.length) return [];
    const hit = d.items.filter(i => {
      const t = i.title + ' ' + (i.summary || '');
      return ks.some(k => t.indexOf(k) !== -1);
    });
    hit.sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
    return limit ? hit.slice(0, limit) : hit;
  }

  /* 指定分类的紧凑事件流（关键事件用） */
  function eventList(cats, limit, opt) {
    opt = opt || {};
    const d = data();
    if (!d || !d.items || !d.items.length) {
      return `<div class="flash-empty">快讯服务暂不可达，稍后点刷新重试。不展示任何虚构内容。</div>`;
    }
    let list = d.items.filter(i => cats.indexOf(i.cat) !== -1);
    if (opt.hotFirst) list.sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
    if (!list.length) return `<div class="flash-empty">当前时段暂无该类要闻</div>`;
    const show = list.slice(0, limit || 20);
    return `<div class="flash-list">${show.map(i => flashRow(i, true)).join('')}</div>`
      + (list.length > show.length
        ? `<div class="flash-tip">共 ${list.length} 条相关要闻，此处按重要度展示前 ${show.length} 条 · 完整列表见「全球 &amp; 隔夜要闻」</div>`
        : '');
  }

  /* ---------------- 粘贴解析（同花顺格式） ---------------- */
  function parsePaste(text) {
    const lines = text.split('\n').filter(Boolean);
    const items = [];
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      // 匹配 [标题](URL)
      const mdMatch = line.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
      let title = '', url = '';
      if (mdMatch) { title = mdMatch[1].trim(); url = mdMatch[2].trim(); }
      else { title = line.replace(/\|.*$/, '').trim(); url = ''; }

      // 匹配分类
      const catMatch = line.match(/\|\s*(美股|美联储|国际原油|国际市场|A股|其他)/);
      let cat = 'other';
      if (catMatch) {
        const catMap = { '美股':'us','美联储':'fed','国际原油':'oil','国际市场':'global','A股':'a','其他':'other' };
        cat = catMap[catMatch[1]] || 'other';
      } else {
        cat = categorize(title + ' ' + url);
      }

      // 匹配时段
      const segMatch = line.match(/\|\s*(隔夜|盘中)/);
      const seg = segMatch ? (segMatch[1] === '盘中' ? 'intraday' : 'overnight') : determineSeg('');

      const fullText = title + ' ' + url;
      const hot = isHot(fullText);
      const pos = countKw(fullText, POS_KW);
      const neg = countKw(fullText, NEG_KW);

      if (title) {
        items.push({
          title, url, time: '', date: '', cat, hot,
          summary: title.slice(0, 120),
          seg, ts: Date.now(), score: (hot ? 100 : 0) + (pos + neg) * 10, pos, neg
        });
      }
    });
    return items;
  }

  /* 保存粘贴数据到缓存 */
  function savePaste(items) {
    const cats = ['us','fed','oil','global','a','other'];
    const catLabel = { us:'美股', fed:'美联储', oil:'国际原油', global:'国际市场', a:'A股', other:'其他' };
    const totalPos = items.reduce((s, i) => s + (i.pos || 0), 0);
    const totalNeg = items.reduce((s, i) => s + (i.neg || 0), 0);
    const ratio = totalPos + totalNeg > 0 ? Math.round(totalPos / (totalPos + totalNeg) * 100) : 50;
    const overall = ratio >= 60 ? '偏多' : ratio <= 40 ? '偏空' : '中性';

    const catDigest = cats.map(k => {
      const ci = items.filter(i => i.cat === k);
      if (!ci.length) return null;
      const cp = ci.reduce((s, i) => s + (i.pos || 0), 0);
      const cn = ci.reduce((s, i) => s + (i.neg || 0), 0);
      const dir = cp > cn ? '偏多' : cn > cp ? '偏空' : '中性';
      const top = ci.sort((a, b) => (b.score - a.score)).slice(0, 3).map(i => ({ title: i.title, url: i.url, date: i.date, time: i.time }));
      return { k, label: catLabel[k], dir, n: ci.length, pos: cp, neg: cn, top };
    }).filter(Boolean);

    const counts = {
      all: items.length,
      overnight: items.filter(i => i.seg === 'overnight').length,
      intraday: items.filter(i => i.seg === 'intraday').length,
      hot: items.filter(i => i.hot).length
    };

    const d = {
      ok: true, items, counts,
      digest: { overall, pos: totalPos, neg: totalNeg, ratio, cats: catDigest },
      updatedAt: DT.clock(),
      nightStart: nightStartStr(),
      catLabel,
      _source: 'paste'
    };
    cache = d; lastAt = Date.now();
    try { Store.set('news_cache', d); } catch (e) { }
    return d;
  }

  return { CATS, fetchNews, renderFlash, renderChips, renderDigest, data, match, eventList, flashRow, parsePaste, savePaste, aShareSession };
})();
