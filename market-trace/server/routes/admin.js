const express = require('express');
const db = require('../db');
const { auth } = require('../auth');
const { enrichBatch, listBatches, adminBatchView } = require('../helpers');
const { today, batchStatus, RESULT_TEXT, PATROL_TEXT } = require('../utils');
const ownerMod = require('./owner');
const router = express.Router();
router.use(auth(['admin']));

// 巡检看板
router.get('/dashboard', (req, res) => {
  const all = listBatches();
  const counts = { fresh: 0, near_expiry: 0, expired: 0, sold_out: 0, disposed: 0 };
  const failIds = new Set(db.all('inspections').filter(i => i.result === 'fail').map(i => i.batchId));
  let unconfirmedDisposals = 0;
  for (const b of all) {
    counts[b.status] = (counts[b.status] || 0) + 1;
    if (b._disposal && !b._disposal.marketConfirmed) unconfirmedDisposals++;
  }
  const alerts = [];
  for (const b of all) {
    if (['near_expiry', 'expired'].includes(b.status)) alerts.push(adminBatchView(b));
  }
  alerts.sort((a, z) => a.expiryDate.localeCompare(z.expiryDate));
  const recentPatrols = db.all('patrols').sort((a, z) => z.patrolDate.localeCompare(a.patrolDate)).slice(0, 8).map(p => {
    const b = db.find('batches', x => x.id === p.batchId);
    const st = b && db.find('stalls', s => s.id === b.stallId);
    return {
      id: p.id, date: p.patrolDate, result: p.result, resultText: PATROL_TEXT[p.result] || p.result,
      content: p.content, action: p.action,
      batchCode: b ? b.code : '', productName: b ? b.productName : '',
      stallName: st ? st.name : '', stallNo: st ? st.stallNo : ''
    };
  });
  res.json({
    counts,
    totals: { stalls: db.all('stalls').length, batches: all.length, failed: failIds.size, unconfirmedDisposals },
    alerts, recentPatrols, today: today()
  });
});

// 摊位列表
router.get('/stalls', (req, res) => {
  res.json(db.all('stalls').map(s => {
    const u = db.find('users', x => x.id === s.userId);
    return {
      id: s.id, stallNo: s.stallNo, name: s.name, category: s.category,
      owner: u ? u.name : '', phone: s.phone, businessLicense: s.businessLicense, status: s.status
    };
  }));
});

// 批次列表（全市场）+ 搜索（按批次号/商品/摊位）
router.get('/batches', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = req.query.status || '';
  let rows = listBatches();
  if (q) rows = rows.filter(b =>
    b.code.toLowerCase().includes(q) ||
    b.productName.toLowerCase().includes(q) ||
    (b._stall && b._stall.name.toLowerCase().includes(q)) ||
    (b._stall && b._stall.stallNo.toLowerCase().includes(q)));
  if (status) rows = rows.filter(b => b.status === status || (status === 'fail' && b._inspections.some(i => i.result === 'fail')));
  res.json(rows.map(adminBatchView));
});

// 批次详情（含供应商全部信息、全部检测/巡检/处置/库存流水）
router.get('/batches/:id', (req, res) => {
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const eb = enrichBatch(b);
  const st = eb._stall;
  const supplier = eb._supplier;
  const out = ownerMod.detail(eb, st);
  out.supplier = supplier ? { name: supplier.name, origin: supplier.origin, contact: supplier.contact, phone: supplier.phone, license: supplier.license } : null;
  out.qrUrl = '/api/public/qr/' + eb.code;
  res.json(out);
});

// 按批次号查（扫码入口）
router.get('/by-code/:code', (req, res) => {
  const b = db.find('batches', x => x.code === req.params.code.toUpperCase());
  if (!b) return res.status(404).json({ error: '未找到该批次，请核对二维码' });
  res.redirect(303, '/api/admin/batches/' + b.id);
});

// 市场抽检录入
router.post('/batches/:id/inspection', (req, res) => {
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const { result, items, inspectionDate } = req.body || {};
  if (!['pass', 'fail'].includes(result)) return res.status(400).json({ error: '检测结果无效' });
  const rec = db.insert('inspections', {
    batchId: b.id, stallId: b.stallId, inspectionDate: inspectionDate || today(),
    inspectorType: 'market', inspector: req.user.name, result, items: items || ''
  });
  if (result === 'fail') {
    db.update('batches', b.id, { disposed: true, disposedAt: today(), disposalMethod: b.disposalMethod || '销毁', disposalNote: (b.disposalNote ? b.disposalNote + '；' : '') + '市场抽检不合格，强制下架' });
    db.insert('disposals', { batchId: b.id, stallId: b.stallId, date: today(), qty: b.remainingQty, method: '销毁', reason: '市场抽检不合格，强制下架销毁', operator: req.user.name, marketConfirmed: true });
    db.insert('patrols', { batchId: b.id, stallId: b.stallId, patrolDate: today(), adminId: req.user.id, result: 'problem', content: '抽检不合格：' + (items || '详见检测记录'), action: '已强制下架并销毁，剩余' + b.remainingQty + b.unit });
  }
  res.json({ ok: true, inspection: rec });
});

// 巡检记录
router.post('/batches/:id/patrol', (req, res) => {
  const b = db.find('batches', x => x.id === Number(req.params.id));
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const { result, content, action, date } = req.body || {};
  if (!['pass', 'problem', 'rectified'].includes(result)) return res.status(400).json({ error: '巡检结果无效' });
  if (!content) return res.status(400).json({ error: '请填写巡检情况' });
  const rec = db.insert('patrols', {
    batchId: b.id, stallId: b.stallId, patrolDate: date || today(),
    adminId: req.user.id, result, content, action: action || ''
  });
  res.json({ ok: true, patrol: rec });
});

// 确认摊主处置（销毁/折扣/退货现场核验）
router.post('/disposals/:id/confirm', (req, res) => {
  const disp = db.find('disposals', x => x.id === Number(req.params.id));
  if (!disp) return res.status(404).json({ error: '处置记录不存在' });
  db.update('disposals', disp.id, { marketConfirmed: true, confirmedBy: req.user.name, confirmedAt: new Date().toISOString() });
  res.json({ ok: true });
});

// 全部处置记录（待确认）
router.get('/disposals', (req, res) => {
  const onlyPending = req.query.pending === '1';
  let rows = db.all('disposals').slice().sort((a, z) => z.date.localeCompare(a.date));
  if (onlyPending) rows = rows.filter(d => !d.marketConfirmed);
  res.json(rows.map(d => {
    const b = db.find('batches', x => x.id === d.batchId);
    const st = b && db.find('stalls', s => s.id === b.stallId);
    return {
      id: d.id, date: d.date, qty: d.qty, method: d.method, reason: d.reason,
      operator: d.operator, marketConfirmed: d.marketConfirmed, confirmedBy: d.confirmedBy || '',
      batchCode: b ? b.code : '', productName: b ? b.productName : '', unit: b ? b.unit : '',
      stallName: st ? st.name : '', stallNo: st ? st.stallNo : ''
    };
  }));
});

module.exports = router;
