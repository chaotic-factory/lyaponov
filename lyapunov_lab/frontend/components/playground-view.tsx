// @ts-nocheck

"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import { ScrollArea } from "./ui/scroll-area";

const WS_URL =
  process.env.WEBSOCKET_ENDPOINT || "ws://localhost:8000/api/stream";

// const WS_URL = "ws://localhost:8000/stream";

// --------------------
// Types
// --------------------
type ChannelMap = Record<string, number>;

interface WSMessage {
  timestamp?: number;
  samples?: ChannelMap[];
}

// --------------------
// Shared WebSocket Hook
// --------------------
function useSharedXYZData({
  wsUrl = WS_URL,
  sampleDt = 0.01,
  bufferSize = 1000,
}: {
  wsUrl?: string;
  sampleDt?: number;
  bufferSize?: number;
}) {
  const [data, setData] = useState<ChannelMap[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.error("WebSocket init failed:", err);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        console.log("🟢 Connected to", wsUrl);
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log("🔴 Disconnected");
        setIsConnected(false);
        scheduleReconnect();
      };

      ws.onerror = (e) => {
        console.error("WS error:", e);
        ws?.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          const pktTs = msg.timestamp ?? Date.now() / 1000;
          const samples = msg.samples ?? [];
          if (!Array.isArray(samples) || samples.length === 0) return;

          const n = samples.length;
          const baseT = pktTs - (n - 1) * sampleDt;

          const newData = samples.map((samp, i) => ({
            t: baseT + i * sampleDt,
            ...samp,
          }));

          setData((prev) => {
            const merged = [...prev, ...newData];
            return merged.slice(Math.max(0, merged.length - bufferSize));
          });
        } catch (err) {
          console.error("Parse error:", err);
        }
      };
    };

    const scheduleReconnect = () => {
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    };

    connect();
    return () => {
      active = false;
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [wsUrl, sampleDt, bufferSize]);

  return { data, isConnected };
}

// --------------------
// 2D Canvas Visualizer
// --------------------
function XYZVisualizerCanvas({
  data,
  isConnected,
  visibleChannels,
  setVisibleChannels,
}: {
  data: ChannelMap[];
  isConnected: boolean;
  visibleChannels: Record<string, boolean>;
  setVisibleChannels: (v: Record<string, boolean>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const channelNames = ["x", "y", "z"];

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 300;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#1c1e22";
    ctx.fillRect(0, 0, width, height);

    if (data.length < 2) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px Inter";
      ctx.textAlign = "center";
      ctx.fillText(
        isConnected ? "Waiting for data..." : "Connecting...",
        width / 2,
        height / 2
      );
      return;
    }

    const padding = { top: 20, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    let minVal = Infinity,
      maxVal = -Infinity;
    data.forEach((d) => {
      channelNames.forEach((ch) => {
        if (visibleChannels[ch] && d[ch] !== undefined) {
          minVal = Math.min(minVal, d[ch]);
          maxVal = Math.max(maxVal, d[ch]);
        }
      });
    });

    if (minVal === Infinity || maxVal === -Infinity) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px Inter";
      ctx.textAlign = "center";
      ctx.fillText("No channels selected", width / 2, height / 2);
      return;
    }

    const scaleX = chartW / Math.max(data.length - 1, 1);
    const scaleY = chartH / (maxVal - minVal || 1);

    ctx.strokeStyle = "#22252a";
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const colors = ["#2563eb", "#22c55e", "#9333ea"];
    channelNames.forEach((ch, i) => {
      if (!visibleChannels[ch]) return;
      ctx.strokeStyle = colors[i % colors.length];
      ctx.beginPath();
      data.forEach((d, j) => {
        const val = d[ch];
        if (val === undefined) return;
        const x = padding.left + j * scaleX;
        const y = height - padding.bottom - (val - minVal) * scaleY;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.strokeStyle = "#64748b";
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = minVal + ((maxVal - minVal) / 5) * (5 - i);
      const y = padding.top + (chartH / 5) * i;
      ctx.fillText(val.toFixed(2), padding.left - 8, y + 4);
    }

    ctx.textAlign = "center";
    ctx.fillText("Time (samples)", width / 2, height - 10);
  }, [data, visibleChannels, isConnected]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Live XYZ Visualizer (2D)</span>
          <span className="text-xs font-mono text-muted-foreground">
            {isConnected ? "🟢 Connected" : "🔴 Disconnected"} | {data.length}{" "}
            pts
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Channel toggles */}
        <div className="flex gap-2 mb-2">
          {channelNames.map((ch) => (
            <Button
              key={ch}
              size="sm"
              variant={visibleChannels[ch] ? "default" : "outline"}
              onClick={() =>
                setVisibleChannels({
                  ...visibleChannels,
                  [ch]: !visibleChannels[ch],
                })
              }
            >
              {visibleChannels[ch] ? `Hide ${ch}` : `Show ${ch}`}
            </Button>
          ))}
        </div>

        <div ref={containerRef} className="w-full">
          <canvas ref={canvasRef} className="w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------
// 3D Phase Space Visualizer
// --------------------
function Trajectory({
  data,
  scale,
  interpolation,
  visibleChannels,
}: {
  data: ChannelMap[];
  scale: number;
  interpolation: "none" | "linear" | "spline";
  visibleChannels: Record<string, boolean>;
}) {
  const points = useMemo(() => {
    if (data.length < 2) return [];

    const recent = data.slice(-1000);

    // fallback to 0 if channel is disabled
    const xs = recent.map((p) => (visibleChannels.x ? p.x ?? 0 : 0));
    const ys = recent.map((p) => (visibleChannels.y ? p.y ?? 0 : 0));
    const zs = recent.map((p) => (visibleChannels.z ? p.z ?? 0 : 0));

    const clipMax = 4000;
    const clip = (v: number) => Math.max(-clipMax, Math.min(clipMax, v));

    const minX = Math.min(...xs.map(clip));
    const maxX = Math.max(...xs.map(clip));
    const minY = Math.min(...ys.map(clip));
    const maxY = Math.max(...ys.map(clip));
    const minZ = Math.min(...zs.map(clip));
    const maxZ = Math.max(...zs.map(clip));

    const scaleFn = (v: number, min: number, max: number) =>
      ((clip(v) - min) / (max - min || 1) - 0.5) * 100 * scale;

    const basePoints = recent.map(
      (_, i) =>
        new THREE.Vector3(
          scaleFn(xs[i], minX, maxX),
          scaleFn(ys[i], minY, maxY),
          scaleFn(zs[i], minZ, maxZ)
        )
    );

    if (interpolation === "none" || basePoints.length < 4) return basePoints;
    if (interpolation === "linear") {
      const interp: THREE.Vector3[] = [];
      for (let i = 0; i < basePoints.length - 1; i++) {
        const a = basePoints[i];
        const b = basePoints[i + 1];
        for (let t = 0; t <= 1; t += 0.2) {
          interp.push(
            new THREE.Vector3(
              a.x + (b.x - a.x) * t,
              a.y + (b.y - a.y) * t,
              a.z + (b.z - a.z) * t
            )
          );
        }
      }
      return interp;
    }

    if (interpolation === "spline") {
      const curve = new THREE.CatmullRomCurve3(basePoints);
      return curve.getPoints(basePoints.length * 5);
    }

    return basePoints;
  }, [data, scale, interpolation, visibleChannels]);

  if (points.length < 2) return null;

  const colors = points.map((_, i) => {
    const t = i / Math.max(points.length - 1, 1);
    return new THREE.Color().setHSL(0.6 - t * 0.4, 0.8, 0.5);
  });

  // @ts-ignore
  return (
    <>
      <Line points={points} vertexColors={colors} lineWidth={2} />
      <mesh position={points[points.length - 1]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#fce482" />
      </mesh>
    </>
  );
}

function PhaseSpaceView({
  data,
  isConnected,
  visibleChannels,
  setVisibleChannels,
}: {
  data: ChannelMap[];
  isConnected: boolean;
  visibleChannels: Record<string, boolean>;
  setVisibleChannels: (v: Record<string, boolean>) => void;
}) {
  const [scale, setScale] = useState(1);
  const [interpolation, setInterpolation] = useState<
    "none" | "linear" | "spline"
  >("none");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Phase Space / Attractor (3D)</span>
          <span className="text-xs font-mono text-muted-foreground">
            {isConnected ? "🟢 Connected" : "🔴 Disconnected"} | {data.length}{" "}
            pts
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Channel toggles */}
        <div className="flex gap-2 mb-3">
          {["x", "y", "z"].map((ch) => (
            <Button
              key={ch}
              size="sm"
              variant={visibleChannels[ch] ? "default" : "outline"}
              onClick={() =>
                setVisibleChannels({
                  ...visibleChannels,
                  [ch]: !visibleChannels[ch],
                })
              }
            >
              {visibleChannels[ch] ? `Hide ${ch}` : `Show ${ch}`}
            </Button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <label>Scale:</label>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
            />
            <span>{scale.toFixed(1)}×</span>
          </div>

          <div className="flex items-center gap-2">
            <label>Interpolation:</label>
            <select
              value={interpolation}
              onChange={(e) =>
                setInterpolation(e.target.value as "none" | "linear" | "spline")
              }
              className="border rounded-md px-2 py-1 bg-background"
            >
              <option value="none">None</option>
              <option value="linear">Linear</option>
              <option value="spline">Spline</option>
            </select>
          </div>
        </div>

        {/* 3D Canvas */}
        <div className="h-[400px] w-full bg-secondary/30 rounded-lg overflow-hidden">
          {data.length > 0 ? (
            <Canvas camera={{ position: [40, 40, 40], fov: 60 }}>
              <ambientLight intensity={0.6} />
              <pointLight position={[10, 10, 10]} intensity={0.8} />
              <Trajectory
                data={data}
                scale={scale}
                interpolation={interpolation}
                visibleChannels={visibleChannels}
              />
              <OrbitControls enableDamping dampingFactor={0.05} />
              <gridHelper args={[200, 20, "#64748b", "#22252a"]} />
              <axesHelper args={[100]} />
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {isConnected ? "Waiting for data..." : "Connecting..."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------
// Main Page
// --------------------
export function PlaygroundView() {
  const { data, isConnected } = useSharedXYZData({
    wsUrl: WS_URL,
    bufferSize: 1000,
  });

  const [visibleChannels, setVisibleChannels] = useState({
    x: true,
    y: true,
    z: true,
  });

  return (
    <div>
      <ScrollArea className="flex flex-col gap-8 p-4">
        <XYZVisualizerCanvas
          data={data}
          isConnected={isConnected}
          visibleChannels={visibleChannels}
          setVisibleChannels={setVisibleChannels}
        />
        <PhaseSpaceView
          data={data}
          isConnected={isConnected}
          visibleChannels={visibleChannels}
          setVisibleChannels={setVisibleChannels}
        />
      </ScrollArea>
    </div>
  );
}
