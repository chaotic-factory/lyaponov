// @ts-nocheck
"use client";

import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AssistView } from "@/components/assist-view";
import { TrainView } from "@/components/train-view";
import { ExportView } from "@/components/export-view";
import { HelpView } from "@/components/help-view";
import { PlaygroundView } from "@/components/playground-view";

export type ViewType = "playground" | "assist" | "train" | "export" | "help";

export function LyapunovDashboard() {
  const [currentView, setCurrentView] = useState<ViewType>("playground");

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-hidden">
          {currentView === "playground" && <PlaygroundView />}
          {currentView === "assist" && <AssistView />}
          {currentView === "train" && <TrainView />}
          {currentView === "export" && <ExportView />}
          {currentView === "help" && <HelpView />}
        </main>
      </div>
    </SidebarProvider>
  );
}
