/* ============================================================
   views-review.js · 每日A股盘后复盘
   包含：外围热点简报 / 大盘总览 / 连板梯队 / 主线题材 / 龙虎榜 / 风险提示 / 国内消息
   重要规则：禁止编造行情数据，禁止编造新闻链接
   无法获取真实数据时提示用户粘贴同花顺原始收盘数据及新闻链接
   ============================================================ */

/* ---------- 数据存储键 ---------- */
const RK = {
  // 外围简报
  globalBrief: 'review_global_brief',       // [{title,url,time,source,level,impact}]
  // 大盘总览
  indexData: 'review_index_data',           // {sh,sz,cyb,kcb,bj,turnover,northFlow}
  sentimentKpi: 'review_sentiment_kpi',     // {limitUp,limitDown,sealRate}
  // 连板梯队
  ladderData: 'review_ladder',              // [{height,count,stocks,topic}]
  // 主线题材
  themeData: 'review_themes',               // [{name,pct,volume,leaders}]
  // 龙虎榜
  dragonData: 'review_dragon',              // [{stock,netBuy,type,instFlow,retailFlow}]
  // 风险提示
  riskData: 'review_risks',                 // [{title,content}]
  // 国内消息
  domesticNews: 'review_domestic_news',     // [{title,url,time,source}]
  // 手动编辑标志
  manualFlags: 'review_manual_flags'        // {field: timestamp}
};

/* ---------- 默认值（模板占位） ---------- */
const REVIEW_DEFAULTS = {
  globalBrief: [],
  indexData: { sh: '', shPct: '', sz: '', szPct: '', cyb: '', cybPct: '', kcb: '', kcbPct: '', bj: '', bjPct: '', turnover: '', northFlow: '' },
  sentimentKpi: { limitUp: '', limitDown: '', sealRate: '' },
  ladder: [],
  themes: [],
  dragon: [],
  risks: [],
  domesticNews: []
};

/* ---------- 辅助函数 ---------- */
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

/* 从 Markdown 链接格式 [标题](URL) 解析为 HTML 链接 */
function mdLink(title, url) {
  if (!url) return esc(title);
  return '<a href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + ' <span class="rl-ext">↗</span></a>';
}

/* 渲染涨跌幅颜色 */
function pctSpan(v) {
  if (v == null || v === '' || v === '-') return '<span class="rv-flat">--</span>';
  const n = parseFloat(v);
  if (isNaN(n)) return '<span class="rv-flat">' + esc(String(v)) + '</span>';
  const cls = n > 0 ? 'rv-up' : (n < 0 ? 'rv-down' : 'rv-flat');
  const sign = n > 0 ? '+' : '';
  return '<span class="' + cls + '">' + sign + n.toFixed(2) + '%</span>';
}

/* 重要级别标签 */
function levelBadge(level) {
  const map = { high: '🔴 重要', mid: '🟡 关注', low: '⚪ 一般' };
  return '<span class="rl-badge rl-' + (level || 'low') + '">' + (map[level] || map.low) + '</span>';
}

/* ---------- 读取存储数据 ---------- */
function getData(key, def) {
  return Store.get(key, def);
}

function setData(key, val) {
  Store.set(key, val);
}

/* ============================================================
   模块1: 全球 & 隔夜外围热点简报
   ============================================================ */
function renderGlobalBrief() {
  const items = getData(RK.globalBrief, []);
  const isEmpty = !items || !items.length;

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>🌍 全球 & 隔夜外围热点简报</h3>';
  html += '<span class="rv-sec-desc">外围指数 · 大宗商品 · 汇率 · 海外财经事件 · 对A股影响评估</span>';
  html += '</div>';

  if (isEmpty) {
    html += '<div class="rv-paste-hint">';
    html += '<div class="rv-ph-icon">📋</div>';
    html += '<div class="rv-ph-title">暂无数据 · 请粘贴同花顺外围热点数据</div>';
    html += '<div class="rv-ph-desc">格式：每行一条新闻，支持 Markdown 链接格式<br>';
    html += '<code>[新闻标题](https://完整URL) | 级别:高/中/低 | 对A股影响：简要评估</code></div>';
    html += '<textarea class="rv-paste-area" id="rvGlobalPaste" rows="8" placeholder="粘贴外围热点数据...&#10;例如：&#10;[美股三大指数集体收涨](https://finance.eastmoney.com/a/xxx.html) | 级别:高 | 对A股影响：提振市场情绪，利好A股开盘&#10;[国际原油价格大跌3%](https://finance.sina.com.cn/xxx) | 级别:中 | 对A股影响：利好航空航运板块，利空石油化工"></textarea>';
    html += '<button class="btn btn-solid rv-parse-btn" data-act="parse-global">解析并保存</button>';
    html += '</div>';
  } else {
    // 按重要级别和时间排序
    const sorted = [...items].sort((a, b) => {
      const lv = { high: 0, mid: 1, low: 2 };
      return (lv[a.level] || 2) - (lv[b.level] || 2);
    });

    const showLimit = 8;
    const showItems = sorted.slice(0, showLimit);
    const hiddenCount = sorted.length - showLimit;
    const blockId = 'rvGlobalBlock';

    html += '<div class="rv-global-list" id="' + blockId + '">';
    showItems.forEach((item, i) => {
      html += '<div class="rv-global-item">';
      html += '<div class="rv-global-main">';
      html += levelBadge(item.level || 'low');
      html += '<span class="rv-global-title">' + mdLink(item.title, item.url) + '</span>';
      if (item.source) html += '<span class="rv-global-source">' + esc(item.source) + '</span>';
      if (item.time) html += '<span class="rv-global-time">' + esc(item.time) + '</span>';
      html += '</div>';
      if (item.impact) html += '<div class="rv-global-impact"><span class="rv-impact-label">对A股影响：</span>' + esc(item.impact) + '</div>';
      html += '</div>';
    });

    if (hiddenCount > 0) {
      html += '<div class="rv-global-hidden" style="display:none">';
      sorted.slice(showLimit).forEach((item, i) => {
        html += '<div class="rv-global-item">';
        html += '<div class="rv-global-main">';
        html += levelBadge(item.level || 'low');
        html += '<span class="rv-global-title">' + mdLink(item.title, item.url) + '</span>';
        if (item.source) html += '<span class="rv-global-source">' + esc(item.source) + '</span>';
        if (item.time) html += '<span class="rv-global-time">' + esc(item.time) + '</span>';
        html += '</div>';
        if (item.impact) html += '<div class="rv-global-impact"><span class="rv-impact-label">对A股影响：</span>' + esc(item.impact) + '</div>';
        html += '</div>';
      });
      html += '</div>';
      html += '<button class="rv-fold-btn" data-fold="' + blockId + '" data-count="' + hiddenCount + '">展开剩余 ' + hiddenCount + ' 条 ▾</button>';
    }

    html += '</div>';
    html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-global">✎ 修改数据</button>';
  }

  html += '</div>';
  return html;
}

/* ============================================================
   模块2: 大盘总览
   ============================================================ */
function renderMarketOverview() {
  const idx = getData(RK.indexData, REVIEW_DEFAULTS.indexData);
  const kpi = getData(RK.sentimentKpi, REVIEW_DEFAULTS.sentimentKpi);

  const cards = [
    { label: '上证指数', val: idx.sh || '--', pct: idx.shPct, icon: '📈' },
    { label: '深证成指', val: idx.sz || '--', pct: idx.szPct, icon: '📉' },
    { label: '创业板指', val: idx.cyb || '--', pct: idx.cybPct, icon: '🚀' },
    { label: '科创50', val: idx.kcb || '--', pct: idx.kcbPct, icon: '🔬' },
    { label: '北证50', val: idx.bj || '--', pct: idx.bjPct, icon: '🏭' }
  ];

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>📊 大盘总览</h3><span class="rv-sec-desc">各大指数 · 成交量 · 北向资金 · 涨停跌停 · 封板率</span></div>';

  // 指数数字卡片
  html += '<div class="rv-idx-cards">';
  cards.forEach(c => {
    html += '<div class="rv-idx-card">';
    html += '<span class="rv-idx-icon">' + c.icon + '</span>';
    html += '<div class="rv-idx-info">';
    html += '<span class="rv-idx-label">' + c.label + '</span>';
    html += '<span class="rv-idx-val">' + esc(String(c.val)) + '</span>';
    html += pctSpan(c.pct);
    html += '</div></div>';
  });
  html += '</div>';

  // 成交量 / 北向资金
  html += '<div class="rv-idx-cards rv-idx-cards-2">';
  html += '<div class="rv-idx-card rv-idx-card-wide">';
  html += '<span class="rv-idx-icon">💹</span>';
  html += '<div class="rv-idx-info">';
  html += '<span class="rv-idx-label">两市总成交量</span>';
  html += '<span class="rv-idx-val rv-idx-big">' + esc(String(idx.turnover || '--')) + '</span>';
  html += '</div></div>';

  html += '<div class="rv-idx-card rv-idx-card-wide">';
  html += '<span class="rv-idx-icon">💰</span>';
  html += '<div class="rv-idx-info">';
  html += '<span class="rv-idx-label">北向资金</span>';
  html += '<span class="rv-idx-val rv-idx-big">' + esc(String(idx.northFlow || '--')) + '</span>';
  html += '</div></div>';
  html += '</div>';

  // 涨停 / 跌停 / 封板率
  html += '<div class="rv-kpi-row">';
  html += '<div class="rv-kpi-card rv-kpi-up"><div class="rv-kpi-label">涨停家数</div><div class="rv-kpi-val">' + esc(String(kpi.limitUp || '--')) + '</div></div>';
  html += '<div class="rv-kpi-card rv-kpi-down"><div class="rv-kpi-label">跌停家数</div><div class="rv-kpi-val">' + esc(String(kpi.limitDown || '--')) + '</div></div>';
  html += '<div class="rv-kpi-card rv-kpi-rate"><div class="rv-kpi-label">封板成功率</div><div class="rv-kpi-val">' + esc(String(kpi.sealRate || '--')) + '</div></div>';
  html += '</div>';

  html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-overview">✎ 修改数据</button>';
  html += '</div>';
  return html;
}

/* ============================================================
   模块3: 连板梯队表格
   ============================================================ */
function renderLadder() {
  const data = getData(RK.ladderData, []);
  const isEmpty = !data || !data.length;

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>🪜 连板梯队</h3><span class="rv-sec-desc">连板高度 · 板数 · 个股名称 · 所属题材</span></div>';

  if (isEmpty) {
    html += '<div class="rv-paste-hint rv-paste-hint-sm">';
    html += '<div class="rv-ph-desc">请粘贴同花顺连板梯队数据（每行格式：高度|板数|个股名称|题材）</div>';
    html += '<textarea class="rv-paste-area" id="rvLadderPaste" rows="4" placeholder="例如：&#10;6板|6连板|XX股份|机器人概念&#10;5板|5连板|YY科技|AI算力&#10;4板|4连板|ZZ电子|半导体"></textarea>';
    html += '<button class="btn btn-solid rv-parse-btn" data-act="parse-ladder">解析并保存</button>';
    html += '</div>';
  } else {
    html += '<div class="rv-table-wrap"><table class="rv-table">';
    html += '<thead><tr><th>连板高度</th><th>板数</th><th>个股名称</th><th>所属题材</th></tr></thead><tbody>';
    data.forEach(row => {
      html += '<tr>';
      html += '<td><span class="rv-ladder-h">' + esc(row.height || '') + '</span></td>';
      html += '<td>' + esc(row.count || '') + '</td>';
      html += '<td><strong>' + esc(row.stocks || '') + '</strong></td>';
      html += '<td>' + esc(row.topic || '') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-ladder">✎ 修改数据</button>';
  }

  html += '</div>';
  return html;
}

/* ============================================================
   模块4: 主线题材板块表格
   ============================================================ */
function renderThemes() {
  const data = getData(RK.themeData, []);
  const isEmpty = !data || !data.length;

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>🔥 主线题材板块</h3><span class="rv-sec-desc">板块名称 · 涨幅 · 成交额 · 核心龙头</span></div>';

  if (isEmpty) {
    html += '<div class="rv-paste-hint rv-paste-hint-sm">';
    html += '<div class="rv-ph-desc">请粘贴同花顺主线题材数据（每行格式：板块名称|涨幅|成交额|龙头个股）</div>';
    html += '<textarea class="rv-paste-area" id="rvThemePaste" rows="4" placeholder="例如：&#10;机器人概念|+3.25%|580亿|XX股份、YY科技&#10;AI算力|+2.18%|420亿|ZZ电子、AA智能"></textarea>';
    html += '<button class="btn btn-solid rv-parse-btn" data-act="parse-themes">解析并保存</button>';
    html += '</div>';
  } else {
    html += '<div class="rv-table-wrap"><table class="rv-table">';
    html += '<thead><tr><th>板块名称</th><th>板块涨幅</th><th>板块成交额</th><th>核心龙头个股</th></tr></thead><tbody>';
    data.forEach(row => {
      html += '<tr>';
      html += '<td><strong>' + esc(row.name || '') + '</strong></td>';
      html += '<td>' + pctSpan(row.pct) + '</td>';
      html += '<td>' + esc(row.volume || '') + '</td>';
      html += '<td>' + esc(row.leaders || '') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-themes">✎ 修改数据</button>';
  }

  html += '</div>';
  return html;
}

/* ============================================================
   模块5: 龙虎榜汇总表格
   ============================================================ */
function renderDragon() {
  const data = getData(RK.dragonData, []);
  const isEmpty = !data || !data.length;

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>🐉 龙虎榜汇总</h3><span class="rv-sec-desc">重点上榜个股 · 机构游资动向 · 净买卖金额</span></div>';

  if (isEmpty) {
    html += '<div class="rv-paste-hint rv-paste-hint-sm">';
    html += '<div class="rv-ph-desc">请粘贴同花顺龙虎榜数据（每行格式：个股|净买卖|类型|机构动向|游资动向）</div>';
    html += '<textarea class="rv-paste-area" id="rvDragonPaste" rows="4" placeholder="例如：&#10;XX股份|+1.25亿|机构主导|机构净买入8000万|游资净买入4500万&#10;YY科技|-5200万|游资博弈|机构净卖出2000万|游资净卖出3200万"></textarea>';
    html += '<button class="btn btn-solid rv-parse-btn" data-act="parse-dragon">解析并保存</button>';
    html += '</div>';
  } else {
    html += '<div class="rv-table-wrap"><table class="rv-table">';
    html += '<thead><tr><th>个股名称</th><th>净买卖金额</th><th>类型</th><th>机构动向</th><th>游资动向</th></tr></thead><tbody>';
    data.forEach(row => {
      const netCls = String(row.netBuy || '').startsWith('+') || String(row.netBuy || '').startsWith('买入') ? 'rv-up' : 'rv-down';
      html += '<tr>';
      html += '<td><strong>' + esc(row.stock || '') + '</strong></td>';
      html += '<td><span class="' + netCls + '">' + esc(row.netBuy || '') + '</span></td>';
      html += '<td>' + esc(row.type || '') + '</td>';
      html += '<td>' + esc(row.instFlow || '') + '</td>';
      html += '<td>' + esc(row.retailFlow || '') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-dragon">✎ 修改数据</button>';
  }

  html += '</div>';
  return html;
}

/* ============================================================
   模块6: 市场风险提示
   ============================================================ */
function renderRisks() {
  const data = getData(RK.riskData, []);
  const isEmpty = !data || !data.length;

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>⚠️ 市场风险提示</h3></div>';

  if (isEmpty) {
    html += '<div class="rv-paste-hint rv-paste-hint-sm">';
    html += '<div class="rv-ph-desc">暂无风险提示数据。点击下方按钮手动添加。</div>';
    html += '<textarea class="rv-paste-area" id="rvRiskPaste" rows="3" placeholder="每行一条风险提示&#10;例如：&#10;高位连板股分歧加剧，注意追高风险&#10;北向资金连续流出，短期市场承压"></textarea>';
    html += '<button class="btn btn-solid rv-parse-btn" data-act="parse-risks">保存风险提示</button>';
    html += '</div>';
  } else {
    html += '<div class="rv-risk-list">';
    data.forEach((r, i) => {
      html += '<div class="rv-risk-item">';
      html += '<span class="rv-risk-icon">⚠️</span>';
      html += '<span class="rv-risk-text">' + esc(r.title || r.content || '') + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-risks">✎ 修改风险提示</button>';
  }

  html += '</div>';
  return html;
}

/* ============================================================
   模块7: 当日国内重要财经消息摘要
   ============================================================ */
function renderDomesticNews() {
  const data = getData(RK.domesticNews, []);
  const isEmpty = !data || !data.length;

  let html = '<div class="rv-section">';
  html += '<div class="rv-sec-hd"><h3>📰 当日国内重要财经消息摘要</h3>';
  html += '<span class="rv-sec-desc">每条消息附带可点击源新闻链接，标注消息来源</span>';
  html += '</div>';

  if (isEmpty) {
    html += '<div class="rv-paste-hint">';
    html += '<div class="rv-ph-icon">📋</div>';
    html += '<div class="rv-ph-title">暂无数据 · 请粘贴国内财经新闻</div>';
    html += '<div class="rv-ph-desc">支持 Markdown 链接格式，每条一行<br>';
    html += '<code>[新闻标题](https://完整URL) | 来源:媒体名称</code></div>';
    html += '<textarea class="rv-paste-area" id="rvDomesticPaste" rows="8" placeholder="粘贴国内财经新闻...&#10;例如：&#10;[央行宣布降准0.5个百分点](https://finance.eastmoney.com/a/xxx.html) | 来源:央行官网&#10;[证监会发布退市新规](https://finance.sina.com.cn/xxx) | 来源:证监会&#10;[北向资金今日净流入超百亿](https://data.eastmoney.com/xxx) | 来源:东方财富"></textarea>';
    html += '<button class="btn btn-solid rv-parse-btn" data-act="parse-domestic">解析并保存</button>';
    html += '</div>';
  } else {
    html += '<div class="rv-domestic-list">';
    data.forEach(item => {
      html += '<div class="rv-domestic-item">';
      html += '<div class="rv-domestic-title">' + mdLink(item.title, item.url) + '</div>';
      html += '<div class="rv-domestic-meta">';
      if (item.source) html += '<span class="rv-domestic-source">来源：' + esc(item.source) + '</span>';
      if (item.time) html += '<span class="rv-domestic-time">' + esc(item.time) + '</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<button class="btn btn-ghost rv-edit-btn" data-act="edit-domestic">✎ 修改数据</button>';
  }

  html += '</div>';
  return html;
}

/* ============================================================
   数据解析函数（从粘贴文本解析结构化数据）
   ============================================================ */

/* 解析外围热点：支持格式 [标题](URL) | 级别:高/中/低 | 对A股影响：xxx */
function parseGlobalBrief(text) {
  const lines = text.split('\n').filter(Boolean);
  const items = [];
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    // 匹配 [标题](URL)
    const mdMatch = line.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
    let title = '', url = '';
    if (mdMatch) {
      title = mdMatch[1].trim();
      url = mdMatch[2].trim();
    } else {
      // 没有 Markdown 链接，整行当标题
      title = line.replace(/\|.*$/, '').trim();
      url = '';
    }

    // 匹配级别
    const lvMatch = line.match(/级别\s*[:：]\s*(高|中|低)/);
    let level = 'low';
    if (lvMatch) {
      if (lvMatch[1] === '高') level = 'high';
      else if (lvMatch[1] === '中') level = 'mid';
    }

    // 匹配对A股影响
    const impMatch = line.match(/对A股影响\s*[:：]\s*(.+?)(?:\||$)/);
    const impact = impMatch ? impMatch[1].trim() : '';

    // 匹配来源
    const srcMatch = line.match(/来源\s*[:：]\s*(.+?)(?:\||$)/);
    const source = srcMatch ? srcMatch[1].trim() : '';

    // 匹配时间
    const timeMatch = line.match(/时间\s*[:：]\s*(.+?)(?:\||$)/);
    const time = timeMatch ? timeMatch[1].trim() : '';

    if (title) {
      items.push({ title, url, level, impact, source, time });
    }
  });
  return items;
}

/* 解析管道分隔数据：连板梯队 / 主线题材 / 龙虎榜 */
function parsePipeData(text, fields) {
  const lines = text.split('\n').filter(Boolean);
  return lines.map(line => {
    const parts = line.split('|').map(s => s.trim());
    const obj = {};
    fields.forEach((f, i) => { obj[f] = parts[i] || ''; });
    return obj;
  }).filter(obj => Object.values(obj).some(v => v));
}

/* 解析风险提示：每行一条 */
function parseRisks(text) {
  return text.split('\n').filter(Boolean).map(line => ({ title: line.trim(), content: '' }));
}

/* 解析国内新闻：同 globalBrief */
function parseDomesticNews(text) {
  const lines = text.split('\n').filter(Boolean);
  const items = [];
  lines.forEach(line => {
    line = line.trim();
    if (!line) return;
    const mdMatch = line.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
    let title = '', url = '';
    if (mdMatch) { title = mdMatch[1].trim(); url = mdMatch[2].trim(); }
    else { title = line.replace(/\|.*$/, '').trim(); url = ''; }
    const srcMatch = line.match(/来源\s*[:：]\s*(.+?)(?:\||$)/);
    const source = srcMatch ? srcMatch[1].trim() : '';
    const timeMatch = line.match(/时间\s*[:：]\s*(.+?)(?:\||$)/);
    const time = timeMatch ? timeMatch[1].trim() : '';
    if (title) items.push({ title, url, source, time });
  });
  return items;
}

/* ============================================================
   编辑弹窗
   ============================================================ */
function showEditModal(title, key, placeholder, parseFn, fields) {
  const current = getData(key, []);
  let text = '';
  if (Array.isArray(current) && current.length) {
    if (fields) {
      text = current.map(row => fields.map(f => row[f] || '').join(' | ')).join('\n');
    } else {
      text = current.map(item => {
        let line = item.url ? '[' + item.title + '](' + item.url + ')' : item.title;
        if (item.level) line += ' | 级别:' + item.level;
        if (item.impact) line += ' | 对A股影响：' + item.impact;
        if (item.source) line += ' | 来源:' + item.source;
        if (item.time) line += ' | 时间:' + item.time;
        return line;
      }).join('\n');
    }
  }

  UI.modal({
    title: title,
    body: '<textarea class="rv-paste-area" id="rvEditArea" rows="12">' + esc(text) + '</textarea>'
      + '<div class="rv-edit-hint">' + (placeholder || '修改后点击保存') + '</div>',
    buttons: [
      { label: '取消' },
      {
        label: '保存', cls: 'btn-solid', onClick: () => {
          const val = UI.$('#rvEditArea').value.trim();
          let parsed;
          if (parseFn) {
            parsed = parseFn(val);
          } else if (fields) {
            parsed = parsePipeData(val, fields);
          } else {
            parsed = parseGlobalBrief(val);
          }
          setData(key, parsed);
          UI.toast('已保存');
          App.refresh();
        }
      }
    ]
  });
}

/* ============================================================
   编辑动作路由
   ============================================================ */
function handleEditAction(act) {
  switch (act) {
    case 'edit-global':
      showEditModal('编辑外围热点简报', RK.globalBrief, '格式：[新闻标题](URL) | 级别:高/中/低 | 对A股影响：xxx');
      break;
    case 'edit-overview': {
      const idx = getData(RK.indexData, REVIEW_DEFAULTS.indexData);
      const kpi = getData(RK.sentimentKpi, REVIEW_DEFAULTS.sentimentKpi);
      UI.modal({
        title: '编辑大盘总览数据',
        body: '<div class="rv-edit-form">'
          + '<div class="field"><label>上证指数点位</label><input id="evSh" value="' + esc(idx.sh || '') + '" placeholder="如 3350.28"></div>'
          + '<div class="field"><label>上证涨跌幅(%)</label><input id="evShPct" value="' + esc(idx.shPct || '') + '" placeholder="如 +0.85"></div>'
          + '<div class="field"><label>深证成指点位</label><input id="evSz" value="' + esc(idx.sz || '') + '" placeholder="如 10850.16"></div>'
          + '<div class="field"><label>深证涨跌幅(%)</label><input id="evSzPct" value="' + esc(idx.szPct || '') + '" placeholder="如 -0.32"></div>'
          + '<div class="field"><label>创业板指点位</label><input id="evCyb" value="' + esc(idx.cyb || '') + '" placeholder="如 2150.44"></div>'
          + '<div class="field"><label>创业板涨跌幅(%)</label><input id="evCybPct" value="' + esc(idx.cybPct || '') + '" placeholder="如 +1.52"></div>'
          + '<div class="field"><label>科创50点位</label><input id="evKcb" value="' + esc(idx.kcb || '') + '" placeholder="如 980.12"></div>'
          + '<div class="field"><label>科创50涨跌幅(%)</label><input id="evKcbPct" value="' + esc(idx.kcbPct || '') + '" placeholder="如 +0.45"></div>'
          + '<div class="field"><label>北证50点位</label><input id="evBj" value="' + esc(idx.bj || '') + '" placeholder="如 1250.00"></div>'
          + '<div class="field"><label>北证50涨跌幅(%)</label><input id="evBjPct" value="' + esc(idx.bjPct || '') + '" placeholder="如 +1.20"></div>'
          + '<div class="field"><label>两市总成交量</label><input id="evTurnover" value="' + esc(idx.turnover || '') + '" placeholder="如 1.25万亿"></div>'
          + '<div class="field"><label>北向资金</label><input id="evNorth" value="' + esc(idx.northFlow || '') + '" placeholder="如 +45.6亿"></div>'
          + '<div class="field"><label>涨停家数</label><input id="evLimitUp" value="' + esc(kpi.limitUp || '') + '" placeholder="如 68"></div>'
          + '<div class="field"><label>跌停家数</label><input id="evLimitDown" value="' + esc(kpi.limitDown || '') + '" placeholder="如 12"></div>'
          + '<div class="field"><label>封板成功率</label><input id="evSealRate" value="' + esc(kpi.sealRate || '') + '" placeholder="如 72%"></div>'
          + '</div>',
        buttons: [
          { label: '取消' },
          {
            label: '保存', cls: 'btn-solid', onClick: () => {
              setData(RK.indexData, {
                sh: UI.$('#evSh').value.trim(), shPct: UI.$('#evShPct').value.trim(),
                sz: UI.$('#evSz').value.trim(), szPct: UI.$('#evSzPct').value.trim(),
                cyb: UI.$('#evCyb').value.trim(), cybPct: UI.$('#evCybPct').value.trim(),
                kcb: UI.$('#evKcb').value.trim(), kcbPct: UI.$('#evKcbPct').value.trim(),
                bj: UI.$('#evBj').value.trim(), bjPct: UI.$('#evBjPct').value.trim(),
                turnover: UI.$('#evTurnover').value.trim(),
                northFlow: UI.$('#evNorth').value.trim()
              });
              setData(RK.sentimentKpi, {
                limitUp: UI.$('#evLimitUp').value.trim(),
                limitDown: UI.$('#evLimitDown').value.trim(),
                sealRate: UI.$('#evSealRate').value.trim()
              });
              UI.toast('已保存');
              App.refresh();
            }
          }
        ]
      });
      break;
    }
    case 'edit-ladder':
      showEditModal('编辑连板梯队', RK.ladderData, '格式：连板高度 | 板数 | 个股名称 | 所属题材（每行一条）',
        null, ['height', 'count', 'stocks', 'topic']);
      break;
    case 'edit-themes':
      showEditModal('编辑主线题材板块', RK.themeData, '格式：板块名称 | 涨幅 | 成交额 | 核心龙头（每行一条）',
        null, ['name', 'pct', 'volume', 'leaders']);
      break;
    case 'edit-dragon':
      showEditModal('编辑龙虎榜汇总', RK.dragonData, '格式：个股 | 净买卖 | 类型 | 机构动向 | 游资动向（每行一条）',
        null, ['stock', 'netBuy', 'type', 'instFlow', 'retailFlow']);
      break;
    case 'edit-risks':
      showEditModal('编辑风险提示', RK.riskData, '每行一条风险提示',
        parseRisks, null);
      break;
    case 'edit-domestic':
      showEditModal('编辑国内财经消息', RK.domesticNews, '格式：[新闻标题](URL) | 来源:媒体名称（每行一条）',
        parseDomesticNews, null);
      break;
  }
}

/* 解析粘贴数据 */
function handleParse(act) {
  let text, key, parseFn, label;
  switch (act) {
    case 'parse-global':
      text = (UI.$('#rvGlobalPaste') || {}).value || '';
      key = RK.globalBrief; parseFn = parseGlobalBrief; label = '外围热点简报';
      break;
    case 'parse-ladder':
      text = (UI.$('#rvLadderPaste') || {}).value || '';
      key = RK.ladderData; parseFn = t => parsePipeData(t, ['height', 'count', 'stocks', 'topic']); label = '连板梯队';
      break;
    case 'parse-themes':
      text = (UI.$('#rvThemePaste') || {}).value || '';
      key = RK.themeData; parseFn = t => parsePipeData(t, ['name', 'pct', 'volume', 'leaders']); label = '主线题材';
      break;
    case 'parse-dragon':
      text = (UI.$('#rvDragonPaste') || {}).value || '';
      key = RK.dragonData; parseFn = t => parsePipeData(t, ['stock', 'netBuy', 'type', 'instFlow', 'retailFlow']); label = '龙虎榜';
      break;
    case 'parse-risks':
      text = (UI.$('#rvRiskPaste') || {}).value || '';
      key = RK.riskData; parseFn = parseRisks; label = '风险提示';
      break;
    case 'parse-domestic':
      text = (UI.$('#rvDomesticPaste') || {}).value || '';
      key = RK.domesticNews; parseFn = parseDomesticNews; label = '国内财经新闻';
      break;
    default: return;
  }
  if (!text.trim()) { UI.toast('请先粘贴数据'); return; }
  try {
    const parsed = parseFn(text);
    setData(key, parsed);
    UI.toast(label + ' 已保存（' + parsed.length + ' 条）');
    App.refresh();
  } catch (e) {
    UI.toast('解析失败：' + e.message);
  }
}

/* ============================================================
   页面入口
   ============================================================ */
V.review = {
  title: '每日A股盘后复盘',
  desc: '外围简报 · 大盘总览 · 连板梯队 · 主线题材 · 龙虎榜 · 风险提示',
  render() {
    return '<div class="rv-page">'
      + renderGlobalBrief()
      + renderMarketOverview()
      + renderLadder()
      + renderThemes()
      + renderDragon()
      + renderRisks()
      + renderDomesticNews()
      + '</div>';
  },
  mount(reg) {
    // 绑定编辑和解析按钮
    document.addEventListener('click', function handler(e) {
      const t = e.target;
      const actBtn = t.closest('[data-act]');
      if (!actBtn) return;
      const act = actBtn.dataset.act;
      if (act && act.startsWith('parse-')) {
        handleParse(act);
      } else if (act && act.startsWith('edit-')) {
        handleEditAction(act);
      }
    });

    // 折叠按钮
    document.addEventListener('click', function foldHandler(e) {
      const btn = e.target.closest('[data-fold]');
      if (!btn) return;
      const blockId = btn.dataset.fold;
      const block = document.getElementById(blockId);
      if (!block) return;
      const hidden = block.querySelector('.rv-global-hidden');
      if (!hidden) return;
      if (hidden.style.display === 'none') {
        hidden.style.display = 'block';
        btn.textContent = '收起 ▴';
      } else {
        hidden.style.display = 'none';
        btn.textContent = '展开剩余 ' + (btn.dataset.count || '') + ' 条 ▾';
      }
    });
  }
};
