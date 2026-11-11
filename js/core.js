// 공통 유틸: API, 상태, 라우팅, 토스트, 모달, 아이콘, 포맷, 실시간 이벤트
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const state = { user: null, about: null, dongs: null, es: null, listeners: new Set() };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class ApiError extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opt); }
  catch { throw new ApiError('서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인해 주세요.', 0, 'network'); }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && state.user) { state.user = null; location.hash = '#/login'; }
    throw new ApiError(data?.error || `오류 (${res.status})`, res.status, data?.code);
  }
  return data;
}

// ── 정리(차트·지도) ──
let cleanups = [];
export function onCleanup(fn) { cleanups.push(fn); }
export function runCleanups() { cleanups.forEach(f => { try { f(); } catch { /* */ } }); cleanups = []; }

// ── 토스트 ──
export function toast(title, body = '', { error = false, link = '', ms = 4500 } = {}) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' err' : '');
  t.innerHTML = `<b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}`;
  t.onclick = () => { if (link) location.hash = link; t.remove(); };
  box.append(t);
  setTimeout(() => t.remove(), ms);
}
export const toastErr = e => toast(e?.message || String(e), '', { error: true });

// ── 모달 ──
export function modal(html, mount) {
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bd.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  bd.addEventListener('click', e => { if (e.target === bd) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(bd);
  bd.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  const el = bd.querySelector('.modal');
  mount?.(el, close);
  el.querySelector('input,select,textarea,button:not([data-close])')?.focus();
  return { el, close };
}

export function confirmBox(title, body, okLabel = '확인', danger = false) {
  return new Promise(resolve => {
    modal(`<h2>${esc(title)}</h2><p class="ink2" style="margin:8px 0 18px">${esc(body)}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>닫기</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="ok">${esc(okLabel)}</button></div>`,
      (el, close) => {
        el.querySelector('#ok').onclick = () => { close(); resolve(true); };
        el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => resolve(false)));
      });
  });
}

// ── 아이콘 (stroke SVG) ──
const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  map: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  hand: '<path d="M7 11V6a2 2 0 014 0v5"/><path d="M11 10V4a2 2 0 014 0v6"/><path d="M15 10V6a2 2 0 014 0v8a7 7 0 01-7 7h-1a6 6 0 01-5-3l-2.5-4a2 2 0 013.4-2L7 14"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  child: '<circle cx="12" cy="6" r="3"/><path d="M8 21v-6l-2-3 3-3h6l3 3-2 3v6"/>',
  door: '<path d="M4 21h16M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17"/><circle cx="14" cy="12" r="1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
};
export function icon(name, size = 20, sw = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ── 포맷 ──
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const pad = n => String(n).padStart(2, '0');
export const parseDt = s => new Date(s.length <= 16 ? s + ':00' : s);
export const hhmm = s => { const d = parseDt(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const md = s => { const d = parseDt(s); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };
export const won = n => (n || 0).toLocaleString('ko-KR') + '원';
export const num = (n, d = 0) => (n ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const km = m => m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localIso = d => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function ago(s) {
  const diff = (Date.now() - parseDt(s).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return md(s);
}
export function whenRange(s, e) {
  const a = parseDt(s), b = parseDt(e);
  const next = b.toDateString() !== a.toDateString();
  return `${md(s)} ${hhmm(s)}~${next ? '다음 날 ' : ''}${hhmm(e)}`;
}
export function walk(m) {
  if (m == null) return '';
  const w = Math.round(m * 1.3 / 67);   // 직선거리 x 1.3 우회 / 분당 67m
  return w <= 30 ? `걸어서 약 ${Math.max(1, w)}분` : `차로 약 ${Math.max(3, Math.round(m * 1.4 / 400))}분`;
}

// ── 테마 ──
export function initTheme() {
  let t = null;
  try { t = localStorage.getItem('theme'); } catch { /* */ }
  if (t) document.documentElement.dataset.theme = t;
}
export function toggleTheme() {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* */ }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

// ── 실시간 이벤트 ──
export function connectEvents() {
  if (state.es) return;
  const es = new EventSource('/api/events');
  es.onmessage = ev => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    state.listeners.forEach(fn => { try { fn(msg); } catch (e) { console.error(e); } });
  };
  state.es = es;
}
export function disconnectEvents() { state.es?.close(); state.es = null; }
export function onEvent(fn) { state.listeners.add(fn); onCleanup(() => state.listeners.delete(fn)); }

export async function loadDongs() {
  if (!state.dongs) state.dongs = (await api('/dongs')).dongs;
  return state.dongs;
}
export function dongOptions(selected, { empty = '동 선택' } = {}) {
  const groups = {};
  (state.dongs || []).forEach(d => (groups[d.gu] ||= []).push(d));
  return `<option value="">${esc(empty)}</option>` + Object.entries(groups).map(([gu, ds]) =>
    `<optgroup label="${gu}">${ds.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(d =>
      `<option value="${d.code}" ${d.code === selected ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`).join('');
}

export function virtualFlag(text = '가상 데이터 예시') {
  return `<span class="virtual-flag" title="실제 데이터를 받기 전, 실제와 같은 구조로 만든 가상 데이터입니다">${icon('info', 14)} ${esc(text)}</span>`;
}
export function loadingHtml(t = '불러오는 중') { return `<div class="loading"><span class="spinner"></span> ${esc(t)}</div>`; }
