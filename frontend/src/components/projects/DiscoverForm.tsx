import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import type { DiscoveredRepo } from "@/lib/api/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DiscoverDialog } from "./DiscoverDialog";

export function DiscoverForm() {
  const [root, setRoot] = useState("");
  const [depth, setDepth] = useState(3);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([]);
  const [successVisible, setSuccessVisible] = useState(false);
  // key to reset dialog state on new scan
  const [dialogKey, setDialogKey] = useState(0);

  const scanMutation = useMutation({
    mutationFn: () => api.discoverRepos(root, depth),
    onSuccess: (data) => {
      setDiscoveredRepos(data);
      setDialogKey((k) => k + 1);
      setDialogOpen(true);
      setErrorMsg(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setErrorMsg(err.detail);
      } else {
        setErrorMsg("Unexpected error. Please try again.");
      }
    },
  });

  useEffect(() => {
    if (!successVisible) return;
    const timer = setTimeout(() => setSuccessVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [successVisible]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessVisible(false);
    scanMutation.mutate();
  }

  function handleBulkSuccess() {
    setSuccessVisible(true);
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <Label htmlFor="discover-root">Root folder</Label>
            <Input
              id="discover-root"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder="/Users/you/Code"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 w-24 shrink-0">
            <Label htmlFor="discover-depth">Depth</Label>
            <Input
              id="discover-depth"
              type="number"
              value={depth}
              min={1}
              max={6}
              onChange={(e) =>
                setDepth(Math.min(6, Math.max(1, Number(e.target.value))))
              }
            />
          </div>
          <Button
            type="submit"
            disabled={scanMutation.isPending || !root.trim()}
            className="shrink-0"
          >
            {scanMutation.isPending ? "Scanning…" : "Scan"}
          </Button>
        </div>

        {errorMsg && (
          <p className="mt-2 text-sm text-destructive">{errorMsg}</p>
        )}
        {successVisible && (
          <p className="mt-2 text-sm text-emerald-500">
            Projects added successfully.
          </p>
        )}
      </form>

      <DiscoverDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        repos={discoveredRepos}
        searchRoot={root}
        onSuccess={handleBulkSuccess}
      />
    </>
  );
}
