"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, ImageIcon, Database } from "lucide-react";

export function ExportView() {
  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Export Data</h1>
        <p className="text-muted-foreground">
          Download plots, datasets, and analysis results
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Export Plots
            </CardTitle>
            <CardDescription>
              Download visualizations as PNG or SVG
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full bg-transparent" variant="outline">
              Time Series (PNG)
            </Button>
            <Button className="w-full bg-transparent" variant="outline">
              Phase Space (PNG)
            </Button>
            <Button className="w-full bg-transparent" variant="outline">
              Spectral Analysis (PNG)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Export Data
            </CardTitle>
            <CardDescription>
              Download raw and processed datasets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full bg-transparent" variant="outline">
              Raw Data (CSV)
            </Button>
            <Button className="w-full bg-transparent" variant="outline">
              Processed Data (CSV)
            </Button>
            <Button className="w-full bg-transparent" variant="outline">
              Complete Export (ZIP)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Export Reports
            </CardTitle>
            <CardDescription>Generate analysis reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full bg-transparent" variant="outline">
              Experiment Summary (PDF)
            </Button>
            <Button className="w-full bg-transparent" variant="outline">
              Analysis Report (PDF)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Quick Export
            </CardTitle>
            <CardDescription>Export current view instantly</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Export Current View</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
