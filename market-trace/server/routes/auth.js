const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign } = require('../auth');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.find('users', x => x.username === String(username || '').trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const stall = u.role === 'owner' ? db.find('stalls', s => s.userId === u.id) : null;
  res.json({
    token: sign(u),
    user: { id: u.id, username: u.username, name: u.name, role: u.role },
    stall: stall ? { id: stall.id, stallNo: stall.stallNo, name: stall.name, category: stall.category } : null
  });
});
module.exports = router;
