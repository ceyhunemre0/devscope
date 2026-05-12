import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { StatsOut } from "@/lib/api/types";

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

function rangeSince(key: RangeKey): Date {
  const now = new Date();
  switch (key) {
    case "today": {
      const t = new Date(now);
      t.setHours(0, 0, 0, 0);
      return t;
    }
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "all":
      return new Date("1970-01-01T00:00:00Z");
  }
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "pos" | "neg";
}) {
  const valueCls =
    tone === "pos"
      ? "text-emerald-400"
      : tone === "neg"
        ? "text-rose-400"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className={cn("text-3xl font-bold tracking-tight mt-1 font-mono", valueCls)}>
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

function DailyBars({ data }: { data: StatsOut["by_day"] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No commits in this range.</p>
    );
  }

  const max = Math.max(...data.map((d) => d.commits), 1);
  const totalCommits = data.reduce((acc, d) => acc + d.commits, 0);
  const hovered = hoverIdx != null ? data[hoverIdx] : null;
  const midIdx = Math.floor(data.length / 2);

  return (
    <div>
      {/* Readout — fixed height so the chart doesn't jump on hover */}
      <div className="h-5 mb-2 text-xs flex items-baseline justify-between gap-3">
        {hovered ? (
          <>
            <span className="font-mono text-foreground">{fmtDay(hovered.date)}</span>
            <span className="font-mono text-muted-foreground">
              <span className="text-foreground">{hovered.commits}</span> commit
              {hovered.commits === 1 ? "" : "s"} ·{" "}
              <span className="text-emerald-400">+{hovered.insertions}</span>{" "}
              <span className="text-rose-400">−{hovered.deletions}</span>
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/70">
            {totalCommits} commits across {data.length} day
            {data.length === 1 ? "" : "s"} · peak {max}
          </span>
        )}
      </div>

      {/* Plot area: y-axis labels + bars */}
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] font-mono text-muted-foreground/70 h-32 py-0.5 w-4 text-right">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="flex items-end gap-1 h-32 flex-1">
          {data.map((d, i) => {
            const height = Math.round((d.commits / max) * 100);
            const active = hoverIdx === i;
            return (
              <button
                key={d.date}
                type="button"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx(null)}
                aria-label={`${d.date}: ${d.commits} commits, +${d.insertions} −${d.deletions}`}
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
                    minHeight: d.commits > 0 ? "2px" : "0",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/70 mt-1 ml-6">
        <span>{fmtDay(data[0].date)}</span>
        {data.length > 2 && <span>{fmtDay(data[midIdx].date)}</span>}
        {data.length > 1 && <span>{fmtDay(data[data.length - 1].date)}</span>}
      </div>
    </div>
  );
}

function ProjectBreakdown({ data }: { data: StatsOut["by_project"] }) {
  if (data.length === 0) return null;
  const maxCommits = Math.max(...data.map((p) => p.commits), 1);
  return (
    <div className="space-y-2">
      {data.slice(0, 10).map((p) => {
        const widthPct = (p.commits / maxCommits) * 100;
        return (
          <div key={p.project_id} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm gap-3">
              <span className="font-medium truncate">{p.project_name}</span>
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                {p.commits} commits ·{" "}
                <span className="text-emerald-400">+{p.insertions}</span>{" "}
                <span className="text-rose-400">−{p.deletions}</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full bg-violet-500/70 rounded-full transition-all"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [projectId, setProjectId] = useState<string>("");
  const [mineOnly, setMineOnly] = useState<boolean>(true);

  const since = useMemo(() => rangeSince(range), [range]);
  const sinceIso = since.toISOString();

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const { data: github } = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stats", sinceIso, projectId, mineOnly],
    queryFn: () =>
      api.stats({
        since: sinceIso,
        project_id: projectId ? Number(projectId) : undefined,
        commits_limit: 200,
        mine_only: mineOnly,
      }),
  });

  return (
    <>
      <PageHeader
        crumb="Analytics"
        title="Activity & history"
        lead="Commit volume, line churn, per-project breakdown, and full commit history."
      />

      {/* Controls */}
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

        <Select value={projectId} onValueChange={(val) => setProjectId(val ?? "")}>
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

        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setMineOnly(true)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              mineOnly
                ? "bg-violet-500/15 text-foreground"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
            title={
              github?.login
                ? `Match commits authored by @${github.login}`
                : "Match commits authored with your local git identity"
            }
          >
            Mine only
          </button>
          <button
            onClick={() => setMineOnly(false)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              !mineOnly
                ? "bg-violet-500/15 text-foreground"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
            title="Count every author's commits in these repos"
          >
            All authors
          </button>
        </div>
      </div>

      {/* Identity hint */}
      {stats?.mine_only && (
        <p className="text-[11px] text-muted-foreground/70 mb-4 font-mono">
          filtered to{" "}
          {stats.identity_emails.length > 0
            ? stats.identity_emails.join(", ")
            : "your local git identity"}
          {github?.login && ` · @${github.login}`}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive mb-4">
          Failed to load stats.
        </p>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Commits"
          value={isLoading ? "…" : stats?.total_commits ?? 0}
        />
        <StatCard
          label="Active days"
          value={isLoading ? "…" : stats?.active_days ?? 0}
        />
        <StatCard
          label="Insertions"
          value={isLoading ? "…" : `+${stats?.total_insertions ?? 0}`}
          tone="pos"
        />
        <StatCard
          label="Deletions"
          value={isLoading ? "…" : `−${stats?.total_deletions ?? 0}`}
          tone="neg"
        />
      </div>

      {/* Daily bars */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commits per day</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            stats && <DailyBars data={stats.by_day} />
          )}
        </CardContent>
      </Card>

      {/* Project breakdown (only when scope = all) */}
      {!projectId && stats && stats.by_project.length > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By project</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectBreakdown data={stats.by_project} />
          </CardContent>
        </Card>
      )}

      {/* Commit list */}
      {stats && stats.commits.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Commits{" "}
              <span className="text-xs font-normal text-muted-foreground">
                · newest first · {stats.commits.length} shown
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CommitList commits={stats.commits} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function CommitList({ commits }: { commits: StatsOut["commits"] }) {
  if (commits.length === 0) return null;
  return (
    <div className="rounded-lg border border-border divide-y divide-border max-h-[480px] overflow-y-auto">
      {commits.map((c) => (
        <div key={c.sha} className="px-3 py-2 hover:bg-accent/30 transition-colors">
          <div className="flex flex-wrap items-baseline gap-2">
            <code className="text-[10px] font-mono text-muted-foreground">
              {c.sha.slice(0, 7)}
            </code>
            <span className="text-xs text-muted-foreground">
              {new Date(c.occurred_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs font-medium text-violet-300">
              {c.project_name}
            </span>
            <span className="ml-auto text-xs font-mono text-muted-foreground shrink-0">
              <span className="text-emerald-400">+{c.insertions}</span>{" "}
              <span className="text-rose-400">−{c.deletions}</span>
            </span>
          </div>
          <p className="text-sm text-foreground mt-0.5 truncate">{c.subject}</p>
        </div>
      ))}
    </div>
  );
}
