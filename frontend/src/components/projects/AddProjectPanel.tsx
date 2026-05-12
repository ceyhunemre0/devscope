import { useState } from "react";
import { FolderGit2, Cloud, Search } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AddProjectForm } from "./AddProjectForm";
import { AddFromGitHubForm } from "./AddFromGitHubForm";
import { DiscoverForm } from "./DiscoverForm";

type TabKey = "manual" | "github" | "discover";

const TABS: { key: TabKey; label: string; icon: typeof FolderGit2; description: string }[] = [
  {
    key: "manual",
    label: "Local path",
    icon: FolderGit2,
    description: "Point devscope at a git repository already on disk.",
  },
  {
    key: "github",
    label: "From GitHub",
    icon: Cloud,
    description: "Browse your GitHub repos and clone one to track.",
  },
  {
    key: "discover",
    label: "Discover folder",
    icon: Search,
    description: "Scan a directory tree and bulk-add any git repos inside.",
  },
];

export function AddProjectPanel() {
  const [tab, setTab] = useState<TabKey>("manual");
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>Add a project</CardTitle>
          <CardDescription className="mt-1">{active.description}</CardDescription>
        </div>
        <div
          role="tablist"
          aria-label="Add project method"
          className="flex flex-wrap gap-1 border-b border-border -mb-px"
        >
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = key === tab;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-violet-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={14} strokeWidth={1.75} />
                {label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {tab === "manual" && <AddProjectForm />}
        {tab === "github" && <AddFromGitHubForm />}
        {tab === "discover" && <DiscoverForm />}
      </CardContent>
    </Card>
  );
}
