import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { ReportContent } from "@/components/ReportContent";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/format";

export default function ReportsPage() {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.listReports(100),
  });

  return (
    <>
      <PageHeader
        crumb="Reports"
        title="Standup history"
        lead="Every standup you've generated, newest first."
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && (!reports || reports.length === 0) && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No reports yet. Generate one from the Dashboard.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && reports && reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <details
              key={report.id}
              className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden"
            >
              <summary className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer list-none select-none hover:bg-accent/50 transition-colors">
                <Badge variant="outline" className="shrink-0 capitalize">
                  {report.type}
                </Badge>
                <span className="text-sm font-medium text-foreground">
                  {formatDate(report.generated_at)}
                </span>
                {report.period_start && report.period_end && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatDate(report.period_start)} → {formatDate(report.period_end)}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground group-open:rotate-180 transition-transform">
                  ▾
                </span>
              </summary>
              <div className="px-4 pb-4 pt-2">
                <ReportContent content={report.content} />
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
