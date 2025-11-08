"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Info, RotateCcw } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { toast } from "sonner";

interface ChannelMap {
  [key: string]: number;
  t?: number;
}

interface Recording {
  id: string;
  name: string;
  timestamp: number;
  data: ChannelMap[];
  duration: number;
  parameters?: any;
}

interface FeatureInfo {
  name: string;
  coefficient: number;
  active: boolean;
}

// NOTE: Keeping the original shape to minimize downstream changes
interface SindyTrainResponse {
  runId: string;
  metrics: {
    mse: number;
    r2: number;
    sparsity: number;
    activeFeatures?: number;
    totalFeatures?: number;
  };
  equations: string[];
  prediction: ChannelMap[];
  features?: FeatureInfo[][];
}

type ModelKind = "sindy" | "rc";

const API_BASE = "http://localhost:8000";

const loadRecordings = (): Recording[] => {
  try {
    const stored = localStorage.getItem("nld_recordings");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

function pretty(num?: number, d = 4) {
  if (num === undefined || Number.isNaN(num)) return "–";
  return Number(num).toFixed(d);
}

// --- normalize and scale so trajectories are visible ---
function useTrajectory(points: ChannelMap[] | undefined, scale = 1) {
  return useMemo(() => {
    if (!points || points.length === 0) return [] as THREE.Vector3[];

    const xs = points.map((p) => p.x ?? 0);
    const ys = points.map((p) => p.y ?? 0);
    const zs = points.map((p) => p.z ?? 0);

    const mx = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const my = ys.reduce((a, b) => a + b, 0) / (ys.length || 1);
    const mz = zs.reduce((a, b) => a + b, 0) / (zs.length || 1);

    const maxAbs = Math.max(
      ...xs.map((v) => Math.abs(v - mx)),
      ...ys.map((v) => Math.abs(v - my)),
      ...zs.map((v) => Math.abs(v - mz)),
      1
    );
    const s = (1 / maxAbs) * scale * 10; // fit nicely within the grid

    return points.map(
      (p) =>
        new THREE.Vector3(
          ((p.x ?? 0) - mx) * s,
          ((p.y ?? 0) - my) * s,
          ((p.z ?? 0) - mz) * s
        )
    );
  }, [points, scale]);
}

function TrajectoryOverlay({
  real,
  pred,
  scale,
  showReal,
  showPred,
}: {
  real?: ChannelMap[];
  pred?: ChannelMap[];
  scale: number;
  showReal: boolean;
  showPred: boolean;
}) {
  const realPts = useTrajectory(real, scale);
  const predPts = useTrajectory(pred, scale);

  const realEndPoint = realPts.length > 0 ? realPts[realPts.length - 1] : null;
  const predEndPoint = predPts.length > 0 ? predPts[predPts.length - 1] : null;

  return (
    <>
      {showReal && realPts.length > 1 && (
        <>
          {/* FIX: lineWidth prop */}
          <Line points={realPts} lineWidth={3} color="#60a5fa" />
          {realEndPoint && (
            <mesh position={[realEndPoint.x, realEndPoint.y, realEndPoint.z]}>
              <sphereGeometry args={[0.3, 16, 16]} />
              <meshStandardMaterial
                color="#60a5fa"
                emissive="#60a5fa"
                emissiveIntensity={0.5}
              />
            </mesh>
          )}
        </>
      )}
      {showPred && predPts.length > 1 && (
        <>
          <Line points={predPts} lineWidth={3} color="#f97316" />
          {predEndPoint && (
            <mesh position={[predEndPoint.x, predEndPoint.y, predEndPoint.z]}>
              <sphereGeometry args={[0.3, 16, 16]} />
              <meshStandardMaterial
                color="#f97316"
                emissive="#f97316"
                emissiveIntensity={0.5}
              />
            </mesh>
          )}
        </>
      )}
    </>
  );
}

function FeatureMatrix({ features }: { features?: FeatureInfo[][] }) {
  if (!features || features.length === 0) return null;

  const varNames = ["x", "y", "z"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">✨ Discovered Features</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {features.map((eqFeatures, eqIdx) => (
            <div key={eqIdx} className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">
                d{varNames[eqIdx]}/dt
              </div>
              <div className="flex flex-wrap gap-2">
                {eqFeatures.map((feat, fIdx) => {
                  const absCoef = Math.abs(feat.coefficient);
                  const intensity = feat.active
                    ? Math.min(absCoef * 0.3, 1)
                    : 0;
                  const bgColor = feat.active
                    ? feat.coefficient > 0
                      ? `rgba(34, 197, 94, ${0.2 + intensity * 0.6})`
                      : `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`
                    : "rgba(100, 116, 139, 0.15)";
                  const textColor = feat.active
                    ? feat.coefficient > 0
                      ? "text-green-700"
                      : "text-red-700"
                    : "text-slate-400";

                  return (
                    <div
                      key={fIdx}
                      className={`px-3 py-2 rounded-lg border transition-all ${
                        feat.active
                          ? "border-current shadow-sm"
                          : "border-slate-200"
                      }`}
                      style={{ backgroundColor: bgColor }}
                    >
                      <div className="text-xs font-mono space-y-0.5">
                        <div className={`font-semibold ${textColor}`}>
                          {feat.name}
                        </div>
                        {feat.active && (
                          <div className={`${textColor} opacity-80`}>
                            {feat.coefficient >= 0 ? "+" : ""}
                            {feat.coefficient.toFixed(3)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricsPanel({
  metrics,
  equations,
}: {
  metrics?: SindyTrainResponse["metrics"];
  equations?: string[];
}) {
  if (!metrics && (!equations || equations.length === 0)) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fit Metrics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-muted-foreground">MSE</div>
            <div className="font-mono">{pretty(metrics?.mse, 6)}</div>
            <div className="text-muted-foreground">R²</div>
            <div className="font-mono">{pretty(metrics?.r2, 4)}</div>
            <div className="text-muted-foreground">Sparsity</div>
            <div className="font-mono">{pretty(metrics?.sparsity, 4)}</div>
          </div>
          {metrics?.activeFeatures !== undefined && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-1">
                Feature Usage
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                    style={{
                      width: `${
                        ((metrics.activeFeatures || 0) /
                          (metrics.totalFeatures || 1)) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <div className="text-xs font-mono">
                  {metrics.activeFeatures}/{metrics.totalFeatures}
                </div>
              </div>
            </div>
          )}
          {metrics?.r2 !== undefined && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground mb-2">Quality</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-green-500">
                  <div
                    className="h-full bg-white/30"
                    style={{
                      width: `${Math.max(
                        0,
                        (1 - Math.max(0, metrics.r2)) * 100
                      )}%`,
                      marginLeft: "auto",
                    }}
                  />
                </div>
                <div className="text-xs font-mono">
                  {metrics.r2 > 0.95
                    ? "⭐ Excellent"
                    : metrics.r2 > 0.85
                    ? "✓ Good"
                    : metrics.r2 > 0.7
                    ? "○ Fair"
                    : "× Poor"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">📐 Learned Equations</CardTitle>
        </CardHeader>
        <CardContent>
          {equations && equations.length > 0 ? (
            <div className="space-y-1">
              {equations.map((eq, i) => (
                <pre
                  key={i}
                  className="text-xs md:text-sm font-mono whitespace-pre-wrap bg-muted p-2 rounded-lg overflow-x-auto"
                >
                  {eq}
                </pre>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No equations available.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TrainView() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string>("");
  const [selected, setSelected] = useState<Recording | undefined>();
  const [isTraining, setIsTraining] = useState(false);
  const [runId, setRunId] = useState<string>("");
  const [scale, setScale] = useState(1);
  const [showReal, setShowReal] = useState(true);
  const [showPred, setShowPred] = useState(true);
  const [response, setResponse] = useState<SindyTrainResponse | null>(null);
  const [cameraDist, setCameraDist] = useState(30);
  const [xKey, setXKey] = useState("x");
  const [yKey, setYKey] = useState("y");
  const [zKey, setZKey] = useState("z");
  const [animationProgress, setAnimationProgress] = useState(100);
  const [isAnimating, setIsAnimating] = useState(false);
  const [modelKind, setModelKind] = useState<ModelKind>("rc"); // NEW: model selector

  const modelLabel = modelKind === "sindy" ? "SINDy" : "Reservoir";

  useEffect(() => {
    const loaded = loadRecordings();
    setRecordings(loaded);
    if (loaded.length > 0) setSelectedRecordingId(loaded[0].id);
  }, []);

  useEffect(() => {
    const rec = recordings.find((r) => r.id === selectedRecordingId);
    setSelected(rec);
    // auto-pick axis keys found in the data
    if (rec) {
      const keys = Object.keys(rec.data?.[0] || {}).filter(
        (k) => k !== "t" && k !== "index"
      );
      if (keys.length >= 3) {
        setXKey(keys[0]);
        setYKey(keys[1]);
        setZKey(keys[2]);
      }
    }
  }, [recordings, selectedRecordingId]);

  const availableKeys = useMemo(() => {
    if (!selected) return ["x", "y", "z"];
    const keys = Object.keys(selected.data?.[0] || {}).filter(
      (k) => k !== "t" && k !== "index"
    );
    return keys.length ? keys : ["x", "y", "z"];
  }, [selected]);

  const realTraj = useMemo(() => {
    if (!selected) return [] as ChannelMap[];
    return selected.data.map((d, i) => ({
      x: d[xKey] ?? 0,
      y: d[yKey] ?? 0,
      z: d[zKey] ?? 0,
      t: d.t ?? i,
    }));
  }, [selected, xKey, yKey, zKey]);

  const predTraj = useMemo(() => {
    if (!response?.prediction) return [] as ChannelMap[];
    return response.prediction.map((d, i) => {
      const anyD = d as any;
      const pick = (k: string) =>
        anyD[k] ?? anyD[`${k}hat`] ?? anyD[`${k}_pred`] ?? 0;
      return { x: pick(xKey), y: pick(yKey), z: pick(zKey), t: d.t ?? i };
    });
  }, [response, xKey, yKey, zKey]);

  const realTrajSliced = useMemo(() => {
    const idx = Math.floor((animationProgress / 100) * realTraj.length);
    return realTraj.slice(0, Math.max(1, idx));
  }, [realTraj, animationProgress]);

  const predTrajSliced = useMemo(() => {
    const idx = Math.floor((animationProgress / 100) * predTraj.length);
    return predTraj.slice(0, Math.max(1, idx));
  }, [predTraj, animationProgress]);

  useEffect(() => {
    if (!isAnimating) return;

    const interval = setInterval(() => {
      setAnimationProgress((prev) => {
        if (prev >= 100) {
          setIsAnimating(false);
          return 100;
        }
        return prev + 0.5;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [isAnimating]);

  function startAnimation() {
    setAnimationProgress(0);
    setIsAnimating(true);
  }

  function stopAnimation() {
    setIsAnimating(false);
  }

  function resetAnimation() {
    setAnimationProgress(100);
    setIsAnimating(false);
  }

  async function trainOnBackend() {
    if (!selected) return;
    setIsTraining(true);
    setRunId("");
    setResponse(null);

    try {
      const res = await fetch(`${API_BASE}/api/${modelKind}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recording: selected,
          axes: { xKey, yKey, zKey },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const data: SindyTrainResponse = await res.json();

      setRunId(data.runId);
      setResponse(data);

      toast.success(`${modelLabel} training complete`, {
        description: `Run ${data.runId.slice(0, 8)} – R²=${pretty(
          data.metrics?.r2
        )}`,
      });
    } catch (err: any) {
      toast.error("Training failed", {
        description: String(err?.message || err),
      });
    } finally {
      setIsTraining(false);
    }
  }

  async function refreshRun() {
    if (!runId) return;
    try {
      const res = await fetch(`${API_BASE}/api/${modelKind}/run/${runId}`);
      if (res.ok) {
        const data: SindyTrainResponse = await res.json();
        setResponse(data);
      }
    } catch {}
  }

  const canAnimate = realTraj.length > 1 || predTraj.length > 1;

  return (
    <ScrollArea className="h-screen">
      <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-1">
              <span>Train Model on Recording</span>
              <span className="text-sm text-muted-foreground font-normal">
                Learn dynamics via SINDy or Reservoir Computing
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recordings.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <AlertCircle className="w-12 h-12 mx-auto text-yellow-500" />
                <p className="text-lg font-semibold">No Recordings Found</p>
                <p className="text-sm text-muted-foreground">
                  Record some data first using the capture interface
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Select Recording</Label>
                    <Select
                      value={selectedRecordingId}
                      onValueChange={setSelectedRecordingId}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {recordings.map((rec) => (
                          <SelectItem key={rec.id} value={rec.id}>
                            {rec.name} • {rec.duration.toFixed(1)}s •{" "}
                            {rec.data.length} pts
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* NEW: Model selector */}
                  <div>
                    <Label>Model</Label>
                    <Select
                      value={modelKind}
                      onValueChange={(v: ModelKind) => setModelKind(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rc">Reservoir (RC)</SelectItem>
                        <SelectItem value="sindy">SINDy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: xKey, set: setXKey, label: "X" },
                      { key: yKey, set: setYKey, label: "Y" },
                      { key: zKey, set: setZKey, label: "Z" },
                    ].map(({ key, set, label }) => (
                      <div key={label}>
                        <Label>{label}</Label>
                        <Select value={key} onValueChange={set}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableKeys.map((k) => (
                              <SelectItem key={k} value={k}>
                                {k}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end gap-2 md:col-span-3">
                    <Button
                      className="w-full"
                      onClick={trainOnBackend}
                      disabled={isTraining || !selected}
                    >
                      {isTraining ? "Training..." : `Train ${modelLabel}`}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={refreshRun}
                      disabled={!runId}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {selected && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg text-xs">
                    <div>
                      <p className="font-semibold mb-1">Recording Info</p>
                      <p>Samples: {selected.data.length}</p>
                      <p>Duration: {selected.duration.toFixed(2)}s</p>
                      <p>
                        Date: {new Date(selected.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {selected.parameters && (
                      <div>
                        <p className="font-semibold mb-1">Parameters</p>
                        {Object.entries(selected.parameters).map(([k, v]) => (
                          <p key={k}>
                            {k}:{" "}
                            {typeof v === "number" ? v.toFixed(3) : String(v)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="overlay">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overlay">3D View</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="raw">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="overlay" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <span>Real vs Prediction</span>
                  <div className="flex gap-2">
                    <Badge
                      variant={showReal ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => setShowReal((s) => !s)}
                    >
                      real
                    </Badge>
                    <Badge
                      variant={showPred ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => setShowPred((s) => !s)}
                    >
                      {modelLabel.toLowerCase()}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-blue-500 rounded"></div>
                          <span className="text-muted-foreground">Real</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1 bg-orange-500 rounded"></div>
                          <span className="text-muted-foreground">
                            {modelLabel} Prediction
                          </span>
                        </div>
                      </div>
                      {response && (
                        <div className="text-xs font-mono text-muted-foreground">
                          R² = {pretty(response.metrics?.r2, 3)}
                        </div>
                      )}
                    </div>
                    <div className="w-full h-[380px] md:h-[520px] bg-black rounded-lg overflow-hidden">
                      <Canvas
                        camera={{
                          position: [cameraDist, cameraDist, cameraDist],
                          fov: 60,
                        }}
                      >
                        <ambientLight intensity={0.6} />
                        <pointLight position={[20, 20, 20]} intensity={0.8} />
                        <TrajectoryOverlay
                          real={realTrajSliced}
                          pred={predTrajSliced}
                          scale={scale}
                          showReal={showReal}
                          showPred={showPred}
                        />
                        <OrbitControls enableDamping dampingFactor={0.05} />
                        <gridHelper args={[50, 20, "#333", "#111"]} />
                        <axesHelper args={[25]} />
                      </Canvas>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Scale: {scale.toFixed(1)}×</Label>
                      <Slider
                        value={[scale]}
                        onValueChange={(v) => setScale(v[0])}
                        min={0.1}
                        max={5}
                        step={0.1}
                      />
                    </div>
                    <div>
                      <Label>Camera Distance: {cameraDist}</Label>
                      <Slider
                        value={[cameraDist]}
                        onValueChange={(v) => setCameraDist(v[0])}
                        min={10}
                        max={120}
                        step={5}
                      />
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label>
                          Animation Progress: {animationProgress.toFixed(0)}%
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {Math.floor(
                            (animationProgress / 100) * realTraj.length
                          )}{" "}
                          {"/"} {realTraj.length} points
                        </span>
                      </div>
                      <Slider
                        value={[animationProgress]}
                        onValueChange={(v) => {
                          setAnimationProgress(v[0]);
                          setIsAnimating(false);
                        }}
                        min={0}
                        max={100}
                        step={0.1}
                        disabled={isAnimating}
                      />
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant={isAnimating ? "secondary" : "default"}
                          onClick={isAnimating ? stopAnimation : startAnimation}
                          className="flex-1"
                          disabled={!canAnimate}
                        >
                          {isAnimating ? "⏸ Pause" : "▶ Play"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={resetAnimation}
                          className="flex-1"
                        >
                          ↻ Reset
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border bg-blue-500/10 text-xs">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 mt-0.5" />
                        <div>
                          <p className="font-semibold">Controls</p>
                          <ul className="list-disc list-inside">
                            <li>Drag to orbit</li>
                            <li>Scroll to zoom</li>
                            <li>Right-drag to pan</li>
                            <li>Animate to see fit</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <MetricsPanel
              metrics={response?.metrics}
              equations={response?.equations}
            />

            {response && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Trajectory Comparison
                  </CardTitle>
                </CardHeader>
                {/* <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {["x", "y", "z"].map((axis) => {
                      const realVals = realTraj.map(
                        (p) => (p[axis as keyof ChannelMap] as number) ?? 0
                      );
                      const predVals = predTraj.map(
                        (p) => (p[axis as keyof ChannelMap] as number) ?? 0
                      );
                      const times = realTraj.map((p) => p.t || 0);

                      const maxTimeRaw = times.length ? Math.max(...times) : 0;
                      const maxTime = maxTimeRaw > 0 ? maxTimeRaw : 1;
                      const finiteVals = [...realVals, ...predVals].filter(
                        (v) => Number.isFinite(v)
                      );
                      const minVal = finiteVals.length
                        ? Math.min(...finiteVals)
                        : 0;
                      const maxVal = finiteVals.length
                        ? Math.max(...finiteVals)
                        : 1;
                      const span = maxVal - minVal;
                      const range =
                        Number.isFinite(span) && span > 0 ? span : 1;

                      return (
                        <div key={axis} className="space-y-2">
                          <div className="text-xs font-semibold text-center text-muted-foreground uppercase">
                            {axis} vs time
                          </div>
                          <div className="relative h-32 bg-muted rounded-lg overflow-hidden">
                            <svg
                              viewBox="0 0 100 100"
                              className="absolute inset-0 w-full h-full"
                            >
                              <polyline
                                points={realVals
                                  .map((v, i) => {
                                    const minTimeRaw = times.length
                                      ? Math.min(...times)
                                      : 0;
                                    const maxTimeRaw = times.length
                                      ? Math.max(...times)
                                      : 1;
                                    const tDomain = Math.max(
                                      1e-9,
                                      maxTimeRaw - minTimeRaw
                                    );
                                    const x =
                                      ((times[i] - minTimeRaw) / tDomain) * 100; // 0..100 user units
                                    const y =
                                      100 - ((v - minVal) / range) * 90 - 5; // 5..95 padding
                                    return `${x},${y}`;
                                  })
                                  .join(" ")}
                                fill="none"
                                stroke="#60a5fa"
                                strokeWidth={2}
                              />
                              <polyline
                                points={predVals
                                  .map((v, i) => {
                                    const minTimeRaw = times.length
                                      ? Math.min(...times)
                                      : 0;
                                    const maxTimeRaw = times.length
                                      ? Math.max(...times)
                                      : 1;
                                    const tDomain = Math.max(
                                      1e-9,
                                      maxTimeRaw - minTimeRaw
                                    );
                                    const x =
                                      ((times[i] - minTimeRaw) / tDomain) * 100;
                                    const y =
                                      100 - ((v - minVal) / range) * 90 - 5;
                                    return `${x},${y}`;
                                  })
                                  .join(" ")}
                                fill="none"
                                stroke="#f97316"
                                strokeWidth={2}
                                strokeDasharray="4,2"
                              />
                            </svg>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{minVal.toFixed(2)}</span>
                            <span>{maxVal.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-blue-500"></div>
                      <span>Real Data</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-0.5 bg-orange-500"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(90deg, #f97316, #f97316 4px, transparent 4px, transparent 6px)",
                        }}
                      ></div>
                      <span>{modelLabel} Prediction</span>
                    </div>
                  </div>
                </CardContent> */}
              </Card>
            )}
          </TabsContent>

          <TabsContent value="features">
            {/* Features are only produced by SINDy; RC may not return features */}
            <FeatureMatrix features={response?.features} />
          </TabsContent>

          <TabsContent value="metrics">
            <MetricsPanel
              metrics={response?.metrics}
              equations={response?.equations}
            />
          </TabsContent>

          <TabsContent value="raw">
            <Card>
              <CardHeader>
                <CardTitle>Raw JSON Response</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-3 rounded-lg overflow-x-auto max-h-96">
                  {JSON.stringify(response, null, 2) || "(no data yet)"}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
