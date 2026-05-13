import { Badge } from "@/components/ui/badge";
import { ReportContent } from "@/components/ReportContent";
import { formatDate } from "@/lib/format";
import type { Report } from "@/lib/api/types";

interface ReportListItemProps {
  report: Report;
}

export function ReportListItem({ report }: ReportListItemProps) {
  return (
    <details className="group rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
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
  );
}
