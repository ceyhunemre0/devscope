import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api/client";
import { openExternal } from "@/lib/external";

const GITHUB_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:user&description=devscope";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  const [ghToken, setGhToken] = useState("");
  const [ghSaveError, setGhSaveError] = useState<string | null>(null);
  const [ghSavedVisible, setGhSavedVisible] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const { data: github } = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  useEffect(() => {
    if (!savedVisible) return;
    const timer = setTimeout(() => setSavedVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [savedVisible]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveSettings({ openai_api_key: apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setApiKey("");
      setSaveError(null);
      setSavedVisible(true);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setSaveError(err.detail);
      } else {
        setSaveError("Unexpected error. Please try again.");
      }
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.saveSettings({ clear_openai: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setClearError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setClearError(err.detail);
      } else {
        setClearError("Unexpected error. Please try again.");
      }
    },
  });

  const ghSaveMutation = useMutation({
    mutationFn: () => api.githubSaveToken({ token: ghToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      queryClient.invalidateQueries({ queryKey: ["github-contributions"] });
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
    mutationFn: () => api.githubSaveToken({ clear: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      queryClient.invalidateQueries({ queryKey: ["github-contributions"] });
    },
  });

  const isMutating = saveMutation.isPending || clearMutation.isPending;

  const statusBadge = () => {
    if (settings?.openai_env_active) {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
          ENV VAR ACTIVE
        </Badge>
      );
    }
    if (settings?.openai_stored) {
      return (
        <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/20">
          STORED
        </Badge>
      );
    }
    return (
      <Badge variant="outline">NOT CONFIGURED</Badge>
    );
  };

  return (
    <>
      <PageHeader
        crumb="Settings"
        title="API keys & configuration"
        lead="Stored locally with file mode 600. Environment variables override stored values."
      />

      <Card>
        <CardHeader>
          <CardTitle>OpenAI</CardTitle>
          <CardDescription>
            Used for standup generation when provider is &apos;openai&apos; or &apos;auto&apos;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input row */}
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
              {settings?.openai_stored && (
                <Button
                  variant="destructive"
                  onClick={() => clearMutation.mutate()}
                  disabled={isMutating}
                  className="shrink-0"
                >
                  {clearMutation.isPending ? "Clearing…" : "Clear"}
                </Button>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {statusBadge()}
              {settings?.openai_stored && settings.openai_masked && (
                <span className="text-xs text-muted-foreground font-mono">
                  {settings.openai_masked}
                </span>
              )}
              {settings?.openai_env_active && (
                <span className="text-xs text-muted-foreground">
                  — overrides stored key
                </span>
              )}
            </div>
            {settings?.secrets_path && (
              <p className="text-xs text-muted-foreground">
                Storage path:{" "}
                <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                  {settings.secrets_path}
                </code>
              </p>
            )}
          </div>

          {/* Feedback */}
          {savedVisible && (
            <p className="text-sm text-emerald-500">Saved.</p>
          )}
          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}
          {clearError && (
            <p className="text-sm text-destructive">{clearError}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>GitHub</CardTitle>
          <CardDescription>
            Personal access token. Used to list your repos and fetch your contribution graph.
            Create one at{" "}
            <code className="font-mono bg-muted/50 px-1 py-0.5 rounded">
              github.com/settings/tokens
            </code>{" "}
            with at least the <code>repo</code> and <code>read:user</code> scopes.
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
              {github?.configured && (
                <Button
                  variant="destructive"
                  onClick={() => ghClearMutation.mutate()}
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
                openExternal(GITHUB_TOKEN_URL).catch(() => {
                  /* swallow — user can fall back to copy/paste */
                });
              }}
              className="gap-1.5"
            >
              <ExternalLink size={14} strokeWidth={2} />
              Generate token on GitHub
            </Button>
            <p className="text-xs text-muted-foreground">
              Opens GitHub with the right scopes pre-selected (<code>repo</code>,{" "}
              <code>read:user</code>). Generate, copy, and paste here.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {github?.configured ? (
              github.login ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                  Signed in as {github.login}
                </Badge>
              ) : (
                <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/20">
                  Token invalid
                </Badge>
              )
            ) : (
              <Badge variant="outline">NOT CONFIGURED</Badge>
            )}
            {github?.configured && github.masked && (
              <span className="text-xs text-muted-foreground font-mono">
                {github.masked}
              </span>
            )}
          </div>
          {github?.error && (
            <p className="text-xs text-destructive">{github.error}</p>
          )}
          {ghSavedVisible && (
            <p className="text-sm text-emerald-500">Saved.</p>
          )}
          {ghSaveError && (
            <p className="text-sm text-destructive">{ghSaveError}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
