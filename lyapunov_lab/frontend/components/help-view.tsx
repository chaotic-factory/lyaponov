"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function HelpView() {
  const router = useRouter();
  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Help & Resources</h1>
        <p className="text-muted-foreground">
          Documentation, tutorials, and support
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Documentation
            </CardTitle>
            <CardDescription>
              Comprehensive guides and API references
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              Getting Started
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              User Guide
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              API Reference
              <ExternalLink className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>Remove stored recordings</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
              onClick={() => router.push("/help/delete-recordings")}
            >
              Delete Recordings
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tutorials</CardTitle>
            <CardDescription>
              Step-by-step guides for common tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              Setting Up Experiments
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              Analyzing Chaotic Systems
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              Training Models
              <ExternalLink className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Support
            </CardTitle>
            <CardDescription>Get help from our team</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Contact Support</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
            <CardDescription>Important resources</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              Main Website
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              className="w-full justify-between bg-transparent"
              variant="outline"
            >
              GitHub Repository
              <ExternalLink className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
