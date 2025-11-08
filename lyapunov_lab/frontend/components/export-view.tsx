import React, { useState, useEffect, useMemo, useRef } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AlertCircle, Info } from "lucide-react";

// ==================== TYPES ====================
interface ChannelMap {
  [key: string]: number;
  t?: number;
}

interface SystemParameters {
  [key: string]: number;
}

interface Recording {
  id: string;
  name: string;
  timestamp: number;
  data: ChannelMap[];
  duration: number;
  parameters?: SystemParameters;
  initialState?: { x: number; y: number; z: number };
}

// ==================== LOAD RECORDINGS ====================
const loadRecordings = (): Recording[] => {
  try {
    const stored = localStorage.getItem("nld_recordings");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// ==================== POINCARE MAP FROM REAL DATA ====================
const computePoincareFromData = (
  data: ChannelMap[],
  options: {
    section: "x" | "y" | "z";
    sectionValue: number;
    crossingDirection: "positive" | "negative" | "both";
    transient: number;
  }
) => {
  const { section, sectionValue, crossingDirection, transient } = options;
  const points: ChannelMap[] = [];

  if (data.length < 2) return points;

  let lastValue = data[0][section] ?? 0;

  for (let i = 1; i < data.length; i++) {
    if (i < transient) continue;

    const currentValue = data[i][section] ?? 0;
    const crossed =
      (lastValue < sectionValue && currentValue >= sectionValue) ||
      (lastValue > sectionValue && currentValue <= sectionValue);

    if (crossed) {
      const crossingPositive = currentValue >= sectionValue;
      const shouldRecord =
        crossingDirection === "both" ||
        (crossingDirection === "positive" && crossingPositive) ||
        (crossingDirection === "negative" && !crossingPositive);

      if (shouldRecord) {
        // Record the point at crossing
        points.push({
          x: data[i].x ?? 0,
          y: data[i].y ?? 0,
          z: data[i].z ?? 0,
          t: data[i].t ?? i,
          index: i,
        });
      }
    }

    lastValue = currentValue;
  }

  return points;
};

// ==================== BIFURCATION DIAGRAM FROM REAL DATA ====================
const computeBifurcationFromData = (
  data: ChannelMap[],
  options: {
    parameterKey: string;
    observableKey: string;
    numBins: number;
    transient: number;
  }
) => {
  const { parameterKey, observableKey, numBins, transient } = options;

  // Extract parameter and observable values after transient
  const values = data.slice(transient).map((d) => ({
    param: d[parameterKey] ?? 0,
    observable: d[observableKey] ?? 0,
  }));

  if (values.length === 0) return [];

  // Find parameter range
  const params = values.map((v) => v.param);
  const minParam = Math.min(...params);
  const maxParam = Math.max(...params);
  const paramRange = maxParam - minParam;

  if (paramRange === 0) return values; // All same parameter

  // Bin the data
  const binWidth = paramRange / numBins;
  const bins: Map<number, Set<number>> = new Map();

  values.forEach(({ param, observable }) => {
    const binIndex = Math.floor((param - minParam) / binWidth);
    const binCenter = minParam + (binIndex + 0.5) * binWidth;

    if (!bins.has(binCenter)) {
      bins.set(binCenter, new Set());
    }

    // Round observable to reduce noise
    bins.get(binCenter)!.add(Math.round(observable * 100) / 100);
  });

  // Convert to points
  const points: Array<{ param: number; value: number }> = [];
  bins.forEach((observables, param) => {
    observables.forEach((value) => {
      points.push({ param, value });
    });
  });

  return points;
};

// ==================== 3D POINCARE VISUALIZATION ====================
function PoincareMap3D({ points, scale = 1, excludeAxis = "z" }) {
  const geometry = useMemo(() => {
    if (points.length === 0) return null;

    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    points.forEach((p, i) => {
      // Map to 3D space, excluding the section axis
      if (excludeAxis === "z") {
        positions[i * 3] = (p.x ?? 0) * scale;
        positions[i * 3 + 1] = (p.y ?? 0) * scale;
        positions[i * 3 + 2] = 0;
      } else if (excludeAxis === "y") {
        positions[i * 3] = (p.x ?? 0) * scale;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (p.z ?? 0) * scale;
      } else {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = (p.y ?? 0) * scale;
        positions[i * 3 + 2] = (p.z ?? 0) * scale;
      }

      // Color by sequence
      const t = i / Math.max(points.length - 1, 1);
      const color = new THREE.Color();
      color.setHSL(0.6 - t * 0.5, 0.9, 0.6);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    });

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return geom;
  }, [points, scale, excludeAxis]);

  if (!geometry) return null;

  return (
    <points>
      <bufferGeometry attach="geometry" {...geometry} />
      <pointsMaterial
        size={4}
        sizeAttenuation={false}
        vertexColors
        transparent
        opacity={0.8}
      />
    </points>
  );
}

// ==================== 2D BIFURCATION CANVAS ====================
function BifurcationCanvas({ points, width = 800, height = 500 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // Clear
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Find ranges
    const params = points.map((p) => p.param);
    const values = points.map((p) => p.value);
    const minParam = Math.min(...params);
    const maxParam = Math.max(...params);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const padding = 60;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    const scaleX = (p: number) =>
      padding + ((p - minParam) / (maxParam - minParam || 1)) * chartWidth;
    const scaleY = (v: number) =>
      height -
      padding -
      ((v - minValue) / (maxValue - minValue || 1)) * chartHeight;

    // Draw grid
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();

      const y = padding + (i / 10) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw points with gradient
    const gradient = ctx.createLinearGradient(0, height - padding, 0, padding);
    gradient.addColorStop(0, "#3b82f6");
    gradient.addColorStop(0.5, "#8b5cf6");
    gradient.addColorStop(1, "#ec4899");

    points.forEach((p) => {
      const x = scaleX(p.param);
      const y = scaleY(p.value);

      ctx.fillStyle = gradient;
      ctx.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
    });

    // Labels
    ctx.fillStyle = "#888";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `Parameter Range: ${minParam.toFixed(2)} - ${maxParam.toFixed(2)}`,
      width / 2,
      height - 15
    );

    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(
      `Observable: ${minValue.toFixed(2)} - ${maxValue.toFixed(2)}`,
      0,
      0
    );
    ctx.restore();

    // Axis labels
    ctx.fillStyle = "#666";
    ctx.font = "10px monospace";
    for (let i = 0; i <= 5; i++) {
      const paramVal = minParam + (i / 5) * (maxParam - minParam);
      const x = scaleX(paramVal);
      ctx.textAlign = "center";
      ctx.fillText(paramVal.toFixed(1), x, height - padding + 20);

      const valVal = minValue + (i / 5) * (maxValue - minValue);
      const y = scaleY(valVal);
      ctx.textAlign = "right";
      ctx.fillText(valVal.toFixed(1), padding - 10, y + 4);
    }
  }, [points, width, height]);

  return <canvas ref={canvasRef} className="w-full rounded-lg" />;
}

// ==================== MAIN COMPONENT ====================
export function ExportView() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<string>("");
  const [activeTab, setActiveTab] = useState("poincare");

  // Poincaré settings
  const [poincareSection, setPoincareSection] = useState<"x" | "y" | "z">("z");
  const [sectionValue, setSectionValue] = useState(0);
  const [crossingDirection, setCrossingDirection] = useState<
    "positive" | "negative" | "both"
  >("positive");
  const [poincareTransient, setPoincareTransient] = useState(100);
  const [poincarePoints, setPoincarePoints] = useState<ChannelMap[]>([]);
  const [poincareScale, setPoincareScale] = useState(1);

  // Bifurcation settings
  const [parameterKey, setParameterKey] = useState("x");
  const [observableKey, setObservableKey] = useState("y");
  const [numBins, setNumBins] = useState(50);
  const [bifurcationTransient, setBifurcationTransient] = useState(100);
  const [bifurcationPoints, setBifurcationPoints] = useState<
    Array<{ param: number; value: number }>
  >([]);

  // Load recordings on mount
  useEffect(() => {
    const loaded = loadRecordings();
    setRecordings(loaded);
    if (loaded.length > 0) {
      setSelectedRecording(loaded[0].id);
    }
  }, []);

  const currentRecording = recordings.find((r) => r.id === selectedRecording);

  const computePoincare = () => {
    if (!currentRecording) return;

    const points = computePoincareFromData(currentRecording.data, {
      section: poincareSection,
      sectionValue,
      crossingDirection,
      transient: poincareTransient,
    });

    setPoincarePoints(points);
  };

  const computeBifurcation = () => {
    if (!currentRecording) return;

    const points = computeBifurcationFromData(currentRecording.data, {
      parameterKey,
      observableKey,
      numBins,
      transient: bifurcationTransient,
    });

    setBifurcationPoints(points);
  };

  const availableKeys = currentRecording
    ? Object.keys(currentRecording.data[0] || {}).filter(
        (k) => k !== "t" && k !== "index"
      )
    : ["x", "y", "z"];

  return (
    <ScrollArea className="h-screen">
      <div className="w-full min-h-screen bg-background p-6 space-y-4 pb-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span>Poincaré Maps & Bifurcation Diagrams</span>
              <span className="text-sm text-muted-foreground font-normal">
                from Recorded System Data
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recordings.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <AlertCircle className="w-12 h-12 mx-auto text-yellow-500" />
                <p className="text-lg font-semibold">No Recordings Found</p>
                <p className="text-sm text-muted-foreground">
                  Please record some system data first using the main dashboard.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Select Recording</Label>
                  <Select
                    value={selectedRecording}
                    onValueChange={setSelectedRecording}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {recordings.map((rec) => (
                        <SelectItem key={rec.id} value={rec.id}>
                          {rec.name} • {rec.duration.toFixed(1)}s •{" "}
                          {rec.data.length} samples
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {currentRecording && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-semibold mb-2">
                        Recording Info
                      </p>
                      <div className="text-xs space-y-1">
                        <p>Samples: {currentRecording.data.length}</p>
                        <p>Duration: {currentRecording.duration.toFixed(2)}s</p>
                        <p>
                          Date:{" "}
                          {new Date(
                            currentRecording.timestamp
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {currentRecording.parameters && (
                      <div>
                        <p className="text-sm font-semibold mb-2">
                          System Parameters
                        </p>
                        <div className="text-xs space-y-1">
                          {Object.entries(currentRecording.parameters).map(
                            ([k, v]) => (
                              <p key={k}>
                                {k}: {typeof v === "number" ? v.toFixed(3) : v}
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    )}
                    {currentRecording.initialState && (
                      <div>
                        <p className="text-sm font-semibold mb-2">
                          Initial State
                        </p>
                        <div className="text-xs space-y-1">
                          {Object.entries(currentRecording.initialState).map(
                            ([k, v]) => (
                              <p key={k}>
                                {k}: {v}
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {currentRecording && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="poincare">Poincaré Map</TabsTrigger>
              <TabsTrigger value="bifurcation">Bifurcation Diagram</TabsTrigger>
            </TabsList>

            <TabsContent value="poincare" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Poincaré Section Configuration</span>
                    <Button onClick={computePoincare}>
                      Generate Poincaré Map
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <Label>Section Plane</Label>
                      <Select
                        value={poincareSection}
                        onValueChange={(v: any) => setPoincareSection(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableKeys.map((k) => (
                            <SelectItem key={k} value={k}>
                              {k} = {sectionValue}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Section Value: {sectionValue.toFixed(2)}</Label>
                      <Slider
                        value={[sectionValue]}
                        onValueChange={(v) => setSectionValue(v[0])}
                        min={-50}
                        max={50}
                        step={0.5}
                      />
                    </div>

                    <div>
                      <Label>Crossing Direction</Label>
                      <Select
                        value={crossingDirection}
                        onValueChange={(v: any) => setCrossingDirection(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="positive">Positive (↑)</SelectItem>
                          <SelectItem value="negative">Negative (↓)</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Transient Skip: {poincareTransient}</Label>
                      <Slider
                        value={[poincareTransient]}
                        onValueChange={(v) => setPoincareTransient(v[0])}
                        min={0}
                        max={1000}
                        step={50}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>
                      Visualization Scale: {poincareScale.toFixed(1)}×
                    </Label>
                    <Slider
                      value={[poincareScale]}
                      onValueChange={(v) => setPoincareScale(v[0])}
                      min={0.1}
                      max={5}
                      step={0.1}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    3D Poincaré Map
                    <span className="text-sm text-muted-foreground ml-2">
                      ({poincarePoints.length} section crossings)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="w-full h-[500px] bg-black rounded-lg">
                    {poincarePoints.length > 0 ? (
                      <Canvas camera={{ position: [30, 30, 30], fov: 60 }}>
                        <ambientLight intensity={0.6} />
                        <pointLight position={[20, 20, 20]} intensity={0.8} />
                        <PoincareMap3D
                          points={poincarePoints}
                          scale={poincareScale}
                          excludeAxis={poincareSection}
                        />
                        <OrbitControls enableDamping dampingFactor={0.05} />
                        <gridHelper args={[50, 20, "#333", "#111"]} />
                        <axesHelper args={[25]} />
                      </Canvas>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        Click "Generate Poincaré Map" to compute section
                        crossings
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm space-y-1">
                        <p className="font-semibold">
                          Understanding Poincaré Maps:
                        </p>
                        <p>
                          Each point represents where the system's trajectory
                          crosses the chosen plane (e.g., z=0). Patterns reveal
                          system behavior:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>
                            <strong>Fixed points:</strong> Periodic orbits
                            return to same location
                          </li>
                          <li>
                            <strong>Closed curves:</strong> Quasi-periodic
                            (torus) motion
                          </li>
                          <li>
                            <strong>Scattered points:</strong> Chaotic dynamics
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bifurcation" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>Bifurcation Analysis Configuration</span>
                    <Button onClick={computeBifurcation}>
                      Generate Bifurcation Diagram
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <Label>Parameter (X-axis)</Label>
                      <Select
                        value={parameterKey}
                        onValueChange={setParameterKey}
                      >
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

                    <div>
                      <Label>Observable (Y-axis)</Label>
                      <Select
                        value={observableKey}
                        onValueChange={setObservableKey}
                      >
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

                    <div>
                      <Label>Number of Bins: {numBins}</Label>
                      <Slider
                        value={[numBins]}
                        onValueChange={(v) => setNumBins(v[0])}
                        min={20}
                        max={200}
                        step={10}
                      />
                    </div>

                    <div>
                      <Label>Transient Skip: {bifurcationTransient}</Label>
                      <Slider
                        value={[bifurcationTransient]}
                        onValueChange={(v) => setBifurcationTransient(v[0])}
                        min={0}
                        max={1000}
                        step={50}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Bifurcation Diagram
                    <span className="text-sm text-muted-foreground ml-2">
                      ({bifurcationPoints.length} points)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="w-full">
                    {bifurcationPoints.length > 0 ? (
                      <BifurcationCanvas
                        points={bifurcationPoints}
                        width={900}
                        height={500}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-64 bg-black rounded-lg text-muted-foreground">
                        Click "Generate Bifurcation Diagram" to analyze
                        parameter dependence
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <Info className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm space-y-1">
                        <p className="font-semibold">
                          Understanding Bifurcation Diagrams:
                        </p>
                        <p>
                          Shows how system behavior changes as a parameter
                          varies. Look for:
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>
                            <strong>Single lines:</strong> Stable fixed points
                          </li>
                          <li>
                            <strong>Period-doubling:</strong> Branching from
                            1→2→4→8... orbits
                          </li>
                          <li>
                            <strong>Dense regions:</strong> Chaotic behavior
                          </li>
                          <li>
                            <strong>Windows:</strong> Islands of periodic
                            behavior within chaos
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  );
}
