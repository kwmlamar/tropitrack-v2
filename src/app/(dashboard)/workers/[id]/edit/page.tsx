"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { WorkerForm } from "@/components/workers/worker-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, User } from "lucide-react";
import type { Worker } from "@/types";

export default function EditWorkerPage() {
  const params = useParams();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const workerId = params.id as string;

  useEffect(() => {
    fetchWorker();
  }, [workerId]);

  const fetchWorker = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("id", workerId)
        .single();

      if (error) throw error;
      setWorker(data);
    } catch (error) {
      console.error("Error fetching worker:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Edit Worker" description="Loading...">
          <Link href="/workers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Loading worker data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Worker Not Found" description="The requested worker could not be found">
          <Link href="/workers">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Workers
            </Button>
          </Link>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Worker not found</h3>
            <p className="text-muted-foreground mb-4">
              The worker you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <Link href="/workers">
              <Button>Go to Workers</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`Edit: ${worker.first_name} ${worker.last_name}`}
        description="Update worker information"
      >
        <Link href={`/workers/${workerId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Details
          </Button>
        </Link>
      </Header>
      <div className="flex-1 p-6">
        <WorkerForm worker={worker} isEditing />
      </div>
    </div>
  );
}
