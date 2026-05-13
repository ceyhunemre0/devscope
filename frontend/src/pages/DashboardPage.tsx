import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ReportContent } from "@/components/ReportContent";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";

export default function DashboardPage() {
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<string>("auto");
  const [sinceHours, setSinceHours] = useState<number>(24);
  const [projectId, setProjectId] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.getDashboard,
  });

  const { data: latestReport } = useQuery({
    queryKey: ["latest-report"],
    queryFn: () =>
      api.listReports({ type: null, limit: 1 }).then((rs) => rs[0] ?? null),
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const runMutation = useMutation({
    mutationFn: () =>
      api.runToday({
        since_hours: sinceHours,
        provider,
        project_id: projectId ? Number(projectId) : null,
      }),
    onSuccess: () => {
      setRunError(null);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["latest-report"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setRunError(err.detail);
      } else {
        setRunError("Unexpected error. Please try again.");
      }
    },
  });

  const llmBadge = () => (
    <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/20">
      <Link to="/settings" className="hover:underline">
        configure
      </Link>
    </Badge>
  );

  return (
    <>
      <PageHeader
        crumb="Dashboard"
        title={
          <>
            What&apos;s <span className="shimmer-word">happening</span> in your dev life
          </>
        }
        lead="AI-summarised activity across your projects, commits, and contributions."
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Projects
            </p>
            <p className="text-3xl font-bold tracking-tight mt-1">
              {dashboard?.active_projects ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Reports this week
            </p>
            <p className="text-3xl font-bold tracking-tight mt-1">
              {dashboard?.reports_this_week ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              LLM Provider
            </p>
            <div className="mt-1">{llmBadge()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Generate standup card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Generate standup</CardTitle>
              <CardDescription className="mt-1">
                Summarise the last N hours of commits across all tracked projects (or a single one).
              </CardDescription>
            </div>

            {/* Inline form */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select value={projectId} onValueChange={(val) => setProjectId(val ?? "")}>
                <SelectTrigger className="w-[10rem]">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All projects</SelectItem>
                  {projectsLoading ? (
                    <SelectItem value="_loading" disabled>
                      Loading projects…
                    </SelectItem>
                  ) : (
                    projects?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Select value={provider} onValueChange={(val) => setProvider(val as string)}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">auto</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="number"
                value={sinceHours}
                onChange={(e) => setSinceHours(Number(e.target.value))}
                min={1}
                max={720}
                className="w-[6rem]"
                aria-label="Hours to look back"
              />

              <Button
                variant="default"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                className="gap-1.5"
              >
                <Play size={14} strokeWidth={2} />
                {runMutation.isPending ? "generating…" : "Run"}
              </Button>
            </div>
          </div>

          {runError && (
            <p className="mt-2 text-sm text-destructive">{runError}</p>
          )}
        </CardHeader>

        {/* Latest report content */}
        <CardContent className="border-t border-border pt-4">
          {latestReport ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  latest · {formatDate(latestReport.generated_at)} ·{" "}
                  <span className="font-medium text-foreground/70">
                    {latestReport.type}
                  </span>
                </span>
                <Link
                  to="/analytics"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  view all →
                </Link>
              </div>
              <ReportContent content={latestReport.content} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No reports yet. Click Run to generate your first standup.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
