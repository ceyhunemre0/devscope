import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitHubHeatmap } from "@/components/GitHubHeatmap";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { DayBucket } from "@/lib/api/types";

type RangeKey = "7d" | "30d" | "90d" | "365d";

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "1 year",
};

const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="text-3xl font-bold tracking-tight mt-1 font-mono">
          {value}
        </p>
        {hint && (
          <p className="text-xs text-muted-foreground/70 mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDay(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DailyBars({ data }: { data: DayBucket[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No commits in this range.</p>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const totalCommits = data.reduce((acc, d) => acc + d.count, 0);
  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  const midIdx = Math.floor(data.length / 2);

  return (
    <div>
      <div className="h-5 mb-2 text-xs flex items-baseline justify-between gap-3">
        {hovered ? (
          <>
            <span className="font-mono text-foreground">{fmtDay(hovered.date)}</span>
            <span className="font-mono text-muted-foreground">
              <span className="text-foreground">{hovered.count}</span> commit
              {hovered.count === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/70">
            {totalCommits} commits across {data.length} day
            {data.length === 1 ? "" : "s"} · peak {max}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] font-mono text-muted-foreground/70 h-32 py-0.5 w-4 text-right">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="flex items-end gap-1 h-32 flex-1">
          {data.map((d, i) => {
            const height = Math.round((d.count / max) * 100);
            const active = hoverIdx === i;
            return (
              <button
                key={d.date}
                type="button"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx(null)}
                aria-label={`${d.date}: ${d.count} commits`}
                className="group flex-1 min-w-[6px] h-full flex flex-col justify-end items-center cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 rounded-t-[2px]"
              >
                <div
                  className={cn(
                    "w-full rounded-t-[2px] transition-colors",
                    active
                      ? "bg-violet-300"
                      : "bg-violet-500/70 group-hover:bg-violet-400",
                  )}
                  style={{
                    height: `${height}%`,
                    minHeight: d.count > 0 ? "2px" : "0",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/70 mt-1 ml-6">
        <span>{fmtDay(data[0].date)}</span>
        {data.length > 2 && <span>{fmtDay(data[midIdx].date)}</span>}
        {data.length > 1 && <span>{fmtDay(data[data.length - 1].date)}</span>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("30d");

  const rangeDays = RANGE_DAYS[range];

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stats", rangeDays],
    queryFn: () => api.getStats(rangeDays),
  });

  const { data: github } = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  const githubLogin = github?.user?.login ?? null;

  const totals = useMemo(() => {
    if (!stats) return { commits: 0, activeDays: 0 };
    const commits = stats.days.reduce((acc, d) => acc + d.count, 0);
    const activeDays = stats.days.filter((d) => d.count > 0).length;
    return { commits, activeDays };
  }, [stats]);

  return (
    <>
      <PageHeader
        crumb="Analytics"
        title="Activity & history"
        lead="Commit volume across all tracked projects, grouped by day."
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex rounded-md border border-border overflow-hidden">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => {
            const active = range === key;
            return (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={cn(
                  "px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-violet-500/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                {RANGE_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">Failed to load stats.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mb-6">
        <StatCard
          label="Commits"
          value={isLoading ? "…" : totals.commits}
        />
        <StatCard
          label="Active days"
          value={isLoading ? "…" : totals.activeDays}
        />
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commits per day</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            stats && <DailyBars data={stats.days} />
          )}
        </CardContent>
      </Card>

      {githubLogin && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              GitHub activity ·{" "}
              <span className="font-mono text-muted-foreground">
                @{githubLogin}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GitHubHeatmap login={githubLogin} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
