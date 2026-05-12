import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";
import type { SuggestCommitOut } from "@/lib/api/types";

interface ProjectCommitSuggesterProps {
  projectId: number;
}

export function ProjectCommitSuggester({ projectId }: ProjectCommitSuggesterProps) {
  const [result, setResult] = useState<SuggestCommitOut | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.suggestCommit(projectId, { provider: "auto" }),
    onSuccess: (data) => {
      setResult(data);
      setCopied(false);
    },
    onError: () => setCopied(false),
  });

  async function copy() {
    if (!result?.message) return;
    try {
      await navigator.clipboard.writeText(result.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — older browsers / sandboxed contexts
    }
  }

  const errorDetail =
    mutation.error instanceof ApiError
      ? mutation.error.detail
      : mutation.error
        ? "Unexpected error."
        : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Uncommitted changes
          </h4>
          <p className="text-xs text-muted-foreground">
            Ask the configured LLM to draft a Conventional Commits message from
            this project's working tree.
          </p>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          size="sm"
        >
          {mutation.isPending ? "Thinking…" : "Suggest commit message"}
        </Button>
      </div>

      {errorDetail && (
        <p className="text-sm text-destructive">{errorDetail}</p>
      )}

      {result && !result.has_changes && (
        <p className="text-sm text-muted-foreground">
          Working tree is clean — nothing to commit.
        </p>
      )}

      {result && result.has_changes && (
        <div className="space-y-3">
          {result.status && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Status ({result.status.split("\n").length} files)
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 font-mono text-xs text-foreground/80">
                {result.status}
              </pre>
            </details>
          )}

          {result.truncated && (
            <p className="text-xs text-amber-500">
              Diff was large and got truncated before sending to the model — review the message carefully.
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Suggested message
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={copy}
                disabled={!result.message}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm text-foreground/90">
              {result.message}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
