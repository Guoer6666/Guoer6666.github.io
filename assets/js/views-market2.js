/* ============================================================
   views-market2.js · A股每日复盘（二）
   主线题材 / 龙虎榜 / 次日机会 / 次日风险 / 口播底稿 / 个人持仓
   ============================================================ */

/* ============================================================
   ⑥ 主线题材 & 连板梯队
   ============================================================ */
V.themes = {
  title: '主线题材 & 连板梯队',
  desc: '题材强度跟踪 + 高度板梯队',
  render() {
    return `
      ${UI.tdBanner('themes_main', '主线题材 & 连板梯队')}
      ${UI.card({
        title: '🔥 主线题材强度',
        sub: '判断主线的持续性',
        tight: true,
        body: UI.table({
          key: 'themes_main',
          wide: true,
          readonly: true,
          noAdd: true,
          seed: SEED.themes,
          cols: [
            { k: 'name', label: '题材', w: 110 },
            { k: 'chgPct', label: '板块涨幅%', w: 100, num: true, center: true },
            { k: 'amount', label: '板块成交额(亿)', w: 130, num: true },
            { k: 'leader', label: '龙头股', w: 110 },
            { k: 'logic', label: '驱动逻辑', w: 210 },
            { k: 'status', label: '状态', w: 88, center: true },
            { k: 'plan', label: '参与计划', w: 170 }
          ]
        })
      })}

      ${UI.card({
        title: '🪜 连板梯队',
        sub: '高度决定情绪天花板',
        tight: true,
        body: UI.table({
          key: 'themes_ladder',
          wide: true,
          readonly: true,
          noAdd: true,
          seed: SEED.ladder,
          cols: [
            { k: 'board', label: '板数', w: 66, num: true, center: true },
            { k: 'name', label: '个股', w: 100 },
            { k: 'theme', label: '所属题材', w: 110 },
            { k: 'seal', label: '封单(万)', w: 90, num: true },
            { k: 'time', label: '涨停时间', w: 88 },
            { k: 'grade', label: '晋级概率', w: 90, center: true },
            { k: 'note', label: '备注', w: 160 }
          ]
        })
      })}

      ${UI.card({
        title: '💭 主线判断',
        sub: '自动保存',
        body: UI.textarea('themes_note', '当前市场主线是什么？处于第几天？高度板能否延续？明日应该顺主线还是等分歧…', 110)
      })}
    `;
  }
};

/* ============================================================
   ⑦ 龙虎榜资金流向
   ============================================================ */
V.dragon = {
  title: '龙虎榜资金流向',
  desc: '机构席位 + 知名游资动向',
  render() {
    const rows = Store.rows('dragon_inst', SEED.dragonInst);
    const net = rows.reduce((s, r) => s + ((parseFloat(r.buy) || 0) - (parseFloat(r.sell) || 0)), 0);
    return `
      ${UI.tdBanner('dragon_inst', '龙虎榜资金流向')}
      ${UI.kpi([
        { label: '机构席位净额', value: `<span class="${UI.dirCls(net)}">${UI.sign(net, 0)}</span>`, delta: '万元 · 自动合计', dir: net >= 0 ? 'up' : 'down' },
        { label: '上榜个股', value: rows.length, delta: '只（机构表）' },
        { label: '统计日期', value: `<span style="font-size:15px">${DT.today()}</span>`, delta: DT.cnDate() }
      ])}

      ${UI.card({
        title: '🏛️ 机构席位',
        sub: '中长线资金意图',
        tight: true,
        body: UI.table({
          key: 'dragon_inst',
          wide: true,
          readonly: true,
          noAdd: true,
          seed: SEED.dragonInst,
          cols: [
            { k: 'name', label: '个股', w: 100 },
            { k: 'code', label: '代码', w: 88 },
            { k: 'buy', label: '买入(万)', w: 96, num: true },
            { k: 'sell', label: '卖出(万)', w: 96, num: true },
            {
              k: 'net', label: '净额(万)', w: 96, num: true, compute: r => {
                const v = (parseFloat(r.buy) || 0) - (parseFloat(r.sell) || 0);
                return { text: UI.sign(v, 0), cls: UI.dirCls(v) };
              }
            },
            { k: 'seats', label: '机构家数', w: 86, num: true },
            { k: 'reason', label: '上榜原因', w: 150 },
            { k: 'view', label: '解读', w: 170 }
          ]
        })
      })}

      ${UI.card({
        title: '🎲 游资席位',
        sub: '短线接力风向',
        tight: true,
        body: UI.table({
          key: 'dragon_hot',
          wide: true,
          readonly: true,
          noAdd: true,
          seed: SEED.dragonHot,
          cols: [
            { k: 'name', label: '个股', w: 100 },
            { k: 'seat', label: '游资名称', w: 130 },
            { k: 'buy', label: '买入(万)', w: 96, num: true },
            { k: 'sell', label: '卖出(万)', w: 96, num: true },
            {
              k: 'net', label: '净额(万)', w: 96, num: true, compute: r => {
                const v = (parseFloat(r.buy) || 0) - (parseFloat(r.sell) || 0);
                return { text: UI.sign(v, 0), cls: UI.dirCls(v) };
              }
            },
            { k: 'style', label: '操作风格', w: 106, center: true },
            { k: 'prob', label: '接力概率', w: 88, center: true },
            { k: 'note', label: '备注', w: 150 }
          ]
        })
      })}
    `;
  }
};

/* ============================================================
   ⑧ 次日机会方向
   ============================================================ */
V.opportunity = {
  title: '次日机会方向',
  desc: '提前锁定方向 · 不做临场决策',
  render() {
    return `
      ${UI.tdBanner('opportunity', '次日机会方向')}
      <div class="notice info">交易的确定性来自计划：<b>方向、标的、触发条件、仓位</b>四要素齐全，才算一个可执行的机会。</div>

      ${UI.card({
        title: '🎯 机会清单',
        tight: true,
        body: UI.table({
          key: 'opportunity',
          wide: true,
          readonly: true,
          noAdd: true,
          seed: SEED.opportunity,
          cols: [
            { k: 'dir', label: '方向 / 板块', w: 120 },
            { k: 'logic', label: '核心逻辑', w: 220 },
            { k: 'targets', label: '关注标的', w: 140 },
            { k: 'priority', label: '优先级', w: 82, center: true },
            { k: 'trigger', label: '触发条件', w: 190 },
            { k: 'position', label: '计划仓位%', w: 100, num: true },
            { k: 'space', label: '预期空间', w: 100 }
          ]
        })
      })}

      ${UI.card({
        title: '🔍 备选池',
        sub: '还没到出手条件，但值得盯',
        tight: true,
        body: UI.table({
          key: 'opportunity_pool',
          narrow: true,
          readonly: true,
          noAdd: true,
          seed: [{ name: '', reason: '', signal: '' }],
          cols: [
            { k: 'name', label: '标的', w: 110 },
            { k: 'reason', label: '看好原因', w: 200 },
            { k: 'signal', label: '等待信号', w: 180 }
          ]
        })
      })}

      ${UI.card({
        title: '📝 机会总结',
        sub: '自动保存',
        body: UI.textarea('opportunity_note', '明日最想做的一笔交易是什么？如果只能买一只，会买哪只，为什么…', 110)
      })}
    `;
  }
};

/* ============================================================
   ⑨ 次日风险避雷
   ============================================================ */
V.risk = {
  title: '次日风险避雷',
  desc: '先想亏多少，再想赚多少',
  render() {
    return `
      ${UI.tdBanner('risk', '次日风险避雷')}
      <div class="notice">风险清单的意义在于<b>提前写下来</b>：盘中情绪上头时，你只需要照着执行，而不是重新判断。</div>

      ${UI.card({
        title: '⚠️ 风险清单',
        tight: true,
        body: UI.table({
          key: 'risk',
          wide: true,
          readonly: true,
          noAdd: true,
          seed: SEED.risk,
          cols: [
            { k: 'point', label: '风险点', w: 140 },
            { k: 'scope', label: '影响范围', w: 150 },
            { k: 'level', label: '等级', w: 78, center: true },
            { k: 'avoid', label: '规避标的', w: 130 },
            { k: 'plan', label: '应对策略', w: 220 },
            { k: 'stop', label: '止损线%', w: 88, num: true }
          ]
        })
      })}

      ${UI.card({
        title: '🚫 今日绝不碰',
        sub: '写下来，就别破戒',
        tight: true,
        body: UI.table({
          key: 'risk_blacklist',
          narrow: true,
          readonly: true,
          noAdd: true,
          seed: SEED.blacklist,
          cols: [
            { k: 'item', label: '禁区', w: 160 },
            { k: 'why', label: '原因', w: 230 }
          ]
        })
      })}

      ${UI.card({
        title: '📝 风险预案',
        sub: '自动保存',
        body: UI.textarea('risk_note', '如果明天大盘低开1%以上，我的操作是…；如果持仓股跌停，我的处理是…', 110)
      })}
    `;
  }
};

/* ============================================================
   ⑩ 当日复盘口播底稿
   ============================================================ */
V.script = {
  title: '当日复盘口播底稿',
  desc: '结构化文本 · 一键生成 / 复制',
  render() {
    const txt = Store.get('script_text', '');
    return `
      ${UI.tdBanner('script_text', '复盘口播底稿')}
      ${UI.card({
        title: '🎙️ 口播底稿',
        sub: '自动保存',
        right: `
          <button class="btn btn-sm btn-pink" data-act="gen-script">一键生成模板</button>
          <button class="btn btn-sm btn-ghost" data-act="copy-script">复制全文</button>`,
        body: `${UI.textarea('script_text', '点击右上角「一键生成模板」，自动带入今日情绪数据与主线题材，再补充你的观点。', 340)}
          <div style="display:flex;gap:14px;margin-top:10px;font-size:11.5px;color:var(--ink-3)">
            <span>字数 <b id="scWords">${txt.length}</b></span>
            <span>预计口播 <b id="scMin">${Math.max(1, Math.round(txt.length / 240))}</b> 分钟</span>
          </div>`
      })}

      ${UI.card({
        title: '🗂️ 底稿归档',
        sub: '按日期保存历史底稿',
        tight: true,
        body: `<div class="table-foot" style="border-top:none;border-bottom:1px solid var(--line-2)">
            <button class="btn btn-sm btn-pink" data-act="archive-script">📥 归档当前底稿</button>
            <span class="table-tip">归档后可随时回看历史复盘</span>
          </div>` + UI.table({
          key: 'script_archive',
          wide: true,
          noAdd: false,
          addLabel: '+ 手动添加归档',
          seed: [],
          cols: [
            { k: 'date', label: '日期', w: 118, type: 'date' },
            { k: 'title', label: '标题', w: 160 },
            { k: 'summary', label: '核心观点', w: 260, type: 'textarea' },
            { k: 'words', label: '字数', w: 70, type: 'number', num: true }
          ]
        })
      })}
    `;
  },
  mount(reg) {
    const ta = document.querySelector('[data-note="script_text"]');
    if (ta) ta.addEventListener('input', () => {
      const w = UI.$('#scWords'), m = UI.$('#scMin');
      if (w) w.textContent = ta.value.length;
      if (m) m.textContent = Math.max(1, Math.round(ta.value.length / 240));
    });
  },
  genTemplate() {
    const k = Store.get('sentiment_kpi', SEED.sentimentKpi);
    const themes = Store.rows('themes_main', SEED.themes).filter(t => t.name);
    const ladder = Store.rows('themes_ladder', SEED.ladder).filter(t => t.name);
    const opp = Store.rows('opportunity', SEED.opportunity).filter(t => t.dir);
    const rsk = Store.rows('risk', SEED.risk).filter(t => t.point);
    const cache = Market.readCache();
    const sh = cache.sh, cyb = cache.cyb;

    const L = [];
    L.push(`【${DT.cnDate()} 收盘复盘】`);
    L.push('');
    L.push('一、指数表现');
    L.push(sh && sh.price != null
      ? `　上证指数收于 ${sh.price.toFixed(2)} 点，${UI.sign(sh.chgPct, 2, '%')}；创业板指 ${cyb && cyb.price != null ? cyb.price.toFixed(2) + '点，' + UI.sign(cyb.chgPct, 2, '%') : '（待补充）'}。`
      : '　（指数数据待补充）');
    L.push(`　两市情绪：涨停 ${k.limitUp || '--'} 家，跌停 ${k.limitDown || '--'} 家，炸板率 ${k.brokenRate || '--'}%，最高连板 ${k.height || '--'} 板。`);
    L.push('');
    L.push('二、主线题材');
    if (themes.length) themes.slice(0, 4).forEach((t, i) =>
      L.push(`　${i + 1}. ${t.name}｜${t.status || '--'}｜发酵 ${t.days || '--'} 天｜龙头 ${t.leader || '--'}。逻辑：${t.logic || '待补充'}。`));
    else L.push('　（暂无题材记录）');
    L.push('');
    L.push('三、连板梯队');
    if (ladder.length) L.push('　' + ladder.slice(0, 6).map(t => `${t.board || '?'}板 ${t.name}`).join('、') + '。');
    else L.push('　（暂无梯队记录）');
    L.push('');
    L.push('四、明日机会');
    if (opp.length) opp.slice(0, 3).forEach((t, i) =>
      L.push(`　${i + 1}. ${t.dir}（${t.priority || 'B'}级）：${t.logic || ''}　触发：${t.trigger || '待定'}。`));
    else L.push('　（暂无机会记录）');
    L.push('');
    L.push('五、风险提示');
    if (rsk.length) rsk.slice(0, 3).forEach((t, i) => L.push(`　${i + 1}. ${t.point}（${t.level || '中'}）：${t.plan || ''}`));
    else L.push('　（暂无风险记录）');
    L.push('');
    L.push('六、一句话总结');
    L.push('　' + (Store.get('themes_note', '') || '（写下你今天最重要的那个判断）'));
    L.push('');
    L.push('以上内容仅为个人复盘记录，不构成任何投资建议。');
    return L.join('\n');
  }
};

/* ============================================================
   ⑪ 个股逻辑拆解（驱动因素 + 综合研判 + 七维全面体检 + 大盘视角建议）
   数据：腾讯实时行情 / 东财涨停池 / 行业涨跌榜 / 龙虎榜 / 真实快讯 / 估值 / 股东户数 / K线
   铁律：数据缺失处明示「无法验证」，绝不编造
   ============================================================ */
V.holdings = {
  title: '个股逻辑拆解',
  desc: '驱动因素 + 综合研判（多空信号加权评级）+ 七维全面体检 + 跌破/持仓建议 · 全部基于实时真实数据',
  _mkt: null, _mktAt: 0,

  /* 拉取全市场真实数据（10 分钟内复用，避免重复请求） */
  async ensureMkt(force) {
    if (!force && this._mkt && Date.now() - this._mktAt < 10 * 60 * 1000) return this._mkt;
    const [br, lad, sec, lhb] = await Promise.all([
      Market.breadth().catch(() => ({ ok: false })),
      Market.ladder().catch(() => ({ ok: false })),
      Market.sectorRank().catch(() => ({ ok: false })),
      Market.billboard().catch(() => ({ ok: false }))
    ]);
    this._mkt = { br, lad, sec, lhb };
    this._mktAt = Date.now();
    return this._mkt;
  },

  /* 全网域真实检索：东财全网新闻搜索（剥 JSONP 壳）+ 东财数据中心财报 / 业绩预告
     （np-anotice 公告接口被东财 WAF 拦截浏览器请求，改用浏览器可达的 datacenter-web 报表）
     只保留可核对的真实数据；失败时返回空并如实标注 */
  async webFetch(r) {
    const out = { news: [], newsOk: false, fund: null, predict: null };
    const code6 = (r.code || '').replace(/^(sh|sz|bj)/i, '');
    const dc = async reportName => {
      const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=' + reportName
        + '&columns=ALL&filter=(SECURITY_CODE%3D%22' + code6 + '%22)&pageNumber=1&pageSize=2'
        + '&sortColumns=NOTICE_DATE&sortTypes=-1&source=WEB&client=WEB&_=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json();
      return (j && j.result && j.result.data) || [];
    };
    const jobs = [];
    if (code6) {
      jobs.push(dc('RPT_LICO_FN_CPD').then(l => {
        const d = l[0];
        if (d) out.fund = {
          qdate: d.QDATE || '', datatype: d.DATATYPE || '', eps: d.BASIC_EPS,
          rev: d.TOTAL_OPERATE_INCOME != null ? +(d.TOTAL_OPERATE_INCOME / 1e8).toFixed(2) : null,
          revYoy: d.YSTZ != null ? +d.YSTZ.toFixed(1) : null,
          np: d.PARENT_NETPROFIT != null ? +(d.PARENT_NETPROFIT / 1e8).toFixed(2) : null,
          npYoy: d.SJLTZ != null ? +d.SJLTZ.toFixed(1) : null,
          roe: d.WEIGHTAVG_ROE, gross: d.XSMLL != null ? +d.XSMLL.toFixed(1) : null,
          board: d.BOARD_NAME || '', notice: String(d.NOTICE_DATE || '').slice(0, 10)
        };
      }).catch(e => console.warn('[财报获取失败]', e.message)));
      jobs.push(dc('RPT_PUBLIC_OP_PREDICT').then(l => {
        const d = l[0];
        if (d) out.predict = {
          notice: String(d.NOTICE_DATE || '').slice(0, 10), reportdate: String(d.REPORTDATE || '').slice(0, 10),
          lo: d.FORECASTL != null ? +(d.FORECASTL / 1e8).toFixed(2) : null,
          hi: d.FORECASTT != null ? +(d.FORECASTT / 1e8).toFixed(2) : null,
          incLo: d.INCREASEL != null ? +d.INCREASEL.toFixed(0) : null,
          incHi: d.INCREASET != null ? +d.INCREASET.toFixed(0) : null,
          content: String(d.FORECASTCONTENT || '').slice(0, 160)
        };
      }).catch(e => console.warn('[业绩预告获取失败]', e.message)));
    }
    if (r.name) jobs.push((async () => {
      const param = { uid: '', keyword: r.name, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web', clientVersion: 'curr',
        param: { cmsArticleWebOld: { searchScope: 'default', sort: 'time', pageIndex: 1, pageSize: 6, preTag: '', postTag: '' } } };
      const url = 'https://search-api-web.eastmoney.com/search/jsonp?cb=wbcb&param=' + encodeURIComponent(JSON.stringify(param)) + '&_=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const txt = await res.text();
      const m = txt.match(/^wbcb\(([\s\S]*)\)\s*;?$/);
      if (!m) throw new Error('news bad wrapper');
      const j = JSON.parse(m[1]);
      const list = j && j.result && j.result.cmsArticleWebOld;
      if (!Array.isArray(list)) throw new Error('news empty');
      out.newsOk = true;
      out.news = list.slice(0, 6).map(n => ({
        title: String(n.title || '').replace(/<[^>]+>/g, ''),
        content: String(n.content || '').replace(/<[^>]+>/g, '').slice(0, 140),
        media: n.mediaName || '', date: String(n.date || '').slice(0, 10),
        url: String(n.url || '').replace(/^http:/, 'https:')
      })).filter(n => n.title && n.url);
    })().catch(e => console.warn('[全网新闻获取失败]', e.message)));
    await Promise.allSettled(jobs);
    return out;
  },

  /* ---- 技术指标纯 JS 计算（输入为东财真实K线，不引入任何外部库） ---- */
  calcTech(klines) {
    const bars = klines.map(s => { const a = s.split(','); return { d: a[0], o: +a[1], c: +a[2], h: +a[3], l: +a[4], v: +a[5] }; })
      .filter(b => Number.isFinite(b.c) && Number.isFinite(b.h) && Number.isFinite(b.l));
    if (bars.length < 30) return null;
    const closes = bars.map(b => b.c), highs = bars.map(b => b.h), lows = bars.map(b => b.l), vols = bars.map(b => b.v);
    const i = closes.length - 1;
    const ma = n => closes.length >= n ? +(closes.slice(-n).reduce((s, x) => s + x, 0) / n).toFixed(2) : null;
    const ema = (arr, n) => { const k = 2 / (n + 1); const out = [arr[0]]; for (let j = 1; j < arr.length; j++) out.push(arr[j] * k + out[j - 1] * (1 - k)); return out; };
    // MACD(12,26,9)
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const dif = closes.map((_, j) => e12[j] - e26[j]);
    const dea = ema(dif, 9);
    const hist = dif.map((d, j) => (d - dea[j]) * 2);
    // KDJ(9,3,3)
    let K = 50, D = 50;
    for (let j = 0; j < closes.length; j++) {
      const st = Math.max(0, j - 8);
      const hh = Math.max(...highs.slice(st, j + 1)), ll = Math.min(...lows.slice(st, j + 1));
      const rsv = hh > ll ? (closes[j] - ll) / (hh - ll) * 100 : 50;
      K = 2 / 3 * K + 1 / 3 * rsv; D = 2 / 3 * D + 1 / 3 * K;
    }
    const J = 3 * K - 2 * D;
    // RSI(6)
    let g = 0, l = 0;
    for (let j = closes.length - 6; j <= i; j++) { const ch = closes[j] - closes[j - 1]; if (ch > 0) g += ch; else l -= ch; }
    const rsi6 = l === 0 ? 100 : +(100 - 100 / (1 + g / l)).toFixed(1);
    // 量比：今日量 / 前 5 日均量
    const prev5 = vols.slice(-6, -1);
    const volAvg5 = prev5.length ? prev5.reduce((s, x) => s + x, 0) / prev5.length : 0;
    const volRatio = volAvg5 > 0 ? +(vols[i] / volAvg5).toFixed(2) : null;
    // 52 周区间（样本内）与近一年涨幅
    const hi52 = Math.max(...highs), lo52 = Math.min(...lows);
    const pos52 = hi52 > lo52 ? Math.round((closes[i] - lo52) / (hi52 - lo52) * 100) : null;
    const yearChg = +((closes[i] / closes[0] - 1) * 100).toFixed(1);
    // 均线形态
    const ma20 = ma(20), ma60 = ma(60), ma120 = ma(120), ma250 = ma(250);
    const bull = ma20 != null && ma60 != null && ma120 != null && ma20 > ma60 && ma60 > ma120;
    return {
      date: bars[i].d, close: closes[i], n: bars.length,
      ma20, ma60, ma120, ma250, bull,
      dif: +dif[i].toFixed(3), dea: +dea[i].toFixed(3),
      hist: +hist[i].toFixed(3), histPrev: +hist[i - 1].toFixed(3),
      k: +K.toFixed(1), d: +D.toFixed(1), j: +J.toFixed(1), rsi6,
      vol: vols[i], volRatio, hi52, lo52, pos52, yearChg
    };
  },

  /* 周线趋势（MA10W / MA30W） */
  calcWeekly(klines) {
    const bars = klines.map(s => { const a = s.split(','); return { d: a[0], c: +a[2] }; }).filter(b => Number.isFinite(b.c));
    if (bars.length < 35) return null;
    const closes = bars.map(b => b.c);
    const ma = n => +(closes.slice(-n).reduce((s, x) => s + x, 0) / n).toFixed(2);
    const ma10w = ma(10), ma30w = ma(30);
    return { date: bars[bars.length - 1].d, close: closes[closes.length - 1], ma10w, ma30w, up: ma10w > ma30w };
  },

  /* ---- 深度体检数据：日K/周K（腾讯 ifzq，东财push2his对浏览器请求限流故改用腾讯）+ 估值250日序列（PE/PB历史百分位）+ 股东户数 ---- */
  async deepFetch(r) {
    const out = { tech: null, techW: null, val: null, holder: null };
    const nc = (Market.normalizeCode && r.code) ? Market.normalizeCode(r.code) : '';
    const code6 = (r.code || '').replace(/^(sh|sz|bj)/i, '');
    if (!code6 || !nc) return out;
    const secu = code6 + (nc.indexOf('sh') === 0 ? '.SH' : (nc.indexOf('bj') === 0 ? '.BJ' : '.SZ'));
    // 腾讯K线：返回 [date,open,close,high,low,volume,...]，统一转逗号串供 calcTech 使用
    const kl = async (period, cnt) => {
      const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + nc + ',' + period + ',,,' + cnt + ',qfq&_=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json();
      const d = j && j.data && j.data[nc];
      const arr = d && (d['qfq' + period] || d[period]);
      return (arr || []).map(a => a.slice(0, 6).join(','));
    };
    const jobs = [
      kl('day', 320).then(l => { out.tech = this.calcTech(l); })
        .catch(e => console.warn('[日K获取失败]', e.message)),
      kl('week', 200).then(l => { out.techW = this.calcWeekly(l); })
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
  },

  /* 单只个股：真实数据体检 + 综合研判 + 七维体检（仅填空，不覆盖用户已写内容） */
  async scan(id) {
    const rows = Store.rows('stock_logic', []);
    const r = rows.find(x => x._id === id);
    if (!r) { UI.toast('未找到该股'); return; }
    if (!r.name && !r.code) { UI.toast('请先填写个股名称或代码'); return; }
    UI.toast(`正在体检「${r.name || r.code}」：涨停池 / 板块榜 / 龙虎榜 / 快讯 / 行情…`);
    const mkt = await this.ensureMkt(false);
    const { br, lad, sec, lhb } = mkt;
    const code6 = (r.code || '').replace(/^(sh|sz|bj)/i, '');
    const name = r.name || '';

    // 实时价格（腾讯）
    let px = null;
    if (r.code) { const m = await Market.priceOf([r.code]); px = m[r.code] || null; if (px && !r.name && px.name) r.name = px.name; }

    // 涨停池命中（东财）
    const zt = (lad && lad.ok && lad.items) ? lad.items.find(i => i.code === code6 || (name && i.name === name)) : null;
    let themeCnt = 0, themeMax = 0;
    if (zt && zt.hybk) lad.items.forEach(i => { if (i.hybk === zt.hybk) { themeCnt++; themeMax = Math.max(themeMax, i.lbc || 1); } });

    // 行业榜命中（按个股所属题材 或 名称匹配领涨股）
    let secUpHit = null, secDnHit = null;
    if (sec && sec.ok) {
      const matchS = s => (zt && zt.hybk && (s.name === zt.hybk || s.name.indexOf(zt.hybk) >= 0 || zt.hybk.indexOf(s.name) >= 0))
        || (name && s.leader === name);
      secUpHit = (sec.up || []).find(matchS) || null;
      secDnHit = (sec.down || []).find(matchS) || null;
    }

    // 龙虎榜命中
    const lb = (lhb && lhb.ok && lhb.items) ? lhb.items.find(i => i.code === code6 || (name && i.name === name)) : null;

    // 真实快讯提及（标题/摘要含个股名）
    const nd = News.data ? News.data() : null;
    const hits = name && nd && nd.items
      ? nd.items.filter(i => (i.title + ' ' + (i.summary || '')).indexOf(name) >= 0).slice(0, 5)
          .map(i => ({ title: i.title, url: i.url, time: i.time, date: i.date }))
      : [];

    // 全网域检索：全网新闻 + 东财财报 / 业绩预告（真实数据，可核对）
    // 深度体检：日K/周K + 估值250日序列 + 股东户数（并行拉取）
    const [web, deep] = await Promise.all([this.webFetch(r), this.deepFetch(r)]);
    // 新闻摘要中直接描述该股的内容 → 提炼为「上涨核心逻辑」证据
    const logicHits = web.news.filter(n => name && n.content.indexOf(name) >= 0);

    // 大盘情绪阶段（与结构化复盘同规则）
    let stage = null;
    if (br && br.ok && Number.isFinite(br.limitUp) && Number.isFinite(br.sealRate) && Number.isFinite(br.height)) {
      const lu = br.limitUp, sr = br.sealRate, hg = br.height, ld = br.limitDown, bk = br.broken;
      if ((lu < 30 && sr < 55) || (Number.isFinite(ld) && ld >= 30)) stage = '冰点';
      else if (lu >= 80 && sr >= 70 && hg >= 5) stage = '高潮';
      else if (lu >= 50 && sr >= 60 && hg >= 3) stage = '发酵';
      else stage = '修复';
      if (stage !== '冰点' && Number.isFinite(bk) && bk >= lu) stage = '退潮';
    }

    /* ---- 四段式底稿（全部由上面真实数据组装；无数据则明示无法验证） ---- */
    const S = (v, u) => (v != null ? v + u : '—');
    const sign = v => UI.sign(v, 2, '%');
    const D = [];
    if (px && px.price != null) D.push(`现价 ${px.price.toFixed(2)}（${sign(px.chgPct)}，腾讯实时）`);
    if (zt) D.push(`今日涨停${zt.lbc > 1 ? '，' + zt.lbc + ' 连板' : '（首板）'}，所属题材「${zt.hybk || '未分类'}」（题材内涨停 ${themeCnt} 只${themeMax > (zt.lbc || 1) ? '，题材最高 ' + themeMax + ' 板' : ''}）${zt.fund != null ? '，涨停资金体量约 ' + zt.fund + ' 亿' : ''}${zt.fbt ? '，首次封板 ' + zt.fbt : ''}${zt.zbc ? '，盘中炸板 ' + zt.zbc + ' 次' : ''}（东财涨停池）`);
    if (secUpHit) D.push(`所属板块「${secUpHit.name}」涨 ${sign(secUpHit.chgPct)} 居涨幅榜${Number.isFinite(secUpHit.netInflow) ? '，主力净' + (secUpHit.netInflow >= 0 ? '流入' : '流出') + ' ' + Math.abs(secUpHit.netInflow) + ' 亿' : ''}${secUpHit.leader ? '，领涨股 ' + secUpHit.leader : ''}（东财行业榜）`);
    if (secDnHit) D.push(`所属板块「${secDnHit.name}」跌 ${sign(secDnHit.chgPct)} 居跌幅榜（东财行业榜）——个股上涨与板块背离，需确认是否独立逻辑`);
    if (lb) D.push(`龙虎榜净${lb.net >= 0 ? '买入' : '卖出'} ${Math.abs(lb.net)} 亿${lb.reason ? '（' + lb.reason + '）' : ''}${lb.inst ? '，' + lb.inst : ''}（东财龙虎榜 ${lhb.date}）`);
    if (hits.length) D.push(`今日真实快讯提及 ${hits.length} 条（见下方链接，可点标题核对原文）`);
    if (logicHits.length) D.push(`全网新闻直击本轮上涨核心逻辑：${logicHits.slice(0, 2).map(n => `《${n.title}》（${n.media} ${n.date}）——「${n.content}」`).join('；')}`);
    else if (web.news.length) D.push(`全网新闻检索到相关报道 ${web.news.length} 条（见下方链接，含媒体与日期，可核对原文）`);
    if (web.fund) D.push(`最新财报（${web.fund.datatype || web.fund.qdate}）：营收 ${web.fund.rev} 亿（同比 ${web.fund.revYoy > 0 ? '+' : ''}${web.fund.revYoy}%），归母净利 ${web.fund.np} 亿（同比 ${web.fund.npYoy > 0 ? '+' : ''}${web.fund.npYoy}%）（东财财报）`);
    if (web.predict) D.push(`业绩预告（${web.predict.notice} 披露）：预计净利 ${web.predict.lo}~${web.predict.hi} 亿，同比 ${web.predict.incLo}%~${web.predict.incHi}%（东财业绩预告）`);
    if (!D.length) D.push('实时数据中未检索到该股的涨停 / 板块 / 龙虎榜 / 快讯催化记录：今日异动的驱动因素暂无法用盘面数据验证，请人工补充公告或新闻依据后再定逻辑。');

    /* ---- 大盘视角：机会 / 风险提示 + 次日交易建议（数据推演纪律，非投资指导） ---- */
    let mainTheme = '', mainCnt = 0;
    if (lad && lad.ok && lad.items) {
      const tm = {};
      lad.items.forEach(i => { const k = i.hybk || '未分类'; tm[k] = (tm[k] || 0) + 1; });
      Object.keys(tm).forEach(k => { if (tm[k] > mainCnt) { mainCnt = tm[k]; mainTheme = k; } });
    }
    const isMain = !!(zt && mainTheme && (zt.hybk === mainTheme));
    const advOpp = [], advRisk = [];
    if (isMain) advOpp.push(`所属题材「${zt.hybk}」即当日涨停主线（${mainCnt} 只涨停），个股处于主线之内，资金关注度最高`);
    else if (zt && mainTheme) advOpp.push(`个股在涨停池但非当日主线（主线为「${mainTheme}」${mainCnt} 只涨停），属支线轮动，持续性须次日确认`);
    if (secUpHit) advOpp.push(`板块「${secUpHit.name}」居涨幅榜且主力净${secUpHit.netInflow >= 0 ? '流入' : '流出'} ${Math.abs(secUpHit.netInflow)} 亿，板块资金共振加持`);
    if (stage === '发酵' || stage === '修复') advOpp.push(`大盘情绪处于「${stage}」阶段，属于顺势操作窗口`);
    if (!advOpp.length) advOpp.push('当日盘面未给出明确的机会信号，机会主要依赖个股自身逻辑与消息面');
    if (stage === '高潮') advRisk.push('大盘情绪处于「高潮」阶段，次日历来多分化，高位股切忌再追一致性');
    if (stage === '退潮' || stage === '冰点') advRisk.push(`大盘情绪处于「${stage}」阶段，以防守为主，个股机会让位于仓位控制`);
    if (zt && zt.lbc >= 4) advRisk.push(`个股已 ${zt.lbc} 连板，高位分歧随时可能到来`);
    if (web.predict && web.predict.incHi != null && web.predict.incHi < 0) advRisk.push(`业绩预告预减（同比 ${web.predict.incLo}%~${web.predict.incHi}%），基本面无法托底时情绪退潮杀伤更大`);
    else if (web.fund && web.fund.npYoy != null && web.fund.npYoy < 0) advRisk.push(`最新财报归母净利同比 ${web.fund.npYoy}%，业绩下行中的题材股在退潮期风险加倍`);
    if (!advRisk.length) advRisk.push('大盘与个股暂未叠加出额外风险，按个股失效信号执行即可');
    let plan;
    if (isMain && (stage === '发酵' || stage === '修复')) plan = `条件—应对：①若次日竞价高开有溢价、题材「${zt.hybk}」前排封单强势、板块继续居涨幅榜 → 持股待涨，不追加高位仓位；②若平开分歧但题材涨停家数维持、个股换手承接有力 → 持有观察，破分时均线减半；③若低开无溢价 / 龙头炸板 / 板块转出涨幅榜 → 按失效信号无条件减仓离场。`;
    else if (zt) plan = `条件—应对：①若次日题材扩容（涨停家数增加）且个股竞价有溢价 → 可持有，不追高加仓；②若个股低开或板块走弱 → 优先兑现，支线轮动股不做T不留恋；③任何情况下触发上方失效信号 → 先走为上。`;
    else if (secUpHit) plan = `条件—应对：①若板块「${secUpHit.name}」次日继续放量上行、领涨股 ${secUpHit.leader || '—'} 维持强势 → 个股可跟随持有；②若板块冲高回落或主力净流出 → 同步减仓；③个股始终弱于板块 → 换强不换弱，或离场等回踩确认。`;
    else plan = '条件—应对：①次日出现明确催化（公告 / 板块异动 / 放量突破）且大盘不退潮 → 小仓试错；②无催化且量能萎缩 → 观望不加仓；③触发失效信号（利空公告 / 破止损位 / 大盘退潮）→ 无条件执行纪律。';

    /* ---- 📉 跌破建议：具体价位全部来自腾讯实时行情（收盘价/最低/昨收/今开），无行情则如实标注 ---- */
    const P = (px && px.price != null) ? px : null;
    const breakRules = [];
    if (P) {
      const closeP = +P.price.toFixed(2);
      const lowP = P.low != null ? +P.low.toFixed(2) : null;
      const prevP = P.prevClose != null ? +P.prevClose.toFixed(2) : null;
      if (zt) {
        breakRules.push(`次日盘中跌破今日涨停价（收盘价）${closeP} 元且 30 分钟无法收回 → 至少减仓一半（开板不回封 = 封板资金撤退）`);
        if (lowP && lowP < closeP) breakRules.push(`跌破今日最低价 ${lowP} 元 → 无条件清仓（连板股破今日启动位 = 承接资金放弃）`);
        if (stage === '退潮' || stage === '冰点') breakRules.push(`大盘「${stage}」期加码纪律：竞价低开超 2%（即低于 ${(closeP * 0.98).toFixed(2)} 元）直接竞价离场，不等盘中反抽`);
      } else {
        if (lowP) breakRules.push(`跌破今日最低价 ${lowP} 元 → 减仓一半`);
        if (prevP && P.chgPct != null && P.chgPct < 0) breakRules.push(`今日已收跌，次日再破昨收 ${prevP} 元（连续两日走弱）→ 无条件离场`);
        else if (prevP) breakRules.push(`跌破昨收 ${prevP} 元且 30 分钟收不回 → 离场（转弱确认）`);
        if (secUpHit) breakRules.push(`板块「${secUpHit.name}」转入跌幅榜 → 不等个股破位，先行减半（板块支撑消失）`);
        if (stage === '退潮' || stage === '冰点') breakRules.push(`大盘「${stage}」期：个股任何放量下杀直接离场，不格局`);
      }
    } else {
      breakRules.push('实时行情未获取（请确认股票代码填写正确），无法计算具体跌破价位——请手工设定止损位（如成本价下方 5%~7%）写入「风险点」，触发即执行');
    }

    /* ---- 💼 持仓建议：连板高度 × 主线地位 × 板块 × 大盘阶段 × 基本面 交叉得出 ---- */
    const holdAdvice = [];
    if (zt && isMain && (stage === '发酵' || stage === '修复')) {
      holdAdvice.push(`已有持仓 → 按跌破规则持股待涨，不追加仓位（${zt.lbc} 连板高位，追高性价比差）`);
      holdAdvice.push('无持仓 → 次日不追高，等分歧回踩或题材二波确认再评估');
    } else if (zt) {
      holdAdvice.push('已有持仓 → 次日竞价有溢价即分批兑现为主，支线轮动股不留恋');
      holdAdvice.push('无持仓 → 非主线涨停股不建议新开仓');
    } else if (secUpHit) {
      holdAdvice.push(`已有持仓 → 板块「${secUpHit.name}」强势则持有，板块冲高回落同步减半`);
      holdAdvice.push(`无持仓 → 个股当前弱于板块，等放量突破今日最高${P && P.high != null ? ' ' + P.high.toFixed(2) + ' 元' : '价'}再考虑小仓`);
    } else {
      holdAdvice.push('已有持仓 → 无盘面资金验证（未涨停 / 板块未上榜），严格按跌破位执行，大盘转弱先降仓');
      holdAdvice.push('无持仓 → 观望为主，等催化落地或放量异动再评估，不提前埋伏');
    }
    if (web.predict && web.predict.incHi != null && web.predict.incHi < 0) holdAdvice.push('业绩预告预减 → 仓位上限从严，不宜重仓博弈');
    else if (web.fund && web.fund.npYoy != null && web.fund.npYoy < 0) holdAdvice.push('财报净利同比下滑 → 缺乏业绩托底，仓位从严');
    if (stage === '退潮' || stage === '冰点') holdAdvice.push(`大盘「${stage}」期总仓位从严：持股以兑现为主，新开仓一律暂缓`);
    else if (stage === '高潮') holdAdvice.push('大盘「高潮」期次日多分化：持股不追加，高潮次日只卖不买');

    /* ================= 全面体检 · 七维框架 =================
       宏观→行业→基本面→估值→财务→筹码→技术面；能自动验证的维度用真实数据填充，
       无公开接口的维度如实标注并给出人工填写引导——不编造任何数字 */
    const dim = {};
    // ① 宏观环境：流动性（两市成交额真实数据）+ 政策快讯（真实新闻匹配）+ 宏观指标人工
    let mktAmount = null;
    try { const emo = (V.sentiment && V.sentiment.loadEmo) ? V.sentiment.loadEmo() : null; if (emo && Number.isFinite(emo.amount)) mktAmount = emo.amount; } catch (e) {}
    if (mktAmount == null) {
      try {
        const iq = await Market.quotes(['sh', 'sz']);
        if (iq && iq.sh && iq.sz && iq.sh.amount != null && iq.sz.amount != null) mktAmount = +((iq.sh.amount + iq.sz.amount) / 1e8).toFixed(2);
      } catch (e) {}
    }
    const polHits = (nd && nd.items ? nd.items : []).filter(x => /央行|国务院|财政部|发改委|证监会|国常会|政治局|降准|降息|LPR|MLF/i.test(x.title)).slice(0, 3);
    dim.anMacro = [
      mktAmount != null
        ? `流动性（真实数据）：今日两市成交额约 ${mktAmount} 万亿${stage ? '，大盘情绪阶段「' + stage + '」' : ''}——量能是行情的燃料，成交额持续萎缩时任何题材逻辑都要降权`
        : '流动性：两市成交额暂未获取（可先到「大盘总览」页刷新后再体检，或人工填写）',
      polHits.length
        ? `政策面（真实快讯匹配 ${polHits.length} 条）：${polHits.map(x => `《${x.title}》(${x.date || ''})`).join('；')}——请自行判断与该股行业的相关性`
        : '政策面：今日快讯流中未匹配到「央行/国务院/财政部/证监会/降准降息」类条目（如实标注，未编造）',
      '宏观经济（GDP / CPI / PMI / 利率走向）：无浏览器可达的权威直连接口，请人工补充最新读数与方向——宏观收紧期，高估值小盘股先杀估值'
    ].join('；\n');
    // ② 行业分析：板块榜真实数据 + 生命周期/空间/格局人工
    const indBits = [];
    if (secUpHit) indBits.push(`行业景气（真实数据）：所属板块「${secUpHit.name}」今日涨 ${sign(secUpHit.chgPct)} 居涨幅榜${Number.isFinite(secUpHit.netInflow) ? '，主力净' + (secUpHit.netInflow >= 0 ? '流入' : '流出') + ' ' + Math.abs(secUpHit.netInflow) + ' 亿' : ''}（东财行业榜）`);
    else if (secDnHit) indBits.push(`行业景气（真实数据）：所属板块「${secDnHit.name}」今日跌 ${sign(secDnHit.chgPct)} 居跌幅榜（东财行业榜）——行业逆风期，个股逻辑需更苛刻检验`);
    else indBits.push('行业景气：所属板块今日未登行业涨/跌幅榜前列（东财行业榜）——行业中性，无板块级资金信号');
    if (web.fund && web.fund.board) indBits.push(`东财行业归类：${web.fund.board}`);
    indBits.push('行业生命周期 / 空间 / 竞争格局：定性判断无公开接口可自动验证，请人工填写——①生命周期：导入/成长/成熟/衰退，成长期给估值溢价，衰退期讲故事都是陷阱；②行业空间：天花板多大、渗透率到哪；③竞争格局：CR 集中度、该股是龙头/跟风/补涨——买股买龙头，跟风股退潮期跌幅最大');
    dim.anInd = indBits.join('；\n');
    // ③ 基本面：ROE/毛利/增速真实数据 + 商业模式/护城河/管理层人工
    const fundBits = [];
    if (web.fund) fundBits.push(`盈利能力（东财财报真实数据，${web.fund.datatype || web.fund.qdate}）：ROE ${web.fund.roe}%，毛利率 ${web.fund.gross}%，营收同比 ${web.fund.revYoy > 0 ? '+' : ''}${web.fund.revYoy}%，归母净利同比 ${web.fund.npYoy > 0 ? '+' : ''}${web.fund.npYoy}%——ROE 反映用股东钱赚钱的效率，持续 >15% 为优秀`);
    else fundBits.push('盈利能力：财报数据未检索到（次新股或接口无记录，如实标注），请人工查阅最新财报填写 ROE / 毛利率 / 营收与净利增速');
    if (web.predict) fundBits.push(`成长性硬证据（业绩预告 ${web.predict.notice} 披露）：预计净利 ${web.predict.lo}~${web.predict.hi} 亿元，同比 ${web.predict.incLo}%~${web.predict.incHi}%`);
    fundBits.push('商业模式 / 护城河 / 管理层：无接口可验证，请人工填写——①靠什么赚钱、客户是谁、复购如何；②护城河：技术专利/成本/品牌/转换成本，没有护城河的高增长容易被对手快速抹平；③管理层：承诺兑现记录、有无减持/质押/处罚前科（可对照上方全网新闻）');
    dim.anFund = fundBits.join('；\n');
    // ④ 估值水平：PE/PB/PS/PCF/PEG/市值 + 近一年历史百分位（250日真实序列计算）
    if (deep.val) {
      const v = deep.val;
      dim.anVal = `真实估值（东财 ${v.date} 收盘）：PE(TTM) ${v.pe != null ? v.pe : '—（亏损股不适用）'}${v.pePct != null ? '，近一年 ' + v.pePct + '% 分位' : ''}；PB(MRQ) ${v.pb != null ? v.pb : '—'}${v.pbPct != null ? '，近一年 ' + v.pbPct + '% 分位' : ''}；PS(TTM) ${v.ps != null ? v.ps : '—'}；PCF ${v.pcf != null ? v.pcf : '—'}；PEG ${v.peg != null ? v.peg : '—'}；总市值 ${v.mcap != null ? v.mcap + ' 亿' : '—'}（百分位基于近一年 ${v.days} 个交易日真实序列计算）。\n判读纪律：百分位 >80% = 历史极高位，「好公司坏价格」也要警惕；<20% = 历史低位，需确认是错杀还是基本面恶化；高百分位 + 股东户数激增 + 毛利率下滑三件套齐现 = 按主力派发对待。`;
    } else dim.anVal = '估值数据未获取（次新股或接口无记录，如实标注）。请人工查询 PE(TTM)/PB 及近5~10年历史百分位后填写——好公司也要有好价格，百分位 >80% 时追高性价比极差。';
    // ⑤ 财务健康：接口被拦如实标注 + ROE/毛利辅助 + 人工引导
    const finBits = [];
    if (web.fund) finBits.push(`辅助信号（东财财报真实数据）：ROE ${web.fund.roe}%，毛利率 ${web.fund.gross}%${web.fund.eps != null ? '，EPS ' + web.fund.eps + ' 元' : ''}（${web.fund.datatype || web.fund.qdate}）；毛利率多期趋势请对照历期财报人工核对——近5期持续下滑是明确减分信号`);
    finBits.push('资产负债率 / 自由现金流：东财F10财务接口对浏览器请求有拦截（实测不可达，如实标注），本工具不臆造这两个数字。请人工查阅最新财报填写：①资产负债率（>60% 警惕债务风险，金融地产除外）；②经营现金流净额是否持续为正且 ≥ 净利润（赚的是「活钱」还是纸面利润）；③货币资金能否覆盖短期借款');
    dim.anFin = finBits.join('；\n');
    // ⑥ 股东与机构动向：股东户数真实披露 + 北向停披说明
    const holdBits = [];
    if (deep.holder) {
      const h = deep.holder;
      holdBits.push(`股东户数（东财真实披露）：${h.date} 为 ${h.num != null ? h.num.toLocaleString() : '—'} 户，较 ${h.prevDate}（${h.prev != null ? h.prev.toLocaleString() : '—'} 户）${h.ratio != null ? (h.ratio > 0 ? '增加 ' + h.ratio + '%' : '减少 ' + Math.abs(h.ratio) + '%') : '变化未知'}——${h.ratio != null ? (h.ratio > 10 ? '户数短期激增，典型主力派发特征，高度警惕' : h.ratio > 0 ? '户数增加，筹码趋于分散，偏空' : h.ratio < -10 ? '户数大幅减少，筹码快速集中，偏多' : '户数减少，筹码趋于集中，偏多') : '请结合多期判断'}`);
    } else holdBits.push('股东户数：未检索到披露记录（如实标注），请人工查询「股东人数」填写最新两期变化——户数短期激增 = 主力派发风险');
    holdBits.push('北向资金：2024年8月起交易所已停止披露北向资金单日持仓/流向（真实规则变化），该维度无法跟踪，本工具不提供也不臆测');
    dim.anHolder = holdBits.join('；\n');
    // ⑦ 技术面：东财真实日K/周K 计算的均线/MACD/KDJ/RSI/量价/区间位置
    if (deep.tech) {
      const t = deep.tech;
      const macdState = t.dif > 0 && t.dea > 0 ? '0轴上方' : (t.dif < 0 && t.dea < 0 ? '0轴下方' : '0轴附近');
      const histState = t.hist > 0 ? (t.hist < t.histPrev ? '红柱开始缩短（多头动能衰减，短线卖点警戒）' : '红柱放大（多头动能增强）') : (t.hist > t.histPrev ? '绿柱开始缩短（空头动能衰减，短线买点观察）' : '绿柱放大（空头动能增强）');
      const kdjState = t.j > 100 ? 'J>100 超买区，追高谨慎' : t.j < 0 ? 'J<0 超卖区，关注反弹' : '中性区';
      const rsiState = t.rsi6 > 80 ? '超买' : t.rsi6 < 20 ? '超卖' : '中性';
      dim.anTech = [
        `趋势（腾讯真实日K ${t.n} 根，截至 ${t.date}）：收盘 ${t.close} 元；MA20 ${t.ma20 || '—'} / MA60 ${t.ma60 || '—'} / MA120 ${t.ma120 || '—'} / MA250 ${t.ma250 || '—'}，${t.bull ? '均线多头排列，中长期趋势向上' : '非标准多头排列，对照均线位置人工判断强弱'}`,
        `周线（看长做短）：${deep.techW ? 'MA10W ' + deep.techW.ma10w + ' / MA30W ' + deep.techW.ma30w + '，中期趋势' + (deep.techW.up ? '向上' : '向下') + '（截至 ' + deep.techW.date + '）' : '周线数据不足，无法判断中期趋势'}`,
        `MACD：DIF ${t.dif} / DEA ${t.dea}（${macdState}），${histState}`,
        `KDJ：K ${t.k} / D ${t.d} / J ${t.j}（${kdjState}）；RSI(6) ${t.rsi6}（${rsiState}）`,
        `量价：最新成交量 ${t.vol} 手，为前五日均量 ${t.volRatio != null ? t.volRatio + ' 倍' : '—'}（${t.volRatio != null ? (t.volRatio >= 2 ? '显著放量——关键位放量突破为强，高位放量滞涨为弱' : t.volRatio >= 0.8 ? '量能正常' : '明显缩量——回调缩量抛压不大，上涨缩量动能不足') : '无法判断'}）`,
        `位置：近 ${t.n} 个交易日累计 ${t.yearChg > 0 ? '+' : ''}${t.yearChg}%，当前处于区间 [${t.lo52}, ${t.hi52}] 的 ${t.pos52 != null ? t.pos52 + '%' : '—'} 分位${t.pos52 != null && t.pos52 > 90 ? '——接近区间顶部，追高风险大' : t.pos52 != null && t.pos52 < 10 ? '——接近区间底部' : ''}`
      ].join('；\n');
    } else dim.anTech = 'K线数据未获取（请确认代码正确或稍后再试），无法计算技术指标。请人工对照行情软件填写：多周期趋势（月/周/日）、量价关系、MACD/KDJ/RSI 读数。';

    /* ================= 🧠 综合研判 =================
       把本次获取的全部真实数据逐条转成「多空信号」（每条标注来源），
       加权评分 → 评级 → 结论 → 建议方向 → 明日盯盘要点。不写套话，每条都有据可查 */
    const bull = [], bear = [];
    const B = (txt, w) => bull.push({ txt, w: w || 1 });
    const W = (txt, w) => bear.push({ txt, w: w || 1 });
    // —— 盘面信号 ——
    if (zt) B(`今日涨停${zt.lbc > 1 ? ' ' + zt.lbc + ' 连板' : '（首板）'}，题材「${zt.hybk || '未分类'}」内涨停 ${themeCnt} 只——短线资金聚焦（东财涨停池）`, 2);
    if (zt && isMain) B(`题材「${zt.hybk}」即当日市场主线（主线 ${mainCnt} 只涨停居首）——主线股享受最高关注度与流动性溢价（涨停池统计）`, 2);
    else if (zt && mainTheme) W(`涨停但非当日主线（主线为「${mainTheme}」${mainCnt} 只）——支线轮动持续性须次日确认`, 1);
    if (zt && zt.fbt && zt.fbt <= '09:35') B(`首次封板 ${zt.fbt}——早盘快速封板，攻击性强（东财涨停池）`, 1);
    if (zt && zt.zbc > 0) W(`盘中炸板 ${zt.zbc} 次——封板不牢，承接存疑（东财涨停池）`, 2);
    if (zt && zt.lbc >= 4) W(`已 ${zt.lbc} 连板处高位——分歧与「大面」风险随高度累积`, 2);
    if (secUpHit) B(`板块「${secUpHit.name}」涨 ${sign(secUpHit.chgPct)} 居涨幅榜，主力净流入 ${secUpHit.netInflow} 亿（东财行业榜）`, 2);
    if (secDnHit) W(`板块「${secDnHit.name}」跌 ${sign(secDnHit.chgPct)} 居跌幅榜——行业逆风（东财行业榜）`, 2);
    if (lb) { if (lb.net >= 0) B(`龙虎榜净买入 ${lb.net} 亿${lb.reason ? '（' + lb.reason + '）' : ''}（东财龙虎榜 ${lhb.date}）`, 1); else W(`龙虎榜净卖出 ${Math.abs(lb.net)} 亿——大资金兑现离场（东财龙虎榜 ${lhb.date}）`, 2); }
    if (hits.length) B(`今日快讯提及 ${hits.length} 条——消息面有实时催化（工作台快讯流）`, 1);
    if (logicHits.length) B(`全网新闻直接提及该股 ${logicHits.length} 条（如《${logicHits[0].title}》${logicHits[0].media} ${logicHits[0].date}，可点上方链接核对原文）——媒体聚焦强化人气`, 1);
    // —— 基本面信号 ——
    if (web.fund) {
      if (web.fund.npYoy != null && web.fund.npYoy >= 30) B(`归母净利同比 +${web.fund.npYoy}%（${web.fund.datatype || web.fund.qdate}，东财财报）——业绩高增长托底`, 2);
      else if (web.fund.npYoy != null && web.fund.npYoy < 0) W(`归母净利同比 ${web.fund.npYoy}%（${web.fund.datatype || web.fund.qdate}，东财财报）——基本面恶化，炒作缺业绩托底`, 2);
      if (web.fund.revYoy != null && web.fund.revYoy >= 20) B(`营收同比 +${web.fund.revYoy}%——收入端真实扩张（东财财报）`, 1);
      if (web.fund.roe != null && web.fund.roe >= 10) B(`ROE ${web.fund.roe}%——股东回报效率良好（东财财报）`, 1);
    }
    if (web.predict) {
      if (web.predict.incLo != null && web.predict.incLo > 0) B(`业绩预告预增：净利 ${web.predict.lo}~${web.predict.hi} 亿，同比 +${web.predict.incLo}%~+${web.predict.incHi}%（${web.predict.notice} 披露，报告期 ${web.predict.reportdate || '—'}）——业绩兑现可见`, 2);
      else if (web.predict.incHi != null && web.predict.incHi < 0) W(`业绩预告预减（同比 ${web.predict.incLo}%~${web.predict.incHi}%，报告期 ${web.predict.reportdate || '—'}）——业绩证伪风险（东财业绩预告）`, 2);
    }
    // —— 估值信号 ——
    if (deep.val) {
      const v = deep.val;
      if (v.pePct != null && v.pePct >= 80) W(`PE(TTM) ${v.pe} 处近一年 ${v.pePct}% 分位——估值历史极高位，透支未来业绩（东财 ${v.days} 日序列）`, 2);
      else if (v.pePct != null && v.pePct <= 20) B(`PE(TTM) ${v.pe} 处近一年 ${v.pePct}% 分位——估值历史低位（东财 ${v.days} 日序列）`, 1);
      if (v.pbPct != null && v.pbPct >= 80) W(`PB ${v.pb} 处近一年 ${v.pbPct}% 分位——资产端估值同样极高位`, 1);
    }
    // —— 筹码信号 ——
    if (deep.holder && deep.holder.ratio != null) {
      const h = deep.holder;
      if (h.ratio <= -10) B(`股东户数 ${h.date} 较上期减少 ${Math.abs(h.ratio)}%——筹码快速集中，主力收集特征（东财披露）`, 1);
      else if (h.ratio >= 10) W(`股东户数 ${h.date} 较上期激增 ${h.ratio}%——典型主力派发特征（东财披露）`, 2);
      else if (h.ratio > 0) W(`股东户数增加 ${h.ratio}%——筹码趋于分散（东财披露）`, 1);
      else B(`股东户数减少 ${Math.abs(h.ratio)}%——筹码趋于集中（东财披露）`, 1);
    }
    // —— 技术面信号 ——
    if (deep.tech) {
      const t = deep.tech;
      if (t.bull) B(`MA20(${t.ma20}) > MA60(${t.ma60}) > MA120(${t.ma120})——均线多头排列，中长期趋势向上（腾讯日K）`, 2);
      if (t.ma20 != null && t.close < t.ma20) W(`收盘价 ${t.close} 跌破 MA20(${t.ma20})——短线趋势转弱（腾讯日K）`, 1);
      if (deep.techW && deep.techW.up) B(`周线 MA10W(${deep.techW.ma10w}) > MA30W(${deep.techW.ma30w})——中期趋势向上，看长做短有底（腾讯周K）`, 1);
      else if (deep.techW && !deep.techW.up) W(`周线 MA10W < MA30W——中期趋势向下，反弹持续性存疑（腾讯周K）`, 1);
      if (t.j > 100) W(`KDJ-J 值 ${t.j} > 100——超买区，追高谨慎`, 1);
      if (t.rsi6 > 80) W(`RSI(6) ${t.rsi6} > 80——短线超买`, 1);
      if (t.rsi6 < 20) B(`RSI(6) ${t.rsi6} < 20——短线超卖，关注反弹`, 1);
      if (t.hist > 0 && t.hist < t.histPrev) W(`MACD 红柱开始缩短——多头动能衰减`, 1);
      if (t.hist < 0 && t.hist > t.histPrev) B(`MACD 绿柱开始缩短——空头动能衰减`, 1);
      if (t.volRatio != null && t.volRatio >= 2 && px && px.chgPct > 3) B(`量比 ${t.volRatio} 倍放量上涨——增量资金真实进场`, 1);
      if (t.volRatio != null && t.volRatio < 0.8 && px && px.chgPct > 5) W(`大涨但量比仅 ${t.volRatio}——缩量上涨动能存疑（若为一字板则属正常）`, 1);
      if (t.pos52 != null && t.pos52 >= 90) W(`处 52 周区间 ${t.pos52}% 分位——接近一年顶部区域`, 1);
      if (t.yearChg != null && t.yearChg >= 100) W(`近一年已涨 ${t.yearChg}%——累计涨幅巨大，获利盘丰厚`, 1);
    }
    // —— 大盘信号 ——
    if (stage === '发酵' || stage === '修复') B(`大盘情绪「${stage}」——顺势操作窗口（情绪周期）`, 1);
    if (stage === '高潮') W(`大盘情绪「高潮」——次日历来多分化，一致性后易接分歧`, 2);
    if (stage === '退潮' || stage === '冰点') W(`大盘情绪「${stage}」——亏钱效应环境，个股逻辑易被错杀`, 2);
    if (br && br.ok && Number.isFinite(br.sealRate) && br.sealRate < 60) W(`全市场封板率仅 ${br.sealRate}%——接力环境偏弱`, 1);

    const bullW = bull.reduce((s, x) => s + x.w, 0), bearW = bear.reduce((s, x) => s + x.w, 0);
    const net = bullW - bearW;
    bull.sort((a, b) => b.w - a.w); bear.sort((a, b) => b.w - a.w);
    let rating, ratingCls;
    if (net >= 8) { rating = '强势'; ratingCls = 'up'; }
    else if (net >= 4) { rating = '偏多'; ratingCls = 'up'; }
    else if (net >= -3) { rating = '多空博弈'; ratingCls = 'amber'; }
    else if (net >= -7) { rating = '偏空'; ratingCls = 'down'; }
    else { rating = '弱势'; ratingCls = 'down'; }
    const srcN = [px, zt, secUpHit || secDnHit, lb, hits.length, web.fund, web.predict, web.news.length, deep.tech, deep.val, deep.holder].filter(Boolean).length;
    const topB = bull.slice(0, 2).map(x => x.txt).join('；');
    const topW = bear.slice(0, 2).map(x => x.txt).join('；');
    const conclusion = `基于 ${srcN} 组真实数据交叉：多头信号 ${bull.length} 项（权重 ${bullW}）vs 空头信号 ${bear.length} 项（权重 ${bearW}），净评分 ${net > 0 ? '+' : ''}${net}，评级「${rating}」。`
      + (topB ? `核心支撑：${topB}。` : '当前无明确多头支撑。')
      + (topW ? `主要压制：${topW}。` : '当前无明显压制信号。');
    // 建议方向（战略定位；具体价位纪律见下方跌破/持仓建议）
    let direction;
    if (net >= 4 && zt && isMain) direction = '定位「主线强势股」：以持仓跟随为主，分歧日看承接强弱决定去留；不追高加仓，只做持有与分歧低吸（需大盘维持发酵/修复配合）';
    else if (net >= 4 && zt) direction = '定位「支线强势股」：以溢价兑现为主、不做T不留恋；除非题材次日扩容跻身主线，否则不加仓';
    else if (net >= 4 && secUpHit) direction = '定位「板块强支撑股」：板块资金在则持有，对照领涨股强度——持续弱于板块则换强或离场';
    else if (net >= 4 && (web.predict || web.fund)) direction = '定位「业绩驱动股」：按财报/预告兑现节奏持有，正式财报落地是下一个验证点，不及预期即降权';
    else if (net >= 4) direction = '定位「偏多结构股」：顺势持有，按跌破建议执行纪律，信号转弱即降仓';
    else if (net <= -4) direction = '定位「风险积聚股」：减仓/回避为主，任何反抽视为降仓机会；等待估值、筹码或情绪信号改善后再重新评估';
    else direction = '定位「观察股」：多空均衡，不预测只应对——等放量突破或破位信号出现再行动，当前不加仓不重仓';
    // 明日盯盘要点（可观测、带阈值、全部来自真实数据）
    const watch = [];
    if (zt) watch.push(`题材「${zt.hybk}」涨停家数（今日 ${themeCnt} 只）——次日锐减至一半以下 = 主线退潮`);
    if (secUpHit) watch.push(`板块「${secUpHit.name}」主力净流向（今日 +${secUpHit.netInflow} 亿）——转净流出 = 支撑消失`);
    if (zt && P) watch.push(`竞价溢价（今日收于 ${P.price.toFixed(2)} 元涨停价）——低开超 2% 或高开秒砸 = 弱`);
    if (deep.tech && deep.tech.volRatio != null) watch.push(`量能（今日量比 ${deep.tech.volRatio}）——高位放量滞涨 = 出货，缩量回调 = 良性`);
    if (deep.holder && deep.holder.ratio != null) watch.push(`股东户数后续披露（本期 ${deep.holder.ratio > 0 ? '+' : ''}${deep.holder.ratio}%）——由减转增 = 筹码松动`);
    if (web.predict) watch.push(`业绩兑现（预告净利 ${web.predict.lo}~${web.predict.hi} 亿）——正式财报低于下限 = 证伪`);
    watch.push(`大盘情绪（今日「${stage || '未知'}」）——炸板家数 ≥ 涨停家数 = 退潮，全部个股逻辑降权`);
    const analysis = { bull, bear, bullW, bearW, net, rating, ratingCls, conclusion, direction, watch, srcN };

    r._scan = {
      at: DT.stamp(), stage,
      price: px && px.price != null ? +px.price.toFixed(2) : null,
      chgPct: px && px.chgPct != null ? px.chgPct : null,
      zt: zt ? { lbc: zt.lbc, hybk: zt.hybk, fund: zt.fund, fbt: zt.fbt, zbc: zt.zbc, themeCnt, themeMax, date: lad.date } : null,
      secUp: secUpHit ? { name: secUpHit.name, chgPct: secUpHit.chgPct, netInflow: secUpHit.netInflow, leader: secUpHit.leader } : null,
      secDn: secDnHit ? { name: secDnHit.name, chgPct: secDnHit.chgPct } : null,
      lhb: lb ? { net: lb.net, reason: lb.reason || '', date: lhb.date } : null,
      news: hits,
      web: { news: web.news, newsOk: web.newsOk, fund: web.fund, predict: web.predict },
      deep: { tech: deep.tech, techW: deep.techW, val: deep.val, holder: deep.holder, mktAmount, polN: polHits.length },
      analysis,
      advice: { mainTheme, mainCnt, isMain, opp: advOpp, risk: advRisk, plan, breakRules, holdAdvice },
      srcs: [px && '腾讯行情', zt && '东财涨停池', (secUpHit || secDnHit) && '东财行业榜', lb && '东财龙虎榜', hits.length && '实时快讯', web.fund && '东财财报', web.predict && '东财业绩预告', web.news.length && '全网新闻', deep.tech && '腾讯日K', deep.techW && '腾讯周K', deep.val && '东财估值', deep.holder && '股东户数'].filter(Boolean)
    };

    // 仅填充空白字段，不覆盖用户已写内容
    if (!r.drive) r.drive = D.join('；\n');
    // 七维体检（同样只填空白）
    if (!r.anMacro) r.anMacro = dim.anMacro;
    if (!r.anInd) r.anInd = dim.anInd;
    if (!r.anFund) r.anFund = dim.anFund;
    if (!r.anVal) r.anVal = dim.anVal;
    if (!r.anFin) r.anFin = dim.anFin;
    if (!r.anHolder) r.anHolder = dim.anHolder;
    if (!r.anTech) r.anTech = dim.anTech;
    r.updated = DT.stamp();
    Store.set('stock_logic', rows);
    App.refresh();
    UI.toast(`「${r.name || r.code}」体检完成（已填字段未覆盖，清空后重扫可再生成）`);
  },

  async scanAll() {
    const rows = Store.rows('stock_logic', []);
    if (!rows.length) { UI.toast('请先添加个股'); return; }
    await this.ensureMkt(true); // 强制刷新一次全市场数据，逐股复用
    for (const r of rows) { await this.scan(r._id); }
  },

  stockCard(r) {
    const s = r._scan || {};
    const pct = s.chgPct != null ? UI.sign(s.chgPct, 2, '%') : '';
    const badge = (txt, cls) => `<span class="tag ${cls}">${txt}</span>`;
    const badges = [
      s.zt ? badge(`${s.zt.lbc}连板 · ${UI.esc(s.zt.hybk || '未分类')}`, 'tag-red') : '',
      s.secUp ? badge(`板块${UI.sign(s.secUp.chgPct, 2, '%')}`, 'tag-red') : '',
      s.secDn ? badge(`板块${UI.sign(s.secDn.chgPct, 2, '%')}`, 'tag-green') : '',
      s.lhb ? badge(`龙虎榜净${s.lhb.net >= 0 ? '买' : '卖'}${Math.abs(s.lhb.net)}亿`, s.lhb.net >= 0 ? 'tag-red' : 'tag-green') : '',
      s.stage ? badge(`大盘·${s.stage}`, s.stage === '退潮' || s.stage === '冰点' ? 'tag-green' : 'tag-amber') : ''
    ].filter(Boolean).join(' ');
    const ta = (f, ph) => `<textarea class="rich-area" data-tk="stock_logic" data-id="${r._id}" data-f="${f}" placeholder="${ph}">${UI.esc(r[f] || '')}</textarea>`;
    const chip = t => `<span class="sl-chip">${t}</span>`;
    const dimBlk = (icon, name, f, ph, chipsHtml) => `
      <div class="sl-dim">
        <div class="sl-sec-t">${icon} ${name}</div>
        ${chipsHtml ? `<div class="sl-chips">${chipsHtml}</div>` : ''}
        ${ta(f, ph)}
      </div>`;
    const dp = s.deep || {};
    return `
      <div class="card"><div class="card-body">
        <div class="sl-head">
          <b style="font-size:15px">${UI.esc(r.name || '未命名')}</b>
          <span class="sub">${UI.esc(r.code || '无代码')}</span>
          ${s.price != null ? `<span class="sl-px ${UI.dirCls(s.chgPct)}">${s.price.toFixed(2)} ${pct}</span>` : ''}
          ${badges}
          <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-pink" data-act="sl-scan" data-id="${r._id}">🔍 数据体检</button>
            <button class="btn btn-sm btn-ghost" data-act="sl-img" data-id="${r._id}">🖼 存为长图</button>
            <button class="btn btn-sm btn-ghost" data-act="sl-del" data-id="${r._id}">🗑 删除</button>
          </span>
        </div>
        ${s.at ? `<div class="sub" style="margin-top:4px">体检于 ${UI.esc(s.at)} · 依据：${s.srcs && s.srcs.length ? s.srcs.join(' / ') : '未命中任何实时数据源'}</div>` : '<div class="sub" style="margin-top:4px">尚未体检：点「数据体检」拉取涨停池 / 板块榜 / 龙虎榜 / 快讯真实数据</div>'}
        ${(() => {
          const w = s.web || {};
          const hasFlash = s.news && s.news.length;
          const hasFund = !!w.fund, hasPred = !!w.predict;
          const hasNews = w.news && w.news.length;
          if (!hasFlash && !hasFund && !hasPred && !hasNews) return s.at ? '<div class="sub" style="margin-top:6px">快讯 / 财报 / 业绩预告 / 全网新闻均未检索到该股条目（已如实标注，未编造）</div>' : '';
          const link = (u, t, meta) => `<a class="news-link" href="${UI.esc(u)}" target="_blank" rel="noopener noreferrer">${UI.esc(t)}</a><span class="sub"> ${UI.esc(meta || '')}</span>`;
          const num = (v, u) => (v == null ? '—' : v + (u || ''));
          const yoy = v => (v == null ? '—' : (v > 0 ? '+' : '') + v + '%');
          let h = '<div class="sl-news">';
          if (hasFund) h += `<div class="sl-sec-t" style="margin-bottom:3px">📈 最新财报（东财数据中心 · ${UI.esc(w.fund.datatype || w.fund.qdate)}${w.fund.notice ? ' · ' + UI.esc(w.fund.notice) + ' 披露' : ''}）</div>`
            + `<div class="sub">营收 ${num(w.fund.rev, ' 亿')}（同比 ${yoy(w.fund.revYoy)}），归母净利 ${num(w.fund.np, ' 亿')}（同比 ${yoy(w.fund.npYoy)}）${w.fund.roe != null ? '，ROE ' + w.fund.roe + '%' : ''}${w.fund.gross != null ? '，毛利率 ' + w.fund.gross + '%' : ''}　<a class="news-link" href="https://data.eastmoney.com/bbsj/" target="_blank" rel="noopener noreferrer">核对财报原文 →</a></div>`;
          if (hasPred) h += `<div class="sl-sec-t" style="margin:7px 0 3px">📋 业绩预告（东财数据中心 · ${UI.esc(w.predict.notice)} 披露）</div>`
            + `<div class="sub">预计净利 ${num(w.predict.lo, '')}~${num(w.predict.hi, ' 亿元')}，同比 ${num(w.predict.incLo, '%')}~${num(w.predict.incHi, '%')}${w.predict.content ? '<br>' + UI.esc(w.predict.content) : ''}　<a class="news-link" href="https://data.eastmoney.com/bbsj/yjyg.html" target="_blank" rel="noopener noreferrer">核对预告原文 →</a></div>`;
          if (hasNews) h += `<div class="sl-sec-t" style="margin:7px 0 3px">🌐 全网新闻报道（按时间排序 · 可核对原文）</div>` + w.news.map(n => link(n.url, n.title, (n.media || '') + ' ' + (n.date || '')) + (n.content ? `<div class="sub">${UI.esc(n.content)}</div>` : '')).join('<br>');
          if (hasFlash) h += `<div class="sl-sec-t" style="margin:7px 0 3px">⚡ 实时快讯提及</div>` + s.news.map(n => link(n.url, n.title, (n.date || '') + ' ' + (n.time || ''))).join('<br>');
          return h + '</div>';
        })()}
        <div style="margin-top:12px">
          <div class="sl-sec-t">① 驱动因素（真实数据自动填充，可改）</div>
          ${ta('drive', '点「数据体检」由真实数据生成；或手动填写：是什么资金/消息/事件在推动上涨…')}
        </div>
        ${s.analysis ? `<div class="sl-analysis">
          <div class="sl-sec-t">🧠 综合研判 <span class="sl-rating ${s.analysis.ratingCls}">${s.analysis.rating}</span><span class="sub">多头 ${s.analysis.bullW} vs 空头 ${s.analysis.bearW}（净 ${s.analysis.net > 0 ? '+' : ''}${s.analysis.net}） · ${s.analysis.srcN} 组真实数据交叉 · 每次体检重算 · 仅为数据推演，非投资指导</span></div>
          <div class="sl-cols">
            <div><div class="sl-col-t up">多头信号（${s.analysis.bull.length}）</div>${s.analysis.bull.length ? s.analysis.bull.map(x => `<div class="sl-sig">✅ ${UI.esc(x.txt)}</div>`).join('') : '<div class="sub">暂无</div>'}</div>
            <div><div class="sl-col-t down">空头信号（${s.analysis.bear.length}）</div>${s.analysis.bear.length ? s.analysis.bear.map(x => `<div class="sl-sig">⚠️ ${UI.esc(x.txt)}</div>`).join('') : '<div class="sub">暂无</div>'}</div>
          </div>
          <div class="rv-line">📌 <b>结论</b>：${UI.esc(s.analysis.conclusion)}</div>
          <div class="rv-line">🧭 <b>建议方向</b>：${UI.esc(s.analysis.direction)}</div>
          <div class="rv-line">👁 <b>明日盯盘</b>：${s.analysis.watch.map(w => UI.esc(w)).join('；')}</div>
        </div>` : ''}
        <details class="sl-deep" ontoggle="if(this.open)UI.autosizeAll(this)">
          <summary>📊 全面体检 · 七维分析框架 <span class="sub">宏观→行业→基本面→估值→财务→筹码→技术面 · 真实数据自动填充（可改），无接口维度如实标注 · 点击展开</span></summary>
          <div class="sl-deep-grid">
            ${dimBlk('🌍', '① 宏观环境', 'anMacro', '流动性 / 政策 / 宏观经济…',
              dp.mktAmount != null || s.stage ? [dp.mktAmount != null ? chip('两市成交 ' + dp.mktAmount + ' 万亿') : '', s.stage ? chip('大盘·' + s.stage) : '', dp.polN ? chip('政策快讯 ' + dp.polN + ' 条') : ''].filter(Boolean).join('') : '')}
            ${dimBlk('🏭', '② 行业分析', 'anInd', '行业生命周期 / 空间 / 竞争格局…',
              (s.secUp || s.secDn) ? chip('板块' + UI.sign((s.secUp || s.secDn).chgPct, 2, '%')) : '')}
            ${dimBlk('📈', '③ 基本面', 'anFund', '商业模式 / 护城河 / 管理层 / ROE / 成长性…',
              (s.web && s.web.fund) ? [chip('ROE ' + s.web.fund.roe + '%'), chip('营收同比 ' + (s.web.fund.revYoy > 0 ? '+' : '') + s.web.fund.revYoy + '%'), chip('净利同比 ' + (s.web.fund.npYoy > 0 ? '+' : '') + s.web.fund.npYoy + '%')].join('') : '')}
            ${dimBlk('💰', '④ 估值水平', 'anVal', 'PE / PB / 历史百分位…',
              dp.val ? [chip('PE(TTM) ' + (dp.val.pe != null ? dp.val.pe : '—') + (dp.val.pePct != null ? ' · 近一年' + dp.val.pePct + '%分位' : '')), chip('PB ' + (dp.val.pb != null ? dp.val.pb : '—') + (dp.val.pbPct != null ? ' · ' + dp.val.pbPct + '%分位' : '')), dp.val.peg != null ? chip('PEG ' + dp.val.peg) : '', dp.val.mcap != null ? chip('总市值 ' + dp.val.mcap + '亿') : ''].filter(Boolean).join('') : '')}
            ${dimBlk('🏥', '⑤ 财务健康', 'anFin', '资产负债率 / 自由现金流 / 货币资金覆盖短债…',
              (s.web && s.web.fund) ? [chip('ROE ' + s.web.fund.roe + '%'), chip('毛利率 ' + s.web.fund.gross + '%')].join('') : '')}
            ${dimBlk('👥', '⑥ 股东与机构动向', 'anHolder', '股东户数变化 / 机构动向…',
              dp.holder ? chip('股东户数 ' + (dp.holder.ratio != null ? (dp.holder.ratio > 0 ? '+' : '') + dp.holder.ratio + '%' : '—') + '（' + dp.holder.date + '）') : '')}
            ${dimBlk('📊', '⑦ 技术面', 'anTech', '多周期趋势 / 量价 / MACD / KDJ / RSI…',
              dp.tech ? [chip('MA20 ' + (dp.tech.ma20 || '—') + ' / MA60 ' + (dp.tech.ma60 || '—')), chip('MACD ' + dp.tech.dif + '/' + dp.tech.dea), chip('KDJ-J ' + dp.tech.j), chip('RSI6 ' + dp.tech.rsi6), dp.tech.pos52 != null ? chip('52周位置 ' + dp.tech.pos52 + '%') : ''].filter(Boolean).join('') : '')}
          </div>
        </details>
        ${s.advice ? `<div class="sl-advice">
          <div class="sl-sec-t">🧭 大盘视角 · 机会与风险提示 + 次日交易建议 <span class="sub">（每次体检按大盘总览当日真实数据自动更新 · 仅为数据推演纪律，非投资指导）</span></div>
          <div class="rv-line">🎯 机会：${s.advice.opp.map(o => UI.esc(o)).join('；')}</div>
          <div class="rv-line">🛡️ 风险：${s.advice.risk.map(o => UI.esc(o)).join('；')}</div>
          ${s.advice.breakRules && s.advice.breakRules.length ? `<div class="rv-line">📉 跌破建议：${s.advice.breakRules.map(o => UI.esc(o)).join('；')}</div>` : ''}
          ${s.advice.holdAdvice && s.advice.holdAdvice.length ? `<div class="rv-line">💼 持仓建议：${s.advice.holdAdvice.map(o => UI.esc(o)).join('；')}</div>` : ''}
          <div class="rv-line">📋 次日建议：${UI.esc(s.advice.plan)}</div>
        </div>` : ''}
      </div></div>`;
  },

  render() {
    const rows = Store.rows('stock_logic', []);
    const scanned = rows.filter(r => r._scan && r._scan.at);
    const ztN = scanned.filter(r => r._scan.zt).length;
    const lhbN = scanned.filter(r => r._scan.lhb).length;
    const lastAt = scanned.map(r => r._scan.at).sort().pop() || '—';
    return `
      ${UI.kpi([
        { label: '拆解个股', value: rows.length, delta: rows.length ? '点卡片「数据体检」更新' : '先添加个股' },
        { label: '涨停池命中', value: ztN, delta: '东财涨停池真实数据', dir: ztN ? 'up' : '' },
        { label: '龙虎榜命中', value: lhbN, delta: '东财龙虎榜真实数据', dir: lhbN ? 'up' : '' },
        { label: '最近体检', value: `<span style="font-size:14px">${UI.esc(lastAt)}</span>`, delta: '腾讯/东财/快讯' }
      ])}

      ${UI.card({
        title: '➕ 添加拆解个股',
        sub: '填代码（6 位）可自动拉名称与现价；只填名称也可做快讯 / 涨停池匹配',
        right: `<button class="btn btn-sm btn-pink" data-act="sl-scan-all">🔍 全部数据体检</button>`,
        body: `<div class="sl-addbar">
          <input id="slCode" class="sl-inp" placeholder="代码，如 600519" inputmode="numeric">
          <input id="slName" class="sl-inp" placeholder="名称，如 贵州茅台">
          <button class="btn btn-pink" data-act="sl-add">+ 添加</button>
        </div>
        <div class="sub" style="margin-top:8px">数据体检会拉取涨停池 / 板块榜 / 龙虎榜 / 快讯 / 财报 / 业绩预告 / 估值百分位 / 股东户数 / 日周K线等全部可及真实数据，自动完成综合研判与七维体检；验证不了的部分会明示「无法验证」——本工具不编造任何结论。</div>`
      })}

      ${rows.length ? rows.map(r => this.stockCard(r)).join('') : `
        <div class="card"><div class="card-body">
          <div class="empty"><span class="ei">🔬</span>还没有拆解中的个股。在上方输入代码 / 名称添加，然后点「数据体检」，即可基于涨停池、板块榜、龙虎榜、财报、估值、股东户数、K线等真实数据生成综合研判、七维体检与跌破/持仓建议。</div>
        </div></div>`}
    `;
  },

  /* 个股拆解 → 长图 */
  imageDoc(r) {
    const s = r._scan || {};
    const chips = [];
    if (s.price != null) chips.push({ label: '现价', value: s.price.toFixed(2) + ' ' + (s.chgPct != null ? UI.sign(s.chgPct, 2, '%') : ''), dir: s.chgPct > 0 ? 'up' : s.chgPct < 0 ? 'down' : '' });
    if (s.zt) chips.push({ label: '涨停', value: `${s.zt.lbc}连板 · ${s.zt.hybk || ''}`, dir: 'up' });
    if (s.secUp) chips.push({ label: s.secUp.name, value: UI.sign(s.secUp.chgPct, 2, '%'), dir: 'up' });
    if (s.secDn) chips.push({ label: s.secDn.name, value: UI.sign(s.secDn.chgPct, 2, '%'), dir: 'down' });
    if (s.lhb) chips.push({ label: '龙虎榜', value: `净${s.lhb.net >= 0 ? '买' : '卖'}${Math.abs(s.lhb.net)}亿`, dir: s.lhb.net >= 0 ? 'up' : 'down' });
    if (s.stage) chips.push({ label: '大盘情绪', value: s.stage, dir: (s.stage === '退潮' || s.stage === '冰点') ? 'down' : 'amber' });
    const sec = [];
    if (chips.length) sec.push({ title: `数据体检（${s.at || ''} · ${(s.srcs || []).join(' / ') || '无命中'}）`, blocks: [{ t: 'chips', items: chips }] });
    if (s.news && s.news.length) sec.push({ title: '相关真实快讯', blocks: [{ t: 'rows', items: s.news.map(n => ([{ text: (n.time || '') + ' ', bold: true }, { text: n.title }])) }] });
    if (s.web && s.web.fund) { const f = s.web.fund; sec.push({ title: `最新财报（东财 · ${f.datatype || f.qdate}）`, blocks: [{ t: 'rows', items: [[{ text: `营收 ${f.rev != null ? f.rev + ' 亿' : '—'}（同比 ${f.revYoy != null ? (f.revYoy > 0 ? '+' : '') + f.revYoy + '%' : '—'}），归母净利 ${f.np != null ? f.np + ' 亿' : '—'}（同比 ${f.npYoy != null ? (f.npYoy > 0 ? '+' : '') + f.npYoy + '%' : '—'}）${f.roe != null ? '，ROE ' + f.roe + '%' : ''}${f.gross != null ? '，毛利率 ' + f.gross + '%' : ''}` }]] }] }); }
    if (s.web && s.web.predict) { const p = s.web.predict; sec.push({ title: `业绩预告（东财 · ${p.notice} 披露）`, blocks: [{ t: 'rows', items: [[{ text: `预计净利 ${p.lo != null ? p.lo : '—'}~${p.hi != null ? p.hi : '—'} 亿元，同比 ${p.incLo != null ? p.incLo + '%' : '—'}~${p.incHi != null ? p.incHi + '%' : '—'}${p.content ? '——' + p.content : ''}` }]] }] }); }
    if (s.web && s.web.news && s.web.news.length) sec.push({ title: '全网新闻报道', blocks: [{ t: 'rows', items: s.web.news.map(n => ([{ text: (n.media || '') + ' ', bold: true }, { text: n.title + (n.content ? '——' + n.content : '') }])) }] });
    const txt = (t, v) => sec.push({ title: t, blocks: [{ t: 'text', text: v || '（未填写）' }] });
    txt('① 驱动因素', r.drive);
    if (s.analysis) {
      sec.push({ title: `综合研判「${s.analysis.rating}」（多头 ${s.analysis.bullW} vs 空头 ${s.analysis.bearW}，净 ${s.analysis.net > 0 ? '+' : ''}${s.analysis.net}）`, blocks: [{ t: 'rows', items:
        s.analysis.bull.map(x => ([{ text: '✅ ', bold: true }, { text: x.txt }]))
          .concat(s.analysis.bear.map(x => ([{ text: '⚠️ ', bold: true }, { text: x.txt }]))) }] });
      sec.push({ title: '结论与建议方向', blocks: [{ t: 'text', text: s.analysis.conclusion + '\n' + s.analysis.direction }] });
      if (s.analysis.watch && s.analysis.watch.length) sec.push({ title: '明日盯盘要点', blocks: [{ t: 'rows', items: s.analysis.watch.map(w => ([{ text: '· ', bold: true }, { text: w }])) }] });
    }
    txt('全面体检 ① 宏观环境', r.anMacro);
    txt('全面体检 ② 行业分析', r.anInd);
    txt('全面体检 ③ 基本面', r.anFund);
    txt('全面体检 ④ 估值水平', r.anVal);
    txt('全面体检 ⑤ 财务健康', r.anFin);
    txt('全面体检 ⑥ 股东与机构动向', r.anHolder);
    txt('全面体检 ⑦ 技术面', r.anTech);
    if (s.advice) {
      sec.push({ title: '大盘视角 · 机会与风险', blocks: [{ t: 'rows', items:
        s.advice.opp.map(o => ([{ text: '🎯 ', bold: true }, { text: o }]))
          .concat(s.advice.risk.map(o => ([{ text: '🛡️ ', bold: true }, { text: o }]))) }] });
      if (s.advice.breakRules && s.advice.breakRules.length) sec.push({ title: '跌破建议（具体价位 · 腾讯实时行情）', blocks: [{ t: 'rows', items: s.advice.breakRules.map(o => ([{ text: '📉 ', bold: true }, { text: o }])) }] });
      if (s.advice.holdAdvice && s.advice.holdAdvice.length) sec.push({ title: '持仓建议（分已有 / 无持仓）', blocks: [{ t: 'rows', items: s.advice.holdAdvice.map(o => ([{ text: '💼 ', bold: true }, { text: o }])) }] });
      sec.push({ title: '次日交易建议（条件—应对 · 非投资指导）', blocks: [{ t: 'text', text: s.advice.plan }] });
    }
    return { title: `${r.name || '未命名'}（${r.code || '无代码'}）逻辑拆解`, sub: `过儿的工作台 · 个股逻辑拆解 · ${s.at || DT.stamp()} · 结论基于实时真实数据`, filename: `个股拆解_${r.name || r.code || '未命名'}_${DT.today()}`, sections: sec };
  }
};
