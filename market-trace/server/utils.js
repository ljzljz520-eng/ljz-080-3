// 日期与批次状态计算
function dstr(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}
function today() { return dstr(new Date()); }
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return dstr(d);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
// 批次综合状态（后台使用，含内部处置信息）
function batchStatus(b, now = today()) {
  if (b.disposed) return 'disposed';          // 已处置/下架
  if ((b.remainingQty || 0) <= 0) return 'sold_out';
  const left = daysBetween(now, b.expiryDate);
  if (left < 0) return 'expired';
  const threshold = b.nearDays != null ? b.nearDays : 2;
  if (left <= threshold) return 'near_expiry';
  return 'fresh';
}
const STATUS_TEXT = {
  fresh: '新鲜在售', near_expiry: '临期预警', expired: '已过期',
  sold_out: '已售罄', disposed: '已处置'
};
const RESULT_TEXT = { pass: '合格', fail: '不合格', pending: '待检测' };
const PATROL_TEXT = { pass: '巡检正常', problem: '发现问题', rectified: '已整改' };

// 消费者端可见的批次信息（严格脱敏：不含成本、库存、摊主/供应商联系方式、内部备注、巡检记录）
function publicBatch(b, now = today()) {
  const insp = (b._inspections || []).find(i => i.result === 'pass') || (b._inspections || [])[0] || null;
  const status = batchStatus(b, now);
  let publicStatus;
  if (b.disposed) publicStatus = '已下架';
  else if ((b.remainingQty || 0) <= 0) publicStatus = '已售罄';
  else if (status === 'expired') publicStatus = '已下架';
  else publicStatus = '在售';
  return {
    code: b.code,
    productName: b._product ? b._product.name : b.productName,
    category: b._product ? b._product.category : '',
    stallName: b._stall ? b._stall.name : '',
    stallNo: b._stall ? b._stall.stallNo : '',
    supplierName: b._supplier ? b._supplier.name : '',
    origin: b._supplier ? b._supplier.origin : '',
    purchaseDate: b.purchaseDate,
    productionDate: b.productionDate,
    expiryDate: b.expiryDate,
    shelfLifeDays: b.shelfLifeDays,
    unit: b.unit,
    inspection: insp && insp.result !== 'pending' ? {
      result: insp.result,
      resultText: RESULT_TEXT[insp.result] || insp.result,
      items: insp.items || '',
      inspector: insp.inspectorType === 'market' ? insp.inspector + '（市场快检室）' : insp.inspector,
      date: insp.inspectionDate
    } : { result: 'pending', resultText: '检测结果待公示' },
    publicStatus,
    disposal: b.disposed ? { date: b.disposedAt, method: b.disposalMethod } : null
  };
}
module.exports = { dstr, today, addDays, daysBetween, batchStatus, STATUS_TEXT, RESULT_TEXT, PATROL_TEXT, publicBatch };
