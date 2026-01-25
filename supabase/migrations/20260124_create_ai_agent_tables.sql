-- ============================================
-- AI AGENT SYSTEM
-- Migration for AI conversation tracking and audit logs
-- Date: January 24, 2026
-- ============================================

-- ============================================
-- AI CONVERSATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_company ON public.ai_conversations(company_id);

-- RLS Policies
CREATE POLICY "Users can view their AI conversations" ON public.ai_conversations
    FOR SELECT USING (
        user_id = auth.uid()
    );

CREATE POLICY "Users can create AI conversations" ON public.ai_conversations
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY "Users can update their AI conversations" ON public.ai_conversations
    FOR UPDATE USING (
        user_id = auth.uid()
    );

CREATE POLICY "Users can delete their AI conversations" ON public.ai_conversations
    FOR DELETE USING (
        user_id = auth.uid()
    );

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_ai_conversations BEFORE UPDATE ON public.ai_conversations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- AI MESSAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB, -- Store function calls made by assistant
    tool_call_id TEXT, -- For tool response messages
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- Create index for faster conversation retrieval
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created_at ON public.ai_messages(conversation_id, created_at);

-- RLS Policies - users can only access messages from their own conversations
CREATE POLICY "Users can view their AI messages" ON public.ai_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ai_conversations
            WHERE id = ai_messages.conversation_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create AI messages" ON public.ai_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ai_conversations
            WHERE id = ai_messages.conversation_id
            AND user_id = auth.uid()
        )
    );

-- ============================================
-- AI ACTIONS AUDIT LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_actions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    action_type TEXT NOT NULL, -- e.g., 'create_project', 'update_invoice', 'delete_timesheet'
    action_category TEXT, -- e.g., 'projects', 'invoices', 'timesheets'
    action_data JSONB, -- Input parameters for the action
    result_data JSONB, -- Result from the action
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

-- Create indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_ai_actions_user ON public.ai_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_company ON public.ai_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation ON public.ai_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_created_at ON public.ai_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_type ON public.ai_actions(action_type);

-- RLS Policies
CREATE POLICY "Users can view their AI actions" ON public.ai_actions
    FOR SELECT USING (
        user_id = auth.uid()
    );

CREATE POLICY "Service role can insert AI actions" ON public.ai_actions
    FOR INSERT WITH CHECK (true);

-- ============================================
-- AI AGENT RATE LIMITING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_agent_usage (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    conversation_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

ALTER TABLE public.ai_agent_usage ENABLE ROW LEVEL SECURITY;

-- Create index for rate limiting checks
CREATE INDEX IF NOT EXISTS idx_ai_agent_usage_user_date ON public.ai_agent_usage(user_id, date);

-- RLS Policies
CREATE POLICY "Users can view their AI usage" ON public.ai_agent_usage
    FOR SELECT USING (
        user_id = auth.uid()
    );

CREATE POLICY "Service role can manage AI usage" ON public.ai_agent_usage
    FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_ai_agent_usage BEFORE UPDATE ON public.ai_agent_usage
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get conversation with messages
CREATE OR REPLACE FUNCTION public.get_conversation_with_messages(
    p_conversation_id UUID
)
RETURNS TABLE (
    conversation_id UUID,
    conversation_title TEXT,
    conversation_created_at TIMESTAMPTZ,
    message_id UUID,
    message_role TEXT,
    message_content TEXT,
    message_tool_calls JSONB,
    message_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as conversation_id,
        c.title as conversation_title,
        c.created_at as conversation_created_at,
        m.id as message_id,
        m.role as message_role,
        m.content as message_content,
        m.tool_calls as message_tool_calls,
        m.created_at as message_created_at
    FROM public.ai_conversations c
    LEFT JOIN public.ai_messages m ON c.id = m.conversation_id
    WHERE c.id = p_conversation_id
    AND c.user_id = auth.uid()
    ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage counters
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
    p_user_id UUID,
    p_company_id UUID,
    p_messages INTEGER DEFAULT 0,
    p_tool_calls INTEGER DEFAULT 0,
    p_tokens INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.ai_agent_usage (
        user_id,
        company_id,
        date,
        message_count,
        tool_call_count,
        tokens_used
    ) VALUES (
        p_user_id,
        p_company_id,
        CURRENT_DATE,
        p_messages,
        p_tool_calls,
        p_tokens
    )
    ON CONFLICT (user_id, date)
    DO UPDATE SET
        message_count = public.ai_agent_usage.message_count + EXCLUDED.message_count,
        tool_call_count = public.ai_agent_usage.tool_call_count + EXCLUDED.tool_call_count,
        tokens_used = public.ai_agent_usage.tokens_used + EXCLUDED.tokens_used,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is within rate limits
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
    p_user_id UUID,
    p_max_messages_per_day INTEGER DEFAULT 200
)
RETURNS BOOLEAN AS $$
DECLARE
    v_message_count INTEGER;
BEGIN
    SELECT COALESCE(message_count, 0)
    INTO v_message_count
    FROM public.ai_agent_usage
    WHERE user_id = p_user_id
    AND date = CURRENT_DATE;

    RETURN COALESCE(v_message_count, 0) < p_max_messages_per_day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_actions TO authenticated;
GRANT SELECT ON public.ai_agent_usage TO authenticated;

COMMENT ON TABLE public.ai_conversations IS 'Stores AI chat conversations for each user';
COMMENT ON TABLE public.ai_messages IS 'Stores individual messages within AI conversations';
COMMENT ON TABLE public.ai_actions IS 'Audit log of all actions taken by the AI agent';
COMMENT ON TABLE public.ai_agent_usage IS 'Tracks daily usage metrics for rate limiting and analytics';
