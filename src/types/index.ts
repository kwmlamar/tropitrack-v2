// User and Authentication Types
export type UserRole = "admin" | "project_manager" | "worker";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  company_id?: string;
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// COMPANY TYPES
// ============================================

export interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  // Tax information
  vat_tax_id?: string;
  business_registration_number?: string;
  // Payment instructions (for receiving customer payments)
  payment_bank_name?: string;
  payment_account_name?: string;
  payment_account_number?: string;
  payment_routing_number?: string;
  payment_swift_code?: string;
  payment_mobile_money?: string;
  payment_instructions?: string;
  payment_notes?: string;
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface CompanyFormData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  vat_tax_id?: string;
  business_registration_number?: string;
}

export interface PaymentInstructionsFormData {
  payment_bank_name?: string;
  payment_account_name?: string;
  payment_account_number?: string;
  payment_routing_number?: string;
  payment_swift_code?: string;
  payment_mobile_money?: string;
  payment_instructions?: string;
  payment_notes?: string;
}

// ============================================
// INVITATION TYPES
// ============================================

export type InvitationRole = "admin" | "worker";
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface Invitation {
  id: string;
  company_id: string;
  email: string;
  role: InvitationRole;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
}

export interface InvitationWithDetails extends Invitation {
  company_name?: string;
  invited_by_name?: string;
  invited_by_email?: string;
}

export interface InvitationFormData {
  email: string;
  role: InvitationRole;
}

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  company_id: string;
  is_owner: boolean;
  company_name?: string;
  created_at: string;
  updated_at: string;
}

// Project Types
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export interface Project {
  id: string;
  name: string;
  description?: string;
  client_id?: string; // New: foreign key to clients table
  client_name?: string; // Legacy: for backward compatibility
  client_email?: string; // Legacy: for backward compatibility
  client_phone?: string; // Legacy: for backward compatibility
  location: string;
  status: ProjectStatus;
  start_date: string;
  estimated_end_date?: string;
  actual_end_date?: string;
  budget: number;
  contract_value: number;
  /** True for flat-fee/T&M jobs with no fixed contract — lets contract_value be a deliberate 0. */
  no_fixed_contract: boolean;
  project_manager_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  due_date: string;
  completed_date?: string;
  is_completed: boolean;
  order_index: number;
  created_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  file_path: string;
  file_type: string;
  file_size: number;
  category: "plan" | "permit" | "invoice" | "contract" | "photo" | "other";
  uploaded_by: string;
  created_at: string;
}

// Worker Types
export type WorkerStatus = "active" | "inactive" | "terminated";
export type WorkerType = "hourly" | "salary" | "contract";

export interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  national_insurance_number?: string;
  worker_type: WorkerType;
  hourly_rate?: number;
  salary_amount?: number;
  overtime_rate_multiplier: number;
  status: WorkerStatus;
  hire_date: string;
  termination_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
  // NIB (National Insurance Board) settings
  nib_enabled?: boolean;
  nib_number?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkerSkill {
  id: string;
  worker_id: string;
  skill_name: string;
  proficiency_level: "beginner" | "intermediate" | "advanced" | "expert";
  created_at: string;
}

// Time Tracking Types
export interface TimeEntry {
  id: string;
  worker_id: string;
  project_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  regular_hours: number;
  overtime_hours: number;
  notes?: string;
  approved_by?: string;
  approved_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DailyTimesheet {
  id: string;
  project_id: string;
  date: string;
  submitted_by: string;
  submitted_at: string;
  notes?: string;
  created_at: string;
}

// Payroll Types
export type PayPeriodStatus = "open" | "processing" | "paid" | "cancelled";

export interface PayPeriod {
  id: string;
  start_date: string;
  end_date: string;
  status: PayPeriodStatus;
  processed_at?: string;
  processed_by?: string;
  notes?: string;
  created_at: string;
  // Void fields
  voided_at?: string;
  voided_by?: string;
  void_reason?: string;
  // Reopen fields
  reopened_at?: string;
  reopened_by?: string;
  reopen_reason?: string;
}

export interface PayrollEntry {
  id: string;
  pay_period_id: string;
  worker_id: string;
  regular_hours: number;
  overtime_hours: number;
  regular_rate: number;
  overtime_rate: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  deduction_details?: Record<string, number>;
  created_at: string;
  // Payment tracking fields
  is_paid?: boolean;
  paid_at?: string;
  total_paid?: number;
  payment_status?: "unpaid" | "partial" | "paid";
}

// Payroll Adjustment Types
export type PayrollAdjustmentType = "correction" | "bonus" | "deduction" | "reversal" | "hours_correction";

export interface PayrollAdjustment {
  id: string;
  original_entry_id?: string;
  pay_period_id: string;
  worker_id: string;
  adjustment_type: PayrollAdjustmentType;
  hours_adjustment: number;
  amount_adjustment: number;
  reason: string;
  applied_in_period_id?: string;
  created_by?: string;
  created_at: string;
  // Joined fields
  worker?: {
    first_name: string;
    last_name: string;
  };
}

// Materials and Inventory Types
export type MaterialCategory =
  | "lumber"
  | "concrete"
  | "steel"
  | "electrical"
  | "plumbing"
  | "roofing"
  | "finishing"
  | "hardware"
  | "tools"
  | "safety"
  | "other";

export interface Material {
  id: string;
  name: string;
  description?: string;
  category: MaterialCategory;
  unit: string;
  unit_cost: number;
  quantity_in_stock: number;
  minimum_stock_level: number;
  supplier_id?: string;
  sku?: string;
  // Enhanced fields for price tracking
  vendor_product_code?: string; // Vendor's SKU/product code
  last_purchase_price?: number;
  last_purchase_date?: string;
  average_price?: number;
  company_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialPriceHistory {
  id: string;
  material_id: string;
  vendor_id?: string;
  product_code?: string;
  purchase_date: string;
  quantity: number;
  unit_price: number;
  purchase_order_id?: string;
  company_id?: string;
  created_at: string;
}

export interface MaterialAllocation {
  id: string;
  material_id: string;
  project_id: string;
  quantity: number;
  allocated_date: string;
  allocated_by: string;
  notes?: string;
  created_at: string;
}

// Vendor Types
export type VendorStatus = "active" | "inactive" | "blacklisted";

export interface Vendor {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  payment_terms?: string;
  status: VendorStatus;
  notes?: string;
  // Enhanced fields for receipt scanning
  tin?: string; // Tax Identification Number
  account_number?: string; // Customer account number with this vendor
  default_payment_terms?: string;
  company_id?: string;
  created_at: string;
  updated_at: string;
}

export interface VendorDirectory {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  tin?: string;
  created_at: string;
}

// Purchase Order Types
export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "ordered"
  | "partial_received"
  | "received"
  | "cancelled";

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  project_id?: string;
  status: PurchaseOrderStatus;
  order_date?: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  total_amount: number;
  // Discount fields
  discount_amount?: number;
  discount_label?: string;
  subtotal_before_discount?: number;
  subtotal_after_discount?: number;
  notes?: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  material_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  quantity_received: number;
  // Enhanced fields
  product_code?: string; // Vendor's product code
  unit?: string; // Unit of measure
  created_at: string;
}

// Equipment and Overhead Types
export interface Equipment {
  id: string;
  name: string;
  description?: string;
  serial_number?: string;
  purchase_date?: string;
  purchase_cost?: number;
  hourly_rate: number;
  daily_rate: number;
  status: "available" | "in_use" | "maintenance" | "retired";
  current_project_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EquipmentUsage {
  id: string;
  equipment_id: string;
  project_id: string;
  start_date: string;
  end_date?: string;
  hours_used?: number;
  cost: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

export type OverheadCategory =
  | "administrative"
  | "insurance"
  | "utilities"
  | "rent"
  | "vehicle"
  | "permits"
  | "professional_services"
  | "other";

export interface OverheadCost {
  id: string;
  category: OverheadCategory;
  description: string;
  amount: number;
  date: string;
  project_id?: string;
  is_recurring: boolean;
  recurrence_period?: "weekly" | "monthly" | "quarterly" | "yearly";
  notes?: string;
  created_by: string;
  created_at: string;
}

// Cost Allocation Types
export interface ProjectCostSummary {
  project_id: string;
  labor_cost: number;
  material_cost: number;
  equipment_cost: number;
  overhead_cost: number;
  total_cost: number;
  budget: number;
  variance: number;
  profit_margin: number;
}

// Dashboard and Reporting Types
export interface DashboardStats {
  active_projects: number;
  total_workers: number;
  pending_timesheets: number;
  low_stock_materials: number;
  total_revenue: number;
  total_expenses: number;
  profit_margin: number;
}

export interface ProjectReport {
  project: Project;
  cost_summary: ProjectCostSummary;
  milestones: ProjectMilestone[];
  recent_time_entries: TimeEntry[];
  material_allocations: MaterialAllocation[];
}

// API Response Types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Form Types
export interface ProjectFormData {
  name: string;
  description?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  location: string;
  status: ProjectStatus;
  start_date: string;
  estimated_end_date?: string;
  budget: number;
  contract_value: number;
  project_manager_id?: string;
}

export interface WorkerFormData {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  national_insurance_number?: string;
  worker_type: WorkerType;
  hourly_rate?: number;
  salary_amount?: number;
  overtime_rate_multiplier: number;
  status: WorkerStatus;
  hire_date: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
  // NIB (National Insurance Board) settings
  nib_enabled?: boolean;
  nib_number?: string;
}

export interface TimeEntryFormData {
  worker_id: string;
  project_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  notes?: string;
}

export interface MaterialFormData {
  name: string;
  description?: string;
  category: MaterialCategory;
  unit: string;
  unit_cost: number;
  quantity_in_stock: number;
  minimum_stock_level: number;
  supplier_id?: string;
  sku?: string;
}

// ============================================
// CLIENT TYPES
// ============================================

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  tax_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientFormData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  tax_id?: string;
  notes?: string;
}

export interface ClientBalance {
  client_id: string;
  name: string;
  email?: string;
  phone?: string;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  overdue_invoices: number;
  open_invoices: number;
}

// ============================================
// ESTIMATE TYPES
// ============================================

export type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "converted" | "expired";
export type EstimateLineCategory = "labor" | "material" | "equipment" | "subcontractor" | "other";

export interface Estimate {
  id: string;
  estimate_number: string;
  client_id?: string;
  project_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  title: string;
  description?: string;
  status: EstimateStatus;
  issue_date: string;
  valid_until?: string;
  subtotal: number;
  overhead_markup_percent: number;
  overhead_amount: number;
  profit_margin_percent: number;
  profit_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  /** Estimate-level default labor sell rate per worker-day. Used when a line item does not override. */
  labor_sell_rate_per_day?: number | null;
  /** Default markup % applied to material line items when a line does not override. ODS default 75. */
  default_material_markup_pct?: number;
  /** Default markup % applied to equipment line items when a line does not override. Default 0 (pass-through). */
  default_equipment_markup_pct?: number;
  notes?: string;
  terms_and_conditions?: string;
  template_id?: string;
  /** Link to the source estimate document (Dropbox path or share link) — authored outside TropiTrack. */
  document_url?: string | null;
  sent_at?: string;
  approved_at?: string;
  rejected_at?: string;
  converted_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type LineItemEntryMode = "detailed" | "simple" | "lump_sum";

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  /** Section grouping (FK to estimate_sections). Required on the live schema. */
  section_id: string;
  /**
   * Legacy single-category tag. The live DB does NOT carry this column — line items
   * are composite (labor_cost + material_cost + equipment_cost on the same row).
   * Kept optional for legacy code paths (e.g. estimate-form.tsx) that still set it.
   */
  category?: EstimateLineCategory;
  worker_id?: string;
  material_id?: string;
  equipment_id?: string;
  description: string;
  /**
   * Optional client-facing label override. Null/empty = render `description` in
   * the client preview. See issue #13 and the two-layer estimate model.
   */
  client_name?: string | null;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  amount: number;
  /** Scheduling: total worker-days for this task. labor_cost = man_days * labor_sell_rate. */
  man_days: number;
  /** Per-line override for the estimate's labor_sell_rate_per_day. Null falls back to estimate default. */
  labor_sell_rate_per_day?: number | null;
  /** Per-line markup % override. Null falls back to estimate default for this line's category. */
  markup_pct?: number | null;
  /** Cached labor cost — may be either typed manually or computed from man_days × rate. */
  labor_cost?: number;
  material_cost?: number;
  equipment_cost?: number;
  crew_days?: number | null;
  /** Per-day crew deployment matrix, keyed by ISO date string. */
  daily_workers?: Record<string, number>;
  planned_start?: string | null;
  planned_end?: string | null;
  show_to_client?: boolean;
  entry_mode: LineItemEntryMode;
  manual_amount?: number;
  notes?: string;
  order_index: number;
  created_at: string;
}

/**
 * Compute labor cost for a line item using the locked formula:
 *   labor_cost = man_days × COALESCE(line.labor_sell_rate_per_day, estimate.labor_sell_rate_per_day)
 *
 * Returns 0 if neither rate is set.
 */
export function computeLaborCost(
  lineItem: Pick<EstimateLineItem, "man_days" | "labor_sell_rate_per_day">,
  estimateRate?: number | null,
): number {
  const rate = lineItem.labor_sell_rate_per_day ?? estimateRate ?? 0;
  return (lineItem.man_days ?? 0) * rate;
}

/**
 * Takeoff-level material line — child of an `estimate_section`. See migration
 * 20260604_section_materials_takeoff. Sell amount = `qty × unit_cost × (1 +
 * resolvedMarkup / 100)` where resolved markup falls back to the estimate's
 * default for material or equipment depending on `is_equipment`.
 */
export interface EstimateSectionMaterial {
  id: string;
  section_id: string;
  /** Optional catalog FK. Null = free-form entry. */
  material_id?: string | null;
  /** Snapshot from catalog or free-form. Always populated. */
  description: string;
  /**
   * Optional client-facing label override. Null/empty = render `description` in
   * the client preview. See issue #13.
   */
  client_name?: string | null;
  quantity: number;
  unit?: string | null;
  /** Snapshot — catalog price changes do not mutate this row. */
  unit_cost: number;
  /** Per-line markup % override. Null falls back to estimate default. */
  markup_pct?: number | null;
  /** true → equipment line (uses default_equipment_markup_pct). false → material. */
  is_equipment: boolean;
  notes?: string | null;
  order_index: number;
  created_at: string;
  updated_at?: string;
}

/**
 * Compute the sell amount for one takeoff material line:
 *   sell = qty × unit_cost × (1 + COALESCE(line.markup_pct, estimate default for category) / 100)
 */
export function computeSectionMaterialSell(
  line: Pick<EstimateSectionMaterial, "quantity" | "unit_cost" | "markup_pct" | "is_equipment">,
  estimate: Pick<Estimate, "default_material_markup_pct" | "default_equipment_markup_pct">,
): number {
  const qty = Number(line.quantity ?? 0);
  const rate = Number(line.unit_cost ?? 0);
  const fallback = line.is_equipment
    ? (estimate.default_equipment_markup_pct ?? 0)
    : (estimate.default_material_markup_pct ?? 0);
  const markup = line.markup_pct != null ? line.markup_pct : fallback;
  return qty * rate * (1 + Number(markup) / 100);
}

export function computeSectionMaterialCost(
  line: Pick<EstimateSectionMaterial, "quantity" | "unit_cost">,
): number {
  return Number(line.quantity ?? 0) * Number(line.unit_cost ?? 0);
}

/**
 * Resolve the effective material markup % for a line item. Per-line override
 * (`markup_pct`) beats the estimate's `default_material_markup_pct`.
 *
 * Note: the locked design uses a single `markup_pct` per line that applies to
 * both the material and equipment portions. If you need divergent markups,
 * split the line item.
 */
export function resolveMaterialMarkupPct(
  lineItem: Pick<EstimateLineItem, "markup_pct">,
  estimate: Pick<Estimate, "default_material_markup_pct">,
): number {
  if (lineItem.markup_pct != null) return lineItem.markup_pct;
  return estimate.default_material_markup_pct ?? 0;
}

export function resolveEquipmentMarkupPct(
  lineItem: Pick<EstimateLineItem, "markup_pct">,
  estimate: Pick<Estimate, "default_equipment_markup_pct">,
): number {
  if (lineItem.markup_pct != null) return lineItem.markup_pct;
  return estimate.default_equipment_markup_pct ?? 0;
}

/**
 * Compute the client-facing sell amount for a single line item:
 *
 *   sell = labor_cost                          (labor uses sell-rate, no markup)
 *        + material_cost  × (1 + material_markup / 100)
 *        + equipment_cost × (1 + equipment_markup / 100)
 *
 * The line item carries composite labor/material/equipment costs (no category
 * column — see EstimateLineItem comment). Markup is applied per-category using
 * the estimate defaults unless the line overrides via `markup_pct`.
 */
export function computeSellAmount(
  lineItem: Pick<EstimateLineItem, "labor_cost" | "material_cost" | "equipment_cost" | "markup_pct">,
  estimate: Pick<Estimate, "default_material_markup_pct" | "default_equipment_markup_pct">,
): number {
  const labor = lineItem.labor_cost ?? 0;
  const material = lineItem.material_cost ?? 0;
  const equipment = lineItem.equipment_cost ?? 0;
  const matMarkup = resolveMaterialMarkupPct(lineItem, estimate);
  const eqMarkup = resolveEquipmentMarkupPct(lineItem, estimate);
  return labor + material * (1 + matMarkup / 100) + equipment * (1 + eqMarkup / 100);
}

export interface EstimateFormData {
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  title: string;
  description?: string;
  issue_date: string;
  valid_until?: string;
  overhead_markup_percent: number;
  profit_margin_percent: number;
  tax_rate: number;
  notes?: string;
  terms_and_conditions?: string;
}

export interface EstimateLineItemFormData {
  category: EstimateLineCategory;
  worker_id?: string;
  material_id?: string;
  equipment_id?: string;
  description: string;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  entry_mode: LineItemEntryMode;
  manual_amount?: number;
  notes?: string;
}

export interface EstimateWithLineItems extends Estimate {
  line_items: EstimateLineItem[];
  client?: Client;
  project?: Project;
}

// ============================================
// ESTIMATE BUILDER TYPES (Buildertrend-style)
// ============================================

export type CostType = "material" | "labor" | "equipment" | "subcontractor" | "other";
export type MarkupStrategy = "item" | "category" | "global";
export type CostItemUnit = "EACH" | "sqft" | "lnft" | "CU YD" | "hour" | "day" | "sheet" | "bag" | "ton" | "gallon";

export interface CostCode {
  id: string;
  company_id?: string;
  code: string;
  name: string;
  description?: string;
  parent_code_id?: string;
  is_template: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CostCatalogItem {
  id: string;
  company_id?: string;
  cost_code_id?: string;
  cost_code?: CostCode;
  title: string;
  description?: string;
  cost_type: CostType;
  unit_cost: number;
  unit: string;
  default_markup_percent: number;
  is_template: boolean;
  times_used: number;
  last_used_date?: string;
  created_at: string;
  updated_at: string;
}

export interface EstimateCategory {
  id: string;
  estimate_id: string;
  cost_code_id?: string;
  cost_code?: CostCode;
  name: string;
  description?: string;
  display_order: number;
  builder_cost: number;
  client_price: number;
  profit: number;
  is_expanded: boolean;
  show_to_client: boolean;
  items?: EstimateBuilderItem[];
  created_at: string;
  updated_at: string;
}

export interface EstimateBuilderItem {
  id: string;
  estimate_id: string;
  category_id?: string;
  cost_catalog_id?: string;
  cost_code?: string;
  title: string;
  description: string;
  cost_type: CostType;
  unit_cost: number;
  quantity: number;
  unit: string;
  builder_cost: number;
  markup_percent: number;
  markup_amount: number;
  client_price: number;
  profit: number;
  display_order: number;
  show_to_client: boolean;
  save_to_catalog: boolean;
  category?: EstimateLineCategory;
  notes?: string;
}

export interface EstimateBuilderData extends Estimate {
  builder_cost: number;
  client_price: number;
  estimated_profit: number;
  markup_strategy: MarkupStrategy;
  global_markup_percent: number;
  is_locked: boolean;
  sent_to_client: boolean;
  client_approved: boolean;
  client_approved_at?: string;
  categories: EstimateCategory[];
}

// ============================================
// INVOICE TYPES
// ============================================

export type InvoiceType = "progress" | "time_and_materials" | "fixed_price" | "final";
export type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "partial" | "overdue" | "cancelled" | "void";
export type InvoiceLineCategory = "labor" | "material" | "equipment" | "overhead" | "other";

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id?: string;
  project_id?: string;
  estimate_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes?: string;
  terms?: string;
  template_id?: string;
  sent_at?: string;
  viewed_at?: string;
  paid_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  category: InvoiceLineCategory;
  time_entry_id?: string;
  material_allocation_id?: string;
  equipment_usage_id?: string;
  description: string;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  amount: number;
  entry_mode: LineItemEntryMode;
  manual_amount?: number;
  notes?: string;
  order_index: number;
  created_at: string;
}

export interface InvoiceFormData {
  client_id?: string;
  project_id?: string;
  estimate_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  invoice_type: InvoiceType;
  issue_date: string;
  due_date: string;
  tax_rate: number;
  notes?: string;
  terms?: string;
}

export interface InvoiceLineItemFormData {
  category: InvoiceLineCategory;
  time_entry_id?: string;
  material_allocation_id?: string;
  equipment_usage_id?: string;
  description: string;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  entry_mode: LineItemEntryMode;
  manual_amount?: number;
  notes?: string;
}

export interface InvoiceWithLineItems extends Invoice {
  line_items: InvoiceLineItem[];
  client?: Client;
  project?: Project;
  estimate?: Estimate;
  payments?: Payment[];
}

export interface InvoiceAging extends Invoice {
  client_display_name?: string;
  project_name?: string;
  days_overdue: number;
  aging_bucket: "paid" | "current" | "1-30" | "31-60" | "61-90" | "90+";
}

// ============================================
// PAYMENT TYPES
// ============================================

export type PaymentMethod = "cash" | "check" | "bank_transfer" | "credit_card" | "other";

export interface Payment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  notes?: string;
  received_by: string;
  created_at: string;
}

export interface PaymentFormData {
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  notes?: string;
}

// ============================================
// DOCUMENT TEMPLATE TYPES
// ============================================

export type DocumentTemplateType = "estimate" | "invoice";
export type TemplateGroupBy = "category" | "phase" | "none" | "custom";
export type TemplateLineItemFormat = "detailed" | "summary" | "minimal";
export type TemplateTotalFormat = "standard" | "minimal" | "detailed";
export type LineItemDisplayFormat = "standard" | "lump_sum" | "hidden_rate";

export interface DocumentTemplate {
  id: string;
  company_id: string;
  name: string;
  type: DocumentTemplateType;
  is_default: boolean;

  // Display settings
  show_quantities: boolean;
  show_rates: boolean;
  show_hours: boolean;
  show_unit_costs: boolean;
  show_subtotals: boolean;
  show_markup_percentage: boolean;
  show_profit_margin: boolean;
  show_line_item_descriptions: boolean;

  // Grouping options
  group_by: TemplateGroupBy;
  show_group_subtotals: boolean;

  // Formatting
  line_item_format: TemplateLineItemFormat;
  total_format: TemplateTotalFormat;

  // Custom settings (for future extensibility)
  custom_settings?: Record<string, any>;

  created_at: string;
  updated_at: string;
}

export interface DocumentTemplateFormData {
  name: string;
  type: DocumentTemplateType;
  is_default?: boolean;
  show_quantities?: boolean;
  show_rates?: boolean;
  show_hours?: boolean;
  show_unit_costs?: boolean;
  show_subtotals?: boolean;
  show_markup_percentage?: boolean;
  show_profit_margin?: boolean;
  show_line_item_descriptions?: boolean;
  group_by?: TemplateGroupBy;
  show_group_subtotals?: boolean;
  line_item_format?: TemplateLineItemFormat;
  total_format?: TemplateTotalFormat;
  custom_settings?: Record<string, any>;
}

export interface LineItemGroup {
  id: string;
  estimate_id?: string;
  invoice_id?: string;
  name: string;
  description?: string;
  display_order: number;
  show_subtotal: boolean;
  created_at: string;
}

export interface LineItemGroupFormData {
  name: string;
  description?: string;
  display_order?: number;
  show_subtotal?: boolean;
}

// Add group and display settings to existing line item types
export interface EstimateLineItemWithGroup extends EstimateLineItem {
  group_id?: string;
  display_format: LineItemDisplayFormat;
  show_in_document: boolean;
  custom_label?: string;
  display_order: number;
  group?: LineItemGroup;
}

export interface InvoiceLineItemWithGroup extends InvoiceLineItem {
  group_id?: string;
  display_format: LineItemDisplayFormat;
  show_in_document: boolean;
  custom_label?: string;
  display_order: number;
  group?: LineItemGroup;
}

// Template presets for quick selection
export interface TemplatePreset {
  name: string;
  type: DocumentTemplateType;
  description: string;
  settings: Omit<DocumentTemplateFormData, 'name' | 'type'>;
  useCase: string;
}

// ============================================
// ESTIMATE VS ACTUAL COMPARISON
// ============================================

export interface EstimateVsActual {
  estimate_id: string;
  estimate_number: string;
  estimate_title: string;
  estimated_total: number;
  project_id: string;
  project_name: string;
  project_status: ProjectStatus;
  actual_cost: number;
  variance: number;
  variance_percent: number;
}

// ============================================
// RECEIPT SCANNING TYPES
// ============================================

export interface ParsedReceipt {
  vendorName?: string;
  date?: string;
  lineItems: ParsedReceiptLineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  confidence: number;
}

export interface ParsedReceiptLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

// Enhanced receipt types for AI-powered parsing
export interface EnhancedParsedVendor {
  name: string;
  address?: string;
  phone?: string;
  tin?: string;
}

export interface EnhancedParsedCustomer {
  name?: string;
  location?: string;
  account_number?: string;
}

export interface EnhancedParsedInvoice {
  number?: string;
  date: string;
  time?: string;
  cashier?: string;
}

export interface EnhancedParsedLineItem {
  product_code?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface EnhancedParsedTotals {
  subtotal: number;
  discount?: number;
  discount_label?: string;
  subtotal_after_discount?: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
}

export interface EnhancedParsedReceipt {
  vendor: EnhancedParsedVendor;
  customer?: EnhancedParsedCustomer;
  invoice: EnhancedParsedInvoice;
  line_items: EnhancedParsedLineItem[];
  totals: EnhancedParsedTotals;
  account_balance?: {
    previous_outstanding?: number;
    payment_amount?: number;
    new_outstanding?: number;
  };
  raw_text: string;
  confidence: number;
  parsing_method: "ai" | "regex" | "fallback";
}

// Extend PurchaseOrder to include receipt fields
export interface PurchaseOrderWithReceipt extends PurchaseOrder {
  receipt_image_path?: string;
  ocr_raw_text?: string;
  vendor_invoice_number?: string;
}

// ============================================
// NOTIFICATION TYPES
// ============================================

export type NotificationType =
  | "low_stock"
  | "milestone_reminder"
  | "payroll_reminder"
  | "budget_alert"
  | "invoice_overdue"
  | "estimate_expiring"
  | "team_invitation"
  | "payment_received";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface Notification {
  id: string;
  user_id: string;
  company_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  link_type?: string;
  link_id?: string;
  link_url?: string;
  read: boolean;
  read_at?: string;
  priority: NotificationPriority;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationPreferences {
  id: string;
  user_id: string;
  low_stock_alerts: boolean;
  milestone_reminders: boolean;
  payroll_reminders: boolean;
  budget_alerts: boolean;
  invoice_overdue_alerts: boolean;
  estimate_expiring_alerts: boolean;
  team_notifications: boolean;
  payment_notifications: boolean;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_digest: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesFormData {
  low_stock_alerts: boolean;
  milestone_reminders: boolean;
  payroll_reminders: boolean;
  budget_alerts: boolean;
  invoice_overdue_alerts: boolean;
  estimate_expiring_alerts: boolean;
  team_notifications: boolean;
  payment_notifications: boolean;
}

// ============================================
// AI Features Types
// ============================================

export type AITone = "professional" | "concise" | "detailed";

export type AIContentType =
  | "estimate_description"
  | "invoice_description"
  | "material_description"
  | "line_item"
  | "project_description";

export interface SearchQuery {
  id: string;
  user_id: string;
  query_text: string;
  parsed_intent?: {
    entity_type: string;
    filters: Record<string, unknown>;
    action: string;
  };
  generated_sql?: string;
  results_count: number;
  successful: boolean;
  execution_time_ms?: number;
  created_at: string;
}

export interface AIGeneration {
  id: string;
  user_id: string;
  content_type: AIContentType;
  input_context: Record<string, unknown>;
  generated_text: string;
  accepted: boolean;
  edited: boolean;
  final_text?: string;
  tokens_used?: number;
  created_at: string;
}

export interface UserAIPreferences {
  id: string;
  user_id: string;
  tone: AITone;
  search_history_enabled: boolean;
  auto_draft_enabled: boolean;
  daily_search_count: number;
  last_search_reset: string;
  created_at: string;
  updated_at: string;
}

// Smart Search Types
export interface SearchResult {
  id: string;
  type: "project" | "invoice" | "estimate" | "worker" | "material" | "vendor" | "purchase_order" | "client" | "payroll";
  title: string;
  subtitle?: string;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface SmartSearchResponse {
  success: boolean;
  query: string;
  summary: string;
  results: SearchResult[];
  resultCount: number;
  executionTimeMs: number;
  error?: string;
}

// AI Generation Request/Response
export interface GenerateDescriptionRequest {
  content_type: AIContentType;
  context: Record<string, unknown>;
  tone?: AITone;
}

export interface GenerateDescriptionResponse {
  success: boolean;
  generated_text: string;
  tokens_used?: number;
  error?: string;
}

// ============================================
// CALENDAR TYPES
// ============================================

export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export type CalendarEventType =
  | "project"
  | "milestone"
  | "worker"
  | "material_delivery"
  | "invoice_due"
  | "timesheet"
  | "equipment";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  subtitle?: string;
  date: string;
  endDate?: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  color?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface CalendarFilters {
  showProjects?: boolean;
  showMilestones?: boolean;
  showWorkers?: boolean;
  showDeliveries?: boolean;
  showInvoices?: boolean;
  showTimesheets?: boolean;
  showEquipment?: boolean;
}

export interface CalendarProps {
  mode?: CalendarViewMode;
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  events?: CalendarEvent[];
  filters?: CalendarFilters;
  enableRangeSelect?: boolean;
  highlightToday?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

export interface CalendarDayData {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
}

// ─── Dashboard ("Today") ──────────────────────────────────────────────────────
// Payload shape of the dashboard_summary(p_company_id) Postgres function.
// See supabase/migrations/20260904_dashboard_summary.sql.

/** Severity drives both sort order and which status token the row renders in. */
export type AttentionSeverity = "destructive" | "warning" | "info";

/** Each key maps to a sentence builder in the dashboard page. */
export type AttentionKey =
  | "stale_pay_periods"
  | "invoices_unpaid_30"
  | "receipts_no_image"
  | "estimates_unpriced"
  | "jobs_no_budget"
  | "jobs_no_estimate"
  | "receipts_not_itemised"
  | "crew_no_hours"
  | "invoice_numbering"
  | "time_no_pay_period";

export interface AttentionRow {
  key: AttentionKey;
  severity: AttentionSeverity;
  count: number;
  href: string;
  /** ISO date (yyyy-mm-dd) — oldest offending record, where the check has one. */
  date_ref?: string | null;
  /** Money implicated by the row, where the check has one. */
  amount?: number | null;
}

export interface DashboardMoney {
  /** null when the company has no invoices at all — not a measured zero. */
  owed: {
    total: number;
    invoice_count: number;
    oldest_days: number | null;
  } | null;
  /** null when no pay period is currently processing. */
  open_period: {
    id: string;
    start_date: string;
    end_date: string;
    labour_cost: number;
    /** Negative once the period is overdue to close. */
    days_to_close: number;
    other_open: number;
  } | null;
  month: {
    /**
     * null when no payment has ever been recorded against this company's
     * invoices. Render an em-dash, never $0.00 — "we have no data" and "we
     * received nothing" are different facts.
     */
    in: number | null;
    in_recorded: boolean;
    out: number;
    out_payroll: number;
    out_receipts: number;
    out_po: number;
  };
}

export interface DashboardJob {
  id: string;
  name: string;
  client: string | null;
  contract: number;
  budget: number;
  status: string;
  labour: number;
  materials: number;
  has_budget: boolean;
  /** null whenever budget is 0 or null — never render this as 0%. */
  spent_pct: number | null;
}

export interface DashboardWeek {
  week_start: string;
  days: { date: string; hours: number }[];
  hours_this_week: number;
  hours_last_week: number;
  crew_today: number;
  last_workday: string | null;
  /** Server's America/Nassau date, so the UI agrees with the aggregates. */
  today: string;
}

export interface DashboardSummary {
  money: DashboardMoney;
  attention: AttentionRow[];
  jobs: DashboardJob[];
  week: DashboardWeek;
  generated_at: string;
}
