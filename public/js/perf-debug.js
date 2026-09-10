(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('perf') !== '1') return;

  const panel = document.createElement('div');
  panel.setAttribute('role', 'status');
  panel.style.cssText = [
    'position:fixed','left:10px','bottom:10px','z-index:99999','min-width:158px','padding:9px 11px',
    'border:1px solid rgba(0,209,255,.32)','border-radius:10px','background:rgba(2,12,21,.88)',
    'color:#dff8ff','font:600 11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace',
    'box-shadow:0 10px 28px rgba(0,0,0,.22)','pointer-events:none','backdrop-filter:blur(6px)'
  ].join(';');
  document.body.appendChild(panel);

  const samples = [];
  let previous = performance.now();
  let lastPaint = 0;
  function frame(now) {
    const delta = now - previous;
    previous = now;
    if (delta > 0 && delta < 120) {
      samples.push(delta);
      if (samples.length > 180) samples.shift();
    }
    if (now - lastPaint > 500 && samples.length > 20) {
      lastPaint = now;
      const sorted = [...samples].sort((a,b) => a-b);
      const avg = samples.reduce((a,b) => a+b,0) / samples.length;
      const fps = 1000 / avg;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))];
      const cls = fps >= 130 ? '144Hz-class' : fps >= 108 ? '120Hz-class' : fps >= 82 ? '90Hz-class' : '60Hz-class';
      panel.innerHTML = `NEXORA PERF<br>FPS avg: ${fps.toFixed(0)}<br>Frame avg: ${avg.toFixed(2)} ms<br>P95: ${p95.toFixed(2)} ms<br>${cls}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
