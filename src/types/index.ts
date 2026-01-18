// User and Authentication Types
export type UserRole = "admin" | "project_manager";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// Project Types
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export interface Project {
  id: string;
  name: string;
  description?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  location: string;
  status: ProjectStatus;
  start_date: string;
  estimated_end_date?: string;
  actual_end_date?: string;
  budget: number;
  contract_value: number;
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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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
  notes?: string;
  terms_and_conditions?: string;
  sent_at?: string;
  approved_at?: string;
  rejected_at?: string;
  converted_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  category: EstimateLineCategory;
  worker_id?: string;
  material_id?: string;
  equipment_id?: string;
  description: string;
  quantity: number;
  unit?: string;
  unit_rate: number;
  amount: number;
  notes?: string;
  order_index: number;
  created_at: string;
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
  quantity: number;
  unit?: string;
  unit_rate: number;
  notes?: string;
}

export interface EstimateWithLineItems extends Estimate {
  line_items: EstimateLineItem[];
  client?: Client;
  project?: Project;
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
  quantity: number;
  unit?: string;
  unit_rate: number;
  amount: number;
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
  quantity: number;
  unit?: string;
  unit_rate: number;
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

// Extend PurchaseOrder to include receipt fields
export interface PurchaseOrderWithReceipt extends PurchaseOrder {
  receipt_image_path?: string;
  ocr_raw_text?: string;
}
