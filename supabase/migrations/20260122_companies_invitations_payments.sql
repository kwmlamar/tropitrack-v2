-- ============================================
-- COMPANIES, INVITATIONS & PAYMENT INSTRUCTIONS
-- Migration for Team Management and Payment Settings
-- Date: January 22, 2026
-- ============================================

-- ============================================
-- COMPANIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.companies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    -- Tax information
    vat_tax_id TEXT,
    business_registration_number TEXT,
    -- Payment instructions (for receiving customer payments)
    payment_bank_name TEXT,
    payment_account_name TEXT,
    payment_account_number TEXT,
    payment_routing_number TEXT,
    payment_swift_code TEXT,
    payment_mobile_money TEXT,
    payment_instructions TEXT,
    payment_notes TEXT,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============================================
-- UPDATE PROFILES TABLE
-- ============================================

-- Add company_id and is_owner fields to profiles BEFORE creating policies that reference them
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT FALSE;

-- Update role check constraint to include 'admin' as a standalone role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'project_manager', 'worker'));

-- Create index for company lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);

-- ============================================
-- COMPANY POLICIES
-- ============================================

-- Company policies - all authenticated users can view/edit their company
CREATE POLICY "Users can view their company" ON public.companies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND profiles.company_id = companies.id
        )
    );

CREATE POLICY "Admins can update their company" ON public.companies
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND profiles.company_id = companies.id
            AND profiles.role IN ('admin', 'project_manager')
        )
    );

CREATE POLICY "Users can create companies" ON public.companies
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
    invited_by UUID REFERENCES auth.users(id) NOT NULL,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(company_id, email)
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Invitation policies
CREATE POLICY "Users can view invitations for their company" ON public.invitations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND profiles.company_id = invitations.company_id
        )
    );

CREATE POLICY "Admins can create invitations" ON public.invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND profiles.company_id = company_id
            AND profiles.role IN ('admin', 'project_manager')
        )
    );

CREATE POLICY "Admins can update invitations" ON public.invitations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND profiles.company_id = invitations.company_id
            AND profiles.role IN ('admin', 'project_manager')
        )
    );

CREATE POLICY "Admins can delete invitations" ON public.invitations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND profiles.company_id = invitations.company_id
            AND profiles.role IN ('admin', 'project_manager')
        )
    );

-- Indexes for invitations
CREATE INDEX IF NOT EXISTS idx_invitations_company ON public.invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to generate secure invitation token
CREATE OR REPLACE FUNCTION public.generate_invitation_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Function to validate invitation token
CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token TEXT)
RETURNS TABLE (
    invitation_id UUID,
    company_id UUID,
    email TEXT,
    role TEXT,
    company_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id,
        i.company_id,
        i.email,
        i.role,
        c.name as company_name
    FROM public.invitations i
    JOIN public.companies c ON i.company_id = c.id
    WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_token TEXT,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_invitation_id UUID;
    v_company_id UUID;
    v_role TEXT;
    v_email TEXT;
BEGIN
    -- Get invitation details
    SELECT id, company_id, role, email
    INTO v_invitation_id, v_company_id, v_role, v_email
    FROM public.invitations
    WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

    -- Check if invitation exists and is valid
    IF v_invitation_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Update user profile with company and role
    UPDATE public.profiles
    SET company_id = v_company_id,
        role = v_role,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Mark invitation as accepted
    UPDATE public.invitations
    SET status = 'accepted',
        accepted_at = NOW()
    WHERE id = v_invitation_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire old invitations (run as scheduled job)
CREATE OR REPLACE FUNCTION public.expire_old_invitations()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to remove team member (soft delete - remove company_id)
CREATE OR REPLACE FUNCTION public.remove_team_member(
    p_user_id UUID,
    p_removed_by UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_company_id UUID;
    v_is_owner BOOLEAN;
    v_remover_role TEXT;
BEGIN
    -- Get remover's company and role
    SELECT company_id, role INTO v_company_id, v_remover_role
    FROM public.profiles
    WHERE id = p_removed_by;

    -- Check if remover is admin or owner
    IF v_remover_role NOT IN ('admin', 'project_manager') THEN
        RAISE EXCEPTION 'Only admins can remove team members';
    END IF;

    -- Check if target user is owner
    SELECT is_owner INTO v_is_owner
    FROM public.profiles
    WHERE id = p_user_id AND company_id = v_company_id;

    IF v_is_owner THEN
        RAISE EXCEPTION 'Cannot remove company owner';
    END IF;

    -- Check if user is trying to remove themselves
    IF p_user_id = p_removed_by THEN
        RAISE EXCEPTION 'Cannot remove yourself';
    END IF;

    -- Remove user from company
    UPDATE public.profiles
    SET company_id = NULL,
        updated_at = NOW()
    WHERE id = p_user_id
    AND company_id = v_company_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- MIGRATION FOR EXISTING USERS
-- ============================================

-- Create default company for existing users without one
DO $$
DECLARE
    v_company_id UUID;
BEGIN
    -- Check if there are users without a company
    IF EXISTS (SELECT 1 FROM public.profiles WHERE company_id IS NULL LIMIT 1) THEN
        -- Create a default company
        INSERT INTO public.companies (name, email)
        VALUES ('TropiTech Solutions', 'info@tropitech.com')
        RETURNING id INTO v_company_id;

        -- Assign all existing users to this company
        -- First admin becomes owner
        UPDATE public.profiles
        SET company_id = v_company_id,
            is_owner = (id = (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1))
        WHERE company_id IS NULL;
    END IF;
END $$;

-- ============================================
-- VIEWS
-- ============================================

-- View for team members with their details
CREATE OR REPLACE VIEW public.team_members AS
SELECT
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.phone,
    p.avatar_url,
    p.company_id,
    p.is_owner,
    c.name as company_name,
    p.created_at,
    p.updated_at
FROM public.profiles p
LEFT JOIN public.companies c ON p.company_id = c.id
WHERE p.company_id IS NOT NULL;

-- View for pending invitations with company info
CREATE OR REPLACE VIEW public.pending_invitations AS
SELECT
    i.id,
    i.email,
    i.role,
    i.token,
    i.expires_at,
    i.created_at,
    i.company_id,
    c.name as company_name,
    p.full_name as invited_by_name,
    p.email as invited_by_email
FROM public.invitations i
JOIN public.companies c ON i.company_id = c.id
LEFT JOIN public.profiles p ON i.invited_by = p.id
WHERE i.status = 'pending'
AND i.expires_at > NOW();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.companies IS 'Company/organization details with payment instructions for invoices';
COMMENT ON TABLE public.invitations IS 'User invitations to join companies';
COMMENT ON COLUMN public.companies.payment_bank_name IS 'Bank name for receiving customer payments';
COMMENT ON COLUMN public.companies.payment_account_name IS 'Account name for receiving customer payments';
COMMENT ON COLUMN public.companies.payment_account_number IS 'Account number for receiving customer payments';
COMMENT ON COLUMN public.companies.payment_instructions IS 'Additional payment instructions shown on invoices';
COMMENT ON COLUMN public.profiles.company_id IS 'Company the user belongs to';
COMMENT ON COLUMN public.profiles.is_owner IS 'Whether the user is the company owner (cannot be removed)';

