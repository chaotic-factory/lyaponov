import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Maximize2,
  AlertTriangle,
  Activity,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const WS_URL = "ws://localhost:8000/api/stream";

// ==================== TYPES ====================
type ChannelMap = Record<string, number>;

interface WSMessage {
  timestamp?: number;
  samples?: ChannelMap[];
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

interface DashboardState {
  data: ChannelMap[];
  isConnected: boolean;
  visibleChannels: Record<string, boolean>;
  scale: number;
  interpolation: "none" | "linear" | "spline";
  isRecording: boolean;
  recordedData: ChannelMap[];
  selectedRecording: string | null;
  recordings: Recording[];
  alertThresholds: { amplitude: number; frequency: number };
  baselineData: ChannelMap[] | null;
  playbackPosition: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

// Parameter templates
const PARAMETER_TEMPLATES: Record<string, SystemParameters> = {
  lorenz: { sigma: 10, rho: 28, beta: 8 / 3 },
  rossler: { a: 0.2, b: 0.2, c: 5.7 },
  chua: { alpha: 15.6, beta: 28, m0: -1.143, m1: -0.714 },
  vanderpol: { mu: 1.0 },
  duffing: { alpha: 1, beta: -1, gamma: 0.3, omega: 1.2 },
  custom: {},
};

// ==================== STATE MANAGEMENT ====================
const createStore = <T,>(initialState: T) => {
  let state = initialState;
  const listeners = new Set<(state: T) => void>();

  return {
    getState: () => state,
    setState: (partial: Partial<T>) => {
      state = { ...state, ...partial };
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener: (state: T) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const dashboardStore = createStore<DashboardState>({
  data: [],
  isConnected: false,
  visibleChannels: { x: true, y: true, z: true },
  scale: 1,
  interpolation: "none",
  isRecording: false,
  recordedData: [],
  selectedRecording: null,
  recordings: [],
  alertThresholds: { amplitude: 100, frequency: 10 },
  baselineData: null,
  playbackPosition: 0,
  isPlaying: false,
  playbackSpeed: 1,
});

const useStore = <T,>(
  store: ReturnType<typeof createStore<T>>,
  selector: (state: T) => any
) => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return store.subscribe(() => forceUpdate({}));
  }, [store]);

  return selector(store.getState());
};

// ==================== UTILITY FUNCTIONS ====================
const calculateLyapunovExponent = (data: ChannelMap[], channel = "x") => {
  if (data.length < 100) return null;

  const values = data.map((d) => d[channel] || 0);
  let sum = 0;
  let count = 0;

  for (let i = 10; i < values.length - 10; i++) {
    const current = values[i];
    const next = values[i + 1];
    const delta = Math.abs(next - current);

    if (delta > 1e-10) {
      sum += Math.log(delta);
      count++;
    }
  }

  return count > 0 ? sum / count : null;
};

const classifyDynamicalState = (
  lyapunov: number | null
): {
  state: string;
  color: string;
  confidence: number;
} => {
  if (lyapunov === null)
    return { state: "Unknown", color: "text-gray-500", confidence: 0 };

  if (lyapunov < -0.05)
    return {
      state: "Stable / Fixed Point",
      color: "text-blue-500",
      confidence: 0.9,
    };
  if (lyapunov < -0.01)
    return { state: "Stable", color: "text-blue-400", confidence: 0.7 };
  if (lyapunov < 0.01)
    return {
      state: "Periodic / Limit Cycle",
      color: "text-green-500",
      confidence: 0.8,
    };
  if (lyapunov < 0.1)
    return {
      state: "Quasi-Periodic",
      color: "text-yellow-500",
      confidence: 0.7,
    };
  return { state: "Chaotic", color: "text-red-500", confidence: 0.85 };
};

const detectRegimeChange = (history: number[]): boolean => {
  if (history.length < 20) return false;
  const recent = history.slice(-10);
  const older = history.slice(-20, -10);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  return Math.abs(recentAvg - olderAvg) > 0.1;
};

const calculateAnomalyScore = (
  current: ChannelMap[],
  baseline: ChannelMap[] | null
): number => {
  if (!baseline || baseline.length < 10 || current.length < 10) return 0;

  const currentMean =
    current.slice(-50).reduce((sum, d) => sum + (d.x || 0), 0) / 50;
  const baselineMean =
    baseline.slice(-50).reduce((sum, d) => sum + (d.x || 0), 0) / 50;

  return Math.abs(currentMean - baselineMean) / (Math.abs(baselineMean) || 1);
};

const computeBifurcationData = (data: ChannelMap[]) => {
  if (data.length < 50) return [];

  const bins = 30;
  const params = data.map((d) => d.x || 0);
  const observables = data.map((d) => d.y || 0);

  const minParam = Math.min(...params);
  const maxParam = Math.max(...params);
  const binWidth = (maxParam - minParam) / bins;

  const bifurcationPoints: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < bins; i++) {
    const binMin = minParam + i * binWidth;
    const binMax = binMin + binWidth;

    const inBin = observables.filter((_, idx) => {
      const p = params[idx];
      return p >= binMin && p < binMax;
    });

    if (inBin.length > 0) {
      const uniqueVals = [
        ...new Set(inBin.map((v) => Math.round(v * 10) / 10)),
      ];
      uniqueVals.forEach((val) => {
        bifurcationPoints.push({ x: (binMin + binMax) / 2, y: val });
      });
    }
  }

  return bifurcationPoints;
};

const loadRecordings = (): Recording[] => {
  try {
    const stored = localStorage.getItem("nld_recordings");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// ==================== WEBSOCKET HOOK ====================
function useSharedXYZData({
  wsUrl = WS_URL,
  sampleDt = 0.01,
  bufferSize = 1000,
}) {
  useEffect(() => {
    dashboardStore.setState({ recordings: loadRecordings() });

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
        dashboardStore.setState({ isConnected: true });
      };

      ws.onclose = () => {
        dashboardStore.setState({ isConnected: false });
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

          const currentState = dashboardStore.getState();

          // Only update if not playing back a recording
          if (!currentState.selectedRecording) {
            const merged = [...currentState.data, ...newData];
            const trimmed = merged.slice(
              Math.max(0, merged.length - bufferSize)
            );
            dashboardStore.setState({ data: trimmed });
          }

          if (currentState.isRecording) {
            dashboardStore.setState({
              recordedData: [...currentState.recordedData, ...newData],
            });
          }
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
}

// ==================== COMPONENTS ====================

// Compact Status Bar
function StatusBar() {
  const isConnected = useStore(dashboardStore, (s) => s.isConnected);
  const data = useStore(dashboardStore, (s) => s.data);
  const isRecording = useStore(dashboardStore, (s) => s.isRecording);
  const recordedData = useStore(dashboardStore, (s) => s.recordedData);
  const selectedRecording = useStore(
    dashboardStore,
    (s) => s.selectedRecording
  );

  const lyapunov = useMemo(() => calculateLyapunovExponent(data), [data]);
  const classification = useMemo(
    () => classifyDynamicalState(lyapunov),
    [lyapunov]
  );

  return (
    <div className="bg-card border rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium">
              {selectedRecording
                ? "Playback"
                : isConnected
                ? "Live"
                : "Disconnected"}
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">{data.length} samples</span>
          </div>

          {isRecording && (
            <>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2 text-red-500">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium">
                  REC {(recordedData.length * 0.01).toFixed(1)}s
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold ${classification.color} bg-opacity-10 border`}
          >
            {classification.state}
          </div>
          {lyapunov !== null && (
            <div className="text-xs text-muted-foreground">
              λ₁ = {lyapunov.toFixed(4)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// Playback Controls - Now detached and always visible when recording exists
function PlaybackControls() {
  const selectedRecording = useStore(
    dashboardStore,
    (s) => s.selectedRecording
  );
  const recordings = useStore(dashboardStore, (s) => s.recordings);
  const playbackPosition = useStore(dashboardStore, (s) => s.playbackPosition);
  const isPlaying = useStore(dashboardStore, (s) => s.isPlaying);
  const data = useStore(dashboardStore, (s) => s.data);

  const recording = recordings.find((r) => r.id === selectedRecording);
  const maxPosition = recording ? recording.data.length : 0;

  useEffect(() => {
    if (!isPlaying || !recording) return;

    const interval = setInterval(() => {
      const state = dashboardStore.getState();
      const newPos = state.playbackPosition + 10;

      if (newPos >= maxPosition) {
        dashboardStore.setState({
          playbackPosition: maxPosition,
          isPlaying: false,
        });
        return;
      }

      dashboardStore.setState({ playbackPosition: newPos });
      dashboardStore.setState({ data: recording.data.slice(0, newPos) });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, recording, maxPosition]);

  if (!selectedRecording) return null;

  const handlePlayPause = () => {
    if (playbackPosition >= maxPosition) {
      dashboardStore.setState({ playbackPosition: 0, isPlaying: true });
      return;
    }
    dashboardStore.setState({ isPlaying: !isPlaying });
  };

  const handleSeek = (value: number[]) => {
    const newPos = value[0];
    dashboardStore.setState({
      playbackPosition: newPos,
      data: recording!.data.slice(0, newPos),
    });
  };

  const handleSkipBack = () => {
    const newPos = Math.max(0, playbackPosition - 100);
    dashboardStore.setState({
      playbackPosition: newPos,
      data: recording!.data.slice(0, newPos),
    });
  };

  const handleSkipForward = () => {
    const newPos = Math.min(maxPosition, playbackPosition + 100);
    dashboardStore.setState({
      playbackPosition: newPos,
      data: recording!.data.slice(0, newPos),
    });
  };

  return (
    <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-3xl px-4 pb-2">
      <Card className="shadow-lg border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <CardContent className="py-2 px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSkipBack}
                className="h-7 w-7 p-0"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={handlePlayPause}
                className="h-7 w-7 p-0"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSkipForward}
                className="h-7 w-7 p-0"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="flex-1 flex items-center gap-3">
              <Slider
                value={[playbackPosition]}
                max={maxPosition}
                step={1}
                onValueChange={handleSeek}
                disabled={isPlaying}
                className="flex-1"
              />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[90px] text-right">
                {(playbackPosition * 0.01).toFixed(2)}s /{" "}
                {(maxPosition * 0.01).toFixed(2)}s
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// Compact Controls
function CompactControls() {
  const visibleChannels = useStore(dashboardStore, (s) => s.visibleChannels);
  const isRecording = useStore(dashboardStore, (s) => s.isRecording);
  const recordedData = useStore(dashboardStore, (s) => s.recordedData);
  const recordings = useStore(dashboardStore, (s) => s.recordings);
  const selectedRecording = useStore(
    dashboardStore,
    (s) => s.selectedRecording
  );
  const scale = useStore(dashboardStore, (s) => s.scale);
  const interpolation = useStore(dashboardStore, (s) => s.interpolation);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const [paramTemplate, setParamTemplate] = useState("lorenz");
  const [parameters, setParameters] = useState<SystemParameters>(
    PARAMETER_TEMPLATES.lorenz
  );
  const [initialState, setInitialState] = useState({ x: 1, y: 1, z: 1 });

  const toggleChannel = (ch: string) => {
    dashboardStore.setState({
      visibleChannels: { ...visibleChannels, [ch]: !visibleChannels[ch] },
    });
  };

  const startRecording = () => {
    dashboardStore.setState({
      isRecording: true,
      recordedData: [],
      selectedRecording: null,
    });
  };

  const stopRecording = () => {
    dashboardStore.setState({ isRecording: false });
    if (dashboardStore.getState().recordedData.length > 0) {
      setShowSaveDialog(true);
    }
  };

  const saveRecording = () => {
    if (!recordingName.trim()) return;

    const recording: Recording = {
      id: Date.now().toString(),
      name: recordingName,
      timestamp: Date.now(),
      data: recordedData,
      duration: recordedData.length * 0.01,
      parameters,
      initialState,
    };

    try {
      const existing = loadRecordings();
      existing.push(recording);
      localStorage.setItem("nld_recordings", JSON.stringify(existing));

      dashboardStore.setState({
        recordings: existing,
        recordedData: [],
      });

      setShowSaveDialog(false);
      setRecordingName("");
      setParameters(PARAMETER_TEMPLATES.lorenz);
      setInitialState({ x: 1, y: 1, z: 1 });
    } catch (err) {
      console.error("Failed to save recording:", err);
    }
  };

  const loadRecording = (id: string) => {
    if (!id) {
      dashboardStore.setState({
        selectedRecording: null,
        playbackPosition: 0,
        isPlaying: false,
      });
      return;
    }

    const recording = recordings.find((r) => r.id === id);
    if (recording) {
      dashboardStore.setState({
        data: recording.data,
        selectedRecording: id,
        isRecording: false,
        playbackPosition: recording.data.length,
        isPlaying: false,
      });
    }
  };

  const setAsBaseline = () => {
    const currentData = dashboardStore.getState().data;
    dashboardStore.setState({ baselineData: currentData });
  };

  const handleTemplateChange = (template: string) => {
    setParamTemplate(template);
    setParameters(
      PARAMETER_TEMPLATES[template as keyof typeof PARAMETER_TEMPLATES]
    );
  };

  const updateParameter = (key: string, value: string) => {
    setParameters({ ...parameters, [key]: parseFloat(value) || 0 });
  };

  const addCustomParameter = () => {
    const key = prompt("Parameter name:");
    if (key) {
      setParameters({ ...parameters, [key]: 0 });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Channels & View Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Channels & View</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-1">
            {["x", "y", "z"].map((ch) => (
              <Button
                key={ch}
                size="sm"
                variant={visibleChannels[ch] ? "default" : "outline"}
                onClick={() => toggleChannel(ch)}
                className="h-7 px-3 flex-1"
              >
                {ch.toUpperCase()}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Scale</Label>
              <span className="text-xs text-muted-foreground">
                {scale.toFixed(1)}×
              </span>
            </div>
            <Slider
              value={[scale]}
              min={0.5}
              max={5}
              step={0.1}
              onValueChange={(v) => dashboardStore.setState({ scale: v[0] })}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Interpolation</Label>
            <Select
              value={interpolation}
              onValueChange={(v: any) =>
                dashboardStore.setState({ interpolation: v })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="linear">Linear</SelectItem>
                <SelectItem value="spline">Spline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Recording Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recording</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            {!isRecording ? (
              <Button onClick={startRecording} size="sm" className="flex-1 h-8">
                ● Start
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="sm"
                className="flex-1 h-8"
              >
                ■ Stop
              </Button>
            )}
            <Button
              onClick={setAsBaseline}
              variant="outline"
              size="sm"
              className="flex-1 h-8"
            >
              Baseline
            </Button>
          </div>

          {showSaveDialog && (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/50">
              <Input
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                placeholder="Recording name"
                className="h-7 text-xs"
              />

              <Tabs
                value={paramTemplate}
                onValueChange={handleTemplateChange}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3 h-7">
                  <TabsTrigger value="lorenz" className="text-xs">
                    Lorenz
                  </TabsTrigger>
                  <TabsTrigger value="rossler" className="text-xs">
                    Rössler
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="text-xs">
                    Custom
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-1 max-h-32 overflow-y-auto">
                {Object.entries(parameters).map(([key, val]) => (
                  <div key={key} className="flex gap-1 items-center">
                    <Label className="text-[10px] min-w-[40px]">{key}</Label>
                    <Input
                      type="number"
                      value={val}
                      onChange={(e) => updateParameter(key, e.target.value)}
                      className="h-6 text-xs"
                      step="0.1"
                    />
                  </div>
                ))}
                {paramTemplate === "custom" && (
                  <Button
                    onClick={addCustomParameter}
                    variant="outline"
                    size="sm"
                    className="w-full h-6 text-xs"
                  >
                    + Add
                  </Button>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[10px]">Initial State</Label>
                <div className="flex gap-1">
                  {["x", "y", "z"].map((axis) => (
                    <Input
                      key={axis}
                      type="number"
                      placeholder={axis}
                      value={initialState[axis as keyof typeof initialState]}
                      onChange={(e) =>
                        setInitialState({
                          ...initialState,
                          [axis]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-6 text-xs"
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-1">
                <Button
                  onClick={saveRecording}
                  disabled={!recordingName.trim()}
                  size="sm"
                  className="flex-1 h-7"
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDialog(false)}
                  size="sm"
                  className="flex-1 h-7"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recordings Selector */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Load Recording</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedRecording || "live"}
            onValueChange={loadRecording}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Live data" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="live">🔴 Live Data</SelectItem>
              {recordings.map((rec) => (
                <SelectItem key={rec.id} value={rec.id}>
                  {rec.name} • {rec.duration.toFixed(1)}s
                  {rec.parameters &&
                    ` • ${Object.keys(rec.parameters).length} params`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedRecording &&
            recordings.find((r) => r.id === selectedRecording)?.parameters && (
              <div className="mt-3 p-2 bg-muted rounded text-xs space-y-1">
                <div className="font-semibold">Parameters:</div>
                {Object.entries(
                  recordings.find((r) => r.id === selectedRecording)!
                    .parameters!
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}:</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

// Metrics Cards
function MetricsCards() {
  const data = useStore(dashboardStore, (s) => s.data);
  const baselineData = useStore(dashboardStore, (s) => s.baselineData);
  const thresholds = useStore(dashboardStore, (s) => s.alertThresholds);

  const anomalyScore = useMemo(
    () => calculateAnomalyScore(data, baselineData),
    [data, baselineData]
  );
  const lyapunovHistory = useMemo(() => {
    if (data.length < 100) return [];
    const history: number[] = [];
    for (let i = 100; i <= data.length; i += 50) {
      const subset = data.slice(i - 100, i);
      const lyap = calculateLyapunovExponent(subset);
      if (lyap !== null) history.push(lyap);
    }
    return history;
  }, [data]);

  const regimeChange = useMemo(
    () => detectRegimeChange(lyapunovHistory),
    [lyapunovHistory]
  );

  const maxAmplitude = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map((d) => Math.abs(d.x || 0)));
  }, [data]);

  const amplitudeAlert = maxAmplitude > thresholds.amplitude;
  const anomalyAlert = anomalyScore > 0.5;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Max Amplitude</div>
            <div
              className={`text-2xl font-bold ${
                amplitudeAlert ? "text-red-500" : ""
              }`}
            >
              {maxAmplitude.toFixed(2)}
            </div>
            {amplitudeAlert && (
              <div className="text-[10px] text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Threshold exceeded
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Regime Status</div>
            <div
              className={`text-2xl font-bold ${
                regimeChange ? "text-yellow-500" : "text-green-500"
              }`}
            >
              {regimeChange ? "Changing" : "Stable"}
            </div>
            {regimeChange && (
              <div className="text-[10px] text-yellow-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Transition detected
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Anomaly Score</div>
            <div
              className={`text-2xl font-bold ${
                anomalyAlert ? "text-yellow-500" : ""
              }`}
            >
              {(anomalyScore * 100).toFixed(1)}%
            </div>
            {!baselineData && (
              <div className="text-[10px] text-muted-foreground">
                No baseline set
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              Lyapunov Samples
            </div>
            <div className="text-2xl font-bold">{lyapunovHistory.length}</div>
            <div className="text-[10px] text-muted-foreground">
              {data.length < 100 ? "Collecting..." : "Active"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Chart wrapper with fullscreen
function ChartCard({
  title,
  children,
  onFullscreen,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  onFullscreen?: () => void;
  className?: string;
}) {
  return (
    <Card className={`dark:bg-gray-900 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          {onFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onFullscreen}
              className="h-6 w-6 p-0"
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// 2D Visualizer with dark mode
function XYZVisualizerCanvas({ data }: { data: ChannelMap[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleChannels = useStore(dashboardStore, (s) => s.visibleChannels);
  const isConnected = useStore(dashboardStore, (s) => s.isConnected);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = Math.max(rect.height, 300);
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    if (data.length < 2) {
      ctx.fillStyle = "#666";
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
    ["x", "y", "z"].forEach((ch) => {
      if (visibleChannels[ch]) {
        data.forEach((d) => {
          if (d[ch] !== undefined) {
            minVal = Math.min(minVal, d[ch]);
            maxVal = Math.max(maxVal, d[ch]);
          }
        });
      }
    });

    if (minVal === Infinity) return;

    const scaleX = chartW / Math.max(data.length - 1, 1);
    const scaleY = chartH / (maxVal - minVal || 1);

    ctx.strokeStyle = "#1a1a1a";
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const colors = { x: "#3b82f6", y: "#22c55e", z: "#a855f7" };
    ["x", "y", "z"].forEach((ch) => {
      if (!visibleChannels[ch]) return;
      ctx.strokeStyle = colors[ch as keyof typeof colors];
      ctx.lineWidth = 1.5;
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

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = minVal + ((maxVal - minVal) / 5) * (5 - i);
      const y = padding.top + (chartH / 5) * i;
      ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
    }
  }, [data, visibleChannels, isConnected]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// Bifurcation Diagram with dark mode
function BifurcationDiagram({ data }: { data: ChannelMap[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 250;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    if (data.length < 50) {
      ctx.fillStyle = "#666";
      ctx.font = "14px Inter";
      ctx.textAlign = "center";
      ctx.fillText("Collecting data...", width / 2, height / 2);
      return;
    }

    const points = computeBifurcationData(data);
    if (points.length === 0) return;

    const padding = { top: 20, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const xValues = points.map((p) => p.x);
    const yValues = points.map((p) => p.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const scaleX = (x: number) =>
      padding.left + ((x - minX) / (maxX - minX || 1)) * chartW;
    const scaleY = (y: number) =>
      height - padding.bottom - ((y - minY) / (maxY - minY || 1)) * chartH;

    ctx.fillStyle = "#3b82f6";
    points.forEach((p) => {
      ctx.fillRect(scaleX(p.x) - 1, scaleY(p.y) - 1, 2, 2);
    });

    ctx.strokeStyle = "#444";
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();
  }, [data]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="w-full" />
    </div>
  );
}

// Lyapunov Timeline
function LyapunovTimeline({ data }: { data: ChannelMap[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 250;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    if (data.length < 100) {
      ctx.fillStyle = "#666";
      ctx.font = "14px Inter";
      ctx.textAlign = "center";
      ctx.fillText("Collecting data...", width / 2, height / 2);
      return;
    }

    const history: Array<{ time: number; lyap: number }> = [];
    for (let i = 100; i <= data.length; i += 50) {
      const subset = data.slice(i - 100, i);
      const lyap = calculateLyapunovExponent(subset);
      if (lyap !== null) {
        history.push({ time: i, lyap });
      }
    }

    if (history.length === 0) return;

    const padding = { top: 20, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const times = history.map((h) => h.time);
    const lyaps = history.map((h) => h.lyap);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minLyap = Math.min(...lyaps, -0.2);
    const maxLyap = Math.max(...lyaps, 0.2);

    const scaleX = (t: number) =>
      padding.left + ((t - minTime) / (maxTime - minTime || 1)) * chartW;
    const scaleY = (l: number) =>
      height -
      padding.bottom -
      ((l - minLyap) / (maxLyap - minLyap || 1)) * chartH;

    const zeroY = scaleY(0);
    ctx.strokeStyle = "#444";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((h, i) => {
      const x = scaleX(h.time);
      const y = scaleY(h.lyap);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();
  }, [data]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="w-full" />
    </div>
  );
}

// 3D Trajectory
function Trajectory({ data, scale, interpolation, visibleChannels }: any) {
  const points = useMemo(() => {
    if (data.length < 2) return [];
    const recent = data.slice(-1000);
    const xs = recent.map((p: any) => (visibleChannels.x ? p.x ?? 0 : 0));
    const ys = recent.map((p: any) => (visibleChannels.y ? p.y ?? 0 : 0));
    const zs = recent.map((p: any) => (visibleChannels.z ? p.z ?? 0 : 0));

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
      (_: any, i: number) =>
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

  const colors = points.map((_: any, i: number) => {
    const t = i / Math.max(points.length - 1, 1);
    return new THREE.Color().setHSL(0.6 - t * 0.4, 0.8, 0.5);
  });

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

// 3D Phase Space
function PhaseSpaceView({ data }: { data: ChannelMap[] }) {
  const scale = useStore(dashboardStore, (s) => s.scale);
  const interpolation = useStore(dashboardStore, (s) => s.interpolation);
  const visibleChannels = useStore(dashboardStore, (s) => s.visibleChannels);
  const isConnected = useStore(dashboardStore, (s) => s.isConnected);

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden">
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
          <gridHelper args={[200, 20, "#333", "#111"]} />
          <axesHelper args={[100]} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-gray-500">
          {isConnected ? "Waiting for data..." : "Connecting..."}
        </div>
      )}
    </div>
  );
}

// Fullscreen Modal
function FullscreenModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Button variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
          ✕
        </Button>
      </div>
      <div className="flex-1 p-4 overflow-auto">{children}</div>
    </div>
  );
}

// Main Dashboard
export function PlaygroundView() {
  useSharedXYZData({ wsUrl: WS_URL, bufferSize: 1000 });

  const data = useStore(dashboardStore, (s) => s.data);
  const selectedRecording = useStore(
    dashboardStore,
    (s) => s.selectedRecording
  );
  const [fullscreenChart, setFullscreenChart] = useState<string | null>(null);

  return (
    <>
      <ScrollArea className="h-screen overflow-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Playground</h1>
          <p className="text-muted-foreground">
            Connect your circuit to get realtime visualization
          </p>
        </div>

        <div className="p-4 space-y-4 max-w-[2000px] mx-auto">
          <StatusBar />

          <CompactControls />

          {selectedRecording && <PlaybackControls />}

          {/* <MetricsCards /> */}

          {/* Main visualization area - LARGE rectangles for pivotal views */}
          {/* Time Series - Full width, large */}
          <ChartCard
            title="Live Time Series (2D)"
            onFullscreen={() => setFullscreenChart("timeseries")}
            className="w-full"
          >
            <div className="h-[250px]">
              <XYZVisualizerCanvas data={data} />
            </div>
          </ChartCard>

          {/* Phase Space - Full width, large */}
          <ChartCard
            title="Phase Space Attractor (3D)"
            onFullscreen={() => setFullscreenChart("phase")}
            className="w-full"
          >
            <div className="h-[350px]">
              <PhaseSpaceView data={data} />
            </div>
          </ChartCard>

          {/* Lyapunov Timeline - Full width */}
          <ChartCard
            title="Lyapunov Exponent Timeline"
            onFullscreen={() => setFullscreenChart("lyapunov")}
            className="w-full"
          >
            <LyapunovTimeline data={data} />
          </ChartCard>
        </div>
      </ScrollArea>

      <FullscreenModal
        isOpen={fullscreenChart === "timeseries"}
        onClose={() => setFullscreenChart(null)}
        title="Live Time Series"
      >
        <div className="h-full flex items-center">
          <XYZVisualizerCanvas data={data} />
        </div>
      </FullscreenModal>

      <FullscreenModal
        isOpen={fullscreenChart === "lyapunov"}
        onClose={() => setFullscreenChart(null)}
        title="Lyapunov Exponent Timeline"
      >
        <div className="h-full flex items-center">
          <LyapunovTimeline data={data} />
        </div>
      </FullscreenModal>

      <FullscreenModal
        isOpen={fullscreenChart === "phase"}
        onClose={() => setFullscreenChart(null)}
        title="Phase Space Attractor"
      >
        <div className="h-full">
          <PhaseSpaceView data={data} />
        </div>
      </FullscreenModal>
    </>
  );
}
