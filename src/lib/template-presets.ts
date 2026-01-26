/**
 * Pre-built Template Presets
 * Professional templates for estimates and invoices
 */

import type { TemplatePreset } from "@/types";

export const ESTIMATE_PRESETS: TemplatePreset[] = [
  {
    name: "Detailed Breakdown",
    type: "estimate",
    description: "Full transparency with all rates, hours, and costs shown",
    useCase: "Cost-plus contracts, government bids, or clients requiring full detail",
    settings: {
      is_default: true,
      show_quantities: true,
      show_rates: true,
      show_hours: true,
      show_unit_costs: true,
      show_subtotals: true,
      show_markup_percentage: true,
      show_profit_margin: true,
      show_line_item_descriptions: true,
      group_by: "category",
      show_group_subtotals: true,
      line_item_format: "detailed",
      total_format: "detailed",
    },
  },
  {
    name: "Summary View",
    type: "estimate",
    description: "Categories only with totals, no detailed rates",
    useCase: "Large complex projects where full details would be overwhelming",
    settings: {
      show_quantities: false,
      show_rates: false,
      show_hours: false,
      show_unit_costs: false,
      show_subtotals: true,
      show_markup_percentage: false,
      show_profit_margin: false,
      show_line_item_descriptions: false,
      group_by: "category",
      show_group_subtotals: true,
      line_item_format: "summary",
      total_format: "standard",
    },
  },
  {
    name: "Lump Sum",
    type: "estimate",
    description: "Single total price with minimal breakdown",
    useCase: "Labor-only estimates or when client prefers simple pricing",
    settings: {
      show_quantities: false,
      show_rates: false,
      show_hours: false,
      show_unit_costs: false,
      show_subtotals: false,
      show_markup_percentage: false,
      show_profit_margin: false,
      show_line_item_descriptions: true,
      group_by: "none",
      show_group_subtotals: false,
      line_item_format: "minimal",
      total_format: "minimal",
    },
  },
  {
    name: "Phase-Based",
    type: "estimate",
    description: "Organized by project phases for milestone billing",
    useCase: "Multi-phase projects with staged payments",
    settings: {
      show_quantities: false,
      show_rates: false,
      show_hours: false,
      show_unit_costs: false,
      show_subtotals: true,
      show_markup_percentage: false,
      show_profit_margin: false,
      show_line_item_descriptions: true,
      group_by: "phase",
      show_group_subtotals: true,
      line_item_format: "summary",
      total_format: "standard",
    },
  },
  {
    name: "Competitive Bid",
    type: "estimate",
    description: "Professional presentation hiding pricing strategy",
    useCase: "Competitive bidding where you want to protect your rates and margins",
    settings: {
      show_quantities: false,
      show_rates: false,
      show_hours: false,
      show_unit_costs: false,
      show_subtotals: true,
      show_markup_percentage: false,
      show_profit_margin: false,
      show_line_item_descriptions: true,
      group_by: "category",
      show_group_subtotals: false,
      line_item_format: "summary",
      total_format: "standard",
    },
  },
];

export const INVOICE_PRESETS: TemplatePreset[] = [
  {
    name: "Detailed Invoice",
    type: "invoice",
    description: "Complete breakdown of all work and materials",
    useCase: "Time & materials billing or detailed service invoices",
    settings: {
      is_default: true,
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
      total_format: "detailed",
    },
  },
  {
    name: "Summary Invoice",
    type: "invoice",
    description: "Clean categories with subtotals",
    useCase: "Professional invoicing with moderate detail",
    settings: {
      show_quantities: false,
      show_rates: false,
      show_hours: false,
      show_unit_costs: false,
      show_subtotals: true,
      show_markup_percentage: false,
      show_profit_margin: false,
      show_line_item_descriptions: false,
      group_by: "category",
      show_group_subtotals: true,
      line_item_format: "summary",
      total_format: "standard",
    },
  },
  {
    name: "Simple Invoice",
    type: "invoice",
    description: "Minimal invoice with just total amount",
    useCase: "Fixed-price contracts or milestone payments",
    settings: {
      show_quantities: false,
      show_rates: false,
      show_hours: false,
      show_unit_costs: false,
      show_subtotals: false,
      show_markup_percentage: false,
      show_profit_margin: false,
      show_line_item_descriptions: true,
      group_by: "none",
      show_group_subtotals: false,
      line_item_format: "minimal",
      total_format: "minimal",
    },
  },
];

export const ALL_PRESETS: TemplatePreset[] = [...ESTIMATE_PRESETS, ...INVOICE_PRESETS];

/**
 * Get preset by name and type
 */
export function getPreset(name: string, type: "estimate" | "invoice"): TemplatePreset | undefined {
  return ALL_PRESETS.find((p) => p.name === name && p.type === type);
}

/**
 * Get all presets for a specific type
 */
export function getPresetsByType(type: "estimate" | "invoice"): TemplatePreset[] {
  return type === "estimate" ? ESTIMATE_PRESETS : INVOICE_PRESETS;
}

/**
 * Suggest best template based on estimate/invoice properties
 */
export function suggestTemplate(data: {
  total?: number;
  lineItemCount?: number;
  clientType?: string;
  isCompetitiveBid?: boolean;
  hasPhases?: boolean;
}): TemplatePreset {
  const { total = 0, lineItemCount = 0, clientType, isCompetitiveBid, hasPhases } = data;

  // Competitive bid
  if (isCompetitiveBid) {
    return ESTIMATE_PRESETS.find((p) => p.name === "Competitive Bid")!;
  }

  // Phase-based project
  if (hasPhases) {
    return ESTIMATE_PRESETS.find((p) => p.name === "Phase-Based")!;
  }

  // Cost-plus or government contract
  if (clientType === "government" || clientType === "cost_plus") {
    return ESTIMATE_PRESETS.find((p) => p.name === "Detailed Breakdown")!;
  }

  // Large complex project
  if (total > 100000 && lineItemCount > 20) {
    return ESTIMATE_PRESETS.find((p) => p.name === "Summary View")!;
  }

  // Simple/small project
  if (total < 10000 || lineItemCount < 5) {
    return ESTIMATE_PRESETS.find((p) => p.name === "Lump Sum")!;
  }

  // Default to detailed
  return ESTIMATE_PRESETS.find((p) => p.name === "Detailed Breakdown")!;
}
