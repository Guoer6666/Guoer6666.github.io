/* ============================================================
   app.js · 路由 / 事件 / 定时器 / 数据管理
   ============================================================ */
const MENU = [
  {
    key: 'review', icon: '📊', title: 'A股每日复盘', items: [
      { k: 'overnight', label: '全球隔夜要闻' },
      { k: 'usnight', label: '夜盘美股', live: 'us' },
      { k: 'asia', label: '日韩股市', live: 'asia' },
      { k: 'outlook', label: '次日盘前总结' },
      { k: 'sentiment', label: '大盘总览', live: 'a' },
      { k: 'm2560', label: '2560战法信号', badge: '新' },
      { k: 'holdings', label: '个股逻辑拆解', badge: '新' },
      { k: 'pickscreen', label: '个股拆解选股', badge: '新' },
      { k: 'verify', label: '选股次日验证', badge: '新' },
      { k: 'summary', label: '周期总结', badge: '新' }
    ]
  },
  {
    key: 'checkin', icon: '📝', title: '日常打卡合集', items: [
      { k: 'notes', label: '复盘学习笔记' },
      { k: 'routine', label: '作息运动记录' },
      { k: 'mindset', label: '交易心态周记' }
    ]
  },
  {
    key: 'challenge', icon: '🎯', title: '周期挑战计划', items: [
      { k: 'goal', label: '月度交易收益目标' },
      { k: 'discipline', label: '短线操作纪律清单' }
    ]
  },
  {
    key: 'hobby', icon: '🎨', title: '兴趣边角板块', items: [
      { k: 'material', label: '交易素材归档区' },
      { k: 'tools', label: 'AI复盘工具技巧库' },
      { k: 'journal', label: '实盘每日记录' }
    ]
  }
];

const THEMES = {
  pink: { name: '淡粉', pink: '#ff7fa6', deep: '#f2588a', soft: '#fff0f5', soft2: '#ffe6ee', line: '#ffd6e3' },
  blue: { name: '淡蓝', pink: '#6fa8ff', deep: '#3a76d8', soft: '#f0f5ff', soft2: '#e2edff', line: '#d3e2ff' },
  mint: { name: '淡青', pink: '#4ec8b0', deep: '#2a9c86', soft: '#effbf8', soft2: '#dff5f0', line: '#cdeee6' },
  violet: { name: '淡紫', pink: '#a98cf5', deep: '#7c5ada', soft: '#f5f1ff', soft2: '#ebe3ff', line: '#e0d4ff' }
};

const App = (() => {
  let current = null;
  const timers = [];
  let reg = null;
  let pendingCloud = null;
  let cloudInfo = { version: null, updated: null };

  /* ---------- 定时器注册 ---------- */
  function newReg() {
    timers.forEach(clearInterval);
    timers.length = 0;
    return { interval(fn, ms) { timers.push(setInterval(fn, ms)); }, onReload: null, onNewsFilter: null, onNewsReload: null };
  }

  /* ---------- 侧边导航 ---------- */
  function renderNav() {
    const collapsed = Store.get('nav_collapsed', {});
    UI.$('#nav').innerHTML = MENU.map(g => `
      <div class="nav-group ${collapsed[g.key] ? 'collapsed' : ''}" data-group="${g.key}">
        <button class="nav-group-title" data-toggle="${g.key}">
          <span class="ico">${g.icon}</span><span>${g.title}</span><span class="arrow">▼</span>
        </button>
        <div class="nav-items">
          ${g.items.map(it => {
            const badge = it.badge ? `<span class="badge">${it.badge}</span>` : '';
            const live = it.live ? `<span class="live" data-livenav="${it.live}"></span>` : '';
            /* href 项（如独立的周期总结页）走真实跳转，不参与 SPA 路由。
               自动拼当前版本参数 —— CDN 对不带参数 URL 有顽固边缘缓存，
               带版本参数可确保每次跳转都拿到最新页面（2026-09-08 缓存事故） */
            if (it.href) {
              const v = window.__APP_VER__ || '';
              const sep = it.href.indexOf('?') >= 0 ? '&' : '?';
              return `<a class="nav-item" href="${it.href}${sep}v=${v}"><span>${UI.esc(it.label)}</span>${badge}</a>`;
            }
            return `
            <button class="nav-item ${it.k === current ? 'active' : ''}" data-go="${it.k}">
              <span>${UI.esc(it.label)}</span>
              ${badge}
              ${live}
            </button>`;
          }).join('')}
        </div>
      </div>`).join('');
    paintNavLive();
  }

  /* 导航「实时」呼吸灯跟随各自市场真实交易时段：盘中红闪，休市灰点静止
     us=美股(美东时间) / asia=日韩(东京时间) / a=A股(含法定节假日休市表) */
  function paintNavLive() {
    const sessions = { us: Market.usSession(), asia: Market.asiaSession(), a: Market.aSession() };
    UI.$$('[data-livenav]').forEach(d => {
      const ss = sessions[d.dataset.livenav];
      if (!ss) return;
      d.classList.toggle('off', !ss.open);
      d.title = ss.text;
    });
  }

  /* ---------- 渲染页面 ---------- */
  function render(key, keepScroll) {
    const view = V[key];
    if (!view) { go('overnight'); return; }
    current = key;

    const scrollEl = UI.$('#pageScroll');
    const st = keepScroll ? scrollEl.scrollTop : 0;

    UI.$('#pageTitle').textContent = view.title;
    UI.$('#pageDesc').textContent = view.desc || '';
    try {
      UI.$('#page').innerHTML = view.render();
    } catch (e) {
      console.warn('view render error', key, e);
      UI.$('#page').innerHTML = `<div class="card"><div class="card-body">
        <div class="section-title">⚠️ 页面渲染异常（已自动保护，未白屏）</div>
        <div class="sub" style="margin-top:6px">本页在渲染本地数据时遇到问题：${UI.esc(e && e.message || '未知错误')}。多为旧版本遗留数据与新代码不兼容所致，您的数据仍完整保存在本地。</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-pink" onclick="App.refresh()">🔄 重试渲染</button>
          <button class="btn btn-sm btn-ghost" onclick="location.hash='#overnight'">🏠 返回首页</button>
        </div>
        <div class="sub" style="margin-top:10px">如反复出现，请到「数据管理」导出备份后，清除对应模块的历史记录。</div>
      </div></div>`;
    }
    UI.$$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.go === key));
    scrollEl.scrollTop = st;

    reg = newReg();
    if (view.mount) { try { view.mount(reg); } catch (e) { console.warn('mount error', e); } }
    autoGrow();
    UI.autosizeAll();
    Store.set('last_page', key);
  }

  function go(key) {
    if (location.hash !== '#' + key) { location.hash = key; }
    else render(key);
    closeDrawer();
  }
  function refresh() { render(current, true); }

  /* ---------- 抽屉 ---------- */
  function openDrawer() { UI.$('#sidebar').classList.add('open'); UI.$('#backdrop').classList.add('show'); }
  function closeDrawer() { UI.$('#sidebar').classList.remove('open'); UI.$('#backdrop').classList.remove('show'); }

  /* ---------- 自适应文本域高度 ---------- */
  function autoGrow() {
    UI.$$('textarea.cell-input').forEach(t => {
      t.style.height = 'auto';
      t.style.height = Math.min(120, Math.max(30, t.scrollHeight)) + 'px';
    });
  }

  /* ---------- 主题 ---------- */
  function applyTheme(k) {
    const t = THEMES[k] || THEMES.pink;
    const r = document.documentElement.style;
    r.setProperty('--pink', t.pink);
    r.setProperty('--pink-deep', t.deep);
    r.setProperty('--pink-soft', t.soft);
    r.setProperty('--pink-soft-2', t.soft2);
    r.setProperty('--pink-line', t.line);
    Store.set('theme', k);
  }

  /* ============================================================
     事件绑定
     ============================================================ */
  function bind() {
    // --- 输入（不重渲染，避免失焦） ---
    document.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.tk && el.dataset.id && el.dataset.f) {
        Store.updRow(el.dataset.tk, el.dataset.id, el.dataset.f, el.value);
        UI.recompute(el.dataset.tk, el.dataset.id, false);
        if (el.tagName === 'TEXTAREA') {
          if (el.classList.contains('rich-area')) UI.autosize(el);
          else { el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; }
        }
      } else if (el.dataset.note) {
        Store.set(el.dataset.note, el.value);
        if (el.tagName === 'TEXTAREA') UI.autosize(el);
        if (el.dataset.mdpreview) {
          const pv = UI.$('#' + el.dataset.mdpreview);
          if (pv) pv.innerHTML = UI.mdNews(el.value, el.dataset.mddomestic ? { domestic: true } : {});
        }
      } else if (el.dataset.kpi) {
        const d = Store.get('sentiment_kpi', SEED.sentimentKpi);
        d[el.dataset.kpi] = el.value;
        Store.set('sentiment_kpi', d);
        if (el.dataset.kpi === 'score') {
          const bar = UI.$('#senBar');
          if (bar) bar.style.width = Math.max(0, Math.min(100, parseFloat(el.value) || 0)) + '%';
        }
      }
    });

    // --- 变更（select / date 等，需重渲染统计） ---
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.tk && el.dataset.id && el.dataset.f) {
        Store.updRow(el.dataset.tk, el.dataset.id, el.dataset.f, el.value);
        UI.recompute(el.dataset.tk, el.dataset.id, true);
      }
    });

    // --- 点击 ---
    document.addEventListener('click', e => {
      const t = e.target;
      const hit = sel => t.closest(sel);

      // 导航
      const goBtn = hit('[data-go]');
      if (goBtn) { go(goBtn.dataset.go); return; }

      const tg = hit('[data-toggle]');
      if (tg) {
        const c = Store.get('nav_collapsed', {});
        c[tg.dataset.toggle] = !c[tg.dataset.toggle];
        Store.set('nav_collapsed', c);
        tg.closest('.nav-group').classList.toggle('collapsed');
        return;
      }

      // 快讯分类筛选（本地过滤，不重新请求）
      const nc = hit('[data-newscat]');
      if (nc) {
        Store.set('news_cat', nc.dataset.newscat);
        if (reg && reg.onNewsFilter) reg.onNewsFilter(); else refresh();
        return;
      }
      const nh = hit('[data-newshot]');
      if (nh) {
        Store.set('news_hot', !Store.get('news_hot', false));
        if (reg && reg.onNewsFilter) reg.onNewsFilter(); else refresh();
        return;
      }
      const ne = hit('[data-newsexp]');
      if (ne) {
        const k = 'news_exp_' + ne.dataset.newsexp;
        Store.set(k, !Store.get(k, false));
        if (reg && reg.onNewsFilter) reg.onNewsFilter(); else refresh();
        return;
      }

      // 要闻分类手风琴 展开/收起（仅切换 DOM，不重新请求）
      const ncoll = hit('[data-newscoll]');
      if (ncoll) {
        const k = ncoll.dataset.newscoll;
        const acc = ncoll.closest('.flash-acc');
        if (acc) {
          const collapsed = acc.classList.toggle('collapsed');
          Store.set('news_coll_' + k, !collapsed);
        }
        return;
      }

      // Tab
      const tab = hit('[data-tab]');
      if (tab) {
        const group = tab.closest('[data-tabs]');
        Store.set(group.dataset.tabs, tab.dataset.tab);
        refresh();
        return;
      }

      // 表格增删
      const add = hit('[data-add]');
      if (add) {
        const key = add.dataset.add;
        const cfg = UI.getTableCfg(key);
        const row = {};
        if (cfg) cfg.cols.forEach(c => {
          if (c.compute) return;
          row[c.k] = c.type === 'date' ? DT.today() : (c.type === 'select' ? (c.opts || [''])[0] : '');
        });
        Store.addRow(key, row);
        refresh();
        UI.toast('已添加一行');
        return;
      }
      const del = hit('[data-del]');
      if (del) {
        Store.delRow(del.dataset.tk, del.dataset.del);
        refresh();
        UI.toast('已删除');
        return;
      }

      // 纪律清单
      const disc = hit('[data-disc]');
      if (disc) {
        const key = 'discipline_' + DT.today();
        const s = Store.get(key, {});
        const i = disc.dataset.disc;
        s[i] = !s[i];
        Store.set(key, s);
        refresh();
        return;
      }
      const chk = hit('[data-check]');
      if (chk) {
        const key = chk.dataset.check + '_state';
        const s = Store.get(key, {});
        s[chk.dataset.i] = !s[chk.dataset.i];
        Store.set(key, s);
        refresh();
        return;
      }

      // 工具卡删除
      const td = hit('[data-tooldel]');
      if (td) { Store.delRow('tools_list', td.dataset.tooldel); refresh(); UI.toast('已删除'); return; }

      // 复制提示词
      const cp = hit('[data-copyprompt]');
      if (cp) { copy(SEED.prompts[cp.dataset.copyprompt].p); return; }

      // 市场情绪卡 点按编辑（涨停/跌停/炸板/连板/封板率/涨跌家数）
      const emo = hit('.emo-kpi[data-editable="1"]');
      if (emo) {
        const k = emo.dataset.k;
        const label = (emo.querySelector('.emo-label') || {}).textContent || '数值';
        const cur = (emo.querySelector('.emo-value') || {}).textContent || '';
        const input = prompt('修改「' + label + '」数值（留空取消）：', cur === '--' ? '' : cur);
        if (input == null) return;
        const v = input.trim();
        if (v === '') return;
        const d = Store.get('sentiment_kpi', {});
        d[k] = v;
        d._manualAt = Date.now();
        Store.set('sentiment_kpi', d);
        UI.toast('已更新「' + label + '」，5分钟内自动刷新不会覆盖');
        refresh();
        return;
      }

      // 动作
      const act = hit('[data-act]');
      if (act) { doAction(act.dataset.act, act); return; }
    });

    // 大盘总结文本框：用户手动编辑后标记为 touched，避免自动生成覆盖
    document.addEventListener('input', e => {
      if (e.target && e.target.id === 'ovSummaryText') { e.target.dataset.touched = '1'; UI.autosize(e.target); }
    });

    // 汉堡 / 遮罩
    UI.$('#hamburger').onclick = openDrawer;
    UI.$('#drawerClose').onclick = closeDrawer;
    UI.$('#backdrop').onclick = closeDrawer;
    UI.$('#modalClose').onclick = UI.closeModal;
    UI.$('#modalMask').onclick = e => { if (e.target.id === 'modalMask') UI.closeModal(); };
    UI.$('#refreshBtn').onclick = function () {
      this.classList.add('spin');
      if (reg && reg.onReload) Promise.resolve(reg.onReload()).finally(() => this.classList.remove('spin'));
      else { refresh(); setTimeout(() => this.classList.remove('spin'), 500); }
      UI.toast('已刷新');
    };

    window.addEventListener('hashchange', () => render((location.hash || '').slice(1) || 'overnight'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { UI.closeModal(); closeDrawer(); } });
  }

  /* ---------- 复制 ---------- */
  function copy(text) {
    const done = () => UI.toast('已复制到剪贴板');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { UI.toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
  }

  /* ============================================================
     具体动作
     ============================================================ */
  function doAction(a, el) {
    switch (a) {
      case 'reload-overnight': case 'reload-us': case 'reload-asia': case 'reload-outlook': case 'reload-sentiment':
        if (reg && reg.onReload) reg.onReload(); else refresh();
        UI.toast('正在刷新行情…');
        break;
      case 'reset-sentiment': {
        Store.set('sentiment_kpi', SEED.sentimentKpi);
        UI.toast('情绪数据已重置为示例值');
        refresh();
        break;
      }

      case 'reload-news':
        if (reg && reg.onNewsReload) { reg.onNewsReload(); UI.toast('正在拉取最新快讯…'); }
        else refresh();
        break;

      case 'parse-news-paste': {
        const ta = UI.$('#nwPaste');
        if (!ta || !ta.value.trim()) { UI.toast('请先粘贴新闻数据'); return; }
        const items = News.parsePaste(ta.value);
        if (!items.length) { UI.toast('未解析到有效新闻，请检查格式'); return; }
        News.savePaste(items);
        UI.toast('已保存 ' + items.length + ' 条新闻');
        refresh();
        break;
      }

      case 'auto-parse': {
        const kind = el && el.dataset.kind;
        const rawKey = el && el.dataset.raw;
        const targetKey = el && el.dataset.target;
        if (!kind || !rawKey || !targetKey) break;
        AI.organize(kind, rawKey, targetKey, () => refresh());
        break;
      }

      case 'mark-today': {
        const k = el && el.dataset.key;
        if (!k) break;
        Store.set(k + '_date', Market.tradingDay());
        UI.toast('已标记为今日收盘数据');
        refresh();
        break;
      }

      case 'gen-script': {
        UI.toast('正在生成底稿…');
        (async () => {
          await Market.quotes(['sh', 'sz', 'cyb']);
          const text = V.script.genTemplate();
          Store.set('script_text', text);
          Store.set('script_text_date', Market.tradingDay());
          refresh();
          UI.toast('已生成口播底稿模板');
        })();
        break;
      }
      case 'copy-script':
        copy(Store.get('script_text', ''));
        break;
      case 'archive-script': {
        const txt = Store.get('script_text', '');
        if (!txt.trim()) { UI.toast('底稿还是空的'); return; }
        Store.addRow('script_archive', {
          date: DT.today(), title: DT.cnDate() + ' 复盘',
          summary: txt.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 120), words: txt.length
        });
        refresh(); UI.toast('已归档');
        break;
      }
      case 'save-outlook': {
        const rec = V.outlook && V.outlook.lastRec;
        if (!rec) { UI.toast('行情还在加载，请稍候再保存'); return; }
        const r = OL.save(rec, true);
        UI.toast(r === 'updated' ? '已更新今日盘前总结' : '已保存今日盘前总结');
        if (V.outlook.paintArch) V.outlook.paintArch();
        break;
      }
      case 'del-outlook': {
        const id = el && el.dataset ? el.dataset.id : '';
        if (!id) { UI.toast('未找到该条记录'); return; }
        const list = Store.rows('outlook_archive', []);
        const rec = list.find(r => r.id === id);
        if (!rec) { UI.toast('记录不存在或已删除'); return; }
        if (!confirm('确定删除 ' + rec.date + ' 的盘前总结吗？删除后不可恢复。')) return;
        Store.set('outlook_archive', list.filter(r => r.id !== id));
        if (V.outlook.paintArch) V.outlook.paintArch(); else refresh();
        UI.toast('已删除 ' + rec.date + ' 的总结');
        break;
      }
      case 'save-summary': {
        const ta = UI.$('#ovSummaryText');
        if (ta) { Store.set('sentiment_summary', ta.value); ta.dataset.touched = '1'; UI.toast('当日总结已保存'); }
        else UI.toast('未找到总结文本');
        break;
      }
      case 'save-sentiment': {
        V.sentiment.saveArchive();
        break;
      }
      case 'del-sentiment': {
        const id = el && el.dataset ? el.dataset.id : '';
        if (!id) { UI.toast('未找到该条记录'); return; }
        const list = Store.rows('sentiment_archive', []);
        const rec = list.find(r => r.id === id);
        if (!rec) { UI.toast('记录不存在或已删除'); return; }
        if (!confirm('确定删除 ' + rec.date + ' 的大盘总览记录吗？删除后不可恢复。')) return;
        Store.set('sentiment_archive', list.filter(r => r.id !== id));
        refresh(); UI.toast('已删除 ' + rec.date + ' 的记录');
        break;
      }
      case 'img-outlook': {
        const id = el && el.dataset ? el.dataset.id : '';
        const rec = Store.rows('outlook_archive', []).find(r => r.id === id);
        if (!rec) { UI.toast('未找到该条记录'); return; }
        Snapshot.show(OL.imageDoc(rec));
        break;
      }
      case 'img-sentiment': {
        const id = el && el.dataset ? el.dataset.id : '';
        const rec = Store.rows('sentiment_archive', []).find(r => r.id === id);
        if (!rec) { UI.toast('未找到该条记录'); return; }
        Snapshot.show(V.sentiment.imageDoc(rec));
        break;
      }
      case 'save-daynote': {
        const ta = UI.$('#ovDayNote');
        if (!ta) { UI.toast('未找到小结文本'); return; }
        const snap = V.sentiment._snap || {};
        const date = (snap.e && snap.e._date) || Market.tradingDay();
        Store.set('sentiment_daynote', ta.value);
        Store.set('sentiment_daynote_date', date);
        UI.toast('当日小结已保存（' + date + '）');
        break;
      }
      case 'sl-add': {
        const code = (UI.$('#slCode') || {}).value || '';
        const name = (UI.$('#slName') || {}).value || '';
        if (!code.trim() && !name.trim()) { UI.toast('请填写代码或名称'); return; }
        Store.addRow('stock_logic', { code: code.trim(), name: name.trim(), drive: '', path: '', gap: '', risk: '', invalid: '', added: DT.stamp() });
        refresh(); UI.toast('已添加，点「数据体检」生成拆解底稿');
        break;
      }
      case 'sl-del': {
        const id = el && el.dataset ? el.dataset.id : '';
        const rec = Store.rows('stock_logic', []).find(r => r._id === id);
        if (!rec) { UI.toast('未找到该股'); return; }
        if (!confirm(`确定删除「${rec.name || rec.code}」的拆解记录吗？删除后不可恢复。`)) return;
        Store.delRow('stock_logic', id);
        refresh(); UI.toast('已删除');
        break;
      }
      case 'sl-scan': {
        const id = el && el.dataset ? el.dataset.id : '';
        if (id) V.holdings.scan(id);
        break;
      }
      case 'sl-scan-all':
        V.holdings.scanAll();
        break;
      case 'sl-img': {
        const id = el && el.dataset ? el.dataset.id : '';
        const rec = Store.rows('stock_logic', []).find(r => r._id === id);
        if (!rec) { UI.toast('未找到该股'); return; }
        Snapshot.show(V.holdings.imageDoc(rec));
        break;
      }
      case 'archive-note': {
        const txt = Store.get('notes_today', '');
        if (!txt.trim()) { UI.toast('今日心得还是空的'); return; }
        Store.addRow('notes_log', { date: DT.today(), topic: '每日复盘', type: '情绪', content: txt, rate: '★★' });
        Store.set('notes_today', '');
        refresh(); UI.toast('已存入笔记本');
        break;
      }
      case 'archive-week': {
        const txt = Store.get('mindset_week', '');
        if (!txt.trim()) { UI.toast('本周复盘还是空的'); return; }
        const cur = Store.get('mindset_cur', {});
        const score = ['fomo', 'patience', 'discipline', 'stop', 'calm'].reduce((s, k) => s + (parseInt(cur[k]) || 0), 0);
        Store.addRow('mindset_log', {
          week: DT.weekKey(), score, pnl: '',
          best: '', worst: '', fix: txt.slice(0, 120)
        });
        refresh(); UI.toast('已归档本周');
        break;
      }
      case 'save-discipline': {
        const items = SEED.discipline;
        const s = Store.get('discipline_' + DT.today(), {});
        const done = items.filter((_, i) => s[i]).length;
        const broken = items.filter((_, i) => !s[i]).map((it, i) => it.t).slice(0, 2).join('；');
        const rows = Store.rows('discipline_log', []);
        const exist = rows.find(r => r.date === DT.today());
        if (exist) {
          exist.done = done; exist.rate = Math.round(done / items.length * 100); exist.broken = broken;
          Store.set('discipline_log', rows);
        } else {
          Store.addRow('discipline_log', { date: DT.today(), done, rate: Math.round(done / items.length * 100), broken });
        }
        refresh(); UI.toast('已存入执行率记录');
        break;
      }
      case 'add-tool':
        UI.modal({
          title: '添加工具',
          body: `<div class="field" style="margin-bottom:10px"><label>图标（Emoji）</label><input id="tIcon" value="🔧" maxlength="4"></div>
                 <div class="field" style="margin-bottom:10px"><label>名称</label><input id="tName" placeholder="工具名称"></div>
                 <div class="field" style="margin-bottom:10px"><label>说明</label><input id="tDesc" placeholder="它能帮你做什么"></div>
                 <div class="field"><label>链接</label><input id="tUrl" placeholder="https://"></div>`,
          buttons: [{ label: '取消' }, {
            label: '添加', cls: 'btn-solid', onClick: () => {
              const name = UI.$('#tName').value.trim();
              if (!name) { UI.toast('请填写名称'); return false; }
              Store.addRow('tools_list', {
                icon: UI.$('#tIcon').value.trim() || '🔧', name,
                desc: UI.$('#tDesc').value.trim(), url: UI.$('#tUrl').value.trim()
              });
              refresh(); UI.toast('已添加');
            }
          }]
        });
        break;

      case 'data-manage': dataManage(); break;
      case 'template': templateSetting(); break;
      case 'sync-cloud': syncCloud(); break;
      case 'export-json': {
        const blob = new Blob([Store.exportAll()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `过儿的工作台_备份_${DT.today()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        UI.toast('备份文件已导出');
        break;
      }
      case 'import-json': {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            try { Store.importAll(rd.result, false); UI.closeModal(); refresh(); renderNav(); UI.toast('导入成功'); }
            catch (err) { UI.toast('导入失败：' + err.message); }
          };
          rd.readAsText(f);
        };
        inp.click();
        break;
      }
      case 'copy-json': copy(Store.exportAll()); break;
      case 'clear-all':
        UI.confirm('确定要清空全部本地数据吗？此操作不可恢复，建议先导出备份。', () => {
          Store.clearAll(); location.reload();
        });
        break;
      case 'reset-seed':
        UI.confirm('恢复示例数据会覆盖当前页面对应的表格内容，确定继续？', () => {
          ['overnight_news_a', 'overnight_news_us', 'overnight_news_fed', 'overnight_news_oil',
            'themes_main', 'themes_ladder', 'dragon_inst', 'dragon_hot', 'opportunity',
            'risk', 'risk_blacklist', 'holdings', 'notes_log', 'routine_log', 'mindset_log',
            'goal_history', 'materials', 'tools_list', 'journal', 'sentiment_log', 'outlook_scenario']
            .forEach(k => Store.del(k));
          UI.closeModal(); refresh(); UI.toast('已恢复示例数据');
        });
        break;
    }
  }

  /* ---------- 数据管理弹窗 ---------- */
  function dataManage() {
    const localV = Store.get('content_version', null);
    const updated = Store.get('content_updated', '');
    const hasNew = cloudInfo.version && cloudInfo.version !== localV;
    UI.modal({
      title: '数据管理',
      body: `
        <div class="kpi-grid" style="margin-bottom:14px">
          <div class="kpi"><div class="label">本地占用</div><div class="value" style="font-size:18px">${Store.sizeKB()} KB</div></div>
          <div class="kpi"><div class="label">数据条目</div><div class="value" style="font-size:18px">${Store.keyCount()}</div></div>
        </div>

        <div class="section-title">云端复盘内容</div>
        <div class="notice info" style="margin-bottom:10px">
          复盘模板内容由云端统一下发，更新后点「同步」即可在手机上<b>实时生效</b>。<br>
          本地版本：<b>v${localV || '—'}</b> · 云端版本：<b>v${cloudInfo.version || '—'}</b>${updated ? ' · 更新于 ' + UI.esc(updated) : ''}
        </div>
        <button class="btn ${hasNew ? 'btn-solid' : 'btn-ghost'}" data-act="sync-cloud" style="margin-bottom:14px">
          🔄 同步云端内容${hasNew ? '（有新版本）' : ''}
        </button>

        <div class="notice info" style="margin-bottom:0">
          个人数据（持仓 / 笔记 / 打卡 / 心态 / 实盘等）仅保存在<b>本机浏览器</b>，不会上传任何服务器。换设备或清理缓存前，请先导出备份。
        </div>
        <div class="section-title">操作</div>
        <div style="display:flex;flex-wrap:wrap;gap:9px">
          <button class="btn btn-solid" data-act="export-json">⬇ 导出备份</button>
          <button class="btn btn-ghost" data-act="import-json">⬆ 导入备份</button>
          <button class="btn btn-ghost" data-act="copy-json">📋 复制 JSON</button>
          <button class="btn btn-ghost" data-act="reset-seed">↺ 恢复示例数据</button>
          <button class="btn btn-ghost" style="color:var(--up)" data-act="clear-all">🗑 清空全部</button>
        </div>`,
      buttons: [{ label: '完成', cls: 'btn-pink' }]
    });
  }

  /* ---------- 自定义模板弹窗 ---------- */
  function templateSetting() {
    const cur = Store.get('theme', 'pink');
    const sub = Store.get('brand_sub', '交易 · 生活 · 成长');
    const home = Store.get('home_page', 'overnight');
    UI.modal({
      title: '自定义模板',
      body: `
        <div class="section-title">主题色</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${Object.entries(THEMES).map(([k, t]) => `
            <button class="btn ${k === cur ? 'btn-solid' : 'btn-ghost'}" data-theme="${k}"
              style="display:flex;align-items:center;gap:7px">
              <span style="width:12px;height:12px;border-radius:50%;background:${t.pink};display:inline-block"></span>${t.name}
            </button>`).join('')}
        </div>

        <div class="section-title">侧边栏副标题</div>
        <div class="field"><input id="tplSub" value="${UI.esc(sub)}" placeholder="交易 · 生活 · 成长"></div>

        <div class="section-title">默认打开页面</div>
        <div class="field"><select id="tplHome">
          ${MENU.map(g => `<optgroup label="${g.icon} ${g.title}">${g.items.map(i =>
        `<option value="${i.k}" ${i.k === home ? 'selected' : ''}>${UI.esc(i.label)}</option>`).join('')}</optgroup>`).join('')}
        </select></div>

        <div class="section-title">口播底稿模板</div>
        <div class="notice info" style="margin-bottom:0">
          在「当日复盘口播底稿」页点击<b>一键生成模板</b>，系统会自动带入当日情绪 KPI、主线题材、连板梯队、机会与风险清单，生成六段式底稿。
        </div>`,
      buttons: [{ label: '取消' }, {
        label: '保存', cls: 'btn-solid', onClick: () => {
          Store.set('brand_sub', UI.$('#tplSub').value.trim() || '交易 · 生活 · 成长');
          Store.set('home_page', UI.$('#tplHome').value);
          UI.$('#brandSub').textContent = Store.get('brand_sub');
          UI.toast('已保存');
        }
      }]
    });
    UI.$$('[data-theme]').forEach(b => b.onclick = () => {
      applyTheme(b.dataset.theme);
      UI.$$('[data-theme]').forEach(x => { x.className = 'btn btn-ghost'; x.style.display = 'flex'; x.style.alignItems = 'center'; x.style.gap = '7px'; });
      b.className = 'btn btn-solid';
      b.style.display = 'flex'; b.style.alignItems = 'center'; b.style.gap = '7px';
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    applyTheme(Store.get('theme', 'pink'));
    UI.$('#brandSub').textContent = Store.get('brand_sub', '交易 · 生活 · 成长');

    const hash = (location.hash || '').slice(1);
    current = V[hash] ? hash : Store.get('home_page', 'overnight');
    renderNav();
    render(current);
    bind();

    // 云端内容：首次自动写入 / 有新版本提示同步
    bootstrapContent();

    // 时钟
    const tick = () => { const c = UI.$('#clock'); if (c) c.textContent = DT.cnDate() + '  ' + DT.clock(); };
    tick(); setInterval(tick, 1000);

    // 导航实时灯每分钟校准一次（跟随美股开收盘状态变化）
    setInterval(paintNavLive, 60000);

    // 版本自愈：后台轮询 version.json，发现已部署新版就清缓存并重载。
    // 解决「代码/数据明明已更新，用户页面却一直是旧的」这类缓存问题。
    startVersionWatch();

    // PWA —— 注册 URL 带版本号，改动后浏览器会重新拉取并激活新 SW
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js?v=' + (window.__APP_VER__ || ''))
          .then(reg => {
            // 发现新版 SW 立即 skipWaiting，并在接管后刷新页面，避免用户一直运行旧版代码
            reg.addEventListener('updatefound', () => {
              const newSw = reg.installing;
              if (!newSw) return;
              newSw.addEventListener('statechange', () => {
                if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
                  newSw.postMessage({ action: 'skipWaiting' });
                }
              });
            });
          }).catch(() => { });
        let refreshed = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshed) return;
          refreshed = true;
          // 新版 SW 接管时，丢弃可能已被旧版代码污染的实时情绪缓存，确保加载干净数据
          try { Store.del('sentiment_kpi'); } catch (e) { }
          window.location.reload();
        });
      });
    }
  }

  /* ---------- 版本自愈 ----------
     每 60 秒拉一次 version.json（no-store，绕过一切缓存）。
     若线上版本与本次加载的 window.__APP_VER__ 不一致，说明已部署新版，
     则注销旧 Service Worker、清空 Cache Storage，然后重载页面。
     这样用户不需要手动 Ctrl+Shift+R，也不会再出现「改了但页面没变」。 */
  function startVersionWatch() {
    const MY_VER = window.__APP_VER__ || '';
    let reloading = false;

    async function forceUpgrade(reason) {
      if (reloading) return;
      reloading = true;
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch (e) { /* 清缓存失败也要重载，浏览器仍会走网络拿新资源 */ }
      try { Store.del('sentiment_kpi'); } catch (e) { }
      console.log('[版本自愈] ' + reason + '，正在重载…');
      window.location.reload();
    }

    async function check() {
      try {
        const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (j && j.ver && MY_VER && j.ver !== MY_VER) {
          forceUpgrade('线上版本 ' + j.ver + ' ≠ 当前 ' + MY_VER);
        }
      } catch (e) { /* 网络异常或文件不存在时静默跳过，不影响正常使用 */ }
    }

    setTimeout(check, 8000);            // 启动 8 秒后先查一次
    setInterval(check, 60000);          // 之后每分钟查一次
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();    // 切回前台立即查一次
    });
  }

  /* ---------- 云端内容同步 ---------- */
  async function bootstrapContent() {
    let cloud = null;
    try { cloud = await Seed.fetchCloud(); } catch (e) { cloud = null; }
    if (!cloud) return;
    cloudInfo = { version: cloud.version, updated: cloud.updatedAt || '' };
    const stored = Store.get('content_version', null);
    if (stored === null) {
      applyCloud(cloud);
    } else if (stored !== cloud.version) {
      pendingCloud = cloud;
      UI.toast('发现新版本复盘内容', { label: '立即同步', onClick: syncCloud });
    }
  }

  function applyCloud(cloud) {
    const td = Market.tradingDay();
    Seed.CLOUD_KEYS.forEach(k => {
      const v = cloud.content[k];
      if (v === undefined) return;
      if (Array.isArray(v)) Store.set(k, v.map(o => Object.assign({ _id: Store.uid() }, o)));
      else Store.set(k, v);
      Store.set(k + '_date', td);   // 标记数据所属交易日
    });
    Store.set('content_version', cloud.version);
    Store.set('content_updated', cloud.updatedAt || '');
    pendingCloud = null;
  }

  async function syncCloud() {
    let cloud = pendingCloud;
    if (!cloud) { try { cloud = await Seed.fetchCloud(); } catch (e) { cloud = null; } }
    if (!cloud) { UI.toast('同步失败，请检查网络'); return; }
    applyCloud(cloud);
    UI.toast('已同步最新复盘内容');
    refresh();
  }

  return { init, go, refresh, render, applyTheme, copy };
})();

document.addEventListener('DOMContentLoaded', App.init);
