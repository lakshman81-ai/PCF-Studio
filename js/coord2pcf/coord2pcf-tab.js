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

// ── Mock data (from user's request) ─────────────────────────────────────────
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
let _parsedRuns   = [];  // array of { points[], metadata }
let _components   = [];  // classified components from analyzer
let _inputMode    = 'text'; // 'text' | 'csv'

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

  const { pcfText, stats } = generatePCF(components, {
    bore,
    pipelineRef:      (el('c2p-pipeline-ref')?.value || '').trim(),
    ca:               getCA(),
    decimalPrecision: 4,
    windowsLineEndings: true,
  });

  const outEl = el('c2p-pcf-output');
  if (outEl) outEl.value = pcfText;

  appendLog([
    `[Stats] PIPE=${stats.pipe}  BEND=${stats.bend}  TEE=${stats.tee}  SUPPORT=${stats.support}  SKIPPED=${stats.skipped}`,
  ]);

  setStatus(
    pipeOnly
      ? `[PIPE-ONLY] ${stats.pipe} pipe segment(s) — raw topology check. Uncheck "Pipes Only" to add elbows.`
      : `Generated PCF — ${stats.pipe} pipe(s), ${stats.bend} bend(s), ${stats.tee} tee(s), ${stats.support} support(s)`,
    'ok'
  );
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

// ── Public init ───────────────────────────────────────────────────────────────
export function initCoord2PcfTab() {
  // Mode toggle
  el('c2p-mode-text')?.addEventListener('click', () => setInputMode('text'));
  el('c2p-mode-csv')?.addEventListener('click',  () => setInputMode('csv'));

  // Mock data button
  el('c2p-btn-mock')?.addEventListener('click', () => {
    if (el('c2p-text-input')) el('c2p-text-input').value = MOCK_DATA;
    setInputMode('text');
    setStatus('Mock data loaded — click Parse to Table.', 'ok');
  });

  // Parse to table
  el('c2p-btn-parse')?.addEventListener('click', doParse);

  // Generate PCF
  el('c2p-btn-generate')?.addEventListener('click', doGenerate);

  // Copy / Download
  el('c2p-btn-copy')?.addEventListener('click', doCopy);
  el('c2p-btn-download')?.addEventListener('click', doDownload);

  // File import (CSV/Excel)
  el('c2p-file-input')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) handleFileImport(f);
    e.target.value = ''; // reset for re-import
  });
  el('c2p-btn-import')?.addEventListener('click', () => el('c2p-file-input')?.click());

  // Debug panel
  el('c2p-debug-header')?.addEventListener('click', toggleDebug);

  // Start collapsed
  const body = el('c2p-debug-body');
  if (body) body.style.display = 'none';

  setStatus('Ready — paste coordinates or import a file.');
}
