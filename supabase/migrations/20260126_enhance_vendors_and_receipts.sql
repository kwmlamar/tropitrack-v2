-- ============================================
-- ENHANCE VENDORS AND RECEIPT SCANNING
-- ============================================
-- This migration adds:
-- 1. Extended vendor fields (TIN, account numbers)
-- 2. Material price history tracking
-- 3. Purchase order items enhancement

-- ============================================
-- ENHANCE VENDORS TABLE
-- ============================================

-- Add new vendor fields
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS tin TEXT, -- Tax Identification Number
ADD COLUMN IF NOT EXISTS account_number TEXT, -- Customer account number with vendor
ADD COLUMN IF NOT EXISTS default_payment_terms TEXT; -- Default payment terms (Net 30, Cash, etc.)

-- Create index for TIN lookups
CREATE INDEX IF NOT EXISTS idx_vendors_tin ON public.vendors(tin) WHERE tin IS NOT NULL;

-- ============================================
-- ENHANCE MATERIALS TABLE
-- ============================================

-- Add pricing and vendor tracking to materials
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS vendor_product_code TEXT, -- Vendor's SKU/product code
ADD COLUMN IF NOT EXISTS last_purchase_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_purchase_date DATE,
ADD COLUMN IF NOT EXISTS average_price DECIMAL(10, 2);

-- Create index for vendor product code lookups
CREATE INDEX IF NOT EXISTS idx_materials_vendor_product_code
ON public.materials(supplier_id, vendor_product_code)
WHERE vendor_product_code IS NOT NULL;

-- ============================================
-- MATERIAL PRICE HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.material_price_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE NOT NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    product_code TEXT, -- Vendor's product code at time of purchase
    purchase_date DATE NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.material_price_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop if exists to make migration idempotent)
DROP POLICY IF EXISTS "Users can view price history in their company" ON public.material_price_history;
CREATE POLICY "Users can view price history in their company" ON public.material_price_history
    FOR SELECT USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can create price history in their company" ON public.material_price_history;
CREATE POLICY "Users can create price history in their company" ON public.material_price_history
    FOR INSERT WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

-- Index for efficient price history queries
CREATE INDEX IF NOT EXISTS idx_material_price_history_material
ON public.material_price_history(material_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS idx_material_price_history_company
ON public.material_price_history(company_id);

-- ============================================
-- ENHANCE PURCHASE ORDER ITEMS
-- ============================================

-- Add product code tracking to purchase order items
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS product_code TEXT, -- Vendor's product code
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'each'; -- Unit of measure

-- ============================================
-- FUNCTION: Update Material Average Price
-- ============================================

CREATE OR REPLACE FUNCTION update_material_average_price()
RETURNS TRIGGER AS $$
DECLARE
    avg_price DECIMAL(10, 2);
    total_qty DECIMAL(10, 2);
    total_value DECIMAL(10, 2);
BEGIN
    -- Calculate weighted average price from price history
    SELECT
        SUM(quantity),
        SUM(quantity * unit_price)
    INTO total_qty, total_value
    FROM public.material_price_history
    WHERE material_id = NEW.material_id;

    IF total_qty > 0 THEN
        avg_price := total_value / total_qty;

        -- Update the material's average price and last purchase info
        UPDATE public.materials
        SET
            average_price = avg_price,
            last_purchase_price = NEW.unit_price,
            last_purchase_date = NEW.purchase_date
        WHERE id = NEW.material_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update material prices when price history is added
DROP TRIGGER IF EXISTS trigger_update_material_price ON public.material_price_history;
CREATE TRIGGER trigger_update_material_price
    AFTER INSERT ON public.material_price_history
    FOR EACH ROW
    EXECUTE FUNCTION update_material_average_price();

-- ============================================
-- SEED COMMON BAHAMIAN VENDORS
-- ============================================

-- Note: These will only insert if they don't already exist (using ON CONFLICT)
-- Company ID will need to be set when the company uses the vendor

-- Insert known vendors (without company_id - they'll be copied to companies when used)
-- This is just for reference/autocomplete purposes

-- Create a reference vendors table for autocomplete
CREATE TABLE IF NOT EXISTS public.vendor_directory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    phone TEXT,
    tin TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert known Bahamian hardware vendors
INSERT INTO public.vendor_directory (name, address, phone, tin) VALUES
('Lord Byron Enterprises', 'Queen''s Highway, P.O. Box EL-25045, Governor''s Harbour', '(242) 828-3476', '100039450'),
('Paradise Service Plaza', 'Queen''s Highway, Palmetto Point', '242-332-0033', '100040692'),
('Kelly''s Hardware', 'Nassau', NULL, NULL),
('Builder''s Supply', 'Nassau', NULL, NULL),
('Home Fabrics', 'Nassau', NULL, NULL),
('John S George', 'Nassau', NULL, NULL),
('Pinder''s Building Supplies', 'Nassau', NULL, NULL),
('Best Buy Building Supplies', 'Nassau', NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- RLS for vendor directory (read-only for all authenticated users)
ALTER TABLE public.vendor_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view vendor directory" ON public.vendor_directory;
CREATE POLICY "Anyone can view vendor directory" ON public.vendor_directory
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- ADD INVOICE NUMBER TO PURCHASE ORDERS
-- ============================================

ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS vendor_invoice_number TEXT; -- Vendor's invoice number from receipt

-- Index for vendor invoice lookups
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_invoice
ON public.purchase_orders(vendor_id, vendor_invoice_number)
WHERE vendor_invoice_number IS NOT NULL;
