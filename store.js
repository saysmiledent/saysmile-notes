// Data layer. Two interchangeable back-ends with the same interface:
//   localStore()  – IndexedDB, single device, two demo users (used when config.js has no Supabase keys)
//   cloudStore()  – Supabase (auth, RLS-protected tables, storage, realtime) + durable outbox for writes
// Roles: 1 viewer, 2 editor, 3 admin.

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowIso = () => new Date().toISOString();

/* ───────────── tiny key-value layer over IndexedDB (falls back to memory) ───────────── */
const STORES = ['items', 'pages', 'objects', 'templates', 'meta', 'outbox'];
function openKV(dbName) {
  let dbp = null;
  const mem = Object.fromEntries(STORES.map(s => [s, new Map()]));
  const key = s => (s === 'meta' ? 'k' : 'id');
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(dbName, 1);
        r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: key(s) }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }).catch(() => null);
    return dbp;
  }
  const run = async (s, mode, fn, memFn) => {
    const d = await db();
    if (!d) return memFn(mem[s]);
    return new Promise((res, rej) => {
      const tx = d.transaction(s, mode), st = tx.objectStore(s);
      const rq = fn(st);
      tx.oncomplete = () => res(rq && rq.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  };
  return {
    all: s => run(s, 'readonly', st => st.getAll(), m => [...m.values()]),
    get: (s, k) => run(s, 'readonly', st => st.get(k), m => m.get(k)),
    put: (s, v) => run(s, 'readwrite', st => st.put(v), m => { m.set(v[key(s)], v); }),
    putMany: async (s, vs) => { for (const v of vs) await run(s, 'readwrite', st => st.put(v), m => { m.set(v[key(s)], v); }); },
    del: (s, k) => run(s, 'readwrite', st => st.delete(k), m => { m.delete(k); }),
  };
}

/* ───────────── image helper: downscale to JPEG ───────────── */
export async function downscaleImage(file, maxSide = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
  return { blob, w: c.width, h: c.height };
}
const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

/* ═════════════════════════ LOCAL (demo) STORE ═════════════════════════ */
export function localStore() {
  const kv = openKV('saysmile-notes-local');
  const USERS = [
    { id: 'u-a', name: 'Dr. A', email: 'a@demo.local', color: '#6f7140' },
    { id: 'u-b', name: 'Dr. B', email: 'b@demo.local', color: '#1f5bff' },
  ];
  const syncCbs = new Set();
  const s = {
    mode: 'local', user: USERS[0], demoUsers: USERS,
    async init() {
      const m = await kv.get('meta', 'user');
      s.user = USERS.find(u => u.id === (m && m.v)) || USERS[0];
      return s.user;
    },
    onAuth() {}, onSync(fn) { syncCbs.add(fn); return () => syncCbs.delete(fn); },
    async switchUser(id) { s.user = USERS.find(u => u.id === id) || USERS[0]; await kv.put('meta', { k: 'user', v: s.user.id }); },
    async signIn() { return s.user; }, async signUp() { return s.user; }, async signOut() {},

    async listItems() { return (await kv.all('items')).map(i => ({ ...i, role: 3 })); },
    async createItem({ kind, parent_id = null, title = '' }) {
      const it = { id: uid(), kind, parent_id, title, owner_id: s.user.id, trashed_at: null, created_at: nowIso(), updated_at: nowIso() };
      await kv.put('items', it); return { ...it, role: 3 };
    },
    async updateItem(id, patch) { const it = await kv.get('items', id); Object.assign(it, patch, { updated_at: nowIso() }); await kv.put('items', it); return it; },
    async deleteItem(id) {
      const items = await kv.all('items');
      const kill = new Set([id]); let grew = true;
      while (grew) { grew = false; for (const i of items) if (!kill.has(i.id) && kill.has(i.parent_id)) { kill.add(i.id); grew = true; } }
      for (const p of await kv.all('pages')) if (kill.has(p.note_id)) { await kv.del('pages', p.id); }
      for (const o of await kv.all('objects')) if (kill.has(o.note_id)) await kv.del('objects', o.id);
      for (const k of kill) await kv.del('items', k);
    },

    async listPages(noteId) { return (await kv.all('pages')).filter(p => p.note_id === noteId).sort((a, b) => a.position - b.position); },
    async addPage({ note_id, position, template_id = 'blank', template_html = null, fields = {} }) {
      const p = { id: uid(), note_id, position, template_id, template_html, fields, created_by: s.user.id, updated_by: null, created_at: nowIso() };
      await kv.put('pages', p); await touch(note_id); return p;
    },
    async updatePage(id, patch) { const p = await kv.get('pages', id); Object.assign(p, patch, { updated_by: s.user.id }); await kv.put('pages', p); return p; },
    async deletePage(id) { for (const o of await kv.all('objects')) if (o.page_id === id) await kv.del('objects', o.id); await kv.del('pages', id); },

    async listObjects(noteId) { return (await kv.all('objects')).filter(o => o.note_id === noteId).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); },
    async addObjects(rows) {
      const out = rows.map(r => ({ ...r, id: r.id || uid(), author_id: s.user.id, author_name: s.user.name, created_at: nowIso(), deleted_at: null, deleted_by: null }));
      await kv.putMany('objects', out); if (out[0]) await touch(out[0].note_id); return out;
    },
    async softDelete(ids) { for (const id of ids) { const o = await kv.get('objects', id); if (o && !o.deleted_at) { o.deleted_at = nowIso(); o.deleted_by = s.user.id; await kv.put('objects', o); } } },
    async restore(ids) { for (const id of ids) { const o = await kv.get('objects', id); if (o) { o.deleted_at = null; o.deleted_by = null; await kv.put('objects', o); } } },
    subscribe() { return () => {}; },

    async listMembers() { return USERS.map((u, i) => ({ user_id: u.id, name: u.name, email: u.email, color: u.color, role: i === 0 ? 'admin' : 'editor', pending: false })); },
    async inviteMember() { return 'demo'; }, async setMemberRole() {}, async removeMember() {}, async cancelInvite() {},

    async uploadImage(noteId, blob) { return await blobToDataUrl(blob); },
    async imageUrl(src) { return src; },

    async listTemplates() { return (await kv.all('templates')).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); },
    async saveTemplate({ title, html }) { const t = { id: uid(), title, html, created_at: nowIso() }; await kv.put('templates', t); return t; },
    async deleteTemplate(id) { await kv.del('templates', id); },
    pendingCount: () => 0,
  };
  async function touch(noteId) { const it = await kv.get('items', noteId); if (it) { it.updated_at = nowIso(); await kv.put('items', it); } }
  return s;
}

/* ═════════════════════════ CLOUD (Supabase) STORE ═════════════════════════ */
export function cloudStore(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const kv = openKV('saysmile-notes-cloud');
  const syncCbs = new Set(), authCbs = new Set();
  let pending = 0, flushing = false, retryTimer = null, seq = 0;
  const emitSync = (extra = {}) => syncCbs.forEach(f => f({ pending, ...extra }));
  const must = ({ data, error }) => { if (error) throw error; return data; };

  async function loadProfile(user) {
    if (!user) return null;
    const { data } = await sb.from('profiles').select('id,email,display_name,color').eq('id', user.id).maybeSingle();
    return data ? { id: data.id, email: data.email, name: data.display_name, color: data.color } : { id: user.id, email: user.email, name: (user.email || '').split('@')[0], color: '#6f7140' };
  }

  /* outbox: every write is persisted locally first, then flushed; client UUIDs make retries idempotent */
  async function enqueue(entry) {
    entry.id = entry.id || uid(); entry.seq = Date.now() * 1000 + (seq++ % 1000);
    await kv.put('outbox', entry); pending++; emitSync(); flush();
  }
  const permanent = e => e && e.code && !(String(e.code).startsWith('08') || e.code === 'PGRST301') && e.status !== 401 && !(e.status >= 500);
  async function flush() {
    if (flushing) return; flushing = true; clearTimeout(retryTimer);
    try {
      const items = (await kv.all('outbox')).sort((a, b) => a.seq - b.seq);
      pending = items.length; emitSync();
      let rejected = 0;
      for (const it of items) {
        let err = null;
        try {
          if (it.op === 'ins') {
            let r = await sb.from('objects').insert(it.rows);
            if (r.error && r.error.code === '23505') {            // some rows already stored (retry) → insert one by one
              for (const row of it.rows) { const q = await sb.from('objects').insert(row); if (q.error && q.error.code !== '23505') { r = q; break; } r = { error: null }; }
            }
            err = r.error;
          } else if (it.op === 'del') err = (await sb.from('objects').update({ deleted_at: it.at }).in('id', it.ids)).error;
          else if (it.op === 'res') err = (await sb.from('objects').update({ deleted_at: null }).in('id', it.ids)).error;
          else if (it.op === 'page') err = (await sb.from('pages').update(it.patch).eq('id', it.pageId)).error;
        } catch (e) { err = { message: String(e) }; }
        if (!err) { await kv.del('outbox', it.id); pending--; emitSync(); continue; }
        if (permanent(err)) { await kv.del('outbox', it.id); pending--; rejected++; emitSync({ rejected: err.message }); continue; }
        throw err;                                               // network / auth → retry later
      }
      emitSync({ rejected: rejected || undefined, ok: true });
    } catch (e) {
      emitSync({ offline: true });
      retryTimer = setTimeout(flush, 6000);
    } finally { flushing = false; }
  }
  window.addEventListener('online', flush);

  const urlCache = new Map();
  const s = {
    mode: 'cloud', user: null,
    async init() {
      const { data } = await sb.auth.getSession();
      s.user = await loadProfile(data.session && data.session.user);
      sb.auth.onAuthStateChange(async (_ev, sess) => { s.user = await loadProfile(sess && sess.user); authCbs.forEach(f => f(s.user)); });
      if (s.user) flush();
      return s.user;
    },
    onAuth(fn) { authCbs.add(fn); }, onSync(fn) { syncCbs.add(fn); return () => syncCbs.delete(fn); },
    async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); s.user = await loadProfile((await sb.auth.getUser()).data.user); flush(); return s.user; },
    async signUp(email, password, name) {
      const d = must(await sb.auth.signUp({ email, password, options: { data: { display_name: name || '' } } }));
      if (!d.session) return { needsConfirm: true };
      s.user = await loadProfile(d.user); return s.user;
    },
    async signOut() { await sb.auth.signOut(); s.user = null; },

    async listItems() { return must(await sb.rpc('my_items')); },
    async createItem({ kind, parent_id = null, title = '' }) { return must(await sb.from('items').insert({ kind, parent_id, title }).select().single()); },
    async updateItem(id, patch) { return must(await sb.from('items').update(patch).eq('id', id).select().single()); },
    async deleteItem(id) { must(await sb.from('items').delete().eq('id', id)); },

    async listPages(noteId) { return must(await sb.from('pages').select('*').eq('note_id', noteId).order('position').order('created_at')); },
    async addPage(p) { return must(await sb.from('pages').insert(p).select().single()); },
    async updatePage(id, patch) { await enqueue({ op: 'page', pageId: id, patch: { ...patch, updated_at: nowIso() } }); return { id, ...patch }; },
    async deletePage(id) { must(await sb.from('pages').delete().eq('id', id)); },

    async listObjects(noteId) {
      const out = []; const step = 1000;
      for (let from = 0; ; from += step) {
        const rows = must(await sb.from('objects').select('*').eq('note_id', noteId).order('created_at').order('id').range(from, from + step - 1));
        out.push(...rows); if (rows.length < step) break;
      }
      return out;
    },
    async addObjects(rows) {
      const withIds = rows.map(r => ({ id: r.id || uid(), page_id: r.page_id, kind: r.kind, data: r.data, replaces: r.replaces || null }));
      for (let i = 0; i < withIds.length; i += 40) await enqueue({ op: 'ins', rows: withIds.slice(i, i + 40) });
      return withIds;
    },
    async softDelete(ids) { await enqueue({ op: 'del', ids, at: nowIso() }); },
    async restore(ids) { await enqueue({ op: 'res', ids }); },
    subscribe(noteId, cb) {
      const ch = sb.channel('note-' + noteId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'objects', filter: `note_id=eq.${noteId}` }, p => cb({ table: 'objects', type: p.eventType, row: p.new }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pages', filter: `note_id=eq.${noteId}` }, p => cb({ table: 'pages', type: p.eventType, row: p.new, old: p.old }))
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    async listMembers(itemId) { return must(await sb.rpc('list_members', { p_item: itemId })); },
    async inviteMember(itemId, email, role) { return must(await sb.rpc('invite_member', { p_item: itemId, p_email: email, p_role: role })); },
    async setMemberRole(itemId, userId, role) { must(await sb.from('item_members').update({ role }).eq('item_id', itemId).eq('user_id', userId)); },
    async removeMember(itemId, userId) { must(await sb.from('item_members').delete().eq('item_id', itemId).eq('user_id', userId)); },
    async cancelInvite(itemId, email) { must(await sb.rpc('cancel_invite', { p_item: itemId, p_email: email })); },

    async uploadImage(noteId, blob) {
      const path = `${noteId}/${uid()}.jpg`;
      must(await sb.storage.from('note-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
      return path;
    },
    async imageUrl(src) {
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src;
      const hit = urlCache.get(src); if (hit && hit.exp > Date.now()) return hit.url;
      const { data, error } = await sb.storage.from('note-images').createSignedUrl(src, 3600);
      if (error) throw error;
      urlCache.set(src, { url: data.signedUrl, exp: Date.now() + 3300e3 }); return data.signedUrl;
    },

    async listTemplates() { return must(await sb.from('templates').select('*').order('created_at', { ascending: false })); },
    async saveTemplate({ title, html }) { return must(await sb.from('templates').insert({ title, html }).select().single()); },
    async deleteTemplate(id) { must(await sb.from('templates').delete().eq('id', id)); },
    pendingCount: () => pending,
  };
  return s;
}
