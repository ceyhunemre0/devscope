import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api/client";

interface ProjectActionsProps {
  projectId: number;
  currentName: string;
}

export function ProjectActions({ projectId, currentName }: ProjectActionsProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaved, setRenameSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const renameMutation = useMutation({
    mutationFn: () => api.updateProject(projectId, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setRenameError(null);
      setRenameSaved(true);
      setTimeout(() => setRenameSaved(false), 1500);
    },
    onError: (err: unknown) => {
      setRenameError(
        err instanceof ApiError ? err.detail : "Unexpected error.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // The row will unmount once projects refetch; no further state to manage.
    },
    onError: (err: unknown) => {
      setDeleteError(
        err instanceof ApiError ? err.detail : "Unexpected error.",
      );
      setConfirmingDelete(false);
    },
  });

  const renameDisabled =
    renameMutation.isPending ||
    !name.trim() ||
    name.trim() === currentName;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Actions
      </h4>

      <div className="space-y-1.5">
        <Label htmlFor={`name-${projectId}`} className="text-xs">
          Display name
        </Label>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            id={`name-${projectId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-[180px] h-8"
            disabled={renameMutation.isPending}
          />
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              renameMutation.mutate();
            }}
            disabled={renameDisabled}
          >
            {renameMutation.isPending ? "Saving…" : "Rename"}
          </Button>
          {renameSaved && (
            <span className="text-xs text-emerald-500">Renamed.</span>
          )}
        </div>
        {renameError && (
          <p className="text-xs text-destructive">{renameError}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-foreground">
              Remove <span className="font-medium">{currentName}</span> from tracking?
              The files on disk are not touched.
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing…" : "Yes, remove"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDelete(false);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmingDelete(true);
            }}
          >
            Remove from devscope
          </Button>
        )}
        {deleteError && (
          <span className="text-xs text-destructive">{deleteError}</span>
        )}
      </div>
    </div>
  );
}
