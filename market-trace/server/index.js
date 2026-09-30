const path = require('path');
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/owner', require('./routes/owner'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/public', require('./routes/publicApi'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器错误' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('溯源平台运行中: http://localhost:' + PORT));
