// SaySmile Notes — application shell: auth, library (folders/notes), note editor, sharing, authors/history, export.
import { PAGE_W, PAGE_H, PageInk, Gestures, drawStrokeObj } from './ink.js';
import { BUILTINS, mountTemplate, fitCustom, setFieldValues, slotRect, slotIds } from './templates.js';
import { localStore, cloudStore, downscaleImage } from './store.js';
import { t, getLang, setLang } from './i18n.js';
import { h, icon, ib, toast, modal, askText, askConfirm, ago, fmtTime } from './ui.js';
import CONFIG from './config.js';

const root = document.getElementById('app');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const PAL = ['#6f7140', '#1f5bff', '#a020c0', '#e8321e', '#d98200', '#0a8f6a', '#c2185b', '#455a64'];
const hashColor = id => { let x = 0; for (const c of String(id || '?')) x = (x * 31 + c.charCodeAt(0)) >>> 0; return PAL[x % 8]; };
const PEN_COLORS = ['#1c1b19', '#1f5bff', '#e8321e', '#0a8f6a'], HL_COLORS = ['#ffd60a', '#ff7ab8', '#7ee081', '#6ec6ff'];
const PEN_W = [1.6, 2.4, 4], HL_W = [12, 18, 26];

let store;
const S = {
  user: null, items: [], folderId: null, q: '', trash: false,
  note: null, role: 0, pages: [], objs: [], byId: new Map(), pageObjs: new Map(), pv: new Map(), authors: new Map(), members: [],
  tool: 'pen', cfg: { pen: { color: PEN_COLORS[0], wi: 1 }, hl: { color: HL_COLORS[0], wi: 1 }, text: { color: PEN_COLORS[0] } },
  fingerDraw: false, zoom: 1, undo: [], redo: [], sel: null, filterAuthor: null, hl: null, asOf: 0, authorColors: false, drawer: false,
  sync: { pending: 0 }, curPage: null, unsub: null, io: null,
};
const canWrite = () => S.role >= 2 && !S.asOf && !!S.user;

/* ═══════════════════════════ boot & routing ═══════════════════════════ */
async function boot() {
  document.documentElement.lang = getLang();
  const cloud = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase;
  store = cloud ? cloudStore(CONFIG) : localStore();
  try { S.user = await store.init(); } catch (e) { console.error(e); }
  store.onAuth(u => { S.user = u; route(); });
  store.onSync(onSync);
  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', onKey);
  route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
async function route() {
  cleanupNote();
  if (!S.user && store.mode === 'cloud') return viewAuth();
  const m = location.hash.match(/^#\/(n|f)\/([\w-]+)/);
  if (m && m[1] === 'n') return viewNote(m[2]);
  S.folderId = m ? m[2] : null;
  return viewLibrary();
}
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

const brand = (sub = true) => h('div', { class: 'brand' }, h('span', { class: 'wm' }, h('b', {}, 'Say'), 'Smile'), sub ? h('span', { class: 'sub' }, 'Notes') : null);

/* ═══════════════════════════ auth ═══════════════════════════ */
function viewAuth(mode = 'in') {
  const email = h('input', { class: 'inp', type: 'email', placeholder: t('email'), autocomplete: 'email', inputmode: 'email' });
  const pass = h('input', { class: 'inp', type: 'password', placeholder: t('password'), autocomplete: mode === 'in' ? 'current-password' : 'new-password' });
  const name = h('input', { class: 'inp', placeholder: t('yourName'), autocomplete: 'name' });
  const msg = h('div', { class: 'msg' });
  const submit = async () => {
    msg.textContent = ''; msg.className = 'msg';
    try {
      if (mode === 'in') await store.signIn(email.value.trim(), pass.value);
      else { const r = await store.signUp(email.value.trim(), pass.value, name.value.trim()); if (r && r.needsConfirm) { msg.textContent = t('checkEmail'); msg.className = 'msg ok'; return; } }
      S.user = store.user; route();
    } catch (e) { msg.textContent = (e && e.message) || String(e); }
  };
  [email, pass, name].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
  root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'authcard' },
    brand(), h('h1', {}, mode === 'in' ? t('signIn') : t('signUp')),
    mode === 'up' ? name : null, email, pass, msg,
    h('button', { class: 'btn primary wide', onclick: submit }, mode === 'in' ? t('signIn') : t('signUp')),
    h('button', { class: 'link', onclick: () => viewAuth(mode === 'in' ? 'up' : 'in') }, mode === 'in' ? t('noAccount') : t('haveAccount')),
    h('div', { class: 'langs' }, langButtons(() => viewAuth(mode))))));
}
function langButtons(after) {
  return ['ru', 'en'].map(l => h('button', { class: 'chip' + (getLang() === l ? ' on' : ''), onclick: () => { setLang(l); document.documentElement.lang = l; after(); } }, l.toUpperCase()));
}

/* ═══════════════════════════ library ═══════════════════════════ */
const roleName = r => (r >= 3 ? t('roleAdmin') : r === 2 ? t('roleEditor') : t('roleViewer'));
function tree() {
  const map = new Map(S.items.map(i => [i.id, i]));
  const hiddenByTrash = i => { for (let p = map.get(i.parent_id); p; p = map.get(p.parent_id)) if (p.trashed_at) return true; return false; };
  const pathOf = i => { const a = []; for (let p = map.get(i.parent_id); p; p = map.get(p.parent_id)) a.unshift(p.title || t('untitled')); return a.join(' / '); };
  return { map, hiddenByTrash, pathOf };
}
async function viewLibrary() {
  root.replaceChildren(h('div', { class: 'loading' }, t('loading')));
  try { S.items = await store.listItems(); } catch (e) { toast(t('loadError') + ': ' + (e.message || e)); S.items = []; }
  drawLibrary();
}
function drawLibrary() {
  const { map, hiddenByTrash, pathOf } = tree();
  const folder = S.folderId ? map.get(S.folderId) : null;
  if (S.folderId && !folder) { S.folderId = null; }
  const q = S.q.trim().toLowerCase();
  let list;
  if (S.trash) list = S.items.filter(i => i.trashed_at && !hiddenByTrash(i));
  else if (q) list = S.items.filter(i => !i.trashed_at && !hiddenByTrash(i) && (i.title || '').toLowerCase().includes(q));
  else list = S.items.filter(i => !i.trashed_at && !hiddenByTrash(i) && (S.folderId ? i.parent_id === S.folderId : (!i.parent_id || !map.has(i.parent_id))));
  list.sort((a, b) => (a.kind === b.kind ? (a.updated_at < b.updated_at ? 1 : -1) : a.kind === 'folder' ? -1 : 1));
  const canCreate = !S.trash && (!folder || folder.role >= 2);

  const crumbs = [h('button', { class: 'crumb', onclick: () => go('#/') }, t('home'))];
  if (folder) { const chain = []; for (let p = folder; p; p = map.get(p.parent_id)) chain.unshift(p); chain.forEach(p => crumbs.push(h('span', { class: 'sep' }, '/'), h('button', { class: 'crumb', onclick: () => go('#/f/' + p.id) }, p.title || t('untitled')))); }

  const search = h('input', { class: 'inp search', type: 'search', placeholder: t('search'), value: S.q, oninput: e => { S.q = e.target.value; drawLibrary(); const i = root.querySelector('.search'); if (i) { i.focus(); i.setSelectionRange(S.q.length, S.q.length); } } });
  root.replaceChildren(h('div', { class: 'library' },
    h('header', { class: 'lhead' }, brand(),
      h('div', { class: 'grow' }), h('div', { class: 'sbox', html: icon('search', 18) }, search),
      ib('trash', t('trash'), () => { S.trash = !S.trash; drawLibrary(); }, S.trash ? 'on' : ''),
      h('button', { class: 'ib avatar', title: t('menu'), onclick: openMenu }, (S.user && S.user.name || '?').slice(0, 1).toUpperCase())),
    store.mode === 'local' ? h('div', { class: 'banner' }, t('demoBanner')) : null,
    h('div', { class: 'lbar' }, h('div', { class: 'crumbs' }, S.trash ? h('b', {}, t('trash')) : crumbs),
      canCreate ? h('div', { class: 'acts' },
        h('button', { class: 'btn', onclick: () => newItem('folder'), html: icon('folder', 18) + '<span>' + t('newFolder') + '</span>' }),
        h('button', { class: 'btn primary', onclick: () => newItem('note'), html: icon('plus', 18) + '<span>' + t('newNote') + '</span>' })) : null),
    list.length ? h('div', { class: 'grid' }, list.map(i => itemCard(i, q || S.trash ? pathOf(i) : null)))
      : h('div', { class: 'empty' }, h('div', { html: icon(S.trash ? 'trash' : 'note', 44) }), h('p', {}, S.trash ? t('trashEmpty') : q ? t('noResults') : t('emptyLib'))),
  ));
}
function itemCard(it, path) {
  const isF = it.kind === 'folder';
  return h('div', { class: 'card' + (it.trashed_at ? ' dim' : ''), tabindex: 0, role: 'button', onclick: () => { if (!it.trashed_at) go((isF ? '#/f/' : '#/n/') + it.id); }, onkeydown: e => { if (e.key === 'Enter' && !it.trashed_at) go((isF ? '#/f/' : '#/n/') + it.id); } },
    h('span', { class: 'ci ' + it.kind, html: icon(isF ? 'folder' : 'note', 26) }),
    h('div', { class: 'ct' }, h('b', {}, it.title || t('untitled')), h('small', {}, (path ? path + ' · ' : '') + ago(it.updated_at) + ' · ' + roleName(it.role))),
    ib('more', t('actions'), e => { e.stopPropagation(); itemMenu(it); }, 'plain'));
}
async function newItem(kind) {
  const title = await askText(kind === 'folder' ? t('newFolder') : t('newNote'), '', t('titlePh'));
  if (title === null) return;
  try {
    const it = await store.createItem({ kind, parent_id: S.folderId, title: title || t('untitled') });
    if (kind === 'note') go('#/n/' + it.id); else { await viewLibrary(); }
  } catch (e) { toast(t('error') + ': ' + (e.message || e)); }
}
function itemMenu(it) {
  let m;
  const row = (ic, label, fn, cls = '') => h('button', { class: 'mrow ' + cls, onclick: async () => { m.close(); await fn(); }, html: icon(ic, 20) + '<span>' + label + '</span>' });
  const reload = async () => { await viewLibrary(); };
  const rows = [];
  if (it.trashed_at) {
    rows.push(row('restore', t('restore'), async () => { await store.updateItem(it.id, { trashed_at: null }); reload(); }));
    if (it.role >= 3 || it.owner_id === (S.user && S.user.id)) rows.push(row('trash', t('deleteForever'), async () => { if (await askConfirm(t('confirmDeleteForever'), { danger: true, label: t('delete') })) { await store.deleteItem(it.id); reload(); } }, 'danger'));
  } else {
    if (it.role >= 2) rows.push(row('pen', t('rename'), async () => { const v = await askText(t('rename'), it.title); if (v) { await store.updateItem(it.id, { title: v }); reload(); } }));
    rows.push(row('users', t('share'), () => showShare(it)));
    if (it.role >= 2) rows.push(row('trash', t('moveToTrash'), async () => { await store.updateItem(it.id, { trashed_at: new Date().toISOString() }); reload(); }, 'danger'));
  }
  m = modal({ title: it.title || t('untitled'), content: h('div', { class: 'menu' }, rows) });
}
function openMenu() {
  let m;
  const body = h('div', { class: 'menu' },
    h('div', { class: 'who' }, h('b', {}, S.user && S.user.name), h('small', {}, (S.user && S.user.email) || (store.mode === 'local' ? t('demoMode') : ''))),
    h('div', { class: 'lrow' }, h('span', { html: icon('globe', 18) }), h('span', {}, t('language')), h('div', { class: 'langs' }, langButtons(() => { m.close(); route(); }))),
    store.mode === 'local' ? h('div', { class: 'lrow' }, h('span', { html: icon('users', 18) }), h('span', {}, t('demoUser')), h('div', { class: 'langs' }, store.demoUsers.map(u => h('button', { class: 'chip' + (store.user.id === u.id ? ' on' : ''), onclick: async () => { await store.switchUser(u.id); S.user = store.user; m.close(); route(); } }, u.name)))) : null,
    store.mode === 'cloud' ? h('button', { class: 'mrow danger', onclick: async () => { m.close(); await store.signOut(); S.user = null; route(); }, html: icon('logout', 20) + '<span>' + t('signOut') + '</span>' }) : null,
    h('small', { class: 'ver' }, 'SaySmile Notes · ' + (store.mode === 'cloud' ? 'Supabase' : t('localMode'))));
  m = modal({ title: t('menu'), content: body });
}

/* ═══════════════════════════ sharing ═══════════════════════════ */
async function showShare(it) {
  let members = [];
  try { members = await store.listMembers(it.id); } catch (e) { toast(t('error') + ': ' + (e.message || e)); return; }
  const admin = it.role >= 3;
  const list = h('div', { class: 'mlist' });
  const draw = () => list.replaceChildren(...members.map(m => h('div', { class: 'mem' },
    h('span', { class: 'dot', style: { background: m.color } }),
    h('div', { class: 'mt' }, h('b', {}, m.pending ? m.email : m.name), h('small', {}, m.pending ? t('pending') : (m.email || ''))),
    admin ? h('select', { class: 'sel', onchange: async e => { try { if (m.pending) await store.inviteMember(it.id, m.email, e.target.value); else await store.setMemberRole(it.id, m.user_id, e.target.value); m.role = e.target.value; } catch (er) { toast(er.message); } } },
      ['viewer', 'editor', 'admin'].map(r => h('option', { value: r, selected: m.role === r }, roleName({ viewer: 1, editor: 2, admin: 3 }[r]))))
      : h('span', { class: 'chip on' }, roleName({ viewer: 1, editor: 2, admin: 3 }[m.role])),
    admin ? ib('x', t('remove'), async () => { try { if (m.pending) await store.cancelInvite(it.id, m.email); else await store.removeMember(it.id, m.user_id); members = members.filter(x => x !== m); draw(); } catch (er) { toast(er.message); } }, 'plain') : null)));
  draw();
  const email = h('input', { class: 'inp', type: 'email', placeholder: t('inviteEmail'), inputmode: 'email' });
  const role = h('select', { class: 'sel' }, ['viewer', 'editor', 'admin'].map(r => h('option', { value: r, selected: r === 'editor' }, roleName({ viewer: 1, editor: 2, admin: 3 }[r]))));
  const invite = async () => {
    if (!email.value.trim()) return;
    try {
      const r = await store.inviteMember(it.id, email.value.trim(), role.value);
      toast(r === 'added' ? t('invAdded') : r === 'pending' ? t('invPending') : t('demoNoInvite'));
      email.value = ''; members = await store.listMembers(it.id); draw();
    } catch (e) { toast(t('error') + ': ' + (e.message || e)); }
  };
  modal({ title: t('shareTitle', it.title || t('untitled')), wide: true, content: h('div', {},
    h('p', { class: 'hint' }, t('shareHint')), list,
    admin ? h('div', { class: 'invite' }, email, role, h('button', { class: 'btn primary', onclick: invite }, t('invite'))) : h('p', { class: 'hint' }, t('onlyAdminInvites')),
    h('div', { class: 'rolehelp' }, h('small', {}, `${t('roleViewer')}: ${t('rvDesc')} · ${t('roleEditor')}: ${t('reDesc')} · ${t('roleAdmin')}: ${t('raDesc')}`))) });
}

/* ═══════════════════════════ note editor: state ═══════════════════════════ */
function cleanupNote() {
  if (S.unsub) { try { S.unsub(); } catch (_) {} S.unsub = null; }
  if (S.io) { S.io.disconnect(); S.io = null; }
  document.removeEventListener('pointerdown', S._docDown || (() => {}));
  S.note = null; S.pv = new Map(); S.sel = null;
}
function indexObj(o) {
  o._c = Date.parse(o.created_at); o._d = o.deleted_at ? Date.parse(o.deleted_at) : 0;
  const ex = S.byId.get(o.id);
  if (ex) { ex.deleted_at = o.deleted_at; ex.deleted_by = o.deleted_by; ex._d = o._d; return ex; }
  S.objs.push(o); S.byId.set(o.id, o);
  if (!S.pageObjs.has(o.page_id)) S.pageObjs.set(o.page_id, []);
  S.pageObjs.get(o.page_id).push(o); return o;
}
const alive = o => (S.asOf ? o._c <= S.asOf && (!o._d || o._d > S.asOf) : !o._d);
const pageObjs = pid => S.pageObjs.get(pid) || [];
function buildAuthors() {
  const m = new Map();
  for (const u of S.members) if (u.user_id) m.set(u.user_id, { id: u.user_id, name: u.name, color: u.color });
  if (S.user && !m.has(S.user.id)) m.set(S.user.id, { id: S.user.id, name: S.user.name, color: S.user.color });
  for (const o of S.objs) if (o.author_id && !m.has(o.author_id)) m.set(o.author_id, { id: o.author_id, name: o.author_name || '—', color: hashColor(o.author_id) });
  S.authors = m;
}
const authorColor = id => (S.authors.get(id) || {}).color || hashColor(id);
const authorName = id => (S.authors.get(id) || {}).name || '—';
function newObj(pageId, kind, data, replaces = null) {
  const o = { id: uid(), page_id: pageId, note_id: S.note.id, kind, data, replaces, author_id: S.user.id, author_name: S.user.name, created_at: new Date().toISOString(), deleted_at: null, deleted_by: null };
  indexObj(o); if (!S.authors.has(S.user.id)) buildAuthors(); return o;
}
const persist = objs => store.addObjects(objs.map(o => ({ id: o.id, page_id: o.page_id, note_id: o.note_id, kind: o.kind, data: o.data, replaces: o.replaces }))).catch(e => toast(t('error') + ': ' + (e.message || e)));
function markDeleted(ids) { const now = new Date(); for (const id of ids) { const o = S.byId.get(id); if (o && !o._d) { o._d = +now; o.deleted_at = now.toISOString(); o.deleted_by = S.user.id; } } }
function markRestored(ids) { for (const id of ids) { const o = S.byId.get(id); if (o) { o._d = 0; o.deleted_at = null; o.deleted_by = null; } } }
function repaintFor(ids) {
  const pgs = new Set(ids.map(id => (S.byId.get(id) || {}).page_id).filter(Boolean));
  pgs.forEach(p => { const pv = S.pv.get(p); if (pv) { pv.ink.render(); renderLayer(pv); } });
}
function repaintAll() { S.pv.forEach(pv => { pv.ink.render(); renderLayer(pv); }); renderDrawer(); updateBars(); }
function pushUndo(en) { S.undo.push(en); if (S.undo.length > 200) S.undo.shift(); S.redo = []; updateBars(); }
function applyEntry(en) {
  markDeleted(en.alive); markRestored(en.dead);
  if (en.alive.length) store.softDelete(en.alive); if (en.dead.length) store.restore(en.dead);
  repaintFor([...en.alive, ...en.dead]); renderDrawer();
  return { alive: en.dead, dead: en.alive };
}
function undo() { if (!canWrite() || !S.undo.length) return; S.redo.push(applyEntry(S.undo.pop())); deselect(); updateBars(); }
function redo() { if (!canWrite() || !S.redo.length) return; S.undo.push(applyEntry(S.redo.pop())); deselect(); updateBars(); }

/* ═══════════════════════════ note editor: view ═══════════════════════════ */
async function viewNote(id) {
  root.replaceChildren(h('div', { class: 'loading' }, t('loading')));
  try {
    if (!S.items.length || !S.items.find(i => i.id === id)) S.items = await store.listItems();
    const item = S.items.find(i => i.id === id);
    if (!item) { toast(t('noAccess')); return go('#/'); }
    S.note = item; S.role = item.role; S.folderId = item.parent_id;
    const [pages, objs, members] = await Promise.all([store.listPages(id), store.listObjects(id), store.listMembers(id).catch(() => [])]);
    S.pages = pages; S.members = members; S.objs = []; S.byId = new Map(); S.pageObjs = new Map(); objs.forEach(indexObj); buildAuthors();
  } catch (e) { toast(t('loadError') + ': ' + (e.message || e)); return go('#/'); }
  Object.assign(S, { undo: [], redo: [], sel: null, filterAuthor: null, hl: null, asOf: 0, authorColors: false, drawer: false, pv: new Map() });
  S.tool = canWrite() ? 'pen' : 'select';

  const scroller = h('div', { class: 'scroller', id: 'scroller' });
  const col = h('div', { class: 'col' }); scroller.append(col);
  S.scroller = scroller; S.col = col;
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await addPhoto(f, S.pendingSlot); } });
  S.fileIn = fileIn;

  root.replaceChildren(h('div', { class: 'noteview' }, buildBar(), h('div', { class: 'stage' }, scroller, h('div', { id: 'asofbar', class: 'asofbar', hidden: true })), fileIn));
  scroller.dataset.tool = S.tool;
  new Gestures(scroller, { getZoom: () => S.zoom, setZoom });
  scroller.addEventListener('scroll', () => { if (!S._raf) S._raf = requestAnimationFrame(() => { S._raf = 0; updateCurPage(); }); }, { passive: true });
  scroller.addEventListener('pointerdown', e => { if (!e.target.closest('.obj') && !e.target.closest('.selbar')) deselect(); });

  S.io = new IntersectionObserver(es => es.forEach(en => { const pv = S.pv.get(en.target.dataset.id); if (!pv) return; pv.visible = en.isIntersecting; pv.ink.setActive(en.isIntersecting); if (en.isIntersecting) renderLayer(pv); }), { root: scroller, rootMargin: '1000px 0px' });
  S.zoom = fitZoom(); S.pages.forEach(p => addPageView(p)); applyZoom(); updateBars();
  S.unsub = store.subscribe(id, onRemote);
  if (!S.pages.length) { if (canWrite()) showTemplatePicker(true); else col.append(h('div', { class: 'empty' }, h('p', {}, t('noPages')))); }
}
const fitZoom = () => Math.max(0.3, Math.min(1.5, (S.scroller.clientWidth - 28) / PAGE_W));
function buildBar() {
  const tools = [['select', 'select', t('toolSelect')], ['pen', 'pen', t('toolPen')], ['hl', 'hl', t('toolHl')], ['eraser', 'eraser', t('toolEraser')], ['text', 'text', t('toolText')]];
  const bar = h('div', { class: 'bar' },
    h('div', { class: 'row r1' },
      ib('back', t('back'), () => go(S.note.parent_id ? '#/f/' + S.note.parent_id : '#/'), 'plain'),
      h('input', { class: 'title', value: S.note.title, readOnly: S.role < 2, 'aria-label': t('title'), onchange: async e => { try { S.note.title = e.target.value.trim() || t('untitled'); await store.updateItem(S.note.id, { title: S.note.title }); } catch (er) { toast(er.message); } } }),
      h('span', { id: 'syncpill', class: 'pill' }),
      ib('users', t('share'), () => showShare(S.note)), ib('history', t('authors'), () => { S.drawer = !S.drawer; renderDrawer(); }, 'drawerbtn'), ib('download', t('export'), showExport)),
    h('div', { class: 'row r2', id: 'toolrow' },
      canWrite() || S.role >= 2 ? [
        h('div', { class: 'seg' }, tools.map(([n, ic, label]) => h('button', { class: 'ib tool', 'data-tool': n, title: label, 'aria-label': label, onclick: () => setTool(n), html: icon(ic) }))),
        h('div', { class: 'seg', id: 'colors' }), h('div', { class: 'seg' }, h('button', { class: 'ib', id: 'sizebtn', title: t('size'), onclick: cycleSize }), h('button', { class: 'ib', id: 'photobtn', title: t('toolPhoto'), onclick: () => pickPhoto(null), html: icon('image') })),
        h('div', { class: 'seg' }, h('button', { class: 'ib', id: 'undobtn', title: t('undo'), onclick: undo, html: icon('undo') }), h('button', { class: 'ib', id: 'redobtn', title: t('redo'), onclick: redo, html: icon('redo') })),
        h('label', { class: 'fing', title: t('fingerDrawHint') }, h('input', { type: 'checkbox', onchange: e => { S.fingerDraw = e.target.checked; } }), h('span', {}, t('fingerDraw'))),
      ] : h('span', { class: 'pill warn' }, t('viewOnly')),
      h('div', { class: 'seg zoom' }, ib('minus', t('zoomOut'), () => setZoom(S.zoom / 1.2)), h('button', { class: 'ib zl', id: 'zlabel', title: t('fit'), onclick: () => setZoom(fitZoom()) }), ib('plus', t('zoomIn'), () => setZoom(S.zoom * 1.2))),
      canWrite() ? h('button', { class: 'btn small', onclick: () => showTemplatePicker(false), html: icon('plus', 16) + '<span>' + t('addPage') + '</span>' }) : null,
      h('div', { class: 'seg selbar', id: 'selbar', hidden: true })));
  return bar;
}
function setTool(n) {
  if (!canWrite() && n !== 'select') return;
  S.tool = n; S.scroller.dataset.tool = n; if (n !== 'select') deselect(); updateBars();
}
const curTool = () => {
  if (S.tool === 'pen') return { name: 'pen', color: S.cfg.pen.color, width: PEN_W[S.cfg.pen.wi] };
  if (S.tool === 'hl') return { name: 'hl', color: S.cfg.hl.color, width: HL_W[S.cfg.hl.wi] };
  return { name: S.tool, color: S.cfg.text.color, width: 2 };
};
function cycleSize() {
  const k = S.tool === 'hl' ? 'hl' : 'pen'; const n = (k === 'hl' ? HL_W : PEN_W).length;
  S.cfg[k].wi = (S.cfg[k].wi + 1) % n; updateBars();
}
function updateBars() {
  const q = s => root.querySelector(s);
  root.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
  const colors = q('#colors');
  if (colors) {
    const pal = S.tool === 'hl' ? HL_COLORS : PEN_COLORS, key = S.tool === 'hl' ? 'hl' : S.tool === 'text' ? 'text' : 'pen';
    colors.hidden = S.tool === 'select' || S.tool === 'eraser';
    colors.replaceChildren(...pal.map(c => h('button', { class: 'cdot' + (S.cfg[key].color === c ? ' on' : ''), style: { '--c': c }, title: c, 'aria-label': c, onclick: () => { S.cfg[key].color = c; updateBars(); } })));
  }
  const sb = q('#sizebtn');
  if (sb) { const k = S.tool === 'hl' ? 'hl' : 'pen', w = (k === 'hl' ? HL_W : PEN_W)[S.cfg[k].wi]; const d = Math.min(18, Math.max(3, k === 'hl' ? w / 1.6 : w * 2.4)); sb.innerHTML = `<span class="sizedot" style="width:${d}px;height:${d}px"></span>`; sb.hidden = S.tool === 'select' || S.tool === 'eraser' || S.tool === 'text'; }
  const u = q('#undobtn'), r = q('#redobtn'); if (u) u.disabled = !S.undo.length || !canWrite(); if (r) r.disabled = !S.redo.length || !canWrite();
  const z = q('#zlabel'); if (z) z.textContent = Math.round(S.zoom * 100) + '%';
  const pb = q('#photobtn'); if (pb) pb.disabled = !canWrite();
  const ab = q('#asofbar');
  if (ab) { ab.hidden = !S.asOf; if (S.asOf) ab.replaceChildren(h('span', {}, t('viewingVersion', fmtTime(new Date(S.asOf)))), h('button', { class: 'btn small primary', onclick: () => { S.asOf = 0; repaintAll(); } }, t('backToCurrent'))); }
  const nb = q('.noteview'); if (nb) nb.classList.toggle('drawer-open', S.drawer);
  renderSel(); renderPill();
}
function renderPill() {
  const p = root.querySelector('#syncpill'); if (!p) return;
  const s = S.sync; let txt, cls = 'pill';
  if (store.mode === 'local') { txt = t('demoMode'); cls += ' muted'; }
  else if (s.offline) { txt = '⚠ ' + t('offline') + (s.pending ? ' · ' + s.pending : ''); cls += ' warn'; }
  else if (s.pending) { txt = '↻ ' + s.pending; cls += ' busy'; }
  else { txt = '✓ ' + t('saved'); cls += ' ok'; }
  p.className = cls; p.textContent = txt;
}
function onSync(info) { S.sync = info; if (info.rejected) toast(t('rejected')); renderPill(); }

/* ───────────── zoom / current page ───────────── */
function setZoom(z, cx, cy) {
  z = Math.max(0.3, Math.min(4, z)); if (Math.abs(z - S.zoom) < 0.001) return;
  const sc = S.scroller, r = sc.getBoundingClientRect(); cx = cx == null ? r.left + r.width / 2 : cx; cy = cy == null ? r.top + r.height / 2 : cy;
  const k = z / S.zoom, ox = sc.scrollLeft + cx - r.left, oy = sc.scrollTop + cy - r.top;
  S.zoom = z; applyZoom();
  sc.scrollLeft = ox * k - (cx - r.left); sc.scrollTop = oy * k - (cy - r.top);
  updateBars();
}
function applyZoom() {
  const z = S.zoom;
  S.pv.forEach(pv => { pv.box.style.width = PAGE_W * z + 'px'; pv.box.style.height = PAGE_H * z + 'px'; pv.head.style.width = PAGE_W * z + 'px'; pv.pg.style.transform = `scale(${z})`; });
}
function updateCurPage() {
  const r = S.scroller.getBoundingClientRect(), mid = r.top + r.height / 2; let best = null, bd = 1e9;
  S.pv.forEach(pv => { const b = pv.box.getBoundingClientRect(); const d = mid < b.top ? b.top - mid : mid > b.bottom ? mid - b.bottom : 0; if (d < bd) { bd = d; best = pv; } });
  S.curPage = best ? best.page.id : null;
}
const currentPV = () => S.pv.get(S.curPage) || [...S.pv.values()][0];

/* ───────────── pages ───────────── */
const inkHost = {
  tool: () => curTool(), canWrite: () => canWrite() && S.tool !== 'select', fingerDraw: () => S.fingerDraw,
  strokes: pid => pageObjs(pid).filter(o => o.kind === 'stroke' && alive(o)),
  view: () => ({ colorOf: S.authorColors || S.filterAuthor ? o => authorColor(o.author_id) : null, filterAuthor: S.filterAuthor, hl: S.hl }),
  commitStroke(pid, data) { const o = newObj(pid, 'stroke', data); persist([o]); pushUndo({ alive: [o.id], dead: [] }); renderDrawerSoon(); return o; },
  markErasing(pid, ids) { markDeleted(ids); },
  erase(ids) { pushUndo({ alive: [], dead: ids }); store.softDelete(ids); renderDrawerSoon(); },
};
function addPageView(page) {
  const head = h('div', { class: 'pagehead' }, h('span', { class: 'pn' }), canWrite() && S.role >= 3 ? ib('trash', t('deletePage'), () => deletePage(page.id), 'plain small') : null);
  const tpl = h('div'), layer = h('div', { class: 'objs' }), inkC = h('canvas', { class: 'ink' }), liveC = h('canvas', { class: 'live' });
  const pg = h('div', { class: 'page', 'data-pgid': page.id }, tpl, layer, inkC, liveC);
  const box = h('div', { class: 'pagebox' }, pg), colEl = h('div', { class: 'pagecol', 'data-id': page.id }, head, box);
  const pv = { page, col: colEl, box, pg, tpl, layer, inkC, liveC, head, nodes: new Map(), visible: false, ink: null, saveT: 0 };
  pv.ink = new PageInk(page.id, inkC, liveC, inkHost);
  mountTemplate(tpl, page, { t, canWrite: canWrite(), onField: (k, v) => onField(pv, k, v) });
  tpl.addEventListener('click', e => { const s = e.target.closest('[data-photo]'); if (s && S.tool === 'select' && canWrite()) pickPhoto(s.getAttribute('data-photo'), pv); });
  liveC.addEventListener('click', e => { if (S.tool === 'text' && canWrite()) { const p = pagePos(pv, e); startTextEdit(pv, null, p); } });
  S.pv.set(page.id, pv);
  const before = [...S.pv.values()].find(o => o !== pv && o.page.position > page.position);
  if (before) S.col.insertBefore(colEl, before.col); else S.col.append(colEl);
  S.io.observe(colEl); renumber(); applyZoom();
  if (page.template_id === 'custom') { fitCustom(tpl); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitCustom(tpl)); }
  return pv;
}
function renumber() { const all = [...S.col.querySelectorAll('.pagecol')]; all.forEach((c, i) => { const pn = c.querySelector('.pn'); if (pn) pn.textContent = t('pageOf', i + 1, all.length); }); }
function onField(pv, k, v) {
  pv.page.fields = { ...(pv.page.fields || {}), [k]: v };
  clearTimeout(pv.saveT); pv.saveT = setTimeout(() => store.updatePage(pv.page.id, { fields: pv.page.fields }).catch(e => toast(e.message)), 600);
}
async function deletePage(id) {
  if (!(await askConfirm(t('confirmDeletePage'), { danger: true, label: t('delete') }))) return;
  try { await store.deletePage(id); removePageView(id); } catch (e) { toast(t('error') + ': ' + (e.message || e)); }
}
function removePageView(id) {
  const pv = S.pv.get(id); if (!pv) return; S.io.unobserve(pv.col); pv.col.remove(); S.pv.delete(id);
  S.pages = S.pages.filter(p => p.id !== id); S.pageObjs.delete(id); S.objs = S.objs.filter(o => o.page_id !== id); renumber();
}
async function createPage(tpl) {
  const position = S.pages.reduce((m, p) => Math.max(m, p.position), -1) + 1;
  try {
    const page = await store.addPage({ note_id: S.note.id, position, template_id: tpl.id, template_html: tpl.html || null, fields: {} });
    if (!S.pv.has(page.id)) { S.pages.push(page); addPageView(page); }
    const pv = S.pv.get(page.id); setTimeout(() => pv.col.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  } catch (e) { toast(t('error') + ': ' + (e.message || e)); }
}
async function showTemplatePicker(first) {
  let mine = []; try { mine = await store.listTemplates(); } catch (_) {}
  let m;
  const pick = tpl => { m.close(); createPage(tpl); };
  const tplCard = (id, label, desc) => h('button', { class: 'tcard', onclick: () => pick({ id }) }, h('div', { class: 'thumb t-' + id }), h('b', {}, label), h('small', {}, desc));
  const file = h('input', { type: 'file', accept: '.html,.htm,text/html', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const txt = await f.text(); if (txt.length > 400000) return toast(t('tooBig')); m.close(); customTemplateDialog(f.name.replace(/\.html?$/i, ''), txt); } });
  m = modal({ title: first ? t('pickFirst') : t('addPage'), wide: true, content: h('div', {},
    h('div', { class: 'tgrid' }, BUILTINS.map(b => tplCard(b.id, t(b.key), t(b.key + 'Desc')))),
    mine.length ? h('div', {}, h('h4', { class: 'sh' }, t('myTemplates')), h('div', { class: 'tgrid' }, mine.map(x => h('div', { class: 'tcard mine' }, h('button', { class: 'tmain', onclick: () => pick({ id: 'custom', html: x.html }) }, h('div', { class: 'thumb t-custom' }), h('b', {}, x.title)), ib('x', t('delete'), async () => { if (await askConfirm(t('confirmDeleteTpl'), { danger: true, label: t('delete') })) { await store.deleteTemplate(x.id); m.close(); showTemplatePicker(first); } }, 'plain small'))))) : null,
    h('div', { class: 'upl' }, h('button', { class: 'btn', onclick: () => file.click(), html: icon('download', 18) + '<span>' + t('uploadHtml') + '</span>' }), h('small', {}, t('uploadHint')), file)) });
}
function customTemplateDialog(name, html) {
  const title = h('input', { class: 'inp', value: name });
  const save = h('input', { type: 'checkbox', checked: true });
  modal({ title: t('uploadHtml'), content: h('div', {}, h('label', {}, t('templateName')), title, h('label', { class: 'chk' }, save, h('span', {}, t('saveToLibrary')))),
    buttons: [{ label: t('cancel') }, { label: t('addPage'), primary: true, onClick: async () => { if (save.checked) { try { await store.saveTemplate({ title: title.value.trim() || name, html }); } catch (e) { toast(e.message); } } createPage({ id: 'custom', html }); } }] });
}

/* ───────────── image & text objects ───────────── */
function pagePos(pv, e) { const r = pv.pg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * PAGE_W, y: (e.clientY - r.top) / r.height * PAGE_H }; }
function renderLayer(pv) {
  const live = pageObjs(pv.page.id).filter(o => (o.kind === 'image' || o.kind === 'text') && alive(o));
  const ids = new Set(live.map(o => o.id));
  for (const [id, n] of pv.nodes) if (!ids.has(id)) { n.remove(); pv.nodes.delete(id); }
  for (const o of live) {
    let n = pv.nodes.get(o.id);
    if (!n) { n = makeObjNode(pv, o); pv.nodes.set(o.id, n); pv.layer.append(n); }
    styleObjNode(n, o);
  }
}
function makeObjNode(pv, o) {
  const n = h('div', { class: 'obj ' + o.kind, 'data-id': o.id });
  if (o.kind === 'image') {
    const img = h('img', { alt: '', draggable: 'false', crossorigin: 'anonymous' });
    store.imageUrl(o.data.src).then(u => { img.src = u; }).catch(() => n.classList.add('broken'));
    n.append(img, h('i', { class: 'h' }));
  } else n.append(h('span', { class: 'tx', dir: 'auto' }, o.data.text), h('i', { class: 'h' }));
  n.addEventListener('pointerdown', e => objDown(e, pv, n));
  n.addEventListener('dblclick', () => { if (o.kind === 'text' && S.tool === 'select' && canWrite()) startTextEdit(pv, S.byId.get(n.dataset.id)); });
  return n;
}
function styleObjNode(n, o) {
  const d = o.data; n.style.left = d.x + 'px'; n.style.top = d.y + 'px'; n.style.width = d.w + 'px';
  if (o.kind === 'image') { n.style.height = d.h + 'px'; const img = n.firstChild; if (img) img.style.objectFit = d.fit === 'cover' ? 'cover' : 'contain'; }
  else { n.style.fontSize = (d.size || 18) + 'px'; n.style.color = d.c || '#1c1b19'; const sp = n.querySelector('.tx'); if (sp && sp.textContent !== d.text) sp.textContent = d.text; }
  const f = S.filterAuthor, ac = authorColor(o.author_id);
  n.style.setProperty('--ac', ac);
  n.classList.toggle('dim', !!f && o.author_id !== f); n.classList.toggle('mine', !!f && o.author_id === f);
  n.classList.toggle('hlo', !!(S.hl && S.hl.size && !S.hl.has(o.id))); n.classList.toggle('byauthor', !!S.authorColors);
  n.classList.toggle('sel', S.sel === o.id);
}
function objDown(e, pv, n) {
  if (S.tool !== 'select') return;
  e.__ink = true; const o = S.byId.get(n.dataset.id); selectObj(o.id);
  if (!canWrite() || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (n.isContentEditable) return;
  e.preventDefault(); n.setPointerCapture(e.pointerId);
  const resize = e.target.classList.contains('h'), z = S.zoom, sx = e.clientX, sy = e.clientY, d0 = { ...o.data }; let moved = false, nd = d0;
  const mv = ev => {
    const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (resize) { const w = Math.max(40, d0.w + dx); nd = { ...d0, w, h: o.kind === 'image' ? Math.max(30, d0.h * w / d0.w) : d0.h }; }
    else nd = { ...d0, x: d0.x + dx, y: d0.y + dy };
    styleObjNode(n, { ...o, data: nd });
  };
  const up = () => { n.removeEventListener('pointermove', mv); n.removeEventListener('pointerup', up); n.removeEventListener('pointercancel', up); if (moved) replaceObj(o, nd); };
  n.addEventListener('pointermove', mv); n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up);
}
function replaceObj(o, data, extraDead = []) {
  const no = newObj(o.page_id, o.kind, data, o.id); markDeleted([o.id, ...extraDead]);
  persist([no]); store.softDelete([o.id, ...extraDead]); pushUndo({ alive: [no.id], dead: [o.id, ...extraDead] });
  const pv = S.pv.get(o.page_id); renderLayer(pv); if (S.sel === o.id) selectObj(no.id); renderDrawerSoon();
}
function selectObj(id) { S.sel = id; S.pv.forEach(pv => pv.nodes.forEach((n, k) => n.classList.toggle('sel', k === id))); renderSel(); }
function deselect() { if (S.sel) { S.sel = null; S.pv.forEach(pv => pv.nodes.forEach(n => n.classList.remove('sel'))); renderSel(); } }
function renderSel() {
  const sb = root.querySelector('#selbar'); if (!sb) return;
  const o = S.sel && S.byId.get(S.sel); sb.hidden = !o || !canWrite(); if (!o) return;
  const kids = [h('button', { class: 'ib danger', title: t('delete'), onclick: () => { markDeleted([o.id]); store.softDelete([o.id]); pushUndo({ alive: [], dead: [o.id] }); repaintFor([o.id]); deselect(); renderDrawerSoon(); }, html: icon('trash') })];
  if (o.kind === 'image') kids.push(h('button', { class: 'ib', title: t('fitToggle'), onclick: () => replaceObj(o, { ...o.data, fit: o.data.fit === 'cover' ? 'contain' : 'cover' }), html: icon('fit') }),
    o.data.slot != null ? h('button', { class: 'ib', title: t('replacePhoto'), onclick: () => pickPhoto(o.data.slot, S.pv.get(o.page_id)), html: icon('image') }) : null);
  if (o.kind === 'text') kids.push(h('button', { class: 'ib', title: t('edit'), onclick: () => startTextEdit(S.pv.get(o.page_id), o), html: icon('pen') }));
  sb.replaceChildren(...kids);
}
function startTextEdit(pv, existing, pos) {
  if (S.editing) return; S.editing = true;
  const d = existing ? existing.data : { x: pos.x, y: pos.y, w: 300, text: '', size: 18, c: S.cfg.text.color };
  const n = h('div', { class: 'obj text editing', contenteditable: 'true', dir: 'auto', style: { left: d.x + 'px', top: d.y + 'px', width: d.w + 'px', fontSize: (d.size || 18) + 'px', color: d.c } });
  n.textContent = d.text; if (existing) { const old = pv.nodes.get(existing.id); if (old) old.style.visibility = 'hidden'; }
  pv.layer.append(n); n.focus();
  const sel = getSelection(); sel.selectAllChildren(n); sel.collapseToEnd();
  const finish = () => {
    if (!S.editing) return; S.editing = false;
    const text = n.innerText.replace(/\n+$/, ''); n.remove();
    if (existing) { const old = pv.nodes.get(existing.id); if (old) old.style.visibility = ''; if (!text.trim()) { markDeleted([existing.id]); store.softDelete([existing.id]); pushUndo({ alive: [], dead: [existing.id] }); repaintFor([existing.id]); deselect(); } else if (text !== d.text) replaceObj(existing, { ...d, text }); }
    else if (text.trim()) { const o = newObj(pv.page.id, 'text', { ...d, text }); persist([o]); pushUndo({ alive: [o.id], dead: [] }); renderLayer(pv); renderDrawerSoon(); }
  };
  n.addEventListener('blur', finish); n.addEventListener('keydown', e => { if (e.key === 'Escape') n.blur(); });
}
function pickPhoto(slot, pv) { if (!canWrite()) return; S.pendingSlot = slot; if (pv) S.curPage = pv.page.id; S.fileIn.click(); }
async function addPhoto(file, slotId) {
  const pv = currentPV(); if (!pv) return;
  toast(t('uploading'), 8000);
  try {
    const { blob, w, h: hh } = await downscaleImage(file);
    const src = await store.uploadImage(S.note.id, blob);
    const takenBy = id => pageObjs(pv.page.id).find(o => o.kind === 'image' && alive(o) && o.data.slot != null && String(o.data.slot) === String(id));
    let slot = slotId; if (slot == null) slot = slotIds(pv.pg).find(id => !takenBy(id));
    let data, dead = [];
    const r = slot != null ? slotRect(pv.pg, slot) : null;
    if (r) { data = { src, x: r.x, y: r.y, w: r.w, h: r.h, fit: 'cover', slot }; const ex = takenBy(slot); if (ex) dead.push(ex.id); }
    else { const k = Math.min(1, 440 / w); const sc = S.scroller.getBoundingClientRect(), b = pv.box.getBoundingClientRect(); const y = Math.max(40, (sc.top - b.top) / S.zoom + 60); data = { src, x: (PAGE_W - w * k) / 2, y: Math.min(y, PAGE_H - hh * k - 20), w: w * k, h: hh * k, fit: 'contain' }; }
    const o = newObj(pv.page.id, 'image', data); markDeleted(dead);
    persist([o]); if (dead.length) store.softDelete(dead); pushUndo({ alive: [o.id], dead });
    renderLayer(pv); toast(t('photoAdded')); renderDrawerSoon();
  } catch (e) { toast(t('error') + ': ' + (e.message || e), 5000); }
}

/* ───────────── realtime from colleagues ───────────── */
function onRemote(ev) {
  if (!S.note) return;
  if (ev.table === 'objects' && ev.row) {
    const had = S.byId.has(ev.row.id), r = ev.row;
    if (had && (!!S.byId.get(r.id)._d === !!r.deleted_at)) return;
    const o = indexObj({ ...r }); if (!had) buildAuthors();
    const pv = S.pv.get(o.page_id); if (pv) { if (o.kind === 'stroke' && !had && alive(o)) pv.ink.drawOne(o); else pv.ink.render(); renderLayer(pv); }
    renderDrawerSoon();
  } else if (ev.table === 'pages') {
    if (ev.type === 'DELETE' && ev.old) return removePageView(ev.old.id);
    const p = ev.row; if (!p) return;
    const pv = S.pv.get(p.id);
    if (!pv) { if (!S.pages.find(x => x.id === p.id)) S.pages.push(p); addPageView(p); }
    else { pv.page.fields = p.fields || {}; setFieldValues(pv.tpl, pv.page.fields); }
  }
}

/* ═══════════════════════════ authors / history drawer ═══════════════════════════ */
let drawerT = 0;
function renderDrawerSoon() { if (!S.drawer) return; clearTimeout(drawerT); drawerT = setTimeout(renderDrawer, 250); }
function activityGroups() {
  const ev = [];
  for (const o of S.objs) { ev.push({ t: o._c, who: o.author_id, k: 'add', kind: o.kind, id: o.id }); if (o._d) ev.push({ t: o._d, who: o.deleted_by, k: 'erase', kind: o.kind, id: o.id }); }
  ev.sort((a, b) => a.t - b.t);
  const groups = []; let g = null;
  for (const e of ev) {
    if (!g || g.who !== e.who || g.k !== e.k || e.t - g.to > 10 * 60e3) { g = { who: e.who, k: e.k, from: e.t, to: e.t, c: { stroke: 0, image: 0, text: 0 }, ids: new Set() }; groups.push(g); }
    g.to = e.t; g.c[e.kind]++; g.ids.add(e.id);
  }
  return groups.reverse().slice(0, 80);
}
function renderDrawer() {
  let d = root.querySelector('#drawer');
  if (!S.drawer || !S.note) { if (d) d.remove(); root.querySelector('.noteview') && root.querySelector('.noteview').classList.remove('drawer-open'); return; }
  const nv = root.querySelector('.noteview'); if (!nv) return;
  if (!d) { d = h('aside', { id: 'drawer', class: 'drawer' }); nv.querySelector('.stage').append(d); }
  nv.classList.add('drawer-open');
  const stats = new Map();
  for (const a of S.authors.values()) stats.set(a.id, { ...a, strokes: 0, images: 0, texts: 0 });
  for (const o of S.objs) if (alive(o)) { const s = stats.get(o.author_id); if (!s) continue; if (o.kind === 'stroke') s.strokes++; else if (o.kind === 'image') s.images++; else s.texts++; }
  const list = [...stats.values()].filter(s => s.strokes + s.images + s.texts > 0 || S.members.some(m => m.user_id === s.id));
  const groups = activityGroups();
  d.replaceChildren(
    h('div', { class: 'dh' }, h('b', {}, t('authors')), ib('x', t('close'), () => { S.drawer = false; renderDrawer(); }, 'plain')),
    h('label', { class: 'swl' }, h('input', { type: 'checkbox', checked: S.authorColors, onchange: e => { S.authorColors = e.target.checked; repaintAll(); } }), h('span', {}, t('authorColors'))),
    h('p', { class: 'hint' }, t('authorsHint')),
    h('div', { class: 'alist' }, list.map(a => h('button', { class: 'arow' + (S.filterAuthor === a.id ? ' on' : ''), style: { '--ac': a.color }, onclick: () => { S.filterAuthor = S.filterAuthor === a.id ? null : a.id; S.hl = null; repaintAll(); } },
      h('span', { class: 'dot', style: { background: a.color } }), h('span', { class: 'an' }, a.name), h('small', {}, `✎ ${a.strokes} · ▣ ${a.images} · T ${a.texts}`)))),
    (S.filterAuthor || S.hl) ? h('button', { class: 'btn small', onclick: () => { S.filterAuthor = null; S.hl = null; repaintAll(); } }, t('showAll')) : null,
    h('div', { class: 'dh sub' }, h('b', {}, t('activity'))),
    h('div', { class: 'acts2' }, groups.map(g => {
      const parts = []; if (g.c.stroke) parts.push(`✎ ${g.c.stroke}`); if (g.c.image) parts.push(`▣ ${g.c.image}`); if (g.c.text) parts.push(`T ${g.c.text}`);
      return h('div', { class: 'act' + (S.hl && g.ids.size && [...g.ids].every(i => S.hl.has(i)) ? ' on' : ''), style: { '--ac': authorColor(g.who) } },
        h('button', { class: 'am', onclick: () => { S.filterAuthor = null; S.hl = (S.hl && [...g.ids].every(i => S.hl.has(i))) ? null : new Set(g.ids); repaintAll(); } },
          h('span', { class: 'dot', style: { background: authorColor(g.who) } }), h('div', { class: 'at' }, h('b', {}, authorName(g.who)), h('small', {}, `${g.k === 'erase' ? t('erased') : t('wrote')} ${parts.join('  ')} · ${fmtTime(new Date(g.to))}`))),
        h('button', { class: 'ib small', title: t('viewVersion'), onclick: () => { S.asOf = g.to + 1; S.hl = null; S.filterAuthor = null; deselect(); repaintAll(); }, html: icon('history', 16) }));
    })));
}

/* ═══════════════════════════ export ═══════════════════════════ */
function showExport() {
  const m = modal({ title: t('export'), content: h('div', { class: 'menu' },
    h('button', { class: 'mrow', onclick: async () => { m.close(); await exportPDF(); }, html: icon('download', 20) + '<span>PDF · ' + t('allPages') + '</span>' }),
    h('button', { class: 'mrow', onclick: async () => { m.close(); await exportPNG(); }, html: icon('image', 20) + '<span>PNG · ' + t('currentPage') + '</span>' })) });
}
async function pageCanvas(pv) {
  // Build a clean, off-screen copy of the page (no selection UI, no author tint) and rasterize it.
  const wrap = h('div', { style: { position: 'fixed', left: '0', top: '0', width: PAGE_W + 'px', height: PAGE_H + 'px', zIndex: '-9999', background: '#fff', overflow: 'hidden' } });
  const pg = h('div', { class: 'page export', style: { width: PAGE_W + 'px', height: PAGE_H + 'px', position: 'relative', background: '#fff', transform: 'none' } });
  pv.tpl.querySelectorAll('input').forEach(i => i.setAttribute('value', i.value));
  const tpl = pv.tpl.cloneNode(true); pg.append(tpl);
  const layer = h('div', { class: 'objs' }); pg.append(layer);
  for (const o of pageObjs(pv.page.id)) if ((o.kind === 'image' || o.kind === 'text') && alive(o)) {
    const n = pv.nodes.get(o.id); if (!n) continue; const c = n.cloneNode(true);
    c.className = 'obj ' + o.kind; c.querySelectorAll('.h').forEach(x => x.remove()); c.style.visibility = ''; layer.append(c);
  }
  const cv = document.createElement('canvas'); cv.width = PAGE_W * 2; cv.height = PAGE_H * 2; const ctx = cv.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0);
  const plain = { colorOf: null, filterAuthor: null, hl: null };
  for (const o of pageObjs(pv.page.id)) if (o.kind === 'stroke' && alive(o)) drawStrokeObj(ctx, o, plain);
  cv.style.cssText = `position:absolute;left:0;top:0;width:${PAGE_W}px;height:${PAGE_H}px`; pg.append(cv);
  wrap.append(pg); document.body.append(wrap);
  try {
    await Promise.all([...wrap.querySelectorAll('img')].map(i => i.complete && i.naturalWidth ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 6000); })));
    return await window.html2canvas(pg, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, width: PAGE_W, height: PAGE_H, windowWidth: PAGE_W, windowHeight: PAGE_H });
  } finally { wrap.remove(); }
}
const fileBase = () => (S.note.title || 'note').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
function saveBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function exportPNG() {
  const pv = currentPV(); if (!pv) return; toast(t('exporting'), 10000);
  try { const c = await pageCanvas(pv); c.toBlob(b => saveBlob(b, `${fileBase()}-${[...S.col.children].indexOf(pv.col) + 1}.png`), 'image/png'); toast(t('done')); }
  catch (e) { toast(t('error') + ': ' + (e.message || e), 5000); }
}
async function exportPDF() {
  toast(t('exporting'), 30000);
  try {
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', hotfixes: ['px_scaling'], compress: true });
    const order = [...S.col.querySelectorAll('.pagecol')].map(c => S.pv.get(c.dataset.id)); let first = true;
    for (const pv of order) { const c = await pageCanvas(pv); if (!first) pdf.addPage([PAGE_W, PAGE_H], 'portrait'); first = false; pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PAGE_W, PAGE_H); }
    saveBlob(pdf.output('blob'), `${fileBase()}.pdf`); toast(t('done'));
  } catch (e) { console.error(e); toast(t('error') + ': ' + (e.message || e), 5000); }
}

/* ═══════════════════════════ keyboard ═══════════════════════════ */
function onKey(e) {
  if (!S.note || S.editing) return;
  const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable; if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && canWrite()) { const o = S.byId.get(S.sel); markDeleted([o.id]); store.softDelete([o.id]); pushUndo({ alive: [], dead: [o.id] }); repaintFor([o.id]); deselect(); }
  else if (!mod && canWrite()) { const k = { v: 'select', p: 'pen', h: 'hl', e: 'eraser', t: 'text' }[e.key.toLowerCase()]; if (k) setTool(k); }
}

window.__S = S;       // handy for debugging in the console
boot();
