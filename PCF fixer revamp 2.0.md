# PCF Smart Fixer — Improvements Rev 2.0

**Document:** PCFImprovements_Rev2.md
**Date:** 2026-03-28
**Scope:** PCF Fixer Tab — 3D Topology Viewer, UI, Tools, and New "Draw Canvas" Feature
**Status:** Proposal / Roadmap

---

## Table of Contents

2. [New Features Recommended](#2-new-features-recommended)
3. [User-Requested Ideas](#3-user-requested-ideas)
4. [Draw Canvas — Detailed Professional Feature List](#4-draw-canvas--detailed-professional-feature-list)
6. [Appendix A — AI Work Instructions for Future Improvements](#appendix-a--ai-work-instructions-for-future-improvements)

---
---

## 2. New Features Recommended

### 2.1 Smart Auto-Route Engine

**Purpose:** Automatically generate a pipe route between two user-specified 3D endpoints, respecting bend radius constraints, obstacle avoidance, and minimum straight-run requirements.

**Key capabilities:**
- Click two endpoints in 3D to define start/end
- Engine calculates shortest orthogonal route (Manhattan routing in 3D)
- Respects configured bend radius and minimum tangent lengths
- Generates PCF-compliant PIPE + BEND sequence
- Visual preview of proposed route before committing

### 2.2 Collision Detection and Clash Report

**Purpose:** Detect physical clashes between pipes, valves, structural steel, and equipment.

**Key capabilities:**
- BVH-accelerated bounding-box intersection for all rendered meshes
- Color-code clashing components (flash red)
- Generate a clash report table: Component A vs Component B, overlap distance, location
- Filter by severity: hard clash (>0mm overlap), soft clash (clearance < configurable threshold)

### 2.3 Isometric Annotation Layer

**Purpose:** Auto-generate 2D isometric-style annotations overlaid on the 3D view for documentation screenshots.

**Key capabilities:**
- Dimension lines between endpoint pairs
- Component callouts with type, size, and schedule
- Weld points and joint markers
- Toggle layer on/off; export as SVG or PNG overlay

### 2.4 PCF Diff Viewer

**Purpose:** Compare two PCF versions side-by-side to highlight what changed (pre-fix vs post-fix).

**Key capabilities:**
- Split-pane text diff with syntax highlighting for PCF keywords
- 3D diff mode: overlay original (wireframe) vs modified (solid) in same canvas
- Change summary: "3 components modified, 2 gaps filled, 1 support added"

### 2.5 Component Library / Template Palette

**Purpose:** Drag-and-drop standard piping components from a categorized palette into the 3D canvas.

**Key capabilities:**
- Categorized palette: Pipes, Fittings (Bends, Tees, Reducers), Valves, Flanges, Supports
- Each template has configurable parameters (bore, length, schedule, rating)
- Drag from palette → drop into 3D scene at cursor position
- Auto-snap to nearest open endpoint

### 2.6 Multi-Line Overlay Mode

**Purpose:** Visualize multiple pipeline Line Keys simultaneously with color-coded differentiation.

**Key capabilities:**
- Each Line Key rendered in a distinct color from a palette
- Toggle individual lines on/off via checkbox list
- Transparency slider per line for layered viewing
- Intersection points between lines highlighted

### 2.7 Real-Time Validation Dashboard

**Purpose:** Continuously validate the PCF model against engineering rules as edits happen.

**Key capabilities:**
- Live rule checks: bore mismatch, unsupported spans, slope violations, missing spec breaks
- Traffic-light indicators per rule (green/yellow/red)
- Click a violation → camera zooms to offending component
- Rules configurable via JSON (project-specific validation profiles)

### 2.8 Keyboard Shortcut System

**Purpose:** Professional CAD-like keyboard navigation.

| Shortcut | Action |
|----------|--------|
| `F` | Fit all to view (Auto Center) |
| `Z` | Zoom selected |
| `1-6` | Front/Back/Left/Right/Top/Bottom views |
| `Numpad 5` | Toggle orthographic/perspective |
| `Delete` | Delete selected component (with confirmation) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+A` | Select all |
| `Escape` | Deselect all |
| `M` | Toggle Measure mode |
| `G` | Toggle Grid |
| `L` | Toggle Labels |
| `Space` | Toggle component list panel |

---

## 3. User-Requested Ideas

### 3.a Marquee Zoom and Marquee Select — Improvements Required

**Current State:** NOT IMPLEMENTED. The current 3D canvas (`App2.jsx`) only supports:
- Single-click selection via raycasting
- OrbitControls scroll-wheel zoom (centered on orbit target)
- "Auto Center" and "Zoom Selected" buttons

**Problems identified:**
- No box/rectangle selection — the user cannot drag a rectangle to select multiple components
- No box zoom — the user cannot drag a rectangle to zoom into a specific area
- The absence of these basic CAD operations makes working with large PCFs (100+ components) extremely tedious

**Proposed Implementation:**

#### 3.a.1 Marquee Select (Box Select)

```
Mode activation: Toolbar button "Box Select" or keyboard shortcut `B`
Behavior:
1. User clicks and drags on the canvas
2. A semi-transparent blue rectangle (CSS overlay) is drawn in real-time
   following the mouse from click-start to current position
3. On mouse-up, all components whose screen-projected bounding boxes
   intersect the marquee rectangle are added to `selectedIds`
4. Hold Shift during marquee to ADD to existing selection
5. Hold Alt during marquee to SUBTRACT from existing selection

Technical approach:
- Use a 2D HTML overlay div for the rubber-band rectangle (not in Three.js scene)
- On release, project each component's 3D bounding box center to screen coords
  using `vector.project(camera)` and convert to screen pixels
- For accuracy on large components, project all 8 corners of each component's
  bounding box and check if any corner falls within the marquee
- Alternative (GPU-based): Use THREE.Frustum constructed from the marquee
  corners and camera to test containment — more accurate for orthographic view
```

#### 3.a.2 Marquee Zoom (Box Zoom)

```
Mode activation: Toolbar button "Box Zoom" or keyboard shortcut `Shift+B`
Behavior:
1. User clicks and drags a rectangle on the canvas
2. Rectangle drawn with dashed orange border (to distinguish from box select)
3. On mouse-up, camera zooms to fit the defined rectangle area
4. For orthographic camera: adjust frustum left/right/top/bottom to match
   the selected screen region mapped back to world coordinates
5. Smooth animated transition (reuse existing CameraBridge lerp logic)

Technical approach:
- Convert the 2 screen-space corners of the rectangle to world-space rays
- For orthographic camera, unproject directly:
  startWorld = camera.unproject(ndcStart), endWorld = camera.unproject(ndcEnd)
- Set camera frustum to encompass the world-space rectangle
- Animate via CameraBridge with targetZoom calculated from rectangle aspect
```

#### 3.a.3 Rubber-Band UX Quality Requirements

- Rectangle must render at 60fps with no lag during drag
- Rectangle must not interfere with OrbitControls (use a mode toggle or modifier key)
- Visual feedback: fill color `rgba(59, 130, 246, 0.15)`, border `2px solid #3b82f6` for select; `rgba(249, 115, 22, 0.15)` border `2px dashed #f97316` for zoom
- Minimum drag threshold of 5px before activating (prevents accidental micro-drags)
- Cursor should change: crosshair during box select, zoom-in during box zoom

---

### 3.b Ribbon-Style Icons (Like MS Office) and 3D View Cube

#### 3.b.1 Ribbon Toolbar

**Current State:** The toolbar is a single flat row of HTML buttons with inline styles, emoji-based icons (1️⃣, 🚀), and no grouping beyond visual dividers.

**Proposed Ribbon Design:**

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ FILE          │ ANALYSIS        │ VIEW              │ TOOLS            │ EXPORT  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ [📂 Import]   │ [▶ Pass 1]      │ [🔲 Box Select]   │ [📏 Measure]     │ [💾 PCF]│
│ [📋 Mock]     │ [▶▶ Pass 2]     │ [🔍 Box Zoom]     │ [✂️ Clip Plane]  │ [📊 CSV]│
│ [⚡ Generate] │ [🔧 Apply Fix]  │ [🏠 Fit All]      │ [🏷️ Labels]     │ [📸 PNG]│
│               │ [⚙ Tolerances]  │ [🎯 Zoom Sel]     │ [📐 Grid]       │         │
│               │                 │ [🧊 Ortho/Persp]  │ [🎨 Colors]     │         │
│ Line: [▼ All] │ Mode: [▼ Seq]   │ ViewCube: [on/off] │ Snap: [on/off]  │         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Implementation approach:**
- Replace current inline-styled buttons with a dedicated `<RibbonToolbar />` React component
- Each ribbon tab is a `<RibbonGroup>` with a label and contained buttons
- Buttons use SVG icons (16x16 or 24x24) from a custom icon sprite or Lucide/Tabler icon library
- Active ribbon tab highlighted with accent color underline
- Responsive: on narrow screens, ribbon collapses to icon-only mode with tooltips
- Quick Access Toolbar (QAT) row above ribbon for most-used actions (Import, Generate, Pass 1)

**Icon requirements:**
- Consistent 24x24 SVG icons with 1.5px stroke weight
- Monochrome with accent color for active state
- Each icon should be self-explanatory with tooltip on hover
- Icon sprite loaded once, referenced by `<use>` for performance

#### 3.b.2 3D View Cube Enhancement

**Current State in Smart Fixer (App2.jsx):** Uses `@react-three/drei` `GizmoHelper` + `GizmoViewport` at bottom-right. This is a minimal axis widget (3 colored arrows), NOT a full view cube with clickable faces.

**Current State in Vanilla Viewer (viewer-3d.js):** Has a proper CSS 3D ViewCube with 6 labeled faces + 4 corner ISO views at top-right.

**Proposed Unified View Cube for Smart Fixer:**

- Replace the `GizmoViewport` in `App2.jsx` with a proper ViewCube component
- ViewCube should be an HTML overlay (like viewer-3d.js) positioned at **top-right**
- Keep the axis gizmo at **bottom-right** (smaller, 60x60)
- ViewCube features:
  - 6 clickable faces: Top, Bottom, Front, Back, Left, Right
  - 12 clickable edges for edge-on views
  - 8 clickable corners for isometric views
  - Smooth animated camera transitions on click (reuse CameraBridge)
  - Real-time rotation sync with camera (quaternion mirror)
  - Visual style matching the dark theme (semi-transparent faces, white labels, colored edges)
  - Right-click on ViewCube → context menu with "Set as Home View", "Reset View"
- Size: 100x100px, with hover scaling to 110x110px

---

### 3.c New "Draw Canvas" Button and Feature

**Concept:** A dedicated drawing environment for creating and editing 3D piping geometry from scratch, separate from the topology fixer's analysis canvas.

**Workflow:**
1. User clicks **"Draw Canvas"** button in the Smart Fixer ribbon toolbar
2. A new full-screen modal or split-pane opens with a fresh 3D canvas
3. The canvas has a grid floor, snap points, and drawing tools
4. User draws piping geometry by placing points in 3D grid space
5. Drawn geometry can be:
   - Edited for exact dimensions (double-click or popup)
   - Exported back to PCF format
   - Merged into the existing PCF model in the fixer tab

**Point Placement & Editing (Two methods):**

**(i) Double-click editing:**
- Double-click any drawn element (pipe segment, bend, etc.)
- A property editor panel opens with fields for:
  - Length (mm), Bore (mm), Wall Thickness
  - Start/End coordinates (X, Y, Z)
  - Bend angle and radius (for bends)
  - Component Attributes (CA1, CA2, etc.)
  - Support type and orientation

**(ii) Inline popup on Point 2 placement:**
- When the user places the second point of a segment, an inline popup appears at the cursor:
  ```
  ┌─────────────────────────────────┐
  │ Length: [1200.0] mm   Bore: [200] │
  │ Direction: X ● Y ○ Z ○          │
  │ [Add Support] [Edit CAs] [Done] │
  └─────────────────────────────────┘
  ```
- User can type exact length → the endpoint snaps to the correct position
- "Add Support" inserts a support at the current point
- "Edit CAs" opens the component attribute editor
- "Done" or Enter confirms and moves to the next segment

---

## 4. Draw Canvas — Detailed Professional Feature List

### 4.1 Canvas Environment

| # | Feature | Description |
|---|---------|-------------|
| 4.1.1 | **3D Grid Floor** | Infinite grid plane at Y=0 with major (1000mm) and minor (100mm) grid lines. Major lines: `#3a4255`, Minor lines: `#252a3a`. Grid fades with distance (fog). |
| 4.1.2 | **Grid Scale Adaptation** | Grid density adapts to zoom level: zoomed out → 5000mm major, zoomed in → 10mm minor. Scale indicator in bottom-left corner. |
| 4.1.3 | **World Origin Marker** | RGB axis arrows at origin (0,0,0): X=Red, Y=Green, Z=Blue, each 500mm long. Small sphere at origin. |
| 4.1.4 | **Background** | Gradient background from `#1a1f2e` (top) to `#0d1117` (bottom). Optional: environment map for reflective materials. |
| 4.1.5 | **Orthographic + Perspective Toggle** | Default: Orthographic for precision drafting. Toggle to perspective for spatial understanding. Shortcut: `Numpad 5`. |
| 4.1.6 | **Work Planes** | User-definable work planes (XY, XZ, YZ, or custom). Drawing snaps to the active work plane. Visual indicator shows active plane as a tinted overlay. |
| 4.1.7 | **Coordinate System Display** | Persistent bottom-left readout: `X: 1200.0  Y: 0.0  Z: 3400.0` tracking cursor world position in real-time. |

### 4.2 Snap System

| # | Feature | Description |
|---|---------|-------------|
| 4.2.1 | **Grid Snap** | Cursor snaps to nearest grid intersection. Toggle: `S` key or toolbar button. Visual: small + marker at snap point. |
| 4.2.2 | **Endpoint Snap** | Snap to existing component endpoints (EP1, EP2). Visual: green circle indicator when within snap radius. |
| 4.2.3 | **Midpoint Snap** | Snap to the midpoint of any existing segment. Visual: triangle marker. |
| 4.2.4 | **Centre Point Snap** | Snap to centre points of bends, tees, and valves. Visual: crosshair marker. |
| 4.2.5 | **Perpendicular Snap** | When drawing near an existing segment, snap to the perpendicular projection point. Visual: right-angle indicator. |
| 4.2.6 | **Axis Lock** | While drawing, press `X`, `Y`, or `Z` to lock movement to that axis. Visual: colored line along locked axis. |
| 4.2.7 | **Angle Snap** | Snap to 0, 45, 90, 135, 180 degree increments relative to previous segment. Configurable angle set. |
| 4.2.8 | **Snap Radius** | Configurable snap radius in pixels (default: 15px). Nearest snap point within radius wins. Priority: Endpoint > Midpoint > Grid. |
| 4.2.9 | **Smart Ortho** | While drawing, infer whether the user intends horizontal, vertical, or depth movement and auto-lock to the dominant axis until they deviate significantly. |

### 4.3 Drawing Tools

| # | Tool | Description |
|---|------|-------------|
| 4.3.1 | **Draw Pipe** | Click point 1 → click point 2 → creates a PIPE segment. Continuous mode: after point 2, automatically starts a new segment from point 2. Press `Escape` or right-click to end chain. |
| 4.3.2 | **Draw Bend** | Three-point bend: click start → click centre → click end. Auto-calculates bend angle and radius. Alternatively: draw two pipe segments meeting at an angle → auto-insert bend at junction. |
| 4.3.3 | **Draw Tee** | Click on an existing pipe segment → a branch point is created at the click location → draw the branch pipe from there. |
| 4.3.4 | **Insert Flange** | Click on any endpoint → flange is inserted with configurable bore and rating. Inline popup for flange properties. |
| 4.3.5 | **Insert Valve** | Click on a pipe segment → valve is inserted at click point, splitting the pipe. Choose valve type from dropdown (gate, globe, ball, check, butterfly). |
| 4.3.6 | **Insert Reducer** | Click between two pipe segments of different bore → reducer inserted. Auto-detect concentric vs eccentric based on alignment. |
| 4.3.7 | **Insert Support** | Click on a pipe segment → support placed at click point. Choose type: Rest, Guide, Anchor/Fixed, Spring, Hanger. Arrow geometry generated based on type. |
| 4.3.8 | **Polyline Draw** | Continuous multi-point pipe routing: click a sequence of points → engine auto-inserts PIPE + BEND at each turn. Bend radius configurable. |
| 4.3.9 | **Rectangle Route** | Click start + end → auto-generate an L-shaped or U-shaped orthogonal route between the two points with bends at corners. |
| 4.3.10 | **Copy/Mirror** | Select components → copy to clipboard → paste at new location. Mirror tool: select + pick mirror plane → mirrored copy created. |

### 4.4 Editing Tools

| # | Tool | Description |
|---|------|-------------|
| 4.4.1 | **Select (Single)** | Click to select a component. Yellow highlight + outline effect. |
| 4.4.2 | **Select (Marquee)** | Drag rectangle to select all components within the box (as described in Section 3.a). |
| 4.4.3 | **Move** | Select component → drag to new position. Constrained to active work plane or axis-locked. Shows ghost preview during drag. |
| 4.4.4 | **Stretch** | Select a pipe endpoint → drag to extend or shorten. Connected components move accordingly (chain update). |
| 4.4.5 | **Rotate** | Select component → rotate around its centre point. Angle snap: 15-degree increments by default. |
| 4.4.6 | **Delete** | Select → press `Delete`. Confirmation dialog for components with connections. Auto-reconnects adjacent components if possible. |
| 4.4.7 | **Split** | Click on a pipe segment → pipe is split into two at the click point. Useful for inserting valves/tees mid-run. |
| 4.4.8 | **Join** | Select two collinear pipe endpoints within tolerance → merge into a single pipe. |
| 4.4.9 | **Trim/Extend** | Click a pipe near another pipe → trim to intersection or extend to meet. |
| 4.4.10 | **Property Editor** | Double-click any component → full property panel opens with all editable fields (bore, length, coordinates, CAs, schedule, spec). |

### 4.5 Toolbar Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ DRAW CANVAS                                                            [Minimize] [Close]│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─ LEFT TOOLBAR (Vertical, 48px wide) ──┐  ┌─ CANVAS ────────────────────────────────┐ │
│  │                                        │  │                                          │ │
│  │  [↖ Select]          ← Active tool     │  │   ViewCube (top-right, 100x100)          │ │
│  │  [⬚ Box Select]                        │  │                                          │ │
│  │  ─────────────                         │  │                                          │ │
│  │  [╱ Draw Pipe]                         │  │         3D Grid Canvas                   │ │
│  │  [⌒ Draw Bend]                         │  │         with snap indicators             │ │
│  │  [⊤ Draw Tee]                          │  │                                          │ │
│  │  ─────────────                         │  │                                          │ │
│  │  [◎ Flange]                            │  │                                          │ │
│  │  [⊗ Valve]                             │  │                                          │ │
│  │  [◇ Reducer]                           │  │                                          │ │
│  │  [▽ Support]                           │  │   Axis Gizmo (bottom-right, 60x60)       │ │
│  │  ─────────────                         │  │   Coordinate readout (bottom-left)        │ │
│  │  [✋ Move]                              │  │   Scale bar (bottom-center)               │ │
│  │  [⇔ Stretch]                           │  │                                          │ │
│  │  [↻ Rotate]                            │  └──────────────────────────────────────────┘ │
│  │  [✂ Split]                             │                                                │
│  │  [🔗 Join]                              │  ┌─ PROPERTIES PANEL (Right, 300px) ────────┐ │
│  │  [✕ Delete]                            │  │  Component: PIPE #4                       │ │
│  │  ─────────────                         │  │  ────────────────────                     │ │
│  │  [📏 Measure]                           │  │  Length:  [1200.0] mm                     │ │
│  │  [📐 Dimension]                         │  │  Bore:   [200.0]  mm                     │ │
│  │  ─────────────                         │  │  EP1: [100, 0, 200]                       │ │
│  │  [🔲 Grid On/Off]                       │  │  EP2: [1300, 0, 200]                     │ │
│  │  [🧲 Snap On/Off]                       │  │  Schedule: [40]                          │ │
│  │  [📌 Axis Lock]                         │  │  Spec: [A1A]                             │ │
│  │                                        │  │  ────────────────────                     │ │
│  └────────────────────────────────────────┘  │  CA1: [value]                             │ │
│                                              │  CA2: [value]                             │ │
│  ┌─ BOTTOM STATUS BAR ───────────────────────│  ────────────────────                     │ │
│  │ Tool: Draw Pipe | Snap: Grid+Endpoint |   │  [Apply] [Cancel] [Delete]               │ │
│  │ X: 1200.0  Y: 0.0  Z: 3400.0 |          │                                           │ │
│  │ Components: 34 | Selection: 2             └───────────────────────────────────────────┘ │
│  └───────────────────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─ COMPONENT LIST (Bottom, collapsible, 200px) ────────────────────────────────────────┐ │
│  │  # | Type   | Length  | Bore | EP1              | EP2              | Status           │ │
│  │  1 | PIPE   | 1200.0  | 200  | [100, 0, 200]   | [1300, 0, 200]  | OK              │ │
│  │  2 | BEND   | 283.0   | 200  | [1300, 0, 200]  | [1300, 0, 483]  | OK              │ │
│  │  3 | PIPE   | 2400.0  | 200  | [1300, 0, 483]  | [1300, 0, 2883] | OK              │ │
│  └──────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Dimension Input System

| # | Feature | Description |
|---|---------|-------------|
| 4.6.1 | **Inline length input** | After placing point 1, as the user moves the mouse toward point 2, a floating input box follows the cursor showing the current distance. User can type an exact value and press Enter to place point 2 at that exact distance along the current direction. |
| 4.6.2 | **Coordinate input bar** | Bottom status bar has editable X, Y, Z fields. Type exact coordinates → press Enter → point placed at those coordinates. Supports relative input: `@1200,0,0` means 1200mm offset from last point. |
| 4.6.3 | **Angle input** | When drawing a bend, a floating angle readout shows the current angle. User can type exact angle (e.g., 90) and press Enter. |
| 4.6.4 | **Dynamic dimension lines** | As the user draws, temporary dimension lines appear showing: length of current segment, distance from origin, angle from previous segment. |
| 4.6.5 | **Unit system** | Configurable units: mm (default), inches, meters. Conversion applied to all inputs and displays. |

### 4.7 Export and Integration

| # | Feature | Description |
|---|---------|-------------|
| 4.7.1 | **Export to PCF** | Convert all drawn geometry to PCF format. Maps each drawn component to proper PCF blocks (PIPE, BEND, TEE, etc.) with coordinates, bore, and CAs. |
| 4.7.2 | **Send to Fixer** | One-click transfer of drawn geometry to the Smart Fixer tab for topology analysis. Components appear in the fixer data table and 3D canvas. |
| 4.7.3 | **Import from Fixer** | Load existing fixer components into the Draw Canvas for manual editing and re-export. |
| 4.7.4 | **Save/Load Drawing** | Save drawing state as JSON file. Load previously saved drawings. Auto-save every 60 seconds to localStorage. |
| 4.7.5 | **Export Screenshot** | Capture current view as PNG with configurable resolution (1x, 2x, 4x). Optional: include dimension annotations in export. |

### 4.8 Advanced Features (Phase 2)

| # | Feature | Description |
|---|---------|-------------|
| 4.8.1 | **Parametric constraints** | "This pipe must be 90 degrees to that pipe" — constraints maintained during edits. |
| 4.8.2 | **Auto-bend insertion** | When two pipe segments meet at an angle, automatically insert a bend of the configured radius. |
| 4.8.3 | **Stress analysis preview** | Color-code pipes by estimated stress (length × weight / support span). Red = over threshold. |
| 4.8.4 | **BOM generation** | Auto-generate Bill of Materials from drawn components: type, size, count, weight estimate. |
| 4.8.5 | **Layer system** | Organize components into layers (Main line, Branches, Supports, Instrumentation). Toggle visibility per layer. |
| 4.8.6 | **Revision history** | Git-like revision tracking within the drawing session. Branch, merge, compare drawing states. |

---
## Appendix A — AI Work Instructions for Future Improvements

> **CRITICAL REFERENCE:** This appendix is based on the **latest production codebase** at
> `C:\Code\200-6\js\pcf-fixer\` (Vite + React + R3F + Zustand + Tailwind).
> The older `C:\Code\200-6 - AG\js\smart_fixer\` code is superseded.

---

### A.1 Purpose

This appendix provides detailed, step-by-step work instructions for an AI assistant (Claude Code or similar) to implement improvements described in Sections 1-5. Each instruction block references exact file paths, function names, line numbers, and proven patterns from the working codebase.

**The #1 source of bugs in 3D UI tools is event conflicts between OrbitControls and custom drawing/selection tools.** This appendix devotes an entire section (A.3) to the mandatory rules for avoiding these conflicts.

---

### A.2 Codebase Architecture Summary

```
C:\Code\200-6\js\pcf-fixer\
├── App.jsx                          # Tab routing (Canvas, DataTable, Config, Output)
├── main.jsx                         # React DOM entry point
├── exposeStore.js                   # window.useStore for debugging
│
├── store/
│   ├── useStore.js          (201L)  # ZUSTAND — 3D canvas state, tool modes, selection, undo
│   └── AppContext.jsx       (261L)  # REACT CONTEXT — data lifecycle, reducer, config
│
├── ui/
│   ├── components/
│   │   ├── ToolbarRibbon.jsx(241L)  # Tool mode buttons, color mode, rendering toggles
│   │   ├── NavigationPanel.jsx      # View presets (TOP, FRONT, ISO), PAN/ROTATE toggle
│   │   ├── SideInspector.jsx(210L)  # Single-element property editor
│   │   ├── SupportPropertyPanel.jsx # Multi-select support batch editor
│   │   ├── PipelinePropertyPanel.jsx# Batch pipeline-ref assignment
│   │   ├── GapSidebar.jsx           # Gap/proposal review panel
│   │   ├── SettingsModal.jsx        # App settings (grid, snap, camera, colors)
│   │   ├── ClippingPlanesLayer.jsx  # Section-box clipping
│   │   └── StatusBar.jsx            # Bottom bar with mode indicator
│   └── tabs/
│       └── CanvasTab.jsx   (2526L)  # THE BIG FILE — all 3D scene components
│
├── engine/
│   ├── GapFixEngine.js     (222L)   # fix6mm, fix25mm, breakPipeAtPoint, insertSupportAtPipe
│   ├── TopologyEngine.js            # autoAssignPipelineRefs
│   ├── Validator.js                 # Geometry validation rules
│   └── ... (20+ engine files)
│
├── math/
│   ├── VectorMath.js
│   └── KDTree.js
│
└── utils/
    ├── Logger.js
    └── ImportExport.js
```

**Technology Stack:**
- **3D:** Three.js via React Three Fiber (`@react-three/fiber`) + `@react-three/drei`
- **State:** Zustand (useStore.js) for 3D perf + React Context (AppContext.jsx) for data lifecycle
- **UI:** React 18 + Tailwind CSS
- **Build:** Vite
- **Rendering:** `instancedMesh` for pipes (10K+), individual meshes for fittings

**Dual-Store Pattern (CRITICAL):**
Both stores MUST be updated for any data mutation:
```javascript
// 1. Update AppContext (triggers React re-renders for panels/tables)
dispatch({ type: 'APPLY_GAP_FIX', payload: { updatedTable } });
// 2. Mirror to Zustand (triggers 3D canvas re-renders, faster)
useStore.getState().setDataTable(updatedTable);
```

**Canvas Mode State Machine (useStore.js:37):**
```
canvasMode: 'VIEW' | 'CONNECT' | 'STRETCH' | 'BREAK' |
            'INSERT_SUPPORT' | 'MEASURE' |
            'MARQUEE_SELECT' | 'MARQUEE_ZOOM' | 'MARQUEE_DELETE'
```
Every tool layer checks `canvasMode` and renders `null` if not its turn.

---

### A.3 MANDATORY: 3D Camera / OrbitControls / Pointer Event Conflict Rules

> **THIS IS THE MOST IMPORTANT SECTION.** Most 3D drawing tool failures occur because
> OrbitControls (rotate/pan/zoom on drag) steals pointer events from custom tools
> (marquee drag, endpoint drag, measurement click). These rules are non-negotiable.

#### RULE 1: Categorize Every Tool as CLICK-BASED or DRAG-BASED

| Category | Tools | OrbitControls | Why |
|----------|-------|---------------|-----|
| **Click-based** | MEASURE, BREAK, CONNECT, STRETCH, INSERT_SUPPORT | **ENABLED** | User clicks discrete points. Between clicks, they need orbit/pan/zoom to navigate. OrbitControls only fires on drag, not single clicks, so there is no conflict. |
| **Drag-based** | MARQUEE_SELECT, MARQUEE_ZOOM, MARQUEE_DELETE, future MOVE/DRAW tools | **DISABLED** | User drags on canvas. If OrbitControls is enabled, the drag will rotate/pan the camera instead of drawing the marquee/moving the object. |

**Implementation (CanvasTab.jsx:2057-2061):**
```javascript
const controlsEnabled = !['MARQUEE_SELECT', 'MARQUEE_ZOOM', 'MARQUEE_DELETE'].includes(canvasMode);
return <OrbitControls enabled={controlsEnabled} ... />;
```

**For any new drag-based tool, you MUST:**
1. Add its mode name to the `controlsEnabled` exclusion array
2. Verify OrbitControls is fully disabled during the tool's operation
3. Never rely on `e.stopPropagation()` alone — OrbitControls listens at the renderer DOM level, not through R3F's event system

#### RULE 2: Every Tool Mesh Must Call `e.stopPropagation()`

Without `e.stopPropagation()`, a click on a tool's invisible capture plane will bubble up to the parent `<group onPointerMissed={...}>`, causing:
- Unexpected deselection of selected elements
- Other tool layers receiving the same event
- Canvas background click handler firing

**Pattern (every handler, no exceptions):**
```javascript
const handlePointerDown = (e) => {
    e.stopPropagation();  // FIRST LINE, ALWAYS
    // ... tool logic
};
```

#### RULE 3: Use Invisible Capture Planes Correctly

Tools that need to detect clicks on "empty space" (not on existing meshes) must render an invisible capture plane. This is the **only reliable way** to get `e.point` (world coordinates) from a click on nothing.

**Correct pattern (from MarqueeLayer, CanvasTab.jsx:1118-1129):**
```jsx
<mesh
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    rotation={[-Math.PI / 2, 0, 0]}       // Lay flat on XZ plane
    position={[0, startPt?.y || 0, 0]}     // At current Y level
    scale={[2000, 2000, 1]}                // Large enough to cover viewport
    renderOrder={-1}                        // Render behind everything
>
    <planeGeometry args={[500, 500]} />
    <meshBasicMaterial
        visible={false}       // INVISIBLE — user cannot see it
        depthTest={false}     // Does NOT occlude objects behind it
    />
</mesh>
```

**CRITICAL properties:**
| Property | Value | Why |
|----------|-------|-----|
| `visible` | `false` | User must not see the capture plane |
| `depthTest` | `false` | Objects behind the plane must still render and be clickable by other tools |
| `depthWrite` | `false` (or omit) | Must not write to depth buffer or it hides everything behind |
| `renderOrder` | `-1` | Renders first, so real geometry draws on top |
| `scale` | Large (2000+) | Must cover entire viewport at any zoom level |
| `rotation` | `[-Math.PI/2, 0, 0]` | Lay flat on XZ plane (matches piping coordinate system) |

**DO NOT:**
- Use `args={[500000, 500000]}` on geometry — causes WebGL precision errors and context loss
- Use `args={[200000, 200000]}` on a single-sided plane without rotation — will be edge-on in some views
- Forget `depthTest={false}` — this is the #1 cause of "invisible wall blocking all clicks"
- Forget `depthWrite={false}` — this makes objects behind the plane disappear

#### RULE 4: Use Pointer Capture for Drag Operations

If the user drags fast enough that the cursor leaves the canvas element, pointer events stop firing. Use pointer capture to keep receiving events even outside the canvas.

**Pattern (from MarqueeLayer, CanvasTab.jsx:1027-1042):**
```javascript
const handlePointerDown = (e) => {
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);  // CAPTURE
    setStartPt(e.point.clone());
};

const handlePointerUp = (e) => {
    e.stopPropagation();
    e.target.releasePointerCapture(e.pointerId);  // RELEASE
    // ... finalize tool action
};
```

**Without pointer capture:** Fast marquee drags will "lose" the mouse and leave a phantom selection state.

#### RULE 5: Guard Selection Handlers Against Active Tools

When in a tool mode (MEASURE, BREAK, etc.), clicking on a pipe should NOT select it — it should trigger the tool action instead.

**Pattern (from InstancedPipes, CanvasTab.jsx:213-219):**
```javascript
const handlePointerDown = (e) => {
    const canvasMode = useStore.getState().canvasMode;

    // GUARD: Skip selection if a tool is active
    if (canvasMode !== 'VIEW') {
        return;  // Let the event bubble to the tool's capture plane
    }

    e.stopPropagation();
    // ... selection logic
};
```

**Without this guard:** Clicking a pipe in MEASURE mode will select it AND measure, causing confusion. The tool's invisible plane won't receive the event because the pipe mesh consumed it.

#### RULE 6: Guard `onPointerMissed` Against DOM UI Clicks

R3F's `onPointerMissed` fires for ANY click that doesn't hit a mesh — including clicks on HTML UI panels that overlay the canvas. This causes "phantom deselection" when the user clicks a button.

**Pattern (from InstancedPipes, CanvasTab.jsx:268-287):**
```javascript
const handlePointerMissed = (e) => {
    // GUARD 1: Ignore if click was on an HTML element, not the canvas
    if (e.nativeEvent?.target?.tagName !== 'CANVAS') return;

    // GUARD 2: Preserve multi-selection if Ctrl/Cmd held
    if (e.ctrlKey || e.metaKey) return;

    // Now safe to deselect
    useStore.getState().setSelected(null);
    useStore.getState().clearMultiSelect();
};
```

#### RULE 7: Tool-Specific Capture Meshes for Existing Geometry Interaction

Tools like BREAK and INSERT_SUPPORT need to detect clicks ON existing pipes (not on empty space). They render transparent overlay cylinders that match the pipe geometry but with a slightly larger radius.

**Pattern (from BreakPipeLayer, CanvasTab.jsx:1300-1317):**
```jsx
{dataTable.filter(r => r.type === 'PIPE').map((pipe, i) => {
    // ... compute mid, dist, quat, r from pipe endpoints
    return (
        <mesh key={`bp-${i}`}
              position={mid}
              quaternion={quat}
              onPointerDown={(e) => handlePointerDown(e, pipe)}
        >
            <cylinderGeometry args={[r * 1.5, r * 1.5, dist, 8]} />
            <meshBasicMaterial
                color="red"
                transparent
                opacity={0}           // Invisible
                depthWrite={false}     // Doesn't hide anything
            />
        </mesh>
    );
})}
```

**Key: `r * 1.5`** — The overlay cylinder is 50% wider than the actual pipe, making it easier to click. Pipes are often very thin (bore 25mm = radius 12.5mm), so hitting them with a mouse is hard without this expansion.

#### RULE 8: One-Shot vs Continuous Tool Behavior

Decide for each tool whether it returns to VIEW mode after one action or stays active.

| Tool | Behavior | Code |
|------|----------|------|
| BREAK | One-shot (returns to VIEW after breaking) | `setCanvasMode('VIEW')` after action |
| INSERT_SUPPORT | Continuous (stays active for multiple insertions) | No mode reset |
| MARQUEE_SELECT | One-shot (returns to VIEW after selection) | `setCanvasMode('VIEW')` after action |
| CONNECT | One-shot | `setCanvasMode('VIEW')` after 2nd click |
| MEASURE | Continuous (auto-resets on 3rd click) | Stays in MEASURE mode |

#### RULE 9: Show Active Mode Indicator

The user must ALWAYS know which tool mode is active. A click that does nothing (because the wrong mode is active) is the worst UX failure.

**Pattern (CanvasTab.jsx, bottom overlay):**
```jsx
{canvasMode !== 'VIEW' && (
    <div className="bg-slate-800/90 text-slate-200 text-xs px-3 py-1.5 rounded">
        MODE: <strong>{canvasMode.replace('_', ' ')}</strong>
        <span className="ml-2 text-slate-400">Esc to cancel</span>
    </div>
)}
```

#### RULE 10: Camera Animation Must Not Block Tool Events

The `ControlsAutoCenter` component uses `useFrame` to lerp the camera. During animation, OrbitControls is still active. This is fine for click-based tools but can cause issues if a drag tool starts while the camera is still animating.

**Pattern: Stop animation when a tool activates:**
```javascript
useEffect(() => {
    if (canvasMode !== 'VIEW') {
        isAnimating.current = false;  // Stop any in-progress camera animation
    }
}, [canvasMode]);
```

#### RULE 11: Keyboard Shortcuts Must Not Fire in Input Fields

**Pattern (CanvasTab.jsx:2174-2176):**
```javascript
const handleKeyDown = (e) => {
    if (document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
         document.activeElement.tagName === 'TEXTAREA')) return;
    // ... handle shortcuts
};
```

Without this guard, typing "m" in a text field will activate the Measure tool.

#### RULE 12: Multi-Select with Ctrl+Click Must Coexist with OrbitControls

OrbitControls uses left-click for rotate (or pan). Ctrl+Click for multi-select can conflict if OrbitControls interprets Ctrl+Click as a modified drag.

**Solution:** OrbitControls in R3F/drei does NOT respond to Ctrl+Click by default. But if you remap `mouseButtons`, be careful:
```javascript
const mouseButtons = {
    LEFT: interactionMode === 'PAN' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: interactionMode === 'PAN' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
};
```
This maps LEFT to ROTATE or PAN. Ctrl+LEFT is not remapped, so it passes through to the mesh `onPointerDown` handler, where we check `e.ctrlKey`.

---

### A.4 Proven Patterns Reference (Copy-Paste Ready)

#### Pattern A: New Click-Based Tool Template

```jsx
const MyNewTool = () => {
    const canvasMode = useStore(state => state.canvasMode);
    const cursorSnapPoint = useStore(state => state.cursorSnapPoint);
    const pushHistory = useStore(state => state.pushHistory);

    // Only render when this tool is active
    if (canvasMode !== 'MY_TOOL') return null;

    const handlePointerDown = (e) => {
        e.stopPropagation();  // MANDATORY

        // Use snap point if available, else raw click point
        const pt = cursorSnapPoint ? cursorSnapPoint.clone() : e.point.clone();

        pushHistory('My Tool Action');
        // ... perform action with pt ...

        // One-shot: return to VIEW
        useStore.getState().setCanvasMode('VIEW');
    };

    return (
        <group>
            {/* Capture plane for clicks on empty space */}
            <mesh onPointerDown={handlePointerDown} renderOrder={-1}>
                <planeGeometry args={[200000, 200000]} />
                <meshBasicMaterial visible={false} depthWrite={false} />
            </mesh>

            {/* Visual feedback at cursor */}
            {cursorSnapPoint && (
                <mesh position={cursorSnapPoint}>
                    <sphereGeometry args={[20, 16, 16]} />
                    <meshBasicMaterial color="#eab308" transparent opacity={0.6} depthTest={false} />
                </mesh>
            )}
        </group>
    );
};
```

#### Pattern B: New Drag-Based Tool Template

```jsx
const MyDragTool = () => {
    const canvasMode = useStore(state => state.canvasMode);
    const setCanvasMode = useStore(state => state.setCanvasMode);
    const [startPt, setStartPt] = useState(null);
    const [currPt, setCurrPt] = useState(null);

    if (canvasMode !== 'MY_DRAG_TOOL') return null;

    // REMEMBER: OrbitControls MUST be disabled for this mode.
    // Add 'MY_DRAG_TOOL' to the exclusion list in ControlsAutoCenter.

    const handlePointerDown = (e) => {
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);  // CAPTURE for drag
        setStartPt(e.point.clone());
        setCurrPt(e.point.clone());
    };

    const handlePointerMove = (e) => {
        if (!startPt) return;
        setCurrPt(e.point.clone());
    };

    const handlePointerUp = (e) => {
        if (!startPt || !currPt) return;
        e.stopPropagation();
        e.target.releasePointerCapture(e.pointerId);  // RELEASE

        // ... compute result from startPt → currPt ...

        setStartPt(null);
        setCurrPt(null);
        setCanvasMode('VIEW');  // Return to normal
    };

    return (
        <group>
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, (startPt?.y || 0) + 1, 0]}
                scale={[2000, 2000, 1]}
                renderOrder={-1}
            >
                <planeGeometry args={[500, 500]} />
                <meshBasicMaterial visible={false} depthTest={false} />
            </mesh>

            {/* Drag visualization */}
            {startPt && currPt && (
                <Line
                    points={[ /* rectangle corners */ ]}
                    color="#3b82f6"
                    lineWidth={3}
                    depthTest={false}
                />
            )}
        </group>
    );
};
```

#### Pattern C: Adding a New Mode to the State Machine

```
STEP 1: useStore.js — Add mode to canvasMode type comment (line 37)
STEP 2: ControlsAutoCenter — If drag-based, add to exclusion list (line 2061)
STEP 3: InstancedPipes.handlePointerDown — Already guarded by `if (canvasMode !== 'VIEW') return;`
STEP 4: ImmutableComponents.handleSelect — Already guarded similarly
STEP 5: GlobalSnapLayer — If the tool needs snapping, add mode to isActive list (line 851)
STEP 6: ToolbarRibbon.jsx — Add button with toggle logic
STEP 7: Key handler — Add keyboard shortcut in CanvasTab.jsx useEffect (line 2173)
STEP 8: StatusBar — Mode already displayed dynamically
```

---

### A.5 Draw Canvas — Event Architecture Plan

The Draw Canvas (Section 3.c, 4) is the most complex future feature. It must solve the same OrbitControls-vs-tools problem but in a **drawing-first** context where tools are primary and camera navigation is secondary.

#### Recommended Architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│ DrawCanvas.jsx (modal overlay, separate React root)             │
│                                                                 │
│  ┌─ <Canvas> ─────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  <OrbitControls                                         │    │
│  │      enabled={activeTool === 'ORBIT'}                   │    │ ← INVERTED default!
│  │      mouseButtons={{                                    │    │   In draw canvas, orbit
│  │          LEFT: THREE.MOUSE.ROTATE,                      │    │   is a TOOL, not the default.
│  │          MIDDLE: THREE.MOUSE.DOLLY,                     │    │   Default is DRAW.
│  │          RIGHT: THREE.MOUSE.PAN                         │    │
│  │      }}                                                 │    │
│  │  />                                                     │    │
│  │                                                         │    │
│  │  <DrawToolLayer activeTool={activeTool} />              │    │
│  │  <SnapEngine />                                         │    │
│  │  <DrawnGeometry />                                      │    │
│  │  <GridFloor />                                          │    │
│  │  <ViewCube />                                           │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  <DrawToolbar />        <PropertyPanel />       <StatusBar />   │
└─────────────────────────────────────────────────────────────────┘
```

**Key difference from Fixer canvas:**
- In the Fixer, OrbitControls is ON by default and only disabled for drag tools
- In the Draw Canvas, OrbitControls is OFF by default and only enabled when the user holds middle-mouse-button or activates the "Orbit" tool
- This is because drawing IS the primary interaction — every click places geometry

**Navigation without OrbitControls always on:**
- **Middle mouse button:** Always enables orbit (native to OrbitControls via `mouseButtons.MIDDLE`)
- **Scroll wheel:** Always zooms (native to OrbitControls, works even when `enabled=false` in some configs — if not, listen for wheel events separately)
- **Right mouse button:** Always pans (via `mouseButtons.RIGHT`)
- **Space bar hold:** Temporarily enable OrbitControls for the duration of the hold (like Photoshop's hand tool)

**Draw tool click flow:**
```
User clicks on canvas
    ↓
DrawToolLayer.handlePointerDown(e)
    ↓
e.stopPropagation()
    ↓
SnapEngine.snap(e.point) → snappedPoint
    ↓
Tool state machine:
    DRAW_PIPE + no startPoint → set startPoint, show preview line
    DRAW_PIPE + has startPoint → create pipe from startPoint to snappedPoint
                                 show inline length popup
                                 set startPoint = snappedPoint (continuous mode)
```

---

### A.6 General AI Work Rules

1. **Read the file before editing.** Always read `CanvasTab.jsx` fully before adding a new tool layer. Understand the layering order and event flow.

2. **Dual-store sync is mandatory.** Every data mutation must update BOTH `AppContext` (via `dispatch`) AND `useStore` (via `setDataTable`). Forgetting one causes data desync between the table view and the 3D canvas.

3. **Follow Tailwind patterns.** The pcf-fixer uses Tailwind CSS classes, NOT inline styles. Use `className="bg-slate-900 text-xs ..."` not `style={{ background: '#1e293b' }}`.

4. **CanvasTab.jsx is monolithic by design.** All 3D scene components (InstancedPipes, MarqueeLayer, MeasureTool, BreakPipeLayer, etc.) live in CanvasTab.jsx. Do NOT refactor them into separate files unless explicitly asked. The co-location is intentional for event flow clarity.

5. **Window CustomEvents bridge the two stores.** Camera control, undo sync, and proposal approval use `window.dispatchEvent(new CustomEvent(...))`. This is the established pattern — do not replace with Zustand middleware or React context threading.

6. **Performance budget:** 30+ FPS with 10K pipes (instancedMesh). If a new feature drops below this, use `useMemo`, `useCallback`, or reduce per-frame allocations.

7. **Session persistence.** Camera position is saved to `sessionStorage` on unmount and restored on mount (CanvasTab.jsx:2024-2055). New persistent UI state should follow this pattern.

8. **`pushHistory('Label')` before any data mutation.** The undo system snapshots `dataTable` into a 20-deep stack. Every tool action that changes data must call `pushHistory` first.

9. **Test the event chain for every new tool:**
   - Does clicking a pipe in VIEW mode still select it? (Guard check)
   - Does clicking empty space in VIEW mode still deselect? (onPointerMissed)
   - Does the tool work in ortho view? In perspective view?
   - Does the tool work when zoomed way in? Way out?
   - Does fast dragging work? (Pointer capture)
   - Does clicking a UI button (toolbar, panel) trigger the tool? (tagName guard)
   - Does pressing Escape exit the tool? (keydown handler)

10. **Commit granularity.** One tool = one commit. Format: `feat(pcf-fixer): add [tool name] tool`

11. **Priority order:**
    1. Draw Canvas scaffold (separate canvas, grid, snap engine)
    2. Draw Pipe tool (the first drawing tool, validates the architecture)
    3. Inline length popup (dimension input on point placement)
    4. Draw Bend, Tee, Flange, Valve, Support tools
    5. Property editor (double-click)
    6. Export to PCF / Send to Fixer
    7. View Cube for both canvases
    8. Ribbon toolbar upgrade
    9. Rendering polish (SSAO, shadows, outlines)

---

### A.7 Checklist for Every New 3D Tool (Print & Verify)

Before submitting any new tool implementation, verify EVERY item:

```
[ ] 1. Tool layer returns null when canvasMode !== MY_MODE
[ ] 2. Every onPointerDown/Up handler calls e.stopPropagation() as FIRST line
[ ] 3. If drag-based: mode added to OrbitControls exclusion list (ControlsAutoCenter)
[ ] 4. If drag-based: setPointerCapture on pointerDown, releasePointerCapture on pointerUp
[ ] 5. Capture plane has: visible={false}, depthTest={false}, depthWrite={false}, renderOrder={-1}
[ ] 6. Capture plane uses scale (e.g., [2000,2000,1]) NOT huge geometry args
[ ] 7. Visual feedback meshes use depthTest={false} so they render on top of geometry
[ ] 8. InstancedPipes.handlePointerDown guard: if (canvasMode !== 'VIEW') return;  ← already exists
[ ] 9. ImmutableComponents.handleSelect guard: if (canvasMode !== 'VIEW') return;  ← already exists
[ ] 10. If tool needs snapping: mode added to GlobalSnapLayer.isActive array
[ ] 11. Tool button added to ToolbarRibbon.jsx with toggle behavior
[ ] 12. Keyboard shortcut added to CanvasTab.jsx handleKeyDown (with input field guard)
[ ] 13. Mode indicator shows in bottom bar (automatic if canvasMode !== 'VIEW')
[ ] 14. pushHistory() called before any data mutation
[ ] 15. Both stores updated: dispatch() for AppContext + setDataTable() for Zustand
[ ] 16. One-shot tools call setCanvasMode('VIEW') after completing action
[ ] 17. Escape key exits the tool (already handled: Escape → setCanvasMode('VIEW'))
[ ] 18. Tested: clicking UI buttons does NOT trigger tool (onPointerMissed tagName guard)
[ ] 19. Tested: fast drag outside canvas doesn't break (pointer capture)
[ ] 20. Tested: switching between ortho/perspective doesn't break tool
```

---

### A.8 Quick Reference: File → Feature Mapping

| Feature | Primary File(s) to Modify/Create |
|---------|----------------------------------|
| New click tool | MOD: `CanvasTab.jsx` (add layer), `useStore.js` (add mode), `ToolbarRibbon.jsx` (add button) |
| New drag tool | Same as above + MOD: `ControlsAutoCenter` exclusion list in `CanvasTab.jsx` |
| Draw Canvas | NEW: `draw_canvas/` dir with own store, canvas, tools. Wire button in `ToolbarRibbon.jsx` |
| View Cube | NEW: HTML overlay component in `CanvasTab.jsx`, using `canvas-set-view` CustomEvent |
| Ribbon upgrade | MOD: `ToolbarRibbon.jsx` (restructure into tabs/groups) |
| Selection outline | MOD: `CanvasTab.jsx` (add `@react-three/postprocessing` `<Outline>`) |
| Component labels | Already exists: `EPLabelsLayer` in `CanvasTab.jsx:1656`. Enhance if needed. |
| Color legend | Already exists: `LegendLayer` in `CanvasTab.jsx:917`. Enhance if needed. |
| Hover tooltip | Already exists: `HoverTooltip` in `CanvasTab.jsx:1841`. Enhance if needed. |
| Context menu | Already exists: `ContextMenu` in `CanvasTab.jsx:1790`. Enhance if needed. |
| Undo/Redo | Already exists: `pushHistory`/`undo` in `useStore.js:43-74`. Add redo if needed. |
| Gap radar | Already exists: `GapRadarLayer` in `CanvasTab.jsx:1555`. Enhance if needed. |
| Clipping plane | Already exists: `ClippingPlanesLayer.jsx`. Enhance if needed. |
| Settings modal | Already exists: `SettingsModal.jsx`. Add new settings here. |
| Keyboard shortcuts | Already exists: `CanvasTab.jsx:2173-2266`. Add new keys there. |
| Session persistence | Already exists: `CanvasTab.jsx:2024-2055`. Follow pattern. |

---

*End of Document — PCFImprovements_Rev2.md*
