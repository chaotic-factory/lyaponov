// @ts-nocheck
"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useRef, useState } from "react";

// WebSocket hook
function useWebSocketData(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [data, setData] = useState<
    Array<{ ch1: number; ch2: number; ch3: number }>
  >([]);

  useEffect(() => {
    let isActive = true;

    const connect = () => {
      if (!isActive) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;

        try {
          const buffer = new Uint16Array(event.data);
          const numSamples = buffer.length / 3;

          const newSamples: Array<{ ch1: number; ch2: number; ch3: number }> =
            [];
          for (let i = 0; i < numSamples; i++) {
            const idx = i * 3;
            // Denormalize from uint16 [0, 65535] to [-25, 25] (Lorenz range)
            const denormalize = (val: number) => (val / 65535) * 50 - 25;

            newSamples.push({
              ch1: denormalize(buffer[idx]),
              ch2: denormalize(buffer[idx + 1]),
              ch3: denormalize(buffer[idx + 2]),
            });
          }

          // Update data, keeping only last 500 points
          setData((prev) => {
            const updated = [...prev, ...newSamples];
            return updated.slice(Math.max(0, updated.length - 500));
          });
        } catch (err) {
          console.error("Parse error:", err);
        }
      };

      ws.onclose = () => {
        console.log("❌ WebSocket disconnected");
        setIsConnected(false);
        if (isActive) {
          setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      isActive = false;
      wsRef.current?.close();
    };
  }, [url]);

  return { isConnected, data };
}

function Trajectory({
  data,
}: {
  data: Array<{ ch1: number; ch2: number; ch3: number }>;
}) {
  const points = data.map((p) => new THREE.Vector3(p.ch1, p.ch2, p.ch3));

  const colors = points.map((_, i) => {
    const t = i / Math.max(points.length - 1, 1);
    return new THREE.Color().setHSL(0.6 - t * 0.4, 0.8, 0.5);
  });

  if (points.length < 2) return null;

  return (
    <>
      {/* @ts-ignore */}
      <Line points={points} vertexColors={colors} lineWidth={2} />
      {points.length > 0 && (
        <mesh
          position={[
            points[points.length - 1].x,
            points[points.length - 1].y,
            points[points.length - 1].z,
          ]}
        >
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="#fce482" />
        </mesh>
      )}
    </>
  );
}

export default function PhaseSpaceView() {
  const { isConnected, data } = useWebSocketData("ws://localhost:8765");
  const wsStatus = isConnected ? "🟢 Connected" : "🔴 Disconnected";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Phase Space / Attractor</span>
          <span className="text-xs font-mono text-muted-foreground">
            {wsStatus} | {data.length} pts
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full bg-secondary/30 rounded-lg overflow-hidden">
          {data.length > 0 ? (
            <Canvas camera={{ position: [40, 40, 40], fov: 60 }}>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={0.8} />
              <pointLight
                position={[-10, -10, -10]}
                intensity={0.4}
                color="#2563eb"
              />
              <Trajectory data={data} />
              <OrbitControls enableDamping dampingFactor={0.05} />
              <gridHelper args={[50, 20, "#64748b", "#22252a"]} />
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {isConnected
                ? "Waiting for data to visualize phase space..."
                : "Connecting to data source..."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
