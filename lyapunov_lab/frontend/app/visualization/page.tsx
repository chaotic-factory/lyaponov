// "use client";
// import React, { useState, useEffect, useRef } from "react";
// import {
//   LineChart,
//   Line,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   Legend,
//   ResponsiveContainer,
// } from "recharts";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Activity, Radio, TrendingUp } from "lucide-react";

// const UDPSensorVisualizer = () => {
//   const [sensorData, setSensorData] = useState(null);
//   const [chartData, setChartData] = useState([]);
//   const [isConnected, setIsConnected] = useState(false);
//   const [stats, setStats] = useState({ ch1: 0, ch2: 0, ch3: 0 });

//   // Simulate receiving UDP data (in real app, this would be WebSocket or polling)
//   useEffect(() => {
//     const socket = new WebSocket("ws://localhost:8765");

//     socket.onopen = () => {
//       console.log("Connected to WebSocket");
//       setIsConnected(true);
//     };

//     socket.onmessage = (event) => {
//       const newData = JSON.parse(event.data);
//       setSensorData({
//         ...newData,
//         num_samples: newData.samples.length,
//         num_channels: newData.samples[0].length,
//         timestamp: Date.now(),
//       });

//       // Update chart data
//       const chartSamples = newData.samples.slice(-100).map((sample, idx) => ({
//         index: idx,
//         channel1: sample[0],
//         channel2: sample[1],
//         channel3: sample[2],
//       }));
//       setChartData(chartSamples);

//       // Calculate statistics
//       const averages = newData.samples[0].map(
//         (_, ch) =>
//           newData.samples.reduce((sum, s) => sum + s[ch], 0) /
//           newData.samples.length
//       );

//       setStats({
//         ch1: averages[0].toFixed(1),
//         ch2: averages[1].toFixed(1),
//         ch3: averages[2].toFixed(1),
//       });
//     };

//     socket.onclose = () => {
//       console.log("WebSocket disconnected");
//       setIsConnected(false);
//     };

//     return () => socket.close();
//   }, []);

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
//       <div className="max-w-7xl mx-auto space-y-6">
//         {/* Header */}
//         <div className="flex items-center justify-between">
//           <div>
//             <h1 className="text-3xl font-bold text-white flex items-center gap-3">
//               <Activity className="w-8 h-8 text-blue-400" />
//               UDP Sensor Monitor
//             </h1>
//             <p className="text-slate-400 mt-1">
//               Real-time 3-channel data visualization
//             </p>
//           </div>
//           <Badge
//             variant={isConnected ? "default" : "secondary"}
//             className={`text-sm px-4 py-2 ${
//               isConnected ? "bg-green-600" : "bg-slate-600"
//             }`}
//           >
//             <Radio className="w-4 h-4 mr-2" />
//             {isConnected ? "Connected" : "Disconnected"}
//           </Badge>
//         </div>

//         {/* Connection Info */}
//         {sensorData && (
//           <Card className="bg-slate-800 border-slate-700">
//             <CardHeader>
//               <CardTitle className="text-white flex items-center gap-2">
//                 <TrendingUp className="w-5 h-5 text-blue-400" />
//                 Data Source
//               </CardTitle>
//             </CardHeader>
//             <CardContent className="text-slate-300">
//               <div className="grid grid-cols-3 gap-4">
//                 <div>
//                   <span className="text-slate-400 text-sm">Source IP</span>
//                   <p className="font-mono text-lg">{sensorData.source}</p>
//                 </div>
//                 <div>
//                   <span className="text-slate-400 text-sm">Samples</span>
//                   <p className="font-mono text-lg">{sensorData.num_samples}</p>
//                 </div>
//                 <div>
//                   <span className="text-slate-400 text-sm">Channels</span>
//                   <p className="font-mono text-lg">{sensorData.num_channels}</p>
//                 </div>
//               </div>
//             </CardContent>
//           </Card>
//         )}

//         {/* Statistics Cards */}
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//           <Card className="bg-gradient-to-br from-blue-600 to-blue-700 border-0">
//             <CardHeader>
//               <CardTitle className="text-white text-lg">Channel 1</CardTitle>
//               <CardDescription className="text-blue-100">
//                 Average Value
//               </CardDescription>
//             </CardHeader>
//             <CardContent>
//               <p className="text-4xl font-bold text-white">{stats.ch1}</p>
//             </CardContent>
//           </Card>

//           <Card className="bg-gradient-to-br from-purple-600 to-purple-700 border-0">
//             <CardHeader>
//               <CardTitle className="text-white text-lg">Channel 2</CardTitle>
//               <CardDescription className="text-purple-100">
//                 Average Value
//               </CardDescription>
//             </CardHeader>
//             <CardContent>
//               <p className="text-4xl font-bold text-white">{stats.ch2}</p>
//             </CardContent>
//           </Card>

//           <Card className="bg-gradient-to-br from-pink-600 to-pink-700 border-0">
//             <CardHeader>
//               <CardTitle className="text-white text-lg">Channel 3</CardTitle>
//               <CardDescription className="text-pink-100">
//                 Average Value
//               </CardDescription>
//             </CardHeader>
//             <CardContent>
//               <p className="text-4xl font-bold text-white">{stats.ch3}</p>
//             </CardContent>
//           </Card>
//         </div>

//         {/* Main Chart */}
//         <Card className="bg-slate-800 border-slate-700">
//           <CardHeader>
//             <CardTitle className="text-white">Real-time Sensor Data</CardTitle>
//             <CardDescription className="text-slate-400">
//               Last 100 samples across all channels
//             </CardDescription>
//           </CardHeader>
//           <CardContent>
//             <ResponsiveContainer width="100%" height={400}>
//               <LineChart data={chartData}>
//                 <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
//                 <XAxis
//                   dataKey="index"
//                   stroke="#9ca3af"
//                   label={{
//                     value: "Sample Index",
//                     position: "insideBottom",
//                     offset: -5,
//                     fill: "#9ca3af",
//                   }}
//                 />
//                 <YAxis
//                   stroke="#9ca3af"
//                   domain={[900, 980]}
//                   label={{
//                     value: "Value",
//                     angle: -90,
//                     position: "insideLeft",
//                     fill: "#9ca3af",
//                   }}
//                 />
//                 <Tooltip
//                   contentStyle={{
//                     backgroundColor: "#1e293b",
//                     border: "1px solid #475569",
//                     borderRadius: "6px",
//                     color: "#fff",
//                   }}
//                 />
//                 <Legend />
//                 <Line
//                   type="monotone"
//                   dataKey="channel1"
//                   stroke="#3b82f6"
//                   strokeWidth={2}
//                   dot={false}
//                   name="Channel 1"
//                 />
//                 <Line
//                   type="monotone"
//                   dataKey="channel2"
//                   stroke="#a855f7"
//                   strokeWidth={2}
//                   dot={false}
//                   name="Channel 2"
//                 />
//                 <Line
//                   type="monotone"
//                   dataKey="channel3"
//                   stroke="#ec4899"
//                   strokeWidth={2}
//                   dot={false}
//                   name="Channel 3"
//                 />
//               </LineChart>
//             </ResponsiveContainer>
//           </CardContent>
//         </Card>

//         {/* Recent Samples Table */}
//         {sensorData && (
//           <Card className="bg-slate-800 border-slate-700">
//             <CardHeader>
//               <CardTitle className="text-white">Recent Samples</CardTitle>
//               <CardDescription className="text-slate-400">
//                 First 10 samples from latest packet
//               </CardDescription>
//             </CardHeader>
//             <CardContent>
//               <div className="overflow-x-auto">
//                 <table className="w-full text-sm">
//                   <thead>
//                     <tr className="border-b border-slate-700">
//                       <th className="text-left py-2 px-4 text-slate-400 font-medium">
//                         Sample #
//                       </th>
//                       <th className="text-right py-2 px-4 text-blue-400 font-medium">
//                         Channel 1
//                       </th>
//                       <th className="text-right py-2 px-4 text-purple-400 font-medium">
//                         Channel 2
//                       </th>
//                       <th className="text-right py-2 px-4 text-pink-400 font-medium">
//                         Channel 3
//                       </th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {sensorData.samples.slice(0, 10).map((sample, idx) => (
//                       <tr
//                         key={idx}
//                         className="border-b border-slate-700/50 hover:bg-slate-700/30"
//                       >
//                         <td className="py-2 px-4 text-slate-300">{idx + 1}</td>
//                         <td className="py-2 px-4 text-right font-mono text-blue-300">
//                           {sample[0]}
//                         </td>
//                         <td className="py-2 px-4 text-right font-mono text-purple-300">
//                           {sample[1]}
//                         </td>
//                         <td className="py-2 px-4 text-right font-mono text-pink-300">
//                           {sample[2]}
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             </CardContent>
//           </Card>
//         )}
//       </div>
//     </div>
//   );
// };

// export default UDPSensorVisualizer;

"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Radio } from "lucide-react";

// 3D Trajectory visualization component
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

// Tooltip component
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
        plane === "ch1ch2"
          ? [p.ch1, p.ch2]
          : plane === "ch1ch3"
          ? [p.ch1, p.ch3]
          : [p.ch2, p.ch3];
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    });

    const scaleX = (w - 40) / (maxX - minX || 1);
    const scaleY = (h - 40) / (maxY - minY || 1);

    // Draw gradient trail
    for (let i = 1; i < data.length; i++) {
      const p = data[i];
      const prevP = data[i - 1];
      const t = i / data.length;

      const [px, py] =
        plane === "ch1ch2"
          ? [p.ch1, p.ch2]
          : plane === "ch1ch3"
          ? [p.ch1, p.ch3]
          : [p.ch2, p.ch3];
      const [prevX, prevY] =
        plane === "ch1ch2"
          ? [prevP.ch1, prevP.ch2]
          : plane === "ch1ch3"
          ? [prevP.ch1, prevP.ch3]
          : [prevP.ch2, prevP.ch3];

      const x = 20 + (px - minX) * scaleX;
      const y = h - 20 - (py - minY) * scaleY;
      const prevXScaled = 20 + (prevX - minX) * scaleX;
      const prevYScaled = h - 20 - (prevY - minY) * scaleY;

      const hue = 220 - t * 140;
      ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prevXScaled, prevYScaled);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

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
      plane === "ch1ch2"
        ? ["Ch1", "Ch2"]
        : plane === "ch1ch3"
        ? ["Ch1", "Ch3"]
        : ["Ch2", "Ch3"];
    ctx.fillText(labels[0], w - 35, h - 5);
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
export default function SensorDashboard() {
  const [allData, setAllData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hoverData, setHoverData] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [stats, setStats] = useState({ ch1: 0, ch2: 0, ch3: 0 });
  const socketRef = useRef(null);

  // WebSocket connection
  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8765");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to WebSocket");
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      const newData = JSON.parse(event.data);

      // Transform samples into trajectory points
      const trajectoryPoints = newData.samples.map((sample, idx) => ({
        index: allData.length + idx,
        ch1: sample[0],
        ch2: sample[1],
        ch3: sample[2],
      }));

      setAllData((prev) => [...prev, ...trajectoryPoints]);
      setCurrentIndex((prev) => prev + trajectoryPoints.length);

      // Calculate statistics
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

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-700/50 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold">UDP Sensor 3D Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time 3-channel trajectory visualization
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Badge
            variant={isConnected ? "default" : "secondary"}
            className={`text-sm px-4 py-2 ${
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

      {/* Statistics Cards */}
      <div className="px-6 py-3 grid grid-cols-3 gap-3 border-b border-gray-700/50 shrink-0">
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-700/20 border border-blue-500/30 rounded-lg px-4 py-2">
          <div className="text-xs text-blue-300 font-medium">Channel 1 Avg</div>
          <div className="text-2xl font-bold text-blue-100">{stats.ch1}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-lg px-4 py-2">
          <div className="text-xs text-purple-300 font-medium">
            Channel 2 Avg
          </div>
          <div className="text-2xl font-bold text-purple-100">{stats.ch2}</div>
        </div>
        <div className="bg-gradient-to-br from-pink-600/20 to-pink-700/20 border border-pink-500/30 rounded-lg px-4 py-2">
          <div className="text-xs text-pink-300 font-medium">Channel 3 Avg</div>
          <div className="text-2xl font-bold text-pink-100">{stats.ch3}</div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 p-4 min-h-0">
        {/* 3D View */}
        <div className="flex-[2] bg-gray-900/50 backdrop-blur rounded-lg overflow-hidden min-w-0 border border-gray-700/50">
          <Canvas camera={{ position: [40, 30, 40], fov: 60 }}>
            <ambientLight intensity={0.6} />
            <pointLight position={[20, 20, 20]} intensity={0.8} />
            <pointLight
              position={[-20, -20, -20]}
              intensity={0.4}
              color="#4a9eff"
            />
            {visibleData.length > 0 && (
              <>
                <SensorTrajectory data={visibleData} onHover={handleHover} />
                <Tooltip data={hoverData} position={hoverPos} />
              </>
            )}
            <OrbitControls enableDamping dampingFactor={0.05} />
            <gridHelper args={[100, 20, "#444", "#222"]} />
          </Canvas>
        </div>

        {/* Cross-sections */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">
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

      {/* Timeline Controls */}
      <div className="px-6 py-4 border-t border-gray-700/50 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400 whitespace-nowrap w-32">
            Sample: {currentIndex}
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
            {allData.length} total points
          </span>
        </div>
      </div>
    </div>
  );
}
