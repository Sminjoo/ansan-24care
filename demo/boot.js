// 브라우저 체험판(GitHub Pages) 부팅 스크립트
// 서버 없이 같은 파이썬 코드(core/)를 Pyodide로 브라우저 안에서 실행하고,
// 앱의 fetch('/api/...')와 실시간 알림(EventSource)을 그쪽으로 연결한다.
(() => {
  const CFG = window.CARE_DEMO;
  const TOKEN_KEY = 'care-demo-token';
  const DB_KEY = 'db-' + CFG.build;
  const token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* */ } };
  const status = t => { const el = document.querySelector('#app .loading'); if (el) el.innerHTML = `<span class="spinner"></span> ${t}`; };

  // ── 보는 사람 브라우저에 데모 상태 저장(IndexedDB) ──
  const idb = {
    open: () => new Promise((res, rej) => { const r = indexedDB.open('care-demo', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    async get(k) { try { const d = await this.open(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch { return null; } },
    async set(k, v) { try { const d = await this.open(); d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch { /* */ } },
    async clear() { try { const d = await this.open(); d.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch { /* */ } },
  };

  let py = null, bridge = null, uid = 0, persistTimer = null;
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('스크립트를 불러오지 못했어요: ' + src)); document.head.append(s); });

  async function boot() {
    status('체험판을 준비하고 있어요 · 처음 한 번은 10~20초 걸려요');
    await loadScript(CFG.pyodide + 'pyodide.js');
    py = await window.loadPyodide({ indexURL: CFG.pyodide });
    status('분석 엔진을 불러오는 중…');
    await py.loadPackage('sqlite3');
    const [bundle, base] = await Promise.all([
      fetch('demo/app_bundle.zip?v=' + CFG.build).then(r => r.arrayBuffer()),
      fetch('demo/base.json?v=' + CFG.build).then(r => r.text()),
    ]);
    py.unpackArchive(bundle, 'zip', { extractDir: '/app' });
    py.FS.mkdirTree('/app/data/processed');
    py.FS.writeFile('/app/data/processed/base_full.json', base);
    const saved = await idb.get(DB_KEY);
    const restored = !!saved;
    const dbBytes = saved ? new Uint8Array(saved) : new Uint8Array(await (await fetch('demo/app.db?v=' + CFG.build)).arrayBuffer());
    py.FS.writeFile('/app/data/app.db', dbBytes);
    py.runPython([
      'import os, sys',
      "os.environ['CARE_STATIC'] = '1'",
      "os.environ['CARE_BASE_JSON'] = '/app/data/processed/base_full.json'",
      "os.environ['CARE_DB_PATH'] = '/app/data/app.db'",
      "sys.path.insert(0, '/app')",
      'from core import bridge',
    ].join('\n'));
    bridge = py.pyimport('core.bridge');
    status('시연 데이터를 오늘 날짜로 맞추는 중…');
    bridge.startup(restored);
    if (!restored) setToken(null);
    await persist();
    resubscribe();
    setInterval(() => { try { bridge.sweep(); pump(); } catch (e) { console.error(e); } }, 60000);
    addBadge();
  }

  async function persist() { if (py) await idb.set(DB_KEY, py.FS.readFile('/app/data/app.db').slice().buffer); }
  function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 800); }

  const ready = boot().catch(e => {
    console.error(e);
    status(`체험판을 불러오지 못했어요. 새로고침해 주세요. (${e.message})`);
    throw e;
  });

  // ── fetch('/api/...') 가로채기 ──
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    // Pyodide는 URL 객체로도 부르므로 문자열로 바꿔서 본다
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input && input.url) || String(input));
    if (!url.startsWith('/api/')) return realFetch(input, opts);
    await ready;
    const u = new URL(url, location.origin);
    const method = (opts.method || 'GET').toUpperCase();
    let res;
    try {
      res = JSON.parse(bridge.handle(method, u.pathname, u.search.slice(1), opts.body || null, token()));
    } catch (e) {
      console.error(e);
      res = { status: 500, body: { error: '체험판 처리 중 오류가 났어요: ' + e.message }, cookie: null };
    }
    if (res.cookie !== null && res.cookie !== undefined) { setToken(res.cookie); resubscribe(); }
    if (method !== 'GET') schedulePersist();
    setTimeout(pump, 0);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };

  // ── 실시간 알림(EventSource) 대신: 같은 브라우저 안 이벤트 전달 ──
  const sources = new Set();
  function resubscribe() {
    if (!bridge) return;
    uid = bridge.subscribe(token());
    if (uid) bridge.drain(uid);  // 다른 계정으로 있을 때 쌓인 이벤트는 버림
  }
  function pump() {
    if (!bridge || !uid) return;
    const list = JSON.parse(bridge.drain(uid));
    list.forEach(data => sources.forEach(s => { try { s.onmessage?.({ data }); } catch (e) { console.error(e); } }));
  }
  window.EventSource = class {
    constructor() { this.onmessage = null; sources.add(this); ready.then(() => { resubscribe(); pump(); }).catch(() => {}); }
    close() { sources.delete(this); }
  };
  setInterval(pump, 1500);

  // ── CSV 내려받기 링크 ──
  document.addEventListener('click', async e => {
    const a = e.target.closest && e.target.closest('a[href^="/api/"]');
    if (!a) return;
    e.preventDefault();
    await ready;
    const u = new URL(a.getAttribute('href'), location.origin);
    const r = JSON.parse(bridge.export(u.pathname, u.search.slice(1), token()));
    if (r.status !== 200) { alert('권한이 없습니다.'); return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([r.text], { type: 'text/csv;charset=utf-8' }));
    link.download = r.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }, true);

  // ── 체험판 표시 + 처음 상태로 되돌리기 ──
  function addBadge() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'demo-badge';
    b.title = '이 브라우저에 저장된 체험 기록(예약·지정안 등)을 지우고 처음 상태로 되돌립니다';
    b.textContent = '체험판 · 처음으로';
    b.onclick = async () => {
      if (!confirm('이 브라우저에 저장된 체험 기록을 지우고 처음 상태로 되돌릴까요?')) return;
      await idb.clear(); setToken(null); location.hash = '#/'; location.reload();
    };
    document.body.append(b);
  }
})();
