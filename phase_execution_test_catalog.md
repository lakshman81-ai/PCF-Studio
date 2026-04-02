# Phase Execution Test Catalog

## Purpose
This catalog defines the mandatory verification suite for phase execution. **All listed tests must be executed and documented before phase sign-off.**

## Phase 1 — Canonical fallback contract verification

### P1-T01-TEE-CP-MID
- **Input Rows**
  - Row 10: TEE, EP1=(1000,2000,3000), EP2=(1000,1600,3000), BP=(1000,1800,3305), Bore=400, BranchBore=350
- **Expected Output**
  - CP calculated as (1000,1800,3000)
- **Pass Assertions**
  - CP exactly equals midpoint(EP1,EP2)
  - CP bore equals header bore
- **Fail Assertions**
  - CP not midpoint OR CP missing OR CP bore mismatch

### P1-T02-TEE-BP-BRLEN
- **Input Rows**
  - Row 11: TEE, EP1/EP2 valid, CP valid, BRLEN=305, branch direction=UP
- **Expected Output**
  - BP=(CP.x, CP.y, CP.z+305)
- **Pass Assertions**
  - distance(CP,BP)=305 ± 0.1
  - BP axis aligns with UP direction
- **Fail Assertions**
  - BP generated on wrong axis or wrong magnitude

### P1-T03-OLET-CP-ON-PARENT
- **Input Rows**
  - Row 21: OLET with parent pipe EP1=(0,0,0), EP2=(1000,0,0), CP missing, BRLEN=180, branch direction=UP
- **Expected Output**
  - CP lies on parent axis (Y=0,Z=0, 0<=X<=1000)
  - BP=(CP.x, CP.y, CP.z+180)
- **Pass Assertions**
  - CP projected on parent segment
  - BP distance from CP equals BRLEN
- **Fail Assertions**
  - CP off parent axis or BP invalid

### P1-T04-BEND-CP-CORNER
- **Input Rows**
  - Row 31: BEND, EP1=(96400,16586.4,103827), EP2=(95867,16586.4,104360), incoming +Z, outgoing -X
- **Expected Output**
  - CP=(96400,16586.4,104360)
- **Pass Assertions**
  - CP != EP1 and CP != EP2
  - dist(CP,EP1) ≈ dist(CP,EP2)
- **Fail Assertions**
  - midpoint/offset CP used when corner intersection is solvable

## Phase 2 — Master tables 9.A.1–9.A.3 verification

### P2-T01-EQUAL-TEE-LOOKUP
- **Input Rows**
  - Header bore=400, branch bore=400
- **Expected Output**
  - BRLEN from 9.A.1 equals 305
- **Pass Assertions**
  - Returned BRLEN=305 exactly
- **Fail Assertions**
  - Null result or non-table fallback used

### P2-T02-REDUCING-TEE-LOOKUP
- **Input Rows**
  - Header bore=300, branch bore=200
- **Expected Output**
  - BRLEN from 9.A.2 equals mapped value (example 232 per table row)
- **Pass Assertions**
  - Correct row matched on both header and branch sizes
- **Fail Assertions**
  - Equal-tee table used or wrong reducing row selected

### P2-T03-WELDOLET-FORMULA
- **Input Rows**
  - Header NPS 8, Branch NPS 4, A and header OD from table
- **Expected Output**
  - BRLEN = A + 0.5*HeaderOD
- **Pass Assertions**
  - Computed BRLEN equals formula result ± 0.1
- **Fail Assertions**
  - Hardcoded BRLEN used ignoring formula

### P2-T04-TABLE-PERSISTENCE
- **Input Rows**
  - Edit one value in each master table, save, reload app
- **Expected Output**
  - Values persist and are consumed by lookup
- **Pass Assertions**
  - Reloaded values match saved edits
- **Fail Assertions**
  - UI shows update but runtime lookup still uses stale values

## Phase 3 — Table 4 (wtValveweights.xlsx) integration verification

### P3-T01-TABLE4-LOAD
- **Input Rows**
  - Load hardcoded Table 4 URL source
- **Expected Output**
  - Parsed rows available in master data service
- **Pass Assertions**
  - Service exposes records count > 0
  - Required columns (bore, class/rating, flange weight, valve weight/type) are resolved
- **Fail Assertions**
  - Parse succeeds but required columns unavailable

### P3-T02-FLANGE-WEIGHT-MATCH
- **Input Rows**
  - FLANGE, Bore=200, Rating=300#
- **Expected Output**
  - Weight from Table 4 matching bore/rating
- **Pass Assertions**
  - CA8 equals table weight for 300#
- **Fail Assertions**
  - Fallback/default used when exact row exists

### P3-T03-VALVE-DEFAULT-TYPE
- **Input Rows**
  - VALVE, Bore=200, Rating missing, valve subtype missing
- **Expected Output**
  - Rating defaults to 300#
  - Valve type defaults to Ball Valve (Reduced Bore)
- **Pass Assertions**
  - Lookup key uses default type + 300#
- **Fail Assertions**
  - Generic valve row used without subtype fallback rule

## Phase 4 — Weight fallback chain verification

### P4-T01-DIRECT-WEIGHT-PRIORITY
- **Input Rows**
  - VALVE with explicit weight in input row + matching table row exists
- **Expected Output**
  - Explicit input weight wins
- **Pass Assertions**
  - CA8 equals direct input value
- **Fail Assertions**
  - Table overwrites direct value

### P4-T02-TABLE-WEIGHT-PRIORITY
- **Input Rows**
  - FLANGE with no input weight, Bore=150, Rating=300#, table row exists
- **Expected Output**
  - Table value used
- **Pass Assertions**
  - CA8 equals table value
- **Fail Assertions**
  - Empty CA8 or fallback constant used

### P4-T03-CLASS-FALLBACK-300
- **Input Rows**
  - FLANGE with no weight, Bore=150, Rating missing, table has 300#
- **Expected Output**
  - 300# row used
- **Pass Assertions**
  - Resolution trace marks class fallback=300#
- **Fail Assertions**
  - Null weight returned

### P4-T04-CA8-SCOPE-BLOCK
- **Input Rows**
  - PIPE and SUPPORT components with/without weight candidates
- **Expected Output**
  - No CA8 for PIPE/SUPPORT
- **Pass Assertions**
  - CA8 absent in serialized output
- **Fail Assertions**
  - CA8 emitted for blocked types

## Phase 5 — Bore conversion toggle verification

### P5-T01-TOGGLE-ON-CONVERT
- **Input Rows**
  - Bore=8 (inch-like), toggle ON
- **Expected Output**
  - Bore converted to 203.2 mm (or configured precision)
- **Pass Assertions**
  - Converted bore visible in processing and output
- **Fail Assertions**
  - Bore remains 8 with toggle ON

### P5-T02-TOGGLE-OFF-NO-CONVERT
- **Input Rows**
  - Bore=8, toggle OFF
- **Expected Output**
  - No conversion; validation warning allowed
- **Pass Assertions**
  - Bore remains raw input
- **Fail Assertions**
  - Conversion still occurs when OFF

### P5-T03-REGRESSION-BRLEN-LOOKUP
- **Input Rows**
  - TEE/OLET cases with toggle ON vs OFF
- **Expected Output**
  - BRLEN lookups differ only when bore conversion changes effective bore domain
- **Pass Assertions**
  - Deterministic expected diff recorded
- **Fail Assertions**
  - Unrelated geometry fields change unexpectedly

## Cross-phase mandatory smoke tests (run after every phase)

### X-T01-CRLF-OUTPUT
- **Input Rows**
  - Generate PCF through Ray and Fixer paths
- **Expected Output**
  - All output lines use CRLF
- **Pass Assertions**
  - No LF-only line endings
- **Fail Assertions**
  - Any export path emits LF-only files

### X-T02-SKEY-LEXICAL
- **Input Rows**
  - FLANGE/VALVE/BEND/TEE/OLET/REDUCER
- **Expected Output**
  - `<SKEY>` token format used everywhere
- **Pass Assertions**
  - Exact token `<SKEY>` found
- **Fail Assertions**
  - `SKEY`/`Skey` without angle brackets

### X-T03-SUPPORT-CONTRACT
- **Input Rows**
  - SUPPORT with varied friction/gap/node data
- **Expected Output**
  - CO-ORDS bore=0, no CA lines, GUID starts `UCI:`
- **Pass Assertions**
  - All three constraints hold
- **Fail Assertions**
  - Any SUPPORT contract violation

## Phase execution integration requirement (mandatory)

For **each phase plan**, include a **Verification Checklist** section containing:
1. Pre-change baseline run results
2. Post-change results for all phase test IDs
3. Diff summary (expected vs unexpected)
4. Sign-off block (Pass/Conditional/Fail with approver/date)

## Phase progression gate (mandatory)

- **Phase progression is blocked** if any critical assertion fails.
- **Sign-off cannot be granted** until all test IDs in the active phase are executed and documented.
- **Cross-phase smoke tests (X-T01 to X-T03)** must be executed after each phase and included in sign-off evidence.
