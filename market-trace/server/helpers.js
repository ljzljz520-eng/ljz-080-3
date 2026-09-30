const db = require('./db');
const { batchStatus } = require('./utils');

// 组装批次关联信息（商品/摊位/供应商/检测/处置/巡检/库存日志）
function enrichBatch(b, opts = {}) {
  const today = opts.today;
  return Object.assign({}, b, {
    _product: db.find('products', p => p.id === b.productId) || null,
    _stall: db.find('stalls', s => s.id === b.stallId) || null,
    _supplier: db.find('suppliers', x => x.id === b.supplierId) || null,
    _inspections: db.filter('inspections', i => i.batchId === b.id).sort((a, z) => a.inspectionDate.localeCompare(z.inspectionDate)),
    _disposal: db.find('disposals', x => x.batchId === b.id) || null,
    _patrols: db.filter('patrols', x => x.batchId === b.id).sort((a, z) => z.patrolDate.localeCompare(a.patrolDate)),
    _logs: db.filter('inventoryLogs', x => x.batchId === b.id).sort((a, z) => (z.date + z.createdAt).localeCompare(a.date + a.createdAt)),
    status: batchStatus(b, today || new Date().toISOString().slice(0, 10))
  });
}
function listBatches(predicate) {
  return db.all('batches').filter(predicate || (() => true))
    .map(b => enrichBatch(b))
    .sort((a, z) => (z.purchaseDate + z.code).localeCompare(a.purchaseDate + a.code));
}
function ownerStallId(userId) {
  const st = db.find('stalls', s => s.userId === userId);
  return st ? st.id : null;
}
// 后台展示用批次视图（含内部信息）
function adminBatchView(b) {
  const latestInsp = b._inspections[b._inspections.length - 1] || null;
  return {
    id: b.id, code: b.code, productId: b.productId, productName: b._product ? b._product.name : b.productName,
    category: b._product ? b._product.category : '', supplierId: b.supplierId,
    supplierName: b._supplier ? b._supplier.name : '', stallId: b.stallId,
    stallName: b._stall ? b._stall.name : '', stallNo: b._stall ? b._stall.stallNo : '',
    purchaseDate: b.purchaseDate, productionDate: b.productionDate, expiryDate: b.expiryDate,
    shelfLifeDays: b.shelfLifeDays, nearDays: b.nearDays,
    quantity: b.quantity, remainingQty: b.remainingQty, unit: b.unit,
    purchasePrice: b.purchasePrice, status: b.status, disposed: b.disposed,
    disposalMethod: b.disposalMethod || '', disposalNote: b.disposalNote || '',
    inspectionResult: latestInsp ? latestInsp.result : 'none',
    inspectionsCount: b._inspections.length, note: b.note || '', createdAt: b.createdAt
  };
}
module.exports = { enrichBatch, listBatches, ownerStallId, adminBatchView };
