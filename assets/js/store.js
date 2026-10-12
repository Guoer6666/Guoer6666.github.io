/* ============================================================
   store.js · 本地数据层（localStorage）
   ============================================================ */
const Store = (() => {
  const NS = 'guoer_workbench_v1';
  let cache = null;

  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(NS) || '{}'); }
    catch (e) { cache = {}; }
    return cache;
  }
  let timer = null;
  function flush() {
    try { localStorage.setItem(NS, JSON.stringify(cache || {})); }
    catch (e) { console.warn('保存失败', e); }
  }
  function save() { clearTimeout(timer); timer = setTimeout(flush, 220); }

  function get(key, dft) {
    const d = load();
    return key in d ? d[key] : (typeof dft === 'function' ? dft() : dft);
  }
  function set(key, val) { load()[key] = val; save(); return val; }
  function del(key) { delete load()[key]; save(); }

  /* ---------- 表格 CRUD ---------- */
  function rows(key, seed) {
    let r = get(key, null);
    if (!Array.isArray(r)) { r = (seed || []).map(withId); set(key, r); }
    return r;
  }
  function withId(o) { return Object.assign({ _id: uid() }, o); }
  function addRow(key, row) { const r = rows(key); r.push(withId(row || {})); set(key, r); return r; }
  function delRow(key, id) { set(key, rows(key).filter(x => x._id !== id)); }
  function updRow(key, id, field, val) {
    const r = rows(key), t = r.find(x => x._id === id);
    if (t) { t[field] = val; set(key, r); }
    return t;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- 导入 / 导出 ---------- */
  function exportAll() {
    return JSON.stringify({
      app: '过儿的工作台', version: 1,
      exportedAt: new Date().toISOString(), data: load()
    }, null, 2);
  }
  function importAll(text, merge) {
    const parsed = JSON.parse(text);
    const d = parsed && parsed.data ? parsed.data : parsed;
    if (typeof d !== 'object' || d === null) throw new Error('格式不正确');
    cache = merge ? Object.assign(load(), d) : d;
    flush();
    return true;
  }
  function clearAll() { cache = {}; flush(); }
  function sizeKB() {
    try { return (new Blob([localStorage.getItem(NS) || '']).size / 1024).toFixed(1); }
    catch (e) { return '0'; }
  }
  function keyCount() { return Object.keys(load()).length; }

  return { get, set, del, rows, addRow, delRow, updRow, uid, exportAll, importAll, clearAll, sizeKB, keyCount };
})();

/* ============================================================
   日期时间工具
   ============================================================ */
const DT = {
  pad: n => String(n).padStart(2, '0'),
  today() { const d = new Date(); return `${d.getFullYear()}-${DT.pad(d.getMonth() + 1)}-${DT.pad(d.getDate())}`; },
  now() { const d = new Date(); return `${DT.pad(d.getHours())}:${DT.pad(d.getMinutes())}`; },
  clock() { const d = new Date(); return `${DT.pad(d.getHours())}:${DT.pad(d.getMinutes())}:${DT.pad(d.getSeconds())}`; },
  stamp() { return DT.today() + ' ' + DT.clock(); },
  cnDate() {
    const d = new Date(), w = '日一二三四五六'[d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${w}`;
  },
  /** A股休市日期（2026年示例，后续可按交易所公告维护）。周末已单独判断。 */
  _holidays: new Set([
    '2026-01-01',                        // 元旦
    '2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-21','2026-02-22','2026-02-23','2026-02-24','2026-02-25', // 春节
    '2026-04-04','2026-04-05','2026-04-06', // 清明
    '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05', // 劳动节
    '2026-06-19','2026-06-20','2026-06-21', // 端午
    '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08'  // 中秋国庆
  ]),
  fmtDate(d) { return `${d.getFullYear()}-${DT.pad(d.getMonth() + 1)}-${DT.pad(d.getDate())}`; },
  isTradeDay(d) {
    const date = d || new Date();
    const str = typeof date === 'string' ? date : DT.fmtDate(date);
    const day = new Date(str).getDay();
    if (day === 0 || day === 6) return false;
    return !DT._holidays.has(str);
  },
  /** 返回最近一个 A 股交易日 Date 对象。规则：
   *  1) 周末/节假日回退到上一个交易日；
   *  2) 交易日 9:30 之前仍显示上一交易日（盘前未开盘）；
   *  3) 交易日 9:30-15:00 显示当天；15:00 后仍显示当天（收盘后）。 */
  tradeDate(d) {
    const now = d || new Date();
    const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hh = now.getHours(), mm = now.getMinutes();
    const marketOpen = DT.isTradeDay(cur) && (hh > 9 || (hh === 9 && mm >= 30));
    if (marketOpen) return cur;
    do { cur.setDate(cur.getDate() - 1); } while (!DT.isTradeDay(cur));
    return cur;
  },
  tradeToday() { const d = DT.tradeDate(); return DT.fmtDate(d); },
  tradeCnDate() { const d = DT.tradeDate(); return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`; },
  monthKey() { const d = new Date(); return `${d.getFullYear()}-${DT.pad(d.getMonth() + 1)}`; },
  weekKey() {
    const d = new Date(), s = new Date(d.getFullYear(), 0, 1);
    const w = Math.ceil(((d - s) / 86400000 + s.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${DT.pad(w)}`;
  },
  /** 距离下一个 HH:mm 的毫秒数 */
  msUntil(hh, mm) {
    const now = new Date(), t = new Date();
    t.setHours(hh, mm, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t - now;
  },
  fmtCountdown(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    return h > 0 ? `${DT.pad(h)}:${DT.pad(m)}:${DT.pad(ss)}` : `${DT.pad(m)}:${DT.pad(ss)}`;
  }
};
