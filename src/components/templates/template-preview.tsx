"use client";

/**
 * Template Preview Component
 * Shows live preview of document template
 */

import { formatCurrency } from "@/lib/utils";
import type { DocumentTemplateFormData } from "@/types";
import { Separator } from "@/components/ui/card";

// Sample data for preview
const SAMPLE_LINE_ITEMS = {
  estimate: [
    {
      category: "labor",
      description: "Framing and structural work",
      quantity: 80,
      unit: "hours",
      unit_rate: 35.0,
      amount: 2800.0,
    },
    {
      category: "labor",
      description: "Electrical installation",
      quantity: 40,
      unit: "hours",
      unit_rate: 45.0,
      amount: 1800.0,
    },
    {
      category: "material",
      description: "Lumber 2x4x8",
      quantity: 200,
      unit: "units",
      unit_rate: 8.5,
      amount: 1700.0,
    },
    {
      category: "material",
      description: "Cement 94lb bags",
      quantity: 50,
      unit: "bags",
      unit_rate: 12.0,
      amount: 600.0,
    },
    {
      category: "equipment",
      description: "Excavator rental",
      quantity: 5,
      unit: "days",
      unit_rate: 200.0,
      amount: 1000.0,
    },
  ],
  invoice: [
    {
      category: "labor",
      description: "Site preparation and excavation",
      quantity: 40,
      unit: "hours",
      unit_rate: 30.0,
      amount: 1200.0,
    },
    {
      category: "labor",
      description: "Foundation pouring",
      quantity: 60,
      unit: "hours",
      unit_rate: 35.0,
      amount: 2100.0,
    },
    {
      category: "material",
      description: "Concrete mix",
      quantity: 15,
      unit: "yards",
      unit_rate: 120.0,
      amount: 1800.0,
    },
    {
      category: "material",
      description: "Rebar and mesh",
      quantity: 1,
      unit: "lot",
      unit_rate: 850.0,
      amount: 850.0,
    },
  ],
};

interface TemplatePreviewProps {
  template: DocumentTemplateFormData;
}

export function TemplatePreview({ template }: TemplatePreviewProps) {
  const lineItems = SAMPLE_LINE_ITEMS[template.type];
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const markupPercent = 15;
  const markupAmount = subtotal * (markupPercent / 100);
  const profitPercent = 10;
  const profitAmount = subtotal * (profitPercent / 100);
  const taxRate = 10;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + markupAmount + taxAmount;

  // Group items if needed
  const groupedItems =
    template.group_by === "none"
      ? { All: lineItems }
      : lineItems.reduce((groups, item) => {
          const key = item.category;
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
          return groups;
        }, {} as Record<string, typeof lineItems>);

  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-950 text-sm space-y-4 max-h-[600px] overflow-y-auto">
      {/* Header */}
      <div className="text-center border-b pb-4">
        <h2 className="text-2xl font-bold">
          {template.type === "estimate" ? "ESTIMATE" : "INVOICE"}
        </h2>
        <p className="text-muted-foreground mt-1">
          {template.type === "estimate" ? "EST-001" : "INV-001"}
        </p>
      </div>

      {/* Line Items */}
      <div className="space-y-4">
        {Object.entries(groupedItems).map(([groupName, items]) => (
          <div key={groupName}>
            {template.group_by !== "none" && (
              <h3 className="font-semibold text-base mb-2 uppercase text-gray-700 dark:text-gray-300">
                {groupName}
              </h3>
            )}

            <div className="space-y-2">
              {items.map((item, index) => {
                const showDetails =
                  template.line_item_format === "detailed" ||
                  template.line_item_format === "summary";
                const showFullDetails = template.line_item_format === "detailed";

                return (
                  <div key={index} className="py-1">
                    {template.line_item_format === "minimal" ? (
                      // Minimal format - just description and amount
                      <div className="flex justify-between items-center">
                        {template.show_line_item_descriptions && (
                          <span className="text-gray-600 dark:text-gray-400">
                            {item.description}
                          </span>
                        )}
                        <span className="font-medium">{formatCurrency(item.amount)}</span>
                      </div>
                    ) : (
                      // Detailed or Summary format
                      <div>
                        {template.show_line_item_descriptions && (
                          <div className="font-medium">{item.description}</div>
                        )}

                        <div className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                          <div>
                            {showFullDetails && (
                              <>
                                {template.show_quantities && (
                                  <span>
                                    {item.quantity} {item.unit}
                                  </span>
                                )}
                                {template.show_quantities && template.show_rates && (
                                  <span> × </span>
                                )}
                                {template.show_rates && (
                                  <span>{formatCurrency(item.unit_rate)}</span>
                                )}
                                {template.show_rates && item.unit && <span>/{item.unit}</span>}
                              </>
                            )}
                          </div>
                          <span className="font-medium">{formatCurrency(item.amount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {template.group_by !== "none" && template.show_group_subtotals && (
              <div className="flex justify-between items-center mt-2 pt-2 border-t text-sm font-medium">
                <span>{groupName} Subtotal</span>
                <span>
                  {formatCurrency(items.reduce((sum, item) => sum + item.amount, 0))}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totals Section */}
      <div className="border-t pt-4 mt-6 space-y-2">
        {template.total_format === "minimal" ? (
          // Minimal - just total
          <div className="flex justify-between items-center text-lg font-bold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        ) : (
          // Standard or Detailed
          <>
            {template.show_subtotals && (
              <div className="flex justify-between items-center">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
            )}

            {template.show_markup_percentage && template.type === "estimate" && (
              <div className="flex justify-between items-center">
                <span>Markup ({markupPercent}%)</span>
                <span>{formatCurrency(markupAmount)}</span>
              </div>
            )}

            {template.show_profit_margin && template.type === "estimate" && (
              <div className="flex justify-between items-center">
                <span>Profit Margin ({profitPercent}%)</span>
                <span>{formatCurrency(profitAmount)}</span>
              </div>
            )}

            {template.total_format === "detailed" && (
              <div className="flex justify-between items-center">
                <span>Tax ({taxRate}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </>
        )}
      </div>

      {/* Footer Note */}
      <div className="border-t pt-4 mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
        This is a preview using sample data
      </div>
    </div>
  );
}
