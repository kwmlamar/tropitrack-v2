"use client";

/**
 * Document Templates Settings Page
 * Manage estimate and invoice templates
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Copy,
  Trash2,
  Star,
  FileText,
  Eye,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import type { DocumentTemplate } from "@/types";
import { cn } from "@/lib/utils";

export default function TemplatesSettingsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [estimateTemplates, setEstimateTemplates] = useState<DocumentTemplate[]>([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("estimates");

  useEffect(() => {
    if (profile?.company_id) {
      fetchTemplates();
    }
  }, [profile?.company_id]);

  const fetchTemplates = async () => {
    if (!profile?.company_id) return;

    setLoading(true);
    try {
      // Fetch estimate templates
      const { data: estimates, error: estError } = await supabase
        .from("document_templates")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("type", "estimate")
        .order("is_default", { ascending: false })
        .order("name");

      if (estError) throw estError;
      setEstimateTemplates(estimates || []);

      // Fetch invoice templates
      const { data: invoices, error: invError } = await supabase
        .from("document_templates")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("type", "invoice")
        .order("is_default", { ascending: false })
        .order("name");

      if (invError) throw invError;
      setInvoiceTemplates(invoices || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: "Error loading templates",
        description: "Failed to load templates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (templateId: string, type: "estimate" | "invoice") => {
    try {
      const { error } = await supabase
        .from("document_templates")
        .update({ is_default: true })
        .eq("id", templateId);

      if (error) throw error;

      toast({
        title: "Default template updated",
        description: "This template is now the default for new documents.",
        variant: "success",
      });

      fetchTemplates();
    } catch (error) {
      console.error("Error setting default:", error);
      toast({
        title: "Error",
        description: "Failed to set default template.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async (template: DocumentTemplate) => {
    try {
      const { id, created_at, updated_at, ...templateData } = template;

      const { error } = await supabase
        .from("document_templates")
        .insert({
          ...templateData,
          name: `${template.name} (Copy)`,
          is_default: false,
        });

      if (error) throw error;

      toast({
        title: "Template duplicated",
        description: "Template has been copied successfully.",
        variant: "success",
      });

      fetchTemplates();
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("document_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      toast({
        title: "Template deleted",
        description: "Template has been removed.",
        variant: "success",
      });

      fetchTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Error",
        description: "Failed to delete template.",
        variant: "destructive",
      });
    }
  };

  const TemplateCard = ({ template }: { template: DocumentTemplate }) => (
    <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4 flex flex-col justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-[13px] text-[#d0d0d0]">{template.name}</h3>
          {template.is_default && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-500/25">
              <Star className="h-2.5 w-2.5 mr-1 fill-amber-500/30" />
              Default
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#555]">
          {getTemplateDescription(template)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => router.push(`/settings/templates/${template.id}/edit`)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#34373c] bg-[#202224] hover:bg-[#2d3035] hover:border-[#34373c] dark:hover:bg-[#272a2c] dark:hover:border-[#333] text-[11px] font-medium text-[#888] hover:text-[#b8b8b8] transition-colors"
        >
          <Edit className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={() => router.push(`/settings/templates/${template.id}/edit`)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#34373c] bg-[#202224] hover:bg-[#2d3035] hover:border-[#34373c] dark:hover:bg-[#272a2c] dark:hover:border-[#333] text-[11px] font-medium text-[#888] hover:text-[#b8b8b8] transition-colors"
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>
        <button
          onClick={() => handleDuplicate(template)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#34373c] bg-[#202224] hover:bg-[#2d3035] hover:border-[#34373c] dark:hover:bg-[#272a2c] dark:hover:border-[#333] text-[11px] font-medium text-[#888] hover:text-[#b8b8b8] transition-colors"
        >
          <Copy className="h-3 w-3" />
          Duplicate
        </button>
        {!template.is_default && (
          <>
            <button
              onClick={() => handleSetDefault(template.id, template.type)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#34373c] bg-[#202224] hover:bg-[#2d3035] hover:border-[#34373c] dark:hover:bg-[#272a2c] dark:hover:border-[#333] text-[11px] font-medium text-[#888] hover:text-[#b8b8b8] transition-colors"
            >
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Set Default
            </button>
            <button
              onClick={() => handleDelete(template.id, template.name)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#34373c] bg-[#202224] hover:bg-red-500/10 hover:border-red-500/20 text-[11px] font-medium text-[#555] hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/settings")}
            className="text-[#555] hover:text-[#aaa] transition-colors"
            title="Back to Settings"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Settings</p>
            <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5">Document Templates</h1>
          </div>
        </div>
        <button
          onClick={() => router.push("/settings/templates/new")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#2d3035] border border-[#333] text-[11px] font-mono uppercase tracking-wider text-[#F5A623] hover:bg-[#353840] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Template
        </button>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-[#34373c] pb-2 flex-wrap">
          <button
            onClick={() => setActiveTab("estimates")}
            className={cn(
              "px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors flex items-center gap-2",
              activeTab === "estimates"
                ? "bg-[#2d3035] text-[#F5A623] border border-[#333]"
                : "text-[#555] hover:text-[#999]"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Estimates ({estimateTemplates.length})
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={cn(
              "px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors flex items-center gap-2",
              activeTab === "invoices"
                ? "bg-[#2d3035] text-[#F5A623] border border-[#333]"
                : "text-[#555] hover:text-[#999]"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Invoices ({invoiceTemplates.length})
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "estimates" && (
          <div className="space-y-4">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-32 bg-[#202224] border border-[#34373c] rounded animate-pulse" />
                ))}
              </div>
            ) : estimateTemplates.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {estimateTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            ) : (
              <div className="rounded border border-[#34373c] bg-[#202224] p-8 text-center flex flex-col items-center justify-center">
                <FileText className="h-10 w-10 text-[#444] mb-3" />
                <h3 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">No estimate templates</h3>
                <p className="text-[11px] text-[#555] mt-1 mb-4">Create your first template to get started</p>
                <button
                  onClick={() => router.push("/settings/templates/new?type=estimate")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] font-medium text-[#F5A623] hover:bg-[#353840] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Estimate Template
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "invoices" && (
          <div className="space-y-4">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-32 bg-[#202224] border border-[#34373c] rounded animate-pulse" />
                ))}
              </div>
            ) : invoiceTemplates.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {invoiceTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            ) : (
              <div className="rounded border border-[#34373c] bg-[#202224] p-8 text-center flex flex-col items-center justify-center">
                <FileText className="h-10 w-10 text-[#444] mb-3" />
                <h3 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">No invoice templates</h3>
                <p className="text-[11px] text-[#555] mt-1 mb-4">Create your first template to get started</p>
                <button
                  onClick={() => router.push("/settings/templates/new?type=invoice")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#2d3035] border border-[#333] text-[12px] font-medium text-[#F5A623] hover:bg-[#353840] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Invoice Template
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getTemplateDescription(template: DocumentTemplate): string {
  const parts: string[] = [];

  if (template.show_rates && template.show_hours && template.show_unit_costs) {
    parts.push("Full details");
  } else if (template.show_rates || template.show_hours || template.show_unit_costs) {
    parts.push("Partial details");
  } else {
    parts.push("Summary only");
  }

  if (template.group_by !== "none") {
    parts.push(`grouped by ${template.group_by}`);
  }

  if (template.show_markup_percentage) {
    parts.push("shows markup");
  }

  return parts.join(", ");
}
