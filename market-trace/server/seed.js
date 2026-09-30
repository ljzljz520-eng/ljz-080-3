// 初始化演示数据
const bcrypt = require('bcryptjs');
const db = require('./db');
const { addDays, today } = require('./utils');

db.load();
// 清空重建
db.save; // noop
const raw = { seq: {}, data: { users: [], stalls: [], suppliers: [], products: [], batches: [], inspections: [], inventoryLogs: [], disposals: [], patrols: [] } };
require('fs').writeFileSync(require('path').join(__dirname, 'data.json'), JSON.stringify(raw, null, 2));
delete require.cache[require.resolve('./db')];
const d = require('./db');

function hash(p) { return bcrypt.hashSync(p, 8); }

// 账号：1 个管理员 + 2 个摊主
d.insert('users', { username: 'admin', password: hash('admin123'), role: 'admin', name: '王管理员', phone: '' });
d.insert('users', { username: 'li', password: hash('123456'), role: 'owner', name: '李大姐', phone: '13800000001' });
d.insert('users', { username: 'zhang', password: hash('123456'), role: 'owner', name: '张师傅', phone: '13800000002' });

const s1 = d.insert('stalls', { userId: 2, stallNo: 'A-12', name: '李大姐蔬菜摊', category: '蔬菜', phone: '13800000001', businessLicense: '91330100MA01A12X01', status: 'active' });
const s2 = d.insert('stalls', { userId: 3, stallNo: 'A-15', name: '张师傅水产摊', category: '水产', phone: '13800000002', businessLicense: '91330100MA01A15X02', status: 'active' });

d.insert('suppliers', { name: '山东寿光绿源蔬菜合作社', origin: '山东省寿光市', contact: '赵经理', phone: '13911110001', license: 'SC3707832100011', stallId: s1.id });
d.insert('suppliers', { name: '本地云溪蔬菜基地', origin: '本市云溪镇', contact: '孙场长', phone: '13911110002', license: 'SC3301112100022', stallId: s1.id });
d.insert('suppliers', { name: '舟山远洋水产批发商', origin: '浙江省舟山市', contact: '陈老板', phone: '13911110003', license: 'SC3309001100033', stallId: s2.id });

d.insert('products', { name: '西红柿', category: '蔬菜', unit: '斤', defaultShelfLifeDays: 5, defaultNearDays: 2, stallId: s1.id });
d.insert('products', { name: '上海青', category: '蔬菜', unit: '斤', defaultShelfLifeDays: 2, defaultNearDays: 1, stallId: s1.id });
d.insert('products', { name: '黄瓜', category: '蔬菜', unit: '斤', defaultShelfLifeDays: 4, defaultNearDays: 1, stallId: s1.id });
d.insert('products', { name: '土豆', category: '蔬菜', unit: '斤', defaultShelfLifeDays: 30, defaultNearDays: 5, stallId: s1.id });
d.insert('products', { name: '基围虾', category: '水产', unit: '斤', defaultShelfLifeDays: 1, defaultNearDays: 0, stallId: s2.id });
d.insert('products', { name: '鲫鱼', category: '水产', unit: '斤', defaultShelfLifeDays: 2, defaultNearDays: 1, stallId: s2.id });

const T = today();
function batch(o) {
  const b = d.insert('batches', Object.assign({
    stallId: s1.id, status: 'active', disposed: false, disposalNote: '',
    note: '', nearDays: 2, createdAt: new Date().toISOString()
  }, o));
  return b;
}
// A-12 蔬菜摊
let b = batch({ code: 'PC' + T.replace(/-/g, '') + '-001', productId: 1, productName: '西红柿', supplierId: 1,
  purchaseDate: T, productionDate: addDays(T, -1), expiryDate: addDays(T, 4), shelfLifeDays: 5, nearDays: 2,
  quantity: 120, remainingQty: 85, unit: '斤', purchasePrice: 2.5 });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: T, inspectorType: 'self', inspector: '李大姐', result: 'pass', items: '农残快检（有机磷/氨基甲酸酯）：阴性；外观：正常' });

b = batch({ code: 'PC' + T.replace(/-/g, '') + '-002', productId: 2, productName: '上海青', supplierId: 2,
  purchaseDate: addDays(T, -1), productionDate: addDays(T, -1), expiryDate: addDays(T, 1), shelfLifeDays: 2, nearDays: 1,
  quantity: 60, remainingQty: 18, unit: '斤', purchasePrice: 1.8 });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: addDays(T, -1), inspectorType: 'self', inspector: '李大姐', result: 'pass', items: '农残快检：阴性' });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: T, inspectorType: 'market', inspector: '王管理员', result: 'pass', items: '市场抽检农残：阴性；黄叶率 3%，建议当日售卖' });
d.insert('inventoryLogs', { batchId: b.id, stallId: s1.id, date: T, type: 'check', changeQty: -12, qtyAfter: 18, reason: '盘点损耗（黄叶摘除）' });

b = batch({ code: 'PC' + addDays(T, -3).replace(/-/g, '') + '-003', productId: 3, productName: '黄瓜', supplierId: 1,
  purchaseDate: addDays(T, -3), productionDate: addDays(T, -3), expiryDate: addDays(T, 1), shelfLifeDays: 4, nearDays: 1,
  quantity: 80, remainingQty: 10, unit: '斤', purchasePrice: 2.0 });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: addDays(T, -3), inspectorType: 'self', inspector: '李大姐', result: 'pass', items: '农残快检：阴性' });
d.insert('disposals', { batchId: b.id, stallId: s1.id, date: T, qty: 5, method: '折扣处理', reason: '尾部发蔫，下午五折清货', operator: '李大姐', marketConfirmed: true });
d.update('batches', b.id, { remainingQty: 5, disposed: true, disposedAt: T, disposalMethod: '折扣处理', disposalNote: '5斤五折售出，5斤报损待登记' });

b = batch({ code: 'PC' + addDays(T, -2).replace(/-/g, '') + '-004', productId: 4, productName: '土豆', supplierId: 1,
  purchaseDate: addDays(T, -2), productionDate: addDays(T, -3), expiryDate: addDays(T, 27), shelfLifeDays: 30, nearDays: 5,
  quantity: 200, remainingQty: 140, unit: '斤', purchasePrice: 1.2 });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: addDays(T, -2), inspectorType: 'self', inspector: '李大姐', result: 'pass', items: '发芽检查：无发芽；外观正常' });

b = batch({ code: 'PC' + addDays(T, -4).replace(/-/g, '') + '-005', productId: 3, productName: '黄瓜', supplierId: 2,
  purchaseDate: addDays(T, -4), productionDate: addDays(T, -4), expiryDate: addDays(T, 0), shelfLifeDays: 4, nearDays: 1,
  quantity: 40, remainingQty: 6, unit: '斤', purchasePrice: 1.9, note: '昨日市场抽检发现一批农残临界，已复检' });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: addDays(T, -4), inspectorType: 'self', inspector: '李大姐', result: 'pass', items: '农残快检：阴性' });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: addDays(T, -1), inspectorType: 'market', inspector: '王管理员', result: 'fail', items: '抽检农残抑制率 56%（临界 50%），要求暂停销售并复检' });
d.insert('inspections', { batchId: b.id, stallId: s1.id, inspectionDate: T, inspectorType: 'market', inspector: '王管理员', result: 'pass', items: '复检抑制率 31%，合格，限今日售完' });
d.insert('patrols', { batchId: b.id, stallId: s1.id, patrolDate: T, adminId: 1, result: 'rectified', content: '黄瓜批次农残临界，现场下架并监督复检，复检合格后恢复销售', action: '已整改恢复销售' });

// A-15 水产摊
b = batch({ code: 'PC' + T.replace(/-/g, '') + '-101', stallId: s2.id, productId: 5, productName: '基围虾', supplierId: 3,
  purchaseDate: T, productionDate: T, expiryDate: addDays(T, 1), shelfLifeDays: 1, nearDays: 0,
  quantity: 30, remainingQty: 12, unit: '斤', purchasePrice: 28 });
d.insert('inspections', { batchId: b.id, stallId: s2.id, inspectionDate: T, inspectorType: 'self', inspector: '张师傅', result: 'pass', items: '活力检查：正常；甲醛快检：阴性；冰鲜温度 2℃' });

b = batch({ code: 'PC' + addDays(T, -1).replace(/-/g, '') + '-102', stallId: s2.id, productId: 6, productName: '鲫鱼', supplierId: 3,
  purchaseDate: addDays(T, -1), productionDate: addDays(T, -1), expiryDate: addDays(T, 1), shelfLifeDays: 2, nearDays: 1,
  quantity: 25, remainingQty: 7, unit: '斤', purchasePrice: 9 });
d.insert('inspections', { batchId: b.id, stallId: s2.id, inspectionDate: addDays(T, -1), inspectorType: 'self', inspector: '张师傅', result: 'pass', items: '暂养水质检测：正常；无药残异味' });
d.insert('disposals', { batchId: b.id, stallId: s2.id, date: T, qty: 3, method: '销毁', reason: '死亡鲫鱼3斤，市场要求无害化处理', operator: '张师傅', marketConfirmed: true });
d.update('batches', b.id, { remainingQty: 4, disposed: false });
d.insert('patrols', { batchId: b.id, stallId: s2.id, patrolDate: T, adminId: 1, result: 'problem', content: '巡检查出死鱼未及时分拣，要求立即隔离登记', action: '已登记销毁3斤' });

console.log('seed done. 账号: admin/admin123, li/123456, zhang/123456');
