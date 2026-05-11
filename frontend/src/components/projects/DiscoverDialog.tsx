import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { DiscoveredRepo, AddProjectIn } from "@/lib/api/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DiscoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: DiscoveredRepo[];
  searchRoot: string;
  onSuccess: () => void;
}

interface RepoRow {
  path: string;
  name: string;
  checked: boolean;
}

export function DiscoverDialog({
  open,
  onOpenChange,
  repos,
  searchRoot,
  onSuccess,
}: DiscoverDialogProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RepoRow[]>(() =>
    repos.map((r) => ({ path: r.path, name: r.suggested_name, checked: true }))
  );

  // Re-sync rows when repos change (new scan result)
  // We use a key prop on Dialog to reset instead, but keep a fallback:
  const isEmpty = repos.length === 0;

  const bulkMutation = useMutation({
    mutationFn: (items: AddProjectIn[]) => api.bulkAddProjects(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      onSuccess();
    },
  });

  function toggleRow(idx: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r))
    );
  }

  function updateName(idx: number, name: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, name } : r))
    );
  }

  function handleAddSelected() {
    const items = rows
      .filter((r) => r.checked && r.name.trim())
      .map((r) => ({ path: r.path, name: r.name.trim() }));
    if (items.length === 0) return;
    bulkMutation.mutate(items);
  }

  const checkedCount = rows.filter((r) => r.checked).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Discovered repositories</DialogTitle>
        </DialogHeader>

        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-2">
            No .git repos found under{" "}
            <span className="font-mono text-xs">{searchRoot}</span>.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto flex flex-col gap-2 pr-1">
            {rows.map((row, idx) => (
              <label
                key={row.path}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={() => toggleRow(idx)}
                  className="accent-violet-500 h-4 w-4 shrink-0 rounded"
                />
                <Input
                  value={row.name}
                  onChange={(e) => updateName(idx, e.target.value)}
                  className="h-7 text-xs w-28 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="font-mono text-xs text-muted-foreground truncate">
                  {row.path}
                </span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter showCloseButton={true}>
          {!isEmpty && (
            <Button
              onClick={handleAddSelected}
              disabled={bulkMutation.isPending || checkedCount === 0}
            >
              {bulkMutation.isPending
                ? "Adding…"
                : `Add ${checkedCount} selected`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
