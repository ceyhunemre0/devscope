import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportListItem } from "@/components/ReportListItem";
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
                        <span className="font-medium">{project.name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
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
                        <TableCell colSpan={5} className="p-4">
                          <ProjectReports projectId={project.id} />
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
