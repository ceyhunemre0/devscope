import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import { openExternal } from "@/lib/external";
import { cn } from "@/lib/utils";
import type { GitHubContribDayOut } from "@/lib/api/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count < 4) return 1;
  if (count < 7) return 2;
  if (count < 10) return 3;
  return 4;
}

const LEVEL_CLS: Record<number, string> = {
  0: "bg-foreground/[0.04]",
  1: "bg-violet-500/30",
  2: "bg-violet-500/55",
  3: "bg-violet-500/80",
  4: "bg-violet-400",
};

interface Cell {
  day: GitHubContribDayOut | null;
}

function buildWeeks(days: GitHubContribDayOut[]): Cell[][] {
  if (days.length === 0) return [];
  const first = new Date(days[0].date);
  const offset = first.getUTCDay();
  const weeks: Cell[][] = [];
  let week: Cell[] = Array.from({ length: offset }, () => ({ day: null }));
  for (const day of days) {
    week.push({ day });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  while (week.length > 0 && week.length < 7) week.push({ day: null });
  if (week.some((c) => c.day !== null)) weeks.push(week);
  return weeks;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return day;
}

export function GitHubHeatmap() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["github-contributions"],
    queryFn: () => api.githubContributions(365),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const [hovered, setHovered] = useState<GitHubContribDayOut | null>(null);

  const weeks = useMemo(() => (data ? buildWeeks(data.days) : []), [data]);

  // Month label row: place a label above the column where a new month starts.
  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    weeks.forEach((week, col) => {
      const firstDay = week.find((c) => c.day !== null)?.day;
      if (!firstDay) return;
      const month = new Date(firstDay.date).getUTCMonth();
      if (month !== prevMonth) {
        labels.push({ col, label: MONTHS[month] });
        prevMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const detail = error instanceof ApiError ? error.detail : String(error);
    const isMissingToken = detail.toLowerCase().includes("not configured");
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isMissingToken ? (
            <p className="text-sm text-muted-foreground">
              Connect GitHub in{" "}
              <Link to="/settings" className="text-foreground hover:underline">
                Settings
              </Link>{" "}
              to see your contribution graph here.
            </p>
          ) : (
            <p className="text-sm text-destructive">{detail}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const handleClick = (day: GitHubContribDayOut) => {
    const url = `https://github.com/${data.login}?tab=overview&from=${day.date}&to=${day.date}`;
    openExternal(url).catch(() => {});
  };

  // Caption for the hovered day (anchored to the right of the title row).
  const caption = hovered
    ? `${hovered.count} contribution${hovered.count === 1 ? "" : "s"} on ${formatDate(hovered.date)}`
    : `${data.total.toLocaleString()} contributions in the last year`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <span>GitHub activity</span>
            <button
              onClick={() => openExternal(`https://github.com/${data.login}`).catch(() => {})}
              className="text-sm font-normal text-muted-foreground hover:text-foreground transition-colors"
            >
              @{data.login} ↗
            </button>
          </CardTitle>
          <p className="text-xs text-muted-foreground font-mono">{caption}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-1">
          <span>
            <span className="font-mono text-foreground">{data.commits}</span> commits
          </span>
          <span>
            <span className="font-mono text-foreground">{data.pull_requests}</span> PRs
          </span>
          <span>
            <span className="font-mono text-foreground">{data.issues}</span> issues
          </span>
          <span>
            <span className="font-mono text-foreground">{data.reviews}</span> reviews
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-flex flex-col gap-1.5">
            {/* Month labels row */}
            <div className="grid grid-flow-col gap-[3px] pl-7 text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }}
            >
              {weeks.map((_, col) => {
                const label = monthLabels.find((m) => m.col === col);
                return (
                  <span key={col} className="h-3 leading-3">
                    {label ? label.label : ""}
                  </span>
                );
              })}
            </div>

            {/* Grid with weekday labels on the left */}
            <div className="flex gap-1.5">
              <div className="flex flex-col gap-[3px] text-[10px] text-muted-foreground pr-1">
                {WEEKDAY_LABELS.map((l, i) => (
                  <span key={i} className="h-3 leading-3 w-5 text-right">
                    {l}
                  </span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((cell, di) => {
                      if (!cell.day) {
                        return <div key={di} className="h-3 w-3" />;
                      }
                      const lvl = levelFor(cell.day.count);
                      return (
                        <button
                          key={di}
                          onMouseEnter={() => setHovered(cell.day)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => handleClick(cell.day!)}
                          className={cn(
                            "h-3 w-3 rounded-[3px] transition-all cursor-pointer",
                            LEVEL_CLS[lvl],
                            "hover:ring-2 hover:ring-violet-300/60 hover:ring-offset-1 hover:ring-offset-background",
                          )}
                          title={`${cell.day.count} on ${formatDate(cell.day.date)}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-1.5 pl-7 mt-1 text-[10px] text-muted-foreground">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((lvl) => (
                <span key={lvl} className={cn("h-3 w-3 rounded-[3px]", LEVEL_CLS[lvl])} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
