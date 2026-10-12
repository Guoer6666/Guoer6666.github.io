/* ============================================================
   ai.js · 本地素材整理器（非远程 AI）
   把用户粘贴的原始文本 / Markdown 解析为结构化数据，
   供工作台自动展示成卡片、表格、信号清单。
   ============================================================ */
const AI = (() => {
  const $ = s => document.querySelector(s);

  /* ---------- 通用：识别常见来源 ---------- */
  const SOURCES = [
    '中国证券报', '上海证券报', '证券时报', '证券日报', '财联社', '华尔街见闻',
    '同花顺', '东方财富', '雪球', '36氪', '虎嗅', '彭博', '路透', 'CNBC',
    '第一财经', '新浪财经', '腾讯财经', '网易财经', '百家号', '新华社',
    '央视新闻', '人民日报', '工信部', '发改委', '央行', '证监会', '深交所', '上交所'
  ];
  function detectSource(line) {
    for (const s of SOURCES) if (line.includes(s)) return s;
    const m = line.match(/^【?([^【\]\s]{2,8}(?:报|社|网|财经|新闻|号))】?/);
    if (m) return m[1];
    return '财经媒体';
  }

  /* ---------- 1. 解析隔夜新闻 ----------
     支持两种格式：
     A) [标题](URL) ｜ 影响：xxx
     B) 来源：标题。摘要。影响：xxx [URL]
     返回 [{ source, title, summary, url, impact }] */
  function parseNews(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      // 格式 A: [标题](URL) ｜ 影响：xxx
      let m = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*[｜|]\s*(.*)$/);
      if (m) {
        const [, title, url, tail] = m;
        const impact = tail.replace(/^影响[：:]\s*/, '').trim();
        out.push({ source: detectSource(line), title: title.trim(), url, summary: '', impact });
        continue;
      }
      // 格式 B: 来源：标题。摘要。影响：xxx [URL]
      m = line.match(/^(?:([^：:]+)[：:]\s*)?([^\[]+?)(?:\s*(https?:\/\/[^\s]+))?\s*(?:影响[：:]\s*(.+))?$/);
      if (m) {
        const src = m[1] ? m[1].trim() : detectSource(line);
        const body = m[2].trim();
        const url = m[3] || '';
        const impact = (m[4] || '').trim();
        // 把 body 按句号拆成标题和摘要
        const parts = body.split(/(?<=。)/);
        const title = parts[0].replace(/。$/, '').trim();
        const summary = parts.slice(1).join('').trim();
        if (title || url) out.push({ source: src, title, summary, url, impact });
      }
    }
    return out;
  }

  /* ---------- 2. 解析重点个股 ----------
     支持：个股 / 涨跌 / 说明
     英伟达 +2% 股价创2个月新高
     闪迪 -10% 下季营收指引不及预期 */
  function parseStocks(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const m = line.match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?%?)\s*(.*)$/);
      if (!m) continue;
      let [, name, chg, note] = m;
      name = name.replace(/[:：]/, '').trim();
      if (!name) continue;
      if (!chg.includes('%')) chg += '%';
      out.push({ name, code: '', chgPct: chg, note: note.trim() });
    }
    return out;
  }

  /* ---------- 3. 解析日韩分析要点 ----------
     支持：市场 | 要点 | 分析 | 对A股影响（用 | 或 ｜ 分隔）
     或直接文本：韩国：三星、SK海力士承压。分析... 影响... */
  function parsePoints(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const parts = line.split(/[｜|]/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 4) {
        out.push({ market: parts[0], point: parts[1], analysis: parts[2], impact: parts[3] });
      } else if (parts.length >= 2) {
        const m = line.match(/^(.+?)[：:]\s*(.+?)\s*(?:分析[：:]\s*(.+?))?\s*(?:影响[：:]\s*(.+))?$/);
        if (m) {
          out.push({ market: m[1].trim(), point: m[2].trim(), analysis: (m[3] || '').trim(), impact: (m[4] || '').trim() });
        } else {
          out.push({ market: '亚太', point: parts[0], analysis: parts[1], impact: parts[2] || '' });
        }
      }
    }
    return out;
  }

  /* ---------- 4. 解析外围信号 ----------
     信号 | 详情 | 对A股影响 | 方向
     美股半导体反弹 | 纳指-0.06%... | 纳指收跌压制科技股 | 偏空 */
  function parseSignals(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const parts = line.split(/[｜|]/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 4) {
        out.push({ name: parts[0], detail: parts[1], impact: parts[2], dir: parts[3] });
      } else if (parts.length >= 2) {
        out.push({ name: parts[0], detail: parts[1] || '', impact: parts[2] || '', dir: '中性' });
      }
    }
    return out;
  }

  /* ---------- 5. 渲染新闻卡片 HTML ---------- */
  function renderNewsCards(list) {
    if (!list || !list.length) return '';
    return `<div class="news-cards">` + list.map(n => `
      <div class="news-card">
        <div class="nc-source"><span class="tag tag-pink">${UI.esc(n.source || '财经媒体')}</span></div>
        <h4 class="nc-title">${UI.esc(n.title)}</h4>
        ${n.summary ? `<p class="nc-summary">${UI.esc(n.summary)}</p>` : ''}
        <div class="nc-foot">
          ${n.url ? `<a class="nc-link" href="${UI.esc(n.url)}" target="_blank" rel="noopener noreferrer">查看原文 →</a>` : '<span class="nc-no-link">未提供原文链接</span>'}
        </div>
        ${n.impact ? `<div class="nc-impact"><b>影响：</b>${UI.esc(n.impact)}</div>` : ''}
      </div>
    `).join('') + `</div>`;
  }

  /* ---------- 6. 渲染外围信号表 HTML ---------- */
  function renderSignalTable(list) {
    if (!list || !list.length) return '';
    return `
      <div class="table-wrap narrow">
        <table>
          <thead><tr><th>信号</th><th>详情</th><th>对A股影响</th><th class="center">方向</th></tr></thead>
          <tbody>${list.map(s => `
            <tr>
              <td><b>${UI.esc(s.name)}</b></td>
              <td>${UI.esc(s.detail)}</td>
              <td class="impact">${UI.esc(s.impact)}</td>
              <td class="center">${UI.dirTag(s.dir)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  /* ---------- 7. 一键整理入口 ----------
     把 textarea 内容解析后写入 store，并刷新当前页 */
  function organize(kind, rawKey, targetKey, callback) {
    const raw = Store.get(rawKey, '');
    let parsed;
    switch (kind) {
      case 'news': parsed = parseNews(raw); break;
      case 'stocks': parsed = parseStocks(raw); break;
      case 'points': parsed = parsePoints(raw); break;
      case 'signals': parsed = parseSignals(raw); break;
      default: return;
    }
    if (!parsed.length) {
      UI.toast('未识别到有效内容，请检查格式');
      return;
    }
    Store.set(targetKey, parsed.map(o => Object.assign({ _id: Store.uid() }, o)));
    UI.toast(`已整理 ${parsed.length} 条`);
    if (callback) callback();
    else if (window.App && App.refresh) App.refresh();
  }

  return { parseNews, parseStocks, parsePoints, parseSignals, renderNewsCards, renderSignalTable, organize, detectSource };
})();
