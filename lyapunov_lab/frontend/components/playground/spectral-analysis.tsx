// @ts-nocheck
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExperimentStore } from "@/lib/store";
import { BarChart3 } from "lucide-react";

export function SpectralAnalysis() {
  const { data, dominantFrequency } = useExperimentStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Spectral Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Dominant Frequency:
            </span>
            <span className="font-mono font-bold">
              {dominantFrequency
                ? `${dominantFrequency.toFixed(2)} Hz`
                : "Computing..."}
            </span>
          </div>
          <div className="h-32 bg-secondary/30 rounded flex items-center justify-center text-sm text-muted-foreground">
            Power Spectrum Visualization
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-secondary/30 p-2 rounded">
              <div className="text-muted-foreground">Peak Power</div>
              <div className="font-mono font-bold">--</div>
            </div>
            <div className="bg-secondary/30 p-2 rounded">
              <div className="text-muted-foreground">Harmonics</div>
              <div className="font-mono font-bold">--</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
