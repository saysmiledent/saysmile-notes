// Handwriting engine: stroke encoding, rendering, pointer handling (Apple Pencil), touch gestures (pan / pinch).
export const PAGE_W = 794, PAGE_H = 1123;       // A4 at 96 dpi — the coordinate space of every page
export const BACKING = 2;                        // canvas backing-store scale (retina)

/* ───────────── stroke encoding: simplified, quantized (¼ px), delta-coded ints ───────────── */
function rdp(P, eps) {                           // P: [{x,y,p}] — iterative Ramer–Douglas–Peucker
  const n = P.length; if (n < 3) return P;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = P[a].x, ay = P[a].y, dx = P[b].x - ax, dy = P[b].y - ay, L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let d;
      if (L === 0) d = Math.hypot(P[i].x - ax, P[i].y - ay);
      else { const t = Math.max(0, Math.min(1, ((P[i].x - ax) * dx + (P[i].y - ay) * dy) / L)); d = Math.hypot(P[i].x - (ax + t * dx), P[i].y - (ay + t * dy)); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return P.filter((_, i) => keep[i]);
}
export function encodeStroke(points, tool, color, width) {
  const P = rdp(points, 0.35);
  const pts = []; let qx = 0, qy = 0, qp = 0;
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  P.forEach((q, i) => {
    const x = Math.round(q.x * 4), y = Math.round(q.y * 4), p = Math.round(Math.max(0, Math.min(1, q.p)) * 100);
    if (i === 0) pts.push(x, y, p); else pts.push(x - qx, y - qy, p - qp);
    qx = x; qy = y; qp = p;
    minx = Math.min(minx, q.x); miny = Math.min(miny, q.y); maxx = Math.max(maxx, q.x); maxy = Math.max(maxy, q.y);
  });
  return { t: tool, c: color, w: width, pts, bb: [Math.floor(minx), Math.floor(miny), Math.ceil(maxx), Math.ceil(maxy)] };
}
export function decodeStroke(d) {                // → Float32Array [x,y,p,x,y,p…] in page px, p 0..1
  const a = d.pts, n = a.length / 3, out = new Float32Array(a.length);
  let x = 0, y = 0, p = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0) { x = a[0]; y = a[1]; p = a[2]; } else { x += a[i * 3]; y += a[i * 3 + 1]; p += a[i * 3 + 2]; }
    out[i * 3] = x / 4; out[i * 3 + 1] = y / 4; out[i * 3 + 2] = p / 100;
  }
  return out;
}
const pts = o => o._p || (o._p = decodeStroke(o.data));

/* ───────────── rendering ───────────── */
export function drawStroke(ctx, P, tool, color, width, alpha = 1) {
  const n = P.length / 3; if (!n) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (tool === 'hl') {
    ctx.globalAlpha = alpha * 0.34; ctx.lineWidth = width; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(P[0], P[1]);
    if (n === 1) ctx.lineTo(P[0] + 0.1, P[1]);
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(P[i * 3], P[i * 3 + 1], (P[i * 3] + P[i * 3 + 3]) / 2, (P[i * 3 + 1] + P[i * 3 + 4]) / 2);
    if (n > 1) ctx.lineTo(P[(n - 1) * 3], P[(n - 1) * 3 + 1]);
    ctx.stroke(); ctx.restore(); return;
  }
  const wf = p => width * (0.45 + 0.85 * p);
  if (n === 1) { ctx.beginPath(); ctx.arc(P[0], P[1], wf(P[2]) / 2, 0, 6.2832); ctx.fill(); ctx.restore(); return; }
  if (n === 2) { ctx.lineWidth = wf((P[2] + P[5]) / 2); ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[3], P[4]); ctx.stroke(); ctx.restore(); return; }
  let ax = P[0], ay = P[1];
  for (let i = 1; i < n - 1; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], mx = (x + P[i * 3 + 3]) / 2, my = (y + P[i * 3 + 4]) / 2;
    ctx.lineWidth = wf(P[i * 3 + 2]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(x, y, mx, my); ctx.stroke(); ax = mx; ay = my;
  }
  ctx.lineWidth = wf(P[(n - 1) * 3 + 2]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(P[(n - 1) * 3], P[(n - 1) * 3 + 1]); ctx.stroke();
  ctx.restore();
}

/** view = { colorOf(obj)->css|null, filterAuthor, hl:Set|null } */
export function drawStrokeObj(ctx, obj, view) {
  const d = obj.data; let color = d.c, alpha = 1;
  const ac = view.colorOf && view.colorOf(obj);
  if (view.filterAuthor) {
    if (obj.author_id === view.filterAuthor) color = ac || color; else { alpha = 0.1; color = '#8a8a8a'; }
  } else if (ac) color = ac;
  if (view.hl && view.hl.size && !view.hl.has(obj.id)) alpha *= 0.12;
  drawStroke(ctx, pts(obj), d.t, color, d.w, alpha);
}

/* ───────────── eraser hit test ───────────── */
export function strokeHit(obj, x, y, r) {
  const d = obj.data, bb = d.bb, m = r + d.w;
  if (x < bb[0] - m || x > bb[2] + m || y < bb[1] - m || y > bb[3] + m) return false;
  const P = pts(obj), n = P.length / 3, rr = r + d.w / 2;
  if (n === 1) return Math.hypot(P[0] - x, P[1] - y) <= rr;
  for (let i = 0; i < n - 1; i++) {
    const ax = P[i * 3], ay = P[i * 3 + 1], bx = P[i * 3 + 3], by = P[i * 3 + 4], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= rr) return true;
  }
  return false;
}

/* ═════════════ one page's canvases + pointer input ═════════════
   host: { tool(), canWrite(), fingerDraw(), strokes(pageId), view(), commitStroke(pageId,data), erase(ids) } */
export class PageInk {
  constructor(pageId, ink, live, host) {
    this.pageId = pageId; this.ink = ink; this.live = live; this.host = host; this.active = false;
    this.cur = null; this.lastPen = 0; this.erased = [];
    live.addEventListener('pointerdown', e => this.down(e));
    live.addEventListener('pointermove', e => this.move(e));
    live.addEventListener('pointerup', e => this.up(e));
    live.addEventListener('pointercancel', e => this.up(e, true));
    live.addEventListener('contextmenu', e => e.preventDefault());
  }
  setActive(on) {
    if (on === this.active) return; this.active = on;
    for (const c of [this.ink, this.live]) {
      if (on) { c.width = PAGE_W * BACKING; c.height = PAGE_H * BACKING; } else { c.width = 1; c.height = 1; }
    }
    if (on) this.render();
  }
  render() {
    if (!this.active) return;
    const ctx = this.ink.getContext('2d'); ctx.setTransform(BACKING, 0, 0, BACKING, 0, 0);
    ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    const view = this.host.view();
    for (const o of this.host.strokes(this.pageId)) drawStrokeObj(ctx, o, view);
  }
  drawOne(obj) {
    if (!this.active) return;
    const ctx = this.ink.getContext('2d'); ctx.setTransform(BACKING, 0, 0, BACKING, 0, 0);
    drawStrokeObj(ctx, obj, this.host.view());
  }
  pos(e) {
    const r = this.live.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * PAGE_W, y: (e.clientY - r.top) / r.height * PAGE_H };
  }
  pressure(e) { return e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5; }
  down(e) {
    const h = this.host;
    if (e.pointerType === 'pen') { this.lastPen = Date.now(); h.penSeen && h.penSeen(); }
    const tool = h.tool();
    if (!h.canWrite() || tool.name === 'select' || tool.name === 'text') return;
    if (e.pointerType === 'touch' && (!h.fingerDraw() || Date.now() - this.lastPen < 700)) return;   // finger scrolls; palm ignored
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.__ink = true; e.preventDefault();
    try { this.live.setPointerCapture(e.pointerId); } catch (_) {}
    this.pid = e.pointerId;
    const q = this.pos(e);
    if (tool.name === 'eraser') { this.erased = []; this.cur = { erase: true }; this.eraseAt(q); return; }
    this.cur = { tool: tool.name === 'hl' ? 'hl' : 'pen', color: tool.color, width: tool.width, pts: [{ x: q.x, y: q.y, p: this.pressure(e) }] };
    this.schedule();
  }
  move(e) {
    if (!this.cur || e.pointerId !== this.pid) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (evs.length ? evs : [e])) {
      const q = this.pos(ev);
      if (this.cur.erase) this.eraseAt(q);
      else {
        const L = this.cur.pts[this.cur.pts.length - 1];
        if (Math.hypot(q.x - L.x, q.y - L.y) >= 0.4) this.cur.pts.push({ x: q.x, y: q.y, p: this.pressure(ev) });
      }
    }
    if (!this.cur.erase) this.schedule();
  }
  up(e, cancel) {
    if (!this.cur || e.pointerId !== this.pid) return;
    const c = this.cur; this.cur = null;
    try { this.live.releasePointerCapture(e.pointerId); } catch (_) {}
    const lctx = this.live.getContext('2d'); lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, this.live.width, this.live.height);
    if (c.erase) { if (this.erased.length) this.host.erase(this.erased.slice()); this.erased = []; return; }
    if (cancel && c.pts.length < 2) return;
    const data = encodeStroke(c.pts, c.tool, c.color, c.width);
    const obj = this.host.commitStroke(this.pageId, data);
    this.drawOne(obj);
  }
  // A second finger landed: abandon the half-drawn stroke so it becomes a pinch/pan instead.
  cancelStroke() {
    if (!this.cur) return;
    const c = this.cur; this.cur = null;
    try { this.live.releasePointerCapture(this.pid); } catch (_) {}
    const lctx = this.live.getContext('2d'); lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, this.live.width, this.live.height);
    if (c.erase && this.erased.length) { this.host.erase(this.erased.slice()); }
    this.erased = [];
  }
  eraseAt(q) {
    const r = 9, seen = new Set(this.erased);
    let hit = false;
    for (const o of this.host.strokes(this.pageId)) {
      if (seen.has(o.id)) continue;
      if (strokeHit(o, q.x, q.y, r)) { this.erased.push(o.id); hit = true; o._erasing = true; }
    }
    if (hit) { this.host.markErasing(this.pageId, this.erased); this.render(); }
  }
  schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0; if (!this.cur || this.cur.erase) return;
      const ctx = this.live.getContext('2d'); ctx.setTransform(BACKING, 0, 0, BACKING, 0, 0); ctx.clearRect(0, 0, PAGE_W, PAGE_H);
      const P = new Float32Array(this.cur.pts.length * 3);
      this.cur.pts.forEach((q, i) => { P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.p; });
      drawStroke(ctx, P, this.cur.tool, this.cur.color, this.cur.width);
    });
  }
}

/* ═════════════ touch gestures: one finger pans, two fingers pinch-zoom ═════════════ */
export class Gestures {
  constructor(scroller, { getZoom, setZoom, onMulti }) {
    this.sc = scroller; this.getZoom = getZoom; this.setZoom = setZoom; this.onMulti = onMulti; this.ptrs = new Map(); this.inkIds = new Set(); this.g = null;
    const on = (t, f) => scroller.addEventListener(t, f, { passive: false });
    on('pointerdown', e => this.down(e)); on('pointermove', e => this.move(e));
    on('pointerup', e => this.up(e)); on('pointercancel', e => this.up(e));
    scroller.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
      this.setZoom(this.getZoom() * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    }, { passive: false });
  }
  down(e) {
    if (e.pointerType !== 'touch' || e.__obj) return;   // dragging a photo/text object: not a page gesture
    if (e.__ink) this.inkIds.add(e.pointerId);          // one finger is drawing: it must not pan
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size >= 2) { this.inkIds.clear(); this.onMulti && this.onMulti(); }
    this.begin();
  }
  begin() {
    const a = [...this.ptrs.values()];
    this.g = a.length >= 2 ? { mode: 'pinch', d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z: this.getZoom(), cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 }
                           : { mode: this.inkIds.size ? 'none' : 'pan' };
    this.last = this.center();
  }
  center() { const a = [...this.ptrs.values()]; return { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length }; }
  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = this.center();
    if (this.g.mode === 'none') { this.last = c; return; }
    if (this.g.mode === 'pan' || this.ptrs.size < 2) {
      this.sc.scrollLeft -= c.x - this.last.x; this.sc.scrollTop -= c.y - this.last.y;
    } else {
      const a = [...this.ptrs.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      this.setZoom(this.g.z * d / this.g.d, c.x, c.y);
      this.sc.scrollLeft -= c.x - this.last.x; this.sc.scrollTop -= c.y - this.last.y;
    }
    this.last = c;
  }
  up(e) { this.inkIds.delete(e.pointerId); if (this.ptrs.delete(e.pointerId) && this.ptrs.size) this.begin(); }
}
