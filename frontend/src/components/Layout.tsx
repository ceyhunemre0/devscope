import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FolderGit2,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/projects", icon: FolderGit2, label: "Projects", end: false },
  { to: "/reports", icon: FileText, label: "Reports", end: false },
  { to: "/settings", icon: Settings, label: "Settings", end: false },
];

interface LayoutProps {
  children: React.ReactNode;
}

function Sidebar() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    staleTime: Infinity,
  });

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75 blur-[3px]" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
        </span>
        <span className="font-bold tracking-tight text-foreground text-base select-none">
          devscope
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-violet-500/15 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="hidden md:block border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          {health ? `v${health.version}` : "–"} · local · single user
        </p>
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
      <div className="fixed top-0 left-0 right-0 z-50 flex h-12 items-center gap-3 border-b border-border bg-sidebar px-4 md:hidden">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75 blur-[3px]" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
        </span>
        <span className="font-bold tracking-tight text-foreground text-sm select-none">
          devscope
        </span>
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
