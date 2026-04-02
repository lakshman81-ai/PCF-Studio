/**
 * rc-tab.js — New Ray Concept Tab: Full UI orchestrator
 * Coordinates all 4 stages, RayConfig panel, pass log, stage output previews,
 * download buttons, and Debug sub-tab.
 * 100% independent — only imports from rc-* siblings and reads from DOM.
 */

import { getRayConfig, setRayConfig, resetRayConfig } from './rc-config.js';
import { runStage1, emit2DCSV } from './rc-stage1-parser.js';
import { runStage2 } from './rc-stage2-extractor.js';
import { runStage3 } from './rc-stage3-ray-engine.js';
import { runStage4 } from './rc-stage4-emitter.js';
import { debugLog, clearLog, getLog, renderDebugTab } from './rc-debug.js';
import { loadMastersInto }    from './rc-master-loader.js';
import { lookupPipelineRefs, formatDetailForLog } from './rc-pipeline-lookup.js';
import { getConfig }          from '../config/config-store.js';
import { readExcelAsCSV, isExcelFile } from '../input/excel-parser.js';

// ── Internal state (isolated to this tab) ────────────────────────────────────
const rcState = {
  rawCsvText:      null,
  rawFileName:     '',
  components:      [],   // Stage 1 output
  csv2DText:       '',   // Stage 1 CSV text
  fittingsPcfText: '',   // Stage 2 output
  connectionMatrix:[],   // Stage 3 output
  injectedPipes:   [],   // Stage 3 bridges
  pipelineRef:     '',   // derived from Stage 1
  isoMetricPcfText:'',   // Stage 4 output
  finalComponents: [],   // rcState.components + normalised bridge pipes (post-S3)
  finalCsv2DText:  '',   // emit2DCSV(finalComponents, cfg)
  stageStatus: { s1: 'idle', s2: 'idle', s3: 'idle', s4: 'idle' },
  mastersLog:      []    // Masters / Pipeline button event log
};

// ── Bootstrap (called from app.js) ───────────────────────────────────────────
export function initRayConceptTab() {
  const root = document.getElementById('panel-new-ray');
  if (!root) return;
  root.innerHTML = buildPanelHTML();
  wireEvents(root);
  // Expose 2D CSV components for cross-module access (e.g. Smart Fixer "Refresh from 2D CSV")
  window.__getRc2DComponents = () => rcState.components ?? [];
}

// ── Panel HTML ────────────────────────────────────────────────────────────────
function buildPanelHTML() {
  // ── Inline SVG icons (Lucide-style, 14×14) ───────────────────────────────
  const ico = (d, w=14, h=14) =>
    `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0">${d}</svg>`;
  const ICO = {
    upload:   ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    download: ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    mapPin:   ico('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    database: ico('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'),
    send:     ico('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
    settings: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
    play:     ico('<polygon points="5 3 19 12 5 21 5 3"/>'),
    plus:     ico('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  };

  // ── Button style helpers ─────────────────────────────────────────────────
  // Run All — amber, soft rounded, Inter
  const pillPrimary = `display:inline-flex;align-items:center;gap:5px;font-size:0.73rem;font-family:var(--font-inter);font-weight:600;padding:4px 11px;border-radius:6px;cursor:pointer;border:none;background:var(--amber);color:#000;box-shadow:0 1px 3px rgba(245,158,11,0.25);transition:all 150ms ease`;
  // Amber action buttons — soft rounded, Inter
  const actionPill = `display:inline-flex;align-items:center;gap:4px;font-size:0.70rem;font-family:var(--font-inter);font-weight:500;padding:3px 8px;border-radius:6px;cursor:pointer;border:none;background:var(--amber);color:#000;box-shadow:0 1px 2px rgba(0,0,0,0.12);transition:all 150ms ease`;
  // Ghost buttons — soft rounded, Inter
  const ghost = `display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-family:var(--font-inter);font-weight:400;padding:3px 8px;border-radius:6px;cursor:pointer;border:1px solid var(--steel);background:transparent;color:var(--text-muted);transition:all 150ms ease`;

  return `
<div style="display:flex;flex-direction:column;height:100%;gap:0;padding:0;overflow:hidden">

  <!-- ── Tier 1: Pipeline Bar (brand + steps merged) ── -->
  <div class="rc-toolbar-tier rc-tier-stepper">
    <!-- Brand zone -->
    <div class="rc-tier-brand">
      <span class="rc-brand-mark">⚡ RAY</span>
      <input type="file" id="rc-file-input" accept=".csv,.txt,.xlsx,.xls,.xlsm" style="display:none">
      <button id="rc-btn-upload" style="${actionPill}">${ICO.upload} CSV / XLSX</button>
      <span id="rc-filename" class="rc-filename">No file loaded</span>
    </div>
    <span class="rc-brand-sep"></span>
    <!-- PARSE group -->
    <div class="rc-step-group">
      <span class="rc-step-group-label" style="color:rgba(96,165,250,0.6)">Parse</span>
      <div class="rc-step-group-btns">
        <button id="rc-btn-s1" class="rc-step-node" data-status="idle" disabled title="Parse CSV → 2D CSV"><span class="rc-step-badge">S1</span>Parse</button>
        <span class="rc-step-connector" id="rc-conn-s1-s2"></span>
        <button id="rc-btn-s2" class="rc-step-node" data-status="idle" disabled title="2D CSV → Fittings PCF"><span class="rc-step-badge">S2</span>Fittings</button>
      </div>
    </div>
    <span class="rc-group-divider"></span>
    <!-- RAY ENGINE group -->
    <div class="rc-step-group">
      <span class="rc-step-group-label" style="color:rgba(167,139,250,0.6)">Ray Engine</span>
      <div class="rc-step-group-btns">
        <button id="rc-btn-s3p0" class="rc-step-node" data-status="idle" disabled title="P0 Gap Fill"><span class="rc-step-badge">P0</span>Gap</button>
        <span class="rc-step-connector" id="rc-conn-p0-p1"></span>
        <button id="rc-btn-s3p1" class="rc-step-node" data-status="idle" disabled title="P1 Bridge"><span class="rc-step-badge">P1</span>Bridge</button>
        <span class="rc-step-connector" id="rc-conn-p1-p2"></span>
        <button id="rc-btn-s3p2" class="rc-step-node" data-status="idle" disabled title="P2 Branch"><span class="rc-step-badge">P2</span>Branch</button>
      </div>
    </div>
    <span class="rc-group-divider"></span>
    <!-- EMIT group -->
    <div class="rc-step-group">
      <span class="rc-step-group-label" style="color:rgba(52,211,153,0.6)">Emit</span>
      <div class="rc-step-group-btns">
        <button id="rc-btn-s4" class="rc-step-node" data-status="idle" disabled title="Emit Isometric PCF"><span class="rc-step-badge">S4</span>Emit</button>
      </div>
    </div>
    <!-- Run All + Config -->
    <button id="rc-btn-run-all" style="${pillPrimary};margin-left:auto;align-self:flex-end" disabled>${ICO.play} Run All</button>
    <button id="rc-btn-config-toggle" style="${ghost};align-self:flex-end">${ICO.settings} Settings</button>
  </div>

  <!-- ── Tier 2: Actions ── -->
  <div class="rc-toolbar-tier rc-tier-actions">
    <!-- Data Enrichment group -->
    <div class="rc-action-group enrichment">
      <span class="rc-action-group-label">Enrich</span>
      <button id="rc-btn-load-masters" style="${actionPill}" disabled>${ICO.database} Masters</button>
      <button id="rc-btn-pipeline-lookup" style="${actionPill}" disabled title="Match component coordinates against Line Dump from E3D to populate Pipeline Reference, Line No Key, Piping Class and Rating on Final 2D CSV">${ICO.mapPin} Pipeline Ref</button>
      <span id="rc-masters-status" style="font-size:0.68rem;color:var(--text-muted);font-family:var(--font-inter)"></span>
    </div>
    <!-- Interface group -->
    <div class="rc-action-group interface">
      <span class="rc-action-group-label">Interface</span>
      <button id="rc-btn-push-datatable" style="${actionPill}" disabled title="Push Final 2D CSV rows to PCF Fixer datatable">${ICO.send} Push to Datatable</button>
    </div>
    <!-- Export dropdown — rightmost -->
    <div class="rc-export-wrap" style="position:relative;margin-left:auto">
      <button id="rc-btn-export-toggle" style="${ghost};display:inline-flex;align-items:center;gap:5px" title="Export outputs">
        ${ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 15)}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <!-- Dropdown menu -->
      <div id="rc-export-menu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);min-width:160px;background:var(--bg-2);border:1px solid var(--steel);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);padding:4px;z-index:200;overflow:hidden">
        <div style="font-size:0.55rem;font-family:var(--font-inter);font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;padding:4px 10px 2px;opacity:0.6">Export</div>
        <button id="rc-btn-save-2dcsv"      class="rc-menu-item" disabled>${ICO.download} 2D CSV</button>
        <button id="rc-btn-save-final2dcsv" class="rc-menu-item" disabled>${ICO.download} Final CSV</button>
        <button id="rc-btn-save-fittings"   class="rc-menu-item" disabled>${ICO.download} Fittings</button>
        <button id="rc-btn-save-iso"        class="rc-menu-item" style="border-top:1px solid var(--steel);margin-top:2px;padding-top:6px" disabled>${ICO.download} Isometric</button>
      </div>
    </div>
  </div>

  <!-- ── RayConfig panel (collapsible) ── -->
  <div id="rc-config-panel" style="display:none;border-bottom:1px solid var(--steel);padding:0.5rem 0.6rem;background:var(--bg-panel);flex-shrink:0">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.4rem" id="rc-config-grid"></div>
    <div style="margin-top:0.5rem;border-top:1px solid var(--steel);padding-top:0.5rem">
      <div style="font-size:0.68rem;font-weight:700;color:var(--amber);margin-bottom:0.35rem;font-family:var(--font-code);letter-spacing:0.05em">SUPPORT MAPPING</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-bottom:0.4rem">
        <label style="display:flex;flex-direction:column;gap:2px;font-size:0.68rem;color:var(--text-muted)">
          GUID Prefix <span style="font-size:0.62rem;opacity:.6">(mandatory)</span>
          <input data-cfg="supportMapping.guidPrefix" type="text" value="UCI:"
            style="font-size:0.7rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 5px">
        </label>
        <label style="display:flex;flex-direction:column;gap:2px;font-size:0.68rem;color:var(--text-muted)">
          Fallback Name
          <input id="rc-cfg-fallback-name" data-cfg-sm="fallbackName" type="text" value="RST"
            style="font-size:0.7rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 5px">
        </label>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.67rem;font-family:var(--font-code)">
        <thead><tr>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Block</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Friction</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Gap</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">→ Name</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Description</th>
        </tr></thead>
        <tbody id="rc-cfg-sm-blocks"></tbody>
      </table>
      <div style="margin-top:0.35rem">
        <button id="rc-btn-sm-add-block" style="${ghost};padding:2px 8px">${ICO.plus} Add Block</button>
      </div>
    </div>
    <div style="margin-top:0.4rem;display:flex;gap:0.5rem">
      <button id="rc-btn-config-apply" style="${pillPrimary}">✓ Apply</button>
      <button id="rc-btn-config-reset" style="${ghost}">↺ Defaults</button>
    </div>
  </div>

  <!-- ── Main content: log + preview ── -->
  <div style="display:flex;gap:0;flex:1;min-height:0">

    <!-- Left: pass log -->
    <div style="width:210px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--steel)">
      <div style="padding:4px 8px;font-size:0.56rem;font-weight:600;letter-spacing:0.08em;color:var(--amber);background:var(--bg-panel);border-bottom:1px solid var(--steel);text-transform:uppercase;font-family:var(--font-inter)">
        Pipeline Console
      </div>
      <div id="rc-pass-log" style="flex:1;overflow-y:auto;font-family:var(--font-code);font-size:0.66rem;padding:0.4rem 0.5rem;background:#080c0a;color:#2ecc71;white-space:pre-wrap;line-height:1.5">
        <span style="color:var(--text-muted);font-style:italic">Awaiting input…</span>
      </div>
    </div>

    <!-- Right: sub-tabs + preview -->
    <div style="flex:1;display:flex;flex-direction:column;min-width:0">

      <!-- Sub-tab bar -->
      <div style="display:flex;align-items:center;border-bottom:1px solid var(--steel);background:var(--bg-2);flex-shrink:0;padding:0 0.5rem;gap:0.15rem;min-height:36px">
        <!-- Sub-tabs — pill active state -->
        <button class="rc-subtab-btn active" data-subtab="pipeline" style="${subtabStyle(true)}">
          ${ico('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', 13)} Pipeline
        </button>
        <button class="rc-subtab-btn" data-subtab="debug" style="${subtabStyle(false)}">
          ${ico('<path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M22 13h-4"/>', 13)} Debug
        </button>
        <button class="rc-subtab-btn" data-subtab="masterslog" style="${subtabStyle(false)}">
          ${ico('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>', 13)} Masters Log
        </button>
        <!-- VIEW group — right side -->
        <div style="display:flex;align-items:center;gap:0.15rem;margin-left:auto;background:var(--bg-1);border:1px solid var(--steel);border-radius:6px;padding:3px 4px">
          <span style="font-size:0.55rem;font-family:var(--font-inter);font-weight:600;color:var(--text-muted);padding:0 5px 0 3px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.55">View</span>
          <button class="rc-preview-btn active" data-preview="2dcsv"   style="${previewBtnStyle(true)}">2D CSV</button>
          <button class="rc-preview-btn" data-preview="fittings"        style="${previewBtnStyle(false)}">Fittings PCF</button>
          <button class="rc-preview-btn" data-preview="connmap"         style="${previewBtnStyle(false)}">Conn Map</button>
          <button class="rc-preview-btn" data-preview="final2dcsv"      style="${previewBtnStyle(false)}">Final 2D CSV</button>
          <button class="rc-preview-btn" data-preview="isofinal"        style="${previewBtnStyle(false)}">Isometric PCF</button>
        </div>
        <span id="rc-diff-badge" style="font-size:0.65rem;font-family:var(--font-inter);padding:1px 6px;border-radius:4px;display:none;margin-left:4px"></span>
        <button id="rc-btn-copy-preview" style="display:inline-flex;align-items:center;padding:4px 6px;cursor:pointer;border:1px solid var(--steel);border-radius:5px;background:transparent;color:var(--text-muted);margin-left:4px;transition:all 150ms ease" title="Copy to clipboard">
          ${ico('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>', 12)}
        </button>
      </div>

      <!-- Pipeline sub-tab (preview area) -->
      <div id="rc-subtab-pipeline" style="flex:1;display:flex;flex-direction:column;min-height:0">
        <div id="rc-preview-area" style="flex:1;overflow:auto;background:var(--bg-0);font-family:var(--font-code);font-size:0.7rem;padding:0.5rem 0.6rem;white-space:pre;color:var(--text-primary);line-height:1.55">
          <span style="color:var(--text-muted);font-style:italic">Load a Raw CSV file and run the pipeline stages.</span>
        </div>
      </div>

      <!-- Debug sub-tab -->
      <div id="rc-subtab-debug" style="flex:1;display:none;min-height:0;overflow:hidden">
        <div id="rc-debug-container" style="height:100%;overflow:auto"></div>
      </div>

      <!-- Masters Log sub-tab -->
      <div id="rc-subtab-masterslog" style="flex:1;display:none;flex-direction:column;min-height:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.6rem;background:var(--bg-panel);border-bottom:1px solid var(--steel);flex-shrink:0">
          <span style="font-size:0.68rem;font-weight:700;letter-spacing:0.06em;color:var(--amber);font-family:var(--font-code)">MASTERS / PIPELINE LOG</span>
          <label style="display:flex;align-items:center;gap:4px;font-size:0.65rem;color:var(--text-muted);cursor:pointer;margin-left:auto;user-select:none" title="Collapse consecutive identical warnings/skips beyond 5 occurrences">
            <input type="checkbox" id="rc-masterslog-limit" checked style="cursor:pointer;accent-color:var(--amber)">
            Limit repeating to 5
          </label>
          <button id="rc-btn-clear-masterslog" style="font-size:0.65rem;padding:2px 8px;cursor:pointer;border:1px solid var(--steel);border-radius:3px;background:transparent;color:var(--text-muted)">🗑 Clear</button>
        </div>
        <div id="rc-masterslog-container" style="flex:1;overflow:auto;font-family:var(--font-code);font-size:0.68rem;background:var(--bg-0);padding:0.4rem 0.6rem">
          <span style="color:var(--text-muted);font-style:italic">No events yet — click 📥 Masters or 📍 Pipeline to log activity.</span>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────
function wireEvents(root) {
  // File upload
  root.querySelector('#rc-btn-upload').addEventListener('click', () =>
    root.querySelector('#rc-file-input').click());
  root.querySelector('#rc-file-input').addEventListener('change', e => { void onFileLoad(e, root); });

  // RayConfig toggle
  root.querySelector('#rc-btn-config-toggle').addEventListener('click', () =>
    toggleConfig(root));
  root.querySelector('#rc-btn-config-apply').addEventListener('click', () =>
    applyConfig(root));
  root.querySelector('#rc-btn-config-reset').addEventListener('click', () =>
    resetConfig(root));

  // Pipeline buttons
  root.querySelector('#rc-btn-s1').addEventListener('click', () => runS1(root));
  root.querySelector('#rc-btn-s2').addEventListener('click', () => runS2(root));
  root.querySelector('#rc-btn-s3p0').addEventListener('click', () => runS3(root, { p0:true,  p1:false, p2:false }));
  root.querySelector('#rc-btn-s3p1').addEventListener('click', () => runS3(root, { p0:false, p1:true,  p2:false }));
  root.querySelector('#rc-btn-s3p2').addEventListener('click', () => runS3(root, { p0:false, p1:false, p2:true  }));
  root.querySelector('#rc-btn-s4').addEventListener('click', () => runS4(root));
  root.querySelector('#rc-btn-run-all').addEventListener('click', () => runAll(root));

  // Download buttons
  root.querySelector('#rc-btn-save-fittings').addEventListener('click', () =>
    saveFile(rcState.fittingsPcfText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_fittings.pcf'));
  root.querySelector('#rc-btn-save-iso').addEventListener('click', () =>
    saveFile(rcState.isoMetricPcfText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_isometric.pcf'));
  root.querySelector('#rc-btn-save-2dcsv').addEventListener('click', () =>
    saveFile(rcState.csv2DText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_2d.csv'));
  root.querySelector('#rc-btn-save-final2dcsv').addEventListener('click', () =>
    saveFile(rcState.finalCsv2DText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_final2d.csv'));
  root.querySelector('#rc-btn-push-datatable').addEventListener('click', () => runPushToDatatable(root));

  // Preview selector
  root.querySelectorAll('.rc-preview-btn').forEach(btn =>
    btn.addEventListener('click', () => switchPreview(root, btn.dataset.preview)));

  // Copy preview content
  root.querySelector('#rc-btn-copy-preview').addEventListener('click', () => {
    const el = root.querySelector('#rc-preview-area');
    if (!el) return;
    const text = el.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = root.querySelector('#rc-btn-copy-preview');
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });

  // Sub-tab switches
  root.querySelectorAll('.rc-subtab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchSubTab(root, btn.dataset.subtab)));

  // Load masters button
  root.querySelector('#rc-btn-load-masters').addEventListener('click', () => runLoadMasters(root));

  // Pipeline lookup button
  root.querySelector('#rc-btn-pipeline-lookup').addEventListener('click', () => runPipelineLookup(root));

  // Export dropdown toggle — use fixed positioning to escape overflow:auto clip
  root.querySelector('#rc-btn-export-toggle').addEventListener('click', () => {
    const menu = root.querySelector('#rc-export-menu');
    if (!menu) return;
    if (menu.style.display !== 'none') { menu.style.display = 'none'; return; }
    const btn  = root.querySelector('#rc-btn-export-toggle');
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top      = (rect.bottom + 4) + 'px';
    menu.style.right    = (window.innerWidth - rect.right) + 'px';
    menu.style.left     = 'auto';
    menu.style.display  = 'block';
  });
  document.addEventListener('click', (e) => {
    const wrap = root.querySelector('.rc-export-wrap');
    if (wrap && wrap.contains(e.target)) return;
    const menu = root.querySelector('#rc-export-menu');
    if (menu) menu.style.display = 'none';
  });

  // Masters Log — delegated events (buttons and inputs inside the sub-tab)
  root.addEventListener('click', e => {
    if (e.target.id === 'rc-btn-clear-masterslog') {
      rcState.mastersLog = [];
      _renderMastersLog(root);
    }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'rc-masterslog-limit') _renderMastersLog(root);
  });

  // Build RayConfig grid
  buildConfigGrid(root);
}

// ── Step status helper ────────────────────────────────────────────────────────
function setStepStatus(root, sel, status) {
  const el = root.querySelector(sel);
  if (el) el.dataset.status = status;
}
function setConnDone(root, id) {
  const el = root.querySelector(`#${id}`);
  if (el) el.classList.add('done');
}

// ── File load ─────────────────────────────────────────────────────────────────
async function onFileLoad(e, root) {
  const file = e.target.files[0];
  if (!file) return;
  rcState.rawFileName = file.name;
  root.querySelector('#rc-filename').textContent = file.name;

  try {
    passLog(root, `── INPUT  ${_now()} ─────────`, 'header');
    passLog(root, `  ${file.name}`, 'info');
    if (isExcelFile(file)) {
      const { csv, sheetName } = await readExcelAsCSV(file);
      rcState.rawCsvText = csv;
      passLog(root, `  ∙ Source sheet: ${sheetName}`, 'stat');
    } else {
      rcState.rawCsvText = await file.text();
    }

    setBtn(root, '#rc-btn-s1', true);
    setBtn(root, '#rc-btn-run-all', true);
    setStepStatus(root, '#rc-btn-s1', 'ready');
    const rawLines = String(rcState.rawCsvText || '').split('\n').length;
    passLog(root, `  ∙ ${rawLines} raw lines`, 'stat');
  } catch (err) {
    passLog(root, `✕ Input load failed: ${err.message}`, 'error');
    _mastersLog('error', '❌ Input load failed', { file: file.name, error: err.message });
  } finally {
    e.target.value = '';
  }
}

// ── Stage runners ─────────────────────────────────────────────────────────────
async function runS1(root) {
  if (!rcState.rawCsvText) return;
  clearLog();
  passLog(root, `── S1  PARSE  ${_now()} ──────`, 'header');
  try {
    const { components, csvText } = runStage1(rcState.rawCsvText, debugLog);
    rcState.components = components;
    rcState.csv2DText  = csvText;
    rcState.pipelineRef = components.find(c => c.pipelineRef)?.pipelineRef || '';
    rcState.stageStatus.s1 = 'done';
    // Component type breakdown
    const tc = {};
    for (const c of components) tc[c.type] = (tc[c.type] || 0) + 1;
    passLog(root, `✓ ${components.length} components`, 'success');
    for (const [t, n] of Object.entries(tc).sort((a,b) => b[1]-a[1]))
      passLog(root, `  ∙ ${t.padEnd(10)} ${n}`, 'stat');
    if (rcState.pipelineRef)
      passLog(root, `  ref: ${rcState.pipelineRef}`, 'stat');
    setStepStatus(root, '#rc-btn-s1', 'done');
    setStepStatus(root, '#rc-btn-s2', 'ready');
    setConnDone(root, 'rc-conn-s1-s2');
    setBtn(root, '#rc-btn-s2', true);
    setBtn(root, '#rc-btn-save-2dcsv', true);
    setBtn(root, '#rc-btn-load-masters', true);
    setBtn(root, '#rc-btn-pipeline-lookup', true);
    render2DTable(root, csvText);
    activatePreviewBtn(root, '2dcsv');
    setBadge(root, '2dcsv', 'done');
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s1 = 'error';
  }
}

async function runS2(root) {
  if (!rcState.components.length) return;
  passLog(root, `── S2  FITTINGS  ${_now()} ───`, 'header');
  try {
    const { pcfText } = runStage2(rcState.components, debugLog);
    rcState.fittingsPcfText = pcfText;
    rcState.stageStatus.s2 = 'done';
    const fitCount = (pcfText.match(/^(FLANGE|BEND|TEE|OLET|VALVE|SUPPORT|ELBOW)/gm) || []).length;
    passLog(root, `✓ ${fitCount} fitting blocks`, 'success');
    // Per-type breakdown
    const ft = {};
    (pcfText.match(/^(FLANGE|BEND|TEE|OLET|VALVE|SUPPORT|ELBOW)/gm)||[]).forEach(t => ft[t]=(ft[t]||0)+1);
    for (const [t,n] of Object.entries(ft).sort((a,b)=>b[1]-a[1]))
      passLog(root, `  ∙ ${t.padEnd(10)} ${n}`, 'stat');
    setStepStatus(root, '#rc-btn-s2', 'done');
    setStepStatus(root, '#rc-btn-s3p0', 'ready');
    setStepStatus(root, '#rc-btn-s3p1', 'ready');
    setStepStatus(root, '#rc-btn-s3p2', 'ready');
    setBtn(root, '#rc-btn-s3p0', true);
    setBtn(root, '#rc-btn-s3p1', true);
    setBtn(root, '#rc-btn-s3p2', true);
    setBtn(root, '#rc-btn-save-fittings', true);
    showPreview(root, 'rc-preview-area', pcfText);
    activatePreviewBtn(root, 'fittings');
    setBadge(root, 'fittings', 'done');
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s2 = 'error';
  }
}

async function runS3(root, passOverride = null) {
  if (!rcState.components.length) return;
  passLog(root, `── S3  RAY ENGINE  ${_now()} ─`, 'header');
  const cfg = getRayConfig();
  if (passOverride) setRayConfig({ passEnabled: passOverride });
  try {
    const result = runStage3(rcState.components, rcState.pipelineRef, debugLog);
    rcState.injectedPipes    = result.injectedPipes;
    rcState.connectionMatrix = result.connectionMatrix;
    rcState.stageStatus.s3   = 'done';
    const { p0, p1, p2 }    = result.passStats;
    passLog(root, `  P0 gap-fill   ${p0}`, 'stat');
    passLog(root, `  P1 bridges    ${p1}`, 'stat');
    passLog(root, `  P2 branches   ${p2}`, 'stat');
    const orphans = result.orphanList.length;
    if (orphans > 0)
      passLog(root, `  ⚠ ${orphans} orphan${orphans !== 1 ? 's' : ''} open`, 'warn');
    else
      passLog(root, `✓ All endpoints connected`, 'success');
    setStepStatus(root, '#rc-btn-s3p0', 'done');
    setStepStatus(root, '#rc-btn-s3p1', 'done');
    setStepStatus(root, '#rc-btn-s3p2', 'done');
    setStepStatus(root, '#rc-btn-s4', 'ready');
    setConnDone(root, 'rc-conn-p0-p1');
    setConnDone(root, 'rc-conn-p1-p2');
    setBtn(root, '#rc-btn-s4', true);
    setBtn(root, '#rc-btn-pipeline-lookup', true);
    _buildFinalComponents();
    setBtn(root, '#rc-btn-save-final2dcsv', true);
    showConnMapPreview(root, result.connectionMatrix);
    activatePreviewBtn(root, 'connmap');
    // Re-render debug tab if open
    const dbgContainer = root.querySelector('#rc-debug-container');
    renderDebugTab(dbgContainer, rcState.connectionMatrix);
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s3 = 'error';
  }
}

async function runS4(root) {
  if (!rcState.components.length) return;
  passLog(root, `── S4  EMIT ISO  ${_now()} ──`, 'header');
  try {
    const { pcfText } = runStage4(
      rcState.components, rcState.injectedPipes, rcState.pipelineRef, debugLog
    );
    rcState.isoMetricPcfText = pcfText;
    rcState.stageStatus.s4   = 'done';
    const totalLines  = pcfText.split('\n').filter(l => l.trim()).length;
    const compBlocks  = (pcfText.match(/^(PIPE|FLANGE|BEND|TEE|OLET|VALVE|SUPPORT|ELBOW)/gm)||[]).length;
    const attrLines   = totalLines - compBlocks;
    passLog(root, `✓ ${totalLines} PCF lines`, 'success');
    passLog(root, `  ∙ ${compBlocks} component blocks`, 'stat');
    passLog(root, `  ∙ ${attrLines} attribute lines`, 'stat');
    if (rcState.injectedPipes?.length)
      passLog(root, `  ∙ ${rcState.injectedPipes.length} bridge pipes`, 'stat');
    setStepStatus(root, '#rc-btn-s4', 'done');
    _buildFinalComponents();
    setBtn(root, '#rc-btn-save-iso', true);
    setBtn(root, '#rc-btn-save-final2dcsv', true);
    setBtn(root, '#rc-btn-push-datatable', true);
    showPreview(root, 'rc-preview-area', pcfText);
    activatePreviewBtn(root, 'isofinal');
    setBadge(root, 'isofinal', 'done');
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s4 = 'error';
  }
}

async function runLoadMasters(root) {
  if (!rcState.components.length) return;
  const statusEl = root.querySelector('#rc-masters-status');
  if (statusEl) statusEl.textContent = '⏳ Loading…';
  _mastersLog('info', '📥 Masters started', { components: rcState.components.length });
  try {
    const cfg = getConfig();
    _mastersLog('info', 'Config loaded', {
      ratingMap2: JSON.stringify(cfg?.ratingPrefixMap?.twoChar || {}),
      ratingMap1: JSON.stringify(cfg?.ratingPrefixMap?.oneChar || {})
    });
    const updated = await loadMastersInto(rcState.components, cfg);
    _rebuildCsv2D();
    render2DTable(root, rcState.csv2DText);
    if (statusEl) statusEl.textContent = `✓ Updated ${updated} components`;
    passLog(root, `✓ Masters: ${updated} enriched`, 'success');
    _mastersLog('info', `✅ Masters complete — ${updated}/${rcState.components.length} components updated`);
    // Per-component detail log (CA values + rating)
    let withCA = 0, withRating = 0, noLineno = 0;
    for (const c of rcState.components) {
      if (c.ca1 || c.ca2 || c.ca5 || c.ca10) withCA++;
      if (c.rating) withRating++;
      if (!c.lineNoKey) noLineno++;
      _mastersLog('match', `${c.refNo || c.type} [${c.bore}nb]`, {
        lineNoKey: c.lineNoKey || '—', pipingClass: c.pipingClass || '—',
        rating: c.rating || '—', ca1: c.ca1 || '—', ca2: c.ca2 || '—',
        ca3: c.ca3 || '—', ca4: c.ca4 || '—', ca8: c.ca8 || '—'
      });
    }
    _mastersLog('info', 'Summary', { withCA, withRating, noLineNoKey: noLineno });
  } catch (err) {
    if (statusEl) statusEl.textContent = `✕ ${err.message}`;
    passLog(root, `✕ Masters: ${err.message}`, 'error');
    _mastersLog('error', `❌ ${err.message}`);
  }
}

async function runPipelineLookup(root) {
  // Operate on finalComponents if available (post-S3), else fall back to components
  const targets = rcState.finalComponents.length ? rcState.finalComponents : rcState.components;
  if (!targets.length) return;
  const usingFinal = rcState.finalComponents.length > 0;

  const statusEl = root.querySelector('#rc-masters-status');
  if (statusEl) statusEl.textContent = '⏳ Matching…';

  try {
    const cfg = getConfig();
    const pcLogic  = cfg?.smartData?.pipingClassLogic || {};

    const elevOffset = parseFloat(cfg?.smartData?.e3dElevationOffset ?? 0) || 0;
    // Probe the Line Dump header map so user can verify column detection
    const { dataManager: dm } = await import('../services/data-manager.js');
    const hm = dm.headerMap?.linedump || {};
    const sampleLD = dm.getLineDump()?.[0] || {};
    const UP_AL = ['Up','U','UP','up','Elevation','ELEV','Z','z'];
    const POS_AL = ['Position','position','POSITION','Pos','pos','Coordinate','Coord'];
    const resolvedZ = hm.z
      ? (sampleLD[hm.z] != null ? `'${hm.z}'` : `'${hm.z}'(missing)`)
      : UP_AL.find(a => sampleLD[a] != null)
          ? `auto:'${UP_AL.find(a => sampleLD[a] != null)}'`
          : POS_AL.find(a => sampleLD[a] != null)
              ? `packed-position:'${POS_AL.find(a => sampleLD[a] != null)}'`
              : '⚠ no Up col found';
    _mastersLog('info', `📍 Pipeline lookup started (${usingFinal ? 'Final CSV' : '2D CSV'})`, {
      components: targets.length,
      lineDumpRows: dm.getLineDump()?.length ?? 0,
      tolerance: '±25mm (segment)',
      elevOffset: elevOffset ? `+${elevOffset}mm to Up` : '0 (disabled)',
      coordSource: resolvedZ,
      delimiter: pcLogic.tokenDelimiter || '-',
      segment: typeof pcLogic.tokenIndex === 'number' ? pcLogic.tokenIndex + 1 : 5
    });

    const { updated, noLineDump, detail, coordError, hint } = lookupPipelineRefs(targets, cfg);

    if (noLineDump) {
      if (statusEl) statusEl.textContent = '⚠ No Line Dump loaded';
      passLog(root, `⚠ Line Dump empty`, 'warn');
      _mastersLog('warn', '⚠ Line Dump from E3D is empty — load it in Master Data first');
      switchSubTab(root, 'masterslog');
      return;
    }

    if (coordError) {
      if (statusEl) statusEl.textContent = '⚠ Line Dump column error';
      passLog(root, `✕ ${hint}`, 'error');
      _mastersLog('error', '❌ Line Dump coordinate columns not resolved', { hint });
      switchSubTab(root, 'masterslog');
      return;
    }

    // Rebuild the appropriate CSV and re-render the preview
    if (usingFinal) {
      rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());
      render2DTable(root, rcState.finalCsv2DText);
      activatePreviewBtn(root, 'final2dcsv');
    } else {
      _rebuildCsv2D();
      render2DTable(root, rcState.csv2DText);
      activatePreviewBtn(root, '2dcsv');
    }

    if (statusEl) statusEl.textContent = `✓ Pipeline matched ${updated}/${targets.length}`;
    passLog(root, `✓ Pipeline: ${updated}/${targets.length} matched`, 'success');
    _mastersLog('info', `✅ Pipeline lookup complete — ${updated}/${targets.length} matched`);

    // Per-component detail log
    let matched = 0, skipped = 0;
    for (const entry of detail) {
      const { type: logType, label, details } = formatDetailForLog(entry);
      _mastersLog(logType, label, details);
      if (logType === 'match') matched++; else skipped++;
    }
    if (skipped > 0) _mastersLog('warn', `${skipped} components had no Line Dump match`, { matched, skipped, total: targets.length });

    // Auto-switch to Masters Log sub-tab so user sees results
    switchSubTab(root, 'masterslog');

  } catch (err) {
    if (statusEl) statusEl.textContent = `✕ ${err.message}`;
    passLog(root, `✕ Pipeline: ${err.message}`, 'error');
    _mastersLog('error', `❌ ${err.message}`);
  }
}

async function runAll(root) {
  clearLog();
  passLog(root, `── RUN ALL  ${_now()} ────────`, 'header');
  await runS1(root);
  if (rcState.stageStatus.s1 !== 'done') return;
  await runS2(root);
  if (rcState.stageStatus.s2 !== 'done') return;
  await runS3(root);
  if (rcState.stageStatus.s3 !== 'done') return;
  await runS4(root);
  passLog(root, '', 'divider');
  passLog(root, `✓ Pipeline complete`, 'success');
  passLog(root, `  S1→S2→S3→S4 done`, 'stat');
}

// ── RayConfig UI ──────────────────────────────────────────────────────────────
const CONFIG_FIELDS = [
  { key: 'gapFillTolerance',  label: 'Gap Fill Tolerance (mm)', type: 'number', step: '0.1' },
  { key: 'rayMaxDistance',    label: 'Ray Max Distance (mm)',   type: 'number' },
  { key: 'boreTolMultiplier', label: 'Bore Tol. Multiplier',   type: 'number', step: '0.05' },
  { key: 'minBoreTol',        label: 'Min Bore Tol (mm)',      type: 'number' },
  { key: 'deadZoneMin',       label: 'Dead Zone Min (mm)',     type: 'number', step: '0.1' },
  { key: 'stubPipeLength',    label: 'Stub Pipe Length (mm)',  type: 'number', step: '0.1' },
  { key: 'decimalPrecision',  label: 'Decimal Precision',      type: 'number', min: '1', max: '8' },
  { key: 'supportName',       label: 'Support Name',           type: 'text' },
  { key: 'pipelineRefPrefix',  label: 'Pipeline Ref Prefix',         type: 'text' },
  { key: 'defaultPipingClass', label: 'Default Piping Class (2D CSV)', type: 'text' },
  { key: 'enableBoreInchToMm', label: 'Enable Bore Inch→MM', type: 'checkbox' },
  { key: 'axisSnapAngle',     label: 'Axis Snap Angle (°)',    type: 'number', step: '0.5' },
  { key: 'sixAxP1Diameter',   label: '6Ax P1 Diameter (mm)',  type: 'number', step: '1' },
  { key: 'sixAxP1MaxDist',    label: '6Ax P1 Max Dist (mm)',  type: 'number' },
  { key: 'sixAxP2Diameter',   label: '6Ax P2 Diameter (mm)',  type: 'number', step: '1' },
  { key: 'sixAxP2DiamREDU',   label: '6Ax P2 Diam REDU (mm)',type: 'number', step: '1' },
  { key: 'sixAxP2MaxDist',    label: '6Ax P2 Max Dist (mm)',  type: 'number' }
];

function buildConfigGrid(root) {
  const cfg = getRayConfig();
  const grid = root.querySelector('#rc-config-grid');
  if (!grid) return;
  grid.innerHTML = CONFIG_FIELDS.map(f => `
    <label style="display:flex;flex-direction:column;gap:2px;font-size:0.7rem;color:var(--text-muted)">
      ${f.label}
      <input data-cfg="${f.key}" type="${f.type}"
        ${f.step ? `step="${f.step}"` : ''}
        ${f.min !== undefined ? `min="${f.min}"` : ''}
        ${f.max !== undefined ? `max="${f.max}"` : ''}
        ${f.type === 'checkbox' ? ` ${cfg[f.key] ? 'checked' : ''}` : ` value="${cfg[f.key] ?? ''}"`}
        style="font-size:0.72rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 5px">
    </label>`).join('');

  // Support mapping section
  const smPrefixEl = root.querySelector('[data-cfg="supportMapping.guidPrefix"]');
  if (smPrefixEl) smPrefixEl.value = cfg.supportMapping.guidPrefix ?? 'UCI:';
  const smFallbackEl = root.querySelector('#rc-cfg-fallback-name');
  if (smFallbackEl) smFallbackEl.value = cfg.supportMapping.fallbackName ?? 'RST';
  const smTbody = root.querySelector('#rc-cfg-sm-blocks');
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (smTbody) {
    smTbody.innerHTML = cfg.supportMapping.blocks.map(b => `
      <tr>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="label" type="text" value="${esc(b.label || `Block ${b.id}`)}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="frictionMatch" type="text" value="${esc((b.frictionMatch || []).join(' / '))}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="gapCondition" type="text" value="${esc(b.gapCondition || 'any')}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--amber);font-weight:600">
          <input data-cfg-block="${b.id}" data-cfg-block-field="name" type="text" value="${esc(b.name)}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--amber);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="desc" type="text" value="${esc(b.desc || '')}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-muted);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
      </tr>`).join('');
  }

  root.querySelector('#rc-btn-sm-add-block')?.addEventListener('click', () => {
    const cfgLive = getRayConfig();
    const maxId = Math.max(0, ...(cfgLive.supportMapping?.blocks || []).map(b => Number.parseInt(b.id, 10) || 0));
    cfgLive.supportMapping.blocks.push({
      id: maxId + 1,
      label: `Block ${maxId + 1}`,
      frictionMatch: [''],
      gapCondition: 'any',
      name: cfgLive.supportMapping.fallbackName || 'CA150',
      desc: 'Custom block'
    });
    buildConfigGrid(root);
  });
}

function toggleConfig(root) {
  const panel = root.querySelector('#rc-config-panel');
  const btn   = root.querySelector('#rc-btn-config-toggle');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  btn.textContent = open ? '⚙ RayConfig ▲' : '⚙ RayConfig ▼';
  if (open) buildConfigGrid(root);
}

function applyConfig(root) {
  const patch = {};
  root.querySelectorAll('[data-cfg]').forEach(el => {
    const k = el.dataset.cfg;
    if (k.includes('.')) return; // handled separately below
    const v = el.type === 'number' ? parseFloat(el.value) : (el.type === 'checkbox' ? Boolean(el.checked) : el.value);
    if (!isNaN(v) || typeof v === 'string') patch[k] = v;
  });
  setRayConfig(patch);

  // Support mapping sub-fields
  const cfg = getRayConfig();
  const smPrefixEl = root.querySelector('[data-cfg="supportMapping.guidPrefix"]');
  if (smPrefixEl) cfg.supportMapping.guidPrefix = smPrefixEl.value || 'UCI:';
  const smFallbackEl = root.querySelector('#rc-cfg-fallback-name');
  if (smFallbackEl) cfg.supportMapping.fallbackName = smFallbackEl.value || 'RST';
  root.querySelectorAll('[data-cfg-block]').forEach(el => {
    const id = parseInt(el.dataset.cfgBlock, 10);
    const field = el.dataset.cfgBlockField;
    const block = cfg.supportMapping.blocks.find(b => b.id === id);
    if (!block || !field) return;
    const raw = String(el.value ?? '').trim();
    if (field === 'frictionMatch') {
      const tokens = raw.split('/').map(v => v.trim());
      block.frictionMatch = tokens.length ? tokens : [''];
      return;
    }
    if (field === 'gapCondition') {
      block.gapCondition = raw || 'any';
      return;
    }
    block[field] = raw || block[field];
  });

  passLog(root, `✓ Config applied`, 'info');
}

function resetConfig(root) {
  resetRayConfig();
  buildConfigGrid(root);
  passLog(root, `  Config reset`, 'stat');
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function passLog(root, msg, type = 'default') {
  const el = root.querySelector('#rc-pass-log');
  if (!el) return;
  if (el.querySelector('span')) el.innerHTML = '';
  const line = document.createElement('div');
  const styles = {
    header:  'color:#f59e0b;font-weight:700;margin-top:5px;font-size:0.63rem;letter-spacing:0.03em',
    stat:    'color:#64748b;padding-left:8px;font-size:0.62rem',
    success: 'color:#22c55e;font-weight:600',
    error:   'color:#ef4444;font-weight:600',
    warn:    'color:#fb923c',
    info:    'color:#38bdf8',
    divider: 'border-top:1px solid #1c2e20;margin:5px 0 2px;height:0;padding:0',
    default: 'color:#4ade80',
  };
  line.style.cssText = styles[type] || styles.default;
  if (type !== 'divider') line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
function _now() {
  return new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function setBtn(root, sel, enabled) {
  const btn = root.querySelector(sel);
  if (btn) btn.disabled = !enabled;
}

function showPreview(root, containerId, text) {
  const el = root.querySelector(`#${containerId}`);
  if (!el) return;
  el.style.whiteSpace = 'pre';
  el.textContent = text;
}

const EDITABLE_2D_COLS = new Set(['PIPELINE-REFERENCE', 'PIPING CLASS', 'RATING', 'LINENO KEY']);

function render2DTable(root, csvText) {
  const el = root.querySelector('#rc-preview-area');
  if (!el) return;
  if (!csvText) { el.style.whiteSpace = 'pre'; el.textContent = '(not yet generated)'; return; }
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) { el.style.whiteSpace = 'pre'; el.textContent = csvText; return; }
  const headers = lines[0].split(',');
  const rows    = lines.slice(1).map(l => l.split(','));
  const thStyle = `style="background:var(--bg-panel);color:var(--amber);padding:3px 8px;border:1px solid var(--steel);position:sticky;top:0;z-index:1;white-space:nowrap;font-size:0.65rem;font-family:var(--font-code)"`;
  const tdBase  = `padding:2px 6px;border:1px solid rgba(255,255,255,0.06);font-size:0.65rem;white-space:nowrap;font-family:var(--font-code)`;
  const tdStyle = (i, editable) => `style="${tdBase};${i%2?'background:rgba(255,255,255,0.02)':''}${editable?';padding:0;':''}"`;
  const inputStyle = `background:transparent;border:none;border-bottom:1px solid var(--amber);color:inherit;font-family:inherit;font-size:inherit;padding:2px 6px;width:100%;min-width:80px`;

  const thead = `<tr>${headers.map(h => `<th ${thStyle}>${h}</th>`).join('')}</tr>`;
  const tbody = rows.map((r, ri) =>
    `<tr>${headers.map((h, ci) => {
      const val = r[ci] ?? '';
      if (EDITABLE_2D_COLS.has(h)) {
        return `<td ${tdStyle(ri, true)}><input type="text" value="${val.replace(/"/g, '&quot;')}" data-row="${ri}" data-col="${ci}" style="${inputStyle}"></td>`;
      }
      return `<td ${tdStyle(ri, false)}>${val}</td>`;
    }).join('')}</tr>`
  ).join('');

  el.style.whiteSpace = 'normal';
  el.innerHTML = `<table style="border-collapse:collapse"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;

  // Wire input events to update rcState.components
  const fieldMap = {
    'PIPELINE-REFERENCE': 'pipelineRef',
    'PIPING CLASS':       'pipingClass',
    'RATING':             'rating',
    'LINENO KEY':         'lineNoKey'
  };
  el.addEventListener('input', e => {
    if (!e.target.matches('input[data-row]')) return;
    const ri = +e.target.dataset.row;
    const ci = +e.target.dataset.col;
    const colName = headers[ci];
    const comp = rcState.components[ri];
    if (!comp || !fieldMap[colName]) return;
    const val = e.target.value;
    comp[fieldMap[colName]] = colName === 'RATING' ? (isNaN(Number(val)) ? val : Number(val)) : val;
    _rebuildCsv2D();
  });
}

function _rebuildCsv2D() {
  if (rcState.components.length > 0) {
    const cfg = getRayConfig();
    rcState.csv2DText = emit2DCSV(rcState.components, cfg);
  }
}

function _buildFinalComponents() {
  const cfg = getRayConfig();
  // Normalise injected bridge pipes into full component-like objects
  const bridges = (rcState.injectedPipes || []).map((p, i) => ({
    type:        'PIPE',
    refNo:       `BRIDGE_${p.fromRefNo || ''}_${p.toRefNo || ''}_${i}`,
    bore:        p.bore,
    branchBore:  null,
    ep1:         p.ep1,
    ep2:         p.ep2,
    cp:          null,
    bp:          null,
    supportCoor: null,
    seqNo:       null,
    skey:        '',
    supportName: '',
    supportGuid: '',
    pipelineRef: p.pipelineRef || '',
    lineNoKey:   '',
    pipingClass: '',
    rating:      '',
    ca1:'', ca2:'', ca3:'', ca4:'', ca5:'',
    ca6:'', ca7:'', ca8:'', ca9:'', ca10:'',
    ca97:        '',
    ca98:        '',
    brlen:       null,
    lenAxis:     []
  }));
  rcState.finalComponents = [...rcState.components, ...bridges];
  rcState.finalCsv2DText  = emit2DCSV(rcState.finalComponents, cfg);
}

function _mapToDatatableRow(comp, rowIndex) {
  const ca = {};
  for (let n = 1; n <= 10; n++) ca[n] = comp[`ca${n}`] ?? '';
  return {
    _rowIndex:   rowIndex,
    type:        comp.type        || '',
    bore:        comp.bore        ?? null,
    branchBore:  comp.branchBore  ?? null,
    ep1:         comp.ep1  ? { x: comp.ep1.x,  y: comp.ep1.y,  z: comp.ep1.z  } : null,
    ep2:         comp.ep2  ? { x: comp.ep2.x,  y: comp.ep2.y,  z: comp.ep2.z  } : null,
    cp:          comp.cp   ? { x: comp.cp.x,   y: comp.cp.y,   z: comp.cp.z   } : null,
    bp:          comp.bp   ? { x: comp.bp.x,   y: comp.bp.y,   z: comp.bp.z   } : null,
    supportCoor: comp.supportCoor
      ? { x: comp.supportCoor.x, y: comp.supportCoor.y, z: comp.supportCoor.z }
      : null,
    skey:        comp.skey        ?? '',
    supportName: comp.supportName ?? '',
    supportGuid: comp.supportGuid ?? '',
    pipelineRef: comp.pipelineRef ?? '',
    lineNoKey:   comp.lineNoKey   ?? '',
    pipingClass: comp.pipingClass ?? '',
    rating:      comp.rating      ?? '',
    ca
  };
}

async function runPushToDatatable(root) {
  if (!rcState.finalComponents.length) {
    passLog(root, `⚠ Run S3/S4 first`, 'warn');
    _mastersLog('warn', '⚠ Push skipped: run S3/S4 first');
    switchSubTab(root, 'masterslog');
    return;
  }
  try {
    const rows = rcState.finalComponents.map((c, i) => _mapToDatatableRow(c, i));
    if (typeof window.__pcfSetDataTable === 'function') {
      window.__pcfSetDataTable(rows);
    } else {
      // Fallback: PCF Fixer not mounted yet — try Zustand store directly
      const { useStore } = await import('../pcf-fixer/store/useStore.js');
      useStore.getState().setExternalDataTable(rows);
    }
    passLog(root, `✓ Pushed ${rows.length} rows`, 'success');
    _mastersLog('info', `✅ Push to Datatable complete — ${rows.length} rows`, {
      mode: typeof window.__pcfSetDataTable === 'function'
        ? 'window.__pcfSetDataTable'
        : 'zustand.setExternalDataTable'
    });
    switchSubTab(root, 'masterslog');
    const statusEl = root.querySelector('#rc-masters-status');
    if (statusEl) statusEl.textContent = `✓ Pushed ${rows.length} rows`;
  } catch (err) {
    passLog(root, `✕ Push: ${err.message}`, 'error');
    _mastersLog('error', '❌ Push to Datatable failed', { error: err.message });
    switchSubTab(root, 'masterslog');
    const statusEl = root.querySelector('#rc-masters-status');
    if (statusEl) statusEl.textContent = `✕ Push failed`;
  }
}

function showConnMapPreview(root, matrix) {
  const el = root.querySelector('#rc-preview-area');
  if (!el) return;
  const STATUS_ICON = { FULL: '🟢', PARTIAL: '🟡', OPEN: '🔴' };
  el.textContent = matrix.map(r =>
    `${STATUS_ICON[r.status] || '⚪'} ${r.refNo.padEnd(24)} ${r.type.padEnd(8)} ` +
    `EP1:${(r.ep1 || '—').padEnd(26)} EP2:${(r.ep2 || '—').padEnd(26)} BP:${r.bp || '—'}`
  ).join('\n');
}

function switchPreview(root, activeKey) {
  root.querySelectorAll('.rc-preview-btn').forEach(b => {
    const on = b.dataset.preview === activeKey;
    b.style.background  = on ? 'var(--bg-3)' : 'transparent';
    b.style.color       = on ? 'var(--text-primary)' : 'var(--text-muted)';
    b.style.fontWeight  = on ? '600' : '400';
    b.style.borderBottom = '';
  });
  const textMap = {
    'fittings': rcState.fittingsPcfText,
    'isofinal': rcState.isoMetricPcfText
  };
  if (activeKey === 'connmap') {
    showConnMapPreview(root, rcState.connectionMatrix);
  } else if (activeKey === '2dcsv') {
    render2DTable(root, rcState.csv2DText || '');
  } else if (activeKey === 'final2dcsv') {
    render2DTable(root, rcState.finalCsv2DText || '(Final 2D CSV not yet generated — run S3/S4 first)');
  } else if (textMap[activeKey] !== undefined) {
    showPreview(root, 'rc-preview-area', textMap[activeKey] || '(not yet generated)');
  }
}

function activatePreviewBtn(root, key) {
  root.querySelectorAll('.rc-preview-btn').forEach(b => {
    const on = b.dataset.preview === key;
    b.style.background  = on ? 'var(--bg-3)' : 'transparent';
    b.style.color       = on ? 'var(--text-primary)' : 'var(--text-muted)';
    b.style.fontWeight  = on ? '600' : '400';
    b.style.borderBottom = '';
  });
}

function switchSubTab(root, tab) {
  root.querySelectorAll('.rc-subtab-btn').forEach(b => {
    const on = b.dataset.subtab === tab;
    b.style.background = on ? 'rgba(245,158,11,0.12)' : 'transparent';
    b.style.color      = on ? 'var(--amber)' : 'var(--text-muted)';
    b.style.fontWeight = on ? '600' : '400';
    b.style.borderLeft = '';
  });
  const pipelineEl   = root.querySelector('#rc-subtab-pipeline');
  const debugEl      = root.querySelector('#rc-subtab-debug');
  const mastersLogEl = root.querySelector('#rc-subtab-masterslog');
  if (pipelineEl)   pipelineEl.style.display   = tab === 'pipeline'   ? 'flex' : 'none';
  if (debugEl)      debugEl.style.display      = tab === 'debug'      ? 'flex' : 'none';
  if (mastersLogEl) mastersLogEl.style.display = tab === 'masterslog' ? 'flex' : 'none';
  if (tab === 'debug') {
    renderDebugTab(root.querySelector('#rc-debug-container'), rcState.connectionMatrix);
  }
  if (tab === 'masterslog') {
    _renderMastersLog(root);
  }
}

// ── Masters Log helpers ────────────────────────────────────────────────────────
function _mastersLog(type, msg, details = null) {
  rcState.mastersLog.push({
    ts:      new Date().toLocaleTimeString(),
    type,    // 'info' | 'warn' | 'error' | 'match' | 'skip'
    msg,
    details  // object with extra key/value pairs to show in expanded row
  });
}

function _renderMastersLog(root) {
  const container = root.querySelector('#rc-masterslog-container');
  if (!container) return;
  const log = rcState.mastersLog;
  if (!log.length) {
    container.innerHTML = '<span style="color:var(--text-muted);font-style:italic">No events yet — click 📥 Masters or 📍 Pipeline to log activity.</span>';
    return;
  }

  const limitRepeats = root.querySelector('#rc-masterslog-limit')?.checked ?? true;
  const colorMap = { info: '#2ecc71', warn: '#f59e0b', error: '#ef4444', match: '#38bdf8', skip: '#64748b' };

  // ── Build display list (with optional collapse of repeating groups) ───────
  // Group key: type + reason (details.reason).  Only consecutive runs are grouped.
  // When limitRepeats is ON: any group of N≥2 identical entries → single summary row.
  const displayList = [];
  if (limitRepeats) {
    let i = 0;
    while (i < log.length) {
      const e   = log[i];
      const reason = e.details?.reason || '';
      // Measure run of consecutive same type+reason
      let j = i + 1;
      while (j < log.length &&
             log[j].type === e.type &&
             (log[j].details?.reason || '') === reason) j++;
      const runLen = j - i;
      if (runLen === 1) {
        displayList.push({ entry: e });
      } else {
        // Collapse entire group to one summary row
        displayList.push({ collapsed: { count: runLen, type: e.type, reason, firstTs: e.ts, lastTs: log[j - 1].ts } });
      }
      i = j;
    }
  } else {
    log.forEach(e => displayList.push({ entry: e }));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const rows = displayList.map(de => {
    if (de.collapsed) {
      const { count, type, reason, firstTs, lastTs } = de.collapsed;
      const c = colorMap[type] || '#64748b';
      const timeRange = firstTs === lastTs ? firstTs : `${firstTs} – ${lastTs}`;
      return `<div style="padding:3px 0 3px 0.5rem;border-bottom:1px solid rgba(255,255,255,.04);display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="color:#475569;font-size:0.63rem">[${timeRange}]</span>
        <span style="color:${c};font-weight:700;font-size:0.66rem">${type.toUpperCase()}</span>
        <span style="background:${c}22;color:${c};font-size:0.63rem;padding:0 5px;border-radius:10px;font-weight:600">×${count}</span>
        ${reason ? `<span style="color:#64748b;font-size:0.63rem">${reason}</span>` : ''}
      </div>`;
    }
    const e = de.entry;
    const c = colorMap[e.type] || '#e8eaf0';
    const det = e.details
      ? `<div style="margin-left:1rem;color:#94a3b8;font-size:0.63rem">${
          Object.entries(e.details).map(([k, v]) => `${k}: <span style="color:#cbd5e1">${v}</span>`).join(' · ')
        }</div>`
      : '';
    return `<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="color:#475569">[${e.ts}]</span>
      <span style="color:${c};font-weight:600;margin:0 4px">${e.type.toUpperCase()}</span>
      <span style="color:#e2e8f0">${e.msg}</span>
      ${det}
    </div>`;
  });

  container.innerHTML = rows.join('');
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function setBadge(root, key, status) {
  const badge = root.querySelector('#rc-diff-badge');
  if (!badge) return;
  badge.style.display = 'block';
  badge.style.background = status === 'done' ? '#16a34a' : '#dc2626';
  badge.style.color = '#fff';
  badge.textContent = `${key}: ${status}`;
}

function saveFile(text, filename) {
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Button/tab styles ─────────────────────────────────────────────────────────
function btnStyle(variant = '') {
  const bg = variant === 'primary' ? 'var(--amber)' :
             variant === 'success' ? '#16a34a' : 'var(--bg-panel)';
  const color = (variant === 'primary' || variant === 'success') ? '#000' : 'var(--text-primary)';
  return `font-size:0.68rem;font-family:var(--font-code);padding:2px 9px;border-radius:12px;cursor:pointer;` +
         `border:1px solid var(--steel);background:${bg};color:${color}`;
}
function subtabStyle(active) {
  return `display:inline-flex;align-items:center;gap:5px;font-size:0.72rem;font-family:var(--font-inter);` +
    `font-weight:${active ? '600' : '400'};padding:5px 12px;cursor:pointer;border:none;border-radius:6px;` +
    `background:${active ? 'rgba(245,158,11,0.12)' : 'transparent'};` +
    `color:${active ? 'var(--amber)' : 'var(--text-muted)'};transition:all 150ms ease;white-space:nowrap`;
}
function previewBtnStyle(active) {
  return `font-size:0.68rem;font-family:var(--font-inter);font-weight:${active ? '600' : '400'};` +
    `padding:3px 8px;cursor:pointer;border:none;border-radius:4px;` +
    `background:${active ? 'var(--bg-3)' : 'transparent'};` +
    `color:${active ? 'var(--text-primary)' : 'var(--text-muted)'};transition:all 150ms ease;white-space:nowrap`;
}
