# Optimised Implementation Plan — Task 71 + Task 72 Merged

**Date:** 05-04-2026  
**Strategy:** Minimum blast radius, maximum independent testability, zero regressions.

---

## Key Architectural Discovery

Before sequencing, two critical findings from source inspection **change the risk model**:

> [!WARNING]
> **`defaults.js` is the single source of truth for `skeyStyle` and `centrePointTokens`** — all 7 component writers read from `config.pcfRules[type].skeyStyle`. Fixing `defaults.js` alone normalises ALL writers simultaneously. No individual writer files need changes for the SKEY fix.

> [!CAUTION]
> **`COMPONENT-ATTRIBUTE99` has 4 active consumers**: `table-log.js`, `TableRegenerator.js`, `Viewer3D.jsx`, `App.bundle.js`. Removing it from `ca-builder.js` without migrating these consumers first = broken RefNo traceability in the 3D viewer and table controller. This is the **highest-risk item in the entire list**. It must be last.

---

## Shared File Collision Map

Files touched by BOTH Task 71 and Task 72:

| File | Task 71 Usage | Task 72 Usage | Risk |
|------|--------------|--------------|------|
| `rc-stage4-emitter.js` | `=` sanitization, EP scaling, support CO-ORDS default | support bore=0 rule | 🟡 Medium — same file, different functions |
| `rc-config.js` | `maxEpCoordValue`, `isopcfDrop`, `supportDefaultCoor` | no direct changes | 🟢 Low — Task 71 adds, Task 72 doesn't touch |
| `defaults.js` | no changes | `skeyStyle`→`<SKEY>`, `centrePointTokens`→4 | 🟢 Low — isolated config object |
| `Validator.js` | no changes | V1/V13 disable, V2/V3/V12/V14/V15/V17 fix | 🟢 Low — fixer-side only |

No direct code-level conflicts. Sequencing risk is about **order of stability**, not write conflicts.

---

## 5-Phase Execution Plan

---

## Phase 0 — Config-Only Freeze (ZERO CODE RISK)
**Goal:** Kill V1/V13 auto-fix risk before any other work begins.  
**Changes:** Config flag only — no logic, no logic paths altered.  
**Rollback:** Single line change.  
**Duration:** 5 minutes.

### Changes

#### [MODIFY] [defaults.js](file:///c:/Code/PCF-Studio/js/config/defaults.js) — [NEW] Add `enabledChecks` block
```js
// Add to DEFAULT_CONFIG (new top-level key):
enabledChecks: {
  V1:  false,  // FROZEN — geometry invention violates Core Doctrine 1
  V13: false,  // FROZEN — wrong semantic layer; CO-ORDS bore=0 is an emission rule, not a datatable rule
}
```

#### [MODIFY] [RuleRegistry.js](file:///c:/Code/PCF-Studio/js/pcf-fixer-runtime/engine/rules/RuleRegistry.js) — No change needed
Already reads `config.enabledChecks[rule.id]`. Validator already has `shouldRun('V1')` and `shouldRun('V13')` guards. The config change is sufficient.

**Test:** Load mock PCF in PCF Fixer → Run Validation → Confirm no V1 or V13 entries appear in log.

---

## Phase 1 — Isolated, Single-File Fixes (VERY LOW RISK)
**Goal:** Fix 7 items that each touch exactly ONE file and have zero downstream consumers.  
**Rollback:** Individual file restore.  
**Duration:** ~1 hour total.  

Each change below is independent — they can be done in any order or in parallel.

---

### 1A. Linelist Manager — Tab Keyword Matching
#### [MODIFY] [excel-parser.js](file:///c:/Code/PCF-Studio/js/services/excel-parser.js)
- Scan sheet names for `*Line*` or `*List*` (case-insensitive) before defaulting to index 0  
- Score: contains both = 2, contains one = 1, none = prompt  
- If no match → `window.prompt()` listing sheet names with index numbers  
- **Downstream impact**: None. Returns same data shape to caller.

---

### 1B. Draw Canvas Positioning Fix
#### [MODIFY] [DrawCanvasTab.js](file:///c:/Code/PCF-Studio/js/pcf-fixer-runtime/ui/tabs/DrawCanvasTab.js)
- Move `<Canvas>` render to be a **sibling** of settings panel, not a child  
- **Downstream impact**: Visual only. No state or data changes.

---

### 1C. Header — Remove Orphan MESSAGE-SQUARE + Add `export` Prefix
#### [MODIFY] [header-writer.js](file:///c:/Code/PCF-Studio/js/converter/header-writer.js)
- Line 36: **Remove** `lines.push('MESSAGE-SQUARE')`  
- Line 29: Change `lines.push(\`PIPELINE-REFERENCE \${pipelineRef}\`)` → `lines.push(\`PIPELINE-REFERENCE export \${pipelineRef}\`)`  
- **Downstream impact**: None. `buildHeader()` is called only by the converter assembler. No other consumers.

---

### 1D. 3DV Serializer — CRLF + 4-Token Coordinate Fix
#### [MODIFY] [3DV_PCFSerializer.js](file:///c:/Code/PCF-Studio/js/viewer/pcf-builder/3DV_PCFSerializer.js)
- Line 67: `lines.join('\n')` → `lines.join('\r\n')`  
- Line 44: Add bore token: `${f4(cp.x)} ${f4(cp.y)} ${f4(cp.z)} ${f4(cp.bore || 0)}`  
- Line 56: Add bore token: `${f4(co.x)} ${f4(co.y)} ${f4(co.z)} 0.0000` (support bore always 0)  
- **Risk:** Debug/export helper only. No production pipeline uses this as primary emitter.

---

### 1E. coord-pcf-emitter — Message format + SUPPORT GUID + CA8 scope
#### [MODIFY] [coord-pcf-emitter.js](file:///c:/Code/PCF-Studio/js/coord2pcf/coord-pcf-emitter.js)
- Line 73: `Length:${fmt(length,2)}MM` → `LENGTH=${fmt(length,2)}MM`  
- Line 98 (`emitBend`): `buildCA(ca, true)` — change to `buildCA(ca, false)` (no CA8 for BEND per review)  
- Lines 125–131 (`emitSupport`): Add `<SUPPORT_GUID>` line using `comp.supportGuid || ''`  
- **Downstream impact**: coord2pcf tab only. No other module uses `coord-pcf-emitter.js`.

---

### 1F. Overlap Solver Contrast Fix
#### [MODIFY] Canvas/DataTable overlap solver UI
- Find overlap solver text color definition and change to `color: '#f8fafc'; font-weight: 600`  
- **Downstream impact**: Visual only.

---

### 1G. PCF Fixer — Run Pass 1 Button
#### [MODIFY] [StatusBar.js](file:///c:/Code/PCF-Studio/js/pcf-fixer-runtime/ui/components/StatusBar.js)
- Add `▶ Run Pass 1` button (blue, `bg-blue-600`) between Run Engine and Run Second Pass  
- On click: sets `runGroup = 'group2'` and calls `handleSmartFix()` directly  
- **Downstream impact**: Additive button. No existing flow altered.

**Phase 1 combined test:** Run `node --check` on all 6 modified files. Build. Load app, generate one PCF, verify no orphan MESSAGE-SQUARE in header, verify `export ` prefix present.

---

## Phase 2 — Single-Source SKEY + Token Fix (LOW RISK, HIGH YIELD)
**Goal:** Fix all 7 component writers (bend, tee, olet, flange, valve, reducer, generic) in ONE change to `defaults.js`. Also fix `OLET` default SKEY and `centrePointTokens`.  
**Why Phase 2, not Phase 1?** Depends on Phase 1 build being green — we want the config in a known-good state before changing PCF syntax defaults.

---

### 2A. `defaults.js` SKEY and Token Normalization
#### [MODIFY] [defaults.js](file:///c:/Code/PCF-Studio/js/config/defaults.js)

**Change every `pcfRules` entry:**
```js
// BEFORE (all entries):
skeyStyle: "SKEY",        centrePointTokens: 3

// AFTER (all entries):
skeyStyle: "<SKEY>",      centrePointTokens: 4
```

**OLET specific:**
```js
// BEFORE:
OLET: { skeyStyle: "SKEY", defaultSKEY: "CEBW", centrePointTokens: 3, ... }

// AFTER:
OLET: { skeyStyle: "<SKEY>", defaultSKEY: "OLWL", centrePointTokens: 4, ... }
```

**Support fallback name:**
```js
// In coordinateSettings.supportSettings.nameRules:
// BEFORE:
fallback: "CA150"
// AFTER:
fallback: "RST"
```

**This single file edit fixes:**
- bend.js SKEY token ✓  
- tee.js SKEY token ✓  
- flange.js SKEY token ✓  
- valve.js SKEY token ✓  
- olet.js SKEY token + wrong default CEBW → OLWL ✓  
- reducer.js SKEY token ✓  
- All centrePointTokens 3→4 ✓ (CP now gets bore as 4th token)  
- TableRegenerator.js SKEY (line 648 reads from `pcfRule.skeyStyle`) ✓  

**Also add Task 71 config additions here (same file, same commit):**
```js
// In rc-config.js (separate file):
maxEpCoordValue: 999999999,
isopcfDrop: ['GASK', 'INST', 'PCOM', 'MISC'],
isopcfStretchPriority: ['PIPE', 'FLANGE', 'TEE', 'BEND'],
supportDefaultCoor: 'CA150',
```

**Test:** Generate PCF from CSV input → inspect raw PCF output → confirm `<SKEY>` with angle brackets present in all BEND/TEE/FLANGE/VALVE lines. Confirm OLET CENTRE-POINT has 4 tokens.

---

### 2B. Validator Rule Remapping (Fixer-side only, isolated)
#### [MODIFY] [Validator.js](file:///c:/Code/PCF-Studio/js/pcf-fixer-runtime/engine/Validator.js)

Changes — each is a surgical 2–5 line edit:

| Rule | Current | Target |
|------|---------|--------|
| V17 | EP blank check | Remove EP check, add CRLF file-level check |
| V2 | ep1 x/y/z only | Extend to check bore token + cp/bp coord tokens |
| V3 | Cross-row bore continuity | Remap: REDUCER EP1.bore ≠ EP2.bore (component-local) |
| V12 | CA1–CA10 only | Extend to also block CA97/CA98 on SUPPORT |
| V14 | `!row.skey` presence check | Add `!row.skey.startsWith('<')` token shape check |
| V15 | `_rowIndex - 1` sequential | Add topology-connected check using ep2/ep1 proximity |

**Test:** Import `ImportPcfDemo_20Rows.pcf` → Run Validation → Inspect log for correct V-rule IDs and no misaligned V17 false positives.

---

## Phase 3 — rc-stage4-emitter.js (MEDIUM RISK, ISOLATED PIPELINE)
**Goal:** Apply Task 71 EP sanitization and coordinate scaling, plus Task 72 support bore=0 rule — all in the same module in one pass.  
**Why Phase 3?** Depends on Phase 2 defaults being stable. Emitter reads from config.

#### [MODIFY] [rc-stage4-emitter.js](file:///c:/Code/PCF-Studio/js/ray-concept/rc-stage4-emitter.js)

**Change A — `=` sanitization (Task 71, 3a):**
```js
function sanitizeAttrValue(val) {
  return String(val ?? '').replace(/=/g, '').trim();
}
// Wrap every CA97, skey, and named CA emission through this
```

**Change B — EP coordinate scaling (Task 71, 3b):**
```js
// Before emitting components: scan all EPs for > cfg.maxEpCoordValue
// If triggered: deep-copy components, divide all XYZ by 1000, emit popup notification
// Popup is a styled div overlay, not a blocking `alert()`
```

**Change C — Support bore=0 in CO-ORDS (Task 72):**
```js
// In emitSupport(): change bore token for CO-ORDS line to always use 0.0000
// (keep comp.bore in the datatable row; only the emitted coordinate token changes)
```

**Change D — Support CO-ORDS default (Task 71, 5c):**
```js
// If comp.supportCoor is missing, emit: cfg.supportDefaultCoor (default 'CA150')
```

**Test:** Generate PCF with a support block → verify `CO-ORDS 96400.0000 17186.4000 101968.0000 0.0000` (bore token = 0). Verify no `=` in CA97. Test with large coords (> 999,999,999) → verify popup fires.

---

## Phase 4 — support.js Full Rewrite + ca-builder.js Scoping (HIGHEST RISK)
**Goal:** Complete spec compliance for SUPPORT and clean internal attributes from CA block.  
**Why Phase 4?** `ca-builder.js` has 4 downstream consumers of `COMPONENT-ATTRIBUTE99`. Must migrate them BEFORE removing the source.  
**Rollback:** Keep old logic behind a feature flag `cfg.legacyCA99 = true` during transition.

---

### 4A. Migrate ATTRIBUTE99 Consumers First
Before touching `ca-builder.js`, update all 4 consumers to use a stable fallback:

#### [MODIFY] [table-log.js](file:///c:/Code/PCF-Studio/js/viewer/table-log.js) — line 59
```js
// BEFORE:
return attrs['COMPONENT-ATTRIBUTE99'] || attrs['REFNO'] || '';
// AFTER:
return attrs['REFNO'] || attrs['COMPONENT-ATTRIBUTE99'] || attrs['PIPELINE-REFERENCE'] || '';
```
(Promote `REFNO` to primary — it's the canonical PCF ref field)

#### [MODIFY] [TableRegenerator.js](file:///c:/Code/PCF-Studio/js/ui/table/TableRegenerator.js) — line 125
```js
// BEFORE:
const ref = comp.attributes["REFNO"] || comp.attributes["PIPELINE-REFERENCE"] || comp.attributes["COMPONENT-ATTRIBUTE99"];
// AFTER (same order, just ensure fallback chain is stable):
const ref = comp.attributes["REFNO"] || comp.attributes["COMPONENT-ATTRIBUTE97"] || comp.attributes["PIPELINE-REFERENCE"] || '';
```

#### [MODIFY] [Viewer3D.jsx](file:///c:/Code/PCF-Studio/js/editor/components/Viewer3D.jsx) — line 88
```js
// BEFORE:
return attrs['REFNO'] || attrs['COMPONENT-ATTRIBUTE99'] || attrs['PIPELINE-REFERENCE'] || null;
// AFTER:
return attrs['REFNO'] || attrs['COMPONENT-ATTRIBUTE97'] || attrs['PIPELINE-REFERENCE'] || null;
```

---

### 4B. ca-builder.js — Remove Non-Spec Injections
#### [MODIFY] [ca-builder.js](file:///c:/Code/PCF-Studio/js/converter/ca-builder.js)

**Remove:**
- Lines 244–245: `COMPONENT-ATTRIBUTE99` and interior `PIPELINE-REFERENCE` injection

**Fix Placeholder Emission (GAP-C):**
- Lines 65–66: Replace `return caDef.unit === null ? 'Undefined' : '0'` with `return null` to trigger omission

```js
// BEFORE:
const hasRawData = ...
if (!hasRawData) {
  return caDef.unit === null ? 'Undefined' : '0';  // ← EMITS placeholder
}
// AFTER:
if (!hasRawData) return null;   // ← OMITS line per spec §6.2
```

**Add PIPE CA8 guard (already safe via caDefinitions but add explicit guard):**
```js
if (pcfType === 'PIPE' && slot === 'CA8') continue;  // Belt-and-suspenders
```

---

### 4C. support.js — Full §12 Rewrite
#### [MODIFY] [support.js](file:///c:/Code/PCF-Studio/js/converter/components/support.js)

Rewrite the body to comply with spec §12 exactly:

```
MESSAGE-SQUARE
    SUPPORT, RefNo:=<RefNo>, SeqNo:<SeqNo>, <SUPPORT_NAME>, <SUPPORT_GUID>
SUPPORT
    CO-ORDS  X Y Z 0.0000       ← bore ALWAYS 0, 4 tokens
    <SUPPORT_NAME>  <name>
    <SUPPORT_GUID>  UCI:<nodeName>
    [NO CA LINES]
```

**Friction/gap mapping from spec §12.3:**
```js
function resolveSupportName(friction, gap, config) {
  const f = String(friction ?? '').trim();
  const g = String(gap ?? '').trim();
  const gapNum = parseFloat(g);
  
  if ((f === '' || f === '0.3' || f === 'NULL') && (g === '' || g === 'NULL'))
    return 'ANC';
  if (f === '0.15')
    return 'GDE';
  if (f === '0.3' && !isNaN(gapNum) && gapNum > 0)
    return 'RST';
  return config.coordinateSettings?.supportSettings?.nameRules?.fallback || 'RST';
}
```

**Remove:** `COMPONENT-ATTRIBUTE97` from support block (line 87 — confirmed spec violation).

**Test:** Generate PCF with supports → verify:
- CO-ORDS bore = `0.0000`
- No `COMPONENT-ATTRIBUTE97` in SUPPORT block  
- GUID has `UCI:` prefix  
- MSG-SQ token order: `SUPPORT, RefNo:=..., SeqNo:..., <NAME>, <GUID>`

---

## Phase 5 — Additive New Features (NO RISK TO EXISTING PIPELINE)
**Goal:** Task 71 new features that add to the codebase without modifying existing paths.  
**Risk:** Isolated new code. Existing pipeline is completely unchanged.

### 5A. CA3 Editable + Fill Down in 2D CSV Table
#### [MODIFY] [rc-tab.js](file:///c:/Code/PCF-Studio/js/ray-concept/rc-tab.js) — 2 constant changes
```js
const EDITABLE_2D_COLS = new Set([..., 'CA3 (Material)']);
const FILL_DOWN_2D_COLS = new Set([..., 'CA3 (Material)']);
```

### 5B. ISOPCF CSV Tab
#### [MODIFY] [rc-tab.js](file:///c:/Code/PCF-Studio/js/ray-concept/rc-tab.js) — new function
- `buildIsopcfRows(components, cfg)` — deep copy, drop configured types, stretch adjacent EP
- New sub-tab button "ISOPCF CSV" in the preview tab bar
- Drop config badge + RayConfig link

### 5C. SKEY Push to Datatable
#### [MODIFY] [rc-tab.js](file:///c:/Code/PCF-Studio/js/ray-concept/rc-tab.js) — push mapper
- Add `skey: comp.skey || ''` to the push row object

### 5D. Linelist SKEY Push to 3D Topology
- Already covered in 5C above.

### 5E. Syntax Fixer Improved EP2 Detection
#### [MODIFY] [syntax-validator.js](file:///c:/Code/PCF-Studio/js/validation/syntax-validator.js)
- Add rule `SV-005`: Adjacent component EP2/EP1 mismatch detection for BEND/PIPE sequences

---

## Rollback Strategy Per Phase

| Phase | Rollback Method | Time to Rollback |
|-------|----------------|-----------------|
| 0 | Change `V1: false` → `V1: true` in defaults.js | 1 min |
| 1 | `git checkout` individual files (7 isolated files) | 2 min |
| 2 | `git checkout js/config/defaults.js` | 1 min — restores all 7 writers |
| 3 | `git checkout js/ray-concept/rc-stage4-emitter.js` | 1 min |
| 4A | `git checkout` 3 consumer files | 2 min — CA99 still written by ca-builder |
| 4B+4C | `git checkout js/converter/ca-builder.js js/converter/components/support.js` | 1 min |
| 5 | `git checkout js/ray-concept/rc-tab.js js/validation/syntax-validator.js` | 1 min |

---

## Build Gate Between Each Phase

Before moving to the next phase, all of these must pass:

```powershell
# Syntax check
node --check js/config/defaults.js
node --check js/converter/ca-builder.js
node --check js/ray-concept/rc-stage4-emitter.js
node --check js/ray-concept/rc-tab.js

# Build
npm run build

# Manual smoke test
# → Load app at http://localhost:5173
# → Import ImportPcfDemo_20Rows.pcf
# → Generate PCF
# → Inspect output for phase-specific assertions
```

---

## Combined Task Count Summary

| Phase | Items | Files | Risk |
|-------|-------|-------|------|
| 0 — V1/V13 Freeze | 1 | 1 (defaults.js) | 🟢 Zero |
| 1 — Isolated fixes | 7 | 7 (one each) | 🟢 Very Low |
| 2 — SKEY + Validator | 2 | 2 (defaults.js, Validator.js) | 🟢 Low |
| 3 — Stage4 emitter | 4 items in 1 file | 1 + rc-config.js | 🟡 Medium |
| 4 — ca-builder + support | 3 | 5 (consumer migration first) | 🔴 High (mitigated) |
| 5 — New features | 5 | 2 | 🟢 Low (additive) |

**Recommendation: Execute phases sequentially with a build-gate between each. Do not combine Phase 3 and Phase 4 into one session.**
