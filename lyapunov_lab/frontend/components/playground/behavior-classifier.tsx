// @ts-nocheck
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { useExperimentStore } from "@/lib/store";

export function BehaviorClassifier() {
  const { behaviorState, lyapunovExponent } = useExperimentStore();

  const getBehaviorColor = (state: string) => {
    switch (state) {
      case "stable":
        return "bg-blue-500";
      case "periodic":
        return "bg-green-500";
      case "quasi-periodic":
        return "bg-yellow-500";
      case "chaotic":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getBehaviorDescription = (state: string) => {
    switch (state) {
      case "stable":
        return "Perturbations decay - Fixed Point";
      case "periodic":
        return "Small perturbations persist - Limit Cycle";
      case "quasi-periodic":
        return "Diverging trajectories - Weakly Chaotic";
      case "chaotic":
        return "Strong divergence - Chaotic Attractor";
      default:
        return "Analyzing system behavior...";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Behavior Classification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current State:</span>
          <Badge className={getBehaviorColor(behaviorState)}>
            {behaviorState.toUpperCase()}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Lyapunov (λ₁):</span>
          <span className="font-mono font-bold">
            {lyapunovExponent !== null ? lyapunovExponent.toFixed(4) : "--"}
          </span>
        </div>

        <div className="bg-secondary/30 p-3 rounded text-sm">
          {getBehaviorDescription(behaviorState)}
        </div>

        <div className="h-24 bg-secondary/30 rounded flex items-center justify-center text-xs text-muted-foreground">
          Lyapunov Timeline Plot
        </div>
      </CardContent>
    </Card>
  );
}
