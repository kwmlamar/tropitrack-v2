"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save } from "lucide-react";
import type { Project, User } from "@/types";
import { ClientSelector } from "@/components/clients/client-selector";

const projectSchema = z
  .object({
    name: z.string().min(1, "Project name is required"),
    description: z.string().optional(),
    client_id: z.string().min(1, "Please select a client"),
    location: z.string().min(1, "Location is required"),
    status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
    start_date: z.string().min(1, "Start date is required"),
    estimated_end_date: z.string().optional(),
    budget: z.coerce.number().min(0, "Budget must be positive"),
    contract_value: z.coerce.number().min(0, "Contract value must be positive"),
    // A property-management job billed flat-monthly (Sotheby's Caretaking
    // Properties, the Laundromat, Capricorn, Tropical Impulse ceilings) has
    // no contract_value at all. Requiring contract_value > 0 outright makes
    // those jobs uncreatable and pushes people toward typing a fake number —
    // this flag lets $0 be a deliberate choice instead of a blank left by mistake.
    no_fixed_contract: z.boolean(),
    project_manager_id: z.string().optional(),
  })
  .refine((data) => data.no_fixed_contract || data.contract_value > 0, {
    message: 'Enter a contract value, or check "No fixed contract"',
    path: ["contract_value"],
  });

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project;
  isEditing?: boolean;
}

export function ProjectForm({ project, isEditing = false }: ProjectFormProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState<User[]>([]);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || "",
      description: project?.description || "",
      client_id: project?.client_id || "",
      location: project?.location || "",
      status: project?.status || "planning",
      start_date: project?.start_date || new Date().toISOString().split("T")[0],
      estimated_end_date: project?.estimated_end_date || "",
      budget: project?.budget || 0,
      contract_value: project?.contract_value || 0,
      no_fixed_contract: project?.no_fixed_contract || false,
      project_manager_id: project?.project_manager_id || "",
    },
  });

  useEffect(() => {
    fetchManagers();
  }, []);

  const fetchManagers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["admin", "project_manager"]);
    setManagers(data || []);
  };

  const onSubmit = async (data: ProjectFormData) => {
    if (!user) return;

    setLoading(true);
    try {
      if (!profile?.company_id) {
        toast({
          title: "Error",
          description: "User is not associated with a company. Cannot add project.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const projectData = {
        ...data,
        company_id: profile.company_id,
        estimated_end_date: data.estimated_end_date || null,
        project_manager_id: data.project_manager_id || null,
      };

      if (isEditing && project) {
        const { error } = await supabase
          .from("projects")
          .update(projectData)
          .eq("id", project.id);

        if (error) throw error;

        toast({
          title: "Project updated",
          description: "The project has been successfully updated.",
          variant: "success",
        });
      } else {
        const { error } = await supabase.from("projects").insert({
          ...projectData,
          created_by: user.id,
        });

        if (error) throw error;

        toast({
          title: "Project created",
          description: "The new project has been successfully created.",
          variant: "success",
        });
      }

      router.push("/projects");
      router.refresh();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = [
    { value: "planning", label: "Planning" },
    { value: "active", label: "Active" },
    { value: "on_hold", label: "On Hold" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project Details */}
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Beach Resort Development"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the project..."
                rows={3}
                {...register("description")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                placeholder="e.g., Nassau, New Providence"
                {...register("location")}
              />
              {errors.location && (
                <p className="text-sm text-destructive">{errors.location.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={watch("status")}
                onValueChange={(value) => setValue("status", value as ProjectFormData["status"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project_manager_id">Project Manager</Label>
              <Select
                value={watch("project_manager_id") || ""}
                onValueChange={(value) => setValue("project_manager_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign a project manager" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Client Information */}
        <Card>
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client *</Label>
              <ClientSelector
                value={watch("client_id") || ""}
                onValueChange={(clientId) => setValue("client_id", clientId)}
                error={!!errors.client_id}
              />
              {errors.client_id && (
                <p className="text-sm text-destructive">{errors.client_id.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Select an existing client or create a new one
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date *</Label>
              <DatePicker
                id="start_date"
                value={watch("start_date")}
                onChange={(value) => setValue("start_date", value)}
                required
                error={!!errors.start_date}
              />
              {errors.start_date && (
                <p className="text-sm text-destructive">{errors.start_date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimated_end_date">Estimated End Date</Label>
              <DatePicker
                id="estimated_end_date"
                value={watch("estimated_end_date")}
                onChange={(value) => setValue("estimated_end_date", value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Budget */}
        <Card>
          <CardHeader>
            <CardTitle>Financial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget (BSD) *</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register("budget")}
              />
              {errors.budget && (
                <p className="text-sm text-destructive">{errors.budget.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contract_value">Contract Value (BSD) *</Label>
              <Input
                id="contract_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                disabled={watch("no_fixed_contract")}
                {...register("contract_value")}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={watch("no_fixed_contract")}
                  onCheckedChange={(checked) => {
                    setValue("no_fixed_contract", !!checked);
                    if (checked) setValue("contract_value", 0);
                  }}
                />
                No fixed contract (T&M / monthly fee)
              </label>
              {errors.contract_value && (
                <p className="text-sm text-destructive">{errors.contract_value.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? "Update Project" : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
