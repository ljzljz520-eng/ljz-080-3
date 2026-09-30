const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'market.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS stalls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  business_hours TEXT,
  license_no TEXT,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  badge_no TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_code TEXT UNIQUE NOT NULL,
  stall_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  variety TEXT,
  origin_type TEXT NOT NULL,
  origin_place TEXT NOT NULL,
  supplier TEXT,
  supplier_contact TEXT,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  purchase_time TEXT NOT NULL,
  arrival_time TEXT,
  best_before TEXT,
  status TEXT NOT NULL DEFAULT 'on_sale',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (stall_id) REFERENCES stalls(id)
);

CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  result TEXT NOT NULL,
  tested_by TEXT NOT NULL,
  method TEXT,
  tested_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  stall_id INTEGER NOT NULL,
  remaining REAL NOT NULL,
  sold REAL NOT NULL DEFAULT 0,
  discarded REAL NOT NULL DEFAULT 0,
  note TEXT,
  logged_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS expiry_handlings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  stall_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  handled_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stall_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  result TEXT NOT NULL,
  issue TEXT,
  requirement TEXT,
  inspected_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (stall_id) REFERENCES stalls(id),
  FOREIGN KEY (admin_id) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);


// 轻量迁移：为已存在的旧库补列
try { db.exec('ALTER TABLE expiry_handlings ADD COLUMN unit TEXT'); } catch (e) {}

module.exports = db;
