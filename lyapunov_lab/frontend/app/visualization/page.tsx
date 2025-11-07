"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Radio } from "lucide-react";

const WINDOW_SIZE = 1_000; // render the last 1k points only
const FACTOR = 1;

/* ------------------------
   Helpers: interpolation
-------------------------*/
function lerpVec(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  return new THREE.Vector3(
    THREE.MathUtils.lerp(a.x, b.x, t),
    THREE.MathUtils.lerp(a.y, b.y, t),
    THREE.MathUtils.lerp(a.z, b.z, t)
  );
}

/** Returns densified points and a mapping from each densified point to the nearest original index. */
function interpolateTrajectory(
  pts: THREE.Vector3[],
  method: "none" | "linear" | "catmullRom",
  segmentsPerEdge: number
): { points: THREE.Vector3[]; indexMap: number[] } {
  if (pts.length <= 1 || method === "none") {
    return { points: pts, indexMap: pts.map((_, i) => i) };
  }

  if (method === "linear") {
    const out: THREE.Vector3[] = [];
    const idxMap: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (let s = 0; s < segmentsPerEdge; s++) {
        const t = s / segmentsPerEdge;
        out.push(lerpVec(a, b, t));
        idxMap.push(i);
      }
    }
    out.push(pts[pts.length - 1]);
    idxMap.push(pts.length - 1);
    return { points: out, indexMap: idxMap };
  }

  // Catmull-Rom
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  const totalSegments = Math.max(1, (pts.length - 1) * segmentsPerEdge);
  const out = curve.getPoints(totalSegments);
  const idxMap: number[] = [];
  for (let i = 0; i <= totalSegments; i++) {
    const t = i / totalSegments;
    const approxIdx = Math.min(
      pts.length - 1,
      Math.max(0, Math.round(t * (pts.length - 1)))
    );
    idxMap.push(approxIdx);
  }
  return { points: out, indexMap: idxMap };
}

/* --- Animator inside Canvas to satisfy R3F hook rules --- */
function PlayheadAnimator({
  isPlaying,
  maxIndex,
  playHeadRef,
  currentIndex,
  onStep,
}: {
  isPlaying: boolean;
  maxIndex: number;
  playHeadRef: React.MutableRefObject<number>;
  currentIndex: number;
  onStep: (head: number) => void;
}) {
  useFrame((_, delta) => {
    if (!isPlaying || maxIndex <= 0) return;
    const speed = 120; // samples/sec
    playHeadRef.current = Math.min(
      maxIndex,
      playHeadRef.current + speed * delta
    );
    const head = Math.floor(playHeadRef.current);
    if (head !== currentIndex) onStep(head);
  });
  return null;
}

/* 3D Trajectory visualization */
function SensorTrajectory({
  data,
  onHover,
  interpMode,
  smoothness,
}: {
  data: { index: number; ch1: number; ch2: number; ch3: number }[];
  onHover: (d: any, pos: THREE.Vector3 | null) => void;
  interpMode: "none" | "linear" | "catmullRom";
  smoothness: number;
}) {
  const lineRef = useRef<THREE.Line | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const basePoints = useMemo(
    () => data.map((p) => new THREE.Vector3(p.ch1, p.ch2, p.ch3)),
    [data]
  );

  const { points, indexMap } = useMemo(() => {
    return interpolateTrajectory(
      basePoints,
      interpMode,
      Math.max(1, smoothness)
    );
  }, [basePoints, interpMode, smoothness]);

  const colors = useMemo(() => {
    const cols: THREE.Color[] = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(n - 1, 1);
      cols.push(new THREE.Color().setHSL(0.6 - t * 0.4, 0.8, 0.5));
    }
    return cols;
  }, [points]);

  useFrame(({ camera, pointer, raycaster }) => {
    if (lineRef.current && points.length > 1) {
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(lineRef.current);
      if (intersects.length > 0) {
        const f = intersects[0].faceIndex ?? 0;
        const idx = Math.floor(f / 2);
        const origIdx = indexMap[Math.min(points.length - 1, idx)] ?? idx;
        if (origIdx < data.length) {
          setHovered(origIdx);
          onHover(data[origIdx], intersects[0].point as THREE.Vector3);
        }
      } else {
        setHovered(null);
        onHover(null, null);
      }
    }
  });

  if (points.length < 2) return null;

  return (
    <group>
      {/* @ts-ignore */}
      <Line
        ref={lineRef as any}
        points={points}
        vertexColors={colors}
        lineWidth={3}
      />
      {hovered !== null && (
        <mesh
          position={[data[hovered].ch1, data[hovered].ch2, data[hovered].ch3]}
        >
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="#ffff00" />
        </mesh>
      )}
    </group>
  );
}

/* Tooltip */
function Tooltip({ data, position }: { data: any; position: any }) {
  if (!data || !position) return null;
  return (
    <Html position={position}>
      <div className="bg-black/90 text-white px-3 py-2 rounded text-xs pointer-events-none whitespace-nowrap">
        <div>Sample: {data.index}</div>
        <div>X: {data.ch1.toFixed(2)}</div>
        <div>Y: {data.ch2.toFixed(2)}</div>
        <div>Z: {data.ch3.toFixed(2)}</div>
      </div>
    </Html>
  );
}

/* 2D Cross-section (responsive) */
function CrossSection({
  data,
  plane,
  title,
  interpMode,
  smoothness,
}: {
  data: any[];
  plane: "ch1ch2" | "ch1ch3" | "ch2ch3";
  title: string;
  interpMode: "none" | "linear" | "catmullRom";
  smoothness: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 250 });

  const projPoints = useMemo(() => {
    const pts = data.map((p) => {
      const [x, y] =
        plane === "ch1ch2"
          ? [p.ch1, p.ch2]
          : plane === "ch1ch3"
          ? [p.ch1, p.ch3]
          : [p.ch2, p.ch3];
      return new THREE.Vector3(x, y, 0);
    });
    return interpolateTrajectory(pts, interpMode, Math.max(1, smoothness))
      .points;
  }, [data, plane, interpMode, smoothness]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(200, width - 16),
          height: Math.max(150, Math.min(250, width * 0.625)),
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = dimensions.width;
    const h = dimensions.height;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);
    if (projPoints.length < 2) return;

    // ranges
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    projPoints.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const padding = Math.min(20, w * 0.06);
    const scaleX = (w - padding * 2) / (maxX - minX || 1);
    const scaleY = (h - padding * 2) / (maxY - minY || 1);

    // line
    ctx.strokeStyle = "#6ea8ff";
    ctx.lineWidth = Math.max(1, w / 200);
    ctx.beginPath();
    for (let i = 0; i < projPoints.length; i++) {
      const p = projPoints[i];
      const x = padding + (p.x - minX) * scaleX;
      const y = h - padding - (p.y - minY) * scaleY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.stroke();

    // labels
    ctx.fillStyle = "#888";
    ctx.font = `${Math.max(9, w / 40)}px monospace`;
    const labels =
      plane === "ch1ch2"
        ? ["X", "Y"]
        : plane === "ch1ch3"
        ? ["X", "Z"]
        : ["Y", "Z"];
    ctx.fillText(labels[0], w - padding - 18, h - 6);
    ctx.fillText(labels[1], 6, padding + 6);
  }, [projPoints, dimensions, plane]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0">
      <h3 className="text-xs md:text-sm font-medium text-gray-300 mb-1 md:mb-2">
        {title}
      </h3>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-auto bg-gray-900 rounded border border-gray-800"
      />
    </div>
  );
}

/* Time Series (X,Y,Z vs t)  */
function TimeSeriesChart({
  data,
  maxPoints = 300,
  labels = { x: "Time (samples)", ch1: "X", ch2: "Y", ch3: "Z" },
}: {
  data: any[];
  maxPoints?: number;
  labels?: { x: string; ch1: string; ch2: string; ch3: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 220 });

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(280, width - 16),
          height: Math.max(160, Math.min(280, Math.round(width * 0.38))),
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = dimensions.width;
    const h = dimensions.height;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);
    if (data.length < 2) return;

    const displayData = data.slice(Math.max(0, data.length - maxPoints));

    let minVal = Infinity,
      maxVal = -Infinity;
    displayData.forEach((p) => {
      minVal = Math.min(minVal, p.ch1, p.ch2, p.ch3);
      maxVal = Math.max(maxVal, p.ch1, p.ch2, p.ch3);
    });

    const padding = { top: 20, right: 30, bottom: 30, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const scaleX = chartW / Math.max(displayData.length - 1, 1);
    const scaleY = chartH / (maxVal - minVal || 1);

    // grid
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // channels
    const channels = [
      { key: "ch1" as const, color: "#3b82f6", label: labels.ch1 },
      { key: "ch2" as const, color: "#a855f7", label: labels.ch2 },
      { key: "ch3" as const, color: "#ec4899", label: labels.ch3 },
    ];

    channels.forEach(({ key, color }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, w / 400);
      ctx.beginPath();
      displayData.forEach((point, i) => {
        const x = padding.left + i * scaleX;
        const y = h - padding.bottom - (point[key] - minVal) * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.lineTo(w - padding.right, h - padding.bottom);
    ctx.stroke();

    // Y ticks
    ctx.fillStyle = "#888";
    ctx.font = `${Math.max(9, w / 60)}px monospace`;
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = minVal + ((maxVal - minVal) / 5) * (5 - i);
      const y = padding.top + (chartH / 5) * i;
      ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
    }

    // X label
    ctx.textAlign = "center";
    ctx.fillText(labels.x, w / 2, h - 5);

    // legend
    ctx.textAlign = "left";
    const legendX = w - padding.right - 120;
    const legendY = padding.top + 5;
    channels.forEach(({ color, label }, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY + i * 18, 20, 3);
      ctx.fillStyle = "#888";
      ctx.fillText(label, legendX + 25, legendY + i * 18 + 4);
    });
  }, [data, dimensions, maxPoints, labels]);

  return (
    <div ref={containerRef} className="w-full">
      <h3 className="text-xs md:text-sm font-medium text-gray-300 mb-1 md:mb-2">
        X, Y, Z vs t (Time Series)
      </h3>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-auto bg-gray-900 rounded border border-gray-800"
      />
    </div>
  );
}

/* ------------------------
   Main dashboard
-------------------------*/
export default function SensorDashboard() {
  // Full raw history (NOT rendered). Append-only.
  const storeRef = useRef<
    { index: number; ch1: number; ch2: number; ch3: number }[]
  >([]);

  // Global extrema for normalization
  const extremaRef = useRef({
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  });

  // Render window (<= WINDOW_SIZE)
  const [visibleData, setVisibleData] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [totalCount, setTotalCount] = useState(0);
  const [normalize, setNormalize] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hoverData, setHoverData] = useState<any>(null);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [stats, setStats] = useState({
    ch1: 0 as any,
    ch2: 0 as any,
    ch3: 0 as any,
  });
  const socketRef = useRef<WebSocket | null>(null);

  // interpolation controls
  const [interpMode, setInterpMode] = useState<
    "none" | "linear" | "catmullRom"
  >("catmullRom");
  const [smoothness, setSmoothness] = useState(6);

  // playback scrubber
  const playHeadRef = useRef<number>(0);

  const normalizeValue = (v: number, i: number) => {
    const min = extremaRef.current.min[i];
    const max = extremaRef.current.max[i];
    const range = max - min;
    return range > 0 ? (FACTOR * (v - min)) / range : FACTOR * 0.5;
    // NOTE: FACTOR keeps the 3D scene in a nice visible cube after normalization.
  };

  // Build visible window from store; optionally normalize
  const updateVisibleWindow = (idx: number) => {
    const n = storeRef.current.length;
    if (n === 0 || idx < 0) {
      setVisibleData([]);
      setCurrentIndex(-1);
      setTotalCount(0);
      return;
    }
    const clampedIdx = Math.min(idx, n - 1);
    const start = Math.max(0, clampedIdx - WINDOW_SIZE + 1);
    const slice = storeRef.current.slice(start, clampedIdx + 1);

    const windowData = normalize
      ? slice.map((p) => ({
          ...p,
          ch1: normalizeValue(p.ch1, 0),
          ch2: normalizeValue(p.ch2, 1),
          ch3: normalizeValue(p.ch3, 2),
        }))
      : slice;

    setVisibleData(windowData);
    setCurrentIndex(clampedIdx);
    setTotalCount(n);
  };

  // Recompute window when normalization mode changes
  useEffect(() => {
    if (totalCount > 0 && currentIndex >= 0) {
      updateVisibleWindow(currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalize]);

  // WebSocket connection
  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8765");
    socketRef.current = socket;
    socket.onopen = () => setIsConnected(true);

    socket.onmessage = (event) => {
      const newData = JSON.parse(event.data);

      // Update global extrema from raw samples
      newData.samples.forEach((s: number[]) => {
        for (let i = 0; i < 3; i++) {
          if (s[i] < extremaRef.current.min[i])
            extremaRef.current.min[i] = s[i];
          if (s[i] > extremaRef.current.max[i])
            extremaRef.current.max[i] = s[i];
        }
      });

      // Append raw trajectory points to the store
      const base = storeRef.current.length;
      const trajectoryPoints = newData.samples.map(
        (sample: number[], idx: number) => ({
          index: base + idx,
          ch1: sample[0],
          ch2: sample[1],
          ch3: sample[2],
        })
      );
      storeRef.current.push(...trajectoryPoints);

      // Advance head and refresh visible window to the latest
      const newHead = base + trajectoryPoints.length - 1;
      updateVisibleWindow(newHead);

      // Simple batch averages for display
      const averages = [0, 1, 2].map(
        (ch) =>
          newData.samples.reduce((sum: number, s: number[]) => sum + s[ch], 0) /
          newData.samples.length
      );
      setStats({
        ch1: Number.isFinite(averages[0]) ? averages[0].toFixed(1) : 0,
        ch2: Number.isFinite(averages[1]) ? averages[1].toFixed(1) : 0,
        ch3: Number.isFinite(averages[2]) ? averages[2].toFixed(1) : 0,
      } as any);
    };

    socket.onclose = () => setIsConnected(false);
    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = () => {
    storeRef.current = [];
    extremaRef.current = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    } as any;
    setVisibleData([]);
    setCurrentIndex(-1);
    setTotalCount(0);
    setIsPlaying(false);
    playHeadRef.current = 0;
  };

  const handleHover = (data: any, pos: any) => {
    setHoverData(data);
    setHoverPos(pos);
  };

  const handleScrub = (val: number) => {
    updateVisibleWindow(val);
    playHeadRef.current = val;
  };

  const maxIndex = Math.max(0, totalCount - 1);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-gray-700/50 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            UDP Sensor 3D Dashboard
          </h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Real-time 3-channel trajectory visualization
          </p>
        </div>
        <div className="flex gap-2 md:gap-3 items-center">
          <Badge
            variant={isConnected ? "default" : "secondary"}
            className={`text-xs md:text-sm px-3 md:px-4 py-2 ${
              isConnected ? "bg-green-600" : "bg-slate-600"
            }`}
          >
            <Radio className="w-4 h-4 mr-2" />
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>

          <Button
            onClick={() => setIsPlaying(!isPlaying)}
            variant={isPlaying ? "destructive" : "default"}
            size="sm"
            className="gap-2"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isPlaying ? "Pause" : "Play"}
          </Button>

          <Button
            onClick={() => setNormalize((v) => !v)}
            variant="secondary"
            size="sm"
            className={`gap-2 ${
              normalize ? "bg-emerald-700/40" : "bg-slate-700/40"
            }`}
            title="Toggle 0–1 normalization"
          >
            {normalize ? "Normalized 0–1" : "Raw scale"}
          </Button>

          <Button
            onClick={handleReset}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
        </div>
      </div>

      {/* Interpolation Controls */}
      <div className="px-4 md:px-6 pt-3 pb-2 border-b border-gray-700/50 shrink-0 flex flex-wrap items-center gap-3">
        <div className="text-sm text-gray-300 font-medium">Smoothing</div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={interpMode === "none" ? "default" : "secondary"}
            onClick={() => setInterpMode("none")}
          >
            Off
          </Button>
          <Button
            size="sm"
            variant={interpMode === "linear" ? "default" : "secondary"}
            onClick={() => setInterpMode("linear")}
          >
            Linear
          </Button>
          <Button
            size="sm"
            variant={interpMode === "catmullRom" ? "default" : "secondary"}
            onClick={() => setInterpMode("catmullRom")}
          >
            Spline
          </Button>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-72">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            Smoothness
          </span>
          <Slider
            value={[smoothness]}
            onValueChange={([v]) => setSmoothness(Math.max(1, v))}
            min={1}
            max={20}
            step={1}
          />
          <span className="text-xs text-gray-400 w-6 text-right">
            {smoothness}
          </span>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="px-4 md:px-6 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-gray-700/50 shrink-0">
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-700/20 border border-blue-500/30 rounded-lg px-4 py-2">
          <div className="text-xs text-blue-300 font-medium">X Avg</div>
          <div className="text-2xl font-bold text-blue-100">{stats.ch1}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-lg px-4 py-2">
          <div className="text-xs text-purple-300 font-medium">Y Avg</div>
          <div className="text-2xl font-bold text-purple-100">{stats.ch2}</div>
        </div>
        <div className="bg-gradient-to-br from-pink-600/20 to-pink-700/20 border border-pink-500/30 rounded-lg px-4 py-2">
          <div className="text-xs text-pink-300 font-medium">Z Avg</div>
          <div className="text-2xl font-bold text-pink-100">{stats.ch3}</div>
        </div>
      </div>

      {/* Main content — fully responsive */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 min-h-0">
        {/* 3D View */}
        <div className="lg:col-span-2 bg-gray-900/50 backdrop-blur rounded-lg overflow-hidden min-w-0 border border-gray-700/50">
          {/* Responsive height box for the Canvas */}
          <div className="relative w-full h-[40vh] md:h-[50vh] lg:h-[62vh]">
            <Canvas camera={{ position: [40, 30, 40], fov: 60 }}>
              <PlayheadAnimator
                isPlaying={isPlaying}
                maxIndex={maxIndex}
                playHeadRef={playHeadRef}
                currentIndex={currentIndex}
                onStep={updateVisibleWindow}
              />
              <ambientLight intensity={0.6} />
              <pointLight position={[20, 20, 20]} intensity={0.8} />
              <pointLight
                position={[-20, -20, -20]}
                intensity={0.4}
                color="#4a9eff"
              />
              {visibleData.length > 0 && (
                <>
                  <SensorTrajectory
                    data={visibleData}
                    onHover={handleHover}
                    interpMode={interpMode}
                    smoothness={smoothness}
                  />
                  <Tooltip data={hoverData} position={hoverPos} />
                </>
              )}
              <OrbitControls enableDamping dampingFactor={0.05} />
              <gridHelper args={[100, 20, "#444", "#222"]} />
            </Canvas>
          </div>
        </div>

        {/* NEW: X,Y,Z vs t */}
        <TimeSeriesChart
          data={visibleData}
          maxPoints={600}
          labels={{ x: "t (samples)", ch1: "X", ch2: "Y", ch3: "Z" }}
        />

        {/* Right side: cross-sections + time series */}
        <div className="flex flex-col gap-4 min-w-0 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <CrossSection
              data={visibleData}
              plane="ch1ch2"
              title="X vs Y"
              interpMode={interpMode}
              smoothness={smoothness}
            />
            <CrossSection
              data={visibleData}
              plane="ch1ch3"
              title="X vs Z"
              interpMode={interpMode}
              smoothness={smoothness}
            />
            <CrossSection
              data={visibleData}
              plane="ch2ch3"
              title="Y vs Z"
              interpMode={interpMode}
              smoothness={smoothness}
            />
          </div>
        </div>
      </div>

      {/* Timeline Controls */}
      <div className="px-4 md:px-6 py-4 border-t border-gray-700/50 shrink-0">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          <span className="text-sm text-gray-400 whitespace-nowrap sm:w-32">
            Sample: {Math.max(0, currentIndex)}
          </span>
          <div className="w-full">
            <Slider
              value={[Math.max(0, currentIndex)]}
              onValueChange={([val]) => handleScrub(val)}
              max={maxIndex}
              step={1}
              disabled={maxIndex === 0}
              className="w-full"
            />
          </div>
          <span className="text-sm text-gray-400 whitespace-nowrap sm:w-56 sm:text-right">
            {totalCount} total points (showing up to {WINDOW_SIZE})
          </span>
        </div>
      </div>
    </div>
  );
}

// "use client";
// import React, { useState, useEffect, useRef, useMemo } from "react";
// import { Canvas, useFrame } from "@react-three/fiber";
// import { OrbitControls, Line, Html } from "@react-three/drei";
// import * as THREE from "three";
// import { Slider } from "@/components/ui/slider";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { Play, Pause, RotateCcw, Radio } from "lucide-react";

// const WINDOW_SIZE = 1_000; // render the last 1k points only
// const FACTOR = 5;

// // ------------------------
// // Helpers: interpolation
// // ------------------------
// function lerpVec(a: THREE.Vector3, b: THREE.Vector3, t: number) {
//   return new THREE.Vector3(
//     THREE.MathUtils.lerp(a.x, b.x, t),
//     THREE.MathUtils.lerp(a.y, b.y, t),
//     THREE.MathUtils.lerp(a.z, b.z, t)
//   );
// }

// /**
//  * Returns densified points and a mapping from each densified point to the nearest original index.
//  */
// function interpolateTrajectory(
//   pts: THREE.Vector3[],
//   method: "none" | "linear" | "catmullRom",
//   segmentsPerEdge: number
// ): { points: THREE.Vector3[]; indexMap: number[] } {
//   if (pts.length <= 1 || method === "none") {
//     return { points: pts, indexMap: pts.map((_, i) => i) };
//   }

//   if (method === "linear") {
//     const out: THREE.Vector3[] = [];
//     const idxMap: number[] = [];
//     for (let i = 0; i < pts.length - 1; i++) {
//       const a = pts[i];
//       const b = pts[i + 1];
//       for (let s = 0; s < segmentsPerEdge; s++) {
//         const t = s / segmentsPerEdge;
//         out.push(lerpVec(a, b, t));
//         idxMap.push(i);
//       }
//     }
//     // push the last point
//     out.push(pts[pts.length - 1]);
//     idxMap.push(pts.length - 1);
//     return { points: out, indexMap: idxMap };
//   }

//   // Catmull-Rom using three.js Curve utilities
//   const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
//   const totalSegments = Math.max(1, (pts.length - 1) * segmentsPerEdge);
//   const out = curve.getPoints(totalSegments);
//   // Build a simple index map by nearest original vertex along param t
//   const idxMap: number[] = [];
//   for (let i = 0; i <= totalSegments; i++) {
//     const t = i / totalSegments;
//     const approxIdx = Math.min(
//       pts.length - 1,
//       Math.max(0, Math.round(t * (pts.length - 1)))
//     );
//     idxMap.push(approxIdx);
//   }
//   return { points: out, indexMap: idxMap };
// }

// // --- Animator inside Canvas to satisfy R3F hook rules ---
// function PlayheadAnimator({
//   isPlaying,
//   maxIndex,
//   playHeadRef,
//   currentIndex,
//   onStep,
// }: {
//   isPlaying: boolean;
//   maxIndex: number;
//   playHeadRef: React.MutableRefObject<number>;
//   currentIndex: number;
//   onStep: (head: number) => void;
// }) {
//   useFrame((_, delta) => {
//     if (!isPlaying || maxIndex <= 0) return;
//     const speed = 120; // samples/sec
//     playHeadRef.current = Math.min(
//       maxIndex,
//       playHeadRef.current + speed * delta
//     );
//     const head = Math.floor(playHeadRef.current);
//     if (head !== currentIndex) onStep(head);
//   });
//   return null;
// }

// // 3D Trajectory visualization component
// function SensorTrajectory({
//   data,
//   onHover,
//   interpMode,
//   smoothness,
// }: {
//   data: { index: number; ch1: number; ch2: number; ch3: number }[];
//   onHover: (d: any, pos: THREE.Vector3 | null) => void;
//   interpMode: "none" | "linear" | "catmullRom";
//   smoothness: number; // segments per edge
// }) {
//   const lineRef = useRef<THREE.Line | null>(null);
//   const [hovered, setHovered] = useState<number | null>(null);

//   const basePoints = useMemo(
//     () => data.map((p) => new THREE.Vector3(p.ch1, p.ch2, p.ch3)),
//     [data]
//   );

//   const { points, indexMap } = useMemo(() => {
//     return interpolateTrajectory(
//       basePoints,
//       interpMode,
//       Math.max(1, smoothness)
//     );
//   }, [basePoints, interpMode, smoothness]);

//   const colors = useMemo(() => {
//     const cols: THREE.Color[] = [];
//     const n = points.length;
//     for (let i = 0; i < n; i++) {
//       const t = i / Math.max(n - 1, 1);
//       cols.push(new THREE.Color().setHSL(0.6 - t * 0.4, 0.8, 0.5));
//     }
//     return cols;
//   }, [points]);

//   useFrame(({ camera, pointer, raycaster }) => {
//     if (lineRef.current && points.length > 1) {
//       raycaster.setFromCamera(pointer, camera);
//       const intersects = raycaster.intersectObject(lineRef.current);
//       if (intersects.length > 0) {
//         const f = intersects[0].faceIndex ?? 0;
//         const idx = Math.floor(f / 2); // line is triangle strip inside drei Line
//         const origIdx = indexMap[Math.min(points.length - 1, idx)] ?? idx;
//         if (origIdx < data.length) {
//           setHovered(origIdx);
//           onHover(data[origIdx], intersects[0].point as THREE.Vector3);
//         }
//       } else {
//         setHovered(null);
//         onHover(null, null);
//       }
//     }
//   });

//   if (points.length < 2) return null;

//   return (
//     <group>
//       {/* @ts-ignore - drei Line typings */}
//       <Line
//         ref={lineRef as any}
//         points={points}
//         vertexColors={colors}
//         lineWidth={3}
//       />
//       {hovered !== null && (
//         <mesh
//           position={[data[hovered].ch1, data[hovered].ch2, data[hovered].ch3]}
//         >
//           <sphereGeometry args={[0.5, 16, 16]} />
//           <meshBasicMaterial color="#ffff00" />
//         </mesh>
//       )}
//     </group>
//   );
// }

// // Tooltip component
// function Tooltip({ data, position }: { data: any; position: any }) {
//   if (!data || !position) return null;
//   return (
//     <Html position={position}>
//       <div className="bg-black/90 text-white px-3 py-2 rounded text-xs pointer-events-none whitespace-nowrap">
//         <div>Sample: {data.index}</div>
//         <div>Ch1: {data.ch1.toFixed(2)}</div>
//         <div>Ch2: {data.ch2.toFixed(2)}</div>
//         <div>Ch3: {data.ch3.toFixed(2)}</div>
//       </div>
//     </Html>
//   );
// }

// // 2D Cross-section component (optionally smoothed draw)
// function CrossSection({
//   data,
//   plane,
//   title,
//   interpMode,
//   smoothness,
// }: {
//   data: any[];
//   plane: "ch1ch2" | "ch1ch3" | "ch2ch3";
//   title: string;
//   interpMode: "none" | "linear" | "catmullRom";
//   smoothness: number;
// }) {
//   const canvasRef = useRef<HTMLCanvasElement | null>(null);
//   const containerRef = useRef<HTMLDivElement | null>(null);
//   const [dimensions, setDimensions] = useState({ width: 400, height: 250 });

//   // make projected vectors to re-use interpolation helper
//   const projPoints = useMemo(() => {
//     const pts = data.map((p) => {
//       const [x, y] =
//         plane === "ch1ch2"
//           ? [p.ch1, p.ch2]
//           : plane === "ch1ch3"
//           ? [p.ch1, p.ch3]
//           : [p.ch2, p.ch3];
//       return new THREE.Vector3(x, y, 0);
//     });
//     return interpolateTrajectory(pts, interpMode, Math.max(1, smoothness))
//       .points;
//   }, [data, plane, interpMode, smoothness]);

//   useEffect(() => {
//     if (!containerRef.current) return;
//     const ro = new ResizeObserver((entries) => {
//       for (let entry of entries) {
//         const { width } = entry.contentRect;
//         setDimensions({
//           width: Math.max(200, width - 32),
//           height: Math.max(150, Math.min(250, width * 0.625)),
//         });
//       }
//     });
//     ro.observe(containerRef.current);
//     return () => ro.disconnect();
//   }, []);

//   useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;
//     const ctx = canvas.getContext("2d");
//     if (!ctx) return;

//     const w = dimensions.width;
//     const h = dimensions.height;

//     ctx.fillStyle = "#1a1a1a";
//     ctx.fillRect(0, 0, w, h);
//     if (projPoints.length < 2) return;

//     // Find ranges
//     let minX = Infinity,
//       maxX = -Infinity,
//       minY = Infinity,
//       maxY = -Infinity;

//     projPoints.forEach((p) => {
//       minX = Math.min(minX, p.x);
//       maxX = Math.max(maxX, p.x);
//       minY = Math.min(minY, p.y);
//       maxY = Math.max(maxY, p.y);
//     });

//     const padding = Math.min(20, w * 0.05);
//     const scaleX = (w - padding * 2) / (maxX - minX || 1);
//     const scaleY = (h - padding * 2) / (maxY - minY || 1);

//     // Smooth trail
//     ctx.strokeStyle = "#6ea8ff";
//     ctx.lineWidth = Math.max(1, w / 200);
//     ctx.beginPath();
//     for (let i = 0; i < projPoints.length; i++) {
//       const p = projPoints[i];
//       const x = padding + (p.x - minX) * scaleX;
//       const y = h - padding - (p.y - minY) * scaleY;
//       if (i === 0) ctx.moveTo(x, y);
//       else ctx.lineTo(x, y);
//     }
//     ctx.stroke();

//     // Axes
//     ctx.strokeStyle = "#444";
//     ctx.lineWidth = 1;
//     ctx.beginPath();
//     ctx.moveTo(padding, h - padding);
//     ctx.lineTo(w - padding, h - padding);
//     ctx.moveTo(padding, padding);
//     ctx.lineTo(padding, h - padding);
//     ctx.stroke();

//     // Labels
//     ctx.fillStyle = "#888";
//     ctx.font = `${Math.max(9, w / 40)}px monospace`;
//     const labels =
//       plane === "ch1ch2"
//         ? ["Ch1", "Ch2"]
//         : plane === "ch1ch3"
//         ? ["Ch1", "Ch3"]
//         : ["Ch2", "Ch3"];
//     ctx.fillText(labels[0], w - padding - 25, h - 5);
//     ctx.fillText(labels[1], 5, padding + 5);
//   }, [projPoints, dimensions, plane]);

//   return (
//     <div ref={containerRef} className="flex-1 min-h-0">
//       <h3 className="text-xs md:text-sm font-medium text-gray-300 mb-1 md:mb-2">
//         {title}
//       </h3>
//       <canvas
//         ref={canvasRef}
//         width={dimensions.width}
//         height={dimensions.height}
//         className="w-full h-auto bg-gray-900 rounded border border-gray-800"
//       />
//     </div>
//   );
// }

// // Time Series Chart component (unchanged rendering, uses original data window)
// function TimeSeriesChart({
//   data,
//   maxPoints = 200,
// }: {
//   data: any[];
//   maxPoints?: number;
// }) {
//   const canvasRef = useRef<HTMLCanvasElement | null>(null);
//   const containerRef = useRef<HTMLDivElement | null>(null);
//   const [dimensions, setDimensions] = useState({ width: 600, height: 200 });

//   useEffect(() => {
//     if (!containerRef.current) return;
//     const resizeObserver = new ResizeObserver((entries) => {
//       for (let entry of entries) {
//         const { width } = entry.contentRect;
//         setDimensions({
//           width: Math.max(300, width - 32),
//           height: Math.max(120, Math.min(200, width * 0.33)),
//         });
//       }
//     });
//     resizeObserver.observe(containerRef.current);
//     return () => resizeObserver.disconnect();
//   }, []);

//   useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;
//     const ctx = canvas.getContext("2d");
//     if (!ctx) return;

//     const w = dimensions.width;
//     const h = dimensions.height;

//     ctx.fillStyle = "#1a1a1a";
//     ctx.fillRect(0, 0, w, h);
//     if (data.length < 2) return;

//     const displayData = data.slice(Math.max(0, data.length - maxPoints));

//     let minVal = Infinity,
//       maxVal = -Infinity;
//     displayData.forEach((p) => {
//       minVal = Math.min(minVal, p.ch1, p.ch2, p.ch3);
//       maxVal = Math.max(maxVal, p.ch1, p.ch2, p.ch3);
//     });

//     const padding = { top: 20, right: 30, bottom: 30, left: 50 };
//     const chartW = w - padding.left - padding.right;
//     const chartH = h - padding.top - padding.bottom;
//     const scaleX = chartW / Math.max(displayData.length - 1, 1);
//     const scaleY = chartH / (maxVal - minVal || 1);

//     // Grid
//     ctx.strokeStyle = "#2a2a2a";
//     ctx.lineWidth = 1;
//     for (let i = 0; i <= 5; i++) {
//       const y = padding.top + (chartH / 5) * i;
//       ctx.beginPath();
//       ctx.moveTo(padding.left, y);
//       ctx.lineTo(w - padding.right, y);
//       ctx.stroke();
//     }

//     // Channels
//     const channels = [
//       { key: "ch1" as const, color: "#3b82f6", label: "Ch1" },
//       { key: "ch2" as const, color: "#a855f7", label: "Ch2" },
//       { key: "ch3" as const, color: "#ec4899", label: "Ch3" },
//     ];

//     channels.forEach(({ key, color }) => {
//       ctx.strokeStyle = color;
//       ctx.lineWidth = Math.max(1.5, w / 400);
//       ctx.beginPath();
//       displayData.forEach((point, i) => {
//         const x = padding.left + i * scaleX;
//         const y = h - padding.bottom - (point[key] - minVal) * scaleY;
//         if (i === 0) ctx.moveTo(x, y);
//         else ctx.lineTo(x, y);
//       });
//       ctx.stroke();
//     });

//     // Axes
//     ctx.strokeStyle = "#444";
//     ctx.lineWidth = 2;
//     ctx.beginPath();
//     ctx.moveTo(padding.left, padding.top);
//     ctx.lineTo(padding.left, h - padding.bottom);
//     ctx.lineTo(w - padding.right, h - padding.bottom);
//     ctx.stroke();

//     // Y ticks
//     ctx.fillStyle = "#888";
//     ctx.font = `${Math.max(9, w / 60)}px monospace`;
//     ctx.textAlign = "right";
//     for (let i = 0; i <= 5; i++) {
//       const val = minVal + ((maxVal - minVal) / 5) * (5 - i);
//       const y = padding.top + (chartH / 5) * i;
//       ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
//     }

//     // X label
//     ctx.textAlign = "center";
//     ctx.fillText("Time (samples)", w / 2, h - 5);

//     // Legend
//     ctx.textAlign = "left";
//     const legendX = w - padding.right - 120;
//     const legendY = padding.top + 5;
//     channels.forEach(({ color, label }, i) => {
//       ctx.fillStyle = color;
//       ctx.fillRect(legendX, legendY + i * 18, 20, 3);
//       ctx.fillStyle = "#888";
//       ctx.fillText(label, legendX + 25, legendY + i * 18 + 4);
//     });
//   }, [data, dimensions, maxPoints]);

//   return (
//     <div ref={containerRef} className="w-full">
//       <h3 className="text-xs md:text-sm font-medium text-gray-300 mb-1 md:mb-2">
//         Time Series - All Channels
//       </h3>
//       <canvas
//         ref={canvasRef}
//         width={dimensions.width}
//         height={dimensions.height}
//         className="w-full h-auto bg-gray-900 rounded border border-gray-800"
//       />
//     </div>
//   );
// }

// // Main dashboard component
// export default function SensorDashboard() {
//   // Full raw history (NOT rendered). Append-only.
//   const storeRef = useRef<
//     { index: number; ch1: number; ch2: number; ch3: number }[]
//   >([]);

//   // Global extrema for normalization
//   const extremaRef = useRef({
//     min: [Infinity, Infinity, Infinity],
//     max: [-Infinity, -Infinity, -Infinity],
//   });

//   // Render window (<= WINDOW_SIZE)
//   const [visibleData, setVisibleData] = useState<any[]>([]);
//   const [currentIndex, setCurrentIndex] = useState(-1); // global index of last visible point
//   const [totalCount, setTotalCount] = useState(0); // full store size
//   const [normalize, setNormalize] = useState(true); // 0–1 scaling toggle

//   const [isPlaying, setIsPlaying] = useState(false);
//   const [isConnected, setIsConnected] = useState(false);
//   const [hoverData, setHoverData] = useState<any>(null);
//   const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
//   const [stats, setStats] = useState({
//     ch1: 0 as any,
//     ch2: 0 as any,
//     ch3: 0 as any,
//   });
//   const socketRef = useRef<WebSocket | null>(null);

//   // NEW: interpolation controls
//   const [interpMode, setInterpMode] = useState<
//     "none" | "linear" | "catmullRom"
//   >("catmullRom");
//   const [smoothness, setSmoothness] = useState(6); // segments per edge

//   // NEW: playback scrubber (uses fractional position between points)
//   const playHeadRef = useRef<number>(0); // 0..totalCount-1, fractional

//   const normalizeValue = (v: number, i: number) => {
//     const min = extremaRef.current.min[i];
//     const max = extremaRef.current.max[i];
//     const range = max - min;
//     return range > 0 ? (FACTOR * (v - min)) / range : FACTOR * 0.5;
//   };

//   // Build visible window from store; optionally normalize
//   const updateVisibleWindow = (idx: number) => {
//     const n = storeRef.current.length;
//     if (n === 0 || idx < 0) {
//       setVisibleData([]);
//       setCurrentIndex(-1);
//       setTotalCount(0);
//       return;
//     }
//     const clampedIdx = Math.min(idx, n - 1);
//     const start = Math.max(0, clampedIdx - WINDOW_SIZE + 1);
//     const slice = storeRef.current.slice(start, clampedIdx + 1);

//     const windowData = normalize
//       ? slice.map((p) => ({
//           ...p,
//           ch1: normalizeValue(p.ch1, 0),
//           ch2: normalizeValue(p.ch2, 1),
//           ch3: normalizeValue(p.ch3, 2),
//         }))
//       : slice;

//     setVisibleData(windowData);
//     setCurrentIndex(clampedIdx);
//     setTotalCount(n);
//   };

//   // Recompute window when normalization mode changes
//   useEffect(() => {
//     if (totalCount > 0 && currentIndex >= 0) {
//       updateVisibleWindow(currentIndex);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [normalize]);

//   // WebSocket connection
//   useEffect(() => {
//     const socket = new WebSocket("ws://localhost:8765");
//     socketRef.current = socket;

//     socket.onopen = () => setIsConnected(true);

//     socket.onmessage = (event) => {
//       const newData = JSON.parse(event.data);

//       // Update global extrema from raw samples
//       newData.samples.forEach((s: number[]) => {
//         for (let i = 0; i < 3; i++) {
//           if (s[i] < extremaRef.current.min[i])
//             extremaRef.current.min[i] = s[i];
//           if (s[i] > extremaRef.current.max[i])
//             extremaRef.current.max[i] = s[i];
//         }
//       });

//       // Append raw trajectory points to the store
//       const base = storeRef.current.length;
//       const trajectoryPoints = newData.samples.map(
//         (sample: number[], idx: number) => ({
//           index: base + idx,
//           ch1: sample[0],
//           ch2: sample[1],
//           ch3: sample[2],
//         })
//       );
//       storeRef.current.push(...trajectoryPoints);

//       // Advance head and refresh visible window to the latest
//       const newHead = base + trajectoryPoints.length - 1;
//       updateVisibleWindow(newHead);

//       // Simple batch averages for display
//       const averages = [0, 1, 2].map(
//         (ch) =>
//           newData.samples.reduce((sum: number, s: number[]) => sum + s[ch], 0) /
//           newData.samples.length
//       );
//       setStats({
//         ch1: Number.isFinite(averages[0]) ? averages[0].toFixed(1) : 0,
//         ch2: Number.isFinite(averages[1]) ? averages[1].toFixed(1) : 0,
//         ch3: Number.isFinite(averages[2]) ? averages[2].toFixed(1) : 0,
//       } as any);
//     };

//     socket.onclose = () => setIsConnected(false);
//     return () => socket.close();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   const handleReset = () => {
//     // Full reset: clears store and view
//     storeRef.current = [];
//     extremaRef.current = {
//       min: [Infinity, Infinity, Infinity],
//       max: [-Infinity, -Infinity, -Infinity],
//     } as any;
//     setVisibleData([]);
//     setCurrentIndex(-1);
//     setTotalCount(0);
//     setIsPlaying(false);
//     playHeadRef.current = 0;
//   };

//   const handleHover = (data: any, pos: any) => {
//     setHoverData(data);
//     setHoverPos(pos);
//   };

//   const handleScrub = (val: number) => {
//     updateVisibleWindow(val);
//     playHeadRef.current = val;
//   };

//   const maxIndex = Math.max(0, totalCount - 1);

//   // NEW: playback animator — smoothly increments the playhead and rebuilds window
//   // Playback animator moved inside Canvas via <PlayheadAnimator /> to satisfy R3F hook rules.

//   return (
//     <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
//       {/* Header */}
//       <div className="px-6 py-4 border-b border-gray-700/50 flex justify-between items-center shrink-0">
//         <div>
//           <h1 className="text-2xl font-bold">UDP Sensor 3D Dashboard</h1>
//           <p className="text-sm text-gray-400 mt-1">
//             Real-time 3-channel trajectory visualization
//           </p>
//         </div>
//         <div className="flex gap-3 items-center">
//           <Badge
//             variant={isConnected ? "default" : "secondary"}
//             className={`text-sm px-4 py-2 ${
//               isConnected ? "bg-green-600" : "bg-slate-600"
//             }`}
//           >
//             <Radio className="w-4 h-4 mr-2" />
//             {isConnected ? "Connected" : "Disconnected"}
//           </Badge>

//           <Button
//             onClick={() => setIsPlaying(!isPlaying)}
//             variant={isPlaying ? "destructive" : "default"}
//             size="sm"
//             className="gap-2"
//           >
//             {isPlaying ? (
//               <Pause className="w-4 h-4" />
//             ) : (
//               <Play className="w-4 h-4" />
//             )}
//             {isPlaying ? "Pause" : "Play"}
//           </Button>

//           <Button
//             onClick={() => setNormalize((v) => !v)}
//             variant="secondary"
//             size="sm"
//             className={`gap-2 ${
//               normalize ? "bg-emerald-700/40" : "bg-slate-700/40"
//             }`}
//             title="Toggle 0–1 normalization"
//           >
//             {normalize ? "Normalized 0–1" : "Raw scale"}
//           </Button>

//           <Button
//             onClick={handleReset}
//             variant="outline"
//             size="sm"
//             className="gap-2"
//           >
//             <RotateCcw className="w-4 h-4" />
//             Reset
//           </Button>
//         </div>
//       </div>

//       {/* Interpolation Controls */}
//       <div className="px-6 pt-3 pb-2 border-b border-gray-700/50 shrink-0 flex flex-wrap items-center gap-3">
//         <div className="text-sm text-gray-300 font-medium">Smoothing</div>
//         <div className="flex items-center gap-2">
//           <Button
//             size="sm"
//             variant={interpMode === "none" ? "default" : "secondary"}
//             onClick={() => setInterpMode("none")}
//           >
//             Off
//           </Button>
//           <Button
//             size="sm"
//             variant={interpMode === "linear" ? "default" : "secondary"}
//             onClick={() => setInterpMode("linear")}
//           >
//             Linear
//           </Button>
//           <Button
//             size="sm"
//             variant={interpMode === "catmullRom" ? "default" : "secondary"}
//             onClick={() => setInterpMode("catmullRom")}
//           >
//             Spline
//           </Button>
//         </div>
//         <div className="flex items-center gap-3 w-72">
//           <span className="text-xs text-gray-400 whitespace-nowrap">
//             Smoothness
//           </span>
//           <Slider
//             value={[smoothness]}
//             onValueChange={([v]) => setSmoothness(Math.max(1, v))}
//             min={1}
//             max={20}
//             step={1}
//           />
//           <span className="text-xs text-gray-400 w-6 text-right">
//             {smoothness}
//           </span>
//         </div>
//       </div>

//       {/* Statistics Cards */}
//       <div className="px-6 py-3 grid grid-cols-3 gap-3 border-b border-gray-700/50 shrink-0">
//         <div className="bg-gradient-to-br from-blue-600/20 to-blue-700/20 border border-blue-500/30 rounded-lg px-4 py-2">
//           <div className="text-xs text-blue-300 font-medium">Channel 1 Avg</div>
//           <div className="text-2xl font-bold text-blue-100">{stats.ch1}</div>
//         </div>
//         <div className="bg-gradient-to-br from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-lg px-4 py-2">
//           <div className="text-xs text-purple-300 font-medium">
//             Channel 2 Avg
//           </div>
//           <div className="text-2xl font-bold text-purple-100">{stats.ch2}</div>
//         </div>
//         <div className="bg-gradient-to-br from-pink-600/20 to-pink-700/20 border border-pink-500/30 rounded-lg px-4 py-2">
//           <div className="text-xs text-pink-300 font-medium">Channel 3 Avg</div>
//           <div className="text-2xl font-bold text-pink-100">{stats.ch3}</div>
//         </div>
//       </div>

//       {/* Main content */}
//       <div className="flex-1 flex gap-4 p-4 min-h-0">
//         {/* 3D View */}
//         <div className="flex-[2] bg-gray-900/50 backdrop-blur rounded-lg overflow-hidden min-w-0 border border-gray-700/50">
//           <Canvas camera={{ position: [40, 30, 40], fov: 60 }}>
//             <PlayheadAnimator
//               isPlaying={isPlaying}
//               maxIndex={maxIndex}
//               playHeadRef={playHeadRef}
//               currentIndex={currentIndex}
//               onStep={updateVisibleWindow}
//             />
//             <ambientLight intensity={0.6} />
//             <pointLight position={[20, 20, 20]} intensity={0.8} />
//             <pointLight
//               position={[-20, -20, -20]}
//               intensity={0.4}
//               color="#4a9eff"
//             />
//             {visibleData.length > 0 && (
//               <>
//                 <SensorTrajectory
//                   data={visibleData}
//                   onHover={handleHover}
//                   interpMode={interpMode}
//                   smoothness={smoothness}
//                 />
//                 <Tooltip data={hoverData} position={hoverPos} />
//               </>
//             )}
//             <OrbitControls enableDamping dampingFactor={0.05} />
//             <gridHelper args={[100, 20, "#444", "#222"]} />
//           </Canvas>
//         </div>

//         {/* Cross-sections */}
//         <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">
//           <CrossSection
//             data={visibleData}
//             plane="ch1ch2"
//             title="Channel 1 vs Channel 2"
//             interpMode={interpMode}
//             smoothness={smoothness}
//           />
//           <CrossSection
//             data={visibleData}
//             plane="ch1ch3"
//             title="Channel 1 vs Channel 3"
//             interpMode={interpMode}
//             smoothness={smoothness}
//           />
//           <CrossSection
//             data={visibleData}
//             plane="ch2ch3"
//             title="Channel 2 vs Channel 3"
//             interpMode={interpMode}
//             smoothness={smoothness}
//           />
//         </div>
//       </div>

//       {/* Timeline Controls */}
//       <div className="px-6 py-4 border-t border-gray-700/50 shrink-0">
//         <div className="flex items-center gap-4">
//           <span className="text-sm text-gray-400 whitespace-nowrap w-32">
//             Sample: {Math.max(0, currentIndex)}
//           </span>
//           <Slider
//             value={[Math.max(0, currentIndex)]}
//             onValueChange={([val]) => handleScrub(val)}
//             max={maxIndex}
//             step={1}
//             disabled={maxIndex === 0}
//             className="flex-1"
//           />
//           <span className="text-sm text-gray-400 whitespace-nowrap w-56 text-right">
//             {totalCount} total points (showing up to {WINDOW_SIZE})
//           </span>
//         </div>
//       </div>
//     </div>
//   );
// }
