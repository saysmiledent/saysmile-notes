// Welcome splash: a pencil draws a smile, shows the creator's name and a random friendly line. Tap to skip.
import { h } from './ui.js';
import { getLang } from './i18n.js';
export const CREATOR = 'Dr. Saywan';
const LINES = {
  ru: ['Улыбки начинаются с хороших записей 🦷', 'Пишите чётко — лечите нежно ✍️', 'Каждый зуб заслуживает своей истории', 'Меньше бумаги — больше улыбок 😁', 'Сегодня без боли и без потерянных рентгенов', 'Карандаш в руке — зубы в порядке'],
  en: ['Great smiles start with great notes 🦷', 'Write clearly, treat gently ✍️', 'Every tooth deserves its own story', 'Less paper, more smiles 😁', 'No pain and no lost X-rays today', 'Pencil in hand, teeth in order'],
};
export function showSplash({ welcome } = {}) {
  const ru = getLang() === 'ru', L = LINES[ru ? 'ru' : 'en'];
  const el = h('div', { class: 'splash', role: 'presentation' },
    h('div', { class: 'sp-in' },
      h('div', { class: 'sp-art', html: `<svg viewBox="0 0 220 150" width="220" height="150" style="overflow:visible"><path class="sp-smile" d="M26 62c14 52 44 76 84 76s70-24 84-76" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" pathLength="1"/><circle class="sp-eye" cx="72" cy="40" r="9" fill="#fff"/><circle class="sp-eye e2" cx="148" cy="40" r="9" fill="#fff"/><g class="sp-pencil"><rect x="-11" y="-62" width="22" height="86" rx="4" fill="#ffd45e"/><rect x="-11" y="-62" width="22" height="16" rx="4" fill="#f28b82"/><path d="M-11 24L0 46 11 24z" fill="#f5deb3"/><path d="M-4 38L0 46 4 38z" fill="#1c1b19"/></g></svg>` }),
      h('div', { class: 'sp-title' }, welcome ? (ru ? 'Добро пожаловать, ' : 'Welcome, ') + welcome + '!' : h('span', {}, h('b', {}, 'Say'), 'Smile Notes')),
      h('div', { class: 'sp-line' }, L[Math.floor(Math.random() * L.length)]),
      h('div', { class: 'sp-by' }, (ru ? 'Приложение создал ' : 'App created by ') + CREATOR)));
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
  el.addEventListener('pointerdown', close);
  document.body.append(el); setTimeout(close, welcome ? 3200 : 2300);
}
