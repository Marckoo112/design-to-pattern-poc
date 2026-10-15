(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = (value) => {
    const rounded = Number(value).toFixed(3);
    return rounded.includes('.') ? rounded.replace(/0+$/, '').replace(/\.$/, '') : rounded;
  };
  const polyline = (points, close = false) => {
    if (!points?.length) return '';
    return `M${points.map((point) => `${fmt(point.x)} ${fmt(point.y)}`).join('L')}${close ? 'Z' : ''}`;
  };
  const mapPoint = (point, transform, planner) => planner.applyTransform(point, transform);
  const mapPath = (path, transform, planner) => {
    const start = mapPoint(path.start, transform, planner);
    return `M${fmt(start.x)} ${fmt(start.y)}${(path.segs || []).map((segment) => {
      const end = mapPoint(segment.to, transform, planner);
      if (segment.k === 'L') return `L${fmt(end.x)} ${fmt(end.y)}`;
      const c1 = mapPoint(segment.c1, transform, planner);
      const c2 = mapPoint(segment.c2, transform, planner);
      return `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`;
    }).join('')}`;
  };

  function pieceSvg(placed, planner, geometry) {
    const {piece, t} = placed;
    const transform = (point) => mapPoint(point, t, planner);
    const cut = polyline(piece.cutLine.map(transform), true);
    const seam = polyline(piece.seamLine.map(transform), true);
    const grainStart = transform(piece.grain[0]);
    const grainEnd = transform(piece.grain[1]);
    const labels = [piece.name, piece.cut?.onFold ? `Cut ${piece.cut.count} on fold` : `Cut ${piece.cut?.count ?? 1}${piece.cut?.pair ? ' · pair' : ''}`, piece.note].filter(Boolean);
    const labelPoint = transform(piece.labelAt || geometry.centroid(piece.seamLine));
    const lines = (piece.lines || []).map((line) => {
      const style = line.style === 'fold' ? 'stroke-dasharray="0.4 0.2"' : line.style === 'gather' ? 'stroke-dasharray="0.15 0.25"' : line.style === 'placement' ? 'stroke-dasharray="0.3 0.3"' : '';
      return `<path d="${mapPath(line.path, t, planner)}" fill="none" stroke="#555" stroke-width="0.018" ${style}/>`;
    }).join('');
    const notches = (piece.notchMarks || []).map((notch) => {
      const start = transform(notch.at);
      const inner = transform({x:notch.at.x + notch.inward.x,y:notch.at.y + notch.inward.y});
      const dx = inner.x - start.x;
      const dy = inner.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const shifts = notch.count === 2 ? [-0.25,0.25] : [0];
      return shifts.map((shift) => {
        const x = start.x + nx * shift;
        const y = start.y + ny * shift;
        return `<path d="M${fmt(x)} ${fmt(y)}L${fmt(x + dx / length * 0.7)} ${fmt(y + dy / length * 0.7)}" fill="none" stroke="#111" stroke-width="0.025"/>`;
      }).join('');
    }).join('');
    const foldLines = (piece.foldSegments || []).map((segment) => {
      const points = segment.map(transform);
      return `<path d="${polyline(points)}" fill="none" stroke="#725c25" stroke-width="0.025" stroke-dasharray="0.5 0.25"/>`;
    }).join('');
    const marks = (piece.marks || []).map((mark) => {
      const point = transform(mark.at);
      if (mark.kind === 'button') return `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="0.07" fill="none" stroke="#111" stroke-width="0.02"/>`;
      if (mark.kind === 'buttonhole') return `<path d="M${fmt(point.x - 0.12)} ${fmt(point.y)}L${fmt(point.x + 0.12)} ${fmt(point.y)}" stroke="#111" stroke-width="0.025"/>`;
      if (mark.kind === 'dot') return `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="0.04" fill="#111"/>`;
      return '';
    }).join('');
    const labelText = labels.map((label, index) => `<text x="${fmt(labelPoint.x)}" y="${fmt(labelPoint.y + (index - (labels.length - 1) / 2) * 0.45)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${index ? '0.28' : '0.36'}" font-weight="${index ? '400' : '700'}">${esc(label)}</text>`).join('');
    const grain = `<path d="${polyline([grainStart,grainEnd])}" fill="none" stroke="#111" stroke-width="0.025" marker-start="url(#grain-arrow)" marker-end="url(#grain-arrow)"/>`;
    return `<g data-piece="${esc(piece.id)}"><path d="${cut}" fill="none" stroke="#111" stroke-width="0.035" stroke-linejoin="round"/><path d="${seam}" fill="none" stroke="#777" stroke-width="0.02" stroke-dasharray="0.18 0.1"/>${lines}${foldLines}${notches}${marks}${grain}${labelText}</g>`;
  }

  function printableDocument({draft, paperId, planner, geometry}) {
    const plan = planner.planPrint(draft.output.pieces, paperId, false);
    const tiles = plan.tiles.filter((tile) => tile.used).sort((a, b) => a.page - b.page);
    if (!tiles.length || !plan.sheet?.placed?.length) throw new Error('Native print planner did not produce any printable pages.');
    const paperW = plan.landscape ? plan.paper.h : plan.paper.w;
    const paperH = plan.landscape ? plan.paper.w : plan.paper.h;
    const margin = Number(plan.paper.margin || 0);
    const page = (content, title, subtitle = '') => `<section class="page"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(paperW)} ${fmt(paperH)}" width="${fmt(paperW)}cm" height="${fmt(paperH)}cm"><defs><marker id="grain-arrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#111"/></marker></defs><text x="${fmt(margin)}" y="${fmt(Math.max(0.35,margin * 0.35))}" font-family="Arial,sans-serif" font-size="0.25">${esc(title)}${subtitle ? ` · ${esc(subtitle)}` : ''}</text>${content}</svg></section>`;
    const calibration = `<rect x="${fmt((paperW - 5) / 2)}" y="${fmt((paperH - 5) / 2)}" width="5" height="5" fill="none" stroke="#111" stroke-width="0.03"/><text x="${fmt(paperW / 2)}" y="${fmt((paperH - 5) / 2 - 0.35)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="0.3">50 mm calibration square · print at 100%</text>`;
    const sheets = tiles.map((tile) => {
      const translateX = margin - tile.rect.minX;
      const translateY = margin - tile.rect.minY;
      const pieces = plan.sheet.placed.map((placed) => pieceSvg(placed, planner, geometry)).join('');
      const marks = `<g transform="translate(${fmt(translateX)} ${fmt(translateY)})">${pieces}</g><text x="${fmt(paperW - margin)}" y="${fmt(paperH - 0.25)}" text-anchor="end" font-family="Arial,sans-serif" font-size="0.22">${esc(draft.output.spec.title || 'Garment pattern')} · Page ${tile.page} / ${tiles.length} · ${esc(tile.row + 1)} × ${esc(tile.col + 1)}</text>`;
      return page(marks, draft.output.spec.title || 'Garment pattern', `Page ${tile.page} of ${tiles.length}`);
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(draft.output.spec.title || 'Pattern')} · local print</title><style>
      @page{size:${fmt(paperW * 10)}mm ${fmt(paperH * 10)}mm;margin:0}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font:14px system-ui,sans-serif}.toolbar{position:sticky;top:0;z-index:3;padding:14px 20px;background:#f3f4f2;border-bottom:1px solid #c8cec9;display:flex;gap:14px;align-items:center}.toolbar button{border:0;border-radius:7px;background:#18251d;color:white;padding:10px 16px;font-weight:700;cursor:pointer}.toolbar p{margin:0;font-size:12px;line-height:1.45;color:#465148}.page{position:relative;width:${fmt(paperW * 10)}mm;height:${fmt(paperH * 10)}mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}.page:last-child{page-break-after:auto;break-after:auto}.page svg{display:block;width:100%;height:100%}@media print{.toolbar{display:none}html,body{width:${fmt(paperW * 10)}mm;background:#fff}.page{margin:0;box-shadow:none}}
      @media screen{body{background:#e5e8e5}.page{margin:18px auto;box-shadow:0 2px 12px #0002}}
    </style></head><body><header class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><p><strong>${esc(draft.output.spec.title || 'Pattern')}</strong> · ${esc(plan.paper.label)} · Native Ourlette sheet planner, local PDF printing.<br>Choose “Save as PDF”, disable headers/footers, and print at 100%. The backend guide/PDF endpoint is not included in this offline app.</p></header>${page(calibration,'Scale check','50 × 50 mm calibration square')}${sheets}</body></html>`;
  }

  window.openNativePatternPdf = ({draft, paperId, planner, geometry}) => {
    const dialog = document.querySelector('#print-dialog');
    const frame = document.querySelector('#print-frame');
    if (!dialog || !frame) throw new Error('The local print preview panel is missing.');
    frame.srcdoc = printableDocument({draft, paperId, planner, geometry});
    dialog.showModal();
  };
})();
