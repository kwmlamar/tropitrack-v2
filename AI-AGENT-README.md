# TropiTrack AI Agent System

**Autonomous AI Assistant with Full TropiTrack Control**

## Overview

The TropiTrack AI Agent is a fully autonomous AI assistant powered by OpenAI's GPT-4o-mini that can control every aspect of your construction management system. It uses function calling to execute actions on your behalf, making construction management faster and more efficient.

## Key Features

### 🔍 **Integrated Smart Search**

The AI Agent uses the **exact same smart search technology** as your Command K search bar:
- Natural language to SQL query translation
- Searches across projects, invoices, workers, materials, clients, and more
- Intelligent summaries with financial totals
- Same AI model (GPT-4o-mini) powering both features

**Example**: When you ask "Show me overdue invoices", the AI Agent:
1. Parses your natural language using OpenAI
2. Generates optimized Supabase query
3. Executes the search (respecting your company permissions)
4. Returns formatted results with summaries

This means anything you can find with Command K, the AI Agent can find and act on!

### ✅ 50+ Autonomous Functions

The AI Agent can perform over 50 different operations across 10 categories:

1. **Projects** (7 functions)
   - List, create, update, delete projects
   - Get detailed project information
   - Calculate project costs and profitability
   - Track budget vs actual spending

2. **Timesheets** (5 functions)
   - Create single or bulk time entries
   - Auto-calculate overtime and NIB deductions
   - Get timesheet reports with filters
   - Update and delete time entries

3. **Workers** (5 functions)
   - Manage worker database
   - Track worker hours by project
   - Update rates and information
   - Filter by status and type

4. **Invoices** (7 functions)
   - Create professional invoices
   - Track payments and status
   - Mark invoices as paid
   - Send invoices to clients
   - Generate PDF previews

5. **Estimates** (4 functions)
   - Create detailed project estimates
   - Calculate markup and profit margins
   - Convert estimates to projects
   - Send estimates to clients

6. **Materials** (3 functions)
   - Manage inventory
   - Create purchase orders
   - Allocate materials to projects

7. **Payroll** (3 functions)
   - Calculate payroll with NIB deductions
   - Generate NIB summaries for reporting
   - Get financial summaries

8. **Reports** (4 functions)
   - Generate comprehensive project reports
   - Create payroll reports
   - Track overdue invoices
   - Compare budget vs actual costs

9. **Search** (2 functions)
   - **Same smart search as Command K** - Uses identical AI-powered search
   - Natural language queries across all data
   - Intelligent filtering and summaries

10. **Settings** (3 functions)
    - Update company information
    - Manage payment instructions
    - Configure NIB settings

### 🎯 Multi-Step Workflows

The AI can handle complex, multi-step tasks:

```
User: "Create a new project for Harbor Bay Renovation with a $50,000 budget,
       then add all my active workers to it"

AI: ✓ Created project "Harbor Bay Renovation" (BSD $50,000 budget)
    ✓ Found 8 active workers
    ✓ Workers are now ready to be assigned time entries for this project

    Project created successfully! You can now start logging time entries.
```

### 🛡️ Safety Features

1. **Confirmation for Destructive Actions**
   - AI will always ask before deleting projects, workers, or invoices
   - Requires explicit user confirmation

2. **Audit Logging**
   - Every action is logged to `ai_actions` table
   - Includes timestamps, inputs, outputs, and execution time
   - Track what the AI did and when

3. **Rate Limiting**
   - Default: 200 messages per day per user
   - Prevents accidental API quota exhaustion
   - Configurable per installation

4. **Error Handling**
   - Graceful error messages
   - Retry logic for transient failures
   - OpenAI quota monitoring

## Architecture

### Database Schema

Three new tables power the AI Agent:

```sql
-- Conversation tracking
ai_conversations (id, user_id, company_id, title, created_at, updated_at)

-- Message history
ai_messages (id, conversation_id, role, content, tool_calls, created_at)

-- Audit log
ai_actions (id, user_id, conversation_id, action_type, action_data,
            result_data, success, error_message, execution_time_ms, created_at)
```

### Core Components

1. **AIAgent Class** (`/src/lib/ai-agent/index.ts`)
   - Main orchestrator
   - Handles OpenAI API calls
   - Manages conversation state
   - Routes tool calls to implementations

2. **Tool Definitions** (`/src/lib/ai-agent/tool-definitions.ts`)
   - OpenAI function calling schemas
   - 50+ function definitions
   - Parameter validation specs

3. **Tool Implementations** (`/src/lib/ai-agent/tools/`)
   - `projects.ts` - Project management
   - `timesheets.ts` - Time tracking
   - `workers.ts` - Worker management
   - `invoices.ts` - Invoicing
   - `estimates.ts` - Estimates
   - `materials.ts` - Materials & POs
   - `payroll.ts` - Payroll calculations
   - `reports.ts` - Reporting
   - `search.ts` - Search & filtering
   - `settings.ts` - System settings

4. **API Endpoint** (`/src/app/api/ai/agent/route.ts`)
   - Authentication & authorization
   - Rate limit enforcement
   - Error handling
   - Response formatting

5. **UI Component** (`/src/components/ai-agent/ai-agent-chat.tsx`)
   - Beautiful chat interface
   - Real-time message streaming
   - Quick action buttons
   - Metadata display (tool calls, execution time)

## Cost Analysis

### GPT-4o-mini Pricing

- **Input**: $0.15 per 1M tokens
- **Output**: $0.60 per 1M tokens

### Estimated Monthly Costs

**Example Usage (100 conversations/day):**
- Average 10 messages per conversation
- Average 300 tokens per message input
- Average 200 tokens per message output

**Monthly calculation:**
- Input: 100 × 10 × 300 × 30 = 9M tokens ≈ **$1.35**
- Output: 100 × 10 × 200 × 30 = 6M tokens ≈ **$3.60**
- **Total: ~$5/month**

**vs Claude Sonnet 3.5:**
- Same usage would cost ~$100/month
- **GPT-4o-mini is 20x cheaper!**

## Setup Instructions

### 1. Install Dependencies

Dependencies are already installed:
```bash
# Already in package.json
"openai": "^6.16.0"
```

### 2. Run Database Migration

```bash
# Apply the AI Agent tables migration
supabase db push

# Or manually run:
# supabase/migrations/20260124_create_ai_agent_tables.sql
```

### 3. Configure Environment Variables

Add to `.env.local`:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-...your-key-here...
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
OPENAI_MAX_TOKENS=1000    # Optional, defaults to 500

# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 4. Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Copy to `.env.local`
4. Add billing method at https://platform.openai.com/account/billing

### 5. Access the AI Agent

Navigate to: **`/ai-agent`**

Or add to your navigation menu.

## Usage Examples

### Basic Queries (Using Smart Search)

The AI Agent uses the **same powerful smart search** as your Command K search bar:

```
"List all active projects"
"Show me workers with overtime this week"
"Find overdue invoices"
"Projects over budget"
"Materials low on stock"
```

### Creating Data

```
"Create a new project called Sunset Villa with a budget of $75,000"
"Add a worker named John Smith, carpenter, $25/hour"
"Create an invoice for the Palm Beach project"
```

### Complex Workflows

```
"Calculate last week's payroll and show me NIB deductions"
"Show me all projects over budget and their variance"
"Create a time entry for all workers on the Harbor Bay project for yesterday, 8 hours each"
```

### Reports & Analysis

```
"Generate a financial summary for January"
"Which projects are most profitable?"
"Show me overdue invoices with aging analysis"
```

## Rate Limiting

Default limits (configurable):
- **200 messages per day** per user
- Enforced via `ai_agent_usage` table
- Resets daily at midnight

To adjust limits, modify the `check_ai_rate_limit` function or pass a different limit when calling `AIAgent.checkRateLimit()`.

## Monitoring & Audit

### View AI Actions

```sql
-- All AI actions for a user
SELECT * FROM ai_actions
WHERE user_id = '...'
ORDER BY created_at DESC;

-- Failed actions
SELECT * FROM ai_actions
WHERE success = FALSE;

-- Actions by category
SELECT action_category, COUNT(*)
FROM ai_actions
GROUP BY action_category;
```

### View Usage Stats

```sql
-- Daily usage by user
SELECT user_id, date, message_count, tool_call_count, tokens_used
FROM ai_agent_usage
ORDER BY date DESC, tokens_used DESC;
```

### Conversation History

```sql
-- Get full conversation
SELECT * FROM get_conversation_with_messages('conversation-id-here');
```

## Testing

### Test the API Directly

```bash
curl -X POST http://localhost:3000/api/ai/agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -d '{
    "message": "List all active projects"
  }'
```

### Test Multi-Step Workflow

```
User: "Create a project called Test Project with $10k budget,
       then create an invoice for it with one line item: Labor, $5000"

Expected: AI creates project, then creates invoice linked to that project
```

## Security Considerations

1. **Row Level Security (RLS)**
   - All AI actions respect RLS policies
   - Users can only access their company's data
   - Enforced at database level

2. **Service Role Key**
   - Required for AI operations
   - Stored server-side only (never exposed to client)
   - Grants necessary permissions for autonomous actions

3. **Audit Trail**
   - Every action logged
   - Cannot be deleted by users
   - Provides accountability

4. **Rate Limiting**
   - Prevents abuse
   - Protects OpenAI quota
   - Configurable per user/company

## Troubleshooting

### Error: "OpenAI API quota exceeded"

**Solution**: Add credits to your OpenAI account at https://platform.openai.com/account/billing

### Error: "Invalid API key"

**Solution**: Verify `OPENAI_API_KEY` in `.env.local` is correct

### Error: "Daily message limit reached"

**Solution**: Wait until tomorrow or increase the rate limit

### AI Not Responding

**Check**:
1. OpenAI API key is valid
2. Database migration has been run
3. User has a `company_id` in their profile
4. Network connection to OpenAI is working

## Future Enhancements

Potential additions:
- [ ] Voice input/output
- [ ] Scheduled tasks ("Generate payroll every Friday")
- [ ] Email notifications when AI completes tasks
- [ ] PDF/Excel export of AI conversations
- [ ] Integration with WhatsApp/SMS
- [ ] Custom AI instructions per company
- [ ] AI-suggested optimizations
- [ ] Predictive analytics

## Cost Optimization Tips

1. **Use Shorter System Prompts**
   - Current prompt is ~500 tokens
   - Could be condensed to ~300 tokens for savings

2. **Reduce Context Window**
   - Currently keeps last 20 messages
   - Could reduce to 10 for simple queries

3. **Cache Frequently Used Data**
   - Worker lists, project lists
   - Reduce redundant database queries

4. **Batch Operations**
   - Combine multiple actions into single tool call when possible

## Support

For issues or questions:
- Check database logs: `ai_actions` table
- Review OpenAI dashboard for quota/errors
- Verify environment variables are set correctly

---

**Built with ❤️ for Bahamian construction companies**

*Powered by OpenAI GPT-4o-mini | ~$5/month for full autonomous control*
