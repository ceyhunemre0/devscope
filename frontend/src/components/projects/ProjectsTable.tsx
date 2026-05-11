import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function ProjectsTable() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracked projects</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
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
                  colSpan={4}
                  className="text-center text-muted-foreground py-6"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!isLoading && (!projects || projects.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-6"
                >
                  No projects tracked yet — use a form above.
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              projects &&
              projects.map((project) => (
                <TableRow key={project.id}>
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
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
