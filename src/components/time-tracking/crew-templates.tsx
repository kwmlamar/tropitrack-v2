"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Users,
  Plus,
  ChevronDown,
  Trash2,
  Pencil,
  Loader2,
  FileText,
} from "lucide-react";
import type { Worker, Project } from "@/types";

export interface CrewMember {
  worker_id: string;
  worker_name: string;
  default_hours: number;
  hourly_rate: number;
}

export interface CrewTemplate {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
  members: CrewMember[];
  created_at: string;
  updated_at: string;
}

interface CrewTemplatesProps {
  workers: Worker[];
  projects: Project[];
  onLoadTemplate: (template: CrewTemplate) => void;
  onSaveAsTemplate: () => CrewMember[];
}

export function CrewTemplates({
  workers,
  projects,
  onLoadTemplate,
  onSaveAsTemplate,
}: CrewTemplatesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [templates, setTemplates] = useState<CrewTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CrewTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Form state
  const [templateName, setTemplateName] = useState("");
  const [templateProject, setTemplateProject] = useState<string>("");
  const [templateMembers, setTemplateMembers] = useState<CrewMember[]>([]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      // Check if crew_templates table exists, if not use localStorage
      const { data, error } = await supabase
        .from("crew_templates")
        .select("*")
        .order("name");

      if (error) {
        // Table doesn't exist, use localStorage fallback
        const saved = localStorage.getItem("tropitrack_crew_templates");
        if (saved) {
          setTemplates(JSON.parse(saved));
        }
      } else {
        setTemplates(data || []);
      }
    } catch (error) {
      // Fallback to localStorage
      const saved = localStorage.getItem("tropitrack_crew_templates");
      if (saved) {
        setTemplates(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  };

  const saveTemplateToStorage = async (template: CrewTemplate) => {
    try {
      // Try database first
      const { error } = await supabase.from("crew_templates").upsert(template);

      if (error) {
        // Fallback to localStorage
        const updatedTemplates = templates.some((t) => t.id === template.id)
          ? templates.map((t) => (t.id === template.id ? template : t))
          : [...templates, template];
        localStorage.setItem("tropitrack_crew_templates", JSON.stringify(updatedTemplates));
        setTemplates(updatedTemplates);
      } else {
        fetchTemplates();
      }
    } catch (error) {
      // Fallback to localStorage
      const updatedTemplates = templates.some((t) => t.id === template.id)
        ? templates.map((t) => (t.id === template.id ? template : t))
        : [...templates, template];
      localStorage.setItem("tropitrack_crew_templates", JSON.stringify(updatedTemplates));
      setTemplates(updatedTemplates);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from("crew_templates")
        .delete()
        .eq("id", templateId);

      if (error) {
        // Fallback to localStorage
        const updatedTemplates = templates.filter((t) => t.id !== templateId);
        localStorage.setItem("tropitrack_crew_templates", JSON.stringify(updatedTemplates));
        setTemplates(updatedTemplates);
      } else {
        fetchTemplates();
      }

      toast({
        title: "Template deleted",
        description: "The crew template has been removed.",
      });
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a template name.",
        variant: "destructive",
      });
      return;
    }

    if (templateMembers.length === 0) {
      toast({
        title: "No members",
        description: "Add at least one worker to the template.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const project = projects.find((p) => p.id === templateProject);
      const template: CrewTemplate = {
        id: `template-${Date.now()}`,
        name: templateName,
        project_id: templateProject || undefined,
        project_name: project?.name,
        members: templateMembers,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await saveTemplateToStorage(template);

      toast({
        title: "Template created",
        description: `"${templateName}" has been saved.`,
        variant: "success",
      });

      setShowCreateDialog(false);
      resetForm();
    } catch (error) {
      console.error("Error creating template:", error);
      toast({
        title: "Error",
        description: "Failed to create template.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      const project = projects.find((p) => p.id === templateProject);
      const template: CrewTemplate = {
        ...editingTemplate,
        name: templateName,
        project_id: templateProject || undefined,
        project_name: project?.name,
        members: templateMembers,
        updated_at: new Date().toISOString(),
      };

      await saveTemplateToStorage(template);

      toast({
        title: "Template updated",
        description: `"${templateName}" has been saved.`,
        variant: "success",
      });

      setShowEditDialog(false);
      setEditingTemplate(null);
      resetForm();
    } catch (error) {
      console.error("Error updating template:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrentAsTemplate = () => {
    const members = onSaveAsTemplate();
    if (members.length === 0) {
      toast({
        title: "No workers to save",
        description: "Add workers to the time entry grid first.",
        variant: "destructive",
      });
      return;
    }

    setTemplateMembers(members);
    setTemplateName("");
    setTemplateProject("");
    setShowCreateDialog(true);
  };

  const handleEditTemplate = (template: CrewTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateProject(template.project_id || "");
    setTemplateMembers(template.members);
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setTemplateName("");
    setTemplateProject("");
    setTemplateMembers([]);
  };

  const addMemberToTemplate = (workerId: string) => {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) return;

    if (templateMembers.some((m) => m.worker_id === workerId)) {
      toast({
        title: "Already added",
        description: `${worker.first_name} ${worker.last_name} is already in the template.`,
      });
      return;
    }

    setTemplateMembers([
      ...templateMembers,
      {
        worker_id: workerId,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        default_hours: 8,
        hourly_rate: worker.hourly_rate || 0,
      },
    ]);
  };

  const removeMemberFromTemplate = (workerId: string) => {
    setTemplateMembers(templateMembers.filter((m) => m.worker_id !== workerId));
  };

  const updateMemberHours = (workerId: string, hours: number) => {
    setTemplateMembers(
      templateMembers.map((m) =>
        m.worker_id === workerId ? { ...m, default_hours: hours } : m
      )
    );
  };

  return (
    <div className="flex items-center gap-2">
      {/* Load Template Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={templates.length === 0}>
            <Users className="h-4 w-4 mr-2" />
            Load Template
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[250px]">
          {templates.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No templates saved yet
            </div>
          ) : (
            <>
              {templates.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  className="flex items-center justify-between"
                  onSelect={(e) => {
                    e.preventDefault();
                  }}
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => onLoadTemplate(template)}
                  >
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {template.members.length} workers
                      {template.project_name && ` • ${template.project_name}`}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditTemplate(template);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplate(template.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSaveCurrentAsTemplate}>
            Save Current as Template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Crew Template</DialogTitle>
            <DialogDescription>
              Save this crew configuration for quick reuse
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template_name">Template Name *</Label>
              <Input
                id="template_name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Harbor Bay Crew"
              />
            </div>

            <div className="space-y-2">
              <Label>Default Project (optional)</Label>
              <Select value={templateProject} onValueChange={setTemplateProject}>
                <SelectTrigger>
                  <SelectValue placeholder="No default project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No default</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Workers ({templateMembers.length})</Label>
              <ScrollArea className="h-[200px] border rounded-md p-2">
                {templateMembers.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No workers added
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templateMembers.map((member) => (
                      <div
                        key={member.worker_id}
                        className="flex items-center justify-between p-2 bg-muted rounded"
                      >
                        <div>
                          <div className="font-medium text-sm">{member.worker_name}</div>
                          <div className="text-xs text-muted-foreground">
                            ${member.hourly_rate}/hr
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="24"
                            value={member.default_hours}
                            onChange={(e) =>
                              updateMemberHours(
                                member.worker_id,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-16 text-center h-8"
                          />
                          <span className="text-xs text-muted-foreground">hrs</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeMemberFromTemplate(member.worker_id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <Select onValueChange={addMemberToTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Add worker..." />
                </SelectTrigger>
                <SelectContent>
                  {workers
                    .filter((w) => !templateMembers.some((m) => m.worker_id === w.id))
                    .map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.first_name} {worker.last_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Update "{editingTemplate?.name}" template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_template_name">Template Name *</Label>
              <Input
                id="edit_template_name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Default Project</Label>
              <Select value={templateProject} onValueChange={setTemplateProject}>
                <SelectTrigger>
                  <SelectValue placeholder="No default project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No default</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Workers ({templateMembers.length})</Label>
              <ScrollArea className="h-[200px] border rounded-md p-2">
                {templateMembers.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No workers added
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templateMembers.map((member) => (
                      <div
                        key={member.worker_id}
                        className="flex items-center justify-between p-2 bg-muted rounded"
                      >
                        <div>
                          <div className="font-medium text-sm">{member.worker_name}</div>
                          <div className="text-xs text-muted-foreground">
                            ${member.hourly_rate}/hr
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="24"
                            value={member.default_hours}
                            onChange={(e) =>
                              updateMemberHours(
                                member.worker_id,
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-16 text-center h-8"
                          />
                          <span className="text-xs text-muted-foreground">hrs</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeMemberFromTemplate(member.worker_id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <Select onValueChange={addMemberToTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Add worker..." />
                </SelectTrigger>
                <SelectContent>
                  {workers
                    .filter((w) => !templateMembers.some((m) => m.worker_id === w.id))
                    .map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.first_name} {worker.last_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTemplate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
