import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { ReportListItem } from "@/components/ReportListItem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";

export default function SummariesPage() {
  const [projectId, setProjectId] = useState<string>("");

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const { data: reports, isLoading, error } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.listReports(100),
  });

  const scopedReports = useMemo(() => {
    if (!reports) return [];
    if (!projectId) return reports;
    const pid = Number(projectId);
    return reports.filter((r) => r.project_id === pid);
  }, [reports, projectId]);

  return (
    <>
      <PageHeader
        crumb="Summaries"
        title="AI-generated summaries"
        lead="Standups and rollups produced from your commit activity."
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Select value={projectId} onValueChange={(val) => setProjectId(val ?? "")}>
          <SelectTrigger className="w-[14rem]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All projects</SelectItem>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          <span className="text-violet-300 font-medium">
            {scopedReports.length}
          </span>{" "}
          standup{scopedReports.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">Failed to load summaries.</p>
      )}

      <Card className="ring-violet-500/15 bg-gradient-to-br from-violet-500/[0.04] via-card to-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" />
            Standups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : scopedReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AI summaries yet. Generate one from the Dashboard.
            </p>
          ) : (
            scopedReports.map((r) => <ReportListItem key={r.id} report={r} />)
          )}
        </CardContent>
      </Card>
    </>
  );
}
