"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
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
import { Loader2, Wallet, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import type { Worker } from "@/types";

const workerSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  worker_type: z.enum(["hourly", "salary", "contract"]),
  hourly_rate: z.coerce.number().optional(),
  salary_amount: z.coerce.number().optional(),
  overtime_rate_multiplier: z.coerce.number().min(1).default(1.5),
  status: z.enum(["active", "inactive", "terminated"]),
  hire_date: z.string().min(1, "Hire date is required"),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  notes: z.string().optional(),
  // NIB fields
  nib_enabled: z.boolean().default(true),
  nib_number: z.string().optional(),
});

type WorkerFormData = z.infer<typeof workerSchema>;

interface WorkerFormProps {
  worker?: Worker;
  isEditing?: boolean;
}

export function WorkerForm({ worker, isEditing = false }: WorkerFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WorkerFormData>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      first_name: worker?.first_name || "",
      last_name: worker?.last_name || "",
      email: worker?.email || "",
      phone: worker?.phone || "",
      address: worker?.address || "",
      worker_type: worker?.worker_type || "hourly",
      hourly_rate: worker?.hourly_rate || undefined,
      salary_amount: worker?.salary_amount || undefined,
      overtime_rate_multiplier: worker?.overtime_rate_multiplier || 1.5,
      status: worker?.status || "active",
      hire_date: worker?.hire_date || new Date().toISOString().split("T")[0],
      emergency_contact_name: worker?.emergency_contact_name || "",
      emergency_contact_phone: worker?.emergency_contact_phone || "",
      notes: worker?.notes || "",
      nib_enabled: worker?.nib_enabled ?? true,
      nib_number: worker?.nib_number || "",
    },
  });

  const workerType = watch("worker_type");

  const onSubmit = async (data: WorkerFormData) => {
    setLoading(true);
    try {
      if (!profile?.company_id) {
        toast({
          title: "Error",
          description: "You must be associated with a company to create workers.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const workerData = {
        ...data,
        company_id: profile.company_id,
        email: data.email || null,
        hourly_rate: data.worker_type === "hourly" ? data.hourly_rate : null,
        salary_amount: data.worker_type === "salary" ? data.salary_amount : null,
        nib_number: data.nib_number || null,
      };

      if (isEditing && worker) {
        const { error } = await supabase
          .from("workers")
          .update(workerData)
          .eq("id", worker.id);

        if (error) throw error;

        toast({
          title: "Worker updated",
          description: "The worker has been successfully updated.",
          variant: "success",
        });
      } else {
        const { error } = await supabase.from("workers").insert(workerData);

        if (error) throw error;

        toast({
          title: "Worker added",
          description: "The new worker has been successfully added.",
          variant: "success",
        });
      }

      router.push("/workers");
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

  const workerTypeOptions = [
    { value: "hourly", label: "Hourly" },
    { value: "salary", label: "Salaried" },
    { value: "contract", label: "Contract" },
  ];

  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "terminated", label: "Terminated" },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  placeholder="John"
                  {...register("first_name")}
                />
                {errors.first_name && (
                  <p className="text-sm text-destructive">{errors.first_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  placeholder="Smith"
                  {...register("last_name")}
                />
                {errors.last_name && (
                  <p className="text-sm text-destructive">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.smith@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="(242) 555-1234"
                {...register("phone")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Street address, city"
                rows={2}
                {...register("address")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker_type">Worker Type *</Label>
              <Select
                value={watch("worker_type")}
                onValueChange={(value) => setValue("worker_type", value as WorkerFormData["worker_type"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {workerTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {workerType === "hourly" && (
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Hourly Rate (BSD)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="15.00"
                  {...register("hourly_rate")}
                />
              </div>
            )}

            {workerType === "salary" && (
              <div className="space-y-2">
                <Label htmlFor="salary_amount">Annual Salary (BSD)</Label>
                <Input
                  id="salary_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="50000.00"
                  {...register("salary_amount")}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="overtime_rate_multiplier">Overtime Rate Multiplier</Label>
              <Input
                id="overtime_rate_multiplier"
                type="number"
                step="0.1"
                min="1"
                placeholder="1.5"
                {...register("overtime_rate_multiplier")}
              />
              <p className="text-xs text-muted-foreground">
                Standard is 1.5x (time and a half)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={watch("status")}
                onValueChange={(value) => setValue("status", value as WorkerFormData["status"])}
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
              <Label htmlFor="hire_date">Hire Date *</Label>
              <DatePicker
                id="hire_date"
                value={watch("hire_date")}
                onChange={(value) => setValue("hire_date", value)}
                required
                error={!!errors.hire_date}
              />
              {errors.hire_date && (
                <p className="text-sm text-destructive">{errors.hire_date.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emergency_contact_name">Contact Name</Label>
              <Input
                id="emergency_contact_name"
                placeholder="Emergency contact name"
                {...register("emergency_contact_name")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emergency_contact_phone">Contact Phone</Label>
              <Input
                id="emergency_contact_phone"
                placeholder="(242) 555-5678"
                {...register("emergency_contact_phone")}
              />
            </div>
          </CardContent>
        </Card>

        {/* NIB Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              NIB Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="nib_enabled"
                checked={watch("nib_enabled")}
                onCheckedChange={(checked) => setValue("nib_enabled", checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="nib_enabled" className="font-medium cursor-pointer">
                  Enable NIB Deductions
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically calculate NIB contributions for this worker&apos;s payroll
                </p>
              </div>
            </div>

            {watch("nib_enabled") && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="nib_number">NIB Number</Label>
                <Input
                  id="nib_number"
                  placeholder="Enter NIB number"
                  {...register("nib_number")}
                />
                <p className="text-xs text-muted-foreground">
                  Worker&apos;s National Insurance Board registration number
                </p>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3 mt-4">
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">NIB Rates (Bahamian Law)</p>
                  <p>Employee: 4.65% • Employer: 6.65% • Max weekly: $550</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional information..."
                rows={4}
                {...register("notes")}
              />
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
          {isEditing ? "Update Worker" : "Add Worker"}
        </Button>
      </div>
    </form>
  );
}
