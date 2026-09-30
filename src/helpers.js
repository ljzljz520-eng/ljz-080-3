// 业务辅助函数：临期判定、状态计算、安全字段过滤

// 距保质期到期天数（基于今天日期，仅比较日期）
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  // 仅日期（YYYY-MM-DD）按当地日期比较；带时间的按时间戳比较
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, day] = dateStr.split('-').map(Number);
    return Math.round((new Date(y, m - 1, day) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  }
  const end = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(end.getTime())) return null;
  today.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

// 临期阈值（天）
const NEAR_EXPIRY_DAYS = 2;

function expiryState(bestBefore) {
  const d = daysUntil(bestBefore);
  if (d === null) return null;
  if (d < 0) return 'expired';
  if (d === 0) return 'expiring_today';
  if (d === 1) return 'near';
  return 'fresh';
}

const EXPIRY_TEXT = {
  fresh: '新鲜',
  near: '临期',
  expiring_today: '今日到期',
  expired: '已过期'
};

const STATUS_TEXT = {
  on_sale: '在售',
  sold_out: '已售罄',
  handled: '已临期处理',
  recalled: '已召回',
  destroyed: '已销毁'
};

const RESULT_TEXT = {
  pass: '合格',
  fail: '不合格',
  pending: '待检测'
};

const ORIGIN_TEXT = {
  base: '自有基地直供',
  wholesale: '批发市场采购',
  farm: '农户直收',
  supplier: '供应商配送'
};

function randomToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

function genTraceCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(100 + Math.random() * 900);
  return `PC${ymd}${String(Date.now()).slice(-5)}${rand}`;
}

// 计算批次最新库存（基于最后一条库存日志）
function latestRemaining(db, batchId) {
  const row = db.prepare(
    'SELECT remaining, sold, discarded FROM inventory_logs WHERE batch_id = ? ORDER BY id DESC LIMIT 1'
  ).get(batchId);
  return row || null;
}

// 消费者可见的安全字段：绝不暴露摊主后台信息（联系人/电话/库存/进货价等）
function toPublicStall(s) {
  return {
    code: s.code, name: s.name, category: s.category,
    location: s.location, business_hours: s.business_hours
  };
}

function toPublicBatch(db, b) {
  const stall = db.prepare('SELECT code, name, category, location, business_hours FROM stalls WHERE id=?').get(b.stall_id);
  const detections = db.prepare(
    'SELECT item, result, method, tested_by, tested_at FROM detections WHERE batch_id=? ORDER BY tested_at DESC'
  ).all(b.id);
  const handlings = db.prepare(
    'SELECT type, quantity, unit, handled_at, note FROM expiry_handlings WHERE batch_id=? ORDER BY handled_at DESC'
  ).all(b.id);
  // 仅当批次仍在售时展示；已召回/销毁/处理/售罄的不允许消费者看到“在售来源”
  const onSale = b.status === 'on_sale';
  const exp = expiryState(b.best_before);
  const overall = detections.length ? (detections.some(d => d.result === 'fail') ? 'fail' : 'pass') : 'pending';
  return {
    trace_code: b.trace_code,
    product_name: b.product_name,
    variety: b.variety,
    stall: stall ? toPublicStall(stall) : null,
    origin: {
      type: b.origin_type,
      type_text: ORIGIN_TEXT[b.origin_type] || b.origin_type,
      place: b.origin_place
    },
    purchase_time: b.purchase_time,
    best_before: b.best_before,
    expiry_state: exp,
    expiry_text: exp ? EXPIRY_TEXT[exp] : null,
    detection_summary: RESULT_TEXT[overall],
    detections: detections.map(d => ({
      item: d.item, result: d.result, result_text: RESULT_TEXT[d.result],
      method: d.method, tested_by: d.tested_by, tested_at: d.tested_at
    })),
    handlings: handlings.map(h => ({
      type: h.type, quantity: h.quantity, unit: h.unit, handled_at: h.handled_at, note: h.note
    })),
    on_sale: onSale,
    status_text: STATUS_TEXT[b.status] || b.status
  };
}

module.exports = {
  daysUntil, expiryState, EXPIRY_TEXT, STATUS_TEXT, RESULT_TEXT, ORIGIN_TEXT,
  NEAR_EXPIRY_DAYS, randomToken, genTraceCode, latestRemaining, toPublicStall, toPublicBatch
};
