const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./db');
const H = require('./helpers');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 认证中间件 ----------
function getUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return db.prepare('SELECT * FROM sessions WHERE token=?').get(token) || null;
}
function requireVendor(req, res, next) {
  const sess = getUser(req);
  if (!sess || sess.role !== 'vendor') return res.status(401).json({ error: '请先以摊主身份登录' });
  req.stall = db.prepare('SELECT * FROM stalls WHERE id=?').get(sess.user_id);
  if (!req.stall) return res.status(401).json({ error: '摊位不存在' });
  next();
}
function requireAdmin(req, res, next) {
  const sess = getUser(req);
  if (!sess || sess.role !== 'admin') return res.status(401).json({ error: '请先以管理员身份登录' });
  req.admin = db.prepare('SELECT * FROM admins WHERE id=?').get(sess.user_id);
  if (!req.admin) return res.status(401).json({ error: '账号不存在' });
  next();
}

// ---------- 登录 / 登出 / 当前用户 ----------
app.post('/api/login', (req, res) => {
  const { role, account, password } = req.body || {};
  if (role === 'vendor') {
    const stall = db.prepare('SELECT * FROM stalls WHERE code=? OR phone=?').get(account, account);
    if (!stall || stall.password !== password) return res.status(401).json({ error: '摊位号或密码错误' });
    const token = H.randomToken();
    db.prepare('INSERT INTO sessions(token, role, user_id) VALUES(?,?,?)').run(token, 'vendor', stall.id);
    return res.json({ token, role: 'vendor', stall: { code: stall.code, name: stall.name, category: stall.category } });
  }
  if (role === 'admin') {
    const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(account);
    if (!admin || admin.password !== password) return res.status(401).json({ error: '管理员账号或密码错误' });
    const token = H.randomToken();
    db.prepare('INSERT INTO sessions(token, role, user_id) VALUES(?,?,?)').run(token, 'admin', admin.id);
    return res.json({ token, role: 'admin', admin: { name: admin.name, badge_no: admin.badge_no } });
  }
  res.status(400).json({ error: '未知角色' });
});

app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ ok: true });
});

// ---------- 公开接口（消费者）：只返回安全字段 ----------
app.get('/api/public/stalls', (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const rows = db.prepare(
    `SELECT code, name, category, location, business_hours FROM stalls
     WHERE name LIKE ? OR category LIKE ? OR code LIKE ? OR location LIKE ?
     ORDER BY id`
  ).all(q, q, q, q);
  res.json(rows);
});

app.get('/api/public/stall/:code', (req, res) => {
  const stall = db.prepare('SELECT * FROM stalls WHERE code=?').get(req.params.code);
  if (!stall) return res.status(404).json({ error: '未找到该摊位' });
  const batches = db.prepare(
    `SELECT * FROM batches WHERE stall_id=? AND status='on_sale' ORDER BY id DESC`
  ).all(stall.id);
  res.json({
    stall: H.toPublicStall(stall),
    products: batches.map(b => ({
      trace_code: b.trace_code,
      product_name: b.product_name,
      variety: b.variety,
      purchase_time: b.purchase_time,
      best_before: b.best_before,
      expiry_state: H.expiryState(b.best_before),
      expiry_text: H.expiryState(b.best_before) ? H.EXPIRY_TEXT[H.expiryState(b.best_before)] : null
    }))
  });
});

app.get('/api/public/trace/:code', (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE trace_code=?').get(req.params.code);
  if (!b) return res.status(404).json({ error: '未找到该溯源码，请确认二维码是否正确' });
  res.json(H.toPublicBatch(db, b));
});

// ---------- 摊主端 ----------
app.get('/api/vendor/me', requireVendor, (req, res) => {
  const s = req.stall;
  res.json({
    code: s.code, name: s.name, category: s.category, owner_name: s.owner_name,
    phone: s.phone, location: s.location, business_hours: s.business_hours, license_no: s.license_no
  });
});

app.get('/api/vendor/batches', requireVendor, (req, res) => {
  const rows = db.prepare('SELECT * FROM batches WHERE stall_id=? ORDER BY id DESC').all(req.stall.id);
  const result = rows.map(b => {
    const inv = H.latestRemaining(db, b.id);
    const det = db.prepare('SELECT COUNT(*) c FROM detections WHERE batch_id=?').get(b.id).c;
    const fails = db.prepare("SELECT COUNT(*) c FROM detections WHERE batch_id=? AND result='fail'").get(b.id).c;
    return { ...b, remaining: inv ? inv.remaining : b.quantity, detection_count: det, fail_count: fails,
      expiry_state: H.expiryState(b.best_before), status_text: H.STATUS_TEXT[b.status] };
  });
  res.json(result);
});

app.get('/api/vendor/batch/:id', requireVendor, (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE id=? AND stall_id=?').get(req.params.id, req.stall.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const detections = db.prepare('SELECT * FROM detections WHERE batch_id=? ORDER BY tested_at DESC').all(b.id);
  const logs = db.prepare('SELECT * FROM inventory_logs WHERE batch_id=? ORDER BY id DESC').all(b.id);
  const handlings = db.prepare('SELECT * FROM expiry_handlings WHERE batch_id=? ORDER BY id DESC').all(b.id);
  const inv = H.latestRemaining(db, b.id);
  res.json({ batch: { ...b, remaining: inv ? inv.remaining : b.quantity, expiry_state: H.expiryState(b.best_before) },
    detections, logs, handlings });
});

app.post('/api/vendor/batches', requireVendor, (req, res) => {
  const b = req.body || {};
  for (const f of ['product_name', 'origin_type', 'origin_place', 'quantity', 'unit', 'purchase_time']) {
    if (b[f] === undefined || b[f] === '') return res.status(400).json({ error: `缺少字段：${f}` });
  }
  const traceCode = H.genTraceCode();
  const info = db.prepare(`INSERT INTO batches
    (trace_code, stall_id, product_name, variety, origin_type, origin_place, supplier, supplier_contact,
     quantity, unit, purchase_time, arrival_time, best_before, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'on_sale')`).run(
    traceCode, req.stall.id, b.product_name, b.variety || null, b.origin_type, b.origin_place,
    b.supplier || null, b.supplier_contact || null, Number(b.quantity), b.unit,
    b.purchase_time, b.arrival_time || null, b.best_before || null);
  // 进货即建立首条库存记录
  db.prepare('INSERT INTO inventory_logs (batch_id, stall_id, remaining, note) VALUES (?,?,?,?)')
    .run(info.lastInsertRowid, req.stall.id, Number(b.quantity), '进货入库');
  res.json({ ok: true, id: info.lastInsertRowid, trace_code: traceCode });
});

app.post('/api/vendor/batch/:id/detection', requireVendor, (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE id=? AND stall_id=?').get(req.params.id, req.stall.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const d = req.body || {};
  for (const f of ['item', 'result', 'tested_by', 'tested_at']) {
    if (!d[f]) return res.status(400).json({ error: `缺少字段：${f}` });
  }
  if (!['pass', 'fail', 'pending'].includes(d.result)) return res.status(400).json({ error: '检测结果非法' });
  db.prepare('INSERT INTO detections (batch_id, item, result, tested_by, method, tested_at) VALUES (?,?,?,?,?,?)')
    .run(b.id, d.item, d.result, d.tested_by, d.method || null, d.tested_at);
  // 检测不合格一律召回下架（无论此前在售/售罄），并停止对消费者展示
  if (d.result === 'fail' && b.status !== 'recalled' && b.status !== 'destroyed') {
    db.prepare("UPDATE batches SET status='recalled' WHERE id=?").run(b.id);
    db.prepare('INSERT INTO expiry_handlings (batch_id, stall_id, type, quantity, unit, handled_at, note) VALUES (?,?,?,?,?,?,?)')
      .run(b.id, req.stall.id, 'recall', b.quantity, b.unit, d.tested_at, '检测不合格，平台自动标记召回下架');
  }
  res.json({ ok: true });
});

app.post('/api/vendor/batch/:id/inventory', requireVendor, (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE id=? AND stall_id=?').get(req.params.id, req.stall.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const inv = H.latestRemaining(db, b.id);
  const prev = inv ? inv.remaining : b.quantity;
  const remaining = Number(req.body.remaining);
  if (isNaN(remaining) || remaining < 0) return res.status(400).json({ error: '剩余库存必须为非负数字' });
  const diff = +(remaining - prev).toFixed(3);
  const sold = diff < 0 ? Math.abs(diff) : 0;
  db.prepare('INSERT INTO inventory_logs (batch_id, stall_id, remaining, sold, discarded, note) VALUES (?,?,?,?,?,?)')
    .run(b.id, req.stall.id, remaining, sold, req.body.discarded ? Number(req.body.discarded) : 0, req.body.note || null);
  let status = b.status;
  if (remaining === 0 && b.status === 'on_sale') status = 'sold_out';
  if (remaining > 0 && b.status === 'sold_out') status = 'on_sale';
  if (status !== b.status) db.prepare('UPDATE batches SET status=? WHERE id=?').run(status, b.id);
  res.json({ ok: true, remaining, status });
});

app.post('/api/vendor/batch/:id/handling', requireVendor, (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE id=? AND stall_id=?').get(req.params.id, req.stall.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const h = req.body || {};
  for (const f of ['type', 'quantity', 'handled_at']) {
    if (h[f] === undefined || h[f] === '') return res.status(400).json({ error: `缺少字段：${f}` });
  }
  db.prepare('INSERT INTO expiry_handlings (batch_id, stall_id, type, quantity, unit, handled_at, note) VALUES (?,?,?,?,?,?,?)')
    .run(b.id, req.stall.id, h.type, Number(h.quantity), b.unit, h.handled_at, h.note || null);
  if (h.type === 'discard' || h.type === 'discount_done') {
    db.prepare("UPDATE batches SET status='handled' WHERE id=?").run(b.id);
    const inv = H.latestRemaining(db, b.id);
    if (inv) db.prepare('INSERT INTO inventory_logs (batch_id, stall_id, remaining, discarded, note) VALUES (?,?,?,?,?)')
      .run(b.id, req.stall.id, Math.max(0, inv.remaining - Number(h.quantity)), Number(h.quantity), '临期处理扣减');
  }
  res.json({ ok: true });
});

// 生成批次溯源二维码（指向公开溯源页）
app.get('/api/vendor/batch/:id/qrcode', requireVendor, async (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE id=? AND stall_id=?').get(req.params.id, req.stall.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const url = `${req.protocol}://${req.get('host')}/t/${b.trace_code}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2,
    color: { dark: '#1b5e20', light: '#ffffff' } });
  res.json({ url, dataUrl });
});

// ---------- 管理员端 ----------
app.get('/api/admin/stalls', requireAdmin, (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const rows = db.prepare(`SELECT s.*,
    (SELECT COUNT(*) FROM batches b WHERE b.stall_id=s.id) batch_count,
    (SELECT COUNT(*) FROM inspections i WHERE i.stall_id=s.id) insp_count
    FROM stalls s WHERE s.name LIKE ? OR s.code LIKE ? OR s.owner_name LIKE ?
    ORDER BY s.id`).all(q, q, q);
  res.json(rows.map(({ password, ...r }) => r));
});

// 管理员看到的完整链路（含联系人、库存、日志等后台信息）
app.get('/api/admin/trace/:code', requireAdmin, (req, res) => {
  const b = db.prepare('SELECT * FROM batches WHERE trace_code=?').get(req.params.code);
  if (!b) return res.status(404).json({ error: '未找到该溯源码' });
  const stall = db.prepare('SELECT * FROM stalls WHERE id=?').get(b.stall_id);
  const detections = db.prepare('SELECT * FROM detections WHERE batch_id=? ORDER BY tested_at DESC').all(b.id);
  const logs = db.prepare('SELECT * FROM inventory_logs WHERE batch_id=? ORDER BY id DESC').all(b.id);
  const handlings = db.prepare('SELECT * FROM expiry_handlings WHERE batch_id=? ORDER BY id DESC').all(b.id);
  const inv = H.latestRemaining(db, b.id);
  const stallInspections = db.prepare(`
    SELECT i.*, a.name admin_name, a.badge_no FROM inspections i
    JOIN admins a ON a.id=i.admin_id WHERE i.stall_id=? ORDER BY i.id DESC LIMIT 10`).all(b.stall_id);
  const { password, ...stallSafe } = stall;
  res.json({
    batch: { ...b, remaining: inv ? inv.remaining : b.quantity,
      expiry_state: H.expiryState(b.best_before), expiry_text: H.expiryState(b.best_before) ? H.EXPIRY_TEXT[H.expiryState(b.best_before)] : null },
    stall: stallSafe, detections, logs, handlings, stall_inspections: stallInspections
  });
});

app.post('/api/admin/stall/:id/inspect', requireAdmin, (req, res) => {
  const stall = db.prepare('SELECT * FROM stalls WHERE id=?').get(req.params.id);
  if (!stall) return res.status(404).json({ error: '摊位不存在' });
  const r = req.body || {};
  if (!['pass', 'rectify', 'fail'].includes(r.result)) return res.status(400).json({ error: '巡检结果非法' });
  db.prepare('INSERT INTO inspections (stall_id, admin_id, result, issue, requirement) VALUES (?,?,?,?,?)')
    .run(stall.id, req.admin.id, r.result, r.issue || null, r.requirement || null);
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const stalls = db.prepare('SELECT COUNT(*) c FROM stalls').get().c;
  const today = new Date().toISOString().slice(0, 11) + '%';
  const todayBatches = db.prepare("SELECT COUNT(*) c FROM batches WHERE date(created_at)=date('now','localtime')").get().c;
  const onSale = db.prepare("SELECT COUNT(*) c FROM batches WHERE status='on_sale'").get().c;
  const recalled = db.prepare("SELECT COUNT(*) c FROM batches WHERE status='recalled'").get().c;
  // 临期预警：在售且2天内到期
  const nearExpiry = db.prepare(`SELECT b.*, s.name stall_name FROM batches b JOIN stalls s ON s.id=b.stall_id
    WHERE b.status='on_sale' AND b.best_before IS NOT NULL
    AND julianday(b.best_before) - julianday(date('now','localtime')) >= 0
    AND julianday(b.best_before) - julianday(date('now','localtime')) < 2
    ORDER BY b.best_before`).all();
  const recentInspections = db.prepare(`SELECT i.*, s.name stall_name, s.code stall_code, a.name admin_name
    FROM inspections i JOIN stalls s ON s.id=i.stall_id JOIN admins a ON a.id=i.admin_id
    ORDER BY i.id DESC LIMIT 10`).all();
  res.json({ stalls, today_batches: todayBatches, on_sale: onSale, recalled,
    near_expiry: nearExpiry.map(b => ({ ...b, expiry_state: H.expiryState(b.best_before) })),
    recent_inspections: recentInspections });
});

// ---------- 页面路由 ----------
app.get('/t/:code', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'trace.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`菜市场溯源平台已启动: http://localhost:${PORT}`));
