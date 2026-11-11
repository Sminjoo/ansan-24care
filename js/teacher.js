// 돌봄교사 화면 (태블릿)
import { $, $$, api, state, esc, icon, toast, toastErr, modal, onEvent, onCleanup, hhmm, md, whenRange, isoDate, ago, loadingHtml, toggleTheme } from './core.js';
import { chart, axis, noGrid, css, series, alpha } from './charts.js';

let day = null;

function head(app, f, extra = '') {
  app.innerHTML = `
  <div class="t-shell">
    <header class="t-head">
      <div class="grow"><h1>${esc(f?.name || '돌봄교사')}</h1><div>${esc(state.user.name)} · ${esc(f?.hours_text || '')}</div></div>
      ${extra}
      <a class="btn btn-sm" href="#/teacher">${icon('list', 16)} 명단</a>
      <a class="btn btn-sm" href="#/teacher/messages">${icon('chat', 16)} 메시지 <span id="mcount"></span></a>
      <button class="icon-btn" id="theme" title="화면 밝기 전환" style="color:#fff">${icon('moon')}</button>
      <button class="icon-btn" id="out" title="로그아웃" style="color:#fff">${icon('logout')}</button>
    </header>
    <main class="t-body" id="tb">${loadingHtml()}</main>
  </div>`;
  $('#theme').onclick = toggleTheme;
  $('#out').onclick = () => window.dispatchEvent(new Event('care:logout'));
  onEvent(m => {
    if (m.type === 'notification') toast(m.data.title, m.data.body, { link: m.data.link });
  });
  return $('#tb');
}

export async function renderTeacher(app, seg) {
  const f = state.user.facility;
  if (seg[0] === 'messages') return seg[1] ? thread(app, f, +seg[1]) : threads(app, f);
  return roster(app, f);
}

async function roster(app, f) {
  day = day || isoDate(new Date());
  const tb = head(app, f, `<div class="row"><button class="btn btn-sm" id="prev">${icon('back', 14)}</button>
    <input type="date" id="day" value="${day}" style="width:150px;height:32px;padding:4px 8px;background:transparent;color:#fff;border-color:rgba(255,255,255,.3)">
    <button class="btn btn-sm" id="today">오늘</button></div>`);
  let occChart = null;

  const draw = async () => {
    const r = await api(`/teacher/roster?date=${day}`);
    const now = new Date();
    const by = s => r.reservations.filter(x => x.status === s);
    const inside = by('checked_in');
    const coming = by('booked').sort((a, b) => a.start_at.localeCompare(b.start_at));
    const done = by('checked_out');
    const noshow = by('no_show');
    const isToday = day === isoDate(now);
    const curSlot = r.slots.find(s => { const t = new Date(s.start + ':00'); return t <= now && now < new Date(t.getTime() + 3600e3); });
    tb.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="k-label">지금 돌보는 아이</div><div class="k-value">${inside.length}${curSlot ? `<span class="muted" style="font-size:16px"> / 정원 ${curSlot.cap}</span>` : ''}</div><div class="k-sub">${isToday ? '현재 시각 기준' : md(day)}</div></div>
        <div class="kpi"><div class="k-label">올 아이</div><div class="k-value">${coming.length}</div><div class="k-sub">${coming[0] ? `다음 ${hhmm(coming[0].start_at)} ${esc(coming[0].child_name)}` : '남은 예약 없음'}</div></div>
        <div class="kpi"><div class="k-label">귀가 완료</div><div class="k-value">${done.length}</div><div class="k-sub">귀가 확인 코드로 인계</div></div>
        <div class="kpi"><div class="k-label">미이용</div><div class="k-value">${noshow.length}</div><div class="k-sub">시작 1시간 뒤 자동 처리</div></div>
      </div>
      <div class="card"><div class="card-title"><h3>시간대별 예약 인원과 정원</h3><span class="card-sub">${f.kind === 'hub' ? '07시~다음 날 07시 · 정원 = 근무 교사 수 × 교사 1인당 아동 수(시가 설정)' : '운영 시간'}</span></div>
        <div class="chart-box sm"><canvas id="occ" aria-label="시간대별 예약 인원과 정원"></canvas></div></div>
      ${group('지금 돌보는 아이', inside, 'in')}
      ${group('올 아이', coming, 'coming')}
      ${group('귀가 완료', done, 'done')}
      ${noshow.length ? group('미이용', noshow, 'done') : ''}`;
    const labels = r.slots.map(s => `${s.hour}시`);
    occChart?.destroy?.();
    occChart = chart($('#occ'), {
      type: 'bar',
      data: { labels, datasets: [{ label: '예약 인원', data: r.slots.map(s => s.booked), backgroundColor: r.slots.map(s => s.booked > s.cap ? css('--critical') : series(1)),
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 }] },
      options: { plugins: { legend: { display: false }, refs: { items: [{ axis: 'yv', values: r.slots.map(s => s.cap), color: css('--ink-2'), dash: [5, 4], label: '정원' }] },
        tooltip: { callbacks: { afterLabel: c => `정원 ${r.slots[c.dataIndex].cap}명 · 남은 자리 ${r.slots[c.dataIndex].left}` } } },
        scales: { x: noGrid(), y: axis({ beginAtZero: true, ticks: { precision: 0, color: css('--muted') }, suggestedMax: Math.max(...r.slots.map(s => s.cap)) + 1 }) } },
    });
    $$('[data-in]').forEach(b => b.onclick = () => doCheckin(+b.dataset.in, b.dataset.name));
    $$('[data-out]').forEach(b => b.onclick = () => doCheckout(+b.dataset.out, b.dataset.name));
    $$('[data-msg]').forEach(b => b.onclick = () => openThread(+b.dataset.msg));
  };

  function group(title, list, kind) {
    return `<section class="stack-sm"><div class="group-title">${esc(title)} <span class="chip">${list.length}</span></div>
      ${list.length ? list.map(r => row(r, kind)).join('') : `<div class="kid-row dim"><span class="muted">없음</span></div>`}</section>`;
  }
  function row(r, kind) {
    const late = kind === 'coming' && new Date(r.start_at + ':00') < new Date();
    const overdue = kind === 'in' && new Date(r.end_at + ':00') < new Date();
    return `<div class="kid-row ${kind === 'done' ? 'dim' : ''}">
      <div><div class="kn">${esc(r.child_name)} <span class="chip">${esc(r.child_age || '')}</span>
        ${late ? `<span class="chip warn">${icon('clock', 12)} 도착 전</span>` : ''}${overdue ? `<span class="chip crit">${icon('alert', 12)} 귀가 시간 지남</span>` : ''}</div>
        <div class="km">${whenRange(r.start_at, r.end_at)} · 보호자 ${esc(r.parent_name)} ${r.parent_phone ? `<a href="tel:${esc(r.parent_phone)}">${esc(r.parent_phone)}</a>` : ''}${r.parent_dong_name ? ' · ' + esc(r.parent_dong_name) : ''}</div>
        ${r.child_notes ? `<div class="alert">${icon('alert', 13)} ${esc(r.child_notes)}</div>` : ''}
        ${r.note ? `<div class="km">${icon('chat', 13)} “${esc(r.note)}”</div>` : ''}
        ${kind === 'done' ? `<div class="km muted">${r.checkin_at ? `입실 ${hhmm(r.checkin_at)}` : ''}${r.checkout_at ? ` · 귀가 ${hhmm(r.checkout_at)}` : ''}${r.checkout_note ? ` · ${esc(r.checkout_note)}` : ''}</div>` : ''}
        ${kind === 'in' && r.checkin_at ? `<div class="km muted">입실 ${hhmm(r.checkin_at)}</div>` : ''}
      </div>
      <div class="row">
        <button class="btn btn-sm" data-msg="${r.parent_id}" title="보호자에게 메시지">${icon('chat', 16)}</button>
        ${kind === 'coming' ? `<button class="btn btn-primary" data-in="${r.id}" data-name="${esc(r.child_name)}">${icon('door', 16)} 입실</button>` : ''}
        ${kind === 'in' ? `<button class="btn btn-primary" data-out="${r.id}" data-name="${esc(r.child_name)}">${icon('check', 16)} 귀가</button>` : ''}
      </div></div>`;
  }
  async function doCheckin(id, name) {
    try { await api(`/teacher/reservations/${id}/checkin`, { method: 'POST' }); toast(`${name} 입실`, '보호자에게 입실 알림을 보냈어요.'); draw(); } catch (e) { toastErr(e); }
  }
  function doCheckout(id, name) {
    modal(`<h2>${esc(name)} 귀가 인계</h2><p class="ink2 small" style="margin:6px 0 14px">데리러 온 분에게 <b>귀가 확인 코드 4자리</b>를 받아 입력하세요.</p>
      <form id="co"><input class="big-code" id="code" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="····">
      <details style="margin-top:12px"><summary class="small ink2" style="cursor:pointer">코드를 모르는 경우</summary>
        <div class="field" style="margin-top:8px"><label>보호자 확인 방법 (기록에 남아요)</label><input id="ov" placeholder="예: 등록 보호자 본인 신분증 확인 + 전화 확인"></div></details>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-close>닫기</button><button class="btn btn-primary">인계 완료</button></div></form>`,
      (el, close) => {
        el.querySelector('#co').onsubmit = async e => {
          e.preventDefault();
          try {
            await api(`/teacher/reservations/${id}/checkout`, { method: 'POST', body: { code: el.querySelector('#code').value, override: el.querySelector('#ov').value } });
            close(); toast(`${name} 귀가 완료`, '보호자에게 귀가 알림을 보냈어요.'); draw();
          } catch (err) {
            toastErr(err);
            if (err.code === 'code') el.querySelector('details').open = true;
          }
        };
      });
  }
  async function openThread(parentId) {
    const { threads: ts } = await api('/threads');
    const t = ts.find(x => x.parent_id === parentId);
    if (t) location.hash = `#/teacher/messages/${t.id}`;
    else toast('아직 이 보호자와 대화가 없어요', '보호자가 먼저 메시지를 보내면 대화가 열려요.');
  }

  $('#day').onchange = e => { day = e.target.value; draw().catch(toastErr); };
  $('#prev').onclick = () => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() - 1); day = isoDate(d); $('#day').value = day; draw().catch(toastErr); };
  $('#today').onclick = () => { day = isoDate(new Date()); $('#day').value = day; draw().catch(toastErr); };
  onEvent(m => { if (m.type === 'roster') draw().catch(() => {}); });
  const timer = setInterval(() => draw().catch(() => {}), 60000);
  onCleanup(() => clearInterval(timer));
  updateMsgCount();
  await draw();
}

async function updateMsgCount() {
  try {
    const { threads: ts } = await api('/threads');
    const n = ts.reduce((a, t) => a + t.unread, 0);
    const el = $('#mcount'); if (el) el.innerHTML = n ? `<span class="chip crit" style="height:18px">${n}</span>` : '';
  } catch { /* */ }
}

async function threads(app, f) {
  const tb = head(app, f);
  const draw = async () => {
    const { threads: ts } = await api('/threads');
    tb.innerHTML = `<div class="card" style="padding:4px 16px">${ts.length ? ts.map(t => `<a class="row between" style="padding:12px 0;border-bottom:1px solid var(--line);color:inherit" href="#/teacher/messages/${t.id}">
      <span class="grow"><b>${esc(t.parent_name)} 보호자</b><br><span class="small ink2">${esc(t.last_body || '')}</span></span>
      <span style="text-align:right">${t.last_at ? `<span class="small muted">${ago(t.last_at)}</span><br>` : ''}${t.unread ? `<span class="chip crit">${t.unread}</span>` : ''}</span></a>`).join('') : '<div class="empty">아직 대화가 없어요.</div>'}</div>`;
    updateMsgCount();
  };
  onEvent(m => { if (m.type === 'message') draw().catch(() => {}); });
  await draw();
}

async function thread(app, f, tid) {
  const tb = head(app, f);
  const draw = async () => {
    const { thread: th, messages } = await api(`/threads/${tid}`);
    tb.innerHTML = `<div class="card" style="max-width:720px"><div class="card-title"><h3>${esc(th.parent_name)} 보호자</h3><a class="small" href="#/teacher/messages">목록</a></div>
      <div class="chat">${messages.map(m => `<div class="bubble ${m.sender_role === 'teacher' ? 'me' : ''}">${esc(m.body)}<div class="bt">${esc(m.sender_name)} · ${ago(m.created_at)}</div></div>`).join('') || '<div class="empty">메시지가 없어요.</div>'}</div>
      <form class="row" id="cf" style="margin-top:12px"><input id="ci" placeholder="메시지 입력" maxlength="1000" autocomplete="off"><button class="btn btn-primary">보내기</button></form></div>`;
    $('#cf').onsubmit = async e => {
      e.preventDefault(); const v = $('#ci').value.trim(); if (!v) return;
      try { await api(`/threads/${tid}/messages`, { method: 'POST', body: { body: v } }); await draw(); $('#ci').focus(); } catch (err) { toastErr(err); }
    };
    updateMsgCount();
  };
  onEvent(m => { if (m.type === 'message' && m.data.thread_id === tid) draw().catch(() => {}); });
  await draw();
}
