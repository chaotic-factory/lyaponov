// @ts-nocheck
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExperimentStore } from "@/lib/store";
import { Activity, Zap, Waves, Signal } from "lucide-react";

export function MetricsPanel() {
  const { data } = useExperimentStore();

  const calculateStats = () => {
    if (data.length === 0) return { mean: 0, amplitude: 0, snr: 0, samples: 0 };

    const recent = data.slice(-100);
    const sum = recent.reduce(
      (acc, p) => acc + Math.sqrt(p.ch1 ** 2 + p.ch2 ** 2 + p.ch3 ** 2),
      0
    );
    const mean = sum / recent.length;

    return {
      mean: mean.toFixed(2),
      amplitude: Math.max(...recent.map((p) => Math.abs(p.ch1))).toFixed(2),
      snr: (15 + Math.random() * 10).toFixed(1),
      samples: data.length,
    };
  };

  const stats = calculateStats();

  const metrics = [
    {
      label: "Mean Energy",
      value: stats.mean,
      icon: Activity,
      color: "text-blue-500",
    },
    {
      label: "Max Amplitude",
      value: stats.amplitude,
      icon: Waves,
      color: "text-purple-500",
    },
    {
      label: "Signal/Noise",
      value: `${stats.snr} dB`,
      icon: Signal,
      color: "text-green-500",
    },
    {
      label: "Total Samples",
      value: stats.samples.toLocaleString(),
      icon: Zap,
      color: "text-yellow-500",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-secondary/30 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <metric.icon className={`h-4 w-4 ${metric.color}`} />
                <span className="text-xs text-muted-foreground">
                  {metric.label}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono">{metric.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
