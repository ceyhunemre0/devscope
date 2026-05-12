import { PageHeader } from "@/components/PageHeader";
import { AddProjectPanel } from "@/components/projects/AddProjectPanel";
import { ProjectsTable } from "@/components/projects/ProjectsTable";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        crumb="Projects"
        title="Tracked repositories"
        lead="devscope scans these for commit activity."
      />
      <div className="space-y-6">
        <AddProjectPanel />
        <ProjectsTable />
      </div>
    </>
  );
}
