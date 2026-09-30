const inspTag = r => ({ none: '<span class="tag gray">未检测</span>', pass: '<span class="tag green">合格</span>', fail: '<span class="tag red">不合格</span>' })[r] || '';
const patrolTag = r => ({ pass: ['巡检正常', 'green'], problem: ['发现问题', 'red'], rectified: ['已整改', 'amber'] }[r] || [r, 'gray']);

async function init() {
  if (!localStorage.getItem('mt_token')) location.href = 'login.html';
  await loadDashboard();
}
async function loadDashboard() {
  const d = await api('/api/admin/dashboard');
  $('#who').textContent = '今日 ' + d.today;
  const c = d.counts;
  $('#stats').innerHTML = [
    ['全市场批次', d.totals.batches, 's-green'], ['临期批次', c.near_expiry || 0, 's-amber'],
    ['已过期批次', c.expired || 0, 's-red'], ['检测不合格批', d.totals.failed, 's-red'],
    ['在售摊位数', d.totals.stalls, 's-green'], ['处置待核验', d.totals.unconfirmedDisposals, 's-amber']
  ].map(([t, n, cl]) => '<div class="stat"><div class="n ' + cl + '">' + n + '</div><div class="t">' + t + '</div></div>').join('');
  $('#alertRows').innerHTML = d.alerts.length ? d.alerts.map(b =>
    '<tr><td>' + esc(b.expiryDate) + '</td><td><b>' + esc(b.code) + '</b></td><td>' + esc(b.productName) + '</td><td>' + esc(b.stallName) + '（' + esc(b.stallNo) + '）</td><td>' + b.remainingQty + esc(b.unit) + '</td><td>' + inspTag(b.inspectionResult) + '</td><td>' + statusTag(b.status) + '</td><td><button class="btn sm ghost" onclick="openBatch(' + b.id + ')">巡检处理</button></td></tr>'
  ).join('') : '<tr><td colspan="8" class="empty">没有临期/过期批次</td></tr>';
  $('#patrolRows').innerHTML = d.recentPatrols.length ? d.recentPatrols.map(p => {
    const [t, cl] = patrolTag(p.result);
    return '<tr><td>' + esc(p.date) + '</td><td>' + esc(p.stallName) + '</td><td>' + esc(p.batchCode) + ' ' + esc(p.productName) + '</td><td><span class="tag ' + cl + '">' + t + '</span></td><td>' + esc(p.content) + '</td><td>' + esc(p.action || '—') + '</td></tr>';
  }).join('') : '<tr><td colspan="6" class="empty">暂无巡检记录</td></tr>';
}

// 扫码 / 手输批次号
function resolveCode(raw) {
  const m = String(raw).match(/[?&]c=([^&\s]+)/i);
  const code = (m ? decodeURIComponent(m[1]) : raw).trim().toUpperCase();
  api('/api/admin/batches?q=' + encodeURIComponent(code)).then(rows => {
    const exact = rows.find(r => r.code === code);
    if (exact) { openBatch(exact.id); switchTab('dash'); }
    else toast('未找到批次 ' + code, true);
  });
}
$('#scanBtn').onclick = () => scanQR(resolveCode);
$('#manualBtn').onclick = () => { const v = $('#manualCode').value.trim(); if (v) resolveCode(v); };
$('#manualCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#manualBtn').click(); });

// ---- 批次巡检详情 ----
async function openBatch(id) {
  const d = await api('/api/admin/batches/' + id);
  const b = d.batch;
  modal('<h3>批次巡检 · ' + esc(b.code) + ' ' + statusTag(b.status) + '</h3>'
    + '<dl class="kv">'
    + '<dt>商品</dt><dd>' + esc(b.productName) + '（' + esc(b.category) + '）</dd>'
    + '<dt>摊位</dt><dd>' + esc(b.stallName) + '（摊位号 ' + esc(b.stallNo) + '）</dd>'
    + '<dt>供应商</dt><dd>' + esc(d.supplier ? d.supplier.name : b.supplierName) + '</dd>'
    + '<dt>产地</dt><dd>' + esc(d.supplier ? d.supplier.origin : '') + '</dd>'
    + '<dt>供应商资质</dt><dd>' + esc(d.supplier ? (d.supplier.license || '未登记') : '') + '</dd>'
    + '<dt>供应商联系</dt><dd>' + esc(d.supplier ? ((d.supplier.contact || '') + ' ' + (d.supplier.phone || '')) : '') + '</dd>'
    + '<dt>进货/到期</dt><dd>' + esc(b.purchaseDate) + ' 进 ｜ 生产 ' + esc(b.productionDate) + ' ｜ 到期 ' + esc(b.expiryDate) + '</dd>'
    + '<dt>库存</dt><dd>剩余 <b>' + b.remainingQty + esc(b.unit) + '</b> / 进货 ' + b.quantity + esc(b.unit) + (b.purchasePrice != null ? ' ｜ 进货价 ' + b.purchasePrice + '元/' + esc(b.unit) : '') + '</dd>'
    + (b.note ? '<dt>摊主备注</dt><dd>' + esc(b.note) + '</dd>' : '') + '</dl>'
    + '<h4 style="margin:12px 0 8px">检测记录（自检 + 市场抽检）</h4>'
    + (d.inspections.length ? d.inspections.map(i => '<div class="pill"><span class="tag ' + (i.result === 'pass' ? 'green' : i.result === 'fail' ? 'red' : 'amber') + '">' + esc(i.resultText) + '</span>' + esc(i.inspectionDate) + ' ' + esc(i.inspectorTypeText) + ' · ' + esc(i.inspector) + '：' + esc(i.items || '') + '</div>').join('') : '<p class="muted">暂无检测记录</p>')
    + (d.patrols.length ? '<h4 style="margin:12px 0 8px">巡检记录</h4>' + d.patrols.map(p => '<div class="pill">' + esc(p.date) + '：' + esc(p.content) + (p.action ? '（' + esc(p.action) + '）' : '') + '</div>').join('') : '')
    + (d.disposal ? '<h4 style="margin:12px 0 8px">临期处置</h4><p>' + esc(d.disposal.date) + ' ' + esc(d.disposal.method) + ' ' + d.disposal.qty + esc(b.unit) + '，原因：' + esc(d.disposal.reason) + '，操作人：' + esc(d.disposal.operator) + (d.disposal.marketConfirmed ? ' <span class="tag green">市场已确认</span>' : ' <span class="tag amber">待确认</span>') + '</p>' : '')
    + '<h4 style="margin:12px 0 8px">库存流水</h4><div class="tbl-wrap"><table><thead><tr><th>日期</th><th>类型</th><th>变动</th><th>结余</th><th>原因</th></tr></thead><tbody>'
    + d.logs.map(l => '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.typeText) + '</td><td>' + (l.changeQty > 0 ? '+' : '') + l.changeQty + '</td><td>' + l.qtyAfter + '</td><td>' + esc(l.reason) + '</td></tr>').join('')
    + '</tbody></table></div>'
    + '<div class="row" style="margin-top:14px">'
    + '<button class="btn sm" id="inspBtn">录入市场抽检</button>'
    + '<button class="btn ghost sm" id="patrolBtn">填写巡检记录</button>'
    + (d.disposal && !d.disposal.marketConfirmed ? '<button class="btn amber sm" id="confirmBtn" data-code="' + b.code + '">现场核验处置</button>' : '')
    + '<a class="btn gray sm" href="' + d.qrUrl.replace('/api/public/qr/', '/trace.html?c=') + '" target="_blank">消费者页预览</a>'
    + '<button class="btn gray sm" onclick="closeModal()">关闭</button></div>');
  $('#inspBtn').onclick = () => inspForm(b.id);
  $('#patrolBtn').onclick = () => patrolForm(b.id);
  if ($('#confirmBtn')) $('#confirmBtn').onclick = () => confirmDisposal($('#confirmBtn').dataset.code);
}
window.openBatch = openBatch;

function inspForm(id) {
  modal('<h3>录入市场抽检结果</h3><div class="row"><div><label>抽检日期</label><input id="f_date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div><div><label>结果</label><select id="f_result"><option value="pass">合格</option><option value="fail">不合格（强制下架）</option></select></div></div>'
    + '<label>抽检项目与结果</label><textarea id="f_items" rows="3" placeholder="如：农残快检抑制率 22%，合格"></textarea>'
    + '<p class="muted" style="margin-top:8px">判定不合格时系统将自动强制下架销毁并生成巡检记录。</p>'
    + '<div class="row" style="margin-top:12px"><button class="btn gray" onclick="openBatch(' + id + ')">返回</button><button class="btn" id="ok">提交抽检</button></div>');
  $('#ok').onclick = async () => {
    try {
      await api('/api/admin/batches/' + id + '/inspection', { method: 'POST', body: JSON.stringify({ inspectionDate: $('#f_date').value, result: $('#f_result').value, items: $('#f_items').value }) });
      toast('抽检结果已录入'); closeModal(); await refreshAll();
    } catch (e) { toast(e.message, true); }
  };
}
function patrolForm(id) {
  modal('<h3>填写巡检记录</h3><div class="row"><div><label>巡检日期</label><input id="f_date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>'
    + '<div><label>巡检结果</label><select id="f_result"><option value="pass">巡检正常</option><option value="problem">发现问题</option><option value="rectified">问题已整改</option></select></div></div>'
    + '<label>巡检情况</label><textarea id="f_content" rows="3" placeholder="如：卫生良好，索证索票齐全 / 黄瓜农残临界，已下架复检"></textarea>'
    + '<label>现场处理措施</label><input id="f_action" placeholder="如：要求当日售完 / 已销毁报损3斤">'
    + '<div class="row" style="margin-top:12px"><button class="btn gray" onclick="openBatch(' + id + ')">返回</button><button class="btn" id="ok">提交巡检</button></div>');
  $('#ok').onclick = async () => {
    try {
      await api('/api/admin/batches/' + id + '/patrol', { method: 'POST', body: JSON.stringify({ date: $('#f_date').value, result: $('#f_result').value, content: $('#f_content').value, action: $('#f_action').value }) });
      toast('巡检记录已提交'); closeModal(); await refreshAll();
    } catch (e) { toast(e.message, true); }
  };
}
async function confirmDisposal(code) {
  const recs = await api('/api/admin/disposals');
  const row = recs.find(r => r.batchCode === code && !r.marketConfirmed);
  if (!row) return toast('未找到待确认的处置记录', true);
  await api('/api/admin/disposals/' + row.id + '/confirm', { method: 'POST' });
  toast('已现场核验确认'); closeModal(); await refreshAll();
}

// ---- 全市场批次 ----
async function loadBatches() {
  const q = $('#kw').value.trim(), s = $('#fStatus').value;
  const rows = await api('/api/admin/batches?q=' + encodeURIComponent(q) + '&status=' + encodeURIComponent(s));
  $('#batchRows').innerHTML = rows.length ? rows.map(b =>
    '<tr><td><b>' + esc(b.code) + '</b></td><td>' + esc(b.productName) + '</td><td>' + esc(b.stallName) + '<br><span class="muted">' + esc(b.stallNo) + '</span></td><td>' + esc(b.supplierName) + '</td><td>' + esc(b.purchaseDate) + '</td><td>' + esc(b.expiryDate) + '</td><td>' + b.remainingQty + esc(b.unit) + '</td><td>' + inspTag(b.inspectionResult) + '</td><td>' + statusTag(b.status) + '</td><td><button class="btn sm ghost" onclick="openBatch(' + b.id + ')">巡检</button></td></tr>'
  ).join('') : '<tr><td colspan="10" class="empty">没有符合条件的批次</td></tr>';
}
$('#searchBtn').onclick = loadBatches;
$('#kw').addEventListener('keydown', e => { if (e.key === 'Enter') loadBatches(); });
$('#fStatus').onchange = loadBatches;

// ---- 处置核验 ----
async function loadDisposals(pendingOnly) {
  const rows = await api('/api/admin/disposals' + (pendingOnly ? '?pending=1' : ''));
  $('#dispRows').innerHTML = rows.length ? rows.map(d =>
    '<tr><td>' + esc(d.date) + '</td><td>' + esc(d.stallName) + '（' + esc(d.stallNo) + '）</td><td>' + esc(d.batchCode) + ' ' + esc(d.productName) + '</td><td><span class="tag ' + (d.method === '销毁' ? 'red' : d.method === '退货' ? 'blue' : 'amber') + '">' + esc(d.method) + '</span></td><td>' + d.qty + esc(d.unit) + '</td><td>' + esc(d.reason) + '</td><td>' + esc(d.operator) + '</td><td>' + (d.marketConfirmed ? '<span class="tag green">已确认·' + esc(d.confirmedBy) + '</span>' : '<span class="tag amber">待确认</span>') + '</td><td>' + (!d.marketConfirmed ? '<button class="btn sm amber" onclick="confirmOne(' + d.id + ')">核验确认</button>' : '') + '</td></tr>'
  ).join('') : '<tr><td colspan="9" class="empty">暂无处置记录</td></tr>';
}
async function confirmOne(id) {
  await api('/api/admin/disposals/' + id + '/confirm', { method: 'POST' });
  toast('处置已核验确认'); await refreshAll();
}
window.confirmOne = confirmOne;
$('#allDisp').onclick = function () { $$('#disposalsTab .tabs button').forEach(x => x.classList.remove('on')); this.classList.add('on'); loadDisposals(false); };
$('#pendDisp').onclick = function () { $$('#disposalsTab .tabs button').forEach(x => x.classList.remove('on')); this.classList.add('on'); loadDisposals(true); };

// ---- 摊位名册 ----
async function loadStalls() {
  const rows = await api('/api/admin/stalls');
  $('#stallRows').innerHTML = rows.map(s =>
    '<tr><td><b>' + esc(s.stallNo) + '</b></td><td>' + esc(s.name) + '</td><td>' + esc(s.category) + '</td><td>' + esc(s.owner) + '</td><td>' + esc(s.phone) + '</td><td>' + esc(s.businessLicense) + '</td><td><span class="tag green">营业中</span></td></tr>'
  ).join('');
}

function switchTab(tab) {
  $$('.top nav a[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  ['dash', 'batches', 'disposals', 'stalls'].forEach(k => $('#' + k + 'Tab').style.display = k === tab ? '' : 'none');
  if (tab === 'batches') loadBatches();
  if (tab === 'disposals') loadDisposals(false);
  if (tab === 'stalls') loadStalls();
}
document.querySelector('.top nav').addEventListener('click', e => {
  const t = e.target.closest('a[data-tab]'); if (!t) return;
  e.preventDefault(); switchTab(t.dataset.tab);
});
async function refreshAll() {
  await loadDashboard();
  if ($('#batchesTab').style.display !== 'none') loadBatches();
  if ($('#disposalsTab').style.display !== 'none') loadDisposals($('#pendDisp').classList.contains('on'));
}
$('#logout').onclick = e => { e.preventDefault(); localStorage.removeItem('mt_token'); location.href = '/index.html'; };
init();
