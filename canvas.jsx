import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Crosshair,
  LocateFixed,
  Maximize2,
  MousePointer2,
  PencilLine,
  Plus,
  RefreshCcw,
  Route,
  ShieldPlus,
  Trash2,
  ZoomIn,
  ZoomOut,
  ScanSearch,
  Focus,
  Move,
  Grid3X3,
  Ruler,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const DEFAULT_ROUTE = [
  [0, 0],
  [0, 13000],
  [8000, 13000],
  [8000, 6000],
  [2000, 6000],
  [2000, -2000],
  [11000, -2000],
  [11000, 9000],
  [16000, 9000],
];

const DEFAULT_EMITS = [
  { id: "e1", p1: [-600, 4000], p2: [800, 4000] },
  { id: "e2", p1: [700, 10000], p2: [-600, 10000] },
  { id: "e3", p1: [4000, 12400], p2: [4000, 13200] },
  { id: "e4", p1: [8600, 9500], p2: [7600, 9500] },
  { id: "e5", p1: [5000, 5400], p2: [5000, 6200] },
  { id: "e6", p1: [1400, 2000], p2: [2400, 2000] },
];

const HEADER = `ISOGEN-FILES ISOGEN.FLS
UNITS-BORE MM
UNITS-CO-ORDS MM
UNITS-WEIGHT KGS
UNITS-BOLT-DIA MM
UNITS-BOLT-LENGTH MM
PIPELINE-REFERENCE PIPLINELOOP
    PROJECT-IDENTIFIER P1
    AREA A1`;

const elbowCLR = {
  15: 38.1,
  20: 38.1,
  25: 38.1,
  32: 47.6,
  40: 57.2,
  50: 76.2,
  65: 95.3,
  80: 114.3,
  100: 152.4,
  150: 228.6,
  200: 304.8,
  250: 381.0,
  300: 457.2,
};

const modeMeta = {
  select: { label: "Select", icon: MousePointer2 },
  emit: { label: "Create emit", icon: PencilLine },
  support: { label: "Place support", icon: ShieldPlus },
  marquee: { label: "Marquee zoom", icon: ScanSearch },
  pan: { label: "Pan", icon: Move },
};

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}
function unit(v) {
  const L = Math.hypot(v[0], v[1]);
  if (L <= 1e-9) return [0, 0];
  return [v[0] / L, v[1] / L];
}
function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}
function isClose(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
function snap(v, roundToMm) {
  return roundToMm ? Math.round(v) : Number(v.toFixed(4));
}
function snapPoint(p, roundToMm) {
  return [snap(p[0], roundToMm), snap(p[1], roundToMm)];
}
function segmentIntersection(p, p2, q, q2) {
  const r = [p2[0] - p[0], p2[1] - p[1]];
  const s = [q2[0] - q[0], q2[1] - q[1]];
  const rxs = cross(r, s);
  const qp = [q[0] - p[0], q[1] - p[1]];
  const qpxr = cross(qp, r);
  if (Math.abs(rxs) < 1e-9 && Math.abs(qpxr) < 1e-9) return null;
  if (Math.abs(rxs) < 1e-9) return null;
  const t = cross(qp, s) / rxs;
  const u = cross(qp, r) / rxs;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: [p[0] + t * r[0], p[1] + t * r[1]], t, u };
}
function isVertical(pipe) {
  return isClose(pipe.start[0], pipe.end[0]) && !isClose(pipe.start[1], pipe.end[1]);
}
function isHorizontal(pipe) {
  return isClose(pipe.start[1], pipe.end[1]) && !isClose(pipe.start[0], pipe.end[0]);
}
function pointOnPipeInterior(pipe, pt) {
  const [x, y] = pt;
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  if (isVertical(pipe)) return isClose(x, x1) && y > Math.min(y1, y2) + 1e-6 && y < Math.max(y1, y2) - 1e-6;
  if (isHorizontal(pipe)) return isClose(y, y1) && x > Math.min(x1, x2) + 1e-6 && x < Math.max(x1, x2) - 1e-6;
  return false;
}
function pipeParam(pipe, pt) {
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  const [x, y] = pt;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) return Math.abs(x2 - x1) < 1e-9 ? 0 : (x - x1) / (x2 - x1);
  return Math.abs(y2 - y1) < 1e-9 ? 0 : (y - y1) / (y2 - y1);
}
function splitPipe(pipe, cutPoints) {
  if (!cutPoints.length) return [pipe];
  const pts = [pipe.start, ...cutPoints, pipe.end].sort((a, b) => pipeParam(pipe, a) - pipeParam(pipe, b));
  const unique = [];
  for (const p of pts) if (!unique.length || dist(unique[unique.length - 1], p) > 1e-6) unique.push(p);
  const out = [];
  for (let i = 0; i < unique.length - 1; i++) if (dist(unique[i], unique[i + 1]) > 1e-6) out.push({ kind: "PIPE", start: unique[i], end: unique[i + 1], source: pipe.source });
  return out;
}
function buildBaseElements(route, bore, skey = "BEBW") {
  const radius = elbowCLR[bore] ?? 381;
  const elems = [];
  let current = route[0];
  for (let i = 1; i < route.length - 1; i++) {
    const prev = route[i - 1];
    const corner = route[i];
    const next = route[i + 1];
    const din = unit(sub(corner, prev));
    const dout = unit(sub(next, corner));
    const turn = cross(din, dout);
    const lenUp = dist(prev, corner);
    const lenDn = dist(corner, next);
    if (Math.abs(Math.abs(turn) - 1) > 1e-6 || lenUp < radius || lenDn < radius) {
      if (dist(current, corner) > 1e-6) elems.push({ kind: "PIPE", start: current, end: corner, source: `S${i}` });
      current = corner;
      continue;
    }
    const ep1 = [corner[0] - din[0] * radius, corner[1] - din[1] * radius];
    const ep2 = [corner[0] + dout[0] * radius, corner[1] + dout[1] * radius];
    if (dist(current, ep1) > 1e-6) elems.push({ kind: "PIPE", start: current, end: ep1, source: `S${i}` });
    elems.push({ kind: "BEND", ep1, ep2, cp: corner, radius, angle_deg: 90, skey });
    current = ep2;
  }
  if (dist(current, route[route.length - 1]) > 1e-6) elems.push({ kind: "PIPE", start: current, end: route[route.length - 1], source: `S${route.length - 1}` });
  return elems;
}
function computeEmitHits(emits, baseElements) {
  return emits.map((emit) => {
    let best = null;
    baseElements.forEach((elem, idx) => {
      if (elem.kind !== "PIPE") return;
      const hit = segmentIntersection(emit.p1, emit.p2, elem.start, elem.end);
      if (!hit || !pointOnPipeInterior(elem, hit.point)) return;
      if (!best || hit.t < best.t) best = { emitId: emit.id, pipeIndex: idx, pipeSource: elem.source, hitPoint: hit.point, t: hit.t };
    });
    return best;
  });
}
function applyEmitCuts(baseElements, emitHits) {
  const cutsByPipe = new Map();
  emitHits.forEach((hit) => {
    if (!hit) return;
    if (!cutsByPipe.has(hit.pipeIndex)) cutsByPipe.set(hit.pipeIndex, []);
    cutsByPipe.get(hit.pipeIndex).push(hit.hitPoint);
  });
  const out = [];
  baseElements.forEach((elem, idx) => {
    if (elem.kind === "BEND") out.push(elem);
    else out.push(...splitPipe(elem, cutsByPipe.get(idx) || []));
  });
  return out;
}
function buildAutoSupports(emitHits, supportName, supportGuidPrefix = "UCI:PS") {
  return emitHits.filter(Boolean).map((hit, idx) => ({
    id: `auto-${hit.emitId}`,
    refNo: `${hit.pipeSource}/${supportName}${String(idx + 1).padStart(3, "0")}`,
    point: hit.hitPoint,
    name: supportName,
    guid: `${supportGuidPrefix}${String(idx + 1).padStart(5, "0")}.1`,
    source: "emit",
    emitId: hit.emitId,
  }));
}
function mergeSupports(autoSupports, manualSupports) {
  return [...autoSupports, ...manualSupports];
}
function nearestPointOnPipe(pt, pipe) {
  const [x, y] = pt;
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  if (isVertical(pipe)) return [x1, Math.max(Math.min(y, Math.max(y1, y2)), Math.min(y1, y2))];
  if (isHorizontal(pipe)) return [Math.max(Math.min(x, Math.max(x1, x2)), Math.min(x1, x2)), y1];
  return pipe.start;
}
function findPipeSnap(worldPoint, baseElements, toleranceWorld) {
  let best = null;
  baseElements.forEach((elem, idx) => {
    if (elem.kind !== "PIPE") return;
    const point = nearestPointOnPipe(worldPoint, elem);
    const d = dist(worldPoint, point);
    if (d <= toleranceWorld && (!best || d < best.distance)) best = { point, distance: d, pipeIndex: idx, pipeSource: elem.source };
  });
  return best;
}
function formatPipeEndpoint(p, bore, roundToMm) {
  const sp = snapPoint(p, roundToMm);
  return `    END-POINT  ${sp[0].toFixed(4)} ${sp[1].toFixed(4)} 0.0000 ${bore.toFixed(4)}`;
}
function emitPCF(elements, supports, bore, header, roundToMm) {
  const lines = [header];
  let ref = 1;
  let seq = 1;
  elements.forEach((elem) => {
    if (elem.kind === "PIPE") {
      const a = snapPoint(elem.start, roundToMm);
      const b = snapPoint(elem.end, roundToMm);
      lines.push("", "MESSAGE-SQUARE", `    PIPE, RefNo:=COORD_${ref}, SeqNo:${seq}, Length:${dist(a, b).toFixed(2)}MM`, "PIPE", formatPipeEndpoint(a, bore, roundToMm), formatPipeEndpoint(b, bore, roundToMm));
    } else {
      const ep1 = snapPoint(elem.ep1, roundToMm);
      const ep2 = snapPoint(elem.ep2, roundToMm);
      const cp = snapPoint(elem.cp, roundToMm);
      lines.push("", "MESSAGE-SQUARE", `    BEND, RefNo:=COORD_${ref}, SeqNo:${seq}`, "BEND", formatPipeEndpoint(ep1, bore, roundToMm), formatPipeEndpoint(ep2, bore, roundToMm), `    CENTRE-POINT  ${cp[0].toFixed(4)} ${cp[1].toFixed(4)} 0.0000`, `    <SKEY>  ${elem.skey}`, `    ANGLE ${elem.angle_deg.toFixed(4)}`, `    BEND-RADIUS ${elem.radius.toFixed(4)}`);
    }
    ref += 1;
    seq += 1;
  });
  supports.forEach((support) => {
    const pt = snapPoint(support.point, roundToMm);
    lines.push("", "MESSAGE-SQUARE", `    SUPPORT, RefNo:=${support.refNo}, SeqNo:${seq}, ${support.name}, ${support.guid}`, "SUPPORT", `    CO-ORDS    ${pt[0].toFixed(4)} ${pt[1].toFixed(4)} 0.0000 0.0000`, `    <SUPPORT_NAME>    ${support.name}`, `    <SUPPORT_GUID>    ${support.guid}`);
    seq += 1;
  });
  return lines.join("\n");
}
function boundsFromPoints(points) {
  if (!points.length) return null;
  let minX = points[0][0], maxX = points[0][0], minY = points[0][1], maxY = points[0][1];
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
function expandBounds(b, pad = 0) {
  if (!b) return null;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad, width: b.width + pad * 2, height: b.height + pad * 2 };
}
function combineBounds(boundsList) {
  const valid = boundsList.filter(Boolean);
  if (!valid.length) return null;
  let minX = valid[0].minX, minY = valid[0].minY, maxX = valid[0].maxX, maxY = valid[0].maxY;
  valid.forEach((b) => { minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); });
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
function getElementPoints(elem) {
  if (elem.kind === "PIPE") return [elem.start, elem.end];
  return [elem.ep1, elem.ep2, elem.cp];
}
function getEmitBounds(emit, hit) {
  return boundsFromPoints([emit.p1, emit.p2, ...(hit ? [hit.hitPoint] : [])]);
}
function pointToSegmentDistance(pt, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [pt[0] - a[0], pt[1] - a[1]];
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (ab2 <= 1e-9) return dist(pt, a);
  let t = (ap[0] * ab[0] + ap[1] * ab[1]) / ab2;
  t = Math.max(0, Math.min(1, t));
  const proj = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return dist(pt, proj);
}
function pointNearEmit(pt, emit, toleranceWorld) { return pointToSegmentDistance(pt, emit.p1, emit.p2) <= toleranceWorld; }
function pointNearPipe(pt, pipe, toleranceWorld) { return pointToSegmentDistance(pt, pipe.start, pipe.end) <= toleranceWorld; }
function pointNearBend(pt, bend, toleranceWorld) { return dist(pt, bend.cp) <= toleranceWorld * 1.3 || pointToSegmentDistance(pt, bend.ep1, bend.cp) <= toleranceWorld || pointToSegmentDistance(pt, bend.cp, bend.ep2) <= toleranceWorld; }
function pointNearSupport(pt, support, toleranceWorld) { return dist(pt, support.point) <= toleranceWorld; }
function inferHoverId(worldPoint, emits, finalElements, supports, toleranceWorld) {
  for (let i = supports.length - 1; i >= 0; i--) if (pointNearSupport(worldPoint, supports[i], toleranceWorld)) return `support:${supports[i].id}`;
  for (let i = emits.length - 1; i >= 0; i--) if (pointNearEmit(worldPoint, emits[i], toleranceWorld)) return `emit:${emits[i].id}`;
  for (let i = finalElements.length - 1; i >= 0; i--) {
    const elem = finalElements[i];
    if (elem.kind === "PIPE" && pointNearPipe(worldPoint, elem, toleranceWorld)) return `pipe:${i}`;
    if (elem.kind === "BEND" && pointNearBend(worldPoint, elem, toleranceWorld)) return `bend:${i}`;
  }
  return null;
}
function drawSupportCross(point, worldToScreen, selected, hovered, color = "#16a34a") {
  const c = worldToScreen(point);
  const size = selected ? 9 : hovered ? 8 : 7;
  const width = selected ? 3.2 : hovered ? 2.8 : 2.4;
  return <g><line x1={c.x - size} y1={c.y} x2={c.x + size} y2={c.y} stroke={color} strokeWidth={width} strokeLinecap="round" /><line x1={c.x} y1={c.y - size} x2={c.x} y2={c.y + size} stroke={color} strokeWidth={width} strokeLinecap="round" /></g>;
}

export default function PcfGeneratorUI({
  externalRoute  = null,    // [x,y][] — overrides internal route table when provided
  externalEmits  = null,    // {id,p1,p2}[] — overrides internal emits when provided
  previewPoints  = [],      // [x,y][] — drawn as cyan circles (pending support coords)
  onEmitsChange  = null,    // callback({id,p1,p2}[]) fired when user adds/removes emits
} = {}) {
  const initRoute = externalRoute
    ? externalRoute.map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) }))
    : DEFAULT_ROUTE.map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) }));

  const [routeRows, setRouteRows] = useState(initRoute);
  const [boreText, setBoreText] = useState("250");
  const [headerText, setHeaderText] = useState(HEADER);
  const [roundToMm, setRoundToMm] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [mode, setMode] = useState("select");
  const [emits, setEmits] = useState(externalEmits ?? DEFAULT_EMITS);
  const [manualSupports, setManualSupports] = useState([]);
  const [supportName, setSupportName] = useState("CA150");
  const [supportGuidPrefix, setSupportGuidPrefix] = useState("UCI:PS");
  const [selectedIds, setSelectedIds] = useState([]);
  const [hoveredId, setHoveredId] = useState(null);
  const [draftEmit, setDraftEmit] = useState(null);
  const [snapTarget, setSnapTarget] = useState(null);
  const [marqueeRect, setMarqueeRect] = useState(null);
  const [statusText, setStatusText] = useState("Ready");
  const [viewport, setViewport] = useState({ scale: 0.08, tx: 120, ty: 380 });
  const [copied, setCopied] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 680 });
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const panRef = useRef(null);
  const bore = Number(boreText) || 250;

  // Sync routeRows when externalRoute prop changes (re-mount scenario)
  useEffect(() => {
    if (externalRoute && externalRoute.length >= 2) {
      setRouteRows(externalRoute.map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) })));
    }
  }, [externalRoute]);

  // Track last value pushed from external so we don't echo it back via onEmitsChange
  const lastExternalEmitsRef = useRef(externalEmits);
  const emitCallbackMountedRef = useRef(false);

  // Sync emits when externalEmits prop changes
  useEffect(() => {
    if (externalEmits) {
      lastExternalEmitsRef.current = externalEmits;
      setEmits(externalEmits);
    }
  }, [externalEmits]);

  // Fire onEmitsChange only for user-originated changes (not initial mount or prop sync)
  useEffect(() => {
    if (!emitCallbackMountedRef.current) { emitCallbackMountedRef.current = true; return; }
    if (onEmitsChange && emits !== lastExternalEmitsRef.current) {
      onEmitsChange(emits);
    }
  }, [emits]);

  const routeParse = useMemo(() => {
    try {
      const points = routeRows.map((row) => [Number(row.x), Number(row.y)]);
      if (points.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1]))) throw new Error("Route table contains invalid numeric values");
      if (points.length < 2) throw new Error("Need at least two route vertices");
      return { ok: true, points, error: "" };
    } catch (err) {
      return { ok: false, points: DEFAULT_ROUTE, error: err.message || "Invalid route table" };
    }
  }, [routeRows]);

  const baseElements = useMemo(() => buildBaseElements(routeParse.points, bore), [routeParse.points, bore]);
  const emitHits = useMemo(() => computeEmitHits(emits, baseElements), [emits, baseElements]);
  const finalElements = useMemo(() => applyEmitCuts(baseElements, emitHits), [baseElements, emitHits]);
  const autoSupports = useMemo(() => buildAutoSupports(emitHits, supportName, supportGuidPrefix), [emitHits, supportName, supportGuidPrefix]);
  const allSupports = useMemo(() => mergeSupports(autoSupports, manualSupports), [autoSupports, manualSupports]);
  const pcfText = useMemo(() => emitPCF(finalElements, allSupports, bore, headerText, roundToMm), [finalElements, allSupports, bore, headerText, roundToMm]);

  const sceneBounds = useMemo(() => {
    const baseBounds = boundsFromPoints(baseElements.flatMap(getElementPoints));
    const emitBounds = combineBounds(emits.map((emit, i) => getEmitBounds(emit, emitHits[i])));
    const supportBounds = boundsFromPoints(allSupports.map((s) => s.point));
    return expandBounds(combineBounds([baseBounds, emitBounds, supportBounds]), 600);
  }, [baseElements, emits, emitHits, allSupports]);

  const selectedBounds = useMemo(() => {
    if (!selectedIds.length) return null;
    const bounds = [];
    selectedIds.forEach((id) => {
      if (id.startsWith("emit:")) {
        const emitId = id.split(":")[1];
        const index = emits.findIndex((e) => e.id === emitId);
        if (index >= 0) bounds.push(getEmitBounds(emits[index], emitHits[index]));
      }
      if (id.startsWith("pipe:") || id.startsWith("bend:")) {
        const index = Number(id.split(":")[1]);
        const elem = finalElements[index];
        if (elem) bounds.push(boundsFromPoints(getElementPoints(elem)));
      }
      if (id.startsWith("support:")) {
        const supportId = id.split(":")[1];
        const support = allSupports.find((s) => s.id === supportId);
        if (support) bounds.push(boundsFromPoints([support.point]));
      }
    });
    return combineBounds(bounds);
  }, [selectedIds, emits, emitHits, finalElements, allSupports]);

  const worldToScreen = useCallback((p) => ({ x: p[0] * viewport.scale + viewport.tx, y: -p[1] * viewport.scale + viewport.ty }), [viewport]);
  const screenToWorld = useCallback((sx, sy) => [(sx - viewport.tx) / viewport.scale, -(sy - viewport.ty) / viewport.scale], [viewport]);

  const fitToBounds = useCallback((b) => {
    if (!b || !canvasSize.width || !canvasSize.height) return;
    const pad = 52;
    const sx = (canvasSize.width - pad * 2) / b.width;
    const sy = (canvasSize.height - pad * 2) / b.height;
    const scale = Math.max(0.001, Math.min(sx, sy));
    const tx = (canvasSize.width - b.width * scale) / 2 - b.minX * scale;
    const ty = (canvasSize.height - b.height * scale) / 2 + b.maxY * scale;
    setViewport({ scale, tx, ty });
  }, [canvasSize]);
  const centerOnBounds = useCallback((b) => {
    if (!b || !canvasSize.width || !canvasSize.height) return;
    const cx = (b.minX + b.maxX) / 2; const cy = (b.minY + b.maxY) / 2;
    setViewport((v) => ({ ...v, tx: canvasSize.width / 2 - cx * v.scale, ty: canvasSize.height / 2 + cy * v.scale }));
  }, [canvasSize]);
  const zoomBy = useCallback((factor, pivot = [canvasSize.width / 2, canvasSize.height / 2]) => {
    const world = screenToWorld(pivot[0], pivot[1]);
    setViewport((v) => {
      const nextScale = Math.max(0.005, Math.min(10, v.scale * factor));
      return { scale: nextScale, tx: pivot[0] - world[0] * nextScale, ty: pivot[1] + world[1] * nextScale };
    });
  }, [canvasSize, screenToWorld]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (sceneBounds) fitToBounds(sceneBounds);
  }, [fitToBounds, sceneBounds]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const emitIds = new Set(selectedIds.filter((id) => id.startsWith("emit:")).map((id) => id.split(":")[1]));
        const supportIds = new Set(selectedIds.filter((id) => id.startsWith("support:")).map((id) => id.split(":")[1]));
        if (emitIds.size || supportIds.size) {
          e.preventDefault();
          if (emitIds.size) setEmits((prev) => prev.filter((emit) => !emitIds.has(emit.id)));
          if (supportIds.size) setManualSupports((prev) => prev.filter((support) => !supportIds.has(support.id)));
          setSelectedIds((prev) => prev.filter((id) => !id.startsWith("emit:") && !id.startsWith("support:")));
        }
      }
      if (e.key.toLowerCase() === "f") fitToBounds(sceneBounds);
      if (e.key.toLowerCase() === "z" && selectedBounds) fitToBounds(expandBounds(selectedBounds, 200));
      if (e.key.toLowerCase() === "c" && selectedBounds) centerOnBounds(selectedBounds);
      if (e.key === "Escape") {
        setDraftEmit(null); setMarqueeRect(null); setMode("select");
      }
      if (e.key === "+" || e.key === "=") zoomBy(1.15);
      if (e.key === "-") zoomBy(0.85);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, selectedBounds, centerOnBounds, fitToBounds, sceneBounds, zoomBy]);

  const handleSelect = useCallback((id, additive) => {
    setSelectedIds((prev) => additive ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]);
  }, []);
  const deleteSelectedEmits = useCallback(() => {
    const emitIds = new Set(selectedIds.filter((id) => id.startsWith("emit:")).map((id) => id.split(":")[1]));
    if (!emitIds.size) return;
    setEmits((prev) => prev.filter((emit) => !emitIds.has(emit.id)));
    setSelectedIds((prev) => prev.filter((id) => !id.startsWith("emit:")));
  }, [selectedIds]);
  const deleteSelectedSupports = useCallback(() => {
    const supportIds = new Set(selectedIds.filter((id) => id.startsWith("support:")).map((id) => id.split(":")[1]));
    if (!supportIds.size) return;
    setManualSupports((prev) => prev.filter((support) => !supportIds.has(support.id)));
    setSelectedIds((prev) => prev.filter((id) => !id.startsWith("support:")));
  }, [selectedIds]);
  const copyPcf = async () => {
    await navigator.clipboard.writeText(pcfText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const updateHover = (clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(clientX - rect.left, clientY - rect.top);
    const toleranceWorld = 12 / viewport.scale;
    setHoveredId(inferHoverId(world, emits, finalElements, allSupports, toleranceWorld));
    if (mode === "emit" || mode === "support") setSnapTarget(findPipeSnap(world, baseElements, toleranceWorld));
    else setSnapTarget(null);
    setStatusText(`X ${world[0].toFixed(1)}  Y ${world[1].toFixed(1)}  Scale ${viewport.scale.toFixed(4)}`);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.1 : 0.9, [e.clientX - rect.left, e.clientY - rect.top]);
  };

  const onPointerDown = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    if (mode === "support") {
      const snap = snapTarget || findPipeSnap(world, baseElements, 12 / viewport.scale);
      if (snap) {
        const nextIndex = manualSupports.length + 1;
        setManualSupports((prev) => [...prev, { id: `ms-${Date.now()}`, refNo: `MANUAL/${supportName}${String(nextIndex).padStart(3, "0")}`, point: snap.point, name: supportName, guid: `${supportGuidPrefix}M${String(nextIndex).padStart(5, "0")}.1`, source: "manual" }]);
      }
      return;
    }
    if (mode === "emit") {
      setDraftEmit({ p1: world, p2: world });
      return;
    }
    if (mode === "marquee") {
      setMarqueeRect({ x1: sx, y1: sy, x2: sx, y2: sy });
      return;
    }
    if (e.target === svgRef.current) {
      if (!e.shiftKey && !e.metaKey) setSelectedIds([]);
      panRef.current = { sx: e.clientX, sy: e.clientY, tx: viewport.tx, ty: viewport.ty };
    }
  };

  const onPointerMove = (e) => {
    updateHover(e.clientX, e.clientY);
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    if (draftEmit) { setDraftEmit((prev) => ({ ...prev, p2: world })); return; }
    if (marqueeRect) { setMarqueeRect((prev) => ({ ...prev, x2: sx, y2: sy })); return; }
    if (panRef.current && (mode === "select" || mode === "pan")) {
      const dx = e.clientX - panRef.current.sx;
      const dy = e.clientY - panRef.current.sy;
      setViewport((v) => ({ ...v, tx: panRef.current.tx + dx, ty: panRef.current.ty + dy }));
    }
  };

  const onPointerUp = () => {
    if (draftEmit) {
      if (dist(draftEmit.p1, draftEmit.p2) > 10 / viewport.scale) setEmits((prev) => [...prev, { id: `e${Date.now()}`, p1: draftEmit.p1, p2: draftEmit.p2 }]);
      setDraftEmit(null); return;
    }
    if (marqueeRect) {
      const minX = Math.min(marqueeRect.x1, marqueeRect.x2);
      const minY = Math.min(marqueeRect.y1, marqueeRect.y2);
      const maxX = Math.max(marqueeRect.x1, marqueeRect.x2);
      const maxY = Math.max(marqueeRect.y1, marqueeRect.y2);
      if (maxX - minX > 12 && maxY - minY > 12) {
        const w1 = screenToWorld(minX, maxY);
        const w2 = screenToWorld(maxX, minY);
        fitToBounds({ minX: w1[0], minY: w1[1], maxX: w2[0], maxY: w2[1], width: Math.max(1, w2[0] - w1[0]), height: Math.max(1, w2[1] - w1[1]) });
      }
      setMarqueeRect(null);
      if (mode === "marquee") setMode("select");
      return;
    }
    panRef.current = null;
  };

  const resetDemo = () => {
    setRouteRows(DEFAULT_ROUTE.map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) })));
    setBoreText("250");
    setEmits(DEFAULT_EMITS);
    setManualSupports([]);
    setSupportName("CA150");
    setSupportGuidPrefix("UCI:PS");
    setSelectedIds([]);
    setHoveredId(null);
    setMode("select");
  };
  const addRouteRow = () => {
    const last = routeRows[routeRows.length - 1] || { x: "0", y: "0" };
    setRouteRows((prev) => [...prev, { id: `r${Date.now()}`, x: last.x, y: last.y }]);
  };
  const removeRouteRow = (id) => setRouteRows((prev) => (prev.length <= 2 ? prev : prev.filter((row) => row.id !== id)));
  const updateRouteRow = (id, key, value) => setRouteRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)));

  const gridLines = useMemo(() => {
    if (!sceneBounds || !showGrid) return [];
    const step = sceneBounds.width > 30000 ? 2000 : sceneBounds.width > 10000 ? 1000 : 500;
    const lines = [];
    const minX = Math.floor(sceneBounds.minX / step) * step;
    const maxX = Math.ceil(sceneBounds.maxX / step) * step;
    const minY = Math.floor(sceneBounds.minY / step) * step;
    const maxY = Math.ceil(sceneBounds.maxY / step) * step;
    for (let x = minX; x <= maxX; x += step) lines.push({ kind: "v", value: x });
    for (let y = minY; y <= maxY; y += step) lines.push({ kind: "h", value: y });
    return lines;
  }, [sceneBounds, showGrid]);

  const selectedEmitCount = selectedIds.filter((id) => id.startsWith("emit:")).length;
  const selectedSupportCount = selectedIds.filter((id) => id.startsWith("support:")).length;
  const cursorClass = mode === "emit" || mode === "support" || mode === "marquee" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing";
  const marqueeStyle = marqueeRect ? { x: Math.min(marqueeRect.x1, marqueeRect.x2), y: Math.min(marqueeRect.y1, marqueeRect.y2), width: Math.abs(marqueeRect.x2 - marqueeRect.x1), height: Math.abs(marqueeRect.y2 - marqueeRect.y1) } : null;

  return (
    <div className="h-full overflow-auto bg-slate-100/70 p-4 md:p-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border bg-white px-5 py-4 shadow-sm">
          <div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">Professional Pipe Canvas Workspace</div>
            <div className="text-sm text-slate-500">Toolbar, zoom to selection, marquee zoom, object snap, live emit/support workflow, and dynamic PCF.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(modeMeta).map(([key, meta]) => {
              const Icon = meta.icon;
              return <Button key={key} variant={mode === key ? "default" : "outline"} className="rounded-2xl" onClick={() => setMode(key)}><Icon className="mr-2 h-4 w-4" /> {meta.label}</Button>;
            })}
            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <Button variant="outline" className="rounded-2xl" onClick={() => fitToBounds(sceneBounds)}><Maximize2 className="mr-2 h-4 w-4" /> Fit</Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => selectedBounds && fitToBounds(expandBounds(selectedBounds, 200))} disabled={!selectedBounds}><Focus className="mr-2 h-4 w-4" /> Zoom selection</Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => centerOnBounds(selectedBounds || sceneBounds)}><LocateFixed className="mr-2 h-4 w-4" /> Center</Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => zoomBy(1.15)}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => zoomBy(0.85)}><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => setShowGrid((v) => !v)}><Grid3X3 className="mr-2 h-4 w-4" /> {showGrid ? "Hide grid" : "Show grid"}</Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => setShowDimensions((v) => !v)}><Ruler className="mr-2 h-4 w-4" /> {showDimensions ? "Hide dims" : "Show dims"}</Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
          <Card className="overflow-hidden rounded-3xl border-0 shadow-xl shadow-slate-200/70">
            <CardContent className="p-0">
              <div ref={wrapRef} className="relative h-[76vh] min-h-[620px] bg-white">
                <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2 rounded-2xl border bg-white/90 p-2 shadow-sm backdrop-blur">
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={resetDemo}><RefreshCcw className="mr-2 h-4 w-4" /> Reset</Button>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setMode("marquee")}><ScanSearch className="mr-2 h-4 w-4" /> Marquee zoom</Button>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setMode("pan")}><Move className="mr-2 h-4 w-4" /> Pan</Button>
                </div>
                <div className="absolute right-4 top-4 z-20 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1.5">Mode: {modeMeta[mode].label}</Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1.5">Emits: {emits.length}</Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1.5">Supports: {allSupports.length}</Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1.5">Selected: {selectedIds.length}</Badge>
                </div>

                <svg ref={svgRef} className={`h-full w-full ${cursorClass}`} onWheel={onWheel} onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={() => { onPointerUp(); setHoveredId(null); setSnapTarget(null); }}>
                  <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="#ffffff" />
                  <g>
                    {gridLines.map((g, idx) => {
                      if (g.kind === "v") {
                        const p1 = worldToScreen([g.value, sceneBounds.minY]);
                        const p2 = worldToScreen([g.value, sceneBounds.maxY]);
                        return <line key={`gv-${idx}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#eef2f7" strokeWidth="1" />;
                      }
                      const p1 = worldToScreen([sceneBounds.minX, g.value]);
                      const p2 = worldToScreen([sceneBounds.maxX, g.value]);
                      return <line key={`gh-${idx}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#eef2f7" strokeWidth="1" />;
                    })}
                  </g>

                  <g>
                    {finalElements.map((elem, idx) => {
                      const selected = selectedIds.includes(`${elem.kind === "PIPE" ? "pipe" : "bend"}:${idx}`);
                      const hovered = hoveredId === `${elem.kind === "PIPE" ? "pipe" : "bend"}:${idx}`;
                      if (elem.kind === "PIPE") {
                        const a = worldToScreen(elem.start); const b = worldToScreen(elem.end);
                        const mid = worldToScreen([(elem.start[0] + elem.end[0]) / 2, (elem.start[1] + elem.end[1]) / 2]);
                        return (
                          <g key={`pipe-${idx}`}>
                            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? "#0f172a" : hovered ? "#1d4ed8" : "#2563eb"} strokeWidth={selected ? 8 : hovered ? 7 : 5} strokeLinecap="round" onMouseDown={(e) => { e.stopPropagation(); handleSelect(`pipe:${idx}`, e.shiftKey || e.metaKey); }} />
                            {showDimensions && <text x={mid.x + 8} y={mid.y - 8} className="fill-slate-500 text-[11px]">{dist(elem.start, elem.end).toFixed(0)}</text>}
                          </g>
                        );
                      }
                      const p1 = worldToScreen(elem.ep1); const p2 = worldToScreen(elem.ep2); const cp = worldToScreen(elem.cp);
                      return <g key={`bend-${idx}`} onMouseDown={(e) => { e.stopPropagation(); handleSelect(`bend:${idx}`, e.shiftKey || e.metaKey); }}><path d={`M ${p1.x} ${p1.y} Q ${cp.x} ${cp.y} ${p2.x} ${p2.y}`} fill="none" stroke={selected ? "#9a3412" : hovered ? "#ea580c" : "#f97316"} strokeWidth={selected ? 7 : hovered ? 6 : 4} strokeLinecap="round" /><circle cx={cp.x} cy={cp.y} r={selected ? 5.5 : hovered ? 5 : 3.5} fill={selected ? "#9a3412" : hovered ? "#ea580c" : "#fb923c"} /></g>;
                    })}
                  </g>

                  <g>
                    {emits.map((emit, idx) => {
                      const a = worldToScreen(emit.p1); const b = worldToScreen(emit.p2); const hit = emitHits[idx];
                      const selected = selectedIds.includes(`emit:${emit.id}`); const hovered = hoveredId === `emit:${emit.id}`;
                      const stroke = hit ? (selected ? "#166534" : hovered ? "#15803d" : "#16a34a") : (selected ? "#991b1b" : hovered ? "#dc2626" : "#ef4444");
                      return <g key={emit.id} onMouseDown={(e) => { e.stopPropagation(); handleSelect(`emit:${emit.id}`, e.shiftKey || e.metaKey); }}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={selected ? 5 : hovered ? 4 : 3} strokeDasharray={hit ? "10 6" : "7 5"} strokeLinecap="round" /><circle cx={a.x} cy={a.y} r={selected ? 5.5 : hovered ? 5 : 4} fill={stroke} /><circle cx={b.x} cy={b.y} r={selected ? 5.5 : hovered ? 5 : 4} fill={stroke} />{hit && (() => { const hp = worldToScreen(hit.hitPoint); return <circle cx={hp.x} cy={hp.y} r={selected ? 7 : hovered ? 6 : 5} fill="#f59e0b" stroke="#fff" strokeWidth="2" />; })()}</g>;
                    })}
                    {draftEmit && (() => { const a = worldToScreen(draftEmit.p1); const b = worldToScreen(draftEmit.p2); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth={3} strokeDasharray="8 6" />; })()}
                  </g>

                  <g>
                    {allSupports.map((support) => {
                      const selected = selectedIds.includes(`support:${support.id}`); const hovered = hoveredId === `support:${support.id}`;
                      return <g key={support.id} onMouseDown={(e) => { e.stopPropagation(); handleSelect(`support:${support.id}`, e.shiftKey || e.metaKey); }}>{drawSupportCross(support.point, worldToScreen, selected, hovered, support.source === "emit" ? "#16a34a" : "#22c55e")}</g>;
                    })}
                  </g>

                  {snapTarget && (mode === "emit" || mode === "support") && (() => { const s = worldToScreen(snapTarget.point); return <g pointerEvents="none"><circle cx={s.x} cy={s.y} r={8} fill="none" stroke="#06b6d4" strokeWidth="2" /><line x1={s.x - 12} y1={s.y} x2={s.x + 12} y2={s.y} stroke="#06b6d4" strokeWidth="1.6" /><line x1={s.x} y1={s.y - 12} x2={s.x} y2={s.y + 12} stroke="#06b6d4" strokeWidth="1.6" /></g>; })()}
                  {marqueeStyle && <rect x={marqueeStyle.x} y={marqueeStyle.y} width={marqueeStyle.width} height={marqueeStyle.height} fill="rgba(59,130,246,0.10)" stroke="#3b82f6" strokeDasharray="6 4" />}

                  {/* Preview support-coordinate points (cyan, not yet applied) */}
                  <g pointerEvents="none">
                    {previewPoints.map((pt, i) => {
                      const s = worldToScreen(pt);
                      return (
                        <g key={`prev-${i}`}>
                          <circle cx={s.x} cy={s.y} r={7} fill="#06b6d4" opacity={0.85} />
                          <circle cx={s.x} cy={s.y} r={10} fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity={0.5} />
                        </g>
                      );
                    })}
                  </g>
                </svg>

                <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-slate-950 px-4 py-2 text-xs text-slate-200">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <span className="font-medium text-white">Status</span>
                    <span className="truncate">{statusText}</span>
                    {snapTarget && <span className="text-cyan-300">Snap {snapTarget.point[0].toFixed(1)}, {snapTarget.point[1].toFixed(1)}</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span>F fit</span>
                    <span>Z zoom selection</span>
                    <span>C center</span>
                    <span>Del remove</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
              <CardHeader>
                <CardTitle>Project setup</CardTitle>
                <CardDescription>Table-based route editing, support defaults, and live PCF generation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2"><Label>Bore (mm)</Label><Input value={boreText} onChange={(e) => setBoreText(e.target.value)} className="rounded-2xl" /></div>
                  <div className="grid gap-2"><Label>Output rounding</Label><Button variant={roundToMm ? "default" : "outline"} className="justify-start rounded-2xl" onClick={() => setRoundToMm((v) => !v)}>{roundToMm ? "Round to whole mm" : "Keep decimal mm"}</Button></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2"><Label>Support name</Label><Input value={supportName} onChange={(e) => setSupportName(e.target.value)} className="rounded-2xl" /></div>
                  <div className="grid gap-2"><Label>Support GUID prefix</Label><Input value={supportGuidPrefix} onChange={(e) => setSupportGuidPrefix(e.target.value)} className="rounded-2xl" /></div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Route className="h-4 w-4 text-slate-500" /><Label>Route vertices</Label></div><Button size="sm" variant="outline" className="rounded-xl" onClick={addRouteRow}><Plus className="mr-2 h-4 w-4" /> Add row</Button></div>
                  <div className="overflow-hidden rounded-2xl border bg-white"><table className="w-full border-collapse text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="border-b px-3 py-2 text-left font-medium">#</th><th className="border-b px-3 py-2 text-left font-medium">X</th><th className="border-b px-3 py-2 text-left font-medium">Y</th><th className="border-b px-3 py-2 text-right font-medium">Action</th></tr></thead><tbody>{routeRows.map((row, idx) => <tr key={row.id} className="odd:bg-white even:bg-slate-50/40"><td className="border-b px-3 py-2 font-medium text-slate-500">{idx + 1}</td><td className="border-b px-3 py-2"><Input value={row.x} onChange={(e) => updateRouteRow(row.id, "x", e.target.value)} className="h-9 rounded-xl" /></td><td className="border-b px-3 py-2"><Input value={row.y} onChange={(e) => updateRouteRow(row.id, "y", e.target.value)} className="h-9 rounded-xl" /></td><td className="border-b px-3 py-2 text-right"><Button size="icon" variant="ghost" className="rounded-xl" onClick={() => removeRouteRow(row.id)}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>
                  {routeParse.ok ? <Badge className="rounded-full">Route table valid</Badge> : <Badge variant="destructive" className="rounded-full">{routeParse.error}</Badge>}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
              <CardHeader><CardTitle>Emit & support manager</CardTitle><CardDescription>Emit hits create support objects automatically. Manual supports can be placed with snap-on-hover.</CardDescription></CardHeader>
              <CardContent className="space-y-4 max-h-[420px] overflow-auto">
                <div className="space-y-3"><div className="text-sm font-medium text-slate-700">Emit lines</div>{emits.map((emit, idx) => { const hit = emitHits[idx]; const selected = selectedIds.includes(`emit:${emit.id}`); return <div key={emit.id} className={`rounded-2xl border p-3 transition ${selected ? "border-slate-900 bg-slate-50" : "bg-white hover:border-slate-300"}`}><div className="flex items-start justify-between gap-3"><div className="space-y-1 text-sm"><div className="font-medium">{emit.id}</div><div className="font-mono text-xs text-slate-600">P1 {emit.p1[0].toFixed(1)}, {emit.p1[1].toFixed(1)}</div><div className="font-mono text-xs text-slate-600">P2 {emit.p2[0].toFixed(1)}, {emit.p2[1].toFixed(1)}</div>{hit ? <div className="font-mono text-xs text-emerald-700">Cut / support at {hit.hitPoint[0].toFixed(1)}, {hit.hitPoint[1].toFixed(1)}</div> : <div className="font-mono text-xs text-rose-700">No pipe hit</div>}</div><div className="flex flex-col gap-2"><Button size="icon" variant="outline" className="rounded-xl" onClick={() => handleSelect(`emit:${emit.id}`, false)}><Crosshair className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="rounded-xl" onClick={() => setEmits((prev) => prev.filter((e) => e.id !== emit.id))}><Trash2 className="h-4 w-4" /></Button></div></div></div>; })}</div>
                <Separator />
                <div className="space-y-3"><div className="text-sm font-medium text-slate-700">Manual supports</div>{manualSupports.length === 0 ? <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">Use Place support mode, hover until snap appears, then click on the pipe.</div> : manualSupports.map((support) => { const selected = selectedIds.includes(`support:${support.id}`); return <div key={support.id} className={`rounded-2xl border p-3 transition ${selected ? "border-slate-900 bg-slate-50" : "bg-white hover:border-slate-300"}`}><div className="flex items-start justify-between gap-3"><div className="space-y-1 text-sm"><div className="font-medium">{support.id}</div><div className="font-mono text-xs text-slate-600">{support.point[0].toFixed(1)}, {support.point[1].toFixed(1)}</div><div className="text-xs text-slate-600">{support.name} / {support.guid}</div></div><div className="flex flex-col gap-2"><Button size="icon" variant="outline" className="rounded-xl" onClick={() => handleSelect(`support:${support.id}`, false)}><Crosshair className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="rounded-xl" onClick={() => setManualSupports((prev) => prev.filter((s) => s.id !== support.id))}><Trash2 className="h-4 w-4" /></Button></div></div></div>; })}</div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
              <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Final PCF</CardTitle><CardDescription>Generated dynamically from current geometry, bends, emit cuts, and support locations.</CardDescription></div><Button variant="outline" className="rounded-2xl" onClick={copyPcf}><Copy className="mr-2 h-4 w-4" /> {copied ? "Copied" : "Copy"}</Button></div></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-4"><Stat label="Pipes" value={String(finalElements.filter((e) => e.kind === "PIPE").length)} /><Stat label="Bends" value={String(finalElements.filter((e) => e.kind === "BEND").length)} /><Stat label="Emits" value={String(emitHits.filter(Boolean).length)} /><Stat label="Supports" value={String(allSupports.length)} /></div>
                <div className="grid gap-2"><Label>Header block</Label><Textarea value={headerText} onChange={(e) => setHeaderText(e.target.value)} className="min-h-[120px] rounded-2xl font-mono text-xs" /></div>
                <Separator />
                <Textarea value={pcfText} readOnly className="min-h-[320px] rounded-2xl font-mono text-xs" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-2xl border bg-slate-50 px-4 py-3"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold text-slate-900">{value}</div></div>;
}
