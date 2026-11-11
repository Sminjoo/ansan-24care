// Leaflet 지도 헬퍼
import { onCleanup, esc, isDark } from './core.js';

let geoCache = null;
export async function loadGeo() {
  if (!geoCache) geoCache = await (await fetch('data/ansan_dong.geojson')).json();
  return geoCache;
}

export const URBAN = [[37.276, 126.745], [37.368, 126.915]];

export function baseMap(el, { bounds = URBAN, zoom = true, streetLabels = false } = {}) {
  const L = window.L;
  // zoomSnap을 잘게 둬서 좁은 칸에서도 안산이 칸을 꽉 채우게 맞춘다
  const map = L.map(el, { zoomControl: zoom, attributionControl: true, scrollWheelZoom: false, preferCanvas: false, zoomSnap: 0.25, zoomDelta: 0.5 });
  // 배경 지도: Esri 회색 캔버스(키 없이 사용 가능, 단계구분도와 잘 어울림).
  // OSM 공식 타일 서버는 앱 사용을 막고(403 Access blocked), CARTO는 등록되지 않은 도메인에 키를 요구해서 쓰지 않는다.
  const tone = isDark() ? 'Dark' : 'Light';
  const esri = layer => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${tone}_Gray_${layer}/MapServer/tile/{z}/{y}/{x}`;
  const common = { maxZoom: 16, minZoom: 9, referrerPolicy: 'strict-origin-when-cross-origin' };
  // Esri는 한국 지역을 13단계까지만 그린다(14단계부터 'Map data not yet available').
  // 시 화면(도시 전체, 12~13단계)은 Esri 회색 캔버스, 골목까지 확대하는 부모 화면은 OpenStreetMap을 쓴다.
  // OSM 타일 서버는 출처(Referer)가 없으면 막으므로 referrerPolicy를 꼭 둔다.
  const tiles = streetLabels
    ? L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, minZoom: 9, referrerPolicy: 'strict-origin-when-cross-origin', className: 'osm-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · 행정동 경계 admdongkor(CC BY 4.0)',
    })
    : L.tileLayer(esri('Base'), {
      ...common, maxZoom: 13,
      attribution: '지도 &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · 행정동 경계 admdongkor(CC BY 4.0)',
    });
  tiles.addTo(map);
  if (!streetLabels) map.setMaxZoom(13);
  // 배경 타일을 못 받아도(오프라인 등) 동 경계·마커는 그대로 보이게, 깨진 이미지 대신 빈칸으로 둔다
  tiles.on('tileerror', e => { e.tile.style.visibility = 'hidden'; });
  // 칸 크기가 늦게 정해지거나 창 크기가 바뀌면 다시 맞춘다. 사용자가 지도를 직접 움직인 뒤에는 그대로 둔다.
  let fitOpts = { padding: [4, 4] };
  let userMoved = false;
  ['pointerdown', 'wheel', 'touchstart'].forEach(ev => el.addEventListener(ev, () => { userMoved = true; }, { passive: true }));
  el.addEventListener('click', () => map.scrollWheelZoom.enable(), { once: true });
  map.refit = (b, opts) => {
    if (b) { bounds = b; fitOpts = { padding: [4, 4], ...(opts || {}) }; }
    map.invalidateSize();
    if (!userMoved || b) map.fitBounds(bounds, fitOpts);
  };
  map.refit();
  const ro = new ResizeObserver(() => map.refit());
  ro.observe(el);
  onCleanup(() => { ro.disconnect(); map.remove(); });
  return map;
}

export async function dongLayer(map, { style, tooltip, onClick, labels = false } = {}) {
  const L = window.L;
  const geo = await loadGeo();
  const layer = L.geoJSON(geo, {
    style: f => ({ weight: 1, color: '#6b6a66', opacity: 0.7, fillOpacity: 0.08, fillColor: '#888', ...(style?.(f.properties) || {}) }),
    onEachFeature: (f, lyr) => {
      if (tooltip) lyr.bindTooltip(tooltip(f.properties), { sticky: true });
      if (onClick) lyr.on('click', () => onClick(f.properties));
      lyr.on('mouseover', () => lyr.setStyle({ weight: 2.5 }));
      lyr.on('mouseout', () => lyr.setStyle({ weight: 1 }));
    },
  }).addTo(map);
  if (labels) {
    geo.features.forEach(f => {
      const b = L.geoJSON(f).getBounds();
      if (f.properties.name === '대부동') return;
      L.tooltip({ permanent: true, direction: 'center', className: 'dong-label' }).setLatLng(b.getCenter()).setContent(esc(f.properties.name)).addTo(map);
    });
  }
  return layer;
}

export function pin(kind, text = '') {
  return window.L.divIcon({ className: '', html: `<div class="map-pin ${kind}"><span>${esc(text)}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] });
}

export function meIcon() {
  return window.L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
}

// 연속값 -> 색 (순차: 파랑 한 색, 발산: 파랑-회색-빨강)
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export function seqColor(v, max) {
  if (!max) return SEQ[0];
  const i = Math.min(SEQ.length - 1, Math.max(0, Math.floor((v / max) * SEQ.length)));
  return SEQ[i];
}
const DIV_NEG = ['#1c5cab', '#5598e7', '#9ec5f4'];
const DIV_POS = ['#f5b8b7', '#e97a79', '#e34948', '#b52f2f'];
export function divColor(v, maxAbs) {
  if (Math.abs(v) < maxAbs * 0.06) return '#e7e6e1';
  if (v < 0) return DIV_NEG[Math.min(2, Math.floor((1 - Math.min(1, -v / maxAbs)) * 3))];
  return DIV_POS[Math.min(3, Math.floor(Math.min(0.999, v / maxAbs) * 4))];
}
export const SEQ_STEPS = SEQ;
export const DIV_STEPS = [...DIV_NEG, '#e7e6e1', ...DIV_POS];
