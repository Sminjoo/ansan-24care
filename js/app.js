import { $, api, state, esc, icon, toast, toastErr, runCleanups, connectEvents, disconnectEvents, loadDongs, dongOptions, virtualFlag, toggleTheme } from './core.js';
import { renderParent } from './parent.js';
import { renderTeacher } from './teacher.js';
import { renderCity } from './city.js';

const HOME = { parent: '#/parent', teacher: '#/teacher', city: '#/city' };
const DEMO = [
  { u: 'parent1', role: '부모', name: '정다은', desc: '원곡동 · 만 4세, 초2 자녀 · 거점 센터 이용' },
  { u: 'parent2', role: '부모', name: '한지훈', desc: '거점에서 먼 동 · 초3 자녀 · 돌봄방 이용' },
  { u: 'parent3', role: '부모', name: '오수빈', desc: '선부2동 · 19개월 자녀' },
  { u: 'teacher1', role: '돌봄교사', name: '김보람', desc: '24시간 거점 센터(1)' },
  { u: 'teacher3', role: '돌봄교사', name: '박민지', desc: '늦은 시간 돌봄방' },
  { u: 'city', role: '시 담당자', name: '여성보육과', desc: '거점 위치·확장 후보·운영 현황' },
];

async function boot() {
  try {
    const [me, about] = await Promise.all([api('/me'), api('/about')]);
    state.user = me.user; state.about = about;
    await loadDongs();
  } catch (e) {
    $('#app').innerHTML = `<div class="loading">${esc(e.message)}</div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('care:logout', logout);
  route();
}

let lastRole = null;
async function route() {
  runCleanups();
  window.scrollTo(0, 0);
  const hash = location.hash || '#/';
  const seg = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const u = state.user;
  if (u) connectEvents(); else disconnectEvents();
  if (u?.role !== lastRole) { lastRole = u?.role; }
  const app = $('#app');
  if (!seg.length) return renderLanding(app);
  if (seg[0] === 'login') return renderLogin(app, seg[1]);
  if (seg[0] === 'register') return renderRegister(app);
  if (!u) { location.hash = '#/login'; return; }
  if (!HOME[seg[0]] || u.role !== seg[0]) { location.hash = HOME[u.role]; return; }
  try {
    if (seg[0] === 'parent') return await renderParent(app, seg.slice(1));
    if (seg[0] === 'teacher') return await renderTeacher(app, seg.slice(1));
    if (seg[0] === 'city') return await renderCity(app, seg.slice(1));
  } catch (e) {
    console.error(e);
    toastErr(e);
  }
}

async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch { /* */ }
  state.user = null;
  disconnectEvents();
  location.hash = '#/';
}

async function doLogin(username, password) {
  const r = await api('/login', { method: 'POST', body: { username, password } });
  state.user = r.user;
  location.hash = HOME[r.user.role];
}

function renderLanding(app) {
  const u = state.user;
  app.innerHTML = `
  <div class="landing">
    <section class="l-hero">
      <div class="l-wrap">
        <div class="l-top">
          <div class="brand"><span class="brand-mark">${icon('moon', 18)}</span> 안산 24시간 돌봄</div>
          <div class="row">
            <button class="icon-btn" id="theme" title="화면 밝기 전환" style="color:#fff">${icon('sun')}</button>
            ${u ? `<a class="btn btn-sm" style="background:#fff;color:#142040;border:0" href="${HOME[u.role]}">${esc(u.name)} · 내 화면</a>`
              : `<a class="btn btn-sm" style="background:#fff;color:#142040;border:0" href="#/login">로그인</a>`}
          </div>
        </div>
        ${virtualFlag('시연용 · 수치와 시설은 모두 가상 데이터')}
        <h1 style="margin-top:14px">밤·휴일에도,<br>필요한 부모 가까이에.</h1>
        <p class="lead">밤과 휴일에 일하는 부모가 사는 곳 가까이에 <b>24시간 거점 보육센터</b>를 두고, 거점에서 먼 동네는 <b>공실·유휴공간 돌봄방</b>으로 메웁니다.
        부모는 가까운 곳을 찾아 예약하고 아이의 입실·귀가 알림을 받고, 시는 어디에 공간과 사람을 둘지 데이터로 정합니다.</p>
      </div>
    </section>
    <div class="l-wrap" style="padding:0 16px">
      <div class="roles">
        <div class="role-card">
          <div class="ico">${icon('child', 22)}</div>
          <h3>부모(엄마·아빠 모두)</h3>
          <ul><li>가까운 거점 센터·돌봄방과 오늘 남은 자리</li><li>예약(거점 시간당 3천 원)과 귀가 확인 코드</li><li>입실·귀가 알림, 돌봄교사와 메시지</li><li>"우리 동네에도 필요해요" 수요 등록</li></ul>
          <button class="btn btn-primary" data-demo="parent1">부모 화면 체험</button>
        </div>
        <div class="role-card">
          <div class="ico">${icon('check', 22)}</div>
          <h3>돌봄교사</h3>
          <ul><li>오늘 아이 명단과 시간대별 인원·정원</li><li>입실 확인, 귀가 확인 코드로 인계</li><li>알레르기·투약 등 주의사항</li><li>보호자 메시지</li></ul>
          <button class="btn btn-primary" data-demo="teacher1">돌봄교사 화면 체험</button>
        </div>
        <div class="role-card">
          <div class="ico">${icon('chart', 22)}</div>
          <h3>안산시 담당자</h3>
          <ul><li>동별 밤·휴일 돌봄 수요와 공급, 공백</li><li>거점 후보 시립어린이집 순위와 시간대별 예상 이용</li><li>거점에서 먼 동의 공실·유휴공간 후보 점수</li><li>운영 현황, 정원 초과로 못 받은 예약, 수요 등록</li></ul>
          <button class="btn btn-primary" data-demo="city">시 담당자 화면 체험</button>
        </div>
      </div>
    </div>
    <section class="l-section">
      <h2>흐름</h2>
      <div class="flow">
        <div class="step"><h3>밤·휴일 돌봄 수요가 큰 동 찾기</h3><p class="small ink2">20~40대의 야간 출근·심야 귀가·휴일 출근, 산단 통근 거주를 동별로 집계합니다.</p></div>
        <div class="step"><h3>거점 센터 위치 제안</h3><p class="small ink2">시립어린이집마다 반경 1km 수요를 합쳐 순위를 내고, 시간대별 예상 이용으로 교사 배치를 설계합니다.</p></div>
        <div class="step ext"><h3>(확장) 먼 동네에 돌봄방</h3><p class="small ink2">거점에서 먼 수요 지역의 상가 공실·공공 유휴공간·문 닫은 어린이집을 점수화합니다.</p></div>
        <div class="step"><h3>예약·알림과 이용 현황</h3><p class="small ink2">부모 예약·알림, 교사 출석·귀가 확인, 시 이용 현황. 기록은 2028년 추가 지정의 근거가 됩니다.</p></div>
      </div>
    </section>
    <section class="l-section">
      <h2>"검색하면 되는 것" 아닌가요?</h2>
      <div class="compare">
        <div class="a"><h3>시설 위치 안내 (검색으로 충분)</h3>
          <ul class="ink2"><li>이미 있는 어린이집·돌봄센터를 지도에 보여 줌</li><li>문 닫은 뒤(19:30 이후)의 빈틈은 그대로</li><li>어디에 무엇을 더 둘지는 알려 주지 않음</li></ul></div>
        <div class="b"><h3>이 서비스의 핵심</h3>
          <ul><li><b>시가 어디에 공간과 사람을 둘지 정하는 근거</b>를 만듦</li><li>거점 2곳의 위치, 밤 몇 시에 교사가 더 필요한지, 거점이 닿지 않는 동과 그곳의 쓸 수 있는 공간</li>
          <li>예약·대기·정원 초과 기록과 주민 수요 등록이 다음 결정(2028년 추가 지정, 돌봄방 확대)으로 이어짐</li></ul></div>
      </div>
    </section>
    <section class="l-section">
      <h2>근거 공약과 운영 틀</h2>
      <div class="grid-2">
        <div class="card flat"><h3>공약 47 · 거점형 시간제 보육센터</h3>
          <p class="small ink2" style="margin-top:6px">운영 중인 시립어린이집을 거점으로 지정(새로 짓지 않음). 6개월~7세, 07:30~다음 날 07:30, 평일·휴일. 개소당 보육교사 3명, 이용료 시간당 3천 원. 2027년 1곳 → 2028년 1곳 추가(총 10.17억 원).
          원문 위치 기준(인구 많은 지역·공단 인근)에 <b>밤·휴일에 일하는 부모가 사는 곳</b>이라는 데이터 기준을 더하자는 제안입니다.</p></div>
        <div class="card flat"><h3>확장 · 늦은 시간 돌봄방</h3>
          <p class="small ink2" style="margin-top:6px">1단계 초등학생: 다함께돌봄 틀(평일 18~22시, 토요일). 영유아는 어린이집 인가·보육교사 자격이 필요하므로 거점 센터와 연계합니다.
          공간은 공공 유휴공간·문 닫은 어린이집을 먼저 검토하고(공약 45 연계), 보조 인력은 노인일자리 역량활용형(공약 37)과 연계합니다. 새 예산이 들며 법적 틀은 담당 부서 확인이 필요합니다.</p></div>
      </div>
    </section>
    <footer class="l-foot">
      안산시 민간데이터 활용 대민서비스 아이디어 · 주제 2 프로토타입. 화면의 동 이름·경계는 실제(행정동 경계 admdongkor, CC BY 4.0)이지만 시설·인원·수치는 모두 가상 데이터입니다.
      통신 데이터에는 '부모'나 '자녀 유무'가 없으므로 20~40대 남녀의 야간·휴일 이동으로 추정하며, 시민 화면에는 개방 데이터와 동 단위 집계만 씁니다.
    </footer>
  </div>`;
  $('#theme').onclick = toggleTheme;
  app.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => doLogin(b.dataset.demo, 'demo1234').catch(toastErr));
}

function renderLogin(app) {
  app.innerHTML = `
  <div class="landing">
    <section class="l-hero" style="padding-bottom:90px"><div class="l-wrap"><div class="l-top"><a class="brand" href="#/" style="color:#fff"><span class="brand-mark">${icon('moon', 18)}</span> 안산 24시간 돌봄</a></div>
    <h1 style="font-size:30px">로그인</h1></div></section>
    <div class="l-wrap" style="padding:0 16px">
      <div class="grid-2" style="margin-top:-60px;position:relative;z-index:2">
        <form class="card login-card" id="f" autocomplete="on">
          <div class="field"><label for="u">아이디</label><input id="u" name="username" autocomplete="username" required></div>
          <div class="field"><label for="p">비밀번호</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary btn-block btn-lg">로그인</button>
          <p class="small muted" style="margin-top:12px">처음이신가요? <a href="#/register">부모 회원가입</a></p>
        </form>
        <div class="card">
          <h3>시연용 계정 <span class="muted small">(비밀번호 demo1234)</span></h3>
          <div class="demo-accounts" style="margin-top:10px">
            ${DEMO.map(d => `<button class="demo-acc" data-u="${d.u}"><span><b>${esc(d.name)}</b> <span class="chip">${esc(d.role)}</span><br><span class="small muted">${esc(d.desc)}</span></span><span class="kbd">${d.u}</span></button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>`;
  $('#f').onsubmit = e => { e.preventDefault(); doLogin($('#u').value.trim(), $('#p').value).catch(toastErr); };
  app.querySelectorAll('.demo-acc').forEach(b => b.onclick = () => doLogin(b.dataset.u, 'demo1234').catch(toastErr));
}

function renderRegister(app) {
  app.innerHTML = `
  <div class="landing">
    <section class="l-hero" style="padding-bottom:90px"><div class="l-wrap"><div class="l-top"><a class="brand" href="#/" style="color:#fff"><span class="brand-mark">${icon('moon', 18)}</span> 안산 24시간 돌봄</a></div>
    <h1 style="font-size:30px">부모 회원가입</h1></div></section>
    <div class="l-wrap" style="padding:0 16px">
      <form class="card login-card" id="f" style="margin-top:-60px;position:relative;z-index:2">
        <div class="field"><label>이름</label><input id="name" required maxlength="30"></div>
        <div class="field"><label>아이디 (영문·숫자 4~20자)</label><input id="u" required autocomplete="username"></div>
        <div class="field"><label>비밀번호 (8자 이상)</label><input id="p" type="password" required autocomplete="new-password"></div>
        <div class="field"><label>휴대폰 (알림용, 선택)</label><input id="phone" inputmode="tel" placeholder="010-0000-0000"></div>
        <div class="field"><label>사는 동</label><select id="dong">${dongOptions('')}</select></div>
        <p class="small muted" style="margin-bottom:12px">사는 동은 가까운 시설 안내와 동 단위 수요 집계에만 씁니다.</p>
        <button class="btn btn-primary btn-block btn-lg">가입하고 시작하기</button>
      </form>
    </div>
  </div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/register', { method: 'POST', body: { name: $('#name').value, username: $('#u').value.trim(), password: $('#p').value, phone: $('#phone').value, home_dong: $('#dong').value || null } });
      state.user = r.user;
      toast('가입했어요', '먼저 "내 정보"에서 아이를 등록해 주세요.');
      location.hash = '#/parent/me';
    } catch (err) { toastErr(err); }
  };
}

boot();
