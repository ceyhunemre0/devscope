import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api/client";
import { openExternal } from "@/lib/external";

type PendingClear = "openai" | "github" | null;

const GITHUB_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:user&description=devscope";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const [clearedVisible, setClearedVisible] = useState(false);

  const [ghToken, setGhToken] = useState("");
  const [ghSaveError, setGhSaveError] = useState<string | null>(null);
  const [ghClearError, setGhClearError] = useState<string | null>(null);
  const [ghSavedVisible, setGhSavedVisible] = useState(false);
  const [ghClearedVisible, setGhClearedVisible] = useState(false);

  const [pendingClear, setPendingClear] = useState<PendingClear>(null);

  // Pulled for sanity-checking the persisted settings (provider chain etc).
  useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const { data: github } = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  const { data: secretStatus } = useQuery({
    queryKey: ["secret-status"],
    queryFn: api.getSecretStatus,
  });

  const openaiStored = !!secretStatus?.openai_key_stored;
  const openaiMasked = secretStatus?.openai_key_masked ?? null;
  const openaiEnvActive = !!secretStatus?.openai_env_active;
  const githubTokenStored = !!secretStatus?.github_token_stored;

  useEffect(() => {
    if (!savedVisible) return;
    const timer = setTimeout(() => setSavedVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [savedVisible]);

  useEffect(() => {
    if (!clearedVisible) return;
    const timer = setTimeout(() => setClearedVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [clearedVisible]);

  useEffect(() => {
    if (!ghClearedVisible) return;
    const timer = setTimeout(() => setGhClearedVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [ghClearedVisible]);

  const saveMutation = useMutation({
    mutationFn: () => api.setSecret("OPENAI_API_KEY", apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secret-status"] });
      setApiKey("");
      setSaveError(null);
      setSavedVisible(true);
    },
    onError: (err: unknown) => {
      setSaveError(
        err instanceof ApiError ? err.detail : "Unexpected error. Please try again.",
      );
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.deleteSecret("OPENAI_API_KEY"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secret-status"] });
      setClearError(null);
      setClearedVisible(true);
      setPendingClear(null);
    },
    onError: (err: unknown) => {
      setClearError(
        err instanceof ApiError ? err.detail : "Unexpected error. Please try again.",
      );
      setPendingClear(null);
    },
  });

  const ghSaveMutation = useMutation({
    mutationFn: () => api.setGithubToken(ghToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      queryClient.invalidateQueries({ queryKey: ["secret-status"] });
      setGhToken("");
      setGhSaveError(null);
      setGhSavedVisible(true);
      setTimeout(() => setGhSavedVisible(false), 2500);
    },
    onError: (err: unknown) => {
      setGhSaveError(
        err instanceof ApiError ? err.detail : "Unexpected error. Please try again.",
      );
    },
  });

  const ghClearMutation = useMutation({
    // Passing an empty string clears the stored token server-side.
    mutationFn: () => api.setGithubToken(""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      queryClient.invalidateQueries({ queryKey: ["secret-status"] });
      setGhClearError(null);
      setGhClearedVisible(true);
      setPendingClear(null);
    },
    onError: (err: unknown) => {
      setGhClearError(
        err instanceof ApiError ? err.detail : "Unexpected error. Please try again.",
      );
      setPendingClear(null);
    },
  });

  const isMutating = saveMutation.isPending || clearMutation.isPending;

  const statusBadge = () => {
    if (openaiStored) {
      return (
        <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/20">
          STORED{openaiMasked ? ` · ${openaiMasked}` : ""}
        </Badge>
      );
    }
    if (openaiEnvActive) {
      return (
        <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/20">
          FROM ENV
        </Badge>
      );
    }
    return <Badge variant="outline">NOT CONFIGURED</Badge>;
  };

  return (
    <>
      <PageHeader
        crumb="Settings"
        title="API keys & configuration"
        lead="Secrets are written to a file with mode 0600 in your config directory."
      />

      <Card>
        <CardHeader>
          <CardTitle>OpenAI</CardTitle>
          <CardDescription>
            Used for standup generation when provider is &apos;openai&apos; or &apos;auto&apos;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-key">API key</Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="flex-1 min-w-[200px]"
                disabled={isMutating}
              />
              <Button
                variant="default"
                onClick={() => saveMutation.mutate()}
                disabled={isMutating || !apiKey.trim()}
                className="shrink-0"
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {openaiStored && (
                <Button
                  variant="destructive"
                  onClick={() => setPendingClear("openai")}
                  disabled={isMutating}
                  className="shrink-0"
                >
                  {clearMutation.isPending ? "Clearing…" : "Clear"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {statusBadge()}
          </div>

          {openaiEnvActive && (
            <p className="text-xs text-muted-foreground">
              Detected from environment (<code>OPENAI_API_KEY</code>). The env
              variable takes precedence over the stored key.
            </p>
          )}

          {savedVisible && <p className="text-sm text-emerald-500">Saved.</p>}
          {clearedVisible && <p className="text-sm text-emerald-500">Cleared.</p>}
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          {clearError && <p className="text-sm text-destructive">{clearError}</p>}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>GitHub</CardTitle>
          <CardDescription>
            Personal access token used to list your repos and clone them.
            Generate one with at least the <code>repo</code> and{" "}
            <code>read:user</code> scopes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gh-pat">Personal access token</Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                id="gh-pat"
                type="password"
                autoComplete="off"
                placeholder="ghp_… or github_pat_…"
                value={ghToken}
                onChange={(e) => setGhToken(e.target.value)}
                className="flex-1 min-w-[200px]"
                disabled={ghSaveMutation.isPending || ghClearMutation.isPending}
              />
              <Button
                onClick={() => ghSaveMutation.mutate()}
                disabled={ghSaveMutation.isPending || !ghToken.trim()}
                className="shrink-0"
              >
                {ghSaveMutation.isPending ? "Verifying…" : "Save"}
              </Button>
              {(githubTokenStored || github?.configured) && (
                <Button
                  variant="destructive"
                  onClick={() => setPendingClear("github")}
                  disabled={ghClearMutation.isPending}
                  className="shrink-0"
                >
                  {ghClearMutation.isPending ? "Clearing…" : "Clear"}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                openExternal(GITHUB_TOKEN_URL).catch(() => {});
              }}
              className="gap-1.5"
            >
              <ExternalLink size={14} strokeWidth={2} />
              Generate token on GitHub
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {github?.configured ? (
              github.user ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                  Signed in as {github.user.login}
                </Badge>
              ) : (
                <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/20">
                  Token invalid
                </Badge>
              )
            ) : (
              <Badge variant="outline">NOT CONFIGURED</Badge>
            )}
          </div>
          {ghSavedVisible && <p className="text-sm text-emerald-500">Saved.</p>}
          {ghClearedVisible && <p className="text-sm text-emerald-500">Cleared.</p>}
          {ghSaveError && <p className="text-sm text-destructive">{ghSaveError}</p>}
          {ghClearError && <p className="text-sm text-destructive">{ghClearError}</p>}
        </CardContent>
      </Card>

      <Dialog
        open={pendingClear !== null}
        onOpenChange={(open) => {
          if (!open && !clearMutation.isPending && !ghClearMutation.isPending) {
            setPendingClear(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingClear === "openai"
                ? "Clear OpenAI API key?"
                : "Clear GitHub token?"}
            </DialogTitle>
            <DialogDescription>
              {pendingClear === "openai"
                ? "This removes the stored key from your local secrets file. You can re-enter it anytime."
                : "This removes the stored token. You'll need to paste a new one to use GitHub features."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingClear(null)}
              disabled={clearMutation.isPending || ghClearMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingClear === "openai") {
                  clearMutation.mutate();
                } else if (pendingClear === "github") {
                  ghClearMutation.mutate();
                }
              }}
              disabled={clearMutation.isPending || ghClearMutation.isPending}
            >
              {clearMutation.isPending || ghClearMutation.isPending
                ? "Clearing…"
                : "Clear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
