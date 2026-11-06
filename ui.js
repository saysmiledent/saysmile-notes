// Small UI toolkit: hyperscript, icons, toast, modal dialogs.
import { t, getLang } from './i18n.js';

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') { for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) e.style.setProperty(p, val); else e.style[p] = val; } }
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.append(c.nodeType ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return e;
}

const P = {
  back: 'M15 5l-7 7 7 7', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12l5 5 9-10',
  pen: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3', hl: 'M9 14l6-6 4 4-6 6H8zM5 21h8M9 14l-1 4',
  eraser: 'M8 19l-4-4 9-9 6 6-6 7zM10 19h10M9 10l6 6', select: 'M6 3l13 9-6 1.5L10.5 20z', text: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01', undo: 'M9 5L4 10l5 5M4 10h10a5 5 0 0 1 0 10h-3', redo: 'M15 5l5 5-5 5M20 10H10a5 5 0 0 0 0 10h3',
  users: 'M16 20v-1a4 4 0 0 0-8 0v1M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 20v-1a3 3 0 0 0-2.5-3M17 6.2a3 3 0 0 1 0 5.6',
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5v4h4', download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13', folder: 'M3 6h6l2 2h10v11H3z', note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14M16 16l5 5', more: 'M5 12h.01M12 12h.01M19 12h.01', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  cloud: 'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.2A4.5 4.5 0 0 1 17 18z', fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6s-4-1.5-6-5l-1.5-3a1.5 1.5 0 0 1 2.5-1.5L8 14',
  logout: 'M10 5H5v14h5M15 8l4 4-4 4M19 12H9', page: 'M6 3h12v18H6z', share: 'M12 15V4M8 8l4-4 4 4M5 13v7h14v-7', restore: 'M4 12a8 8 0 1 1 3 6.2M4 6v6h6', mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
};
export const icon = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ''}"/></svg>`;
export const ib = (name, title, onclick, cls = '') => h('button', { class: 'ib ' + cls, title, 'aria-label': title, onclick, html: icon(name) });

let toastEl;
export function toast(msg, ms = 2800) {
  toastEl = toastEl || document.body.appendChild(h('div', { class: 'toast', role: 'status' }));
  toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('on'), ms);
}

export function modal({ title, content, buttons = [], wide = false, onClose }) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'mh' }, h('b', {}, title || ''), ib('x', t('close'), close, 'plain')),
    h('div', { class: 'mb' }, content),
    buttons.length ? h('div', { class: 'mf' }, buttons.map(b => h('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: async () => { const r = b.onClick ? await b.onClick(close) : undefined; if (r !== false && !b.keep) close(); } }, b.label))) : null);
  const back = h('div', { class: 'backdrop', onpointerdown: e => { if (e.target === back) close(); } }, box);
  document.body.append(back); document.addEventListener('keydown', esc);
  const first = box.querySelector('input,textarea,select'); if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

export function askText(title, value = '', placeholder = '') {
  return new Promise(res => {
    const inp = h('input', { class: 'inp', value, placeholder, onkeydown: e => { if (e.key === 'Enter') { m.close(); res(inp.value.trim()); } } });
    let done = false;
    const m = modal({ title, content: inp, onClose: () => { if (!done) res(null); }, buttons: [
      { label: t('cancel'), onClick: () => { done = true; res(null); } },
      { label: t('ok'), primary: true, onClick: () => { done = true; res(inp.value.trim()); } }] });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done = true; });
  });
}
export function askConfirm(msg, { danger = false, label } = {}) {
  return new Promise(res => {
    let done = false;
    modal({ title: msg, content: h('div'), onClose: () => { if (!done) res(false); }, buttons: [
      { label: t('cancel'), onClick: () => { done = true; res(false); } },
      { label: label || t('ok'), primary: !danger, danger, onClick: () => { done = true; res(true); } }] });
  });
}
export const fmtTime = iso => new Date(iso).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const ago = iso => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t('justNow'); if (s < 3600) return t('minAgo', Math.floor(s / 60));
  if (s < 86400) return t('hrAgo', Math.floor(s / 3600)); return new Date(iso).toLocaleDateString();
};
