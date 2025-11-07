"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Activity,
  MessageSquare,
  GraduationCap,
  Download,
  HelpCircle,
} from "lucide-react";
import type { ViewType } from "@/components/lyapunov-dashboard";
import { ModeToggle } from "./ui/mode-toggle";
import Image from "next/image";

interface AppSidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function AppSidebar({ currentView, onViewChange }: AppSidebarProps) {
  const menuItems = [
    { id: "playground" as const, label: "Playground", icon: Activity },
    { id: "assist" as const, label: "Assist", icon: MessageSquare },
    { id: "train" as const, label: "Train", icon: GraduationCap },
    { id: "export" as const, label: "Export", icon: Download },
    { id: "help" as const, label: "Help", icon: HelpCircle },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="relative h-18 w-18">
            <Image
              src="/lyapunov-logo.png"
              alt="Lyapunov Logo"
              fill
              className="rounded-lg object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Lyapunov</h1>
            <p className="text-xs text-muted-foreground">Dynamical Visualization</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="p-2">
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={currentView === item.id}
                onClick={() => onViewChange(item.id)}
                className="w-full"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">v1.0.0 | Research Mode</p>
        <ModeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
