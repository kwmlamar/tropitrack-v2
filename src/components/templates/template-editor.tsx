"use client";

/**
 * Template Editor Component
 * Edit document templates with live preview
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { TemplatePreview } from "./template-preview";
import { ESTIMATE_PRESETS, INVOICE_PRESETS } from "@/lib/template-presets";
import type { DocumentTemplate, DocumentTemplateFormData } from "@/types";
import { Save, X, Lightbulb, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateEditorProps {
  templateId?: string;
}

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<DocumentTemplateFormData>({
    name: "",
    type: (searchParams.get("type") as "estimate" | "invoice") || "estimate",
    is_default: false,
    show_quantities: true,
    show_rates: true,
    show_hours: true,
    show_unit_costs: true,
    show_subtotals: true,
    show_markup_percentage: false,
    show_profit_margin: false,
    show_line_item_descriptions: true,
    group_by: "category",
    show_group_subtotals: true,
    line_item_format: "detailed",
    total_format: "standard",
  });

  useEffect(() => {
    if (templateId && profile?.company_id) {
      fetchTemplate();
    }
  }, [templateId, profile?.company_id]);

  const fetchTemplate = async () => {
    if (!templateId) return;

    try {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;

      if (data) {
        const { id, created_at, updated_at, company_id, ...templateData } = data;
        setFormData(templateData as DocumentTemplateFormData);
      }
    } catch (error) {
      console.error("Error fetching template:", error);
      toast({
        title: "Error",
        description: "Failed to load template.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;

    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        company_id: profile.company_id,
      };

      if (templateId) {
        // Update existing template
        const { error } = await supabase
          .from("document_templates")
          .update(dataToSave)
          .eq("id", templateId);

        if (error) throw error;

        toast({
          title: "Template updated",
          description: "Your changes have been saved.",
          variant: "success",
        });
      } else {
        // Create new template
        const { error } = await supabase
          .from("document_templates")
          .insert([dataToSave]);

        if (error) throw error;

        toast({
          title: "Template created",
          description: "New template has been created successfully.",
          variant: "success",
        });
      }

      router.push("/settings/templates");
    } catch (error) {
      console.error("Error saving template:", error);
      toast({
        title: "Error",
        description: "Failed to save template.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const loadPreset = (presetName: string) => {
    const presets = formData.type === "estimate" ? ESTIMATE_PRESETS : INVOICE_PRESETS;
    const preset = presets.find((p) => p.name === presetName);

    if (preset) {
      setFormData({
        ...formData,
        name: preset.name,
        ...preset.settings,
      });

      toast({
        title: "Preset loaded",
        description: `${preset.name} settings applied.`,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#18191b]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F5A623]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#18191b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#34373c] flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-[#666] uppercase tracking-widest">Templates</p>
          <h1 className="text-[16px] font-semibold text-[#d0d0d0] mt-0.5">
            {templateId ? "Edit Template" : "Create Template"}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/settings/templates")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#34373c] bg-[#202224] hover:bg-[#272a2c] hover:border-[#333] text-[11px] font-medium text-[#888] hover:text-[#b8b8b8] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#2d3035] border border-[#333] text-[11px] font-mono uppercase tracking-wider text-[#F5A623] hover:bg-[#353840] transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Settings Panel */}
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">Template Info</h2>
                <p className="text-[11px] text-[#555] mt-1">Configure basic information</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="name" className="text-[10px] font-mono text-[#555] uppercase tracking-widest block">Template Name</label>
                  <input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Detailed Breakdown"
                    className="w-full h-8 px-2.5 rounded bg-[#292c31] border border-[#3a3d42] text-[13px] text-[#aaa] outline-none focus:border-[#333] transition-colors placeholder:text-[#444]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#555] uppercase tracking-widest block">Template Type</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-[13px] text-[#aaa] cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="estimate"
                        checked={formData.type === "estimate"}
                        onChange={() => setFormData({ ...formData, type: "estimate" })}
                        disabled={!!templateId}
                        className="h-4 w-4 bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                      />
                      Estimate
                    </label>
                    <label className="flex items-center gap-2 text-[13px] text-[#aaa] cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="invoice"
                        checked={formData.type === "invoice"}
                        onChange={() => setFormData({ ...formData, type: "invoice" })}
                        disabled={!!templateId}
                        className="h-4 w-4 bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                      />
                      Invoice
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#2d3035] pt-3">
                  <div>
                    <span className="text-[13px] text-[#aaa]">Set as default template</span>
                    <p className="text-[10px] text-[#555] font-mono">Use this template for all new documents</p>
                  </div>
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="h-4 w-4 rounded bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                  />
                </div>
              </div>
            </div>

            {/* Load Preset */}
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-blue-400" />
                  Quick Start with Presets
                </h2>
                <p className="text-[11px] text-[#555] mt-1">Load pre-configured settings for common use cases</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(formData.type === "estimate" ? ESTIMATE_PRESETS : INVOICE_PRESETS).map(
                  (preset) => (
                    <button
                      key={preset.name}
                      onClick={() => loadPreset(preset.name)}
                      className="flex flex-col items-start gap-1 p-3 rounded border border-[#34373c] bg-[#18191b] hover:bg-[#2d3035] hover:border-[#34373c] dark:hover:bg-[#272a2c] dark:hover:border-[#333] text-left transition-colors group"
                    >
                      <span className="font-semibold text-[12px] text-[#d0d0d0] group-hover:text-white transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[10px] text-[#555]">
                        {preset.useCase}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Display Settings */}
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">Line Item Display</h2>
                <p className="text-[11px] text-[#555] mt-1">Choose what information to show</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { key: "show_quantities", label: "Show quantities" },
                  { key: "show_rates", label: "Show rates ($/hr or $/unit)" },
                  { key: "show_hours", label: "Show labor hours" },
                  { key: "show_unit_costs", label: "Show unit costs" },
                  { key: "show_line_item_descriptions", label: "Show line item descriptions" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <label htmlFor={key} className="text-[13px] text-[#aaa] cursor-pointer">{label}</label>
                    <input
                      type="checkbox"
                      id={key}
                      checked={formData[key as keyof typeof formData] as boolean}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                      className="h-4 w-4 rounded bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Details */}
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">Financial Details</h2>
                <p className="text-[11px] text-[#555] mt-1">Control visibility of costs and margins</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { key: "show_subtotals", label: "Show subtotals" },
                  { key: "show_markup_percentage", label: "Show markup percentage" },
                  { key: "show_profit_margin", label: "Show profit margin" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <label htmlFor={key} className="text-[13px] text-[#aaa] cursor-pointer">{label}</label>
                    <input
                      type="checkbox"
                      id={key}
                      checked={formData[key as keyof typeof formData] as boolean}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                      className="h-4 w-4 rounded bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Grouping & Organization */}
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">Grouping & Organization</h2>
                <p className="text-[11px] text-[#555] mt-1">How to organize line items</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#555] uppercase tracking-widest block">Group line items by</label>
                  <div className="space-y-2">
                    {[
                      { value: "none", label: "None - Flat list" },
                      { value: "category", label: "Category (Labor, Materials, Equipment)" },
                      { value: "phase", label: "Phase (Foundation, Framing, Finishing)" },
                      { value: "custom", label: "Custom groups" },
                    ].map((g) => (
                      <label key={g.value} className="flex items-center gap-2 text-[13px] text-[#aaa] cursor-pointer">
                        <input
                          type="radio"
                          name="group_by"
                          value={g.value}
                          checked={formData.group_by === g.value}
                          onChange={() => setFormData({ ...formData, group_by: g.value as any })}
                          className="h-4 w-4 bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                        />
                        {g.label}
                      </label>
                    ))}
                  </div>
                </div>

                {formData.group_by !== "none" && (
                  <div className="flex items-center justify-between border-t border-[#2d3035] pt-3">
                    <label htmlFor="show_group_subtotals" className="text-[13px] text-[#aaa] cursor-pointer">Show subtotals for each group</label>
                    <input
                      type="checkbox"
                      id="show_group_subtotals"
                      checked={formData.show_group_subtotals}
                      onChange={(e) => setFormData({ ...formData, show_group_subtotals: e.target.checked })}
                      className="h-4 w-4 rounded bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Format Settings */}
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">Format Settings</h2>
                <p className="text-[11px] text-[#555] mt-1">Control presentation style</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#555] uppercase tracking-widest block">Line Item Format</label>
                  <div className="space-y-2">
                    {[
                      { value: "detailed", label: "Detailed - Full breakdown" },
                      { value: "summary", label: "Summary - Condensed view" },
                      { value: "minimal", label: "Minimal - Just totals" },
                    ].map((f) => (
                      <label key={f.value} className="flex items-center gap-2 text-[13px] text-[#aaa] cursor-pointer">
                        <input
                          type="radio"
                          name="line_item_format"
                          value={f.value}
                          checked={formData.line_item_format === f.value}
                          onChange={() => setFormData({ ...formData, line_item_format: f.value as any })}
                          className="h-4 w-4 bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[#2d3035] my-2" />

                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-[#555] uppercase tracking-widest block">Total Format</label>
                  <div className="space-y-2">
                    {[
                      { value: "standard", label: "Standard - Subtotal, tax, total" },
                      { value: "detailed", label: "Detailed - All calculations shown" },
                      { value: "minimal", label: "Minimal - Just final total" },
                    ].map((t) => (
                      <label key={t.value} className="flex items-center gap-2 text-[13px] text-[#aaa] cursor-pointer">
                        <input
                          type="radio"
                          name="total_format"
                          value={t.value}
                          checked={formData.total_format === t.value}
                          onChange={() => setFormData({ ...formData, total_format: t.value as any })}
                          className="h-4 w-4 bg-[#292c31] border-[#3a3d42] text-[#F5A623] focus:ring-0 focus:ring-offset-0"
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <div className="rounded border border-[#34373c] bg-[#202224] p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-[#d0d0d0] uppercase tracking-wider font-mono">Live Preview</h2>
                <p className="text-[11px] text-[#555] mt-1">See how your {formData.type} will look to clients</p>
              </div>
              <TemplatePreview template={formData} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
