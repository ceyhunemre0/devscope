import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ContributionDay } from "@/lib/api/types";

interface Props {
  login: string;
  sinceDays?: number;
}

const LEVEL_BG = [
  "bg-foreground/[0.04]",
  "bg-violet-500/20",
  "bg-violet-500/40",
  "bg-violet-500/60",
  "bg-violet-500/80",
];

function buildWeeks(days: ContributionDay[]): (ContributionDay | null)[][] {
  if (days.length === 0) return [];
  const first = new Date(`${days[0].date}T00:00:00`);
  // Align so the column always starts on Monday (Mon = 0 .. Sun = 6).
  const dow = first.getDay(); // 0 = Sunday .. 6 = Saturday
  const offset = (dow + 6) % 7;
  const weeks: (ContributionDay | null)[][] = [];
  let week: (ContributionDay | null)[] = Array.from(
    { length: offset },
    () => null,
  );
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

export function GitHubHeatmap({ login, sinceDays = 365 }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["github-contributions", login, sinceDays],
    queryFn: () => api.githubContributions(login, sinceDays),
    staleTime: 5 * 60 * 1000,
  });

  const weeks = useMemo(() => (data ? buildWeeks(data.days) : []), [data]);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading contributions…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-sm text-destructive">
        Failed to load contributions
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground">
          {data.total.toLocaleString()}
        </span>{" "}
        contributions in the last {sinceDays} days
      </div>
      <div className="flex gap-[2px] overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {week.map((day, di) => (
              <div
                key={day ? day.date : `empty-${wi}-${di}`}
                className={cn(
                  "h-3 w-3 rounded-sm",
                  day ? (LEVEL_BG[day.level] ?? LEVEL_BG[0]) : "bg-transparent",
                )}
                title={
                  day
                    ? `${day.date}: ${day.count} contribution${
                        day.count === 1 ? "" : "s"
                      }`
                    : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
