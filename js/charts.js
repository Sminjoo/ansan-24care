// Chart.js 래퍼: 테마 토큰, 기준선/구간 플러그인, 끝 값 라벨
import { onCleanup } from './core.js';

export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const series = i => css(`--s${i}`);
export const COMP_COLORS = () => ({ night: series(1), late: series(2), hol: series(3), sandan: series(4) });

function alpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export { alpha };

// 기준선·구간: options.plugins.refs = [{axis:'y', value, label, color, dash}, {axis:'x', from, to, color, label}]
const refPlugin = {
  id: 'refs',
  afterDatasetsDraw(chart, _args, opts) {
    const items = opts?.items || [];
    const { ctx, chartArea: a, scales } = chart;
    ctx.save();
    for (const it of items) {
      const color = it.color || css('--critical');
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.lineWidth = it.width || 1.5;
      ctx.setLineDash(it.dash || [6, 4]);
      ctx.font = `600 11.5px ${css('--font')}`;
      if (it.axis === 'y' && scales.y) {
        const y = scales.y.getPixelForValue(it.value);
        ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
        if (it.label) { ctx.textAlign = 'right'; ctx.fillText(it.label, a.right - 4, y - 5); }
      } else if (it.axis === 'yv' && scales.y) {
        // 시간대별로 달라지는 정원: 계단선
        const xs = scales.x; ctx.beginPath();
        it.values.forEach((v, i) => {
          const x0 = xs.getPixelForValue(i) - (xs.width / it.values.length) / 2;
          const x1 = x0 + xs.width / it.values.length;
          const y = scales.y.getPixelForValue(v);
          if (i === 0) ctx.moveTo(x0, y); else ctx.lineTo(x0, y);
          ctx.lineTo(x1, y);
        });
        ctx.stroke();
        if (it.label) { ctx.setLineDash([]); ctx.textAlign = 'right'; ctx.fillText(it.label, a.right - 4, scales.y.getPixelForValue(it.values[it.values.length - 1]) - 6); }
      } else if (it.axis === 'xv' && scales.x) {
        const x = scales.x.getPixelForValue(it.value);
        ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
        if (it.label) { ctx.setLineDash([]); ctx.textAlign = 'left'; ctx.fillText(it.label, x + 5, a.top + 12); }
      } else if (it.axis === 'xband' && scales.x) {
        const n = chart.data.labels.length, w = scales.x.width / n;
        const x0 = scales.x.getPixelForValue(it.from) - w / 2, x1 = scales.x.getPixelForValue(it.to) + w / 2;
        ctx.setLineDash([]); ctx.fillStyle = alpha(color, it.alpha ?? 0.10);
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        if (it.label) { ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(it.label, (x0 + x1) / 2, a.top + 12); }
      }
    }
    ctx.restore();
  },
};

// 막대 끝 값 라벨: options.plugins.endLabels = {format:(v,i,chart)=>string, datasetIndex?: 'last'}
const endLabelPlugin = {
  id: 'endLabels',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.format) return;
    const { ctx } = chart;
    const metas = chart.getSortedVisibleDatasetMetas();
    const last = metas[metas.length - 1];
    if (!last) return;
    const horizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = `600 12px ${css('--font')}`;
    ctx.fillStyle = css('--ink-2');
    last.data.forEach((bar, i) => {
      const txt = opts.format(i, chart);
      if (!txt) return;
      const p = bar.getProps(['x', 'y', 'base'], true);
      if (horizontal) {
        const x = opts.atMax ? Math.max(...metas.map(m => m.data[i].getProps(['x'], true).x)) : p.x;
        // 묶음 막대면 묶음 가운데 높이에 둔다
        const ys = metas.map(m => m.data[i].getProps(['y'], true).y);
        const y = opts.atMax ? (Math.min(...ys) + Math.max(...ys)) / 2 : p.y;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + 6, y);
      } else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, p.x, p.y - 4); }
    });
    ctx.restore();
  },
};

let registered = false;
function setup() {
  const C = window.Chart;
  if (!registered) { C.register(refPlugin, endLabelPlugin); registered = true; }
  C.defaults.font.family = css('--font');
  C.defaults.font.size = 12;
  C.defaults.color = css('--muted');
  C.defaults.borderColor = css('--line');
  C.defaults.plugins.legend.labels.color = css('--ink-2');
  C.defaults.plugins.legend.labels.boxWidth = 12;
  C.defaults.plugins.legend.labels.boxHeight = 12;
  C.defaults.plugins.legend.labels.useBorderRadius = true;
  C.defaults.plugins.legend.labels.borderRadius = 3;
  C.defaults.plugins.tooltip.backgroundColor = css('--night') || '#1d2a4a';
  C.defaults.plugins.tooltip.titleFont = { weight: '700', size: 13 };
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 8;
  C.defaults.plugins.tooltip.boxPadding = 4;
  C.defaults.maintainAspectRatio = false;
  C.defaults.animation.duration = 350;
}

export function chart(canvas, config) {
  setup();
  const c = new window.Chart(canvas, config);
  onCleanup(() => c.destroy());
  return c;
}

export const axis = (extra = {}) => ({
  grid: { color: css('--line'), drawTicks: false }, border: { color: css('--line-2') }, ticks: { padding: 6, color: css('--muted') }, ...extra,
});
export const noGrid = (extra = {}) => ({ grid: { display: false }, border: { color: css('--line-2') }, ticks: { color: css('--ink-2'), padding: 6 }, ...extra });

export const hourLabel = h => `${h}시`;
