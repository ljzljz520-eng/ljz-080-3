const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { enrichBatch, listBatches } = require('../helpers');
const { publicBatch, batchStatus } = require('../utils');
const router = express.Router();

// 摊位列表（消费者）：只返回公示信息
router.get('/stalls', (req, res) => {
  res.json(db.all('stalls').map(s => ({
    id: s.id, stallNo: s.stallNo, name: s.name, category: s.category
  })));
});

// 某摊位在售批次（消费者）：脱敏
router.get('/stalls/:id/batches', (req, res) => {
  const st = db.find('stalls', s => s.id === Number(req.params.id));
  if (!st) return res.status(404).json({ error: '摊位不存在' });
  const rows = listBatches(b => b.stallId === st.id).map(b => publicBatch(b));
  // 消费者端：只看在售批次（已下架/售罄默认不展示）
  res.json({
    stall: { stallNo: st.stallNo, name: st.name, category: st.category },
    batches: rows.filter(b => b.publicStatus === '在售')
  });
});

// 批次溯源信息（扫码直达，脱敏）
router.get('/batch/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const b = db.find('batches', x => x.code === code);
  if (!b) return res.status(404).json({ error: '未找到该批次信息' });
  res.json(publicBatch(enrichBatch(b)));
});

// 全局搜索商品
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  const seen = new Set();
  const out = [];
  for (const b of listBatches()) {
    const pub = publicBatch(b);
    if (pub.publicStatus !== '在售') continue;
    if (pub.productName.toLowerCase().includes(q) || (pub.category || '').toLowerCase().includes(q)) {
      const key = pub.stallNo + pub.productName;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pub);
    }
  }
  res.json(out.slice(0, 30));
});

// 批次二维码 PNG（公开，无需登录）
router.get('/qr/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const b = db.find('batches', x => x.code === code);
  if (!b) return res.status(404).send('batch not found');
  const url = req.protocol + '://' + req.get('host') + '/trace.html?c=' + code;
  res.setHeader('Content-Type', 'image/png');
  res.send(await QRCode.toBuffer(url, { width: 320, margin: 2 }));
});

module.exports = router;
