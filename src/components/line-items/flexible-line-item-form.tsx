"use client";

/**
 * Flexible Line Item Entry Form
 * Supports 3 entry modes: detailed, simple, and lump_sum
 */

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Calculator, Briefcase, Package, Wrench } from "lucide-react";
import type { LineItemEntryMode, EstimateLineCategory, InvoiceLineCategory, Worker } from "@/types";

interface FlexibleLineItemFormProps {
  type: "estimate" | "invoice";
  onSave: (item: any) => void;
  onCancel: () => void;
  workers?: Worker[];
  initialData?: any;
  quickMode?: LineItemEntryMode;
  quickCategory?: string;
}

const ESTIMATE_CATEGORIES: { value: EstimateLineCategory; label: string; icon: any }[] = [
  { value: "labor", label: "Labor", icon: Briefcase },
  { value: "material", label: "Materials", icon: Package },
  { value: "equipment", label: "Equipment", icon: Wrench },
  { value: "subcontractor", label: "Subcontractor", icon: Briefcase },
  { value: "other", label: "Other", icon: Package },
];

const INVOICE_CATEGORIES: { value: InvoiceLineCategory; label: string; icon: any }[] = [
  { value: "labor", label: "Labor", icon: Briefcase },
  { value: "material", label: "Materials", icon: Package },
  { value: "equipment", label: "Equipment", icon: Wrench },
  { value: "overhead", label: "Overhead", icon: Calculator },
  { value: "other", label: "Other", icon: Package },
];

const UNITS = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "units", label: "Units" },
  { value: "each", label: "Each" },
  { value: "sqft", label: "Square Feet" },
  { value: "lbs", label: "Pounds" },
  { value: "bags", label: "Bags" },
  { value: "sheets", label: "Sheets" },
  { value: "linear ft", label: "Linear Feet" },
];

export function FlexibleLineItemForm({
  type,
  onSave,
  onCancel,
  workers = [],
  initialData,
  quickMode,
  quickCategory,
}: FlexibleLineItemFormProps) {
  const categories = type === "estimate" ? ESTIMATE_CATEGORIES : INVOICE_CATEGORIES;

  const [entryMode, setEntryMode] = useState<LineItemEntryMode>(
    quickMode || initialData?.entry_mode || "detailed"
  );
  const [formData, setFormData] = useState({
    category: quickCategory || initialData?.category || "",
    description: initialData?.description || "",
    worker_id: initialData?.worker_id || "",
    quantity: initialData?.quantity || "",
    unit: initialData?.unit || "hours",
    unit_rate: initialData?.unit_rate || "",
    manual_amount: initialData?.manual_amount || "",
    notes: initialData?.notes || "",
  });

  // Auto-fill rate when worker is selected in detailed mode
  useEffect(() => {
    if (entryMode === "detailed" && formData.worker_id) {
      const worker = workers.find((w) => w.id === formData.worker_id);
      if (worker && !formData.unit_rate) {
        const hourlyRate = worker.hourly_rate;
        if (hourlyRate !== undefined) {
          setFormData((prev) => ({ ...prev, unit_rate: hourlyRate.toString() }));
        }
      }
    }
  }, [formData.worker_id, entryMode, workers]);

  // Calculate amount based on entry mode
  const calculatedAmount = useMemo(() => {
    if (entryMode === "lump_sum") {
      return parseFloat(formData.manual_amount) || 0;
    }

    const qty = parseFloat(formData.quantity as string) || 0;
    const rate = parseFloat(formData.unit_rate as string) || 0;

    if (qty && rate) {
      return qty * rate;
    }

    return 0;
  }, [entryMode, formData.quantity, formData.unit_rate, formData.manual_amount]);

  const handleSave = () => {
    // Validate based on mode
    if (!formData.category) {
      alert("Please select a category");
      return;
    }

    if (!formData.description.trim()) {
      alert("Please enter a description");
      return;
    }

    if (entryMode === "lump_sum") {
      if (!formData.manual_amount || parseFloat(formData.manual_amount as string) <= 0) {
        alert("Please enter a valid amount");
        return;
      }
    } else if (entryMode === "simple") {
      if (!formData.quantity || !formData.unit_rate) {
        alert("Please enter quantity and rate");
        return;
      }
    } else {
      // Detailed mode
      if (!formData.worker_id) {
        alert("Please select a worker");
        return;
      }
      if (!formData.quantity || !formData.unit_rate) {
        alert("Please enter quantity and rate");
        return;
      }
    }

    const lineItem = {
      ...formData,
      entry_mode: entryMode,
      amount: calculatedAmount,
      quantity: entryMode === "lump_sum" ? null : parseFloat(formData.quantity as string),
      unit_rate: entryMode === "lump_sum" ? null : parseFloat(formData.unit_rate as string),
      manual_amount: entryMode === "lump_sum" ? parseFloat(formData.manual_amount as string) : null,
      worker_id: entryMode === "detailed" ? formData.worker_id : null,
    };

    onSave(lineItem);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{initialData ? "Edit" : "Add"} Line Item</CardTitle>
            <CardDescription>
              {entryMode === "lump_sum" && "Enter a total amount only"}
              {entryMode === "simple" && "Enter quantity × rate"}
              {entryMode === "detailed" && "Full breakdown with worker details"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Entry Mode Selection */}
        {!quickMode && (
          <div className="space-y-3">
            <Label>Entry Type</Label>
            <RadioGroup value={entryMode} onValueChange={(value) => setEntryMode(value as LineItemEntryMode)}>
              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="detailed" id="detailed" className="mt-0.5" />
                <Label htmlFor="detailed" className="cursor-pointer flex-1">
                  <div className="font-medium">Detailed</div>
                  <div className="text-sm text-muted-foreground">
                    Full breakdown with worker, hours, and rate
                  </div>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="simple" id="simple" className="mt-0.5" />
                <Label htmlFor="simple" className="cursor-pointer flex-1">
                  <div className="font-medium">Simple</div>
                  <div className="text-sm text-muted-foreground">
                    Quantity × Rate (no worker needed)
                  </div>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="lump_sum" id="lump_sum" className="mt-0.5" />
                <Label htmlFor="lump_sum" className="cursor-pointer flex-1">
                  <div className="font-medium">Lump Sum</div>
                  <div className="text-sm text-muted-foreground">
                    Total amount only - fastest entry
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        <div className="border-t pt-6 space-y-4">
          {/* Description - Always shown */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={
                entryMode === "lump_sum"
                  ? "E.g., Labor costs, Materials, Total electrical work"
                  : "E.g., Framing labor, Lumber 2x4x8, Equipment rental"
              }
            />
          </div>

          {/* Category - Always shown */}
          <div className="space-y-2">
            <Label htmlFor="category">
              Category <span className="text-destructive">*</span>
            </Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <div className="flex items-center gap-2">
                      <cat.icon className="h-4 w-4" />
                      {cat.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Detailed Mode Fields */}
          {entryMode === "detailed" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="worker">
                  Worker <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.worker_id}
                  onValueChange={(value) => setFormData({ ...formData, worker_id: value })}
                >
                  <SelectTrigger id="worker">
                    <SelectValue placeholder="Select worker..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.first_name} {worker.last_name} {worker.hourly_rate ? `($${worker.hourly_rate}/hr)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">
                    Quantity <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">
                    Unit <span className="text-destructive">*</span>
                  </Label>
                  <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate">
                    Rate <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.unit_rate}
                      onChange={(e) => setFormData({ ...formData, unit_rate: e.target.value })}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Simple Mode Fields */}
          {entryMode === "simple" && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  Quantity <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">
                  Unit <span className="text-destructive">*</span>
                </Label>
                <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                  <SelectTrigger id="unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">
                  Rate <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.unit_rate}
                    onChange={(e) => setFormData({ ...formData, unit_rate: e.target.value })}
                    placeholder="0.00"
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Lump Sum Mode Fields */}
          {entryMode === "lump_sum" && (
            <div className="space-y-2">
              <Label htmlFor="manual_amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-lg text-muted-foreground">$</span>
                <Input
                  id="manual_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.manual_amount}
                  onChange={(e) => setFormData({ ...formData, manual_amount: e.target.value })}
                  placeholder="0.00"
                  className="pl-8 text-lg font-medium"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Enter the total amount for this line item
              </p>
            </div>
          )}

          {/* Amount Display */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">
                  {entryMode === "lump_sum" ? "Amount" : "Calculated Amount"}
                </span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">
                  ${calculatedAmount.toFixed(2)}
                </div>
                {entryMode !== "lump_sum" && formData.quantity && formData.unit_rate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.quantity} {formData.unit} × ${parseFloat(formData.unit_rate as string).toFixed(2)} = $
                    {calculatedAmount.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Notes - Optional for all modes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Additional details or clarifications..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            {initialData ? "Save Changes" : "Add Item"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
