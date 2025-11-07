"use client";

import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export function AssistView() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-2xl p-8 text-center">
        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">AI Assistant</h2>
        <p className="text-muted-foreground mb-4">
          Chat-based interface for data analysis, plot generation, and model
          insights
        </p>
        <p className="text-sm text-muted-foreground">
          Coming soon: Ask questions about your data, generate FFT plots,
          Poincaré sections, and run tool-calling functions like
          compute_lyapunov and fit_sindy_model
        </p>
      </Card>
    </div>
  );
}
