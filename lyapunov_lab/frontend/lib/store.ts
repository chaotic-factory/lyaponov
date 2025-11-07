import { create } from "zustand";

export interface DataPoint {
  index: number;
  timestamp: number;
  ch1: number;
  ch2: number;
  ch3?: number; // Made ch3 optional for 2-channel systems
}

export interface WebSocketMessage {
  source: string;
  num_samples: number;
  num_channels: number;
  samples: number[][];
}

interface ExperimentState {
  // Connection & Status
  isConnected: boolean;
  isPlaying: boolean;
  isRecording: boolean;

  // Data
  data: DataPoint[];
  currentIndex: number;
  numChannels: number; // Track number of channels (2 or 3)

  // Experiment Metadata
  experimentName: string;
  runId: string;
  startTime: number | null;

  // Parameters
  parameters: Record<string, number>;

  // Statistics
  lyapunovExponent: number | null;
  behaviorState:
    | "stable"
    | "periodic"
    | "quasi-periodic"
    | "chaotic"
    | "unknown";
  dominantFrequency: number | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  addDataPoints: (points: DataPoint[]) => void;
  setCurrentIndex: (index: number) => void;
  reset: () => void;
  setExperimentName: (name: string) => void;
  setParameters: (params: Record<string, number>) => void;
  setLyapunovExponent: (value: number | null) => void;
  setBehaviorState: (
    state: "stable" | "periodic" | "quasi-periodic" | "chaotic" | "unknown"
  ) => void;
  setNumChannels: (channels: number) => void; // Added action to set number of channels
}

export const useExperimentStore = create<ExperimentState>((set) => ({
  isConnected: false,
  isPlaying: false,
  isRecording: false,
  data: [],
  currentIndex: -1,
  numChannels: 3, // Default to 3 channels
  experimentName: "Untitled Experiment",
  runId: `RUN-${Date.now()}`,
  startTime: null,
  parameters: {},
  lyapunovExponent: null,
  behaviorState: "unknown",
  dominantFrequency: null,

  setConnected: (connected) => set({ isConnected: connected }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setRecording: (recording) => set({ isRecording: recording }),
  addDataPoints: (points) =>
    set((state) => ({
      data: [...state.data, ...points],
      currentIndex: state.data.length + points.length - 1,
    })),
  setCurrentIndex: (index) => set({ currentIndex: index }),
  reset: () =>
    set({
      data: [],
      currentIndex: -1,
      isPlaying: false,
      runId: `RUN-${Date.now()}`,
      startTime: null,
      lyapunovExponent: null,
      behaviorState: "unknown",
    }),
  setExperimentName: (name) => set({ experimentName: name }),
  setParameters: (params) => set({ parameters: params }),
  setLyapunovExponent: (value) => set({ lyapunovExponent: value }),
  setBehaviorState: (state) => set({ behaviorState: state }),
  setNumChannels: (channels) => set({ numChannels: channels }), // Implementation
}));
