"use client";

/**
 * Template Editor Component
 * Edit document templates with live preview
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { TemplatePreview } from "./template-preview";
import { ESTIMATE_PRESETS, INVOICE_PRESETS } from "@/lib/template-presets";
import type { DocumentTemplate, DocumentTemplateFormData } from "@/types";
import { Save, X, Lightbulb } from "lucide-react";

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={templateId ? "Edit Template" : "Create Template"}
        description="Customize how your documents appear to clients"
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/settings/templates")}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </Header>

      <div className="flex-1 p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Settings Panel */}
          <div className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Template Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Detailed Breakdown"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Template Type</Label>
                  <RadioGroup
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, type: value as "estimate" | "invoice" })
                    }
                    disabled={!!templateId}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="estimate" id="estimate" />
                      <Label htmlFor="estimate" className="font-normal cursor-pointer">
                        Estimate
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="invoice" id="invoice" />
                      <Label htmlFor="invoice" className="font-normal cursor-pointer">
                        Invoice
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_default">Set as default template</Label>
                  <Switch
                    id="is_default"
                    checked={formData.is_default}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_default: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Load Preset */}
            <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-base">Quick Start with Presets</CardTitle>
                </div>
                <CardDescription>
                  Load pre-configured settings for common use cases
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {(formData.type === "estimate" ? ESTIMATE_PRESETS : INVOICE_PRESETS).map(
                    (preset) => (
                      <Button
                        key={preset.name}
                        variant="outline"
                        size="sm"
                        onClick={() => loadPreset(preset.name)}
                        className="justify-start text-left h-auto py-2"
                      >
                        <div>
                          <div className="font-medium text-sm">{preset.name}</div>
                          <div className="text-xs text-muted-foreground">{preset.useCase}</div>
                        </div>
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Display Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Line Item Display</CardTitle>
                <CardDescription>Choose what information to show</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "show_quantities", label: "Show quantities" },
                  { key: "show_rates", label: "Show rates ($/hr or $/unit)" },
                  { key: "show_hours", label: "Show labor hours" },
                  { key: "show_unit_costs", label: "Show unit costs" },
                  { key: "show_line_item_descriptions", label: "Show line item descriptions" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label htmlFor={key}>{label}</Label>
                    <Switch
                      id={key}
                      checked={formData[key as keyof typeof formData] as boolean}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, [key]: checked })
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Financial Details */}
            <Card>
              <CardHeader>
                <CardTitle>Financial Details</CardTitle>
                <CardDescription>Control visibility of costs and margins</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "show_subtotals", label: "Show subtotals" },
                  { key: "show_markup_percentage", label: "Show markup percentage" },
                  { key: "show_profit_margin", label: "Show profit margin" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label htmlFor={key}>{label}</Label>
                    <Switch
                      id={key}
                      checked={formData[key as keyof typeof formData] as boolean}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, [key]: checked })
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Grouping & Organization */}
            <Card>
              <CardHeader>
                <CardTitle>Grouping & Organization</CardTitle>
                <CardDescription>How to organize line items</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Group line items by</Label>
                  <RadioGroup
                    value={formData.group_by}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        group_by: value as "category" | "phase" | "none" | "custom",
                      })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="none" id="group-none" />
                      <Label htmlFor="group-none" className="font-normal cursor-pointer">
                        None - Flat list
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="category" id="group-category" />
                      <Label htmlFor="group-category" className="font-normal cursor-pointer">
                        Category (Labor, Materials, Equipment)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="phase" id="group-phase" />
                      <Label htmlFor="group-phase" className="font-normal cursor-pointer">
                        Phase (Foundation, Framing, Finishing)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="custom" id="group-custom" />
                      <Label htmlFor="group-custom" className="font-normal cursor-pointer">
                        Custom groups
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.group_by !== "none" && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show_group_subtotals">Show subtotals for each group</Label>
                    <Switch
                      id="show_group_subtotals"
                      checked={formData.show_group_subtotals}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, show_group_subtotals: checked })
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Format Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Format Settings</CardTitle>
                <CardDescription>Control presentation style</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Line Item Format</Label>
                  <RadioGroup
                    value={formData.line_item_format}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        line_item_format: value as "detailed" | "summary" | "minimal",
                      })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="detailed" id="format-detailed" />
                      <Label htmlFor="format-detailed" className="font-normal cursor-pointer">
                        Detailed - Full breakdown
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="summary" id="format-summary" />
                      <Label htmlFor="format-summary" className="font-normal cursor-pointer">
                        Summary - Condensed view
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="minimal" id="format-minimal" />
                      <Label htmlFor="format-minimal" className="font-normal cursor-pointer">
                        Minimal - Just totals
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Total Format</Label>
                  <RadioGroup
                    value={formData.total_format}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        total_format: value as "standard" | "minimal" | "detailed",
                      })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="standard" id="total-standard" />
                      <Label htmlFor="total-standard" className="font-normal cursor-pointer">
                        Standard - Subtotal, tax, total
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="detailed" id="total-detailed" />
                      <Label htmlFor="total-detailed" className="font-normal cursor-pointer">
                        Detailed - All calculations shown
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="minimal" id="total-minimal" />
                      <Label htmlFor="total-minimal" className="font-normal cursor-pointer">
                        Minimal - Just final total
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Preview */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Live Preview</CardTitle>
                <CardDescription>
                  See how your {formData.type} will look to clients
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplatePreview template={formData} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
