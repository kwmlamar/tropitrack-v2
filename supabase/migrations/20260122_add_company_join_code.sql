-- Add join_code to companies table for easy team member joining
-- Users can enter this code during signup to join a company

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;

-- Generate join codes for existing companies
UPDATE public.companies
SET join_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT) FROM 1 FOR 8))
WHERE join_code IS NULL;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_companies_join_code ON public.companies(join_code);

-- Function to generate a unique join code
CREATE OR REPLACE FUNCTION public.generate_company_join_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 8-character uppercase alphanumeric code
        new_code := UPPER(
            SUBSTRING(
                MD5(RANDOM()::TEXT || NOW()::TEXT) 
                FROM 1 FOR 8
            )
        );
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM public.companies WHERE join_code = new_code)
        INTO code_exists;
        
        -- Exit loop if code is unique
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Function to validate join code (public, no auth required)
CREATE OR REPLACE FUNCTION public.validate_join_code(p_join_code TEXT)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
    v_company_name TEXT;
BEGIN
    -- Find company by join code (bypasses RLS with SECURITY DEFINER)
    SELECT id, name INTO v_company_id, v_company_name
    FROM public.companies
    WHERE join_code = UPPER(TRIM(p_join_code));
    
    IF v_company_id IS NULL THEN
        RETURN json_build_object(
            'valid', false,
            'error', 'Invalid join code'
        );
    END IF;
    
    RETURN json_build_object(
        'valid', true,
        'company_id', v_company_id,
        'company_name', v_company_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to join company by code
CREATE OR REPLACE FUNCTION public.join_company_by_code(
    p_join_code TEXT,
    p_user_id UUID,
    p_role TEXT DEFAULT 'project_manager'
)
RETURNS JSON AS $$
DECLARE
    v_company_id UUID;
    v_company_name TEXT;
    v_user_company_id UUID;
BEGIN
    -- Validate role
    IF p_role NOT IN ('admin', 'project_manager', 'worker') THEN
        RAISE EXCEPTION 'Invalid role. Must be admin, project_manager, or worker';
    END IF;
    
    -- Find company by join code
    SELECT id, name INTO v_company_id, v_company_name
    FROM public.companies
    WHERE join_code = UPPER(TRIM(p_join_code));
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Invalid join code';
    END IF;
    
    -- Check if user already belongs to a company
    SELECT company_id INTO v_user_company_id
    FROM public.profiles
    WHERE id = p_user_id;
    
    IF v_user_company_id IS NOT NULL THEN
        RAISE EXCEPTION 'User already belongs to a company';
    END IF;
    
    -- Assign user to company
    UPDATE public.profiles
    SET company_id = v_company_id,
        role = p_role
    WHERE id = p_user_id;
    
    RETURN json_build_object(
        'success', true,
        'company_id', v_company_id,
        'company_name', v_company_name,
        'role', p_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.validate_join_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_company_by_code(TEXT, UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.companies.join_code IS 'Unique code that allows users to join this company during signup';
