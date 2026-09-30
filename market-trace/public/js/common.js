const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function toast(msg, isErr) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast on' + (isErr ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', 2200);
}
async function api(url, opts = {}) {
  const token = localStorage.getItem('mt_token');
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, token ? { Authorization: 'Bearer ' + token } : {});
  const r = await fetch(url, Object.assign({}, opts, { headers }));
  if (r.status === 401) { localStorage.removeItem('mt_token'); if (location.pathname.includes('/owner/') || location.pathname.includes('/admin/')) location.href = 'login.html'; throw new Error('未登录'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || '请求失败');
  return data;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function modal(html) {
  let m = $('#modalMask');
  if (!m) { m = document.createElement('div'); m.id = 'modalMask'; m.className = 'modal-mask'; m.innerHTML = '<div class="modal" id="modalBox"></div>'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) closeModal(); }); }
  $('#modalBox').innerHTML = '<button class="close" onclick="closeModal()">&times;</button>' + html;
  m.classList.add('on');
}
function closeModal() { const m = $('#modalMask'); if (m) m.classList.remove('on'); }
window.closeModal = closeModal;
function statusTag(status, textMap) {
  const map = textMap || { fresh: ['新鲜在售', 'green'], near_expiry: ['临期预警', 'amber'], expired: ['已过期', 'red'], sold_out: ['已售罄', 'gray'], disposed: ['已处置', 'gray'] };
  const [t, c] = map[status] || [status, 'gray'];
  return '<span class="tag ' + c + '">' + t + '</span>';
}
// 扫码：摄像头 jsQR 实时识别；无法授权时可手动输入批次号
async function scanQR(onResult) {
  modal('<h3>扫描批次二维码</h3><div class="scan-box"><video id="scanVideo" playsinline muted></video></div><p class="muted" style="margin-top:10px">将批次二维码对准摄像头（需授权摄像头权限）</p><div style="margin-top:12px"><label>或手动输入批次号</label><div class="row" style="margin-top:6px"><input id="manualCode" placeholder="如 PC20260930-001" style="flex:2"><button class="btn" id="manualBtn">查询</button></div></div>');
  const video = $('#scanVideo');
  let stream = null, stopped = false, raf = 0;
  const stop = () => { stopped = true; if (stream) stream.getTracks().forEach(t => t.stop()); cancelAnimationFrame(raf); };
  window._stopScan = stop;
  $('#manualBtn').onclick = () => { const v = $('#manualCode').value.trim(); if (v) { stop(); closeModal(); onResult(v); } };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
    const cv = document.createElement('canvas');
    const tick = () => {
      if (stopped) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        cv.width = video.videoWidth; cv.height = video.height;
        cv.getContext('2d').drawImage(video, 0, 0);
        const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
        const qr = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (qr && qr.data) { stop(); closeModal(); onResult(qr.data); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    toast('无法打开摄像头，请手动输入批次号', true);
  }
}
window.scanQR = scanQR;
