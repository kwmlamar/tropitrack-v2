-- Notifications System Migration
-- Created: January 22, 2026
-- Description: Implements in-app notifications system with preferences

-- ============================================================================
-- TABLES
-- ============================================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Notification content
    type VARCHAR(50) NOT NULL, -- 'low_stock', 'milestone_reminder', 'payroll_reminder', 'budget_alert', 'invoice_overdue', 'estimate_expiring', 'team_invitation', 'payment_received'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- Optional metadata for linking
    link_type VARCHAR(50), -- 'project', 'invoice', 'estimate', 'material', 'worker'
    link_id UUID, -- ID of the related entity
    link_url TEXT, -- Direct URL to navigate to

    -- Status
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,

    -- Priority
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User notification preferences
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- Notification type preferences
    low_stock_alerts BOOLEAN DEFAULT TRUE,
    milestone_reminders BOOLEAN DEFAULT TRUE,
    payroll_reminders BOOLEAN DEFAULT TRUE,
    budget_alerts BOOLEAN DEFAULT TRUE,
    invoice_overdue_alerts BOOLEAN DEFAULT TRUE,
    estimate_expiring_alerts BOOLEAN DEFAULT TRUE,
    team_notifications BOOLEAN DEFAULT TRUE,
    payment_notifications BOOLEAN DEFAULT TRUE,

    -- Delivery preferences
    in_app_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT FALSE, -- Future: email notifications
    email_digest BOOLEAN DEFAULT FALSE, -- Future: daily/weekly digest

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Notifications indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON public.notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = FALSE;

-- Compound index for common query patterns
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
ON public.notifications(user_id, read, created_at DESC);

-- Preferences index
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON public.user_notification_preferences(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Notifications RLS Policies
-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- System/triggers can insert notifications
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Notification Preferences RLS Policies
CREATE POLICY "Users can view own preferences"
ON public.user_notification_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON public.user_notification_preferences
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
ON public.user_notification_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_company_id UUID,
    p_type VARCHAR,
    p_title VARCHAR,
    p_message TEXT,
    p_link_type VARCHAR DEFAULT NULL,
    p_link_id UUID DEFAULT NULL,
    p_link_url TEXT DEFAULT NULL,
    p_priority VARCHAR DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notification_id UUID;
    v_prefs RECORD;
    v_should_create BOOLEAN := TRUE;
BEGIN
    -- Check user's notification preferences
    SELECT * INTO v_prefs
    FROM user_notification_preferences
    WHERE user_id = p_user_id;

    -- If no preferences exist, create default ones
    IF NOT FOUND THEN
        INSERT INTO user_notification_preferences (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_prefs;
    END IF;

    -- Check if this notification type is enabled
    CASE p_type
        WHEN 'low_stock' THEN
            v_should_create := v_prefs.low_stock_alerts;
        WHEN 'milestone_reminder' THEN
            v_should_create := v_prefs.milestone_reminders;
        WHEN 'payroll_reminder' THEN
            v_should_create := v_prefs.payroll_reminders;
        WHEN 'budget_alert' THEN
            v_should_create := v_prefs.budget_alerts;
        WHEN 'invoice_overdue' THEN
            v_should_create := v_prefs.invoice_overdue_alerts;
        WHEN 'estimate_expiring' THEN
            v_should_create := v_prefs.estimate_expiring_alerts;
        WHEN 'team_invitation' THEN
            v_should_create := v_prefs.team_notifications;
        WHEN 'payment_received' THEN
            v_should_create := v_prefs.payment_notifications;
        ELSE
            v_should_create := TRUE; -- Default: create notification for unknown types
    END CASE;

    -- Only create notification if user has this type enabled
    IF v_should_create AND v_prefs.in_app_enabled THEN
        INSERT INTO notifications (
            user_id,
            company_id,
            type,
            title,
            message,
            link_type,
            link_id,
            link_url,
            priority
        ) VALUES (
            p_user_id,
            p_company_id,
            p_type,
            p_title,
            p_message,
            p_link_type,
            p_link_id,
            p_link_url,
            p_priority
        )
        RETURNING id INTO v_notification_id;

        RETURN v_notification_id;
    END IF;

    RETURN NULL;
END;
$$;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE notifications
    SET
        read = TRUE,
        read_at = NOW(),
        updated_at = NOW()
    WHERE id = p_notification_id
    AND user_id = auth.uid();

    RETURN FOUND;
END;
$$;

-- Function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE notifications
    SET
        read = TRUE,
        read_at = NOW(),
        updated_at = NOW()
    WHERE user_id = auth.uid()
    AND read = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM notifications
    WHERE user_id = p_user_id
    AND read = FALSE;

    RETURN v_count;
END;
$$;

-- Function to delete old read notifications (cleanup)
CREATE OR REPLACE FUNCTION delete_old_notifications(p_days_old INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM notifications
    WHERE read = TRUE
    AND read_at < NOW() - (p_days_old || ' days')::INTERVAL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_notification_timestamp
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION update_notification_timestamp();

CREATE TRIGGER trigger_update_notification_prefs_timestamp
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_notification_timestamp();

-- ============================================================================
-- DEFAULT PREFERENCES FOR EXISTING USERS
-- ============================================================================

-- Create default notification preferences for all existing users
INSERT INTO user_notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.notifications IS 'Stores in-app notifications for users';
COMMENT ON TABLE public.user_notification_preferences IS 'User preferences for notification types and delivery methods';
COMMENT ON FUNCTION create_notification IS 'Creates a notification if user has that type enabled in preferences';
COMMENT ON FUNCTION mark_notification_read IS 'Marks a single notification as read';
COMMENT ON FUNCTION mark_all_notifications_read IS 'Marks all unread notifications as read for current user';
COMMENT ON FUNCTION get_unread_count IS 'Returns count of unread notifications for a user';
COMMENT ON FUNCTION delete_old_notifications IS 'Deletes old read notifications for cleanup';
