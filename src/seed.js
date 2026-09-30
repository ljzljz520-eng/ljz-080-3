const db = require('./db');

db.pragma('foreign_keys = ON');
db.exec(`DELETE FROM sessions; DELETE FROM expiry_handlings; DELETE FROM inventory_logs;
DELETE FROM detections; DELETE FROM inspections; DELETE FROM batches; DELETE FROM stalls; DELETE FROM admins;
DELETE FROM sqlite_sequence;`);

function d(offset) {
  const x = new Date();
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
}
function dt(offset, hhmm) {
  return `${d(offset)} ${hhmm}`;
}
const now = new Date();
const t = (hhmm) => `${now.toISOString().slice(0, 11)}${hhmm}`;

// ---------- 管理员 ----------
db.prepare('INSERT INTO admins (username, name, password, badge_no) VALUES (?,?,?,?)')
  .run('admin', '王巡查', 'admin123', 'SC2026001');

// ---------- 摊位 ----------
const stallInserts = [
  ['S001', '老李新鲜蔬菜摊', '蔬菜', '李德福', '13800000001', 'A区-01号', '06:00-19:00', 'JY2026-A001'],
  ['S002', '张记优选果品', '水果', '张桂花', '13800000002', 'A区-08号', '07:00-20:00', 'JY2026-A008'],
  ['S003', '诚信鲜肉铺', '肉类', '陈志强', '13800000003', 'B区-03号', '05:30-13:00', 'JY2026-B003'],
  ['S004', '水乡活鱼档', '水产', '赵水生', '13800000004', 'C区-02号', '06:00-18:30', 'JY2026-C002'],
  ['S005', '豆香坊豆制品', '豆制品', '周秀英', '13800000005', 'D区-05号', '06:30-18:00', 'JY2026-D005']
];
const insertStall = db.prepare('INSERT INTO stalls (code,name,category,owner_name,phone,location,business_hours,license_no,password) VALUES (?,?,?,?,?,?,?,?,?)');
for (const s of stallInserts) insertStall.run(...s, '123456');

const sid = Object.fromEntries(db.prepare('SELECT id, code FROM stalls').all().map(s => [s.code, s.id]));

// ---------- 批次 ----------
const insertBatch = db.prepare(`INSERT INTO batches
 (trace_code, stall_id, product_name, variety, origin_type, origin_place, supplier, supplier_contact,
  quantity, unit, purchase_time, arrival_time, best_before, status)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const batches = [
  // 老李蔬菜：青菜，基地直供，合格，在售
  ['PC20260930A001', sid.S001, '上海青', '矮脚青', 'base', '本市崇明绿色蔬菜基地', '崇明绿苑合作社', '王经理 021-6688xxxx',
   80, '公斤', t('06:20'), t('05:50'), d(2), 'on_sale'],
  // 老李蔬菜：西红柿，临期（明天到期），已做折价处理
  ['PC20260928A017', sid.S001, '西红柿', '粉果', 'farm', '山东寿光农户·刘庄', '刘保田代收点', '刘保田 139xxxx',
   60, '公斤', dt(-2, '06:10'), dt(-2, '05:40'), d(1), 'on_sale'],
  // 老李蔬菜：韭菜，农残超标，不合格 -> 召回销毁（消费者端不展示为在售）
  ['PC20260929A012', sid.S001, '韭菜', '汉中韭', 'wholesale', '市农产品批发市场3号棚', '批发行·恒丰', '137xxxx',
   40, '公斤', dt(-1, '07:00'), dt(-1, '06:30'), d(1), 'recalled'],
  // 张记果品：苹果，在售合格
  ['PC20260930B003', sid.S002, '红富士苹果', '85#大果', 'base', '陕西洛川苹果直供基地', '洛川红达合作社', '李社长 0911-xxxx',
   150, '公斤', t('08:00'), t('07:20'), d(20), 'on_sale'],
  // 张记果品：香蕉，临期（今天到期），折价
  ['PC20260929B009', sid.S002, '香蕉', '海南芝麻蕉', 'supplier', '海南乐东', '南方鲜果配送', '林生 136xxxx',
   35, '公斤', dt(-1, '09:00'), dt(-1, '08:30'), d(0), 'on_sale'],
  // 诚信鲜肉：猪肉，检疫合格
  ['PC20260930C002', sid.S003, '猪后腿肉', '冷鲜', 'supplier', '本市金锣定点屠宰场', '金锣冷链配送', '400-xxx',
   50, '公斤', t('05:10'), t('04:50'), d(1), 'on_sale'],
  // 水乡活鱼：草鱼
  ['PC20260930D001', sid.S004, '草鱼', '生态草鱼 2-3斤', 'farm', '千岛湖生态养殖区', '赵记自运', '13800000004',
   45, '公斤', t('06:00'), t('05:30'), d(1), 'on_sale'],
  // 豆香坊：豆腐（已售罄批次示例）
  ['PC20260929E006', sid.S005, '卤水豆腐', '老豆腐', 'supplier', '本市清美豆制品厂', '清美每日配送', '021-58xxxx',
   30, '公斤', dt(-1, '06:30'), dt(-1, '06:00'), d(0), 'sold_out']
];
for (const b of batches) insertBatch.run(...b);
const bid = Object.fromEntries(db.prepare('SELECT id, trace_code FROM batches').all().map(x => [x.trace_code, x.id]));

// ---------- 初始库存日志 ----------
const invInit = db.prepare('INSERT INTO inventory_logs (batch_id, stall_id, remaining, note) VALUES (?,?,?,?)');
db.prepare('SELECT id, stall_id, quantity FROM batches').all().forEach(b => invInit.run(b.id, b.stall_id, b.quantity, '进货入库'));

// ---------- 检测结果 ----------
const det = db.prepare('INSERT INTO detections (batch_id, item, result, tested_by, method, tested_at) VALUES (?,?,?,?,?,?)');
det.run(bid.PC20260930A001, '有机磷农药残留', 'pass', '市场快检室·孙敏', '酶抑制率法', t('07:10'));
det.run(bid.PC20260928A017, '有机磷农药残留', 'pass', '市场快检室·孙敏', '酶抑制率法', dt(-2, '07:00'));
det.run(bid.PC20260929A012, '有机磷农药残留', 'fail', '市场快检室·孙敏', '酶抑制率法（抑制率118%，超标）', dt(-1, '08:10'));
det.run(bid.PC20260930B003, '甜味剂/农残快检', 'pass', '市场快检室·孙敏', '胶体金法', t('08:40'));
det.run(bid.PC20260929B009, '二氧化硫残留', 'pass', '市场快检室·孙敏', '比色法', dt(-1, '09:30'));
det.run(bid.PC20260930C002, '瘦肉精（克伦特罗）', 'pass', '定点屠宰检疫', 'ELISA', t('05:20'));
det.run(bid.PC20260930C002, '动物检疫合格证', 'pass', '驻场官方兽医·钱国栋', '查验检疫章/证', t('05:25'));
det.run(bid.PC20260930D001, '孔雀石绿/硝基呋喃', 'pass', '市场快检室·孙敏', '胶体金法', t('07:00'));
det.run(bid.PC20260929E006, '硼砂/吊白块快检', 'pass', '厂家出厂检验+市场复核', '胶体金法', dt(-1, '07:00'));

// ---------- 库存变化日志 ----------
const invLog = db.prepare('INSERT INTO inventory_logs (batch_id, stall_id, remaining, sold, discarded, note) VALUES (?,?,?,?,?,?)');
invLog.run(bid.PC20260930A001, sid.S001, 62, 18, 0, '上午盘点');
invLog.run(bid.PC20260928A017, sid.S001, 22, 38, 0, '持续销售中');
invLog.run(bid.PC20260930B003, sid.S002, 131, 19, 0, '上午盘点');
invLog.run(bid.PC20260929B009, sid.S002, 12, 23, 0, '上午盘点');
invLog.run(bid.PC20260929E006, sid.S005, 0, 30, 0, '当日售罄');

// ---------- 临期处理记录 ----------
const eh = db.prepare('INSERT INTO expiry_handlings (batch_id, stall_id, type, quantity, unit, handled_at, note) VALUES (?,?,?,?,?,?,?)');
eh.run(bid.PC20260928A017, sid.S001, 'discount', 20, '公斤', t('09:00'), '临期折价：原价6元/斤 → 3.5元/斤，专区销售，当日清完');
eh.run(bid.PC20260929B009, sid.S002, 'discount', 23, '公斤', t('10:00'), '当日到期香蕉8折促销，闭市前下架复核');
// 韭菜召回+销毁（检测失败时系统已自动插入一条recall，这里补一条销毁记录）
eh.run(bid.PC20260929A012, sid.S001, 'destroy', 40, '公斤', dt(-1, '10:30'), '在管理员见证下无害化销毁，留存照片');

// ---------- 巡检记录 ----------
const ins = db.prepare('INSERT INTO inspections (stall_id, admin_id, result, issue, requirement) VALUES (?,?,?,?,?)');
ins.run(sid.S001, 1, 'rectify', '韭菜农残超标', '整批召回销毁并公示；该供应商3日内暂停入场，提供整改报告');
ins.run(sid.S002, 1, 'pass', null, null);
ins.run(sid.S003, 1, 'pass', null, '两证齐全，冷鲜柜温度记录正常');
ins.run(sid.S004, 1, 'pass', '地面有少量积水', '及时清扫保持防滑');

console.log('种子数据写入完成');
console.log('摊主登录：摊位号 S001 ~ S005，密码 123456');
console.log('管理员登录：admin / admin123');
