# TropiTrack v2 - Construction Project Management System

A complete, production-ready construction project management web application built for Bahamian construction companies.

## Features

### Project Management
- Create and manage multiple construction projects
- Project timelines and milestones tracking
- Budget tracking per project
- Document storage (plans, permits, invoices)
- Project cost summary and profitability analysis

### Time Tracking & Payroll
- Admin-managed time entry for workers
- Daily timesheets by project
- Automatic payroll calculations
- Pay period management
- Overtime tracking (1.5x rate)
- NIB deduction calculations

### Materials Management
- Material inventory tracking
- Material allocation to specific projects
- Cost tracking per material type
- Low stock alerts
- Automatic stock deduction on allocation

### Vendor Management
- Vendor profiles and contact information
- Purchase order creation and tracking
- Payment terms management
- Vendor status management

### Overhead & Cost Allocation
- Equipment costs allocation
- Administrative overhead distribution
- Indirect costs tracking
- Project profitability analysis
- Cost breakdowns (labor, materials, overhead)

### Team & Roles
- Admin and Project Manager roles
- Permission-based access control
- Worker profiles and rate management

### Reporting
- Project cost analysis
- Cost distribution breakdown
- Worker hours summary
- Profit margin calculations

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Backend**: Supabase (PostgreSQL + Auth)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (Radix UI)
- **Language**: TypeScript
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts (optional)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
cd tropitrack-v2
```

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase:
   - Create a new Supabase project at https://supabase.com
   - Go to the SQL Editor and run the contents of `supabase/schema.sql`
   - Enable Row Level Security on all tables (already included in schema)

4. Configure environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

5. Create an admin user:
   - Go to Supabase Authentication > Users
   - Click "Add user" and create a user with email/password
   - In the SQL Editor, update the user's role to admin:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

6. Start the development server:
```bash
npm run dev
```

7. Open http://localhost:3000 in your browser

## Project Structure

```
tropitrack-v2/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/            # Authentication pages
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   └── layout.tsx         # Root layout
│   ├── components/
│   │   ├── layout/            # Layout components
│   │   ├── projects/          # Project-related components
│   │   ├── workers/           # Worker-related components
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   ├── supabase/          # Supabase client config
│   │   └── utils.ts           # Utility functions
│   └── types/                 # TypeScript type definitions
├── supabase/
│   └── schema.sql             # Database schema
└── public/                    # Static assets
```

## Database Schema

The application uses the following main tables:

- `profiles` - User profiles extending Supabase auth
- `projects` - Construction projects
- `project_milestones` - Project milestones
- `project_documents` - Project documents/files
- `workers` - Worker profiles
- `time_entries` - Time tracking entries
- `pay_periods` - Payroll periods
- `payroll_entries` - Individual payroll calculations
- `materials` - Material inventory
- `material_allocations` - Material usage by project
- `vendors` - Supplier information
- `purchase_orders` - Purchase orders
- `equipment` - Equipment inventory
- `equipment_usage` - Equipment allocation
- `overhead_costs` - Overhead expense tracking

## Key Features Explained

### Currency
The application uses BSD (Bahamian Dollar), which is pegged 1:1 with USD. All currency formatting uses the Bahamian locale.

### Time Tracking
- Standard workday: 8 hours
- Overtime: Hours beyond 8/day at 1.5x rate
- Break time is subtracted from total hours

### Payroll
- Automatic calculation from time entries
- NIB deduction: ~3.85% of gross pay
- Support for hourly and salaried workers

### Row Level Security
All tables have RLS policies to ensure:
- Authenticated users can view most data
- Only admins can modify critical data (workers, payroll, materials)
- Users can only update their own profiles

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The application can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- AWS Amplify
- Self-hosted with Docker

## License

Private - TropiTech Solutions

## Support

For support or feature requests, contact the development team.
