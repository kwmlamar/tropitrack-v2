"use client";

/**
 * Template Selector Component
 * Dropdown to select and preview templates
 */

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { TemplatePreview } from "./template-preview";
import { Eye, Star, Settings } from "lucide-react";
import type { DocumentTemplate } from "@/types";
import Link from "next/link";

interface TemplateSelectorProps {
  type: "estimate" | "invoice";
  selectedTemplateId?: string;
  onTemplateChange?: (templateId: string, template: DocumentTemplate | null) => void;
  showPreview?: boolean;
  showQuickSwitch?: boolean;
}

export function TemplateSelector({
  type,
  selectedTemplateId,
  onTemplateChange,
  showPreview = true,
  showQuickSwitch = true,
}: TemplateSelectorProps) {
  const { profile } = useAuth();
  const supabase = createClient();

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (profile?.company_id) {
      fetchTemplates();
    }
  }, [profile?.company_id, type]);

  useEffect(() => {
    if (templates.length > 0) {
      if (selectedTemplateId) {
        const template = templates.find((t) => t.id === selectedTemplateId);
        setSelectedTemplate(template || null);
      } else {
        // Auto-select default template
        const defaultTemplate = templates.find((t) => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate);
          onTemplateChange?.(defaultTemplate.id, defaultTemplate);
        }
      }
    }
  }, [templates, selectedTemplateId]);

  const fetchTemplates = async () => {
    if (!profile?.company_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("type", type)
        .order("is_default", { ascending: false })
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    setSelectedTemplate(template || null);
    onTemplateChange?.(templateId, template || null);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Template</Label>
        <div className="h-10 bg-muted animate-pulse rounded-md"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="template">Template</Label>
        <Link href="/settings/templates">
          <Button variant="ghost" size="sm" className="h-auto py-1 px-2">
            <Settings className="h-3 w-3 mr-1" />
            Manage
          </Button>
        </Link>
      </div>

      <div className="flex gap-2">
        <Select
          value={selectedTemplate?.id || ""}
          onValueChange={handleTemplateChange}
        >
          <SelectTrigger id="template" className="flex-1">
            <SelectValue placeholder="Select template..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex items-center gap-2">
                  <span>{template.name}</span>
                  {template.is_default && (
                    <Badge variant="secondary" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showPreview && selectedTemplate && (
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Eye className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{selectedTemplate.name} Preview</DialogTitle>
                <DialogDescription>
                  This is how your {type} will appear to clients
                </DialogDescription>
              </DialogHeader>
              <TemplatePreview template={selectedTemplate} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {showQuickSwitch && templates.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Quick switch:</span>
          {templates
            .filter((t) => t.id !== selectedTemplate?.id)
            .slice(0, 3)
            .map((template) => (
              <Button
                key={template.id}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleTemplateChange(template.id)}
              >
                {template.name}
              </Button>
            ))}
        </div>
      )}

      {selectedTemplate && (
        <p className="text-xs text-muted-foreground">
          {getTemplateDescription(selectedTemplate)}
        </p>
      )}
    </div>
  );
}

function getTemplateDescription(template: DocumentTemplate): string {
  const parts: string[] = [];

  if (template.show_rates && template.show_hours && template.show_unit_costs) {
    parts.push("Shows all details and rates");
  } else if (template.show_rates || template.show_hours || template.show_unit_costs) {
    parts.push("Shows partial details");
  } else {
    parts.push("Summary view only");
  }

  if (template.group_by !== "none") {
    parts.push(`grouped by ${template.group_by}`);
  }

  return parts.join(" • ");
}
