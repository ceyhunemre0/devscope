import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportListItem } from "@/components/ReportListItem";
import { ProjectCommitSuggester } from "@/components/projects/ProjectCommitSuggester";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function WorkingTreeBadge({ projectId }: { projectId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["working-tree-status", projectId],
    queryFn: () => api.workingTreeStatus(projectId),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading || error || !data) return null;

  if (!data.has_changes) return null;

  return (
    <Badge
      className="bg-amber-500/15 text-amber-300 border-amber-500/20 text-[10px] uppercase tracking-wide"
      title="Uncommitted changes — expand for details"
    >
      Uncommitted
    </Badge>
  );
}

function WorkingTreeDetails({ projectId }: { projectId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["working-tree-status", projectId],
    queryFn: () => api.workingTreeStatus(projectId),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Checking working tree…</p>
    );
  }
  if (error || !data) return null;

  if (!data.has_changes) {
    return (
      <p className="text-xs text-muted-foreground">
        Working tree is clean — nothing to commit.
      </p>
    );
  }

  const trackedFiles = data.files_changed;
  const totalFiles = trackedFiles + data.untracked_count;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="font-mono">
        {totalFiles} {totalFiles === 1 ? "file" : "files"}
      </span>
      {trackedFiles > 0 && (
        <>
          <span className="font-mono text-emerald-400">+{data.insertions}</span>
          <span className="font-mono text-rose-400">−{data.deletions}</span>
        </>
      )}
      {data.untracked_count > 0 && (
        <span className="font-mono">{data.untracked_count} untracked</span>
      )}
    </div>
  );
}

function ProjectReports({ projectId }: { projectId: number }) {
  const { data: reports, isLoading, error } = useQuery({
    queryKey: ["reports", "project", projectId],
    queryFn: () => api.listReports(100, projectId),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading reports…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load reports.
      </p>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reports for this project yet. Generate one from the Dashboard.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <ReportListItem key={report.id} report={report} />
      ))}
    </div>
  );
}

export function ProjectsTable() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  function toggle(id: number) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracked projects</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" aria-hidden />
              <TableHead>Name</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-6"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!isLoading && (!projects || projects.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-6"
                >
                  No projects tracked yet — use a form above.
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              projects &&
              projects.map((project) => {
                const isOpen = expandedId === project.id;
                return (
                  <Fragment key={project.id}>
                    <TableRow
                      onClick={() => toggle(project.id)}
                      aria-expanded={isOpen}
                      className="cursor-pointer hover:bg-accent/40 transition-colors"
                    >
                      <TableCell className="text-muted-foreground">
                        <span
                          className={`inline-block text-xs transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                          aria-hidden
                        >
                          ▸
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{project.name}</span>
                          <WorkingTreeBadge projectId={project.id} />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <span
                          className="block truncate font-mono text-xs text-muted-foreground"
                          title={project.path}
                        >
                          {project.path}
                        </span>
                      </TableCell>
                      <TableCell>
                        {project.state === "active" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                            {project.state}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{project.state}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(project.last_activity_at)}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={5} className="p-4 space-y-4">
                          <div className="rounded-lg border border-border bg-card p-3">
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Working tree
                            </h4>
                            <WorkingTreeDetails projectId={project.id} />
                          </div>
                          <ProjectCommitSuggester projectId={project.id} />
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Reports
                            </h4>
                            <ProjectReports projectId={project.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
