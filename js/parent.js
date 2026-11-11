// 부모 화면 (모바일)
import { $, $$, api, state, esc, icon, toast, toastErr, modal, confirmBox, onEvent, md, hhmm, whenRange, won, km, walk, isoDate,
  localIso, parseDt, ago, pad, dongOptions, virtualFlag, loadingHtml, toggleTheme } from './core.js';
import { baseMap, pin, meIcon, dongLayer } from './map.js';

const TABS = [
  ['', 'map', '가까운 돌봄'], ['reservations', 'cal', '예약'], ['messages', 'chat', '메시지'], ['need', 'hand', '필요해요'], ['me', 'user', '내 정보'],
];
const SLOT_KO = { weekday_18_20: '평일 18~20시', weekday_20_22: '평일 20~22시', night_22_07: '밤 22시~아침 7시', sat: '토요일', holiday: '일요일·공휴일' };
const AGE_KO = { infant: '영아(0~2세)', preschool: '유아(3~7세)', elem: '초등학생' };
const KIND_ICON = { hub: 'moon', room: 'door', timecare: 'building' };
const NOTI_ICON = { booking: 'cal', checkin: 'door', checkout: 'check', message: 'chat', reminder: 'clock', noshow: 'alert', cancel: 'cal', info: 'info' };

let unread = 0;

function shell(app, { title, tab, back, body }) {
  app.innerHTML = `
  <div class="m-shell">
    <header class="m-head">
      ${back ? `<a class="icon-btn" href="${back}" aria-label="뒤로">${icon('back')}</a>` : ''}
      <h1>${esc(title)}</h1>
      <a class="icon-btn" href="#/parent/notifications" aria-label="알림">${icon('bell')}<span class="dot-badge ${unread ? '' : 'hidden'}" id="bell-n">${unread}</span></a>
    </header>
    <main class="m-body" id="mb">${body || loadingHtml()}</main>
    <nav class="tabbar">${TABS.map(([k, ic, label]) => `<a href="#/parent${k ? '/' + k : ''}" class="${tab === k ? 'on' : ''}">${icon(ic, 22)}<span>${label}</span></a>`).join('')}</nav>
  </div>`;
  return $('#mb');
}

function setUnread(n) {
  unread = n;
  const b = $('#bell-n');
  if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
}

function liveToasts() {
  onEvent(msg => {
    if (msg.type === 'notification') {
      setUnread(unread + 1);
      toast(msg.data.title, msg.data.body, { link: msg.data.link });
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { new Notification(msg.data.title, { body: msg.data.body }); } catch { /* */ }
      }
    }
  });
}

export async function renderParent(app, seg) {
  unread = state.user?.unread ?? unread;
  const [page, id] = seg;
  if (!page) return nearby(app);
  if (page === 'book') return book(app, +id);
  if (page === 'reservations') return id ? reservationDetail(app, +id) : reservations(app);
  if (page === 'messages') return id ? thread(app, +id) : threads(app);
  if (page === 'need') return need(app);
  if (page === 'me') return me(app);
  if (page === 'notifications') return notifications(app);
  location.hash = '#/parent';
}

// ── 아이·시설 적합 ──
function fits(f, c) {
  if (!c) return true;
  if (f.target === 'elem') return c.grade >= 1 && c.grade <= 6;
  if (f.kind === 'hub') return c.months >= (f.age_min_m || 0) && c.grade <= 0;
  return c.months >= (f.age_min_m || 0) && c.months <= (f.age_max_m || 999);
}
function targetText(f) {
  if (f.target === 'elem') return '초등학생';
  if (f.kind === 'hub') return '6개월~취학 전';
  return `${f.age_min_m}~${f.age_max_m}개월`;
}

function slotBar(slots, { selectable = false, sel = null } = {}) {
  const now = Date.now();
  const cls = s => {
    if (!s.open) return 's';
    const past = parseDt(s.start).getTime() + 3600e3 < now ? ' past' : '';
    if (s.left <= 0) return 's full' + past;
    if (s.left <= Math.max(1, Math.floor(s.cap * 0.25))) return 's low' + past;
    return 's ok' + past;
  };
  const ticks = slots.map((s, i) => (i % 3 === 0 ? `${s.hour}` : '')).map(t => `<span>${t}</span>`).join('');
  return `<div class="slots" role="list">${slots.map((s, i) => `<div role="listitem" class="${cls(s)} ${sel === i ? 'sel' : ''}" data-i="${i}" ${selectable ? 'style="cursor:pointer"' : ''}
    title="${s.hour}시 · ${s.open ? `남은 자리 ${s.left}/${s.cap}` : '운영 안 함'}"></div>`).join('')}</div><div class="slot-axis">${ticks}</div>`;
}
const slotLegend = `<div class="legend-row"><span><i style="background:color-mix(in srgb,var(--s3) 75%,var(--surface))"></i>여유</span><span><i style="background:var(--warning)"></i>얼마 안 남음</span>
  <span><i style="background:repeating-linear-gradient(135deg,var(--critical) 0 3px,color-mix(in srgb,var(--critical) 55%,var(--surface)) 3px 6px)"></i>마감</span><span><i style="background:var(--surface-3)"></i>운영 안 함</span></div>`;

// ── 가까운 돌봄 ──
async function nearby(app) {
  const mb = shell(app, { title: '가까운 돌봄', tab: '' });
  liveToasts();
  const u = state.user;
  const kids = (await api('/children')).children;
  let pos = u.home_lat ? { lat: u.home_lat, lon: u.home_lon, label: `${u.home_dong_name} (사는 동)` } : { lat: 37.3219, lon: 126.8309, label: '안산시청 근처' };
  let childSel = kids.length ? kids[0].id : 0;

  mb.innerHTML = `
    <div class="row between wrap"><div><div class="small muted">기준 위치</div><b id="pos-label">${esc(pos.label)}</b></div>
      <div class="row"><button class="btn btn-sm" id="geo">${icon('target', 16)} 현재 위치</button>
      <select id="dong" style="width:auto;height:32px;padding:4px 8px;font-size:13px">${dongOptions(u.home_dong, { empty: '동 바꾸기' })}</select></div></div>
    ${kids.length ? `<div class="seg" id="kids">${kids.map(c => `<button data-c="${c.id}" class="${c.id === childSel ? 'on' : ''}">${esc(c.name)} · ${esc(c.age_label)}</button>`).join('')}<button data-c="0" class="${childSel ? '' : 'on'}">전체 보기</button></div>`
      : `<div class="note warn">아이를 등록하면 나이에 맞는 곳만 골라 보여 드려요. <a href="#/parent/me">아이 등록하기</a></div>`}
    <div class="map" id="map"></div>
    <div id="list" class="stack">${loadingHtml()}</div>
    <div class="row between"><span class="small muted grow">밤·휴일 돌봄 시설 위치는 안산시가 데이터로 정합니다.</span>${state.about?.virtual ? `<span style="flex:none">${virtualFlag('가상 데이터')}</span>` : ''}</div>`;

  const L = window.L;
  const map = baseMap($('#map'), { zoom: true, streetLabels: true });
  await dongLayer(map, { style: () => ({ fillOpacity: 0.03, opacity: 0.35 }) });
  let markers = L.layerGroup().addTo(map);
  let facs = [];

  async function load() {
    facs = (await api(`/facilities?lat=${pos.lat}&lon=${pos.lon}`)).facilities;
    const avail = {};
    await Promise.all(facs.filter(f => f.bookable).map(async f => { avail[f.id] = (await api(`/facilities/${f.id}/availability?date=${isoDate(new Date())}`)).slots; }));
    draw(avail);
  }
  function draw(avail) {
    const child = kids.find(c => c.id === childSel);
    const shown = facs.filter(f => fits(f, child));
    const hidden = facs.length - shown.length;
    markers.clearLayers();
    L.marker([pos.lat, pos.lon], { icon: meIcon() }).addTo(markers).bindTooltip('기준 위치');
    shown.forEach(f => L.marker([f.lat, f.lon], { icon: pin(f.kind, f.kind === 'hub' ? '24' : f.kind === 'room' ? '돌' : '시') }).addTo(markers)
      .bindTooltip(`<b>${esc(f.name)}</b><br>${esc(f.kind_label)} · ${km(f.distance_m)}`));
    const b = L.latLngBounds([[pos.lat, pos.lon], ...shown.slice(0, 2).map(f => [f.lat, f.lon])]);
    map.refit(b.pad(0.35), { maxZoom: 15 });
    const nearest = shown.find(f => f.bookable);
    let html = '';
    if (child && (!nearest || nearest.distance_m > 3000)) {
      html += `<div class="note warn"><b>${esc(child.name)}</b>(${esc(child.age_label)})가 이용할 수 있는 곳이 ${nearest ? `가장 가까워도 ${km(nearest.distance_m)} 떨어져 있어요` : '아직 없어요'}.
        <a href="#/parent/need">'우리 동네에도 필요해요'</a>로 알려 주시면 2028년 추가 지정과 돌봄방 확대의 근거로 쓰입니다.</div>`;
    }
    html += shown.map(f => facCard(f, avail[f.id], child)).join('') || '<div class="empty">조건에 맞는 시설이 없어요.</div>';
    if (hidden && child) html += `<p class="small muted">${esc(child.name)}의 나이에 맞지 않는 ${hidden}곳은 숨겼어요. <a href="#" id="showall">모두 보기</a></p>`;
    $('#list').innerHTML = html;
    $('#showall')?.addEventListener('click', e => { e.preventDefault(); childSel = 0; $$('#kids button').forEach(x => x.classList.toggle('on', x.dataset.c === '0')); draw(avail); });
    $$('[data-msg]').forEach(b => b.onclick = async () => {
      try { const r = await api('/threads', { method: 'POST', body: { facility_id: +b.dataset.msg } }); location.hash = `#/parent/messages/${r.thread_id}`; } catch (e) { toastErr(e); }
    });
  }
  function facCard(f, slots, child) {
    const t = f.today || {};
    const status = !f.bookable ? `<span class="chip">예약은 기존 경로</span>`
      : t.open === false ? `<span class="chip">오늘 휴무</span>`
      : t.free_slots === 0 ? `<span class="chip crit">${icon('alert', 12)} 오늘 남은 자리 없음</span>`
      : `<span class="chip good">${icon('check', 12)} 오늘 예약 가능</span>`;
    return `<article class="card fac-card">
      <div class="top"><div class="fac-ico ${f.kind}">${icon(KIND_ICON[f.kind], 22)}</div>
        <div class="grow"><div class="fac-name">${esc(f.name)}</div>
        <div class="fac-meta">${esc(f.kind_label)} · ${km(f.distance_m)} · ${walk(f.distance_m)}</div></div></div>
      <div class="row wrap">${status}<span class="chip">${esc(targetText(f))}</span><span class="chip">${f.fee_per_hour ? `시간당 ${won(f.fee_per_hour)}` : '이용료 검토 중(시범 무료)'}</span></div>
      <div class="small ink2">${icon('clock', 14)} ${esc(f.hours_text)}</div>
      ${slots && slots.length ? `<div><div class="small muted" style="margin-bottom:4px">오늘 시간대별 남은 자리 ${f.kind === 'hub' ? '(07시~다음 날 07시)' : ''}</div>${slotBar(slots)}</div>` : ''}
      ${f.status_label ? `<div class="small muted">${esc(f.status_label)}</div>` : ''}
      <div class="row">${f.bookable ? `<a class="btn btn-primary grow ${child && !fits(f, child) ? 'disabled' : ''}" href="#/parent/book/${f.id}">예약하기</a>
        <button class="btn" data-msg="${f.id}">${icon('chat', 16)} 문의</button>` : ''}
        ${f.phone ? `<a class="btn" href="tel:${esc(f.phone)}">전화</a>` : ''}</div>
    </article>`;
  }
  $('#kids')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    childSel = +b.dataset.c; $$('#kids button').forEach(x => x.classList.toggle('on', x === b)); load().catch(toastErr);
  });
  $('#dong').onchange = e => {
    const d = state.dongs.find(x => x.code === e.target.value); if (!d) return;
    pos = { lat: d.res_lat, lon: d.res_lon, label: d.name }; $('#pos-label').textContent = d.name; load().catch(toastErr);
  };
  $('#geo').onclick = () => {
    if (!navigator.geolocation) return toast('이 브라우저는 위치를 지원하지 않아요', '', { error: true });
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: lat, longitude: lon } = p.coords;
      if (lat < 37.2 || lat > 37.4 || lon < 126.5 || lon > 127.0) { toast('안산시 밖이에요', '사는 동 기준으로 보여 드릴게요.'); return; }
      pos = { lat, lon, label: '현재 위치' }; $('#pos-label').textContent = '현재 위치'; load().catch(toastErr);
    }, () => toast('위치 권한이 없어요', '동을 직접 골라 주세요.', { error: true }), { timeout: 8000 });
  };
  await load();
}

// ── 예약하기 ──
async function book(app, fid) {
  const mb = shell(app, { title: '예약하기', tab: '', back: '#/parent' });
  liveToasts();
  const [{ facility: f }, { children }] = await Promise.all([api(`/facilities/${fid}`), api('/children')]);
  const ok = children.filter(c => fits(f, c));
  if (!ok.length) {
    mb.innerHTML = `<div class="card"><h3>${esc(f.name)}</h3><p class="ink2" style="margin-top:8px">이 시설(${esc(targetText(f))})을 이용할 수 있는 아이가 등록돼 있지 않아요.</p>
      <div class="row" style="margin-top:12px"><a class="btn btn-primary" href="#/parent/me">아이 등록하기</a><a class="btn" href="#/parent">다른 곳 보기</a></div></div>`;
    return;
  }
  const days = [...Array(8)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  let date = isoDate(days[0]);
  let slots = [];
  let selIdx = null;
  mb.innerHTML = `
    <div class="card fac-card"><div class="top"><div class="fac-ico ${f.kind}">${icon(KIND_ICON[f.kind], 22)}</div>
      <div class="grow"><div class="fac-name">${esc(f.name)}</div><div class="fac-meta">${esc(f.kind_label)} · ${esc(f.hours_text)}</div></div></div></div>
    <form class="card" id="bf">
      <div class="field"><label>아이</label><div class="seg" id="kid">${ok.map((c, i) => `<button type="button" data-c="${c.id}" class="${i === 0 ? 'on' : ''}">${esc(c.name)} · ${esc(c.age_label)}</button>`).join('')}</div></div>
      <div class="field"><label>날짜</label><div class="seg" id="days">${days.map((d, i) => `<button type="button" data-d="${isoDate(d)}" class="${i === 0 ? 'on' : ''}">${i === 0 ? '오늘' : i === 1 ? '내일' : `${d.getMonth() + 1}/${d.getDate()}`}</button>`).join('')}</div></div>
      <div class="field"><label>남은 자리 <span class="muted" style="font-weight:400">칸을 누르면 그 시간부터 시작해요</span></label><div id="slots">${loadingHtml()}</div>${slotLegend}</div>
      <div class="row"><div class="field grow"><label for="st">맡기는 시간</label><select id="st"></select></div>
        <div class="field grow"><label for="en">찾아가는 시간</label><select id="en"></select></div></div>
      <div class="field"><label for="note">돌봄교사에게 전할 말 (선택)</label><textarea id="note" maxlength="300" placeholder="예: 저녁은 먹고 가요 / 22시쯤 아빠가 데리러 가요"></textarea></div>
      <div class="note" id="summary"></div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:12px" id="go">예약하기</button>
      <p class="small muted" style="margin-top:8px">예약 시작 1시간이 지나도 입실하지 않으면 미이용으로 처리돼요. 입실 전까지 언제든 취소할 수 있어요.</p>
    </form>`;
  let child = ok[0].id;

  function timeOptions() {
    const st = $('#st'), en = $('#en');
    const base = new Date(date + 'T00:00:00');
    const now = new Date();
    const opts = [];
    if (f.kind === 'hub') {
      for (let m = 0; m < 24 * 60; m += 30) opts.push(new Date(base.getTime() + m * 60e3));
    } else {
      const open = slots.filter(s => s.open);
      if (open.length) {
        const s0 = parseDt(open[0].start), s1 = parseDt(open[open.length - 1].start).getTime() + 3600e3;
        for (let t = s0.getTime(); t < s1; t += 30 * 60e3) opts.push(new Date(t));
      }
    }
    const valid = opts.filter(d => d.getTime() > now.getTime() - 30 * 60e3);
    const prev = st.value;
    st.innerHTML = valid.length ? valid.map(d => `<option value="${localIso(d)}">${pad(d.getHours())}:${pad(d.getMinutes())}</option>`).join('') : '<option value="">운영 시간이 없어요</option>';
    if (selIdx !== null && slots[selIdx]) {
      const want = slots[selIdx].start;
      const opt = valid.find(d => localIso(d) === want) || valid.find(d => localIso(d) > want);
      if (opt) st.value = localIso(opt);
    } else if (prev && valid.some(d => localIso(d) === prev)) st.value = prev;
    else if (f.kind === 'hub') { const p = valid.find(d => d.getHours() >= 19) || valid[0]; if (p) st.value = localIso(p); }
    endOptions();
  }
  function endOptions() {
    const st = $('#st'), en = $('#en');
    if (!st.value) { en.innerHTML = ''; summary(); return; }
    const s = parseDt(st.value);
    const max = f.kind === 'hub' ? 13 * 60 : (() => {
      const open = slots.filter(x => x.open); const close = parseDt(open[open.length - 1].start).getTime() + 3600e3;
      return Math.round((close - s.getTime()) / 60e3);
    })();
    const out = [];
    for (let m = 30; m <= max; m += 30) out.push(new Date(s.getTime() + m * 60e3));
    const prevEn = en.value;
    en.innerHTML = out.map(d => `<option value="${localIso(d)}">${d.getDate() !== s.getDate() ? '다음 날 ' : ''}${pad(d.getHours())}:${pad(d.getMinutes())} (${((d - s) / 3600e3).toFixed(1).replace('.0', '')}시간)</option>`).join('');
    const def = out.find(d => (d - s) / 3600e3 === 3) || out[out.length - 1];
    en.value = out.some(d => localIso(d) === prevEn) ? prevEn : (def ? localIso(def) : '');
    summary();
  }
  function summary() {
    const st = $('#st').value, en = $('#en').value;
    if (!st || !en) { $('#summary').textContent = '시간을 골라 주세요.'; return; }
    const h = (parseDt(en) - parseDt(st)) / 3600e3;
    const s = parseDt(st);
    const bad = slots.filter(x => { const t = parseDt(x.start); return x.open && t < parseDt(en) && t.getTime() + 3600e3 > s.getTime() && x.left <= 0; });
    const c = ok.find(x => x.id === child);
    $('#summary').innerHTML = `<b>${esc(c.name)}</b> · ${whenRange(st, en)} · ${h}시간<br>이용료 <b>${f.fee_per_hour ? won(Math.round(h * 2) / 2 * f.fee_per_hour) : '시범 운영 무료'}</b>
      ${bad.length ? `<br><span style="color:var(--critical);font-weight:600">${icon('alert', 14)} ${bad.map(x => x.hour + '시').join(', ')}는 정원이 찼어요.</span>` : ''}`;
  }
  async function loadSlots() {
    $('#slots').innerHTML = loadingHtml();
    slots = (await api(`/facilities/${fid}/availability?date=${date}`)).slots;
    $('#slots').innerHTML = slots.length ? slotBar(slots, { selectable: true, sel: selIdx }) : '<div class="note">이 날은 운영하지 않아요.</div>';
    timeOptions();
  }
  $('#kid').onclick = e => { const b = e.target.closest('button'); if (!b) return; child = +b.dataset.c; $$('#kid button').forEach(x => x.classList.toggle('on', x === b)); summary(); };
  $('#days').onclick = e => { const b = e.target.closest('button'); if (!b) return; date = b.dataset.d; selIdx = null; $$('#days button').forEach(x => x.classList.toggle('on', x === b)); loadSlots().catch(toastErr); };
  $('#slots').onclick = e => { const s = e.target.closest('[data-i]'); if (!s) return; selIdx = +s.dataset.i; $$('#slots .s').forEach(x => x.classList.toggle('sel', x === s)); timeOptions(); };
  $('#st').onchange = () => { selIdx = null; endOptions(); };
  $('#en').onchange = summary;
  $('#bf').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#go'); btn.disabled = true;
    try {
      const r = await api('/reservations', { method: 'POST', body: { facility_id: fid, child_id: child, start: $('#st').value, end: $('#en').value, note: $('#note').value } });
      modal(`<h2>예약이 확정됐어요</h2><p class="ink2" style="margin:6px 0 14px">${whenRange($('#st').value, $('#en').value)} · ${esc(f.name)}</p>
        <div class="label">귀가 확인 코드</div><div class="code-box" style="margin:6px 0 10px">${r.pickup_code.split('').map(d => `<b>${d}</b>`).join('')}</div>
        <p class="small ink2">아이를 찾으러 갈 때 돌봄교사에게 이 코드를 알려 주세요. 다른 가족이 데리러 간다면 코드를 함께 전달해 주세요.</p>
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-close>닫기</button><a class="btn btn-primary" href="#/parent/reservations/${r.id}" id="goto">예약 보기</a></div>`,
        (el, close) => { el.querySelector('#goto').onclick = () => close(); });
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      await loadSlots();
    } catch (err) { toastErr(err); if (err.code === 'full') loadSlots(); }
    finally { btn.disabled = false; }
  };
  await loadSlots();
}

// ── 예약 목록·상세 ──
function statusPill(r) { return `<span class="status-pill st-${r.status}">${esc(r.status_label)}</span>`; }

function resTimeline(r) {
  const steps = [
    { t: '예약', d: r.created_at, done: true },
    { t: '입실', d: r.checkin_at, done: !!r.checkin_at, now: r.status === 'checked_in' },
    { t: '귀가', d: r.checkout_at, done: !!r.checkout_at },
  ];
  if (r.status === 'cancelled') steps.splice(1, 2, { t: '취소', d: r.cancelled_at, done: true });
  if (r.status === 'no_show') steps.splice(1, 2, { t: '미이용 처리', d: null, done: true });
  return `<div class="timeline">${steps.map(s => `<div class="tl ${s.now ? 'now' : s.done ? 'done' : ''}"><i></i><div><b>${s.t}</b> ${s.d ? `<span class="small muted">${md(s.d)} ${hhmm(s.d)}</span>` : ''}</div></div>`).join('')}</div>`;
}

async function reservations(app) {
  const mb = shell(app, { title: '예약', tab: 'reservations' });
  liveToasts();
  const draw = async () => {
    const { upcoming, past } = await api('/reservations');
    mb.innerHTML = `
      <h3>다가오는 예약</h3>
      ${upcoming.length ? upcoming.map(r => `<article class="card res-item">
        <div class="row between"><span class="when">${whenRange(r.start_at, r.end_at)}</span>${statusPill(r)}</div>
        <div class="ink2">${esc(r.child_name)} · ${esc(r.facility_name)}</div>
        <div class="row between wrap"><div><div class="small muted">귀가 확인 코드</div><div class="code-box">${r.pickup_code.split('').map(d => `<b>${d}</b>`).join('')}</div></div>
          <div class="small ink2">${r.fee ? won(r.fee) : '무료'} · ${r.hours}시간</div></div>
        <div class="row"><a class="btn btn-sm" href="#/parent/reservations/${r.id}">자세히</a>
        ${r.status === 'booked' ? `<button class="btn btn-sm btn-danger" data-cancel="${r.id}">취소</button>` : ''}</div>
      </article>`).join('') : `<div class="card empty">다가오는 예약이 없어요.<br><a href="#/parent">가까운 곳 찾아 예약하기</a></div>`}
      <h3 style="margin-top:6px">지난 예약</h3>
      <div class="card" style="padding:6px 14px">${past.length ? past.slice(0, 30).map(r => `<a class="row between" style="padding:10px 0;border-bottom:1px solid var(--line);color:inherit" href="#/parent/reservations/${r.id}">
        <span><b>${md(r.start_at)}</b> <span class="small ink2">${hhmm(r.start_at)}~${hhmm(r.end_at)} · ${esc(r.child_name)}</span><br><span class="small muted">${esc(r.facility_name)}</span></span>${statusPill(r)}</a>`).join('') : '<div class="empty">아직 없어요.</div>'}</div>`;
    $$('[data-cancel]').forEach(b => b.onclick = async () => {
      if (!await confirmBox('예약을 취소할까요?', '취소한 자리는 다른 가정이 예약할 수 있게 열려요.', '예약 취소', true)) return;
      try { await api(`/reservations/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('취소했어요'); draw(); } catch (e) { toastErr(e); }
    });
  };
  onEvent(m => { if (m.type === 'notification' && ['checkin', 'checkout', 'noshow'].includes(m.data.kind)) draw().catch(() => {}); });
  await draw();
}

async function reservationDetail(app, rid) {
  const mb = shell(app, { title: '예약 자세히', tab: 'reservations', back: '#/parent/reservations' });
  liveToasts();
  const draw = async () => {
    const { reservation: r } = await api(`/reservations/${rid}`);
    mb.innerHTML = `
      <div class="card stack">
        <div class="row between"><h2 style="font-size:18px">${esc(r.child_name)}</h2>${statusPill(r)}</div>
        <div><div class="small muted">시간</div><b>${whenRange(r.start_at, r.end_at)}</b> <span class="small ink2">(${r.hours}시간)</span></div>
        <div><div class="small muted">장소</div><b>${esc(r.facility_name)}</b> ${r.facility_phone ? `<a href="tel:${esc(r.facility_phone)}" class="small">${esc(r.facility_phone)}</a>` : ''}</div>
        <div><div class="small muted">이용료</div><b>${r.fee ? won(r.fee) : '무료(시범)'}</b> <span class="small muted">· 현장 결제(가정)</span></div>
        ${r.note ? `<div><div class="small muted">전한 말</div>${esc(r.note)}</div>` : ''}
        ${['booked', 'checked_in'].includes(r.status) ? `<div><div class="small muted">귀가 확인 코드</div><div class="code-box">${r.pickup_code.split('').map(d => `<b>${d}</b>`).join('')}</div>
          <p class="small ink2" style="margin-top:6px">데리러 가는 분이 이 코드를 돌봄교사에게 알려 주면 인계돼요.</p></div>` : ''}
        ${r.checkout_note ? `<div class="small muted">인계 기록: ${esc(r.checkout_note)}</div>` : ''}
        <div><div class="small muted">진행</div>${resTimeline(r)}</div>
        <div class="row">${r.status === 'booked' ? `<button class="btn btn-danger" id="cancel">예약 취소</button>` : ''}
          <button class="btn" id="msg">${icon('chat', 16)} 돌봄교사에게 메시지</button></div>
      </div>`;
    $('#cancel')?.addEventListener('click', async () => {
      if (!await confirmBox('예약을 취소할까요?', '취소한 자리는 다른 가정이 예약할 수 있게 열려요.', '예약 취소', true)) return;
      try { await api(`/reservations/${rid}/cancel`, { method: 'POST' }); toast('취소했어요'); draw(); } catch (e) { toastErr(e); }
    });
    $('#msg').onclick = async () => { try { const t = await api('/threads', { method: 'POST', body: { facility_id: r.facility_id } }); location.hash = `#/parent/messages/${t.thread_id}`; } catch (e) { toastErr(e); } };
  };
  onEvent(m => { if (m.type === 'notification' && ['checkin', 'checkout', 'noshow'].includes(m.data.kind)) draw().catch(() => {}); });
  await draw();
}

// ── 메시지 ──
async function threads(app) {
  const mb = shell(app, { title: '메시지', tab: 'messages' });
  liveToasts();
  const draw = async () => {
    const { threads: ts } = await api('/threads');
    mb.innerHTML = ts.length ? `<div class="card" style="padding:4px 14px">${ts.map(t => `<a class="row between" style="padding:12px 0;border-bottom:1px solid var(--line);color:inherit" href="#/parent/messages/${t.id}">
      <span class="grow"><b>${esc(t.facility_name)}</b><br><span class="small ink2">${esc(t.last_body || '대화를 시작해 보세요')}</span></span>
      <span style="text-align:right">${t.last_at ? `<span class="small muted">${ago(t.last_at)}</span><br>` : ''}${t.unread ? `<span class="chip crit">${t.unread}</span>` : ''}</span></a>`).join('')}</div>`
      : `<div class="card empty">아직 대화가 없어요.<br>시설 카드의 '문의'나 예약 화면에서 돌봄교사에게 메시지를 보낼 수 있어요.</div>`;
  };
  onEvent(m => { if (m.type === 'message') draw().catch(() => {}); });
  await draw();
}

async function thread(app, tid) {
  const mb = shell(app, { title: '메시지', tab: 'messages', back: '#/parent/messages' });
  liveToasts();
  const draw = async () => {
    const { thread: th, messages } = await api(`/threads/${tid}`);
    $('.m-head h1').textContent = th.facility_name;
    mb.innerHTML = `<div class="chat" id="chat">${messages.map(m => bubble(m)).join('') || '<div class="empty">돌봄교사에게 궁금한 점을 남겨 주세요.</div>'}</div>
      <form class="chat-input" id="cf"><input id="ci" placeholder="메시지 입력" maxlength="1000" autocomplete="off"><button class="btn btn-primary">보내기</button></form>`;
    $('#cf').onsubmit = async e => {
      e.preventDefault(); const v = $('#ci').value.trim(); if (!v) return;
      try { await api(`/threads/${tid}/messages`, { method: 'POST', body: { body: v } }); await draw(); $('#ci').focus(); } catch (err) { toastErr(err); }
    };
    window.scrollTo(0, document.body.scrollHeight);
  };
  const bubble = m => `<div class="bubble ${m.sender_id === state.user.id ? 'me' : ''}">${esc(m.body)}<div class="bt">${m.sender_id === state.user.id ? '' : esc(m.sender_name) + ' · '}${ago(m.created_at)}</div></div>`;
  onEvent(m => { if (m.type === 'message' && m.data.thread_id === tid) draw().catch(() => {}); });
  await draw();
}

// ── 우리 동네에도 필요해요 ──
async function need(app) {
  const mb = shell(app, { title: '우리 동네에도 필요해요', tab: 'need' });
  liveToasts();
  const [{ requests }, summary, { children }] = await Promise.all([api('/demand'), api('/demand/summary'), api('/children')]);
  const guessAge = children.length ? (children[0].grade >= 1 ? 'elem' : children[0].months < 36 ? 'infant' : 'preschool') : 'preschool';
  const max = Math.max(1, ...summary.by_dong.map(d => d.count));
  mb.innerHTML = `
    <div class="card"><h3>가까운 곳에 밤·휴일 돌봄이 없나요?</h3>
      <p class="small ink2" style="margin:6px 0 14px">등록한 내용은 동 단위로만 집계돼 <b>2028년 거점 추가 지정</b>과 <b>늦은 시간 돌봄방</b>을 어디에 둘지 정하는 근거로 쓰입니다.</p>
      <form id="nf">
        <div class="field"><label>사는 동</label><select id="dong" required>${dongOptions(state.user.home_dong)}</select></div>
        <div class="field"><label>아이 나이</label><div class="check-grid">${Object.entries(AGE_KO).map(([k, v]) => `<label class="check-pill"><input type="radio" name="age" value="${k}" ${k === guessAge ? 'checked' : ''}>${v}</label>`).join('')}</div></div>
        <div class="field"><label>필요한 시간대 (여러 개 선택)</label><div class="check-grid">${Object.entries(SLOT_KO).map(([k, v]) => `<label class="check-pill"><input type="checkbox" name="slot" value="${k}">${v}</label>`).join('')}</div></div>
        <div class="field"><label>하고 싶은 말 (선택)</label><textarea id="note" maxlength="200" placeholder="예: 공단 교대근무라 밤 10시 출근이에요"></textarea></div>
        <button class="btn btn-primary btn-block">등록하기</button>
      </form></div>
    ${requests.length ? `<div class="card"><h3>내가 등록한 수요</h3>${requests.map(r => `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line)">
      <span><b>${esc(r.dong_name)}</b> · ${esc(r.age_label)}<br><span class="small ink2">${r.slots_label.map(esc).join(', ')}</span><br><span class="small muted">${md(r.created_at)} 등록</span></span>
      <button class="btn btn-sm btn-ghost" data-del="${r.id}">삭제</button></div>`).join('')}</div>` : ''}
    <div class="card"><div class="card-title"><h3>동네별 등록 현황</h3><span class="card-sub">총 ${summary.total}건</span></div>
      ${summary.by_dong.slice(0, 10).map(d => `<div style="display:grid;grid-template-columns:70px 1fr 36px;gap:8px;align-items:center;margin:6px 0">
        <span class="small">${esc(d.name)}</span><div style="height:10px;border-radius:0 4px 4px 0;background:var(--s1);width:${(d.count / max) * 100}%"></div><span class="small num ink2" style="text-align:right">${d.count}</span></div>`).join('')}
      <p class="small muted" style="margin-top:8px">개인 정보 없이 동 단위 건수만 공개됩니다.</p></div>`;
  $('#nf').onsubmit = async e => {
    e.preventDefault();
    const slots = $$('input[name=slot]:checked').map(x => x.value);
    const age = $('input[name=age]:checked')?.value;
    try { await api('/demand', { method: 'POST', body: { dong: $('#dong').value, age_group: age, slots, note: $('#note').value } }); toast('등록했어요', '고맙습니다. 시의 배치 결정에 반영됩니다.'); need(app); }
    catch (err) { toastErr(err); }
  };
  $$('[data-del]').forEach(b => b.onclick = async () => { try { await api(`/demand/${b.dataset.del}`, { method: 'DELETE' }); need(app); } catch (e) { toastErr(e); } });
}

// ── 내 정보 ──
async function me(app) {
  const mb = shell(app, { title: '내 정보', tab: 'me' });
  liveToasts();
  const { children } = await api('/children');
  const u = state.user;
  mb.innerHTML = `
    <div class="card"><div class="card-title"><h3>아이</h3><button class="btn btn-sm btn-primary" id="add">${icon('plus', 14)} 아이 등록</button></div>
      ${children.length ? children.map(c => `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <span><b>${esc(c.name)}</b> <span class="chip">${esc(c.age_label)}</span><br><span class="small muted">${esc(c.birthdate)}${c.notes ? ' · ' + esc(c.notes) : ''}</span></span>
        <button class="btn btn-sm" data-edit="${c.id}">수정</button></div>`).join('') : '<div class="empty">아직 등록한 아이가 없어요.</div>'}
      <p class="small muted" style="margin-top:8px">알레르기·투약 등 주의사항은 돌봄교사 명단에 표시돼요.</p></div>
    <form class="card" id="pf"><h3 style="margin-bottom:12px">보호자 정보</h3>
      <div class="field"><label>이름</label><input id="name" value="${esc(u.name)}" maxlength="30"></div>
      <div class="field"><label>휴대폰</label><input id="phone" value="${esc(u.phone || '')}" inputmode="tel"></div>
      <div class="field"><label>사는 동</label><select id="dong">${dongOptions(u.home_dong)}</select></div>
      <button class="btn btn-primary">저장</button></form>
    <div class="card stack-sm">
      <button class="btn" id="noti">${icon('bell', 16)} 휴대폰 알림 켜기</button>
      <button class="btn" id="theme">${icon('moon', 16)} 화면 밝기 전환</button>
      <button class="btn btn-danger" id="out">${icon('logout', 16)} 로그아웃</button>
    </div>
    <p class="small muted">아이디 ${esc(u.username)} ${u.demo ? '· 시연용 계정' : ''}</p>`;
  const childForm = c => modal(`<h2>${c ? '아이 정보 수정' : '아이 등록'}</h2>
    <form id="cf" style="margin-top:12px">
      <div class="field"><label>이름</label><input id="cn" value="${esc(c?.name || '')}" required maxlength="20"></div>
      <div class="field"><label>생년월일</label><input id="cb" type="date" value="${esc(c?.birthdate || '')}" required max="${isoDate(new Date())}"></div>
      <div class="field"><label>주의사항 (알레르기, 투약 등)</label><input id="cno" value="${esc(c?.notes || '')}" maxlength="200"></div>
      <div class="row" style="justify-content:space-between">${c ? '<button type="button" class="btn btn-danger" id="del">삭제</button>' : '<span></span>'}
      <span class="row"><button type="button" class="btn" data-close>닫기</button><button class="btn btn-primary">저장</button></span></div></form>`,
    (el, close) => {
      el.querySelector('#cf').onsubmit = async e => {
        e.preventDefault();
        const body = { name: el.querySelector('#cn').value, birthdate: el.querySelector('#cb').value, notes: el.querySelector('#cno').value };
        try { await api(c ? `/children/${c.id}` : '/children', { method: c ? 'PUT' : 'POST', body }); close(); toast('저장했어요'); me(app); } catch (err) { toastErr(err); }
      };
      el.querySelector('#del')?.addEventListener('click', async () => {
        try { await api(`/children/${c.id}`, { method: 'DELETE' }); close(); me(app); } catch (err) { toastErr(err); }
      });
    });
  $('#add').onclick = () => childForm(null);
  $$('[data-edit]').forEach(b => b.onclick = () => childForm(children.find(c => c.id === +b.dataset.edit)));
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/me', { method: 'PUT', body: { name: $('#name').value, phone: $('#phone').value, home_dong: $('#dong').value || null } }); state.user = r.user; toast('저장했어요'); }
    catch (err) { toastErr(err); }
  };
  $('#noti').onclick = async () => {
    if (!('Notification' in window)) return toast('이 브라우저는 알림을 지원하지 않아요', '', { error: true });
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? '알림을 켰어요' : '알림이 꺼져 있어요', p === 'granted' ? '입실·귀가 알림을 화면이 꺼져 있을 때도 받아요.' : '브라우저 설정에서 허용해 주세요.');
  };
  $('#theme').onclick = toggleTheme;
  $('#out').onclick = () => window.dispatchEvent(new Event('care:logout'));
}

// ── 알림 ──
async function notifications(app) {
  const mb = shell(app, { title: '알림', tab: '', back: '#/parent' });
  liveToasts();
  const draw = async () => {
    const { notifications: ns } = await api('/notifications');
    mb.innerHTML = ns.length ? `<div class="card" style="padding:4px 16px">${ns.map(n => `<a class="noti ${n.read_at ? '' : 'unread'}" href="${esc(n.link || '#/parent')}" style="color:inherit">
      <span class="ni">${icon(NOTI_ICON[n.kind] || 'bell', 18)}</span><span><div class="nt">${esc(n.title)}</div><div class="nb">${esc(n.body || '')}</div><div class="nd">${ago(n.created_at)}</div></span></a>`).join('')}</div>`
      : '<div class="card empty">알림이 없어요.</div>';
    await api('/notifications/read', { method: 'POST' });
    setUnread(0); state.user.unread = 0;
  };
  onEvent(m => { if (m.type === 'notification') setTimeout(() => draw().catch(() => {}), 300); });
  await draw();
}
