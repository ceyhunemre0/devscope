import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { ReportListItem } from "@/components/ReportListItem";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api/client";

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
            <ReportListItem key={report.id} report={report} />
          ))}
        </div>
      )}
    </>
  );
}
