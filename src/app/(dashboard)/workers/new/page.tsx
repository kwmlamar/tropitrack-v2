import { Header } from "@/components/layout/header";
import { WorkerForm } from "@/components/workers/worker-form";

export default function NewWorkerPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Add Worker"
        description="Add a new worker to your team"
      />
      <div className="flex-1 p-6">
        <WorkerForm />
      </div>
    </div>
  );
}
