"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GraduationCap, Book, Database, FileCode } from "lucide-react"

export function TrainView() {
  const models = [
    { name: "SINDy", description: "Sparse Identification of Nonlinear Dynamics", status: "ready" },
    { name: "Neural ODE", description: "Continuous-depth models for time-evolving systems", status: "ready" },
    { name: "Reservoir Computing", description: "Echo State Networks for temporal modeling", status: "ready" },
    { name: "Koopman Autoencoder", description: "Linear dynamics in learned latent space", status: "ready" },
    { name: "LSTM/GRU Baseline", description: "Recurrent neural network baselines", status: "ready" },
  ]

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Train Models</h1>
        <p className="text-muted-foreground">Train and benchmark models on experimental datasets</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => (
          <Card key={model.name}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <GraduationCap className="h-5 w-5 text-primary" />
                <Badge variant="outline">{model.status}</Badge>
              </div>
              <CardTitle className="text-lg">{model.name}</CardTitle>
              <CardDescription>{model.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="secondary">
                Configure & Train
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Book className="h-5 w-5" />
            Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Model Documentation</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• SINDy: Sparse regression for discovering governing equations</li>
              <li>• Neural ODE: Continuous-depth models (Chen et al. 2018)</li>
              <li>• Koopman: Linear dynamics in latent space (Mezić 2017)</li>
              <li>• Reservoir Computing: Low-cost temporal models (Jaeger 2001)</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Database className="h-4 w-4" />
              Example Datasets
            </h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Lorenz Attractor</Badge>
              <Badge variant="secondary">Rössler System</Badge>
              <Badge variant="secondary">Van der Pol</Badge>
              <Badge variant="secondary">Circuit Experiments</Badge>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Example Configurations
            </h4>
            <Button variant="outline" size="sm">
              View Config Templates
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
