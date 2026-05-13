import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GithubRepo } from "@/lib/api/types";

export function AddFromGitHubForm() {
  const queryClient = useQueryClient();
  const [parentDir, setParentDir] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  const enabled = !!status?.configured && !!status.user;

  const {
    data: repos,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["github-repos"],
    queryFn: api.listGithubRepos,
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  // Without a github_full_name mirror on Project, fall back to matching by
  // the dest path containing the repo name.
  const trackedSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects ?? []) {
      s.add(p.name);
    }
    return s;
  }, [projects]);

  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return repos.slice(0, 50);
    return repos
      .filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [repos, filter]);

  const cloneMutation = useMutation({
    mutationFn: () => {
      if (!selectedRepo) throw new Error("no repo selected");
      const trimmedParent = parentDir.trim().replace(/\/+$/, "");
      const dest = `${trimmedParent}/${selectedRepo.name}`;
      return api.cloneGithubRepo({
        clone_url: selectedRepo.clone_url,
        dest_path: dest,
        name: selectedRepo.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setSelectedRepo(null);
      setSuccessVisible(true);
      setErrorMsg(null);
      setTimeout(() => setSuccessVisible(false), 3000);
    },
    onError: (err: unknown) => {
      setErrorMsg(
        err instanceof ApiError ? err.detail : "Unexpected error. Please try again.",
      );
    },
  });

  if (!status) return null;

  if (!enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect GitHub in{" "}
        <Link to="/settings" className="text-foreground hover:underline">
          Settings
        </Link>{" "}
        to discover repositories from your account.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">@{status.user?.login}</span>.
        Pick a repository and a local parent directory; devscope clones it there and starts tracking.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="gh-filter">Filter</Label>
            <Input
              id="gh-filter"
              placeholder="search repo name or description…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gh-parent">Clone into (parent directory)</Label>
            <Input
              id="gh-parent"
              placeholder="/Users/you/Desktop/Codes"
              value={parentDir}
              onChange={(e) => setParentDir(e.target.value)}
            />
          </div>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading repos…</p>
        )}

        {error && (
          <p className="text-sm text-destructive">
            {error instanceof ApiError ? error.detail : String(error)}
          </p>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {filtered.map((repo) => {
              const isSelected = selectedRepo?.full_name === repo.full_name;
              const isTracked = trackedSet.has(repo.full_name);
              return (
                <button
                  key={repo.full_name}
                  onClick={() => !isTracked && setSelectedRepo(repo)}
                  disabled={isTracked}
                  className={`w-full text-left px-3 py-2 flex flex-wrap items-center gap-2 transition-colors ${
                    isTracked
                      ? "opacity-50 cursor-not-allowed"
                      : isSelected
                        ? "bg-violet-500/10"
                        : "hover:bg-accent/40"
                  }`}
                >
                  <span className="font-medium text-sm">{repo.full_name}</span>
                  {isTracked && (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
                      already tracked
                    </Badge>
                  )}
                  {repo.private && (
                    <Badge variant="outline" className="text-[10px]">private</Badge>
                  )}
                  {repo.description && (
                    <span className="block w-full text-xs text-muted-foreground truncate mt-0.5">
                      {repo.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => cloneMutation.mutate()}
            disabled={
              !selectedRepo ||
              !parentDir.trim() ||
              cloneMutation.isPending
            }
          >
            {cloneMutation.isPending
              ? "Cloning…"
              : selectedRepo
                ? `Clone ${selectedRepo.name}`
                : "Select a repo above"}
          </Button>
          {successVisible && (
            <span className="text-sm text-emerald-500">Cloned and added.</span>
          )}
        </div>

        {errorMsg && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
