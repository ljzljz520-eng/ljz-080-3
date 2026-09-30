// 极简 JSON 文件数据库（无需安装原生模块，适合演示/轻量部署）
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data.json');
let db = null;

function empty() {
  return {
    seq: {},
    data: {
      users: [], stalls: [], suppliers: [], products: [],
      batches: [], inspections: [], inventoryLogs: [],
      disposals: [], patrols: []
    }
  };
}
function load() {
  if (db) return db;
  if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  else { db = empty(); save(); }
  return db;
}
function save() { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }
function nextId(col) {
  const d = load();
  d.seq[col] = (d.seq[col] || 0) + 1;
  return d.seq[col];
}
function all(col) { return load().data[col]; }
function find(col, fn) { return all(col).find(fn); }
function filter(col, fn) { return all(col).filter(fn); }
function insert(col, row) {
  const rec = Object.assign({ id: nextId(col), createdAt: new Date().toISOString() }, row);
  all(col).push(rec); save();
  return rec;
}
function update(col, id, patch) {
  const rec = find(col, r => r.id === id);
  if (!rec) return null;
  Object.assign(rec, patch); save();
  return rec;
}
module.exports = { load, save, all, find, filter, insert, update, nextId };
