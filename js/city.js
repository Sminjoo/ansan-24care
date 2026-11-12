// 시 담당자 화면 (데스크톱)
import { $, $$, api, state, esc, icon, toast, toastErr, modal, onEvent, onCleanup, num, md, hhmm, ago, loadingHtml, virtualFlag, toggleTheme } from './core.js';
import { chart, axis, noGrid, css, series, COMP_COLORS, alpha } from './charts.js';
import { baseMap, dongLayer, pin, divColor, seqColor, DIV_STEPS, SEQ_STEPS } from './map.js';

const NAV = [
  ['', 'home', '개요', null],
  ['demand', null, '수요·공급', '1'],
  ['hubs', null, '거점 위치', '2'],
  ['expand', null, '공백·확장', '3'],
  ['ops', null, '운영 현황', '4'],
  ['log', 'list', '결정 기록', null],
];
const TITLES = { '': ['개요', '안산 24시간 돌봄 · 시 운영 콘솔'], demand: ['1. 밤·휴일 돌봄 수요가 큰 동', '그림 1 · 동별 수요와 공급, 공백'],
  hubs: ['2. 24시간 거점 위치', '그림 2·3 · 후보 시립어린이집 순위와 시간대별 예상 이용'], expand: ['3. 공백 확인과 확장 돌봄방 후보', '그림 4·5 · 거점에서 먼 동, 공실·유휴공간 점수'],
  ops: ['4. 운영 현황', '예약·이용·정원 초과·수요 등록'], log: ['결정 기록', '거점 지정·공간 상태·설정 변경 이력'] };
const COMP_KEYS = ['night', 'late', 'hol', 'sandan'];
const COMP_LABEL = { night: '야간 출근', late: '심야 귀가', hol: '휴일 출근', sandan: '산단 통근 부모 거주' };
const SPACE_KIND = { vacant_store: '상가 공실', public_idle: '공공 유휴공간', closed_daycare: '문 닫은 어린이집' };
const SPACE_STATUS = { candidate: '후보', site_visit: '현장 확인 예정', suitable: '적합', unsuitable: '부적합', agreement: '협약 진행', operating: '운영 중' };
const STATUS_CHIP = { candidate: '', site_visit: 'blue', suitable: 'good', unsuitable: 'crit', agreement: 'warn', operating: 'good' };

let settings = null;
const charts = {};
function mk(id, cfg) { charts[id]?.destroy(); const el = document.getElementById(id); if (!el) return null; charts[id] = chart(el, cfg); return charts[id]; }

function shell(app, page) {
  const [title, crumb] = TITLES[page] || TITLES[''];
  app.innerHTML = `
  <div class="c-shell">
    <nav class="c-side" aria-label="시 운영 메뉴">
      <a class="brand" href="#/city" style="padding:4px 8px 14px"><span class="brand-mark">${icon('moon', 18)}</span> 24시간 돌봄 · 시</a>
      <div class="sec">흐름</div>
      ${NAV.slice(0, 5).map(([k, ic, label, n]) => `<a href="#/city${k ? '/' + k : ''}" class="${page === k ? 'on' : ''}">${n ? `<span class="n">${n}</span>` : icon(ic, 18)} ${label}</a>`).join('')}
      <div class="sec">근거</div>
      ${NAV.slice(5).map(([k, ic, label]) => `<a href="#/city/${k}" class="${page === k ? 'on' : ''}">${icon(ic, 18)} ${label}</a>`).join('')}
      <div class="foot">${esc(state.user.name)}<br><a href="#" id="out" style="color:#c5cde0;padding:0;display:inline">로그아웃</a> · <a href="#" id="theme" style="color:#c5cde0;padding:0;display:inline">밝기</a></div>
    </nav>
    <div class="c-main">
      <header class="c-top"><div class="grow"><div class="crumb">${esc(crumb)}</div><h1>${esc(title)}</h1></div>
        ${state.about?.virtual ? virtualFlag('가상 데이터 예시 · 실제 값 아님') : ''}</header>
      <main class="c-body" id="cb">${loadingHtml()}</main>
    </div>
  </div>`;
  $('#out').onclick = e => { e.preventDefault(); window.dispatchEvent(new Event('care:logout')); };
  $('#theme').onclick = e => { e.preventDefault(); toggleTheme(); };
  onEvent(m => { if (m.type === 'notification') toast(m.data.title, m.data.body); });
  return $('#cb');
}

export async function renderCity(app, seg) {
  const page = seg[0] || '';
  const cb = shell(app, page);
  onCleanup(() => Object.keys(charts).forEach(k => delete charts[k]));
  settings = (await api('/city/settings')).settings;
  const pages = { '': overview, demand, hubs, expand, ops, log };
  await (pages[page] || overview)(cb);
}

// ── 공통: 필터 ──
function qs(extra = {}) {
  const p = new URLSearchParams();
  COMP_KEYS.forEach(k => p.set(`w_${k}`, settings.weights[k]));
  Object.entries(extra).forEach(([k, v]) => v != null && p.set(k, v));
  return p.toString();
}
function weightFilters({ radius = false, threshold = false } = {}) {
  const cc = COMP_COLORS();
  return `<div class="card flat"><div class="filters">
    ${COMP_KEYS.map(k => `<div class="f"><label><span><i class="sw-inline" style="background:${cc[k]}"></i>${COMP_LABEL[k]} 가중치</span><output id="o-${k}">${settings.weights[k]}</output></label>
      <input type="range" min="0" max="3" step="0.5" value="${settings.weights[k]}" data-w="${k}"></div>`).join('')}
    ${radius ? `<div class="f"><label><span>거점 반경</span><output id="o-r">${settings.radius_km}km</output></label><input type="range" min="0.5" max="3" step="0.5" value="${settings.radius_km}" id="radius"></div>` : ''}
    ${threshold ? `<div class="f"><label><span>거점에서 '먼' 기준</span><output id="o-t">${settings.threshold_km}km</output></label><input type="range" min="1" max="5" step="0.5" value="${settings.threshold_km}" id="threshold"></div>` : ''}
    <button class="btn btn-sm" id="reset-w">기본값</button>
  </div><p class="small muted" style="margin-top:8px">가중치·반경은 저장되어 모든 화면(수요·거점·확장)에 같이 적용돼요. 0으로 두면 그 지표를 빼고 계산합니다.</p></div>`;
}
function bindFilters(onChange) {
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(async () => { try { settings = (await api('/city/settings', { method: 'PUT', body: settings })).settings; onChange(); } catch (e) { toastErr(e); } }, 250); };
  $$('[data-w]').forEach(r => r.oninput = () => { settings.weights[r.dataset.w] = +r.value; $(`#o-${r.dataset.w}`).textContent = r.value; save(); });
  const rad = $('#radius'); if (rad) rad.oninput = () => { settings.radius_km = +rad.value; $('#o-r').textContent = rad.value + 'km'; save(); };
  const th = $('#threshold'); if (th) th.oninput = () => { settings.threshold_km = +th.value; $('#o-t').textContent = th.value + 'km'; save(); };
  $('#reset-w').onclick = () => { settings.weights = { night: 1, late: 1, hol: 1, sandan: 1 }; settings.radius_km = 1; settings.threshold_km = 2.5;
    $$('[data-w]').forEach(r => { r.value = 1; $(`#o-${r.dataset.w}`).textContent = 1; }); if (rad) { rad.value = 1; $('#o-r').textContent = '1km'; } if (th) { th.value = 2.5; $('#o-t').textContent = '2.5km'; } save(); };
}
function mapLegend(title, steps, lo, hi) {
  return `<div class="row small ink2" style="gap:6px;margin-top:8px;flex-wrap:wrap"><span>${esc(title)}</span><span>${esc(lo)}</span>
    <span style="display:inline-flex">${steps.map(c => `<i style="width:22px;height:10px;background:${c};display:inline-block"></i>`).join('')}</span><span>${esc(hi)}</span></div>`;
}
function scoreBar(parts, colors, total = 100) {
  return `<div class="score-bar" title="${parts.map((p, i) => `${p.label} ${p.v}`).join(' / ')}">${parts.map((p, i) => `<i style="width:${(p.v / total) * 100}%;background:${colors[i]}"></i>`).join('')}</div>`;
}

// ═══ 개요 ═══
async function overview(cb) {
  const [o, cov] = await Promise.all([api(`/city/overview?${qs()}`), api(`/city/coverage?${qs({ threshold: settings.threshold_km })}`)]);
  const sp = o.spaces;
  cb.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="k-label">지금 돌봄 중인 아이</div><div class="k-value">${o.present_now}</div><div class="k-sub">운영 시설 ${o.facilities.filter(f => f.bookable).length}곳 합계</div></div>
      <div class="kpi"><div class="k-label">오늘 예약</div><div class="k-value">${o.today_reservations}</div><div class="k-sub">취소 제외</div></div>
      <div class="kpi"><div class="k-label">정원이 차서 못 받은 예약</div><div class="k-value" style="color:${o.failures_7d ? 'var(--critical)' : 'inherit'}">${o.failures_7d}</div><div class="k-sub">최근 7일 · 교사 배치 근거</div></div>
      <div class="kpi"><div class="k-label">주민 수요 등록</div><div class="k-value">${o.registrations}</div><div class="k-sub">최근 30일 ${o.registrations_30d}건</div></div>
      <div class="kpi"><div class="k-label">돌봄방 공간 후보</div><div class="k-value">${Object.values(sp).reduce((a, b) => a + b, 0)}</div><div class="k-sub">확인 ${sp.site_visit || 0} · 적합 ${sp.suitable || 0} · 운영 ${sp.operating || 0}</div></div>
    </div>
    <div class="steps-bar">
      <a href="#/city/demand"><span class="sn">1 · 수요 찾기</span><b>밤·휴일 돌봄 수요가 큰 동</b><span class="small ink2">공백 1위 ${esc(o.top_gap[0]?.name || '')} (${o.top_gap[0]?.gap ?? ''})</span></a>
      <a href="#/city/hubs"><span class="sn">2 · 거점 위치</span><b>시립어린이집 후보 순위</b><span class="small ink2">지정안: ${o.plan.map(p => `${p.year} ${esc(p.name)}`).join(', ')}</span></a>
      <a href="#/city/expand" class="ext"><span class="sn">3 · 확장</span><b>먼 동네 돌봄방 후보</b><span class="small ink2">남는 공백 1위 ${esc(cov.dongs[0]?.name || '')}</span></a>
      <a href="#/city/ops"><span class="sn">4 · 운영</span><b>예약·알림, 이용 현황</b><span class="small ink2">운영 ${o.facilities.length}곳</span></a>
    </div>
    <div class="grid-2-1">
      <div class="card"><div class="card-title"><h3>남는 돌봄 공백 지도</h3><span class="card-sub">거점 지정안(${settings.threshold_km}km 안)으로 메워지지 않는 공백</span></div>
        <div class="map mid" id="map"></div>${mapLegend('남는 공백', SEQ_STEPS, '적음', '큼')}</div>
      <div class="stack">
        <div class="card"><h3>거점 지정안</h3>${o.plan.map(p => `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="map-pin plan" style="width:26px;height:26px;flex:none"><span>${p.slot}</span></span>
          <span class="grow"><b>${p.year}년 · ${esc(p.name)}</b><br><span class="small muted">${esc(p.memo || '')} ${p.updated_at ? '· ' + md(p.updated_at) : ''}</span></span></div>`).join('')}
          <a class="btn btn-sm" style="margin-top:10px" href="#/city/hubs">후보 비교·변경</a></div>
        <div class="card"><h3>거점에서 먼 수요 상위</h3><table class="t" style="margin-top:8px"><thead><tr><th>동</th><th class="r">남는 공백</th><th class="r">거점 거리</th></tr></thead>
          <tbody>${cov.dongs.slice(0, 6).map(d => `<tr><td>${esc(d.name)}</td><td class="r">${d.remaining_gap}</td><td class="r">${d.mean_km}km</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>
    <div class="card"><h3>이 화면이 하는 일</h3>
      <p class="ink2" style="margin-top:6px">시설 위치를 안내하는 것이 핵심이 아닙니다. <b>시가 어디에 공간과 사람을 둘지 정하는 근거</b>를 만듭니다:
      거점 2곳의 위치(공약 47 원문 기준 + 밤·휴일 출근 부모가 사는 곳), 거점의 시간대별 교사 배치, 거점이 닿지 않는 동과 그곳에서 쓸 수 있는 공간.
      운영이 시작되면 예약·정원 초과·미이용 기록과 주민 수요 등록이 2028년 추가 지정과 돌봄방 확대의 근거로 쌓입니다.</p></div>`;
  const L = window.L;
  const map = baseMap($('#map'));
  const by = Object.fromEntries(cov.dongs.map(d => [d.code, d]));
  const maxR = Math.max(1, ...cov.dongs.map(d => d.remaining_gap));
  await dongLayer(map, { labels: true, style: p => ({ fillColor: seqColor(by[p.code]?.remaining_gap || 0, maxR), fillOpacity: 0.62 }),
    tooltip: p => { const d = by[p.code]; return `<b>${esc(p.name)}</b><br>남는 공백 ${d?.remaining_gap ?? 0} · 공백 ${d?.gap ?? 0}<br>거점 ${settings.threshold_km}km 안 거주 비중 ${Math.round((d?.covered || 0) * 100)}%`; } });
  o.plan.forEach(p => {
    L.circle([p.lat, p.lon], { radius: settings.threshold_km * 1000, color: '#1d2a4a', weight: 1.5, dashArray: '5 5', fill: false }).addTo(map);
    L.marker([p.lat, p.lon], { icon: pin('plan', String(p.slot)) }).addTo(map).bindTooltip(`<b>${p.year} 거점 지정안</b><br>${esc(p.name)}`);
  });
  o.facilities.filter(f => f.kind === 'room').forEach(f => L.marker([f.lat, f.lon], { icon: pin('room', '돌') }).addTo(map).bindTooltip(`<b>${esc(f.name)}</b><br>${esc(f.status_label || '')}`));
}

// ═══ 1. 수요·공급 ═══
async function demand(cb) {
  cb.innerHTML = `${weightFilters()}
    <div class="grid-2">
      <div class="card"><div class="card-title"><h3>지도</h3><div class="seg" id="mode"><button data-m="gap" class="on">공백</button><button data-m="demand">수요</button><button data-m="supply">공급</button><button data-m="reg">주민 등록</button></div></div>
        <div class="map" id="map" style="height:560px"></div><div id="legend"></div></div>
      <div class="card"><div class="card-title"><h3>그림 1. 동별 밤·휴일 돌봄 수요와 공급 (공백 큰 순)</h3><span class="card-sub">지수: 안산시 안 최댓값 = 100</span></div>
        <div class="chart-box xl" style="height:640px"><canvas id="fig1" aria-label="동별 수요 지수와 공급 지수"></canvas></div>
        <p class="explain">수요는 큰데 늦은 시간 돌봄이 적은 동이 거점·돌봄방 우선 지역이 됩니다. 공백 = 수요 지수 − 공급 지수.</p></div>
    </div>
    <div class="card"><div class="card-title"><h3>동별 지표</h3><a class="btn btn-sm" id="csv">${icon('download', 14)} CSV</a></div>
      <div class="table-wrap" id="tbl"></div></div>`;
  let mode = 'gap', layer = null, rows = [];
  const map = baseMap($('#map'));
  async function load() {
    rows = (await api(`/city/dongs?${qs()}`)).dongs;
    drawChart(); drawTable(); await drawMap();
    $('#csv').href = `/api/city/export/dongs.csv?${qs()}`;
  }
  function drawChart() {
    mk('fig1', {
      type: 'bar',
      data: { labels: rows.map(r => r.name), datasets: [
        { label: '밤·휴일 돌봄 수요 지수', data: rows.map(r => r.demand), backgroundColor: series(2), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.9, categoryPercentage: 0.78 },
        { label: '늦은 시간 돌봄 공급 지수', data: rows.map(r => r.supply), backgroundColor: series(1), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.9, categoryPercentage: 0.78 }] },
      options: { indexAxis: 'y', plugins: { legend: { position: 'top', align: 'start' }, endLabels: { format: i => `공백 ${rows[i].gap}`, atMax: true },
        tooltip: { callbacks: { afterBody: items => { const r = rows[items[0].dataIndex]; return [`공백 ${r.gap}`, `야간 출근 ${num(r.night)} · 심야 귀가 ${num(r.late)}`, `휴일 출근 ${num(r.hol)} · 산단 통근 ${num(r.sandan)}`, `주민 수요 등록 ${r.registrations}건`]; } } } },
        scales: { x: axis({ min: 0, max: 118, ticks: { callback: v => v <= 100 ? v : '' } }), y: noGrid() }, layout: { padding: { right: 8 } } },
    });
  }
  function drawTable() {
    const cc = COMP_COLORS();
    $('#tbl').innerHTML = `<table class="t"><thead><tr><th>동</th><th>구</th>${COMP_KEYS.map(k => `<th class="r"><i class="sw-inline" style="background:${cc[k]}"></i>${COMP_LABEL[k]}</th>`).join('')}
      <th class="r">영유아</th><th class="r">초등</th><th class="r">수요</th><th class="r">공급</th><th class="r">공백</th><th class="r">주민 등록</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="muted">${esc(r.gu)}</td>${COMP_KEYS.map(k => `<td class="r">${num(r[k])}</td>`).join('')}
      <td class="r">${num(r.kids)}</td><td class="r">${num(r.elem)}</td><td class="r">${r.demand}</td><td class="r">${r.supply}</td>
      <td class="r"><b style="color:${r.gap > 0 ? 'var(--critical)' : 'var(--ink-2)'}">${r.gap}</b></td><td class="r">${r.registrations}</td></tr>`).join('')}</tbody></table>`;
  }
  async function drawMap() {
    layer?.remove();
    const by = Object.fromEntries(rows.map(r => [r.code, r]));
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.gap)));
    const maxReg = Math.max(1, ...rows.map(r => r.registrations));
    const col = r => mode === 'gap' ? divColor(r.gap, maxAbs) : mode === 'demand' ? seqColor(r.demand, 100) : mode === 'supply' ? seqColor(r.supply, 100) : seqColor(r.registrations, maxReg);
    layer = await dongLayer(map, { labels: !layer, style: p => ({ fillColor: by[p.code] ? col(by[p.code]) : '#ccc', fillOpacity: 0.7 }),
      tooltip: p => { const r = by[p.code]; return `<b>${esc(p.name)}</b><br>수요 ${r.demand} · 공급 ${r.supply} · <b>공백 ${r.gap}</b><br>주민 등록 ${r.registrations}건`; } });
    $('#legend').innerHTML = mode === 'gap' ? mapLegend('공백', DIV_STEPS, '공급 많음', '수요 많음') : mapLegend({ demand: '수요 지수', supply: '공급 지수', reg: '주민 수요 등록' }[mode], SEQ_STEPS, '낮음', '높음');
  }
  $('#mode').onclick = e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; $$('#mode button').forEach(x => x.classList.toggle('on', x === b)); drawMap(); };
  bindFilters(load);
  await load();
}

// ═══ 2. 거점 위치 ═══
async function hubs(cb) {
  cb.innerHTML = `${weightFilters({ radius: true })}
    <div class="grid-2-1">
      <div class="card"><div class="card-title"><h3>그림 2. 24시간 거점 후보 시립어린이집 순위</h3><span class="card-sub" id="r-sub"></span></div>
        <div class="chart-box lg" id="fig2-box"><canvas id="fig2" aria-label="후보 시립어린이집 점수"></canvas></div>
        <p class="explain">점수를 구성 요소별로 보여 줘서 야간 출근 때문인지 산단 통근 때문인지 설명합니다. 각 지표는 후보 중 최댓값 대비 비율(가중치 합 100점).</p></div>
      <div class="stack">
        <div class="card"><h3>시 기준과 데이터 기준 비교</h3><div id="cmp" class="small ink2" style="margin-top:6px"></div></div>
        <div class="card" id="flags"></div>
      </div>
    </div>
    <div class="grid-1-2 wide-only">
      <div class="card"><div class="card-title"><h3>후보 위치</h3><span class="card-sub">원 = 반경 안 수요</span></div><div class="map mid" id="map"></div></div>
      <div class="card"><div class="card-title"><h3>후보 표</h3><a class="btn btn-sm" id="csv">${icon('download', 14)} CSV</a></div><div class="table-wrap" id="tbl"></div>
        <p class="small muted" style="margin-top:8px">행을 누르면 아래에서 시간대별 예상 이용과 교사 배치를 봅니다. 시 기준 = 반경 안 인구(50) + 산단 대표 지점과의 가까움(50).</p></div>
    </div>
    <div class="card" id="fc"></div>`;
  let res = null, sel = null, plan = [], facilities = [];
  const L = window.L;
  const map = baseMap($('#map'));
  await dongLayer(map, { style: () => ({ fillOpacity: 0.04, opacity: 0.4 }), labels: true });
  const mlayer = L.layerGroup().addTo(map);

  async function load() {
    const [r, p, o] = await Promise.all([api(`/city/candidates?${qs({ radius: settings.radius_km })}`), api('/city/plan'), api(`/city/overview?${qs()}`)]);
    res = r; plan = p.plan; facilities = o.facilities.filter(f => f.kind === 'hub');
    sel = sel && res.candidates.find(c => c.id === sel.id) ? res.candidates.find(c => c.id === sel.id) : res.candidates[0];
    $('#r-sub').textContent = `반경 ${res.radius_km}km 수요 · 후보 ${res.candidates.length}곳`;
    $('#csv').href = `/api/city/export/candidates.csv?${qs({ radius: settings.radius_km })}`;
    drawFig2(); drawCmp(); drawFlags(); drawTable(); drawMap(); await drawForecast();
  }
  const label = c => `${c.name}(${c.dong_name})${c.plan_slot ? ` ★${2026 + c.plan_slot}` : ''}`;
  function drawFig2() {
    const cc = COMP_COLORS();
    const top = res.candidates.slice(0, 10);
    $('#fig2-box').style.height = `${Math.max(320, top.length * 40 + 80)}px`;
    mk('fig2', {
      type: 'bar',
      data: { labels: top.map(label), datasets: COMP_KEYS.map(k => ({ label: COMP_LABEL[k], data: top.map(c => c.points[k]), backgroundColor: cc[k], borderColor: css('--surface'), borderWidth: { right: 2 }, borderSkipped: false, barPercentage: 0.75 })) },
      options: { indexAxis: 'y', onClick: (_e, els) => { if (els[0]) { sel = top[els[0].index]; drawTable(); drawMap(); drawForecast(); } },
        plugins: { legend: { position: 'bottom' }, endLabels: { format: i => `${top[i].score}점` },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}점 (원값 ${num(top[c.dataIndex].raw[COMP_KEYS[c.datasetIndex]])}, z ${top[c.dataIndex].z[COMP_KEYS[c.datasetIndex]]})` } } },
        scales: { x: axis({ stacked: true, min: 0, max: 110, ticks: { callback: v => v <= 100 ? v : '' } }), y: noGrid({ stacked: true }) } },
    });
  }
  function drawCmp() {
    const top2d = res.candidates.slice(0, 2).map(c => c.name);
    const top2c = res.candidates.slice().sort((a, b) => a.city_rank - b.city_rank).slice(0, 2).map(c => c.name);
    const same = top2d.filter(x => top2c.includes(x));
    $('#cmp').innerHTML = `<p>순위 상관(스피어만) <b style="font-size:18px;color:var(--ink)">${res.spearman ?? '-'}</b> ${res.spearman >= 0.7 ? '— 두 기준이 대체로 같은 곳을 가리켜요.' : res.spearman >= 0.4 ? '— 일부 겹치지만 차이가 있어요.' : '— 두 기준이 다른 곳을 가리켜요.'}</p>
      <p style="margin-top:8px">데이터 기준 상위 2곳: <b>${top2d.map(esc).join(', ')}</b><br>시 기준(인구·공단 인근) 상위 2곳: <b>${top2c.map(esc).join(', ')}</b></p>
      <p style="margin-top:8px">${same.length === 2 ? '두 기준의 상위 2곳이 같아요. 지정 근거가 탄탄합니다.' : same.length === 1 ? `한 곳(${esc(same[0])})은 두 기준이 같고, 한 곳은 달라요. 다른 곳은 아래 표에서 이유(지표 구성)를 확인하세요.` : '상위 2곳이 서로 달라요. 원문 기준만으로는 밤·휴일 출근 부모가 놓칠 수 있습니다.'}</p>`;
  }
  function drawFlags() {
    $('#flags').innerHTML = `<h3>추가 지정 필요 지역</h3>
      ${res.flags.length ? `<p class="small ink2" style="margin:6px 0 8px">공백이 큰데 가까운 시립어린이집이 없는 동입니다. 2028년 추가 지정 때 다른 시설 유형(법인·직장 어린이집 협약 등)이나 확장 돌봄방으로 검토하세요.</p>
        ${res.flags.map(f => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b>${esc(f.name)}</b> <span class="chip crit">${icon('alert', 12)} 시립 없음</span></span><span class="small ink2">공백 ${f.gap} · 가장 가까운 시립 ${f.nearest_km}km</span></div>`).join('')}`
      : '<p class="small ink2" style="margin-top:6px">공백 상위 동마다 가까운 시립어린이집 후보가 있어요.</p>'}`;
  }
  function drawTable() {
    const cc = COMP_COLORS();
    $('#tbl').innerHTML = `<table class="t"><thead><tr><th class="r">순위</th><th>후보</th><th>점수 구성</th><th class="r">점수</th><th class="r">시 기준</th><th class="r">반경 안 영유아</th><th>지정안</th></tr></thead>
      <tbody>${res.candidates.map(c => `<tr class="click ${sel?.id === c.id ? 'sel' : ''}" data-id="${c.id}"><td class="r">${c.rank}</td><td class="nowrap"><b>${esc(c.name)}</b><br><span class="small muted">${esc(c.dong_name)} · 정원 ${c.capacity}</span></td>
        <td>${scoreBar(COMP_KEYS.map(k => ({ label: COMP_LABEL[k], v: c.points[k] })), COMP_KEYS.map(k => cc[k]))}</td><td class="r"><b>${c.score}</b></td>
        <td class="r nowrap">${c.city_rank}위 <span class="muted">(${c.city_score})</span></td><td class="r">${num(c.kids)}</td>
        <td>${c.plan_slot ? `<span class="chip blue">★ ${2026 + c.plan_slot}</span>` : ''}</td></tr>`).join('')}</tbody></table>`;
    $$('#tbl tr[data-id]').forEach(tr => tr.onclick = () => { sel = res.candidates.find(c => c.id === tr.dataset.id); drawTable(); drawMap(); drawForecast(); });
  }
  function drawMap() {
    mlayer.clearLayers();
    res.candidates.forEach(c => {
      L.circle([c.lat, c.lon], { radius: res.radius_km * 1000, color: sel?.id === c.id ? '#1d2a4a' : '#2a78d6', weight: sel?.id === c.id ? 2.5 : 1, fillOpacity: 0.04 + 0.22 * (c.score / 100) }).addTo(mlayer);
      L.marker([c.lat, c.lon], { icon: pin(c.plan_slot ? 'plan' : 'hub', String(c.rank)) }).addTo(mlayer)
        .bindTooltip(`<b>${c.rank}위 ${esc(c.name)}</b> (${esc(c.dong_name)})<br>점수 ${c.score} · 시 기준 ${c.city_rank}위`)
        .on('click', () => { sel = c; drawTable(); drawMap(); drawForecast(); });
    });
  }
  // 그림 3 + 교사 배치
  let fcState = { uptake: 3, staffing: null, per_teacher: 5, target: null };
  async function drawForecast() {
    const box = $('#fc');
    const opFac = facilities.find(f => f.dong === sel.dong && f.name.startsWith(sel.name));
    const target = fcState.target === 'fac' && opFac ? `facility_id=${opFac.id}` : `stcode=${sel.id}`;
    const q = new URLSearchParams({ radius: settings.radius_km, uptake: fcState.uptake, per_teacher: fcState.per_teacher });
    if (fcState.staffing) q.set('staffing', fcState.staffing.join(','));
    const f = await api(`/city/forecast?${target}&${q}`);
    fcState.staffing = f.staffing; fcState.per_teacher = f.per_teacher;
    const order = [...Array(24)].map((_, i) => (i + 7) % 24);
    const overWd = f.over.weekday, overHo = f.over.holiday;
    const fmtH = hs => hs.length ? hs.map(h => `${h}시`).join(', ') : '없음';
    const planSlot = sel.plan_slot;
    box.innerHTML = `
      <div class="card-title"><h3>그림 3. ${esc(sel.name)} 시간대별 예상 이용 아동 수</h3>
        <div class="row wrap">${opFac ? `<div class="seg" id="fct"><button data-t="cand" class="${fcState.target !== 'fac' ? 'on' : ''}">후보로 보기</button><button data-t="fac" class="${fcState.target === 'fac' ? 'on' : ''}">운영 중 배치표</button></div>` : ''}
          <button class="btn btn-sm btn-primary" id="plan1" ${planSlot === 1 ? 'disabled' : ''}>2027 거점으로 지정</button><button class="btn btn-sm" id="plan2" ${planSlot === 2 ? 'disabled' : ''}>2028 추가 지정</button></div></div>
      <div class="grid-2-1">
        <div><div class="chart-box"><canvas id="fig3" aria-label="평일 밤과 휴일 시간대별 예상 이용"></canvas></div>
          <p class="explain">반경 ${settings.radius_km}km 안 부모 세대가 맡기고 찾는 시각을 추정합니다. 평일 낮(07:30~19:30)은 정규 어린이집 시간이라 예측에서 뺍니다. 점선은 정원(근무 교사 × 교사 1인당 ${f.per_teacher}명).
          ${overWd.length ? `<b style="color:var(--critical)">평일 ${fmtH(overWd)}</b>에 정원을 넘어요 → 그 시간대 교사 배치·예약 상한을 조정하세요.` : '평일엔 정원 안에서 운영돼요.'}
          ${overHo.length ? ` 휴일은 <b style="color:var(--critical)">${fmtH(overHo)}</b>에 정원을 넘어요.` : ''}</p></div>
        <div class="stack">
          <div class="filters"><div class="f" style="min-width:100%"><label><span>이용 의향(부모 중 실제 이용 비율)</span><output>${fcState.uptake}%</output></label><input type="range" min="1" max="10" step="0.5" value="${fcState.uptake}" id="uptake"></div>
            <div class="f" style="min-width:100%"><label><span>교사 1인당 아동 수(혼합 연령 평균)</span><output>${f.per_teacher}명</output></label><input type="range" min="3" max="10" step="1" value="${f.per_teacher}" id="pt"></div></div>
          <div class="note small">반경 안 영유아 ${num(f.kids_in_radius)}명. 이용 의향은 가정값이며 시범 운영 기록으로 보정합니다.</div>
        </div>
      </div>
      <div style="margin-top:14px"><div class="row between wrap"><h4>교사 배치표 <span class="small muted">(칸을 누르면 0~4명 순환 · 07시부터)</span></h4>
        <span class="small ink2">하루 교사 시간 <b>${f.teacher_hours}h</b> · 예측에 맞춘 배치 <b>${f.suggested_teacher_hours}h</b> · 공약 기준 교사 3명 × 8h = 24h</span></div>
        <div class="staff-grid" style="margin-top:6px">${order.map(h => `<span class="h">${h}</span>`).join('')}${order.map(h => `<button data-h="${h}" class="${f.staffing[h] === 0 ? 'z' : ''} ${(overWd.includes(h) || overHo.includes(h)) ? 'over' : ''}" title="${h}시 근무 교사 ${f.staffing[h]}명 · 정원 ${f.capacity[h]}">${f.staffing[h]}</button>`).join('')}</div>
        <div class="row wrap" style="margin-top:10px"><button class="btn btn-sm" id="suggest">예측에 맞춘 배치안 적용</button>
          ${fcState.target === 'fac' && opFac ? `<button class="btn btn-sm btn-primary" id="savest">운영 시설에 저장 (예약 정원에 바로 반영)</button>` : ''}
          ${f.suggested_teacher_hours > 24 ? `<span class="small" style="color:var(--critical)">${icon('alert', 13)} 예측에 맞추려면 하루 ${f.suggested_teacher_hours}h가 필요해 공약 기준(3명)보다 ${f.suggested_teacher_hours - 24}h 많아요. 교대 인력·보조 인력(노인일자리 등) 검토가 필요합니다.</span>` : ''}</div>
      </div>`;
    const labels = order.map(h => `${h}시`);
    mk('fig3', {
      type: 'line',
      data: { labels, datasets: [
        { label: '평일', data: order.map(h => f.weekday.total[h]), borderColor: series(1), backgroundColor: series(1), borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6, tension: 0.25 },
        { label: '휴일', data: order.map(h => f.holiday.total[h]), borderColor: series(2), backgroundColor: series(2), borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6, tension: 0.25 }] },
      options: { interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'start' },
          refs: { items: [{ axis: 'xband', from: labels.indexOf('19시'), to: labels.indexOf('6시'), color: css('--s7'), alpha: 0.07, label: '정규 보육 이후(19:30~)' },
            { axis: 'yv', values: order.map(h => f.capacity[h]), color: css('--critical'), dash: [6, 4], label: '정원' }] },
          tooltip: { callbacks: { afterBody: it => { const h = order[it[0].dataIndex]; return [`정원 ${f.capacity[h]}명 (교사 ${f.staffing[h]}명)`, `평일 구성: 늦은 귀가 ${f.weekday.parts.late[h]} · 야간 출근 ${f.weekday.parts.night[h]} · 새벽 ${f.weekday.parts.early[h]}`]; } } } },
        scales: { x: noGrid(), y: axis({ beginAtZero: true, title: { display: true, text: '아동 수(명)', color: css('--muted') } }) } },
    });
    $('#uptake').oninput = e => { fcState.uptake = +e.target.value; e.target.previousElementSibling.querySelector('output').textContent = e.target.value + '%'; debounceFc(); };
    $('#pt').oninput = e => { fcState.per_teacher = +e.target.value; e.target.previousElementSibling.querySelector('output').textContent = e.target.value + '명'; debounceFc(); };
    $$('.staff-grid button').forEach(b => b.onclick = () => { const h = +b.dataset.h; fcState.staffing[h] = (fcState.staffing[h] + 1) % 5; drawForecast(); });
    $('#suggest').onclick = () => { fcState.staffing = f.suggested_staffing.slice(); drawForecast(); };
    $('#fct')?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; fcState.target = b.dataset.t === 'fac' ? 'fac' : null; fcState.staffing = null; drawForecast(); });
    $('#savest')?.addEventListener('click', async () => {
      try { await api(`/city/facilities/${opFac.id}/staffing`, { method: 'PUT', body: { staffing: fcState.staffing, per_teacher: fcState.per_teacher } }); toast('배치표를 저장했어요', '부모 예약 화면의 시간대별 정원에 바로 반영됩니다.'); }
      catch (e) { toastErr(e); }
    });
    const designate = slot => modal(`<h2>${2026 + slot}년 거점으로 지정</h2><p class="ink2 small" style="margin:6px 0 12px">${esc(sel.name)}(${esc(sel.dong_name)}) · 데이터 점수 ${sel.score} (${sel.rank}위) · 시 기준 ${sel.city_rank}위</p>
      <div class="field"><label>지정 근거 메모 (결정 기록에 남아요)</label><textarea id="memo">${esc(`데이터 ${sel.rank}위·시 기준 ${sel.city_rank}위, 반경 ${settings.radius_km}km 영유아 ${sel.kids}명`)}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>닫기</button><button class="btn btn-primary" id="ok">지정안 저장</button></div>`,
      (el, close) => { el.querySelector('#ok').onclick = async () => {
        try { await api('/city/plan', { method: 'PUT', body: { slot, stcode: sel.id, memo: el.querySelector('#memo').value } }); close(); toast('지정안을 저장했어요', '공백·확장 분석이 새 지정안 기준으로 바뀝니다.'); load(); }
        catch (e) { toastErr(e); } }; });
    $('#plan1').onclick = () => designate(1);
    $('#plan2').onclick = () => designate(2);
  }
  let fcT = null;
  const debounceFc = () => { clearTimeout(fcT); fcT = setTimeout(() => drawForecast().catch(toastErr), 250); };
  bindFilters(() => { fcState.staffing = null; load(); });
  await load();
}

// ═══ 3. 공백·확장 ═══
async function expand(cb) {
  cb.innerHTML = `${weightFilters({ threshold: true })}
    <div class="grid-2">
      <div class="card"><div class="card-title"><h3>거점에서 먼 수요 지역</h3><span class="card-sub">남는 공백 = 공백 × (거점 기준 거리 밖 거주 비중)</span></div>
        <div class="table-wrap" id="far"></div></div>
      <div class="card"><div class="card-title"><h3>지도</h3><div class="row"><button class="btn btn-sm" id="addmode">${icon('plus', 14)} 공간 후보 직접 추가</button></div></div>
        <div class="map tall" id="map"></div>${mapLegend('남는 공백', SEQ_STEPS, '적음', '큼')}
        <div class="legend-row" style="margin-top:6px"><span><i style="background:#1d2a4a"></i>거점 지정안</span><span><i style="background:#1baf7a"></i>운영 중 돌봄방</span><span><i style="background:#6250d6"></i>공간 후보</span></div></div>
    </div>
    <div class="card" id="fig4card"></div>
    <div class="card"><div class="card-title"><h3>그림 5. (확장) 늦은 시간 돌봄방 공간 후보 점수</h3>
      <div class="row wrap"><div class="seg" id="target"><button data-t="elem" class="on">1단계 · 초등학생</button><button data-t="kid">2단계 · 영유아(거점 연계)</button></div>
      <select id="kindf" style="width:auto;height:32px;padding:4px 8px;font-size:13px"><option value="">모든 종류</option>${Object.entries(SPACE_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <a class="btn btn-sm" id="csv">${icon('download', 14)} CSV</a></div></div>
      <div class="chart-box lg" id="fig5-box"><canvas id="fig5" aria-label="공간 후보 점수"></canvas></div>
      <p class="explain">수요(동의 남는 공백·주민 등록, 40) + 접근성(걸어서 10분=800m 안 아동 수, 30) + 시설 적합도(층·면적·안전, 30). 현장 확인 전 안전 점수는 공간 종류별 추정치입니다. 상위 후보를 소방·안전 기준, 건물주 협약 가능성으로 걸러 냅니다.</p>
      <div class="table-wrap" id="sp" style="margin-top:12px"></div></div>`;
  let cov = null, spaces = [], target = 'elem', kindF = '', selDong = null, addMode = false;
  const L = window.L;
  const map = baseMap($('#map'));
  let layer = null; const pins = L.layerGroup().addTo(map);
  map.on('click', e => { if (addMode) addSpace(e.latlng); });

  async function load() {
    const [c, s] = await Promise.all([api(`/city/coverage?${qs({ threshold: settings.threshold_km })}`), api(`/city/spaces?${qs({ threshold: settings.threshold_km, target })}`)]);
    cov = c; spaces = s.spaces;
    selDong = selDong && cov.dongs.find(d => d.code === selDong) ? selDong : cov.dongs[0].code;
    $('#csv').href = `/api/city/export/spaces.csv?${qs({ threshold: settings.threshold_km, target })}`;
    drawFar(); await drawMap(); await drawFig4(); drawFig5(); drawSpaces();
  }
  function drawFar() {
    $('#far').innerHTML = `<table class="t"><thead><tr><th>동</th><th class="r">공백</th><th class="r">거점 ${settings.threshold_km}km 안</th><th class="r">평균 거리</th><th class="r">남는 공백</th><th class="r">주민 등록</th></tr></thead>
      <tbody>${cov.dongs.filter(d => d.remaining_gap > 0).slice(0, 14).map(d => `<tr class="click ${d.code === selDong ? 'sel' : ''}" data-c="${d.code}"><td><b>${esc(d.name)}</b></td><td class="r">${d.gap}</td>
      <td class="r">${Math.round(d.covered * 100)}%</td><td class="r">${d.mean_km}km</td><td class="r"><b>${d.remaining_gap}</b></td><td class="r">${d.registrations}</td></tr>`).join('')}</tbody></table>`;
    $$('#far tr[data-c]').forEach(tr => tr.onclick = () => { selDong = tr.dataset.c; drawFar(); drawFig4(); });
  }
  async function drawMap() {
    layer?.remove(); pins.clearLayers();
    const by = Object.fromEntries(cov.dongs.map(d => [d.code, d]));
    const maxR = Math.max(1, ...cov.dongs.map(d => d.remaining_gap));
    layer = await dongLayer(map, { labels: !drawMap.done, style: p => ({ fillColor: seqColor(by[p.code]?.remaining_gap || 0, maxR), fillOpacity: 0.6 }),
      tooltip: p => { const d = by[p.code]; return `<b>${esc(p.name)}</b><br>남는 공백 ${d.remaining_gap} (공백 ${d.gap})<br>거점 ${settings.threshold_km}km 안 ${Math.round(d.covered * 100)}%`; },
      onClick: p => { if (addMode) return; selDong = p.code; drawFar(); drawFig4(); } });
    drawMap.done = true;
    cov.hubs.forEach(h => {
      L.circle([h.lat, h.lon], { radius: settings.threshold_km * 1000, color: '#1d2a4a', weight: 1.5, dashArray: '5 5', fill: false, interactive: false }).addTo(pins);
      L.marker([h.lat, h.lon], { icon: pin('plan', String(h.slot)) }).addTo(pins).bindTooltip(`<b>${2026 + h.slot} 거점 지정안</b><br>${esc(h.name)}`);
    });
    cov.rooms.forEach(r => L.marker([r.lat, r.lon], { icon: pin('room', '돌') }).addTo(pins).bindTooltip(`<b>${esc(r.name)}</b><br>운영 중`));
    spaces.filter(s => s.status !== 'operating').forEach((s, i) => L.marker([s.lat, s.lon], { icon: pin('space', '') }).addTo(pins)
      .bindTooltip(`<b>${esc(s.name)}</b><br>${esc(s.kind_label)} · ${s.total}점 · ${esc(SPACE_STATUS[s.status])}`).on('click', () => editSpace(s)));
  }
  async function drawFig4() {
    const p = await api(`/city/return-profile?dong=${selDong}`);
    const d = cov.dongs.find(x => x.code === selDong);
    $('#fig4card').innerHTML = `<div class="card-title"><h3>그림 4. 거점에서 먼 ${esc(p.name)}: 부모 세대(30~40대) 귀가 시각과 기존 돌봄 종료 시각</h3>
      <span class="chip ${p.after20_pct >= 40 ? 'crit' : 'warn'}">${icon('alert', 12)} 20시 이후 귀가 약 ${p.after20_pct}%</span></div>
      <div class="grid-2-1"><div class="chart-box"><canvas id="fig4" aria-label="귀가 시각 분포"></canvas></div>
      <div class="stack small ink2"><p><b style="color:var(--ink)">${esc(p.name)}</b> · 남는 공백 ${d?.remaining_gap ?? '-'} · 거점까지 평균 ${d?.mean_km ?? '-'}km · 주민 등록 ${d?.registrations ?? 0}건</p>
        <p>기존 돌봄 종료: 어린이집 기본보육 19:30 무렵, 늘봄학교 최대 20:00.</p>
        <p>기존 돌봄이 끝난 뒤에 귀가하는 부모 비중이 크면 확장 돌봄방이 필요한 근거가 됩니다. 운영 시간은 평일 18~22시·토요일을 기본으로 하고, 이 분포로 동별 조정합니다.</p></div></div>`;
    const labels = p.hours.map(h => `${h}시`);
    mk('fig4', {
      type: 'bar',
      data: { labels, datasets: [{ label: '30~40대 귀가 비중(%)', data: p.pct, backgroundColor: p.hours.map(h => (h >= 20 || h === 0) ? series(2) : series(1)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 46 }] },
      options: { plugins: { legend: { display: false },
        refs: { items: [{ axis: 'xband', from: 4, to: labels.length - 1, color: css('--critical'), alpha: 0.07 }, { axis: 'xv', value: 3.5, color: css('--critical'), dash: [5, 4], label: '기존 돌봄 종료 19:30~20:00' }] },
        tooltip: { callbacks: { label: c => `귀가 비중 ${c.raw}%` } } },
        scales: { x: noGrid(), y: axis({ beginAtZero: true, ticks: { callback: v => v + '%' } }) } },
    });
  }
  const visibleSpaces = () => spaces.filter(s => !kindF || s.kind === kindF);
  function drawFig5() {
    const top = visibleSpaces().filter(s => s.status !== 'unsuitable').slice(0, 10);
    $('#fig5-box').style.height = `${Math.max(280, top.length * 38 + 80)}px`;
    const cols = [series(1), series(2), series(3)];
    mk('fig5', {
      type: 'bar',
      data: { labels: top.map(s => `${s.name.length > 30 ? s.name.slice(0, 30) + '…' : s.name}`), datasets: [
        { label: '수요(동 공백)', data: top.map(s => s.scores.demand), backgroundColor: cols[0] },
        { label: `접근성(도보 10분 내 ${target === 'elem' ? '초등' : '영유아'} 수)`, data: top.map(s => s.scores.access), backgroundColor: cols[1] },
        { label: '시설 적합도(층·면적·안전)', data: top.map(s => s.scores.fit), backgroundColor: cols[2] }].map(d => ({ ...d, borderColor: css('--surface'), borderWidth: { right: 2 }, borderSkipped: false, barPercentage: 0.75 })) },
      options: { indexAxis: 'y', onClick: (_e, els) => { if (els[0]) editSpace(top[els[0].index]); },
        plugins: { legend: { position: 'bottom' }, endLabels: { format: i => `${top[i].total}점` },
          tooltip: { callbacks: { afterBody: it => { const s = top[it[0].dataIndex]; return [`${s.kind_label} · ${s.dong_name} · ${SPACE_STATUS[s.status]}`, `${s.floor ?? '?'}층 · ${s.area ?? '?'}㎡ · 도보 10분 내 ${num(s.kids_800m)}명`]; } } } },
        scales: { x: axis({ stacked: true, min: 0, max: 110, ticks: { callback: v => v <= 100 ? v : '' } }), y: noGrid({ stacked: true, ticks: { font: { size: 11.5 }, color: css('--ink-2') } }) } },
    });
  }
  let showAll = false;
  function drawSpaces() {
    const cols = [series(1), series(2), series(3)];
    const all = visibleSpaces();
    const list = showAll ? all : all.slice(0, 12);
    $('#sp').innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>공간</th><th>종류</th><th>동</th><th>상태</th><th>점수 구성</th><th class="r">총점</th><th class="r">층·면적</th><th class="r">도보10분 아동</th><th></th></tr></thead>
      <tbody>${list.map((s, i) => `<tr><td class="r">${i + 1}</td><td><b>${esc(s.name)}</b><div class="small muted clamp" title="${esc(s.source_note || '')}">${esc(s.source_note || '')}</div></td>
        <td class="nowrap"><span class="chip">${esc(s.kind_label)}</span><div class="small" style="color:${s.kind !== 'vacant_store' ? 'var(--good-ink)' : 'var(--muted)'}">${s.kind !== 'vacant_store' ? '임차료 절감' : '건물주 협약 필요'}</div></td>
        <td class="nowrap">${esc(s.dong_name)}</td><td class="nowrap"><span class="chip ${STATUS_CHIP[s.status]}">${esc(SPACE_STATUS[s.status])}</span></td>
        <td>${scoreBar([{ label: '수요', v: s.scores.demand }, { label: '접근성', v: s.scores.access }, { label: '적합도', v: s.scores.fit }], cols)}</td>
        <td class="r"><b>${s.total}</b></td><td class="r nowrap">${s.floor ?? '?'}층 · ${s.area ?? '?'}㎡${s.fit_detail.safety_estimated ? '<div class="small muted">안전 점수 추정</div>' : ''}</td>
        <td class="r">${num(s.kids_800m)}</td><td><button class="btn btn-sm" data-s="${s.id}">관리</button></td></tr>`).join('')}</tbody></table>
      ${all.length > 12 ? `<div style="padding:10px;text-align:center"><button class="btn btn-sm" id="more">${showAll ? '상위 12개만 보기' : `전체 ${all.length}개 보기`}</button></div>` : ''}`;
    $$('#sp [data-s]').forEach(b => b.onclick = () => editSpace(spaces.find(s => s.id === +b.dataset.s)));
    $('#more')?.addEventListener('click', () => { showAll = !showAll; drawSpaces(); });
  }
  function tri(key, val) {
    return `<span class="check-tri" data-k="${key}"><button type="button" class="y ${val === true ? 'on' : ''}" data-v="1">적합</button><button type="button" class="n ${val === false ? 'on' : ''}" data-v="0">부적합</button><button type="button" class="u ${val == null ? 'on' : ''}" data-v="">미확인</button></span>`;
  }
  function editSpace(s) {
    const checks = { ...s.checks };
    modal(`<h2>${esc(s.name)}</h2><p class="small ink2" style="margin:4px 0 12px">${esc(s.kind_label)} · ${esc(s.dong_name)} · 총점 ${s.total} (수요 ${s.scores.demand} / 접근성 ${s.scores.access} / 적합도 ${s.scores.fit})<br>${esc(s.source_note || '')}</p>
      <div class="field"><label>진행 상태</label><select id="st">${Object.entries(SPACE_STATUS).map(([k, v]) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="label" style="margin-bottom:6px">현장 확인</div>
      <div class="stack-sm" style="margin-bottom:14px">
        <div class="row between"><span class="small">소방 설비·피난 기준</span>${tri('fire', checks.fire)}</div>
        <div class="row between"><span class="small">비상구·안전(2방향 피난, 층)</span>${tri('exit', checks.exit)}</div>
        <div class="row between"><span class="small">보험 가입 가능</span>${tri('insurance', checks.insurance)}</div>
        <div class="row between"><span class="small">건물주·관리기관 협약 가능</span>${tri('owner', checks.owner)}</div></div>
      <div class="row"><div class="field grow"><label>층</label><input id="fl" type="number" value="${s.floor ?? ''}"></div><div class="field grow"><label>면적(㎡)</label><input id="ar" type="number" value="${s.area ?? ''}"></div>
        <div class="field grow"><label>엘리베이터</label><select id="el"><option value="">모름</option><option value="1" ${s.elevator === true ? 'selected' : ''}>있음</option><option value="0" ${s.elevator === false ? 'selected' : ''}>없음</option></select></div></div>
      <div class="field"><label>메모</label><textarea id="memo">${esc(s.memo || '')}</textarea></div>
      <p class="small muted" style="margin-bottom:12px">'운영 중'으로 바꾸면 늦은 시간 돌봄방(초등, 평일 18~22시·토요일)이 부모 화면에 열립니다. 소방·비상구·보험이 모두 적합이어야 해요.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>닫기</button><button class="btn btn-primary" id="save">저장</button></div>`,
      (el, close) => {
        el.querySelectorAll('.check-tri').forEach(t => t.onclick = e => { const b = e.target.closest('button'); if (!b) return;
          checks[t.dataset.k] = b.dataset.v === '' ? null : b.dataset.v === '1'; t.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
        el.querySelector('#save').onclick = async () => {
          const ev = el.querySelector('#el').value;
          try {
            const r = await api(`/city/spaces/${s.id}`, { method: 'PUT', body: { status: el.querySelector('#st').value, checks, memo: el.querySelector('#memo').value,
              floor: el.querySelector('#fl').value === '' ? null : +el.querySelector('#fl').value, area: el.querySelector('#ar').value === '' ? null : +el.querySelector('#ar').value, elevator: ev === '' ? null : ev === '1' } });
            close(); toast('저장했어요', el.querySelector('#st').value === 'operating' ? '돌봄방이 부모 화면에 열렸어요.' : ''); load();
          } catch (e) { toastErr(e); }
        };
      });
  }
  function addSpace(latlng) {
    addMode = false; $('#addmode').classList.remove('btn-primary'); $('#map').style.cursor = '';
    modal(`<h2>공간 후보 추가</h2><p class="small ink2" style="margin:4px 0 12px">위치 ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</p>
      <div class="field"><label>이름</label><input id="nm" placeholder="예: OO동 상가 1층 공실"></div>
      <div class="field"><label>종류</label><select id="kd">${Object.entries(SPACE_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="row"><div class="field grow"><label>층</label><input id="fl" type="number" value="1"></div><div class="field grow"><label>면적(㎡)</label><input id="ar" type="number" value="66"></div></div>
      <div class="field"><label>메모</label><textarea id="memo"></textarea></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-close>닫기</button><button class="btn btn-primary" id="ok">추가</button></div>`,
      (el, close) => { el.querySelector('#ok').onclick = async () => {
        try { await api('/city/spaces', { method: 'POST', body: { lat: latlng.lat, lon: latlng.lng, name: el.querySelector('#nm').value, kind: el.querySelector('#kd').value,
          floor: +el.querySelector('#fl').value, area: +el.querySelector('#ar').value, memo: el.querySelector('#memo').value } }); close(); toast('추가했어요'); load(); }
        catch (e) { toastErr(e); } }; });
  }
  $('#addmode').onclick = () => { addMode = !addMode; $('#addmode').classList.toggle('btn-primary', addMode); $('#map').style.cursor = addMode ? 'crosshair' : ''; if (addMode) toast('지도에서 위치를 눌러 주세요'); };
  $('#target').onclick = async e => { const b = e.target.closest('button'); if (!b) return; target = b.dataset.t; $$('#target button').forEach(x => x.classList.toggle('on', x === b)); await load(); };
  $('#kindf').onchange = e => { kindF = e.target.value; drawFig5(); drawSpaces(); };
  bindFilters(load);
  await load();
}

// ═══ 4. 운영 현황 ═══
async function ops(cb) {
  cb.innerHTML = `<div class="row between wrap"><div class="seg" id="days"><button data-d="7">최근 7일</button><button data-d="28" class="on">최근 4주</button><button data-d="90">최근 90일</button></div>
    <span class="small muted">시범 운영(가정) 기록 · 예약·입실·귀가는 실제로 이 서비스에서 처리한 데이터가 쌓입니다</span></div>
    <div id="facs" class="stack">${loadingHtml()}</div>
    <div class="grid-2"><div class="card"><div class="card-title"><h3>우리 동네에도 필요해요 · 동별 등록</h3><span class="card-sub" id="dem-sub"></span></div><div class="chart-box lg"><canvas id="dem"></canvas></div></div>
      <div class="card"><div class="card-title"><h3>필요한 시간대 · 아이 나이</h3></div><div class="chart-box sm"><canvas id="slots"></canvas></div><div class="chart-box sm" style="margin-top:12px"><canvas id="ages"></canvas></div></div></div>`;
  let days = 28;
  async function load() {
    const [u, d] = await Promise.all([api(`/city/usage?days=${days}`), api('/city/demand')]);
    $('#facs').innerHTML = u.facilities.map((f, i) => `
      <div class="card"><div class="card-title"><h3>${esc(f.facility.name)} <span class="chip ${f.facility.kind === 'hub' ? 'blue' : 'good'}">${esc(f.facility.kind_label)}</span></h3><span class="card-sub">${u.from} ~ ${u.to}</span></div>
        <div class="kpis" style="margin-bottom:14px">
          <div class="kpi"><div class="k-label">예약</div><div class="k-value">${num(f.total)}</div><div class="k-sub">이용 아동 ${f.children}명</div></div>
          <div class="kpi"><div class="k-label">이용 시간</div><div class="k-value">${num(f.child_hours)}h</div><div class="k-sub">${f.revenue ? `이용료 ${num(f.revenue)}원` : '시범 무료'}</div></div>
          <div class="kpi"><div class="k-label">평일 정원 대비 이용률</div><div class="k-value">${f.utilization ?? '-'}%</div><div class="k-sub">운영 시간 평균</div></div>
          <div class="kpi"><div class="k-label">미이용률</div><div class="k-value">${f.no_show_rate}%</div><div class="k-sub">취소 ${f.status.cancelled || 0}건</div></div>
          <div class="kpi"><div class="k-label">정원이 차서 못 받음</div><div class="k-value" style="color:${f.failures ? 'var(--critical)' : 'inherit'}">${f.failures}</div><div class="k-sub">추가 교사·추가 지정 근거</div></div>
        </div>
        <div class="grid-2">
          <div><h4>시간대별 평균 이용 아동 (평일) vs 정원</h4><div class="chart-box sm"><canvas id="pf${i}"></canvas></div></div>
          <div><h4>정원 초과로 못 받은 예약 · 시작 시각별</h4><div class="chart-box sm"><canvas id="ff${i}"></canvas></div></div>
          <div><h4>일별 예약</h4><div class="chart-box sm"><canvas id="df${i}"></canvas></div></div>
          <div><h4>이용 가정이 사는 동</h4>${homes(f.homes)}<p class="small muted" style="margin-top:6px">연령: ${Object.entries(f.ages).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</p></div>
        </div></div>`).join('') || '<div class="card empty">운영 중인 시설이 없어요.</div>';
    u.facilities.forEach((f, i) => {
      const hrs = f.facility.kind === 'hub' ? [...Array(24)].map((_, k) => (k + 7) % 24) : [16, 17, 18, 19, 20, 21];
      const capMax = Math.max(...hrs.map(h => f.capacity.weekday[h]));
      const labels = hrs.map(h => `${h}시`);
      mk(`pf${i}`, { type: 'bar', data: { labels, datasets: [{ label: '평균 이용 아동', data: hrs.map(h => f.profile.weekday[h]), backgroundColor: series(1), borderRadius: 3, borderSkipped: 'start' }] },
        options: { plugins: { legend: { display: false }, refs: { items: [{ axis: 'yv', values: hrs.map(h => f.capacity.weekday[h]), color: css('--critical'), label: '정원' }] } },
          scales: { x: noGrid({ ticks: { maxRotation: 0, autoSkip: true, color: css('--muted') } }), y: axis({ beginAtZero: true, suggestedMax: capMax + 1 }) } } });
      mk(`ff${i}`, { type: 'bar', data: { labels, datasets: [{ label: '못 받은 예약', data: hrs.map(h => f.failures_by_hour[h]), backgroundColor: css('--critical'), borderRadius: 3, borderSkipped: 'start' }] },
        options: { plugins: { legend: { display: false } }, scales: { x: noGrid({ ticks: { maxRotation: 0, autoSkip: true, color: css('--muted') } }), y: axis({ beginAtZero: true, ticks: { precision: 0, color: css('--muted') } }) } } });
      mk(`df${i}`, { type: 'bar', data: { labels: f.daily.map(x => x.date.slice(5)), datasets: [{ label: '예약', data: f.daily.map(x => x.n), backgroundColor: series(1), borderRadius: 2, borderSkipped: 'start' }] },
        options: { plugins: { legend: { display: false } }, scales: { x: noGrid({ ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, color: css('--muted') } }), y: axis({ beginAtZero: true }) } } });
    });
    $('#dem-sub').textContent = `총 ${d.total}건`;
    const top = d.by_dong.slice(0, 15);
    const ageCols = { elem: series(1), preschool: series(2), infant: series(3) };
    mk('dem', { type: 'bar', data: { labels: top.map(r => r.name), datasets: ['elem', 'preschool', 'infant'].map(a => ({ label: d.age_labels[a], data: top.map(r => r.age[a] || 0), backgroundColor: ageCols[a], borderColor: css('--surface'), borderWidth: { right: 2 }, borderSkipped: false })) },
      options: { indexAxis: 'y', plugins: { legend: { position: 'bottom' }, endLabels: { format: i => String(top[i].total) } }, scales: { x: axis({ stacked: true, beginAtZero: true }), y: noGrid({ stacked: true }) } } });
    const sk = Object.keys(d.slot_labels);
    mk('slots', { type: 'bar', data: { labels: sk.map(k => d.slot_labels[k]), datasets: [{ label: '등록 수', data: sk.map(k => d.slots[k] || 0), backgroundColor: series(1), borderRadius: 4, borderSkipped: 'start' }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, endLabels: { format: i => String(d.slots[sk[i]] || 0) } }, scales: { x: axis({ beginAtZero: true }), y: noGrid() } } });
    const ak = ['elem', 'preschool', 'infant'];
    mk('ages', { type: 'bar', data: { labels: ak.map(k => d.age_labels[k]), datasets: [{ label: '등록 수', data: ak.map(k => d.ages[k] || 0), backgroundColor: ak.map(k => ageCols[k]), borderRadius: 4, borderSkipped: 'start' }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, endLabels: { format: i => String(d.ages[ak[i]] || 0) } }, scales: { x: axis({ beginAtZero: true }), y: noGrid() } } });
  }
  const homes = list => { const m = Math.max(1, ...list.map(x => x[1])); return list.map(([n, c]) => `<div style="display:grid;grid-template-columns:70px 1fr 40px;gap:8px;align-items:center;margin:5px 0"><span class="small">${esc(n)}</span>
    <div style="height:10px;border-radius:0 4px 4px 0;background:${series(1)};width:${(c / m) * 100}%"></div><span class="small num ink2" style="text-align:right">${c}</span></div>`).join(''); };
  $('#days').onclick = e => { const b = e.target.closest('button'); if (!b) return; days = +b.dataset.d; $$('#days button').forEach(x => x.classList.toggle('on', x === b)); load().catch(toastErr); };
  await load();
}

// ═══ 결정 기록 ═══
async function log(cb) {
  const { audit } = await api('/city/audit');
  const ACT = { hub_plan: '거점 지정안', space_update: '공간 상태', space_add: '공간 추가', staffing: '교사 배치표', settings: '분석 설정', recompute: '데이터 재계산' };
  const desc = a => {
    const d = a.detail;
    if (a.action === 'hub_plan') return `${2026 + d.slot}년 거점 → ${esc(d.name)} ${d.memo ? `<br><span class="muted">${esc(d.memo)}</span>` : ''}`;
    if (a.action === 'space_update') return `${esc(d.name)} → ${esc(SPACE_STATUS[d.status] || d.status)}`;
    if (a.action === 'space_add') return esc(d.name);
    if (a.action === 'staffing') return `${esc(d.facility)} · 하루 ${d.staffing.reduce((x, y) => x + y, 0)}h · 1인당 ${d.per_teacher}명`;
    if (a.action === 'settings') return `가중치 ${Object.entries(d.weights).map(([k, v]) => `${COMP_LABEL[k]} ${v}`).join(', ')} · 반경 ${d.radius_km}km · 먼 기준 ${d.threshold_km}km`;
    return esc(JSON.stringify(d));
  };
  cb.innerHTML = `<div class="card"><p class="small ink2" style="margin-bottom:10px">누가 언제 어떤 근거로 거점·공간·배치를 바꿨는지 남깁니다. 위원회 보고나 2028년 추가 지정 때 근거 자료로 씁니다.</p>
    ${audit.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>시각</th><th>담당</th><th>항목</th><th>내용</th></tr></thead><tbody>
    ${audit.map(a => `<tr><td class="num small">${md(a.created_at)} ${hhmm(a.created_at)}</td><td class="small">${esc(a.user_name || '')}</td><td><span class="chip">${esc(ACT[a.action] || a.action)}</span></td><td class="small">${desc(a)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">아직 기록이 없어요. 거점 지정안이나 공간 상태를 바꾸면 여기에 남아요.</div>'}</div>`;
}
