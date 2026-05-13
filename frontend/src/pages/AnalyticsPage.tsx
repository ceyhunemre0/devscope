import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCommit } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CommitListItem, DayBucket } from "@/lib/api/types";

type RangeKey = "2d" | "7d" | "30d" | "90d" | "365d";

const RANGE_LABELS: Record<RangeKey, string> = {
  "2d": "2 days",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "365d": "1 year",
};

const RANGE_DAYS: Record<RangeKey, number> = {
  "2d": 2,
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

function fmtRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < hour) {
    const m = Math.max(1, Math.round(diffMs / minute));
    return `${m}m ago`;
  }
  if (diffMs < day) {
    const h = Math.round(diffMs / hour);
    return `${h}h ago`;
  }
  if (diffMs < 7 * day) {
    const d = Math.round(diffMs / day);
    return `${d}d ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DailyBars({ data }: { data: DayBucket[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No commits in this range.
      </p>
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
            <span className="font-mono text-foreground">
              {fmtDay(hovered.date)}
            </span>
            <span className="font-mono text-muted-foreground">
              <span className="text-foreground">{hovered.count}</span> commit
              {hovered.count === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/70">
            {totalCommits} commits · {data.length} day
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
        {data.length > 1 && (
          <span>{fmtDay(data[data.length - 1].date)}</span>
        )}
      </div>
    </div>
  );
}

function CommitHistory({
  rangeDays,
  projectId,
}: {
  rangeDays: number;
  projectId: number | null;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["commit-history", rangeDays, projectId],
    queryFn: () =>
      api.listRecentCommits(rangeDays, projectId ?? undefined),
    staleTime: 60_000,
  });

  const grouped = useMemo(() => {
    const items = data ?? [];
    const map = new Map<string, CommitListItem[]>();
    for (const c of items) {
      const d = new Date(c.occurred_at);
      const key = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
  }, [data]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load commit history.</p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No commits in this range.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map(({ day, items }) => (
        <div key={day} className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-muted-foreground/80">
            <span>{day}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono">{items.length}</span>
          </div>
          <div className="rounded-lg border border-border divide-y divide-border">
            {items.map((c) => (
              <CommitRow key={`${c.project_id}-${c.sha}`} commit={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommitRow({ commit }: { commit: CommitListItem }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 hover:bg-accent/30 transition-colors">
      <GitCommit
        size={14}
        strokeWidth={1.75}
        className="mt-1 text-violet-400 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">{commit.message}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80 font-mono">
          <span className="text-muted-foreground">
            {commit.project_name}
          </span>
          <span>{commit.sha.slice(0, 7)}</span>
          <span>{fmtRelative(commit.occurred_at)}</span>
          {(commit.additions > 0 || commit.deletions > 0) && (
            <span>
              <span className="text-emerald-400">+{commit.additions}</span>{" "}
              <span className="text-rose-400">−{commit.deletions}</span>
            </span>
          )}
          {commit.files_changed > 0 && (
            <span>
              {commit.files_changed} file{commit.files_changed === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("2d");
  const [projectFilter, setProjectFilter] = useState<string>("");

  const rangeDays = RANGE_DAYS[range];

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stats", rangeDays],
    queryFn: () => api.getStats(rangeDays),
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const totals = useMemo(() => {
    if (!stats) return { commits: 0, activeDays: 0 };
    const commits = stats.days.reduce((acc, d) => acc + d.count, 0);
    const activeDays = stats.days.filter((d) => d.count > 0).length;
    return { commits, activeDays };
  }, [stats]);

  const projectIdNum = projectFilter ? Number(projectFilter) : null;

  return (
    <>
      <PageHeader
        crumb="Analytics"
        title="Activity & history"
        lead="Commit volume and timeline across all tracked projects."
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

        <Select
          value={projectFilter}
          onValueChange={(v) => setProjectFilter(v ?? "")}
        >
          <SelectTrigger className="w-[12rem]">
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commit history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] overflow-y-auto pr-1">
            <CommitHistory rangeDays={rangeDays} projectId={projectIdNum} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
