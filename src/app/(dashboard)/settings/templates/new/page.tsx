"use client";

import { Suspense } from "react";
import { TemplateEditor } from "@/components/templates/template-editor";

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TemplateEditor />
    </Suspense>
  );
}
