import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FolderGit2,
  BarChart3,
  Sparkles,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { openExternal } from "@/lib/external";
import logoWordmark from "@/assets/logo-wordmark.png";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/projects", icon: FolderGit2, label: "Projects", end: false },
  { to: "/analytics", icon: BarChart3, label: "Analytics", end: false },
  { to: "/summaries", icon: Sparkles, label: "Summaries", end: false },
  { to: "/settings", icon: Settings, label: "Settings", end: false },
];

interface LayoutProps {
  children: React.ReactNode;
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [animateIndicator, setAnimateIndicator] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    staleTime: Infinity,
  });

  const { data: github } = useQuery({
    queryKey: ["github-status"],
    queryFn: api.githubStatus,
  });

  const signedIn = !!github?.configured && !!github.user;
  const ghUser = github?.user ?? null;

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      setIndicator(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    setIndicator({
      top: itemRect.top - navRect.top + nav.scrollTop,
      height: itemRect.height,
    });
  }, [location.pathname]);

  useEffect(() => {
    if (indicator && !animateIndicator) {
      const id = requestAnimationFrame(() => setAnimateIndicator(true));
      return () => cancelAnimationFrame(id);
    }
  }, [indicator, animateIndicator]);

  function handleProfileClick() {
    if (signedIn && ghUser) {
      openExternal(`https://github.com/${ghUser.login}`).catch(() => {});
    } else {
      navigate("/settings");
    }
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-14 items-center px-2 border-b border-border">
        <img
          src={logoWordmark}
          alt="devscope"
          draggable={false}
          className="h-12 w-auto select-none [mix-blend-mode:screen]"
        />
      </div>

      {/* Nav */}
      <nav
        ref={navRef}
        className="relative flex-1 overflow-y-auto px-2 py-3 space-y-0.5"
      >
        {indicator && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-2 right-2 rounded-md bg-violet-500/15",
              animateIndicator &&
                "transition-[top,height] duration-300 ease-out"
            )}
            style={{ top: indicator.top, height: indicator.height }}
          />
        )}
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "relative z-10 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer — GitHub profile or sign-in hint */}
      <div className="hidden md:block border-t border-border">
        <button
          onClick={handleProfileClick}
          className="w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-accent/50 transition-colors"
          title={signedIn && ghUser ? `Open @${ghUser.login} on GitHub` : "Connect GitHub in Settings"}
        >
          {signedIn && ghUser ? (
            <>
              {ghUser.avatar_url ? (
                <img
                  src={ghUser.avatar_url}
                  alt=""
                  className="h-7 w-7 rounded-full ring-1 ring-border"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-semibold text-violet-300">
                  {ghUser.login.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  @{ghUser.login}
                </p>
                <p className="text-[10px] text-muted-foreground/70 leading-tight">
                  {health ? `v${health.version}` : "–"} · local
                </p>
              </div>
              <span className="text-xs text-muted-foreground/60">↗</span>
            </>
          ) : (
            <>
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                ?
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Connect GitHub
                </p>
                <p className="text-[10px] text-muted-foreground/70 leading-tight">
                  {health ? `v${health.version}` : "–"} · local
                </p>
              </div>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center gap-3 border-b border-border bg-sidebar px-3 md:hidden">
        <img
          src={logoWordmark}
          alt="devscope"
          draggable={false}
          className="h-10 w-auto select-none [mix-blend-mode:screen]"
        />
        <nav className="ml-auto flex items-center gap-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-center rounded-md p-2 transition-colors",
                  isActive
                    ? "bg-violet-500/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <Icon size={15} strokeWidth={1.75} />
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">
        <div className="mx-auto max-w-[1100px] px-6 py-8 md:px-10 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
