
"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

// Lorenz system parameters
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const DT = 0.01;

// Generate next Lorenz point
function getNextLorenzPoint(x, y, z, t) {
  const dx = SIGMA * (y - x) * DT;
  const dy = (x * (RHO - z) - y) * DT;
  const dz = (x * y - BETA * z) * DT;

  return {
    x: x + dx,
    y: y + dy,
    z: z + dz,
    t: t + DT,
  };
}

// 3D Lorenz visualization component
function LorenzAttractor({ data, onHover }) {
  const lineRef = useRef();
  const [hovered, setHovered] = useState(null);

  const points = useMemo(
    () => data.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    [data]
  );

  const colors = useMemo(() => {
    const cols = [];
    for (let i = 0; i < points.length; i++) {
      const t = i / Math.max(points.length - 1, 1);
      cols.push(new THREE.Color().setHSL(t * 0.7 + 0.5, 0.8, 0.5));
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
      <Line ref={lineRef} points={points} vertexColors={colors} lineWidth={2} />
      {hovered !== null && (
        <mesh position={[data[hovered].x, data[hovered].y, data[hovered].z]}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="#ffff00" />
        </mesh>
      )}
    </group>
  );
}

// Tooltip component
function Tooltip({ data, position }) {
  if (!data || !position) return null;

  return (
    <Html position={position}>
      <div className="bg-black/90 text-white px-3 py-2 rounded text-xs pointer-events-none whitespace-nowrap">
        <div>t: {data.t.toFixed(2)}</div>
        <div>x: {data.x.toFixed(2)}</div>
        <div>y: {data.y.toFixed(2)}</div>
        <div>z: {data.z.toFixed(2)}</div>
      </div>
    </Html>
  );
}

// 2D Cross-section component
function CrossSection({ data, plane, title }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);

    if (data.length < 2) return;

    // Find data ranges
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    data.forEach((p) => {
      const [px, py] =
        plane === "xy" ? [p.x, p.y] : plane === "xz" ? [p.x, p.z] : [p.y, p.z];
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    });

    const scaleX = (w - 40) / (maxX - minX || 1);
    const scaleY = (h - 40) / (maxY - minY || 1);

    ctx.strokeStyle = "#4a9eff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    data.forEach((p, i) => {
      const [px, py] =
        plane === "xy" ? [p.x, p.y] : plane === "xz" ? [p.x, p.z] : [p.y, p.z];
      const x = 20 + (px - minX) * scaleX;
      const y = h - 20 - (py - minY) * scaleY;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Draw axes
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, h - 20);
    ctx.lineTo(w - 20, h - 20);
    ctx.moveTo(20, 20);
    ctx.lineTo(20, h - 20);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#888";
    ctx.font = "11px monospace";
    const labels =
      plane === "xy" ? ["x", "y"] : plane === "xz" ? ["x", "z"] : ["y", "z"];
    ctx.fillText(labels[0], w - 15, h - 5);
    ctx.fillText(labels[1], 5, 15);
  }, [data, plane]);

  return (
    <div className="flex-1 min-h-0">
      <h3 className="text-sm font-medium text-gray-300 mb-2">{title}</h3>
      <canvas
        ref={canvasRef}
        width={400}
        height={250}
        className="w-full h-auto bg-gray-900 rounded border border-gray-800"
      />
    </div>
  );
}

// Main dashboard component
export default function LorenzDashboard() {
  const [allData, setAllData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverData, setHoverData] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  const lastPointRef = useRef({ x: 0.1, y: 0, z: 0, t: 0 });

  // Generate data points in real-time
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const last = lastPointRef.current;
      const next = getNextLorenzPoint(last.x, last.y, last.z, last.t);
      lastPointRef.current = next;

      setAllData((prev) => [...prev, next]);
      setCurrentIndex((prev) => prev + 1);
    }, 30);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleReset = () => {
    setAllData([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    lastPointRef.current = { x: 0.1, y: 0, z: 0, t: 0 };
  };

  const handleHover = (data, pos) => {
    setHoverData(data);
    setHoverPos(pos);
  };

  const visibleData = allData.slice(0, currentIndex + 1);
  const maxIndex = allData.length - 1;

  return (
    <div className="w-full h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-bold">Lyapunov Dashboard</h1>
        <div className="flex gap-3 items-center">
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

      {/* Main content */}
      <div className="flex-1 flex gap-4 p-4 min-h-0">
        {/* 3D View */}
        <div className="flex-[2] bg-gray-900 rounded-lg overflow-hidden min-w-0">
          <Canvas camera={{ position: [50, 30, 50], fov: 60 }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            {visibleData.length > 0 && (
              <>
                <LorenzAttractor data={visibleData} onHover={handleHover} />
                <Tooltip data={hoverData} position={hoverPos} />
              </>
            )}
            <OrbitControls enableDamping dampingFactor={0.05} />
            <gridHelper args={[100, 20, "#333", "#222"]} />
          </Canvas>
        </div>

        {/* Cross-sections */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">
          <CrossSection data={visibleData} plane="xy" title="XY Plane" />
          <CrossSection data={visibleData} plane="xz" title="XZ Plane" />
          <CrossSection data={visibleData} plane="yz" title="YZ Plane" />
        </div>
      </div>

      {/* Timeline Controls */}
      <div className="px-6 py-4 border-t border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400 whitespace-nowrap w-24">
            t: {(allData[currentIndex]?.t || 0).toFixed(2)}s
          </span>
          <Slider
            value={[currentIndex]}
            onValueChange={([val]) => setCurrentIndex(val)}
            max={maxIndex}
            step={1}
            disabled={maxIndex === 0}
            className="flex-1"
          />
          <span className="text-sm text-gray-400 whitespace-nowrap w-32 text-right">
            {currentIndex + 1} / {allData.length} points
          </span>
        </div>
      </div>
    </div>
  );
}
