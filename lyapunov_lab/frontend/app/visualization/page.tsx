"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Radio } from "lucide-react";

// ============ 3D Components ============

function SensorTrajectory({ data, onHover }) {
  const lineRef = useRef();
  const [hovered, setHovered] = useState(null);

  const points = useMemo(
    () => data.map((p) => new THREE.Vector3(p.ch1, p.ch2, p.ch3)),
    [data]
  );

  const colors = useMemo(() => {
    const cols = [];
    for (let i = 0; i < points.length; i++) {
      const t = i / Math.max(points.length - 1, 1);
      cols.push(new THREE.Color().setHSL(0.6 - t * 0.4, 0.8, 0.5));
    }
    return cols;
  }, [points]);

  useFrame(({ camera, pointer, raycaster }) => {
    if (lineRef.current && points.length > 0) {
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(lineRef.current);

      if (intersects.length > 0) {
        const idx = Math.floor(intersects[0].faceIndex / 2);
        if (idx < data.length) {
          setHovered(idx);
          onHover(data[idx], intersects[0].point);
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
      <Line ref={lineRef} points={points} vertexColors={colors} lineWidth={3} />
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

function Tooltip({ data, position }) {
  if (!data || !position) return null;

  return (
    <Html position={position}>
      <div className="bg-black/90 text-white px-3 py-2 rounded text-xs pointer-events-none whitespace-nowrap">
        <div>Sample: {data.index}</div>
        <div>Ch1: {data.ch1.toFixed(2)}</div>
        <div>Ch2: {data.ch2.toFixed(2)}</div>
        <div>Ch3: {data.ch3.toFixed(2)}</div>
      </div>
    </Html>
  );
}

function Scene3D({ data, onHover, hoverData, hoverPos }) {
  return (
    <Canvas camera={{ position: [40, 30, 40], fov: 60 }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[20, 20, 20]} intensity={0.8} />
      <pointLight position={[-20, -20, -20]} intensity={0.4} color="#4a9eff" />
      {data.length > 0 && (
        <>
          <SensorTrajectory data={data} onHover={onHover} />
          <Tooltip data={hoverData} position={hoverPos} />
        </>
      )}
      <OrbitControls enableDamping dampingFactor={0.05} />
      <gridHelper args={[100, 20, "#444", "#222"]} />
    </Canvas>
  );
}

// ============ 2D Chart Components ============

function useResponsiveCanvas(aspectRatio = 0.625) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 250 });

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(200, width - 32),
          height: Math.max(150, Math.min(250, width * aspectRatio)),
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [aspectRatio]);

  return { containerRef, dimensions };
}

function CrossSection({ data, plane, title }) {
  const canvasRef = useRef(null);
  const { containerRef, dimensions } = useResponsiveCanvas(0.625);

  const getPlaneData = (point) => {
    switch (plane) {
      case "ch1ch2":
        return [point.ch1, point.ch2];
      case "ch1ch3":
        return [point.ch1, point.ch3];
      default:
        return [point.ch2, point.ch3];
    }
  };

  const getPlaneLabels = () => {
    switch (plane) {
      case "ch1ch2":
        return ["Ch1", "Ch2"];
      case "ch1ch3":
        return ["Ch1", "Ch3"];
      default:
        return ["Ch2", "Ch3"];
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = dimensions;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    // Calculate bounds
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    data.forEach((p) => {
      const [px, py] = getPlaneData(p);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    });

    const padding = Math.min(20, w * 0.05);
    const scaleX = (w - padding * 2) / (maxX - minX || 1);
    const scaleY = (h - padding * 2) / (maxY - minY || 1);

    // Draw trail
    for (let i = 1; i < data.length; i++) {
      const [px, py] = getPlaneData(data[i]);
      const [prevX, prevY] = getPlaneData(data[i - 1]);
      const t = i / data.length;

      const x = padding + (px - minX) * scaleX;
      const y = h - padding - (py - minY) * scaleY;
      const prevXScaled = padding + (prevX - minX) * scaleX;
      const prevYScaled = h - padding - (prevY - minY) * scaleY;

      ctx.strokeStyle = `hsl(${220 - t * 140}, 80%, 60%)`;
      ctx.lineWidth = Math.max(1, w / 200);
      ctx.beginPath();
      ctx.moveTo(prevXScaled, prevYScaled);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#888";
    ctx.font = `${Math.max(9, w / 40)}px monospace`;
    const labels = getPlaneLabels();
    ctx.fillText(labels[0], w - padding - 25, h - 5);
    ctx.fillText(labels[1], 5, padding + 5);
  }, [data, plane, dimensions]);

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

function TimeSeriesChart({ data, maxPoints = 200 }) {
  const canvasRef = useRef(null);
  const { containerRef, dimensions } = useResponsiveCanvas(0.33);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = dimensions;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    const displayData = data.slice(Math.max(0, data.length - maxPoints));

    // Find ranges
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

    // Draw grid
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // Draw channels
    const channels = [
      { key: "ch1", color: "#3b82f6", label: "Ch1" },
      { key: "ch2", color: "#a855f7", label: "Ch2" },
      { key: "ch3", color: "#ec4899", label: "Ch3" },
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

    // Axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.lineTo(w - padding.right, h - padding.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "#888";
    ctx.font = `${Math.max(9, w / 60)}px monospace`;
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = minVal + ((maxVal - minVal) / 5) * (5 - i);
      const y = padding.top + (chartH / 5) * i;
      ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
    }

    // X-axis label
    ctx.textAlign = "center";
    ctx.fillText("Time (samples)", w / 2, h - 5);

    // Legend
    ctx.textAlign = "left";
    const legendX = w - padding.right - 120;
    const legendY = padding.top + 5;
    channels.forEach(({ color, label }, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY + i * 18, 20, 3);
      ctx.fillStyle = "#888";
      ctx.fillText(label, legendX + 25, legendY + i * 18 + 4);
    });
  }, [data, dimensions, maxPoints]);

  return (
    <div ref={containerRef} className="w-full">
      <h3 className="text-xs md:text-sm font-medium text-gray-300 mb-1 md:mb-2">
        Time Series - All Channels
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

// ============ UI Components ============

function Header({ isConnected, isPlaying, onPlayPause, onReset }) {
  return (
    <div className="px-3 md:px-6 py-3 md:py-4 border-b border-gray-700/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg md:text-2xl font-bold truncate">
          UDP Sensor 3D Dashboard
        </h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:block">
          Real-time 3-channel trajectory visualization
        </p>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Badge
          variant={isConnected ? "default" : "secondary"}
          className={`text-xs px-3 py-1.5 ${
            isConnected ? "bg-green-600" : "bg-slate-600"
          }`}
        >
          <Radio className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
          {isConnected ? "Connected" : "Disconnected"}
        </Badge>
        <Button
          onClick={onPlayPause}
          variant={isPlaying ? "destructive" : "default"}
          size="sm"
          className="gap-1.5 text-xs"
        >
          {isPlaying ? (
            <Pause className="w-3 h-3 md:w-4 md:h-4" />
          ) : (
            <Play className="w-3 h-3 md:w-4 md:h-4" />
          )}
          <span className="hidden sm:inline">
            {isPlaying ? "Pause" : "Play"}
          </span>
        </Button>
        <Button
          onClick={onReset}
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
        >
          <RotateCcw className="w-3 h-3 md:w-4 md:h-4" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>
    </div>
  );
}

function StatsCard({ label, value, color }) {
  return (
    <div
      className={`bg-gradient-to-br from-${color}-600/20 to-${color}-700/20 border border-${color}-500/30 rounded-lg px-2 md:px-4 py-1.5 md:py-2`}
    >
      <div
        className={`text-[10px] md:text-xs text-${color}-300 font-medium truncate`}
      >
        {label}
      </div>
      <div
        className={`text-lg md:text-2xl font-bold text-${color}-100 truncate`}
      >
        {value}
      </div>
    </div>
  );
}

function Statistics({ stats }) {
  return (
    <div className="px-3 md:px-6 py-2 md:py-3 grid grid-cols-3 gap-2 md:gap-3 border-b border-gray-700/50 shrink-0">
      <StatsCard label="Ch1 Avg" value={stats.ch1} color="blue" />
      <StatsCard label="Ch2 Avg" value={stats.ch2} color="purple" />
      <StatsCard label="Ch3 Avg" value={stats.ch3} color="pink" />
    </div>
  );
}

function TimelineControl({ currentIndex, maxIndex, onChange, totalPoints }) {
  return (
    <div className="px-3 md:px-6 py-3 md:py-4 border-t border-gray-700/50 shrink-0">
      <div className="flex items-center gap-2 md:gap-4">
        <span className="text-xs md:text-sm text-gray-400 whitespace-nowrap w-20 md:w-32">
          {currentIndex}
        </span>
        <Slider
          value={[currentIndex]}
          onValueChange={([val]) => onChange(val)}
          max={maxIndex}
          step={1}
          disabled={maxIndex === 0}
          className="flex-1"
        />
        <span className="text-xs md:text-sm text-gray-400 whitespace-nowrap w-20 md:w-32 text-right">
          {totalPoints} pts
        </span>
      </div>
    </div>
  );
}

// ============ Hooks ============

function useWebSocket() {
  const [allData, setAllData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ ch1: 0, ch2: 0, ch3: 0 });
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8765");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to WebSocket");
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      const newData = JSON.parse(event.data);
      const trajectoryPoints = newData.samples.map((sample, idx) => ({
        index: allData.length + idx,
        ch1: sample[0],
        ch2: sample[1],
        ch3: sample[2],
      }));

      setAllData((prev) => [...prev, ...trajectoryPoints]);

      const averages = [0, 1, 2].map(
        (ch) =>
          newData.samples.reduce((sum, s) => sum + s[ch], 0) /
          newData.samples.length
      );

      setStats({
        ch1: averages[0].toFixed(1),
        ch2: averages[1].toFixed(1),
        ch3: averages[2].toFixed(1),
      });
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    };

    return () => socket.close();
  }, []);

  return { allData, setAllData, isConnected, stats };
}

// ============ Main Component ============

export default function SensorDashboard() {
  const { allData, setAllData, isConnected, stats } = useWebSocket();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverData, setHoverData] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);

  const handleReset = () => {
    setAllData([]);
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  const handleHover = (data, pos) => {
    setHoverData(data);
    setHoverPos(pos);
  };

  const visibleData = allData.slice(0, currentIndex + 1);
  const maxIndex = allData.length - 1;

  useEffect(() => {
    if (allData.length > 0) {
      setCurrentIndex(allData.length - 1);
    }
  }, [allData.length]);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col overflow-hidden">
      <Header
        isConnected={isConnected}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onReset={handleReset}
      />
      <Statistics stats={stats} />

      <div className="flex-1 flex flex-col lg:flex-row gap-3 md:gap-4 p-3 md:p-4 min-h-0 overflow-auto">
        <div className="flex-1 flex flex-col gap-3 md:gap-4 min-w-0 min-h-[400px] lg:min-h-0">
          <div className="flex-[2] bg-gray-900/50 backdrop-blur rounded-lg overflow-hidden min-w-0 min-h-[300px] border border-gray-700/50">
            <Scene3D
              data={visibleData}
              onHover={handleHover}
              hoverData={hoverData}
              hoverPos={hoverPos}
            />
          </div>
          <div className="flex-1 bg-gray-900/30 backdrop-blur rounded-lg p-3 md:p-4 border border-gray-700/50 min-h-[180px]">
            <TimeSeriesChart data={visibleData} />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 md:gap-4 min-w-0 min-h-[400px] lg:min-h-0 lg:max-w-md">
          <CrossSection
            data={visibleData}
            plane="ch1ch2"
            title="Channel 1 vs Channel 2"
          />
          <CrossSection
            data={visibleData}
            plane="ch1ch3"
            title="Channel 1 vs Channel 3"
          />
          <CrossSection
            data={visibleData}
            plane="ch2ch3"
            title="Channel 2 vs Channel 3"
          />
        </div>
      </div>

      <TimelineControl
        currentIndex={currentIndex}
        maxIndex={maxIndex}
        onChange={setCurrentIndex}
        totalPoints={allData.length}
      />
    </div>
  );
}
