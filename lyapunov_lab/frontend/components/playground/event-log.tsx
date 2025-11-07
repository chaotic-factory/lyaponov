// @ts-nocheck
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList } from "lucide-react";

export function EventLog() {
  const events = [
    { time: "10:23:45", type: "info", message: "Experiment started" },
    { time: "10:23:47", type: "success", message: "Connected to data stream" },
    { time: "10:24:12", type: "warning", message: "High amplitude detected" },
    { time: "10:24:30", type: "info", message: "Behavior: PERIODIC → CHAOTIC" },
  ];

  const getEventColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      case "error":
        return "text-red-500";
      default:
        return "text-blue-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Event Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {events.map((event, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="font-mono text-muted-foreground text-xs">
                  {event.time}
                </span>
                <span className={`${getEventColor(event.type)} font-bold`}>
                  ●
                </span>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
