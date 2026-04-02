# Fallback Geometry Contract (TEE / OLET / BEND)

## 1) Strict Priority (all components)
1. **Direct geometry from input** (`Point` rows / parsed EP/CP/BP).
2. **Derived from related points** using explicit formulas below.
3. **Database fallback** from **9A tables** only.
4. **Hard fail** with explicit validation code (`FC-001`..`FC-005`).

Reference schema: `js/pcf-fixer/engine/FallbackContract.js`.

---

## 2) Component formulas and tolerance rules

### TEE
- **CP formula**: `CP = (EP1 + EP2) / 2`.
- **BP formula**: `BP = CP + normalize(branchDirection) * BRLEN`.
- **branchDirection source order**:
  1) normalize(`BP_input - CP`),
  2) normalize(`EP3 - CP`),
  3) 9A direction vector.
- **Tolerance rules**:
  - `|dist(CP, midpoint(EP1,EP2))| <= 1.0 mm`.
  - `|dist(CP,BP) - BRLEN| <= 1.0 mm`.

### OLET
- **CP on parent axis**:
  - `runDir = normalize(EP2 - EP1)`
  - `CP = EP1 + dot((BP - EP1), runDir) * runDir`
- **BP formula**: `BP = CP + normalize(branchDirection) * BRLEN`.
- **branchDirection source order**:
  1) normalize(`BP_input - CP`),
  2) 9A branch axis.
- **Tolerance rules**:
  - CP must lie on parent axis: `dist(CP, line(EP1,EP2)) <= 1.0 mm`.
  - `|dist(CP,BP) - BRLEN| <= 1.0 mm`.

### BEND
- **CP rule**: derive from **corner/radius geometry**, not midpoint heuristic.
- **Construction**:
  - Find tangent directions at `EP1` and `EP2`.
  - Build inward normals and intersect them to get `CP`.
  - Enforce radius consistency: `R1=dist(CP,EP1)`, `R2=dist(CP,EP2)`.
- **Tolerance rules**:
  - `|R1 - R| <= 1.0 mm` and `|R2 - R| <= 1.0 mm`.
  - `|R1 - R2| <= 1.0 mm`.

---

## 3) Validation fail codes
- `FC-001`: missing direct geometry.
- `FC-002`: cannot derive from related points.
- `FC-003`: no 9A fallback match.
- `FC-004`: tolerance violation after compute.
- `FC-005`: unsupported axis/direction vector.

---

## 4) Impact map

### Upstream (2)
1. `js/ray-concept/rc-stage1-parser.js`
   - Must expose trusted availability flags for direct EP/CP/BP.
   - Must precompute `BRLEN = |BP-CP|` only when both points are valid.
2. `js/pcf-fixer/engine/DataProcessor.js`
   - Replace ad-hoc mutation fallbacks with this priority contract.
   - Emit `FC-*` validation markers instead of synthetic geometry defaults.

### Downstream (2)
1. `js/converter/components/tee.js`, `js/converter/components/olet.js`, `js/converter/components/bend.js`
   - Emitters consume contract-resolved points only.
   - No midpoint-based BEND CP generation.
2. `js/pcf-fixer/engine/Validator.js` and `js/validation/syntax-validator.js`
   - Add/propagate contract failures as explicit rule outcomes.
   - Tolerance checks must align with contract numeric limits.
