let D = null, curFilter = '';
const inspTag = r => ({ none: '<span class="tag gray">未检测</span>', pending: '<span class="tag amber">待检测</span>', pass: '<span class="tag green">合格</span>', fail: '<span class="tag red">不合格</span>' })[r] || '';

async function init() {
  if (!localStorage.getItem('mt_token')) location.href = 'login.html';
  try { D = await api('/api/owner/init'); } catch (e) { return; }
  $('#stallInfo').textContent = D.stall.stallNo + ' ' + D.stall.name;
  renderStats(); renderBatches(); renderInv(); renderArchive();
}
function renderStats() {
  const c = D.stats.counts;
  $('#stats').innerHTML = [
    ['在管批次', D.stats.active, 's-green'], ['临期预警', c.near_expiry || 0, 's-amber'],
    ['已过期', c.expired || 0, 's-red'], ['待检测', D.stats.pendingInsp, 's-gray']
  ].map(([t, n, cl]) => '<div class="stat"><div class="n ' + cl + '">' + n + '</div><div class="t">' + t + '</div></div>').join('');
}
function renderBatches() {
  let rows = D.batches;
  if (curFilter) rows = rows.filter(b => b.status === curFilter);
  $('#batchRows').innerHTML = rows.length ? rows.map(b =>
    '<tr><td><b>' + esc(b.code) + '</b></td><td>' + esc(b.productName) + '</td><td>' + esc(b.supplierName) + '<br><span class="muted">' + esc(originOf(b.supplierId)) + '</span></td>'
    + '<td>' + esc(b.purchaseDate) + '</td><td>' + esc(b.expiryDate) + '</td><td><b>' + b.remainingQty + '</b>/' + b.quantity + esc(b.unit) + '</td>'
    + '<td>' + inspTag(b.inspectionResult) + '</td><td>' + statusTag(b.status) + '</td>'
    + '<td><button class="btn sm ghost" onclick="openDetail(' + b.id + ')">详情/操作</button></td></tr>'
  ).join('') : '<tr><td colspan="9" class="empty">暂无批次</td></tr>';
}
function originOf(sid) { const s = D.suppliers.find(x => x.id === sid); return s ? s.origin : ''; }
function renderInv() {
  const active = D.batches.filter(b => !b.disposed && b.remainingQty > 0);
  $('#invRows').innerHTML = active.length ? active.map(b =>
    '<tr><td>' + esc(b.code) + '</td><td>' + esc(b.productName) + '</td><td><b>' + b.remainingQty + esc(b.unit) + '</b></td>'
    + '<td>' + statusTag(b.status) + '</td><td><button class="btn sm" onclick="invForm(' + b.id + ')">登记</button></td></tr>'
  ).join('') : '<tr><td colspan="5" class="empty">暂无在售库存</td></tr>';
}
function renderArchive() {
  $('#prodRows').innerHTML = D.products.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '') + '</td><td>' + esc(p.unit) + '</td><td>' + p.defaultShelfLifeDays + '</td><td>' + (p.defaultNearDays ?? 2) + '</td></tr>').join('');
  $('#supRows').innerHTML = D.suppliers.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.origin || '') + '</td><td>' + esc(s.contact || '') + '</td></tr>').join('');
}

// ---- 录入进货批次 ----
function productForm() {
  modal('<h3>新增商品档案</h3><label>商品名称</label><input id="f_name"><label>类别</label><input id="f_cat" placeholder="蔬菜/水产/肉类…"><div class="row"><div><label>单位</label><input id="f_unit" value="斤"></div><div><label>保质期(天)</label><input id="f_life" type="number" value="5"></div><div><label>临期提醒(提前几天)</label><input id="f_near" type="number" value="2"></div></div><div class="row" style="margin-top:16px"><button class="btn gray" onclick="closeModal()">取消</button><button class="btn" id="ok">保存</button></div>');
  $('#ok').onclick = async () => {
    try {
      await api('/api/owner/products', { method: 'POST', body: JSON.stringify({ name: $('#f_name').value, category: $('#f_cat').value, unit: $('#f_unit').value, defaultShelfLifeDays: $('#f_life').value, defaultNearDays: $('#f_near').value }) });
      closeModal(); toast('已新增商品'); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}
function supplierForm() {
  modal('<h3>新增供应商 / 产地</h3><label>供应商/合作社名称</label><input id="f_name"><label>产地</label><input id="f_origin" placeholder="如 山东省寿光市"><div class="row"><div><label>联系人</label><input id="f_contact"></div><div><label>联系电话</label><input id="f_phone"></div></div><label>资质/许可证号</label><input id="f_license"><div class="row" style="margin-top:16px"><button class="btn gray" onclick="closeModal()">取消</button><button class="btn" id="ok">保存</button></div>');
  $('#ok').onclick = async () => {
    try {
      await api('/api/owner/suppliers', { method: 'POST', body: JSON.stringify({ name: $('#f_name').value, origin: $('#f_origin').value, contact: $('#f_contact').value, phone: $('#f_phone').value, license: $('#f_license').value }) });
      closeModal(); toast('已新增供应商'); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}
window.productForm = productForm; window.supplierForm = supplierForm;

function batchForm() {
  const today = D.today;
  const prodOpts = D.products.map(p => '<option value="' + p.id + '" data-life="' + p.defaultShelfLifeDays + '" data-near="' + p.defaultNearDays + '">' + esc(p.name) + '（' + esc(p.unit) + '）</option>').join('');
  const supOpts = D.suppliers.map(s => '<option value="' + s.id + '">' + esc(s.name) + ' / ' + esc(s.origin || '') + '</option>').join('');
  modal('<h3>录入进货批次</h3><div class="row"><div><label>商品</label><select id="f_product">' + prodOpts + '</select></div><div><label>供应商 / 产地</label><select id="f_supplier">' + supOpts + '</select></div></div>'
    + '<div class="row"><div><label>进货日期</label><input id="f_pdate" type="date" value="' + today + '"></div><div><label>生产日期</label><input id="f_mdate" type="date" value="' + today + '"></div><div><label>保质期到期日</label><input id="f_edate" type="date"><small class="muted">不填按保质期自动计算</small></div></div>'
    + '<div class="row"><div><label>进货数量</label><input id="f_qty" type="number" min="0" step="0.1"></div><div><label>进货单价(元)</label><input id="f_price" type="number" min="0" step="0.1"></div><div><label>临期提前预警(天)</label><input id="f_near" type="number" value="2"></div></div>'
    + '<label>本批自检结果（进货验收时）</label><select id="f_result"><option value="pass">合格</option><option value="pending">稍后补录</option><option value="fail">不合格（拒收/隔离）</option></select>'
    + '<label>检测项目与结果描述</label><textarea id="f_items" rows="2" placeholder="如：农残快检（有机磷）阴性；外观正常"></textarea>'
    + '<label>备注</label><input id="f_note" placeholder="选填">'
    + '<div class="row" style="margin-top:16px"><button class="btn gray" onclick="closeModal()">取消</button><button class="btn" id="ok">保存批次</button></div>');
  const syncDate = () => {
    const p = $('#f_product option:checked'); const m = $('#f_mdate').value; const life = +p.dataset.life;
    if (m && life) $('#f_edate').value = addD(m, life);
  };
  $('#f_product').onchange = () => { $('#f_near').value = $('#f_product option:checked').dataset.near; syncDate(); };
  $('#f_mdate').onchange = syncDate; syncDate();
  $('#ok').onclick = async () => {
    try {
      await api('/api/owner/batches', { method: 'POST', body: JSON.stringify({
        productId: $('#f_product').value, supplierId: $('#f_supplier').value,
        purchaseDate: $('#f_pdate').value, productionDate: $('#f_mdate').value, expiryDate: $('#f_edate').value || undefined,
        nearDays: $('#f_near').value, quantity: $('#f_qty').value, purchasePrice: $('#f_price').value || null,
        inspectionResult: $('#f_result').value, inspectionItems: $('#f_items').value, note: $('#f_note').value }) });
      closeModal(); toast('进货批次已录入'); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}
function addD(date, n) { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + +n); return d.toISOString().slice(0, 10); }
$('#addBatchBtn').onclick = batchForm;

// ---- 批次详情 ----
async function openDetail(id) {
  let d;
  try { d = await api('/api/owner/batches/' + id); } catch (e) { return toast(e.message, true); }
  const b = d.batch;
  modal('<h3>批次 ' + esc(b.code) + ' ' + statusTag(b.status) + '</h3>'
    + '<dl class="kv">'
    + '<dt>商品</dt><dd>' + esc(b.productName) + '</dd>'
    + '<dt>供应商/产地</dt><dd>' + esc(b.supplierName) + '</dd>'
    + '<dt>进货/到期</dt><dd>' + esc(b.purchaseDate) + ' ～ ' + esc(b.expiryDate) + '（保质期' + b.shelfLifeDays + '天）</dd>'
    + '<dt>库存</dt><dd>剩余 <b>' + b.remainingQty + esc(b.unit) + '</b> / 进货 ' + b.quantity + esc(b.unit) + '</dd>'
    + (b.note ? '<dt>备注</dt><dd>' + esc(b.note) + '</dd>' : '')
    + '</dl>'
    + '<h4 style="margin:14px 0 8px">检测记录</h4>'
    + (d.inspections.length ? d.inspections.map(i => '<div class="pill"><span class="tag ' + (i.result === 'pass' ? 'green' : i.result === 'fail' ? 'red' : 'amber') + '">' + esc(i.resultText) + '</span>' + esc(i.inspectionDate) + ' ' + esc(i.inspectorTypeText) + '：' + esc(i.items || '') + '</div>').join('') : '<p class="muted">暂无检测记录</p>')
    + (d.patrols.length ? '<h4 style="margin:12px 0 8px">市场巡检</h4>' + d.patrols.map(p => '<div class="pill">' + esc(p.date) + ' ' + esc(p.content) + (p.action ? '（处理：' + esc(p.action) + '）' : '') + '</div>').join('') : '')
    + (d.disposal ? '<h4 style="margin:12px 0 8px">处置情况</h4><p>' + esc(d.disposal.date) + ' ' + esc(d.disposal.method) + ' ' + d.disposal.qty + esc(b.unit) + '，原因：' + esc(d.disposal.reason) + (d.disposal.marketConfirmed ? ' <span class="tag green">市场已确认</span>' : ' <span class="tag amber">待市场确认</span>') + '</p>' : '')
    + '<h4 style="margin:12px 0 8px">库存流水</h4><div class="tbl-wrap"><table><thead><tr><th>日期</th><th>类型</th><th>变动</th><th>结余</th><th>原因</th></tr></thead><tbody>'
    + d.logs.map(l => '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.typeText) + '</td><td>' + (l.changeQty > 0 ? '+' : '') + l.changeQty + '</td><td>' + l.qtyAfter + '</td><td>' + esc(l.reason) + '</td></tr>').join('')
    + '</tbody></table></div>'
    + '<div class="row" style="margin-top:14px">'
    + '<button class="btn ghost sm" id="qrBtn">📷 溯源二维码</button>'
    + '<button class="btn sm" id="inspBtn">补录自检</button>'
    + '<button class="btn amber sm" id="dispBtn">临期处置</button>'
    + '<button class="btn gray sm" onclick="closeModal()">关闭</button></div>');
  $('#qrBtn').onclick = () => showQR(d.qrUrl, d.traceUrl, b.code);
  $('#inspBtn').onclick = () => inspectionForm(id);
  $('#dispBtn').onclick = () => disposalForm(id, b);
}
window.openDetail = openDetail;

function showQR(qrUrl, traceUrl, code) {
  modal('<h3>批次溯源二维码</h3><p class="muted">打印贴在摊位该批次商品上，消费者/管理员扫码即可查看溯源信息。</p>'
    + '<div style="text-align:center;margin:14px 0"><img src="' + qrUrl + '?t=' + Date.now() + '" style="width:240px"></div>'
    + '<p style="text-align:center;font-weight:600">' + esc(code) + '</p>'
    + '<div class="row" style="margin-top:10px"><a class="btn ghost" href="' + traceUrl + '" target="_blank">查看消费者页面</a><button class="btn gray" onclick="closeModal()">关闭</button></div>');
}

function inspectionForm(id) {
  modal('<h3>补录自检结果</h3><div class="row"><div><label>检测日期</label><input id="f_date" type="date" value="' + D.today + '"></div><div><label>结果</label><select id="f_result"><option value="pass">合格</option><option value="fail">不合格</option></select></div></div>'
    + '<label>检测项目与结果描述</label><textarea id="f_items" rows="3" placeholder="如：农残快检抑制率 22%，合格；感官正常"></textarea>'
    + '<p class="muted" style="margin-top:8px">选择“不合格”时系统将自动隔离下架该批次，并等待市场处理。</p>'
    + '<div class="row" style="margin-top:12px"><button class="btn gray" onclick="openDetail(' + id + ')">返回</button><button class="btn" id="ok">提交</button></div>');
  $('#ok').onclick = async () => {
    try {
      await api('/api/owner/batches/' + id + '/inspection', { method: 'POST', body: JSON.stringify({ inspectionDate: $('#f_date').value, result: $('#f_result').value, items: $('#f_items').value }) });
      toast('自检结果已提交'); closeModal(); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}

// ---- 库存登记 ----
function invForm(id) {
  const b = D.batches.find(x => x.id === id);
  modal('<h3>库存登记 · ' + esc(b.productName) + '</h3><p class="muted">批次 ' + esc(b.code) + '，当前剩余 <b>' + b.remainingQty + esc(b.unit) + '</b></p>'
    + '<div class="row"><div><label>登记类型</label><select id="f_type"><option value="sale">销售出库</option><option value="check">盘点调整</option><option value="loss">损耗报损</option></select></div>'
    + '<div><label>数量（' + esc(b.unit) + '）</label><input id="f_qty" type="number" min="0" step="0.1"></div></div>'
    + '<label>说明</label><input id="f_reason" placeholder="如：上午零售 / 黄叶摘除损耗">'
    + '<div class="row" style="margin-top:14px"><button class="btn gray" onclick="closeModal()">取消</button><button class="btn" id="ok">确认登记</button></div>');
  $('#ok').onclick = async () => {
    try {
      const r = await api('/api/owner/batches/' + id + '/inventory', { method: 'POST', body: JSON.stringify({ type: $('#f_type').value, changeQty: $('#f_qty').value, reason: $('#f_reason').value }) });
      toast('库存已更新，剩余 ' + r.remainingQty); closeModal(); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}
window.invForm = invForm;

// ---- 临期处置 ----
function disposalForm(id, b) {
  modal('<h3>临期/不合格处置 · ' + esc(b.productName) + '</h3><p class="muted">当前剩余 <b>' + b.remainingQty + esc(b.unit) + '</b>。处置记录将提交市场管理员核验确认。</p>'
    + '<div class="row"><div><label>处置方式</label><select id="f_method"><option value="折扣处理">折扣处理（继续销售）</option><option value="销毁">销毁（下架）</option><option value="退货">退货（退回供应商）</option></select></div>'
    + '<div><label>数量（' + esc(b.unit) + '）</label><input id="f_qty" type="number" min="0" step="0.1" value="' + b.remainingQty + '"></div></div>'
    + '<label>原因说明</label><textarea id="f_reason" rows="2" placeholder="如：明日到期，下午五折清货；发蔫销毁"></textarea>'
    + '<div class="row" style="margin-top:14px"><button class="btn gray" onclick="openDetail(' + id + ')">返回</button><button class="btn amber" id="ok">提交处置</button></div>');
  $('#ok').onclick = async () => {
    try {
      await api('/api/owner/batches/' + id + '/disposal', { method: 'POST', body: JSON.stringify({ method: $('#f_method').value, qty: $('#f_qty').value, reason: $('#f_reason').value }) });
      toast('处置已提交，等待市场核验'); closeModal(); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}

async function refresh() { D = await api('/api/owner/init'); renderStats(); renderBatches(); renderInv(); renderArchive(); }

$('#filters').addEventListener('click', e => {
  if (e.target.dataset.f !== undefined) { curFilter = e.target.dataset.f; $$('#filters button').forEach(x => x.classList.remove('on')); e.target.classList.add('on'); renderBatches(); }
});
document.querySelector('.top nav').addEventListener('click', e => {
  const t = e.target.closest('a'); if (!t || !t.dataset.tab) return;
  e.preventDefault();
  $$('.top nav a').forEach(a => a.classList.toggle('on', a === t));
  ['batches', 'inventory', 'archive'].forEach(k => $('#' + k + 'Tab').style.display = k === t.dataset.tab ? '' : 'none');
});
$('#logout').onclick = e => { e.preventDefault(); localStorage.removeItem('mt_token'); location.href = '/index.html'; };
init();
