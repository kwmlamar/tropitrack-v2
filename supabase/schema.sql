-- TropiTrack v2 Database Schema
-- Complete Construction Project Management System
-- For Supabase PostgreSQL

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS AND AUTHENTICATION
-- ============================================

-- User profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'project_manager' CHECK (role IN ('admin', 'project_manager')),
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- PROJECTS
-- ============================================

CREATE TABLE public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    start_date DATE NOT NULL,
    estimated_end_date DATE,
    actual_end_date DATE,
    budget DECIMAL(12, 2) NOT NULL DEFAULT 0,
    contract_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
    project_manager_id UUID REFERENCES public.profiles(id),
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projects" ON public.projects
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and PMs can create projects" ON public.projects
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins and assigned PMs can update projects" ON public.projects
    FOR UPDATE USING (
        auth.uid() = created_by
        OR auth.uid() = project_manager_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can delete projects" ON public.projects
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Project milestones
CREATE TABLE public.project_milestones (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    completed_date DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view milestones" ON public.project_milestones
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage milestones" ON public.project_milestones
    FOR ALL USING (auth.role() = 'authenticated');

-- Project documents
CREATE TABLE public.project_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('plan', 'permit', 'invoice', 'contract', 'photo', 'other')),
    uploaded_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents" ON public.project_documents
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage documents" ON public.project_documents
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- WORKERS
-- ============================================

CREATE TABLE public.workers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    national_insurance_number TEXT,
    worker_type TEXT NOT NULL DEFAULT 'hourly' CHECK (worker_type IN ('hourly', 'salary', 'contract')),
    hourly_rate DECIMAL(8, 2),
    salary_amount DECIMAL(10, 2),
    overtime_rate_multiplier DECIMAL(3, 2) DEFAULT 1.5,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
    hire_date DATE NOT NULL,
    termination_date DATE,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    notes TEXT,
    -- NIB (National Insurance Board) settings
    nib_enabled BOOLEAN DEFAULT true,
    nib_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workers" ON public.workers
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create workers" ON public.workers
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update workers" ON public.workers
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete workers" ON public.workers
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Worker skills
CREATE TABLE public.worker_skills (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    skill_name TEXT NOT NULL,
    proficiency_level TEXT DEFAULT 'intermediate' CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(worker_id, skill_name)
);

ALTER TABLE public.worker_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view skills" ON public.worker_skills
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage skills" ON public.worker_skills
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- TIME TRACKING
-- ============================================

CREATE TABLE public.time_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_duration_minutes INTEGER DEFAULT 0,
    regular_hours DECIMAL(5, 2) NOT NULL,
    overtime_hours DECIMAL(5, 2) DEFAULT 0,
    notes TEXT,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view time entries" ON public.time_entries
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create time entries" ON public.time_entries
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update time entries" ON public.time_entries
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete time entries" ON public.time_entries
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Daily timesheets (for grouping time entries)
CREATE TABLE public.daily_timesheets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    submitted_by UUID REFERENCES public.profiles(id) NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, date)
);

ALTER TABLE public.daily_timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view timesheets" ON public.daily_timesheets
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage timesheets" ON public.daily_timesheets
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- PAYROLL
-- ============================================

CREATE TABLE public.pay_periods (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processing', 'paid', 'cancelled')),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(start_date, end_date)
);

ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pay periods" ON public.pay_periods
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage pay periods" ON public.pay_periods
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Authenticated users can create pay periods" ON public.pay_periods
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update pay periods" ON public.pay_periods
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE TABLE public.payroll_entries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pay_period_id UUID REFERENCES public.pay_periods(id) ON DELETE CASCADE NOT NULL,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
    regular_hours DECIMAL(6, 2) NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(6, 2) NOT NULL DEFAULT 0,
    regular_rate DECIMAL(8, 2) NOT NULL,
    overtime_rate DECIMAL(8, 2) NOT NULL,
    gross_pay DECIMAL(10, 2) NOT NULL,
    deductions DECIMAL(10, 2) DEFAULT 0,
    net_pay DECIMAL(10, 2) NOT NULL,
    deduction_details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pay_period_id, worker_id)
);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payroll entries" ON public.payroll_entries
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage payroll entries" ON public.payroll_entries
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- MATERIALS AND INVENTORY
-- ============================================

CREATE TABLE public.materials (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('lumber', 'concrete', 'steel', 'electrical', 'plumbing', 'roofing', 'finishing', 'hardware', 'tools', 'safety', 'other')),
    unit TEXT NOT NULL,
    unit_cost DECIMAL(10, 2) NOT NULL,
    quantity_in_stock DECIMAL(12, 2) DEFAULT 0,
    minimum_stock_level DECIMAL(12, 2) DEFAULT 0,
    supplier_id UUID,
    sku TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view materials" ON public.materials
    FOR SELECT USING (auth.role() = 'authenticated');

-- Drop the old policies
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
DROP POLICY IF EXISTS "PMs can update material stock" ON public.materials;

-- Create new policies
CREATE POLICY "Users can create materials" ON public.materials
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update materials" ON public.materials
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete materials" ON public.materials
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE TABLE public.material_allocations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    allocated_date DATE NOT NULL DEFAULT CURRENT_DATE,
    allocated_by UUID REFERENCES public.profiles(id) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.material_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view allocations" ON public.material_allocations
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create allocations" ON public.material_allocations
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage allocations" ON public.material_allocations
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- VENDORS
-- ============================================

CREATE TABLE public.vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    payment_terms TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendors" ON public.vendors
    FOR SELECT USING (auth.role() = 'authenticated');

-- Drop the old policy
DROP POLICY IF EXISTS "Admins can manage vendors" ON public.vendors;

-- Create new policies
CREATE POLICY "Users can create vendors" ON public.vendors
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update vendors" ON public.vendors
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete vendors" ON public.vendors
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Add foreign key to materials for supplier
ALTER TABLE public.materials ADD CONSTRAINT materials_supplier_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

-- ============================================
-- PURCHASE ORDERS
-- ============================================

CREATE TABLE public.purchase_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    vendor_id UUID REFERENCES public.vendors(id) NOT NULL,
    project_id UUID REFERENCES public.projects(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'ordered', 'partial_received', 'received', 'cancelled')),
    order_date DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view POs" ON public.purchase_orders
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create POs" ON public.purchase_orders
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update POs" ON public.purchase_orders
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete POs" ON public.purchase_orders
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE TABLE public.purchase_order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
    material_id UUID REFERENCES public.materials(id),
    description TEXT NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(12, 2) NOT NULL,
    quantity_received DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PO items" ON public.purchase_order_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage PO items" ON public.purchase_order_items
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- EQUIPMENT
-- ============================================

CREATE TABLE public.equipment (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    serial_number TEXT,
    purchase_date DATE,
    purchase_cost DECIMAL(12, 2),
    hourly_rate DECIMAL(8, 2) NOT NULL DEFAULT 0,
    daily_rate DECIMAL(8, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
    current_project_id UUID REFERENCES public.projects(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment" ON public.equipment
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage equipment" ON public.equipment
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE TABLE public.equipment_usage (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    equipment_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    hours_used DECIMAL(8, 2),
    cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.equipment_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment usage" ON public.equipment_usage
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage equipment usage" ON public.equipment_usage
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- OVERHEAD COSTS
-- ============================================

CREATE TABLE public.overhead_costs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('administrative', 'insurance', 'utilities', 'rent', 'vehicle', 'permits', 'professional_services', 'other')),
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_period TEXT CHECK (recurrence_period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.overhead_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view overhead costs" ON public.overhead_costs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage overhead costs" ON public.overhead_costs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Project cost summary view
CREATE OR REPLACE VIEW public.project_cost_summary AS
SELECT
    p.id as project_id,
    p.name as project_name,
    p.budget,
    p.contract_value,
    COALESCE(labor.total_labor_cost, 0) as labor_cost,
    COALESCE(materials.total_material_cost, 0) as material_cost,
    COALESCE(equipment.total_equipment_cost, 0) as equipment_cost,
    COALESCE(overhead.total_overhead_cost, 0) as overhead_cost,
    (COALESCE(labor.total_labor_cost, 0) + COALESCE(materials.total_material_cost, 0) +
     COALESCE(equipment.total_equipment_cost, 0) + COALESCE(overhead.total_overhead_cost, 0)) as total_cost,
    p.budget - (COALESCE(labor.total_labor_cost, 0) + COALESCE(materials.total_material_cost, 0) +
                COALESCE(equipment.total_equipment_cost, 0) + COALESCE(overhead.total_overhead_cost, 0)) as budget_variance,
    CASE
        WHEN p.contract_value > 0 THEN
            ROUND(((p.contract_value - (COALESCE(labor.total_labor_cost, 0) + COALESCE(materials.total_material_cost, 0) +
                   COALESCE(equipment.total_equipment_cost, 0) + COALESCE(overhead.total_overhead_cost, 0))) / p.contract_value * 100)::numeric, 2)
        ELSE 0
    END as profit_margin_percent
FROM public.projects p
LEFT JOIN (
    SELECT
        te.project_id,
        SUM(te.regular_hours * w.hourly_rate + te.overtime_hours * w.hourly_rate * w.overtime_rate_multiplier) as total_labor_cost
    FROM public.time_entries te
    JOIN public.workers w ON te.worker_id = w.id
    GROUP BY te.project_id
) labor ON p.id = labor.project_id
LEFT JOIN (
    SELECT
        ma.project_id,
        SUM(ma.quantity * m.unit_cost) as total_material_cost
    FROM public.material_allocations ma
    JOIN public.materials m ON ma.material_id = m.id
    GROUP BY ma.project_id
) materials ON p.id = materials.project_id
LEFT JOIN (
    SELECT
        eu.project_id,
        SUM(eu.cost) as total_equipment_cost
    FROM public.equipment_usage eu
    GROUP BY eu.project_id
) equipment ON p.id = equipment.project_id
LEFT JOIN (
    SELECT
        oc.project_id,
        SUM(oc.amount) as total_overhead_cost
    FROM public.overhead_costs oc
    WHERE oc.project_id IS NOT NULL
    GROUP BY oc.project_id
) overhead ON p.id = overhead.project_id;

-- Worker hours summary view
CREATE OR REPLACE VIEW public.worker_hours_summary AS
SELECT
    w.id as worker_id,
    w.first_name,
    w.last_name,
    w.hourly_rate,
    p.id as project_id,
    p.name as project_name,
    te.date,
    SUM(te.regular_hours) as total_regular_hours,
    SUM(te.overtime_hours) as total_overtime_hours,
    SUM(te.regular_hours * w.hourly_rate) as regular_earnings,
    SUM(te.overtime_hours * w.hourly_rate * w.overtime_rate_multiplier) as overtime_earnings
FROM public.workers w
JOIN public.time_entries te ON w.id = te.worker_id
JOIN public.projects p ON te.project_id = p.id
GROUP BY w.id, w.first_name, w.last_name, w.hourly_rate, p.id, p.name, te.date;

-- Low stock materials view
CREATE OR REPLACE VIEW public.low_stock_materials AS
SELECT
    m.*,
    v.name as supplier_name
FROM public.materials m
LEFT JOIN public.vendors v ON m.supplier_id = v.id
WHERE m.quantity_in_stock <= m.minimum_stock_level;

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.time_entries
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.materials
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'project_manager')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update material stock after allocation
CREATE OR REPLACE FUNCTION public.update_material_stock_after_allocation()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.materials
    SET quantity_in_stock = quantity_in_stock - NEW.quantity
    WHERE id = NEW.material_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_material_allocation
    AFTER INSERT ON public.material_allocations
    FOR EACH ROW EXECUTE FUNCTION public.update_material_stock_after_allocation();

-- Function to update PO totals
CREATE OR REPLACE FUNCTION public.update_po_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.purchase_orders
    SET subtotal = (
        SELECT COALESCE(SUM(total_price), 0)
        FROM public.purchase_order_items
        WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
    ),
    total_amount = subtotal + tax_amount + shipping_cost
    WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_po_item_change
    AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION public.update_po_totals();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_project_manager ON public.projects(project_manager_id);
CREATE INDEX idx_projects_created_by ON public.projects(created_by);

CREATE INDEX idx_workers_status ON public.workers(status);

CREATE INDEX idx_time_entries_worker ON public.time_entries(worker_id);
CREATE INDEX idx_time_entries_project ON public.time_entries(project_id);
CREATE INDEX idx_time_entries_date ON public.time_entries(date);

CREATE INDEX idx_pay_periods_status ON public.pay_periods(status);
CREATE INDEX idx_payroll_entries_period ON public.payroll_entries(pay_period_id);
CREATE INDEX idx_payroll_entries_worker ON public.payroll_entries(worker_id);

CREATE INDEX idx_materials_category ON public.materials(category);
CREATE INDEX idx_materials_supplier ON public.materials(supplier_id);
CREATE INDEX idx_material_allocations_project ON public.material_allocations(project_id);
CREATE INDEX idx_material_allocations_material ON public.material_allocations(material_id);

CREATE INDEX idx_purchase_orders_vendor ON public.purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_project ON public.purchase_orders(project_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);

CREATE INDEX idx_equipment_status ON public.equipment(status);
CREATE INDEX idx_equipment_usage_project ON public.equipment_usage(project_id);
CREATE INDEX idx_equipment_usage_equipment ON public.equipment_usage(equipment_id);

CREATE INDEX idx_overhead_costs_category ON public.overhead_costs(category);
CREATE INDEX idx_overhead_costs_project ON public.overhead_costs(project_id);
CREATE INDEX idx_overhead_costs_date ON public.overhead_costs(date);

-- ============================================
-- STORAGE BUCKETS (run separately in Supabase dashboard)
-- ============================================
-- Note: Storage buckets should be created via Supabase dashboard or CLI
-- Bucket: project-documents (for storing project files)

-- ============================================
-- CLIENTS
-- ============================================

CREATE TABLE public.clients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    tax_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clients" ON public.clients
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage clients" ON public.clients
    FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_clients_name ON public.clients(name);

-- ============================================
-- ESTIMATES
-- ============================================

CREATE TABLE public.estimates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estimate_number TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    -- Client info snapshot (for non-registered clients or record keeping)
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_address TEXT,
    -- Estimate details
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'converted', 'expired')),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    -- Financials
    subtotal DECIMAL(12, 2) DEFAULT 0,
    overhead_markup_percent DECIMAL(5, 2) DEFAULT 0,
    overhead_amount DECIMAL(12, 2) DEFAULT 0,
    profit_margin_percent DECIMAL(5, 2) DEFAULT 0,
    profit_amount DECIMAL(12, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    -- Metadata
    notes TEXT,
    terms_and_conditions TEXT,
    sent_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estimates" ON public.estimates
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create estimates" ON public.estimates
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update estimates" ON public.estimates
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete estimates" ON public.estimates
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.estimates
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_estimates_status ON public.estimates(status);
CREATE INDEX idx_estimates_client ON public.estimates(client_id);
CREATE INDEX idx_estimates_project ON public.estimates(project_id);
CREATE INDEX idx_estimates_created_by ON public.estimates(created_by);

-- Estimate Line Items
CREATE TABLE public.estimate_line_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estimate_id UUID REFERENCES public.estimates(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('labor', 'material', 'equipment', 'subcontractor', 'other')),
    -- References to existing data (optional)
    worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
    material_id UUID REFERENCES public.materials(id) ON DELETE SET NULL,
    equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
    -- Line item details
    description TEXT NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL DEFAULT 1,
    unit TEXT,
    unit_rate DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estimate items" ON public.estimate_line_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage estimate items" ON public.estimate_line_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_estimate_items_estimate ON public.estimate_line_items(estimate_id);

-- Function to update estimate totals when line items change
CREATE OR REPLACE FUNCTION public.update_estimate_totals()
RETURNS TRIGGER AS $$
DECLARE
    est_id UUID;
    new_subtotal DECIMAL(12, 2);
    overhead_pct DECIMAL(5, 2);
    profit_pct DECIMAL(5, 2);
    tax_pct DECIMAL(5, 2);
    new_overhead DECIMAL(12, 2);
    new_profit DECIMAL(12, 2);
    new_tax DECIMAL(12, 2);
BEGIN
    est_id := COALESCE(NEW.estimate_id, OLD.estimate_id);

    -- Calculate new subtotal
    SELECT COALESCE(SUM(amount), 0) INTO new_subtotal
    FROM public.estimate_line_items
    WHERE estimate_id = est_id;

    -- Get current percentages
    SELECT overhead_markup_percent, profit_margin_percent, tax_rate
    INTO overhead_pct, profit_pct, tax_pct
    FROM public.estimates WHERE id = est_id;

    -- Calculate derived amounts
    new_overhead := new_subtotal * (COALESCE(overhead_pct, 0) / 100);
    new_profit := (new_subtotal + new_overhead) * (COALESCE(profit_pct, 0) / 100);
    new_tax := (new_subtotal + new_overhead + new_profit) * (COALESCE(tax_pct, 0) / 100);

    -- Update estimate
    UPDATE public.estimates
    SET subtotal = new_subtotal,
        overhead_amount = new_overhead,
        profit_amount = new_profit,
        tax_amount = new_tax,
        total_amount = new_subtotal + new_overhead + new_profit + new_tax
    WHERE id = est_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_estimate_item_change
    AFTER INSERT OR UPDATE OR DELETE ON public.estimate_line_items
    FOR EACH ROW EXECUTE FUNCTION public.update_estimate_totals();

-- ============================================
-- INVOICES
-- ============================================

CREATE TABLE public.invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
    -- Client info snapshot
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    client_address TEXT,
    -- Invoice details
    invoice_type TEXT NOT NULL DEFAULT 'time_and_materials' CHECK (invoice_type IN ('progress', 'time_and_materials', 'fixed_price', 'final')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled', 'void')),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    -- Financials
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    amount_paid DECIMAL(12, 2) DEFAULT 0,
    balance_due DECIMAL(12, 2) DEFAULT 0,
    -- Metadata
    notes TEXT,
    terms TEXT,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoices" ON public.invoices
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create invoices" ON public.invoices
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update invoices" ON public.invoices
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can delete invoices" ON public.invoices
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_client ON public.invoices(client_id);
CREATE INDEX idx_invoices_project ON public.invoices(project_id);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX idx_invoices_created_by ON public.invoices(created_by);

-- Invoice Line Items
CREATE TABLE public.invoice_line_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('labor', 'material', 'equipment', 'overhead', 'other')),
    -- References to source data (for tracking)
    time_entry_id UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
    material_allocation_id UUID REFERENCES public.material_allocations(id) ON DELETE SET NULL,
    equipment_usage_id UUID REFERENCES public.equipment_usage(id) ON DELETE SET NULL,
    -- Line item details
    description TEXT NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL DEFAULT 1,
    unit TEXT,
    unit_rate DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice items" ON public.invoice_line_items
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage invoice items" ON public.invoice_line_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_invoice_items_invoice ON public.invoice_line_items(invoice_id);

-- Function to update invoice totals when line items change
CREATE OR REPLACE FUNCTION public.update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    inv_id UUID;
    new_subtotal DECIMAL(12, 2);
    tax_pct DECIMAL(5, 2);
    new_tax DECIMAL(12, 2);
    current_paid DECIMAL(12, 2);
BEGIN
    inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

    -- Calculate new subtotal
    SELECT COALESCE(SUM(amount), 0) INTO new_subtotal
    FROM public.invoice_line_items
    WHERE invoice_id = inv_id;

    -- Get current tax rate and amount paid
    SELECT tax_rate, amount_paid INTO tax_pct, current_paid
    FROM public.invoices WHERE id = inv_id;

    -- Calculate tax
    new_tax := new_subtotal * (COALESCE(tax_pct, 0) / 100);

    -- Update invoice
    UPDATE public.invoices
    SET subtotal = new_subtotal,
        tax_amount = new_tax,
        total_amount = new_subtotal + new_tax,
        balance_due = (new_subtotal + new_tax) - COALESCE(current_paid, 0)
    WHERE id = inv_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_invoice_item_change
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
    FOR EACH ROW EXECUTE FUNCTION public.update_invoice_totals();

-- ============================================
-- PAYMENTS
-- ============================================

CREATE TABLE public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'check', 'bank_transfer', 'credit_card', 'other')),
    reference_number TEXT,
    notes TEXT,
    received_by UUID REFERENCES public.profiles(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payments" ON public.payments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create payments" ON public.payments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage payments" ON public.payments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_date ON public.payments(payment_date);

-- Function to update invoice when payment is recorded
CREATE OR REPLACE FUNCTION public.update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    inv_total DECIMAL(12, 2);
    total_paid DECIMAL(12, 2);
    new_balance DECIMAL(12, 2);
    new_status TEXT;
BEGIN
    -- Get invoice total
    SELECT total_amount INTO inv_total
    FROM public.invoices WHERE id = NEW.invoice_id;

    -- Calculate total paid
    SELECT COALESCE(SUM(amount), 0) INTO total_paid
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id;

    -- Calculate new balance
    new_balance := inv_total - total_paid;

    -- Determine new status
    IF new_balance <= 0 THEN
        new_status := 'paid';
    ELSIF total_paid > 0 THEN
        new_status := 'partial';
    ELSE
        new_status := NULL; -- Keep current status
    END IF;

    -- Update invoice
    UPDATE public.invoices
    SET amount_paid = total_paid,
        balance_due = GREATEST(new_balance, 0),
        status = COALESCE(new_status, status),
        paid_at = CASE WHEN new_balance <= 0 THEN NOW() ELSE paid_at END
    WHERE id = NEW.invoice_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_payment_insert
    AFTER INSERT ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.update_invoice_on_payment();

-- ============================================
-- PURCHASE ORDER ENHANCEMENTS (Receipt Scanning)
-- ============================================

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS receipt_image_path TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS ocr_raw_text TEXT;

-- ============================================
-- ADDITIONAL VIEWS FOR REPORTING
-- ============================================

-- Invoice aging view
CREATE OR REPLACE VIEW public.invoice_aging AS
SELECT
    i.*,
    c.name as client_display_name,
    p.name as project_name,
    CURRENT_DATE - i.due_date as days_overdue,
    CASE
        WHEN i.status = 'paid' THEN 'paid'
        WHEN CURRENT_DATE <= i.due_date THEN 'current'
        WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
        WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
        WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
        ELSE '90+'
    END as aging_bucket
FROM public.invoices i
LEFT JOIN public.clients c ON i.client_id = c.id
LEFT JOIN public.projects p ON i.project_id = p.id
WHERE i.status NOT IN ('cancelled', 'void');

-- Client balances view
CREATE OR REPLACE VIEW public.client_balances AS
SELECT
    c.id as client_id,
    c.name,
    c.email,
    c.phone,
    COALESCE(SUM(i.total_amount), 0) as total_invoiced,
    COALESCE(SUM(i.amount_paid), 0) as total_paid,
    COALESCE(SUM(i.balance_due), 0) as total_outstanding,
    COUNT(CASE WHEN i.status = 'overdue' THEN 1 END) as overdue_invoices,
    COUNT(CASE WHEN i.status NOT IN ('cancelled', 'void', 'paid') THEN 1 END) as open_invoices
FROM public.clients c
LEFT JOIN public.invoices i ON c.id = i.client_id AND i.status NOT IN ('cancelled', 'void')
GROUP BY c.id, c.name, c.email, c.phone;

-- Estimate vs Actual comparison view
CREATE OR REPLACE VIEW public.estimate_vs_actual AS
SELECT
    e.id as estimate_id,
    e.estimate_number,
    e.title as estimate_title,
    e.total_amount as estimated_total,
    p.id as project_id,
    p.name as project_name,
    p.status as project_status,
    pcs.total_cost as actual_cost,
    e.total_amount - COALESCE(pcs.total_cost, 0) as variance,
    CASE
        WHEN e.total_amount > 0 THEN
            ROUND(((e.total_amount - COALESCE(pcs.total_cost, 0)) / e.total_amount * 100)::numeric, 2)
        ELSE 0
    END as variance_percent
FROM public.estimates e
JOIN public.projects p ON e.project_id = p.id
LEFT JOIN public.project_cost_summary pcs ON p.id = pcs.project_id
WHERE e.status = 'converted';

-- ============================================
-- SEED DATA (Optional - for development)
-- ============================================

-- Insert some sample data for testing (uncomment if needed)
/*
-- Sample materials
INSERT INTO public.materials (name, category, unit, unit_cost, quantity_in_stock, minimum_stock_level) VALUES
('2x4 Lumber (8ft)', 'lumber', 'piece', 8.50, 500, 100),
('Portland Cement (94lb bag)', 'concrete', 'bag', 12.00, 200, 50),
('Rebar #4 (20ft)', 'steel', 'piece', 15.00, 150, 30),
('Electrical Wire 12/2 (250ft)', 'electrical', 'roll', 85.00, 25, 5),
('PVC Pipe 4" (10ft)', 'plumbing', 'piece', 18.00, 100, 20),
('Roofing Shingles (bundle)', 'roofing', 'bundle', 35.00, 75, 15),
('Interior Paint (5 gal)', 'finishing', 'bucket', 125.00, 30, 10),
('Deck Screws (5lb box)', 'hardware', 'box', 28.00, 50, 10);
*/

-- ============================================
-- AI FEATURES TABLES
-- ============================================

-- Search query history for Smart Search
CREATE TABLE public.search_queries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    query_text TEXT NOT NULL,
    parsed_intent JSONB,
    generated_sql TEXT,
    results_count INTEGER DEFAULT 0,
    successful BOOLEAN DEFAULT true,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search history" ON public.search_queries
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create search queries" ON public.search_queries
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own search history" ON public.search_queries
    FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_search_queries_user ON public.search_queries(user_id);
CREATE INDEX idx_search_queries_created ON public.search_queries(created_at DESC);

-- AI generation tracking for auto-draft descriptions
CREATE TABLE public.ai_generations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    input_context JSONB NOT NULL,
    generated_text TEXT NOT NULL,
    accepted BOOLEAN DEFAULT false,
    edited BOOLEAN DEFAULT false,
    final_text TEXT,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI generations" ON public.ai_generations
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create AI generations" ON public.ai_generations
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own AI generations" ON public.ai_generations
    FOR UPDATE USING (user_id = auth.uid());

CREATE INDEX idx_ai_generations_user ON public.ai_generations(user_id);
CREATE INDEX idx_ai_generations_type ON public.ai_generations(content_type);
CREATE INDEX idx_ai_generations_created ON public.ai_generations(created_at DESC);

-- User AI preferences
CREATE TABLE public.user_ai_preferences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    tone VARCHAR(20) DEFAULT 'professional' CHECK (tone IN ('professional', 'concise', 'detailed')),
    search_history_enabled BOOLEAN DEFAULT true,
    auto_draft_enabled BOOLEAN DEFAULT true,
    daily_search_count INTEGER DEFAULT 0,
    last_search_reset DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_ai_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI preferences" ON public.user_ai_preferences
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own AI preferences" ON public.user_ai_preferences
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own AI preferences" ON public.user_ai_preferences
    FOR UPDATE USING (user_id = auth.uid());

-- Function to increment search count and check rate limit
CREATE OR REPLACE FUNCTION public.increment_search_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO public.user_ai_preferences (user_id, daily_search_count, last_search_reset)
    VALUES (p_user_id, 1, CURRENT_DATE)
    ON CONFLICT (user_id) DO UPDATE
    SET daily_search_count =
        CASE
            WHEN user_ai_preferences.last_search_reset < CURRENT_DATE THEN 1
            ELSE user_ai_preferences.daily_search_count + 1
        END,
        last_search_reset = CURRENT_DATE,
        updated_at = NOW()
    RETURNING daily_search_count INTO v_count;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
