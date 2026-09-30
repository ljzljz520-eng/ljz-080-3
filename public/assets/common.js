// 通用工具
window.api = async function (url, opts = {}) {
  const token = localStorage.getItem('mt_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
};

window.toast = function (msg, isErr) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast' + (isErr ? ' err' : ''), 2400);
};

window.fmtDateTime = function (s) { return s || '—'; };
window.todayStr = function () { return new Date().toISOString().slice(0, 11); };
window.nowStr = function () {
  const d = new Date();
  return d.toISOString().slice(0, 16).replace('T', ' ');
};
window.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};
window.logout = async function () {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  localStorage.removeItem('mt_token');
  location.href = '/';
};

window.STATUS_BADGE = {
  on_sale: ['green', '在售'], sold_out: ['gray', '已售罄'], handled: ['blue', '已临期处理'],
  recalled: ['red', '已召回'], destroyed: ['red', '已销毁']
};
window.EXP_BADGE = {
  fresh: ['green', '新鲜'], near: ['amber', '临期'],
  expiring_today: ['amber', '今日到期'], expired: ['red', '已过期']
};
window.RESULT_BADGE = { pass: ['green', '合格'], fail: ['red', '不合格'], pending: ['gray', '待检测'] };
window.ORIGIN_TEXT = { base: '自有基地直供', wholesale: '批发市场采购', farm: '农户直收', supplier: '供应商配送' };
window.HANDLE_TEXT = { discount: '折价促销', discount_done: '折价售完', discard: '丢弃/报损', destroy: '无害化销毁', recall: '召回下架' };
window.INSP_TEXT = { pass: '检查合格', rectify: '限期整改', fail: '检查不合格' };
