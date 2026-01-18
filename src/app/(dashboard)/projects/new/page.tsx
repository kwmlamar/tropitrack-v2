import { Header } from "@/components/layout/header";
import { ProjectForm } from "@/components/projects/project-form";

export default function NewProjectPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="New Project"
        description="Create a new construction project"
      />
      <div className="flex-1 p-6">
        <ProjectForm />
      </div>
    </div>
  );
}
