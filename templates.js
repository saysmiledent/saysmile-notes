// Page templates. A template is plain HTML inside a fixed 794×1123 page.
// Markers a custom HTML file may use:
//   data-field="name"   → typed field (saved with the page)       data-photo="1" → photo slot (tap in Select mode)
export const GAM_LOGO = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 150 89\" role=\"img\" aria-label=\"GAM\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M66.62 18.50 L65.12 21.62 L64.88 22.88 L64.00 24.38 L63.75 25.50 L63.00 26.62 L61.75 30.12 L60.12 33.38 L58.75 37.12 L58.00 38.38 L57.75 39.62 L56.00 43.12 L55.75 44.38 L55.00 45.50 L54.75 46.62 L53.00 50.25 L52.88 51.38 L53.38 52.00 L54.38 52.12 L55.12 51.88 L55.75 51.25 L58.12 45.12 L58.88 43.88 L59.00 43.00 L60.88 39.25 L62.12 35.50 L62.88 34.38 L63.12 33.25 L64.75 30.00 L65.00 28.75 L65.50 28.25 L66.12 28.50 L72.75 42.12 L73.00 43.12 L73.88 44.50 L74.12 45.50 L77.88 53.00 L81.12 60.38 L83.75 65.38 L86.88 72.50 L86.88 74.38 L85.88 75.62 L80.75 76.75 L80.25 77.25 L80.50 77.88 L81.50 78.12 L101.00 78.12 L102.38 77.25 L103.38 78.00 L104.00 78.12 L105.12 77.38 L105.75 76.50 L106.00 75.38 L108.88 69.50 L109.00 68.62 L109.75 67.50 L110.00 66.38 L111.88 62.75 L112.12 61.62 L112.88 60.50 L113.12 59.38 L113.75 58.50 L116.12 52.62 L116.88 51.50 L117.12 50.38 L120.88 42.50 L122.00 39.38 L124.75 33.75 L125.00 32.62 L126.75 29.12 L127.12 27.62 L127.62 27.12 L128.12 27.12 L128.38 27.38 L128.25 48.00 L128.50 60.75 L128.25 73.25 L127.88 75.00 L127.38 75.75 L125.25 76.88 L121.50 77.00 L121.00 77.62 L121.00 78.25 L121.38 78.75 L122.50 79.00 L129.12 78.62 L143.50 79.00 L144.75 78.38 L144.88 77.62 L144.25 77.00 L140.00 76.88 L137.88 75.62 L137.12 74.75 L136.12 68.38 L136.00 23.12 L136.88 21.62 L138.50 20.12 L140.25 19.88 L142.25 19.12 L144.50 18.88 L144.75 18.12 L144.25 17.62 L136.25 17.88 L131.50 17.50 L128.88 18.25 L127.50 19.62 L125.00 24.88 L124.75 26.00 L122.75 30.50 L121.00 33.88 L119.75 37.25 L119.00 38.38 L118.75 39.50 L118.00 40.62 L116.75 44.12 L115.00 47.62 L114.88 48.38 L114.12 49.50 L112.75 53.25 L112.00 54.38 L111.75 55.50 L111.00 56.62 L110.88 57.50 L109.12 61.00 L108.75 62.38 L108.00 63.50 L107.88 64.38 L106.50 66.75 L106.12 66.75 L105.38 66.00 L104.00 63.25 L102.88 60.38 L95.00 44.38 L94.88 43.62 L88.12 29.88 L86.75 26.38 L85.00 23.25 L82.88 18.38 L81.50 17.50 L75.50 17.50 L74.62 18.00 L74.62 19.00 L79.75 28.75 L81.12 32.00 L82.88 35.00 L85.00 40.00 L87.75 45.38 L88.12 46.75 L89.88 50.00 L90.00 50.75 L93.88 58.50 L95.12 61.62 L95.88 62.75 L96.12 63.88 L97.88 67.00 L100.00 72.12 L101.88 75.62 L101.62 76.62 L100.88 76.62 L97.88 75.50 L96.25 74.00 L94.25 71.50 L91.00 65.38 L90.88 64.62 L89.00 61.12 L88.75 60.12 L87.12 57.25 L86.75 55.88 L85.12 53.00 L82.88 47.75 L81.00 44.38 L80.88 43.62 L68.75 18.25 L68.12 17.75 L67.38 17.75Z M15.88 24.38 L10.00 30.25 L7.25 34.50 L5.00 40.12 L4.88 42.50 L4.12 44.75 L4.00 51.38 L4.88 54.62 L5.00 56.75 L7.12 62.00 L9.50 66.00 L14.62 71.25 L16.50 72.75 L22.25 75.88 L23.38 76.12 L24.75 76.88 L26.25 77.00 L28.25 77.88 L31.88 78.12 L35.12 78.88 L40.88 78.88 L43.38 78.62 L45.75 78.00 L50.25 77.88 L53.00 77.00 L55.50 76.88 L58.50 75.88 L59.38 74.50 L59.00 72.62 L59.00 58.50 L59.38 57.50 L60.38 56.12 L61.12 55.88 L70.75 55.38 L71.62 54.75 L71.62 54.25 L71.25 53.88 L69.00 53.38 L54.62 53.88 L42.00 53.88 L41.62 54.25 L41.62 54.88 L42.38 55.62 L49.12 56.00 L51.62 58.00 L52.50 60.88 L52.75 62.75 L52.75 67.50 L52.00 69.88 L51.75 71.75 L50.88 73.38 L49.38 74.88 L47.50 75.88 L45.38 76.00 L42.88 76.75 L38.88 76.75 L35.75 76.00 L33.12 75.88 L31.38 75.00 L29.75 74.75 L24.62 72.00 L21.38 69.50 L19.88 68.00 L17.00 64.38 L14.00 58.62 L13.75 57.38 L13.00 55.88 L12.75 53.62 L12.00 51.88 L11.88 49.00 L12.00 38.25 L12.88 36.25 L13.12 34.25 L16.25 28.38 L19.25 25.12 L22.00 23.12 L26.00 21.12 L27.62 20.88 L29.62 20.00 L36.12 19.62 L42.88 20.12 L44.00 20.75 L45.88 21.12 L48.38 22.38 L51.62 24.88 L54.62 28.25 L57.00 33.38 L57.38 33.75 L58.12 33.75 L58.62 33.12 L58.62 32.00 L58.00 29.62 L57.88 24.00 L56.75 20.88 L55.62 20.00 L51.00 18.12 L48.88 17.88 L45.88 17.00 L36.38 16.88 L34.25 17.12 L31.75 17.88 L29.12 18.00 L27.38 18.88 L25.62 19.12 L24.75 19.75 L23.38 20.00 L20.88 21.25Z\"/></svg>";

export const BUILTINS = [
  { id: 'blank', key: 'tplBlank' },
  { id: 'dental', key: 'tplDental' },
  { id: 'gam', key: 'tplGam' },
];

const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const tooth = (n, up) =>
  `<div class="t${n % 10 === 1 && n > 20 ? ' mid' : ''}"><i>${n}</i><svg viewBox="0 0 40 56" class="${up ? 'up' : 'lo'}"><path d="M6 6Q6 2 12 2H28Q34 2 34 6V26Q34 38 20 54Q6 38 6 26Z"/></svg></div>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dentalHTML(t) {
  return `
<div class="dh"><div class="wm"><b>Say</b>Smile</div><div class="ttl">${esc(t('dentalTitle'))}</div></div>
<div class="meta2">
  <label>${esc(t('fPatient'))}<input data-field="patient"></label>
  <label>${esc(t('fBirth'))}<input data-field="birth"></label>
  <label>${esc(t('fDate'))}<input data-field="date"></label>
  <label>${esc(t('fDoctor'))}<input data-field="doctor"></label>
</div>
<div class="arch"><div class="rowt">${FDI_UPPER.map(n => tooth(n, true)).join('')}</div>
  <div class="gap"><span>${esc(t('rightSide'))}</span><span>${esc(t('leftSide'))}</span></div>
  <div class="rowt">${FDI_LOWER.map(n => tooth(n, false)).join('')}</div></div>
<div class="bx big"><h4>${esc(t('dentalStatus'))}</h4></div>
<div class="bx big"><h4>${esc(t('dentalPlan'))}</h4></div>`;
}

function gamHTML(t) {
  return `
<div class="gh"><div class="lg">${GAM_LOGO}</div><div class="tg">${esc(t('gamTag'))}</div>
  <div class="ct">Санкт-Петербург, Лиговский пр., 232, пом. 10Н<br>+7 (999) 0 232 666 · gamclinic.pro</div></div>
<h2>${esc(t('gamTitle'))}</h2>
<div class="meta2">
  <label>${esc(t('fPatient'))}<input data-field="patient"></label>
  <label>${esc(t('fDate'))}<input data-field="date"></label>
  <label>${esc(t('fDoctor'))}<input data-field="doctor"></label>
  <label>${esc(t('fPhone'))}<input data-field="phone"></label>
</div>
<div class="slots">${[1, 2, 3, 4].map(i => `<div class="slot" data-photo="${i}"><span>${esc(t('photoN', i))}</span></div>`).join('')}</div>
<div class="bx s1"><h4>${esc(t('gamComplaint'))}</h4></div>
<div class="bx s2"><h4>${esc(t('gamFindings'))}</h4></div>
<div class="bx s3"><h4>${esc(t('gamPlan'))}</h4></div>
<div class="bx s4"><h4>${esc(t('gamAdvice'))}</h4></div>
<div class="gf"><b>GAM CLINIC</b> — Gamclinic.spb@gmail.com</div>`;
}

/* ───────────── sanitizer for user-supplied HTML templates ───────────── */
const BAD_TAGS = 'script,iframe,frame,frameset,object,embed,link,meta,base,form,noscript,audio,video,source,track,applet,portal,template';
export function sanitizeTemplate(html, scopeClass) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll(BAD_TAGS).forEach(n => n.remove());
  let css = '';
  doc.querySelectorAll('style').forEach(s => { css += '\n' + s.textContent; s.remove(); });
  doc.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = a.value;
      if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction') { el.removeAttribute(a.name); continue; }
      if (['href', 'src', 'xlink:href', 'action', 'poster', 'data', 'background'].includes(n)) {
        const okImg = /^\s*data:image\/(png|jpe?g|gif|webp);/i.test(v);
        const okLink = /^\s*#/.test(v) || (n === 'href' && /^\s*(tel:|mailto:)/i.test(v));
        if (!(okImg || okLink)) el.removeAttribute(a.name);
      }
      if (n === 'style') el.setAttribute('style', cleanCss(v));
    }
  });
  css = cleanCss(css).replace(/(^|[\s,{}>+~])(:root|html|body)(?![\w-])/g, '$1&');
  return { css: `.${scopeClass}{${css}}`, body: doc.body.innerHTML };
}
function cleanCss(s) {
  return String(s).replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(/gi, '(').replace(/behavior\s*:/gi, 'x:')
    .replace(/url\(\s*(['"]?)(?!data:image\/(png|jpe?g|gif|webp))[^)]*\)/gi, 'url()');
}

/* ───────────── mounting ───────────── */
export function templateClass(page) { return page.template_id === 'custom' ? 'tpl-c-' + String(page.id).replace(/[^a-z0-9]/gi, '').slice(0, 10) : 'tpl-' + page.template_id; }

export function mountTemplate(el, page, { t, canWrite, onField }) {
  const cls = templateClass(page);
  el.className = 'tpl ' + cls;
  let html = '';
  if (page.template_id === 'dental') html = dentalHTML(t);
  else if (page.template_id === 'gam') html = gamHTML(t);
  else if (page.template_id === 'custom' && page.template_html) {
    const s = sanitizeTemplate(page.template_html, cls);
    html = `<style>${s.css}</style><div class="tpl-fit">${s.body}</div>`;
  }
  el.innerHTML = html;
  const fields = page.fields || {};
  el.querySelectorAll('[data-field]').forEach(node => {
    const k = node.getAttribute('data-field'), isInput = node.matches('input,textarea');
    if (isInput) { node.value = fields[k] || ''; node.readOnly = !canWrite; } else { node.textContent = fields[k] || ''; node.setAttribute('contenteditable', canWrite ? 'true' : 'false'); }
    node.setAttribute('dir', 'auto'); node.setAttribute('autocomplete', 'off'); node.setAttribute('spellcheck', 'false');
    node.addEventListener('input', () => onField(k, isInput ? node.value : node.textContent));
  });
  fitCustom(el);
}
export function setFieldValues(el, fields) {
  el.querySelectorAll('[data-field]').forEach(node => {
    if (node === document.activeElement) return;
    const v = (fields || {})[node.getAttribute('data-field')] || '';
    if (node.matches('input,textarea')) { if (node.value !== v) node.value = v; } else if (node.textContent !== v) node.textContent = v;
  });
}
// A custom page that is taller than one A4 sheet is scaled down to fit (min 50%).
export function fitCustom(el) {
  const fit = el.querySelector('.tpl-fit'); if (!fit) return;
  fit.style.cssText = 'width:794px;transform-origin:0 0;';
  const h = fit.scrollHeight;
  if (h > 1123) {
    const k = Math.max(0.5, 1123 / h);
    fit.style.width = (794 / k) + 'px'; fit.style.transform = `scale(${k})`;
  }
}

/** rectangle of a photo slot in page coordinates (794×1123 space) */
export function slotRect(pageEl, slotId) {
  const n = pageEl.querySelector(`[data-photo="${CSS.escape(String(slotId))}"]`); if (!n) return null;
  const pr = pageEl.getBoundingClientRect(), r = n.getBoundingClientRect(), k = pr.width / 794;
  return { x: (r.left - pr.left) / k, y: (r.top - pr.top) / k, w: r.width / k, h: r.height / k };
}
export function slotIds(pageEl) { return [...pageEl.querySelectorAll('[data-photo]')].map(n => n.getAttribute('data-photo')); }
