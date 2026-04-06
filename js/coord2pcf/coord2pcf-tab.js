/**
 * coord2pcf-tab.js — "Coordinates to PCF" tab controller
 * Wires UI inputs → parsers → topology analyzer → PCF emitter → display
 *
 * Flow:
 *   1. User pastes text OR imports CSV/Excel
 *   2. "Parse to Table" converts raw input into a coordinate preview table
 *   3. User reviews table, sets options, clicks "Generate PCF"
 *   4. Topology analysis runs → PCF emitter → output textarea
 */

import { parseAutoCADText }   from './coord-text-parser.js';
import { parseCSVText, parseExcelBuffer } from './coord-csv-parser.js';
import { analyzeTopology }    from './coord-topology-analyzer.js';
import { generatePCF }        from './coord-pcf-emitter.js';
import { getRayConfig }       from '../ray-concept/rc-config.js';
import { runSupportProbe, parseCoordText } from './coord-support-probe.js';

// ── Mock data ────────────────────────────────────────────────────────────────
// Route: matches MAIN JS routeLoop (simple orthogonal path, no bulges)
const MOCK_RAW = `Select objects:
      at point  X=0  Y=0   Z=0
      at point  X=0  Y=13000 Z=0
      at point  X=8000 Y=13000 Z=0
      at point  X=8000 Y=6000 Z=0
      at point  X=2000 Y=6000 Z=0
      at point  X=2000 Y=-2000 Z=0
      at point  X=11000 Y=-2000 Z=0
      at point  X=11000 Y=9000 Z=0
      at point  X=16000 Y=9000 Z=0`;

// Support probe origins: matches MAIN JS redLoop
const MOCK_SUPPORT_COORDS = `-600, 4000
700, 10000
4000, 12400
8600, 9500
5000, 5400
1400, 2000`;

// Legacy mock (real-world AutoCAD data with bulges — kept for reference)
const MOCK_DATA = `Select objects:
              LWPOLYLINE  Layer: "1"
                        Space: Model space
               Color: 8    Linetype: "BYLAYER"
               Handle = 42539e
          Open
Constant width    0.0000
          area   359.7171
        length   430.7441
      at point  X=359363.9302  Y=2026092.2156  Z=   0.0000
      at point  X=359363.9302  Y=2026091.8082  Z=   0.0000
      at point  X=359303.6960  Y=2026091.8082  Z=   0.0000
      at point  X=359303.6960  Y=2026100.8082  Z=   0.0000
      at point  X=359293.1840  Y=2026100.8082  Z=   0.0000
      at point  X=359293.1840  Y=2026091.8342  Z=   0.0000
      at point  X=359182.2600  Y=2026091.8342  Z=   0.0000
      at point  X=359182.2600  Y=2026100.8082  Z=   0.0000
      at point  X=359171.7480  Y=2026100.8082  Z=   0.0000
      at point  X=359171.7480  Y=2026091.8342  Z=   0.0000
      at point  X=359061.6220  Y=2026091.8342  Z=   0.0000
      at point  X=359061.6220  Y=2026101.5755  Z=   0.0000
Press ENTER to continue:
      at point  X=359051.1100  Y=2026101.5755  Z=   0.0000
      at point  X=359051.1100  Y=2026091.8342  Z=   0.0000
      at point  X=358989.5624  Y=2026091.8342  Z=   0.0000
         bulge    0.4142
        center  X=358989.5624  Y=2026091.5294  Z=   0.0000
        radius    0.3048
   start angle        90
     end angle       180
      at point  X=358989.2576  Y=2026091.5294  Z=   0.0000
      at point  X=358989.2576  Y=2026091.4438  Z=   0.0000`;

// ── State ────────────────────────────────────────────────────────────────────
let _parsedRuns      = [];      // array of { points[], metadata }
let _components      = [];      // classified components from analyzer
let _inputMode       = 'text';  // 'text' | 'csv'
let _supportPoints   = [];      // applied [x, y][] probe origins
let _supportPreview  = [];      // pending preview points (not yet applied)
const PROBE_LENGTH   = 1000;    // max probe distance in model units

// ── Helpers ──────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function setStatus(msg, type = 'info') {
  const bar = el('c2p-status');
  if (!bar) return;
  bar.textContent = msg;
  bar.style.color = type === 'error' ? 'var(--accent-red, #ef4444)'
                  : type === 'ok'    ? 'var(--accent-green, #22c55e)'
                  :                    'var(--text-muted)';
}

function appendLog(lines) {
  const logEl = el('c2p-debug-log');
  if (!logEl) return;
  logEl.textContent += lines.join('\n') + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
  const logEl = el('c2p-debug-log');
  if (logEl) logEl.textContent = '';
}

function getCA() {
  const cfg = getRayConfig();
  return {
    CA1:  String(el('c2p-ca1')?.value  || cfg.caDefaults?.CA1  || '700 KPA').trim(),
    CA2:  String(el('c2p-ca2')?.value  || cfg.caDefaults?.CA2  || '120 C').trim(),
    CA3:  String(el('c2p-ca3')?.value  || cfg.caDefaults?.CA3  || '106').trim(),
    CA4:  String(el('c2p-ca4')?.value  || cfg.caDefaults?.CA4  || '9.53 MM').trim(),
    CA5:  String(el('c2p-ca5')?.value  || cfg.caDefaults?.CA5  || '0 MM').trim(),
    CA6:  String(el('c2p-ca6')?.value  || cfg.caDefaults?.CA6  || '210 KG/M3').trim(),
    CA7:  String(el('c2p-ca7')?.value  || '').trim(),
    CA8:  String(el('c2p-ca8')?.value  || '').trim(),
    CA9:  String(el('c2p-ca9')?.value  || cfg.caDefaults?.CA9  || '1000 KG/M3').trim(),
    CA10: String(el('c2p-ca10')?.value || cfg.caDefaults?.CA10 || '1500 KPA').trim(),
  };
}

// ── Preview table ─────────────────────────────────────────────────────────────
function renderPreviewTable(allPoints) {
  const wrap = el('c2p-preview-wrap');
  if (!wrap) return;

  if (!allPoints || allPoints.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.78rem;padding:0.5rem">No points parsed yet.</p>';
    return;
  }

  // Detect if any enriched CSV columns exist
  const hasMeta = allPoints.some(p => p.supportName || p.deBo || p.remarks);

  let html = `<table class="c2p-table">
    <thead><tr>
      <th>#</th><th>East (X)</th><th>North (Y)</th><th>Up (Z)</th>
      ${hasMeta ? '<th>Support</th><th>DE/BO</th><th>Remarks</th>' : ''}
      <th>Arc?</th>
    </tr></thead><tbody>`;

  allPoints.forEach((p, i) => {
    const arcTag = p.bulge != null
      ? `<span class="c2p-badge c2p-badge-arc">bulge ${Number(p.bulge).toFixed(4)}</span>`
      : '';
    html += `<tr>
      <td>${i + 1}</td>
      <td>${Number(p.x).toFixed(4)}</td>
      <td>${Number(p.y).toFixed(4)}</td>
      <td>${Number(p.z).toFixed(4)}</td>
      ${hasMeta ? `<td>${p.supportName || ''}</td><td>${p.deBo || ''}</td><td>${p.remarks || ''}</td>` : ''}
      <td>${arcTag}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ── Parse step ────────────────────────────────────────────────────────────────
function doParse() {
  clearLog();
  _parsedRuns = [];
  _components = [];
  el('c2p-pcf-output')?.setAttribute('value', '');
  if (el('c2p-pcf-output')) el('c2p-pcf-output').value = '';

  let result;
  if (_inputMode === 'text') {
    const raw = el('c2p-text-input')?.value || '';
    if (!raw.trim()) { setStatus('Paste raw coordinate text first.', 'error'); return; }
    result = parseAutoCADText(raw);
    appendLog(['[Parser] AutoCAD text mode', ...(result.warnings.map(w => '  ⚠ ' + w))]);
  } else {
    // CSV mode — use last parsed CSV result stored in _parsedRuns from file import
    if (!_parsedRuns.length) { setStatus('Import a CSV or Excel file first.', 'error'); return; }
    // Already set by handleFileImport
    appendLog(['[Parser] CSV/Excel mode — data from imported file']);
    const allPts = _parsedRuns.flatMap(r => r.points);
    renderPreviewTable(allPts);
    setStatus(`Parsed ${allPts.length} point(s) from imported file. Click Generate PCF.`, 'ok');
    return;
  }

  _parsedRuns = result.runs;
  const allPts = _parsedRuns.flatMap(r => r.points);
  appendLog([
    `[Parser] Runs: ${_parsedRuns.length}, Total points: ${allPts.length}`,
    ..._parsedRuns.map((r, i) =>
      `  Run ${i + 1}: ${r.points.length} pts, layer="${r.metadata?.layer}", handle=${r.metadata?.handle}`),
  ]);

  renderPreviewTable(allPts);

  if (allPts.length === 0) {
    setStatus('No coordinate points found. Check input format.', 'error');
  } else {
    setStatus(`Parsed ${allPts.length} point(s) across ${_parsedRuns.length} run(s). Review table → Generate PCF.`, 'ok');
  }
}

// ── Generate PCF step ─────────────────────────────────────────────────────────
function doGenerate() {
  if (!_parsedRuns.length) {
    setStatus('Parse coordinates first.', 'error');
    return;
  }
  setStatus('Running topology analysis…');
  appendLog(['\n[Topology Analyzer]']);

  const bore       = parseFloat(el('c2p-bore')?.value) || 250;
  const coordScale = parseFloat(el('c2p-scale')?.value) || 1.0;
  const pipeOnly   = el('c2p-pipe-only')?.checked || false;
  const options    = { bore, coordScale, pipeOnly };

  const { components, log, warnings } = analyzeTopology(_parsedRuns, options);
  _components = components;

  appendLog(log);
  if (warnings.length) appendLog(warnings.map(w => '  ⚠ ' + w));

  appendLog([`\n[PCF Emitter] ${components.length} components`]);

  // ── Support probe post-pass ──────────────────────────────────────────────
  // Always read textarea directly — Apply button is optional
  const scText = el('c2p-sc-textarea')?.value || '';
  const { points: livePoints, errors: liveErrors } = parseCoordText(scText);
  if (liveErrors.length) _scShowErrors(liveErrors);

  // Combine: textarea coords + canvas-drawn emit p1 origins
  const canvasProbePoints = _canvasEmits.map(e => e.p1);
  const activeSupports = [...(livePoints.length ? livePoints : _supportPoints), ...canvasProbePoints];

  let probeSupports     = [];
  let segmentedPipeBend = null;   // pipe+bend components after split

  // "Consider all Rest support at segmented pipe" — when ON, run probe and include supports
  const runProbe = el('c2p-rest-support')?.checked !== false;  // defaults true if not found
  if (runProbe && activeSupports.length > 0) {
    appendLog([`\n[Support Probe] ${activeSupports.length} probe point(s)`]);
    const { supportComponents, segmentedComponents, log: probeLog } = runSupportProbe(
      components, activeSupports, PROBE_LENGTH, 'CA150'
    );
    appendLog(probeLog);
    probeSupports     = supportComponents;
    segmentedPipeBend = segmentedComponents;
  }

  // Use segmented pipe/bend components (pipes split at hit points) or originals
  const basePipeBend = segmentedPipeBend ?? components.filter(c => c.type === 'PIPE' || c.type === 'BEND');
  const nonPipeBend  = components.filter(c => c.type !== 'PIPE' && c.type !== 'BEND');

  const allComponents = [...basePipeBend, ...nonPipeBend, ...probeSupports];

  const { pcfText, stats } = generatePCF(allComponents, {
    bore,
    pipelineRef:      (el('c2p-pipeline-ref')?.value || '').trim(),
    ca:               getCA(),
    decimalPrecision: 4,
    windowsLineEndings: true,
  });

  const outEl = el('c2p-pcf-output');
  if (outEl) outEl.value = pcfText;

  appendLog([
    `[Stats] PIPE=${stats.pipe}  BEND=${stats.bend}  TEE=${stats.tee}  SUPPORT=${stats.support + probeSupports.length}  SKIPPED=${stats.skipped}`,
  ]);

  setStatus(
    pipeOnly
      ? `[PIPE-ONLY] ${stats.pipe} pipe segment(s) — raw topology check. Uncheck "Pipes Only" to add elbows.`
      : `Generated PCF — ${stats.pipe} pipe(s), ${stats.bend} bend(s), ${stats.tee} tee(s), ${stats.support + probeSupports.length} support(s)`,
    'ok'
  );

  // Refresh canvas preview with updated route + support points
  _refreshCanvas();
}

// ── File import ──────────────────────────────────────────────────────────────
async function handleFileImport(file) {
  if (!file) return;
  const fileName = file.name.toLowerCase();
  setStatus(`Reading ${file.name}…`);

  try {
    if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      const text   = await file.text();
      const result = parseCSVText(text);
      _parsedRuns  = [{ points: result.points, metadata: { layer: file.name } }];
      appendLog(['[CSV Import] ' + file.name, ...result.warnings.map(w => '  ⚠ ' + w)]);
    } else {
      const buf    = await file.arrayBuffer();
      const result = await parseExcelBuffer(buf);
      _parsedRuns  = [{ points: result.points, metadata: { layer: file.name } }];
      appendLog(['[Excel Import] ' + file.name, ...result.warnings.map(w => '  ⚠ ' + w)]);
    }

    const allPts = _parsedRuns.flatMap(r => r.points);
    renderPreviewTable(allPts);
    setStatus(`Imported ${allPts.length} point(s) from ${file.name}. Click Generate PCF.`, 'ok');
  } catch (err) {
    setStatus(`File read error: ${err.message}`, 'error');
  }
}

// ── Download / Copy ──────────────────────────────────────────────────────────
function doCopy() {
  const text = el('c2p-pcf-output')?.value || '';
  if (!text.trim()) { setStatus('Nothing to copy — generate PCF first.', 'error'); return; }
  navigator.clipboard.writeText(text).then(
    () => setStatus('PCF copied to clipboard.', 'ok'),
    () => setStatus('Clipboard copy failed — select text manually.', 'error')
  );
}

function doDownload() {
  const text = el('c2p-pcf-output')?.value || '';
  if (!text.trim()) { setStatus('Nothing to download — generate PCF first.', 'error'); return; }
  const pref = (el('c2p-pipeline-ref')?.value || 'output').replace(/[^a-z0-9_-]/gi, '_');
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${pref}.pcf`; a.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded ${pref}.pcf`, 'ok');
}

// ── Input mode toggle ────────────────────────────────────────────────────────
function setInputMode(mode) {
  _inputMode = mode;
  el('c2p-panel-text').style.display = mode === 'text' ? ''  : 'none';
  el('c2p-panel-csv').style.display  = mode === 'csv'  ? ''  : 'none';
  el('c2p-mode-text').classList.toggle('active', mode === 'text');
  el('c2p-mode-csv').classList.toggle('active',  mode === 'csv');
}

// ── Debug panel toggle ───────────────────────────────────────────────────────
function toggleDebug() {
  const body    = el('c2p-debug-body');
  const icon    = el('c2p-debug-toggle-icon');
  const visible = body.style.display !== 'none';
  body.style.display = visible ? 'none' : '';
  if (icon) icon.textContent = visible ? '▶' : '▼';
}

// ── Support Coordinates UI ───────────────────────────────────────────────────

function _scSetCount(n, isPreview = false) {
  const el2 = el('c2p-sc-count');
  if (!el2) return;
  el2.textContent = n > 0 ? `${n} point${n !== 1 ? 's' : ''}${isPreview ? ' (preview)' : ' applied'}` : '';
}

function _scShowErrors(errors) {
  const el2 = el('c2p-sc-errors');
  if (!el2) return;
  el2.textContent = errors.length ? errors.join('\n') : '';
}

function _scPreview() {
  const text = el('c2p-sc-textarea')?.value || '';
  const { points, errors } = parseCoordText(text);
  _scShowErrors(errors);
  _supportPreview = points;
  _scSetCount(points.length, true);
  _refreshCanvas();
}

function _scApply() {
  const text = el('c2p-sc-textarea')?.value || '';
  const { points, errors } = parseCoordText(text);
  _scShowErrors(errors);
  if (!points.length) { setStatus('No valid support coordinates to apply.', 'error'); return; }
  _supportPoints  = points;
  _supportPreview = [];
  _scSetCount(points.length, false);
  setStatus(`${points.length} support coordinate(s) applied. Generate PCF to update output.`, 'ok');
  _refreshCanvas();
  if (_parsedRuns.length) doGenerate();
}

function _scClear() {
  const ta = el('c2p-sc-textarea');
  if (ta) ta.value = '';
  _supportPoints  = [];
  _supportPreview = [];
  _scSetCount(0);
  _scShowErrors([]);
  _refreshCanvas();
  if (_parsedRuns.length) doGenerate();
}

async function _scImportFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const ta = el('c2p-sc-textarea');
    if (ta) ta.value = text;
    _scPreview();
    setStatus(`Imported ${file.name} — review then click Apply.`, 'ok');
  } catch (err) {
    setStatus(`Import error: ${err.message}`, 'error');
  }
}

// ── Canvas mount ─────────────────────────────────────────────────────────────
let _canvasRoot  = null;
let _canvasEmits = [];   // emits the user drew on the canvas (non-sc* ids)

function _handleCanvasEmitsChange(emits) {
  // Filter out textarea-sourced stubs (id prefix 'sc') — keep only user-drawn ones
  _canvasEmits = emits.filter(e => !String(e.id).startsWith('sc'));
  if (_parsedRuns.length) doGenerate();
}

async function _mountCanvas() {
  const mountEl = el('c2p-canvas-mount');
  if (!mountEl) return;
  try {
    const [{ default: React }, { createRoot }, { default: PcfGeneratorUI }] =
      await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('../../canvas.jsx'),
      ]);
    _canvasRoot = createRoot(mountEl);
    _canvasRoot.render(
      React.createElement(PcfGeneratorUI, {
        externalRoute:  null,
        externalEmits:  null,
        previewPoints:  [],
        onEmitsChange:  _handleCanvasEmitsChange,
      })
    );
  } catch (err) {
    console.warn('[Canvas] Failed to mount canvas preview:', err);
  }
}

function _refreshCanvas() {
  if (!_canvasRoot) return;
  import('react').then(({ default: React }) => {
    import('../../canvas.jsx').then(({ default: PcfGeneratorUI }) => {
      const route = _parsedRuns.length
        ? _parsedRuns.flatMap(r => r.points).map(p => [p.x, p.y])
        : null;

      // Textarea support points → emit stubs for canvas (use live textarea content)
      const scText = el('c2p-sc-textarea')?.value || '';
      const { points: livePoints } = parseCoordText(scText);
      const displayPoints = livePoints.length ? livePoints : _supportPoints;
      const activeRoute = route || [
        [0, 0], [0, 13000], [8000, 13000], [8000, 6000], [2000, 6000],
        [2000, -2000], [11000, -2000], [11000, 9000], [16000, 9000]
      ];

      function getProjectedEmitEnd(pt, routePts) {
        let bestDist = Infinity;
        let proj = [pt[0] + 500, pt[1]];
        for (let i = 0; i < routePts.length - 1; i++) {
          const a = routePts[i], b = routePts[i+1];
          const isVert = Math.abs(a[0] - b[0]) < 1e-6;
          const isHoriz = Math.abs(a[1] - b[1]) < 1e-6;
          if (isVert && pt[1] >= Math.min(a[1], b[1]) - 10 && pt[1] <= Math.max(a[1], b[1]) + 10) {
            const d = Math.abs(pt[0] - a[0]);
            if (d < bestDist) {
              bestDist = d;
              proj = [pt[0] + (a[0] >= pt[0] ? d + 200 : -(d + 200)), pt[1]];
            }
          } else if (isHoriz && pt[0] >= Math.min(a[0], b[0]) - 10 && pt[0] <= Math.max(a[0], b[0]) + 10) {
            const d = Math.abs(pt[1] - a[1]);
            if (d < bestDist) {
              bestDist = d;
              proj = [pt[0], pt[1] + (a[1] >= pt[1] ? d + 200 : -(d + 200))];
            }
          }
        }
        return proj;
      }

      const textareaEmits = displayPoints.map((pt, i) => ({
        id: `sc${i + 1}`,
        p1: pt,
        p2: getProjectedEmitEnd(pt, activeRoute),
      }));

      // Combine textarea stubs + user-drawn canvas emits
      const allEmits = [...textareaEmits, ..._canvasEmits];

      _canvasRoot.render(
        React.createElement(PcfGeneratorUI, {
          externalRoute:  route,
          externalEmits:  allEmits.length ? allEmits : null,
          previewPoints:  _supportPreview,
          onEmitsChange:  _handleCanvasEmitsChange,
        })
      );
    });
  });
}

// ── Dynamic PCF: re-generate when any option changes ─────────────────────────
function _bindOptionsDynamic() {
  const ids = [
    'c2p-bore','c2p-scale','c2p-pipeline-ref',
    'c2p-ca1','c2p-ca2','c2p-ca3','c2p-ca4','c2p-ca5',
    'c2p-ca6','c2p-ca7','c2p-ca8','c2p-ca9','c2p-ca10',
    'c2p-pipe-only','c2p-rest-support',
  ];
  ids.forEach(id => {
    el(id)?.addEventListener('change', () => { if (_parsedRuns.length) doGenerate(); });
  });
}

// ── Public init ───────────────────────────────────────────────────────────────
export function initCoord2PcfTab() {
  // Mode toggle
  el('c2p-mode-text')?.addEventListener('click', () => setInputMode('text'));
  el('c2p-mode-csv')?.addEventListener('click',  () => setInputMode('csv'));

  // Mock data button — loads route into Raw Text AND support coords
  el('c2p-btn-mock')?.addEventListener('click', () => {
    if (el('c2p-text-input')) el('c2p-text-input').value = MOCK_RAW;
    if (el('c2p-sc-textarea')) el('c2p-sc-textarea').value = MOCK_SUPPORT_COORDS;
    if (el('c2p-scale')) el('c2p-scale').value = '1';  // mock coords are already in mm
    _supportPreview = [];
    _supportPoints  = [];
    _scSetCount(0);
    _scShowErrors([]);
    setInputMode('text');
    setStatus('Mock data loaded — click Parse to Table, then Generate PCF.', 'ok');
    _refreshCanvas();
  });

  // Parse to table
  el('c2p-btn-parse')?.addEventListener('click', doParse);

  // Generate PCF
  el('c2p-btn-generate')?.addEventListener('click', doGenerate);

  // Copy / Download
  el('c2p-btn-copy')?.addEventListener('click', doCopy);
  el('c2p-btn-download')?.addEventListener('click', doDownload);

  // File import (CSV/Excel route)
  el('c2p-file-input')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) handleFileImport(f);
    e.target.value = '';
  });
  el('c2p-btn-import')?.addEventListener('click', () => el('c2p-file-input')?.click());

  // Support coordinates UI
  el('c2p-sc-preview-btn')?.addEventListener('click', _scPreview);
  el('c2p-sc-apply-btn')?.addEventListener('click',   _scApply);
  el('c2p-sc-clear-btn')?.addEventListener('click',   _scClear);
  el('c2p-sc-import-btn')?.addEventListener('click',  () => el('c2p-sc-file')?.click());
  el('c2p-sc-file')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) _scImportFile(f);
    e.target.value = '';
  });

  // Debug panel
  el('c2p-debug-header')?.addEventListener('click', toggleDebug);

  // Start collapsed
  const body = el('c2p-debug-body');
  if (body) body.style.display = 'none';

  // Bind dynamic PCF regeneration on options change
  _bindOptionsDynamic();

  // Mount canvas preview
  _mountCanvas();

  setStatus('Ready — paste coordinates or import a file.');
}
