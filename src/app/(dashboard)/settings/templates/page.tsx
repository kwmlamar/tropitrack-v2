"use client";

/**
 * Document Templates Settings Page
 * Manage estimate and invoice templates
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import type { DocumentTemplate } from "@/types";

export default function TemplatesSettingsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [estimateTemplates, setEstimateTemplates] = useState<DocumentTemplate[]>([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{template.name}</CardTitle>
              {template.is_default && (
                <Badge variant="default" className="gap-1">
                  <Star className="h-3 w-3" />
                  Default
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              {getTemplateDescription(template)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/settings/templates/${template.id}/edit`)}
          >
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/settings/templates/${template.id}/preview`)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDuplicate(template)}
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
          {!template.is_default && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetDefault(template.id, template.type)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Set Default
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(template.id, template.name)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Document Templates"
        description="Customize how estimates and invoices appear to your clients"
      >
        <Button onClick={() => router.push("/settings/templates/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </Header>

      <div className="flex-1 p-6">
        <Tabs defaultValue="estimates" className="space-y-6">
          <TabsList>
            <TabsTrigger value="estimates" className="gap-2">
              <FileText className="h-4 w-4" />
              Estimates ({estimateTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <FileText className="h-4 w-4" />
              Invoices ({invoiceTemplates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estimates" className="space-y-4">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : estimateTemplates.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {estimateTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No estimate templates</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first template to get started
                  </p>
                  <Button onClick={() => router.push("/settings/templates/new?type=estimate")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Estimate Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : invoiceTemplates.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {invoiceTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No invoice templates</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first template to get started
                  </p>
                  <Button onClick={() => router.push("/settings/templates/new?type=invoice")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Invoice Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
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
