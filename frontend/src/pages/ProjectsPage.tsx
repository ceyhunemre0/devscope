import { PageHeader } from "@/components/PageHeader";
import { AddProjectForm } from "@/components/projects/AddProjectForm";
import { DiscoverForm } from "@/components/projects/DiscoverForm";
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
        <AddProjectForm />
        <DiscoverForm />
        <ProjectsTable />
      </div>
    </>
  );
}
