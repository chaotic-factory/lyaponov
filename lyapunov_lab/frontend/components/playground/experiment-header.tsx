// @ts-nocheck
"use client";

import { useExperimentStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Activity, Wifi, WifiOff, Clock } from "lucide-react";
import { useEffect, useState } from "react";

export function ExperimentHeader() {
  const { experimentName, runId, isConnected, isRecording, parameters } =
    useExperimentStore();
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setElapsedTime((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="m-4 mb-0 rounded-b-none border-b-0">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{experimentName}</h1>
              <p className="text-sm text-muted-foreground font-mono">{runId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRecording && (
              <Badge variant="destructive" className="animate-pulse">
                ● RECORDING
              </Badge>
            )}
            <Badge
              variant={isConnected ? "default" : "secondary"}
              className="gap-1"
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  Connected
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Disconnected
                </>
              )}
            </Badge>
            {isRecording && (
              <Badge variant="outline" className="gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {formatTime(elapsedTime)}
              </Badge>
            )}
          </div>
        </div>

        {Object.keys(parameters).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">Parameters:</span>
            {Object.entries(parameters).map(([key, value]) => (
              <Badge key={key} variant="outline" className="font-mono">
                {key}: {value}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
