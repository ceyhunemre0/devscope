import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ContributionDay } from "@/lib/api/types";

interface Props {
  login: string;
}

const RANGE_OPTIONS = [
  { key: "3m", label: "3 mo", days: 90 },
  { key: "6m", label: "6 mo", days: 180 },
  { key: "1y", label: "1 year", days: 365 },
] as const;

type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];

const LEVEL_BG = [
  "bg-foreground/[0.05]",
  "bg-violet-500/25",
  "bg-violet-500/45",
  "bg-violet-500/70",
  "bg-violet-500",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Pad days into Mon-Sun columns; first column starts on Monday.
function buildWeeks(days: ContributionDay[]): (ContributionDay | null)[][] {
  if (days.length === 0) return [];
  const first = new Date(`${days[0].date}T00:00:00`);
  const dow = first.getDay();          // 0 Sun .. 6 Sat
  const offset = (dow + 6) % 7;        // Mon = 0
  const weeks: (ContributionDay | null)[][] = [];
  let week: (ContributionDay | null)[] = Array.from({ length: offset }, () => null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  while (week.length > 0 && week.length < 7) week.push(null);
  if (week.length === 7) weeks.push(week);
  return weeks;
}

// Compute the month label position for each week column (only when the
// month flips between this week and the previous).
function monthLabels(weeks: (ContributionDay | null)[][]): (string | null)[] {
  const labels: (string | null)[] = [];
  let prevMonth = -1;
  for (const week of weeks) {
    const firstDay = week.find((d) => d != null);
    if (!firstDay) {
      labels.push(null);
      continue;
    }
    const month = new Date(`${firstDay.date}T00:00:00`).getMonth();
    if (month !== prevMonth) {
      labels.push(MONTH_NAMES[month]);
      prevMonth = month;
    } else {
      labels.push(null);
    }
  }
  return labels;
}

interface Stats {
  total: number;
  activeDays: number;
  bestDay: ContributionDay | null;
  currentStreak: number;
  longestStreak: number;
}

function computeStats(days: ContributionDay[]): Stats {
  let total = 0;
  let activeDays = 0;
  let bestDay: ContributionDay | null = null;
  let running = 0;
  let longest = 0;
  for (const day of days) {
    total += day.count;
    if (day.count > 0) {
      activeDays++;
      running++;
      if (running > longest) longest = running;
      if (!bestDay || day.count > bestDay.count) bestDay = day;
    } else {
      running = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else break;
  }
  return { total, activeDays, bestDay, currentStreak: current, longestStreak: longest };
}

function fmtFull(s: string): string {
  const d = new Date(`${s}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function GitHubHeatmap({ login }: Props) {
  const [range, setRange] = useState<RangeKey>("1y");
  const sinceDays =
    RANGE_OPTIONS.find((r) => r.key === range)?.days ?? 365;

  const { data, isLoading, error } = useQuery({
    queryKey: ["github-contributions", login, sinceDays],
    queryFn: () => api.githubContributions(login, sinceDays),
    staleTime: 5 * 60 * 1000,
  });

  const weeks = useMemo(() => (data ? buildWeeks(data.days) : []), [data]);
  const months = useMemo(() => monthLabels(weeks), [weeks]);
  const stats = useMemo(
    () => (data ? computeStats(data.days) : null),
    [data],
  );

  const [hovered, setHovered] = useState<ContributionDay | null>(null);

  return (
    <div className="space-y-4">
      {/* Header: range selector + total */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {RANGE_OPTIONS.map((r) => {
            const active = range === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  active
                    ? "bg-violet-500/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">
            {stats ? stats.total.toLocaleString() : "…"}
          </span>{" "}
          contributions · last{" "}
          <span className="font-mono">{sinceDays}</span> days
        </div>
      </div>

      {/* Hover info pane (fixed height to prevent layout shift) */}
      <div className="h-5 text-xs flex items-baseline gap-3">
        {hovered ? (
          <>
            <span className="font-mono text-foreground">
              {fmtFull(hovered.date)}
            </span>
            <span className="text-muted-foreground">
              <span className="text-foreground font-mono">{hovered.count}</span>{" "}
              contribution{hovered.count === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/70">
            Hover a cell to see its details
          </span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="h-[120px] rounded-md bg-foreground/[0.04] animate-pulse" />
      ) : error ? (
        <p className="text-sm text-destructive">
          Failed to load contributions.
        </p>
      ) : !data ? null : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Month labels row */}
            <div className="flex gap-[3px] pl-7">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="w-[12px] text-[10px] font-mono text-muted-foreground/80"
                >
                  {m}
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-1">
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-[3px] text-[10px] font-mono text-muted-foreground/70 pt-[1px]">
                {/* Mon Tue Wed Thu Fri Sat Sun — only show alternating */}
                <span className="h-3 leading-3">Mon</span>
                <span className="h-3 leading-3" />
                <span className="h-3 leading-3">Wed</span>
                <span className="h-3 leading-3" />
                <span className="h-3 leading-3">Fri</span>
                <span className="h-3 leading-3" />
                <span className="h-3 leading-3" />
              </div>

              {/* Weeks */}
              <div className="flex gap-[3px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((day, di) => {
                      const isHovered = hovered != null && day != null && hovered.date === day.date;
                      return (
                        <button
                          type="button"
                          key={day ? day.date : `empty-${wi}-${di}`}
                          disabled={day == null}
                          onMouseEnter={() => day && setHovered(day)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => day && setHovered(day)}
                          onBlur={() => setHovered(null)}
                          aria-label={
                            day
                              ? `${day.date}: ${day.count} contributions`
                              : undefined
                          }
                          className={cn(
                            "h-3 w-3 rounded-sm transition-transform duration-100 focus:outline-none",
                            day
                              ? cn(
                                  LEVEL_BG[day.level] ?? LEVEL_BG[0],
                                  "cursor-pointer hover:scale-125 focus-visible:ring-1 focus-visible:ring-violet-300",
                                  isHovered &&
                                    "scale-125 ring-1 ring-violet-300",
                                )
                              : "bg-transparent cursor-default",
                          )}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer: legend + streak stats */}
      {stats && !isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            {LEVEL_BG.map((bg, i) => (
              <span key={i} className={cn("h-3 w-3 rounded-sm", bg)} />
            ))}
            <span>More</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono">
            <span>
              Active{" "}
              <span className="text-foreground">{stats.activeDays}d</span>
            </span>
            <span>
              Current streak{" "}
              <span className="text-foreground">{stats.currentStreak}</span>
            </span>
            <span>
              Longest streak{" "}
              <span className="text-foreground">{stats.longestStreak}</span>
            </span>
            {stats.bestDay && (
              <span>
                Best day{" "}
                <span className="text-foreground">
                  {stats.bestDay.count}
                </span>{" "}
                <span className="text-muted-foreground/70">
                  ({stats.bestDay.date})
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
