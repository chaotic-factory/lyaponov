// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        console.log("✅ [TimeSeries] WebSocket connected");
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

          // Update data, keeping only last 1000 points
          setData((prev) => {
            const updated = [...prev, ...newSamples];
            return updated.slice(Math.max(0, updated.length - 1000));
          });
        } catch (err) {
          console.error("Parse error:", err);
        }
      };

      ws.onclose = () => {
        console.log("❌ [TimeSeries] WebSocket disconnected");
        setIsConnected(false);
        if (isActive) {
          setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
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

export default function TimeSeriesChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isConnected, data } = useWebSocketData("ws://localhost:8765");
  const wsStatus = isConnected ? "🟢 Live" : "🔴 Offline";
  const numChannels = 3; // Assuming 3 channels from your Python code

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

    // Clear
    ctx.fillStyle = "#1c1e22";
    ctx.fillRect(0, 0, width, height);

    if (data.length < 2) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px Inter";
      ctx.textAlign = "center";
      const message = isConnected
        ? "Waiting for data..."
        : "Connecting to data source...";
      ctx.fillText(message, width / 2, height / 2);
      return;
    }

    const displayData = data;

    let minVal = Number.POSITIVE_INFINITY,
      maxVal = Number.NEGATIVE_INFINITY;
    displayData.forEach((p) => {
      minVal = Math.min(
        minVal,
        p.ch1,
        p.ch2,
        p.ch3 ?? Number.POSITIVE_INFINITY
      );
      maxVal = Math.max(
        maxVal,
        p.ch1,
        p.ch2,
        p.ch3 ?? Number.NEGATIVE_INFINITY
      );
    });

    const padding = { top: 20, right: 30, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const scaleX = chartW / Math.max(displayData.length - 1, 1);
    const scaleY = chartH / (maxVal - minVal || 1);

    // Grid
    ctx.strokeStyle = "#22252a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const channels = [
      { key: "ch1" as const, color: "#2563eb", label: "X" },
      { key: "ch2" as const, color: "#22998d", label: "Y" },
    ];

    if (numChannels >= 3) {
      channels.push({ key: "ch3" as const, color: "#8033cc", label: "Z" });
    }

    channels.forEach(({ key, color }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      displayData.forEach((point, i) => {
        const value = point[key];
        if (value === undefined) return;

        const x = padding.left + i * scaleX;
        const y = height - padding.bottom - (value - minVal) * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Axes
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = minVal + ((maxVal - minVal) / 5) * (5 - i);
      const y = padding.top + (chartH / 5) * i;
      ctx.fillText(val.toFixed(2), padding.left - 8, y + 4);
    }

    // X-axis label
    ctx.textAlign = "center";
    ctx.fillText("Time (samples)", width / 2, height - 10);

    // Legend
    ctx.textAlign = "left";
    channels.forEach(({ color, label }, i) => {
      const x = width - padding.right - 150;
      const y = padding.top + 10 + i * 20;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 30, 3);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(label, x + 35, y + 4);
    });
  }, [data, numChannels, isConnected]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Live Time Series</span>
          <span className="text-xs font-mono text-muted-foreground">
            {wsStatus} | {data.length} samples
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="w-full">
          <canvas ref={canvasRef} className="w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
