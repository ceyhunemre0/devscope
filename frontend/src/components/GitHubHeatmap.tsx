import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import type { GitHubContribDayOut } from "@/lib/api/types";

function buildWeeks(days: GitHubContribDayOut[]): GitHubContribDayOut[][] {
  if (days.length === 0) return [];
  const weeks: GitHubContribDayOut[][] = [];
  const first = new Date(days[0].date);
  const offset = first.getUTCDay(); // 0 = Sunday, matches GitHub
  let current: (GitHubContribDayOut | null)[] = Array(offset).fill(null);
  for (const day of days) {
    current.push(day);
    if (current.length === 7) {
      weeks.push(current.filter((d): d is GitHubContribDayOut => d !== null));
      current = [];
    }
  }
  if (current.length > 0) {
    weeks.push(current.filter((d): d is GitHubContribDayOut => d !== null));
  }
  return weeks;
}

export function GitHubHeatmap() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["github-contributions"],
    queryFn: () => api.githubContributions(365),
    retry: false,
    staleTime: 5 * 60_000,
  });

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

  const weeks = buildWeeks(data.days);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <CardTitle>GitHub activity · @{data.login}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {data.total.toLocaleString()} contributions in the last year ·{" "}
              <span className="font-mono">{data.commits}</span> commits ·{" "}
              <span className="font-mono">{data.pull_requests}</span> PRs ·{" "}
              <span className="font-mono">{data.issues}</span> issues ·{" "}
              <span className="font-mono">{data.reviews}</span> reviews
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className="h-[10px] w-[10px] rounded-[2px]"
                    style={{ backgroundColor: day.color }}
                    title={`${day.date} · ${day.count} contributions`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
