const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'market-trace-demo-secret';
function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '12h' });
}
function auth(roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    try {
      const payload = jwt.verify(h.replace(/^Bearer\s+/i, ''), SECRET);
      if (roles && roles.length && !roles.includes(payload.role)) return res.status(403).json({ error: '无权限' });
      req.user = payload;
      next();
    } catch (e) { return res.status(401).json({ error: '请先登录' }); }
  };
}
module.exports = { sign, auth };
