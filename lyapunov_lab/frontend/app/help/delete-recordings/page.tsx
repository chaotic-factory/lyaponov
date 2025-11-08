"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Recording {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  data: any[];
  parameters?: any;
}

export default function DeleteRecordingsView() {
  const [recordings, setRecordings] = useState<Recording[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("nld_recordings");
      setRecordings(stored ? JSON.parse(stored) : []);
    } catch {
      setRecordings([]);
    }
  }, []);

  function deleteRecording(id: string) {
    const updated = recordings.filter((r) => r.id !== id);
    setRecordings(updated);
    localStorage.setItem("nld_recordings", JSON.stringify(updated));
    toast.success("Recording deleted");
  }

  function clearAll() {
    localStorage.removeItem("nld_recordings");
    setRecordings([]);
    toast.info("All recordings deleted");
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">🗑 Delete Recordings</h1>
          <p className="text-muted-foreground">
            Manage and remove saved recordings from your browser storage.
          </p>
        </div>

        {recordings.length === 0 ? (
          <div className="text-center py-16 space-y-3 text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto text-yellow-500" />
            <p className="text-lg font-semibold">No recordings found</p>
            <p className="text-sm">Recordings will appear here once saved.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                variant="destructive"
                onClick={clearAll}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete All
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {recordings.map((rec) => (
                <Card key={rec.id} className="relative">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {rec.name || "Untitled Recording"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>
                      <span className="text-muted-foreground">Samples:</span>{" "}
                      {rec.data.length}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Duration:</span>{" "}
                      {rec.duration.toFixed(2)}s
                    </p>
                    <p>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      {new Date(rec.timestamp).toLocaleString()}
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteRecording(rec.id)}
                      className="mt-2 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
