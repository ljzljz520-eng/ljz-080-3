const express = require('express');
const db = require('../db');
const { auth } = require('../auth');
const { enrichBatch, listBatches, ownerStallId, adminBatchView } = require('../helpers');
const { today, batchStatus, STATUS_TEXT, RESULT_TEXT, addDays } = require('../utils');
const router = express.Router();
router.use(auth(['owner']));

function stall(req) { return db.find('stalls', s => s.userId === req.user.id); }

// 初始化数据：摊位、商品档案、供应商、批次列表、看板统计
router.get('/init', (req, res) => {
  const st = stall(req);
  if (!st) return res.status(400).json({ error: '未绑定摊位' });
  const batches = listBatches(b => b.stallId === st.id).map(adminBatchView);
  const now = today();
  res.json({
    stall: { id: st.id, stallNo: st.stallNo, name: st.name, category: st.category },
    products: db.filter('products', p => p.stallId === st.id),
    suppliers: db.filter('suppliers', x => x.stallId === st.id),
    batches,
    stats: computeStats(batches),
    today: now
  });
});

function computeStats(batches) {
  const counts = { fresh: 0, near_expiry: 0, expired: 0, sold_out: 0, disposed: 0 };
  let pendingInsp = 0;
  for (const b of batches) {
    counts[b.status] = (counts[b.status] || 0) + 1;
    if (b.inspectionResult === 'none' || b.inspectionResult === 'pending') pendingInsp++;
  }
  return {
    active: batches.filter(b => !b.disposed && b.remainingQty > 0 && b.status !== 'expired').length,
    counts, pendingInsp,
    needAttention: counts.near_expiry + counts.expired
  };
}

// 新增商品档案
router.post('/products', (req, res) => {
  const st = stall(req);
  const { name, category, unit, defaultShelfLifeDays, defaultNearDays } = req.body || {};
  if (!name || !unit) return res.status(400).json({ error: '商品名称和单位必填' });
  if (db.find('products', p => p.stallId === st.id && p.name === name)) return res.status(400).json({ error: '该商品已存在' });
  const p = db.insert('products', {
    stallId: st.id, name: String(name).trim(), category: category || '', unit,
    defaultShelfLifeDays: Number(defaultShelfLifeDays) || 7,
    defaultNearDays: Number(defaultNearDays) || 2
  });
  res.json(p);
});

// 新增供应商/产地
router.post('/suppliers', (req, res) => {
  const st = stall(req);
  const { name, origin, contact, phone, license } = req.body || {};
  if (!name) return res.status(400).json({ error: '供应商名称必填' });
  if (db.find('suppliers', x => x.stallId === st.id && x.name === name)) return res.status(400).json({ error: '该供应商已存在' });
  const s = db.insert('suppliers', { stallId: st.id, name: String(name).trim(), origin: origin || '', contact: contact || '', phone: phone || '', license: license || '' });
  res.json(s);
});

// 录入进货批次
router.post('/batches', (req, res) => {
  const st = stall(req);
  const b0 = req.body || {};
  const product = db.find('products', p => p.id === Number(b0.productId) && p.stallId === st.id);
  if (!product) return res.status(400).json({ error: '请选择本摊位商品' });
  const supplier = db.find('suppliers', x => x.id === Number(b0.supplierId) && x.stallId === st.id);
  if (!supplier) return res.status(400).json({ error: '请选择供应商/产地' });
  const qty = Number(b0.quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: '进货数量需大于0' });
  const purchaseDate = b0.purchaseDate || today();
  const productionDate = b0.productionDate || purchaseDate;
  let expiryDate = b0.expiryDate;
  const shelfLifeDays = Number(b0.shelfLifeDays) || product.defaultShelfLifeDays || 7;
  if (!expiryDate) expiryDate = addDays(productionDate, shelfLifeDays);
  if (expiryDate < productionDate) return res.status(400).json({ error: '保质期到期日不能早于生产日期' });
  // 批次号：PC + 日期 + 当日序号
  const day = purchaseDate.replace(/-/g, '');
  const seq = db.filter('batches', b => b.code.includes('PC' + day)).length + 1;
  const code = 'PC' + day + '-' + String(seq).padStart(3, '0');
  const b = db.insert('batches', {
    stallId: st.id, code, productId: product.id, productName: product.name,
    supplierId: supplier.id, purchaseDate, productionDate, expiryDate,
    shelfLifeDays, nearDays: b0.nearDays != null && b0.nearDays !== '' ? Number(b0.nearDays) : product.defaultNearDays,
    quantity: qty, remainingQty: qty, unit: product.unit,
    purchasePrice: b0.purchasePrice != null ? Number(b0.purchasePrice) : null,
    note: b0.note || '', disposed: false, disposalMethod: '', disposalNote: '', status: 'active'
  });
  // 进货即自检结果（可选）
  if (b0.inspectionResult && b0.inspectionResult !== 'pending') {
    db.insert('inspections', {
      batchId: b.id, stallId: st.id, inspectionDate: purchaseDate,
      inspectorType: 'self', inspector: req.user.name,
      result: b0.inspectionResult, items: b0.inspectionItems || '进货自检'
    });
  }
  db.insert('inventoryLogs', { batchId: b.id, stallId: st.id, date: purchaseDate, type: 'in', changeQty: qty, qtyAfter: qty, reason: '进货入库' });
  res.json(adminBatchView(enrichBatch(b)));
});

// 批次详情（后台完整信息）
router.get('/batches/:id', (req, res) => {
  const st = stall(req);
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b || b.stallId !== st.id) return res.status(404).json({ error: '批次不存在' });
  const eb = enrichBatch(b);
  res.json(detail(eb, st));
});

function detail(eb, st) {
  return {
    batch: adminBatchView(eb),
    inspections: eb._inspections.map(i => ({
      id: i.id, inspectionDate: i.inspectionDate, inspectorType: i.inspectorType,
      inspectorTypeText: i.inspectorType === 'market' ? '市场抽检' : '摊主自检',
      inspector: i.inspector, result: i.result, resultText: RESULT_TEXT[i.result] || i.result, items: i.items
    })),
    disposal: eb._disposal ? {
      date: eb._disposal.date, qty: eb._disposal.qty, method: eb._disposal.method,
      reason: eb._disposal.reason, operator: eb._disposal.operator, marketConfirmed: eb._disposal.marketConfirmed
    } : null,
    patrols: eb._patrols.map(p => ({ date: p.patrolDate, result: p.result, content: p.content, action: p.action })),
    logs: eb._logs.map(l => ({ date: l.date, type: l.type, typeText: { in: '入库', sale: '销售', check: '盘点', loss: '损耗' }[l.type] || l.type, changeQty: l.changeQty, qtyAfter: l.qtyAfter, reason: l.reason })),
    traceUrl: '/trace.html?c=' + eb.code,
    qrUrl: '/api/public/qr/' + eb.code
  };
}

// 录入检测结果（摊主自检；不合格自动要求处置）
router.post('/batches/:id/inspection', (req, res) => {
  const st = stall(req);
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b || b.stallId !== st.id) return res.status(404).json({ error: '批次不存在' });
  const { result, items, inspectionDate } = req.body || {};
  if (!['pass', 'fail'].includes(result)) return res.status(400).json({ error: '检测结果无效' });
  const rec = db.insert('inspections', {
    batchId: b.id, stallId: st.id, inspectionDate: inspectionDate || today(),
    inspectorType: 'self', inspector: req.user.name, result, items: items || ''
  });
  if (result === 'fail') {
    db.update('batches', b.id, { disposed: true, disposedAt: today(), disposalMethod: b.disposalMethod || '隔离下架', disposalNote: (b.disposalNote ? b.disposalNote + '；' : '') + '自检不合格，已隔离下架待市场处理' });
  }
  res.json({ ok: true, inspection: rec });
});

// 库存登记（销售/盘点损耗）
router.post('/batches/:id/inventory', (req, res) => {
  const st = stall(req);
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b || b.stallId !== st.id) return res.status(404).json({ error: '批次不存在' });
  const { type, changeQty, reason, date } = req.body || {};
  const qty = Number(changeQty);
  if (!['sale', 'check', 'loss'].includes(type)) return res.status(400).json({ error: '类型无效' });
  if (!qty || qty <= 0) return res.status(400).json({ error: '请填写大于0的变动数量' });
  const delta = -qty;
  const after = b.remainingQty + delta;
  if (after < 0) return res.status(400).json({ error: '扣减数量超过当前剩余库存（' + b.remainingQty + b.unit + '）' });
  db.insert('inventoryLogs', { batchId: b.id, stallId: st.id, date: date || today(), type, changeQty: delta, qtyAfter: after, reason: reason || ({ sale: '销售出库', check: '盘点调整', loss: '损耗报损' })[type] });
  const ub = db.update('batches', b.id, { remainingQty: after });
  res.json({ ok: true, remainingQty: after });
});

// 临期/不合格处置：折扣、退货、销毁
router.post('/batches/:id/disposal', (req, res) => {
  const st = stall(req);
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b || b.stallId !== st.id) return res.status(404).json({ error: '批次不存在' });
  if (b.disposed) return res.status(400).json({ error: '该批次已处置' });
  const { method, qty, reason, date } = req.body || {};
  if (!['折扣处理', '退货', '销毁'].includes(method)) return res.status(400).json({ error: '处置方式无效' });
  const n = Number(qty);
  if (!n || n <= 0 || n > b.remainingQty) return res.status(400).json({ error: '处置数量需在 1~' + b.remainingQty + ' 之间' });
  db.insert('disposals', { batchId: b.id, stallId: st.id, date: date || today(), qty: n, method, reason: reason || '', operator: req.user.name, marketConfirmed: false });
  const after = b.remainingQty - n;
  // 销毁/退货：全部处置即批次结束；折扣处理后仍有货则继续在售
  const finished = method !== '折扣处理' || after <= 0;
  db.update('batches', b.id, { remainingQty: after, disposed: finished, disposedAt: finished ? (date || today()) : null, disposalMethod: method, disposalNote: reason || '' });
  db.insert('inventoryLogs', { batchId: b.id, stallId: st.id, date: date || today(), type: method === '折扣处理' ? 'sale' : 'loss', changeQty: -n, qtyAfter: after, reason: '临期处置-' + method + (reason ? '：' + reason : '') });
  res.json({ ok: true, remainingQty: after, disposed: finished });
});

module.exports = router;
module.exports.detail = detail;
module.exports.computeStats = computeStats;
