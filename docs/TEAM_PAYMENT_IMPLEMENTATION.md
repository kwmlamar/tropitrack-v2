# Team Management, Payment Instructions & Company Information Implementation

## Date: January 22, 2026

## Overview

This document outlines the implementation of three major features:
1. **User Invitation System** - Invite admins and workers to join the company
2. **Payment Instructions** - Configure bank details for receiving customer payments
3. **Company Information** - Manage company contact details for invoices

---

## Part 1: Database Migration

### ✅ COMPLETED

**File:** `/supabase/migrations/20260122_companies_invitations_payments.sql`

### Tables Created:

1. **`companies`** - Company information and payment details
   - Basic info: name, email, phone, address, city
   - Tax info: vat_tax_id, business_registration_number
   - Payment fields: payment_bank_name, payment_account_name, payment_account_number, etc.

2. **`invitations`** - Team member invitations
   - email, role (admin/worker), token, status, expires_at
   - Links to company_id and invited_by user

3. **`profiles` updates** - Added company relationship
   - company_id (UUID FK to companies)
   - is_owner (BOOLEAN) - marks company owner who cannot be removed

### Functions Created:

- `generate_invitation_token()` - Creates secure random token
- `validate_invitation_token(p_token)` - Validates invitation before signup
- `accept_invitation(p_token, p_user_id)` - Links user to company after signup
- `expire_old_invitations()` - Cleanup function for expired invitations
- `remove_team_member(p_user_id, p_removed_by)` - Remove user from company

### Views Created:

- `team_members` - All users with their company info
- `pending_invitations` - Active invitations with inviter details

### Row Level Security (RLS):

All tables have RLS enabled with proper policies to ensure:
- Users can only see data for their company
- Only admins can invite/remove team members
- Invitations are properly scoped

---

## Part 2: TypeScript Types

### ✅ COMPLETED

**File:** `/src/types/index.ts`

### New Types Added:

```typescript
// Company types
export interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  payment_bank_name?: string;
  payment_account_number?: string;
  // ... all payment fields
}

// Invitation types
export type InvitationRole = "admin" | "worker";
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface Invitation {
  id: string;
  company_id: string;
  email: string;
  role: InvitationRole;
  token: string;
  status: InvitationStatus;
  expires_at: string;
}

// Team member view
export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string;
  is_owner: boolean;
}
```

### Updated Types:

- `UserRole` - Added "worker" role
- `User` - Added `company_id` and `is_owner` fields

---

## Part 3: Team Management Page

### ✅ COMPLETED

**File:** `/src/app/(dashboard)/settings/team/page.tsx`

### Features Implemented:

#### Admins Section:
- Lists all admin users with avatars
- Shows owner badge (Crown icon)
- Shows admin badge
- Remove button (disabled for owner and self)

#### Pending Invitations Section:
- Lists all pending invitations
- Shows email, role, invite date, inviter name
- Resend and Cancel buttons for each invitation

#### Workers Section:
- Placeholder for future worker invitations
- Shows "Coming Soon" message

#### Invite Dialog:
- Email input (required)
- Role selection (Admin/Worker radio buttons)
- Worker option disabled with "Coming Soon" label
- Validation for duplicate emails
- Generates secure token via database function
- Creates invitation with 7-day expiration

#### Remove Member Dialog:
- Confirmation dialog before removal
- Warning about immediate access loss
- Calls `remove_team_member()` database function
- Prevents removing owner or self

### UI Components Created:

**New Components:**
- `/src/components/ui/radio-group.tsx` - Radio button component
- `/src/components/ui/alert.tsx` - Alert notification component

---

## Part 4: Still TODO

### 🔄 In Progress / Pending:

#### 1. Invitation Email Sending

**Need to create Supabase Edge Function:**

```typescript
// /supabase/functions/send-invitation-email/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { email, role, token, company_name, inviter_name } = await req.json()

  // Use Resend or SendGrid API
  const inviteUrl = `${Deno.env.get("APP_URL")}/signup?invite=${token}`

  // Send email with invitation link
  // Template:
  // Subject: "You've been invited to join {company_name} on TropiTrack"
  // Body: Include invite link, role, expiration (7 days), company name
})
```

**Email Template Variables:**
- `{{company_name}}` - Company name
- `{{inviter_name}}` - Person who sent invitation
- `{{role}}` - Role (Admin/Worker)
- `{{invite_url}}` - Signup URL with token
- `{{expires_in}}` - "7 days"

#### 2. Signup Page with Invitation Handling

**Update:** `/src/app/signup/page.tsx` or create auth route

**Logic:**
1. Check for `?invite=` query parameter
2. Call `validate_invitation_token()` function
3. If valid:
   - Pre-fill email field (read-only)
   - Show company name banner ("Join {Company Name}")
   - After signup, call `accept_invitation()` function
   - Redirect to dashboard
4. If invalid/expired:
   - Show error message
   - Allow regular signup

#### 3. Payment Instructions Settings Page

**Create:** `/src/app/(dashboard)/settings/payment/page.tsx`

**Form Fields:**
- Bank Name
- Account Name
- Account Number
- Routing/Transit Number (optional)
- SWIFT/BIC Code (optional)
- Mobile Money (optional)
- Additional Instructions (textarea)

**Features:**
- Live preview of how it appears on invoice
- Save button (not auto-save)
- All fields optional
- Fetch/update company payment fields

#### 4. Company Information Settings

**Update:** `/src/app/(dashboard)/settings/page.tsx`

Update the "Company" tab to use actual company data:

**Form Fields:**
- Company Name (required)
- Email (for invoices)
- Phone (for invoices)
- Address
- City
- VAT/Tax ID (optional)
- Business Registration Number (optional)

**Logic:**
- Fetch company data on mount
- Save updates to `companies` table
- Show success toast after save

#### 5. Invoice PDF Templates

**Update:**
- `/src/components/pdf/invoice-pdf-template.tsx`
- `/src/components/pdf/estimate-pdf-template.tsx`

**Changes Needed:**

**Header Section:**
```typescript
// Fetch company data
const { data: company } = await supabase
  .from("companies")
  .select("*")
  .eq("id", user.company_id)
  .single();

// In PDF template header:
<Text>{company.name}</Text>
<Text>{company.address}</Text>
<Text>{company.city}</Text>
<Text>{company.phone}</Text>
<Text>{company.email}</Text>
```

**Footer Section (Payment Instructions):**
```typescript
{company.payment_bank_name && (
  <View style={styles.paymentSection}>
    <Text style={styles.sectionTitle}>Payment Instructions</Text>
    <Text>Please make payment to:</Text>

    {company.payment_bank_name && (
      <Text>Bank: {company.payment_bank_name}</Text>
    )}
    {company.payment_account_name && (
      <Text>Account Name: {company.payment_account_name}</Text>
    )}
    {company.payment_account_number && (
      <Text>Account Number: {company.payment_account_number}</Text>
    )}
    {company.payment_mobile_money && (
      <Text>Mobile Payment: {company.payment_mobile_money}</Text>
    )}
    {company.payment_instructions && (
      <Text>{company.payment_instructions}</Text>
    )}
  </View>
)}
```

**Conditional Display:**
- Only show payment section if at least one payment field is filled
- If no payment instructions: show "Payment due upon receipt"

#### 6. Settings Navigation

**Update:** `/src/app/(dashboard)/settings/page.tsx`

Add new tab or button linking to Team Management:

```typescript
<TabsTrigger value="team" className="flex items-center gap-2">
  <Users className="h-4 w-4" />
  Team
</TabsTrigger>

// Or add as button:
<Button variant="outline" onClick={() => router.push("/settings/team")}>
  <Users className="h-4 w-4 mr-2" />
  Team Management
</Button>
```

---

## Testing Checklist

### Database Setup:
- [ ] Run migration in Supabase SQL Editor
- [ ] Verify tables created
- [ ] Test RLS policies

### Team Management:
- [ ] Navigate to /settings/team
- [ ] View team members list
- [ ] Click "Invite Team Member"
- [ ] Enter email and select role
- [ ] Submit invitation
- [ ] Verify invitation appears in pending list
- [ ] Click "Resend" on invitation
- [ ] Click "Cancel" on invitation
- [ ] Verify invitation removed from list
- [ ] Try to remove team member (not owner/self)
- [ ] Verify confirmation dialog appears
- [ ] Complete removal
- [ ] Verify member removed from list

### Invitation Flow (After Email Function):
- [ ] Receive invitation email
- [ ] Click invitation link
- [ ] Verify signup page shows company name
- [ ] Verify email is pre-filled
- [ ] Complete signup
- [ ] Verify redirected to dashboard
- [ ] Verify user has correct company_id and role
- [ ] Verify invitation marked as "accepted"

### Payment Instructions:
- [ ] Navigate to payment settings
- [ ] Fill in bank details
- [ ] Fill in mobile payment (optional)
- [ ] Add additional instructions
- [ ] View live preview
- [ ] Save payment instructions
- [ ] Generate invoice
- [ ] Verify payment instructions appear in PDF
- [ ] Verify conditional display (only filled fields)

### Company Information:
- [ ] Navigate to company settings
- [ ] Update company name
- [ ] Update email and phone
- [ ] Update address
- [ ] Save changes
- [ ] Generate invoice
- [ ] Verify company info in PDF header

---

## API Endpoints Needed

### For Invitation Email:

**Endpoint:** POST `/api/invitations/send-email`

**Request:**
```json
{
  "invitation_id": "uuid",
  "email": "user@example.com",
  "role": "admin",
  "company_name": "TropiTech Solutions",
  "inviter_name": "John Doe",
  "token": "secure_token_here"
}
```

**Implementation:**
- Supabase Edge Function or API Route
- Use Resend/SendGrid for email delivery
- Environment variables for email service API keys

---

## Security Considerations

### Invitation Tokens:
- ✅ Generated using cryptographically secure random bytes
- ✅ Stored hashed in database (currently plain - consider hashing)
- ✅ Single-use (marked as "accepted" after use)
- ✅ Time-limited (7 days expiration)

### Team Member Removal:
- ✅ Cannot remove company owner
- ✅ Cannot remove yourself
- ✅ Only admins can remove members
- ✅ Immediate access revocation via company_id removal

### Payment Information:
- ⚠️ Account numbers stored in plain text
- Consider: Encrypt sensitive payment fields
- Consider: Add account number masking in UI
- ✅ Only admins can view/edit

### RLS Policies:
- ✅ Users can only see their company's data
- ✅ Proper role-based access control
- ✅ Invitations scoped to company

---

## Known Limitations

1. **Worker Invitations:** UI prepared but functionality disabled (coming soon)
2. **Email Sending:** Requires Supabase Edge Function setup
3. **Signup Flow:** Needs invitation handling logic
4. **Account Number Security:** No encryption/masking yet
5. **Audit Logging:** No audit trail for team changes (recommended for future)

---

## Next Steps

**Priority 1 (Core Features):**
1. Create invitation email Edge Function
2. Update signup page to handle invitation tokens
3. Add payment instructions settings page
4. Update company information settings
5. Update PDF templates with company/payment info

**Priority 2 (Polish):**
1. Add account number masking option
2. Add audit logging for team changes
3. Add email verification for invitations
4. Add invitation expiration notifications

**Priority 3 (Future):**
1. Enable worker invitation functionality
2. Add worker portal for viewing timesheets
3. Add batch invitation import (CSV)
4. Add invitation link regeneration
5. Add custom email templates

---

## Files Modified/Created

### Database:
- ✅ `/supabase/migrations/20260122_companies_invitations_payments.sql`

### Types:
- ✅ `/src/types/index.ts` (updated)

### Pages:
- ✅ `/src/app/(dashboard)/settings/team/page.tsx` (new)
- 🔄 `/src/app/(dashboard)/settings/payment/page.tsx` (TODO)
- 🔄 `/src/app/(dashboard)/settings/page.tsx` (update needed)
- 🔄 `/src/app/signup/page.tsx` (update needed)

### Components:
- ✅ `/src/components/ui/radio-group.tsx` (new)
- ✅ `/src/components/ui/alert.tsx` (new)
- 🔄 `/src/components/pdf/invoice-pdf-template.tsx` (update needed)
- 🔄 `/src/components/pdf/estimate-pdf-template.tsx` (update needed)

### Functions:
- 🔄 `/supabase/functions/send-invitation-email/index.ts` (TODO)

---

## Environment Variables Required

```env
# For invitation emails
RESEND_API_KEY=your_resend_api_key
# OR
SENDGRID_API_KEY=your_sendgrid_api_key

# App URL for invitation links
NEXT_PUBLIC_APP_URL=https://your-app-url.com
```

---

## Status Summary

**✅ Completed:**
- Database schema and migration
- TypeScript types
- Team Management UI
- Invite dialog and logic
- Remove member functionality
- RLS policies

**🔄 In Progress:**
- Invitation email sending

**⏳ Pending:**
- Signup with invitation handling
- Payment instructions page
- Company information updates
- PDF template updates
- Settings navigation updates

---

## Estimated Remaining Work

**Time Estimates:**
- Invitation email function: 1-2 hours
- Signup invitation handling: 2-3 hours
- Payment instructions page: 2-3 hours
- Company information updates: 1-2 hours
- PDF template updates: 2-3 hours
- Testing & bug fixes: 2-3 hours

**Total:** ~12-16 hours

---

## Support & Documentation

- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Edge Functions: https://supabase.com/docs/guides/functions
- Resend Email API: https://resend.com/docs
- React PDF: https://react-pdf.org/
