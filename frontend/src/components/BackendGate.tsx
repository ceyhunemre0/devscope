import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { SplashScreen } from "./SplashScreen";

interface BackendGateProps {
  children: ReactNode;
}

/**
 * Holds the UI on a splash screen until the Python sidecar responds. The
 * first-ever launch can take 10-20s while macOS validates the bundle; this
 * keeps users on a friendly screen instead of throwing 'failed to load' at
 * every query.
 */
export function BackendGate({ children }: BackendGateProps) {
  const [elapsed, setElapsed] = useState(0);
  const { data, error } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    staleTime: Infinity,
    retry: false,
  });

  const ready = !!data;

  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [ready]);

  const status = useMemo(() => {
    if (elapsed < 4) return "Starting backend…";
    if (elapsed < 10) return "Still warming up…";
    if (elapsed < 20) return "First launch — macOS is validating the bundle";
    return "Almost there…";
  }, [elapsed]);

  if (error) {
    const detail =
      error instanceof ApiError ? error.detail : (error as Error).message;
    return (
      <SplashScreen
        error={`Backend couldn't start: ${detail}. Try restarting the app.`}
      />
    );
  }

  if (!ready) {
    return <SplashScreen status={status} />;
  }

  return <>{children}</>;
}
