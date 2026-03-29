# Ray Concept (Ray Engine) - Technical Documentation

## 1. Executive Summary
The **Ray Engine (Ray Concept)** is an autonomous, 3D coordinate-based heuristic engine designed to read raw 2D pipe component records, reconstruct precise 3D spatial connections, and generate a Piping Component File (PCF).

It operates on the principle of **"raycasting"**: components (fittings, valves, flanges) are placed at their absolute 3D coordinates. To connect them via straight pipes, the engine shoots mathematical "rays" from unconnected endpoint faces. When a ray hits another unconnected face within a calculated tolerance, a synthetic `PIPE` bridge is injected between them.

The system is entirely stateless across runs, strictly separated into four modular stages, and relies heavily on a highly tunable fallback and recovery mechanism to guarantee continuity in visually imperfect data.

---

## 2. Core Modules Architecture

The process is strictly sequential. Each stage consumes the output of the previous stage.

### 2.1 Stage 1: Parser (`rc-stage1-parser.js`)
*   **Purpose:** Ingests the raw CSV row objects and transforms them into standardized, mathematically actionable 3D `Component` objects.
*   **Core Logic:**
    *   Extracts X, Y, Z coordinates (`cp`, `ep1`, `ep2`, `bp`).
    *   Determines component `bore` sizes using lookup tables or regex extraction from the "Size" column.
    *   Computes `BRLEN` (Branch Length) dynamically for TEEs and OLETs based on `ASME B16.9` and `MSS SP-97` specifications.
*   **Output:** An array of structured `Component` objects.

### 2.2 Stage 2: Extractor (`rc-stage2-extractor.js`)
*   **Purpose:** Filters the normalized components to retain only explicit "fittings" and structural elements, discarding ambiguous `PIPE`, `GASK`, `MISC`, and `ATTA` types (except `SUPPORT`). Generates the "Fittings-only" base PCF string.
*   **Core Logic:**
    *   Builds the initial PCF headers (`ISOGEN-FILES`, `UNITS`, `PIPELINE-REFERENCE`).
    *   For each retained component, outputs its geometry block (e.g., `FLANGE`, `BEND`, `TEE`, `VALVE`, `OLET`, `SUPPORT`).
    *   **SUPPORT Logic:** `SUPPORT` components themselves do not have connective faces. To ensure they attach to the pipeline, the extractor performs a point-to-line proximity check to find the parent pipe segment and injects a microscopic (1mm) synthetic `PIPE` stub acting as an anchor.
*   **Output:** `{ pcfText: string }` containing all non-pipe geometry blocks.

### 2.3 Stage 3: Ray Engine (`rc-stage3-ray-engine.js`)
*   **Purpose:** The core spatial reasoning engine. It builds a global connection map by evaluating 3D alignment, proximity, and component types.
*   **Core Logic:** Components are decomposed into logical "Faces" (`ep1`, `ep2`, `bp`). The engine iteratively connects faces in overlapping passes from strict to loose tolerances:
    *   **Initial Resolution:** Faces sharing the exact same 3D coordinates (within a 1mm bucket) are instantly connected.
    *   **Pass 0 (Gap Fill):** Searches for isolated components extremely close to each other (e.g., `< 6mm`). It snaps them together and modifies their coordinates to close tiny translation errors without generating microscopic pipe fragments.
    *   **Pass 1 (Bridging & Fallbacks):**
        *   **Pass 1A (Primary Raycast):** Infers a component's forward vector (from `ep1` to `ep2`) and shoots a ray up to 20,000mm. If it intercepts another face within `3mm` cylindrical radius, a `PIPE` bridge is injected.
        *   **OLET / TEE Passthrough:** OLET chains (e.g., OLET -> OLET -> OLET on the same header) are problematic because their endpoints sit at the exact same coordinate (`cp`), meaning they have no innate forward vector. The engine uses `_passthroughDir`: when an OLET's `ep1` connects to an upstream pipe, the engine copies the pipe's vector to `ep2`, enabling the next ray to shoot down the header.
        *   **Pass 1B (Horizontal Fallback):** For faces that failed 1A, the engine shoots 4 rays along the major horizontal axes (±X, ±Y). It restricts the search to rays that align positively with the component's expected outward direction (dot product `> 0.5`).
        *   **Pass 1C (Full 6-Axis Fallback):** A final, looser fallback (all 6 cardinal axes, wider tolerance radius like 12.5mm) designed to catch slightly misaligned headers.
    *   **Pass 2 (Branch Resolution):** Exclusively processes TEE and OLET branch points (`bp`). It calculates the branch vector from the center point (`cp`) to `bp` and casts a ray. If the primary ray misses, it executes a proximity fallback—finding the closest unconnected pipe within 1500mm that roughly aligns (`> 0.85` dot product) with the branch trajectory.
    *   **Pass 3 (Cleanup):** A final safety net utilizing 6-axis raycasting for stubbornly disconnected endpoints (often caused by `GASK` gaps filtering upstream logic).
*   **Output:** `{ injectedPipes: Array, connectionMap: Map, orphanList: Array, connectionMatrix: Array }`

### 2.4 Stage 4: Emitter (`rc-stage4-emitter.js`)
*   **Purpose:** Merges the structural PCF string from Stage 2 with the synthetic `PIPE` bridges dynamically generated in Stage 3.
*   **Core Logic:** Iterates over the `injectedPipes` array, safely calculating the `LEN` parameters and emitting the final `PIPE` blocks with endpoints, bore sizes, and pipeline references.
*   **Output:** The final, complete `.pcf` text file.

---

## 3. Tunable Configurations & Fallbacks (`rc-config.js`)

The Ray Engine is driven by `rc-config.js`, allowing extreme flexibility without altering core logic.

### 3.1 Primary Raycast Tuning
*   `rayMaxDistance` (Default: `1,000,000 mm`): Absolute cap on how far a ray can travel before failing. Prevents infinite looping across sprawling plant models.
*   `boreTolMultiplier` (Default: `0.5`): Cylindrical ray width. Calculates hit tolerance dynamically based on the component's bore (e.g., a 200mm pipe has a 100mm tolerance radius).
*   `minBoreTol` (Default: `25.0 mm`): Hard floor for the above multiplier. Ensures very small pipes (e.g., 15mm instrumentation) aren't mathematically impossible to hit due to rounding errors.

### 3.2 6-Axis Fallback (Pass 1B, 1C, Pass 3)
If a primary ray misses because the pipeline is slightly stepped or askew:
*   `sixAxP1Diameter` (Default: `6 mm`): Used in horizontal fallback (Pass 1B). Enforces a strict 3mm radius to prevent accidentally connecting parallel racks.
*   `sixAxP2Diameter` (Default: `25 mm`): Used in full fallback (Pass 1C). Looser tolerance.
*   `sixAxP2DiamREDU` (Default: `100 mm`): Reducers often skew heavily. This specific override gives them a 50mm search radius.

### 3.3 Pass-Through & Proximity Fallback (Pass 2)
*   `proximityMaxDist` (Default: `1500 mm`): TEE/OLET branches that miss their target will only search up to 1.5 meters for a valid connection. Previously uncapped, leading to 135km cross-plant anomalies.
*   `proximityMinDot` (Default: `0.85`): Ensures that proximity snaps only happen if the target is within roughly 32 degrees of the intended branch trajectory.

### 3.4 Early Exits & Exclusions
*   `deTypes` (Dead-End Types - Default: `['FLANGE']`): Types that trigger early-exit in the ray engine. If one face of a flange is connected, the engine immediately aborts evaluating the opposite face, preventing the engine from shooting straight through terminal flanges.
*   `fittingTypes`: An array defining exactly which components are retained in Stage 2. Elements outside this list (`PIPE`, `GASK`, `MISC`) are dropped, and the engine reconstructs the missing `PIPE` segments algorithmically.

---

## 4. OLET and TEE Domino Chain Logic
A persistent challenge in point-cloud pipeline models is sequential components placed at the exact same coordinate along a header (e.g., rows of OLETs).

Because `ep1` and `ep2` share the exact same `X,Y,Z`, calculating `vecNorm(ep2 - ep1)` returns `[0,0,0]`. The engine would historically freeze, leaving half the header disconnected.

**The Solution (`rearmOletPassthroughs`):**
When the engine successfully connects an incoming pipe to `OLET.ep1`, it captures the incoming vector. It immediately forces that vector into the unconnected `OLET.ep2._passthroughDir`. When `runPass1A` processes `OLET.ep2`, it utilizes this injected momentum vector to shoot the ray forward, cleanly hitting the next OLET in the chain, repeating the process perfectly down the line.