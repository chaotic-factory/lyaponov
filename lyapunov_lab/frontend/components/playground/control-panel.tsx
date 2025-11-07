// @ts-nocheck
"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useExperimentStore, type WebSocketMessage } from "@/lib/store";
import {
  Play,
  Pause,
  RotateCcw,
  Radio,
  Download,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function ControlPanel() {
  const {
    isConnected,
    isPlaying,
    isRecording,
    data,
    numChannels,
    setConnected,
    setPlaying,
    setRecording,
    addDataPoints,
    reset,
    setBehaviorState,
    setLyapunovExponent,
    setNumChannels,
  } = useExperimentStore();

  const socketRef = useRef<WebSocket | null>(null);
  const [wsUrl, setWsUrl] = useState("ws://localhost:8765");
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected) {
      // Clean up existing connection
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      return;
    }

    // Establish WebSocket connection
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log("[v0] WebSocket connected to", wsUrl);
          toast({
            title: "Connected",
            description: `Connected to ${wsUrl}`,
          });
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log("[v0] Received data:", {
              source: message.source,
              numSamples: message.num_samples,
              numChannels: message.num_channels,
            });

            // Update channel count if it changed
            if (message.num_channels !== numChannels) {
              setNumChannels(message.num_channels);
            }

            // Convert samples to DataPoint format
            const newPoints = message.samples.map((sample, idx) => {
              const baseIndex = data.length + idx;
              return {
                index: baseIndex,
                timestamp: Date.now() + idx,
                ch1: sample[0] || 0,
                ch2: sample[1] || 0,
                ch3: sample[2], // Will be undefined for 2-channel systems
              };
            });

            addDataPoints(newPoints);

            // Periodically estimate Lyapunov exponent (simple heuristic)
            if (data.length % 500 === 0 && data.length > 1000) {
              // Calculate variance as a simple proxy for system behavior
              const recent = data.slice(-1000);
              const variance =
                recent.reduce((sum, p) => {
                  const v1 = p.ch1 * p.ch1;
                  const v2 = p.ch2 * p.ch2;
                  const v3 = p.ch3 ? p.ch3 * p.ch3 : 0;
                  return sum + v1 + v2 + v3;
                }, 0) / recent.length;

              // Rough classification based on variance
              let lambda: number;
              if (variance < 0.5) {
                lambda = -0.1;
                setBehaviorState("stable");
              } else if (variance < 2) {
                lambda = 0.02;
                setBehaviorState("periodic");
              } else if (variance < 10) {
                lambda = 0.15;
                setBehaviorState("quasi-periodic");
              } else {
                lambda = 0.4;
                setBehaviorState("chaotic");
              }

              setLyapunovExponent(lambda);
            }
          } catch (error) {
            console.error("[v0] Error parsing WebSocket message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("[v0] WebSocket error:", error);
          toast({
            title: "Connection Error",
            description: "Failed to connect to WebSocket server",
            variant: "destructive",
          });
        };

        ws.onclose = () => {
          console.log("[v0] WebSocket disconnected");
          socketRef.current = null;

          // Attempt to reconnect if still marked as connected
          if (isConnected) {
            toast({
              title: "Disconnected",
              description: "Attempting to reconnect...",
            });
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isConnected) {
                connectWebSocket();
              }
            }, 2000);
          }
        };
      } catch (error) {
        console.error("[v0] Failed to create WebSocket:", error);
        toast({
          title: "Connection Failed",
          description: "Could not establish WebSocket connection",
          variant: "destructive",
        });
      }
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [
    isConnected,
    wsUrl,
    data.length,
    addDataPoints,
    setBehaviorState,
    setLyapunovExponent,
    setNumChannels,
    numChannels,
    toast,
  ]);

  const handleConnect = () => {
    setConnected(!isConnected);
    if (!isConnected) {
      setRecording(true);
      setPlaying(true);
    } else {
      setRecording(false);
      setPlaying(false);
    }
  };

  return (
    <Card className="m-4 mt-0 rounded-t-none border-t-0">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Button
            onClick={handleConnect}
            variant={isConnected ? "destructive" : "default"}
            className="gap-2"
          >
            <Radio className="h-4 w-4" />
            {isConnected ? "Disconnect" : "Connect & Start"}
          </Button>

          <Button
            onClick={() => setPlaying(!isPlaying)}
            variant={isPlaying ? "secondary" : "outline"}
            disabled={!isConnected}
            className="gap-2"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isPlaying ? "Pause" : "Play"}
          </Button>

          <Button
            onClick={reset}
            variant="outline"
            className="gap-2 bg-transparent"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>

          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Sample: {data.length}
              </span>
              <Slider
                value={[Math.max(0, data.length - 1)]}
                max={Math.max(0, data.length - 1)}
                step={1}
                disabled={data.length === 0}
                className="flex-1"
              />
            </div>
          </div>

          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>

          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
