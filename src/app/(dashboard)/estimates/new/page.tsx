"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { EstimateForm } from "@/components/estimates/estimate-form";
import { ArrowLeft } from "lucide-react";

export default function NewEstimatePage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="New Estimate" description="Create a new project estimate">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      <div className="flex-1 p-6">
        <EstimateForm mode="create" />
      </div>
    </div>
  );
}
