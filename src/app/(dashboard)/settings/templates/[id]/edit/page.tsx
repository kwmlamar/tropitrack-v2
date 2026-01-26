"use client";

import { Suspense } from "react";
import { use } from "react";
import { TemplateEditor } from "@/components/templates/template-editor";

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TemplateEditor templateId={resolvedParams.id} />
    </Suspense>
  );
}
