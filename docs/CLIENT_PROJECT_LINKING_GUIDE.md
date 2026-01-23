# Client-Project Linking Guide

## Overview

This guide explains how to properly link clients to projects in TropiTrack v2, replacing the old text-based approach with a proper relational database design.

## The Change

### Before (Old Approach) ❌
```typescript
// Creating a project with text-based client data
const project = {
  name: "Beach House Renovation",
  client_name: "John Smith",  // Just text
  client_email: "john@example.com",
  client_phone: "242-555-1234"
}
```

**Problems:**
- Duplicate client data across projects
- Typos create separate "clients" ("John Smith" vs "John smith")
- Can't easily find all projects for a client
- Can't update client info in one place
- No client-level reporting

### After (New Approach) ✅
```typescript
// Step 1: Create or find the client
const client = await supabase
  .from('clients')
  .insert({
    name: "John Smith",
    email: "john@example.com",
    phone: "242-555-1234",
    address: "123 Bay Street",
    city: "Nassau"
  })
  .select()
  .single()

// Step 2: Create project linked to client
const project = await supabase
  .from('projects')
  .insert({
    name: "Beach House Renovation",
    client_id: client.id,  // Link via foreign key
    location: "Paradise Island",
    // ... other fields
  })
```

**Benefits:**
- Single source of truth for client data
- Easy to find all projects for a client
- Update client once, reflects everywhere
- Proper data integrity
- Client-level reporting enabled

---

## Implementation Guide

### 1. Creating a New Project with a New Client

```typescript
// Create client first
const { data: client, error: clientError } = await supabase
  .from('clients')
  .insert({
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "242-555-5678",
    address: "456 Ocean Drive",
    city: "Freeport",
    notes: "Prefers morning meetings"
  })
  .select()
  .single()

if (clientError) throw clientError

// Then create project
const { data: project, error: projectError } = await supabase
  .from('projects')
  .insert({
    name: "Commercial Building Project",
    client_id: client.id,  // Link to client
    location: "Downtown Nassau",
    status: "planning",
    start_date: "2026-02-01",
    budget: 250000,
    contract_value: 300000,
    created_by: user.id
  })
  .select()
  .single()
```

### 2. Creating a Project with an Existing Client

```typescript
// Search for existing client
const { data: existingClients } = await supabase
  .from('clients')
  .select('*')
  .ilike('name', '%John Smith%')  // Case-insensitive search

// User selects from list, then create project
const { data: project } = await supabase
  .from('projects')
  .insert({
    name: "Pool Installation",
    client_id: existingClients[0].id,  // Use existing client
    // ... other fields
  })
  .select()
  .single()
```

### 3. Getting Projects with Client Information

```typescript
// Using the helper view for backward compatibility
const { data: projects } = await supabase
  .from('projects_with_client_info')
  .select('*')

// Each project will have:
// - client_display_name (from clients table or fallback to text)
// - client_display_email
// - client_display_phone
// - is_linked_client (boolean - true if properly linked)
```

### 4. Getting All Projects for a Specific Client

```typescript
const { data: clientProjects } = await supabase
  .from('projects')
  .select(`
    *,
    clients (
      id,
      name,
      email,
      phone,
      address,
      city
    )
  `)
  .eq('client_id', clientId)
```

### 5. Updating Client Information

```typescript
// Update client once - affects all linked projects
const { data, error } = await supabase
  .from('clients')
  .update({
    email: "newemail@example.com",
    phone: "242-555-9999"
  })
  .eq('id', clientId)

// All projects linked to this client automatically show updated info
```

---

## Migration Guide

If you have existing projects using the old text-based approach, here's how to migrate:

### Option 1: Migrate All Projects Automatically

```sql
-- This will create clients from project data and link them
SELECT public.convert_project_client_to_linked_client(id)
FROM public.projects
WHERE client_id IS NULL;
```

### Option 2: Migrate Specific Projects

```sql
-- Convert a specific project
SELECT public.convert_project_client_to_linked_client('project-uuid-here');
```

### Option 3: Link to Existing Client

```sql
-- Link project to an existing client
SELECT public.link_project_to_existing_client(
  'project-uuid',
  'client-uuid'
);
```

### View Unlinked Projects

```sql
-- See which projects still need migration
SELECT * FROM public.projects_with_unlinked_clients;
```

---

## UI/UX Recommendations

### Creating a Project Form

```typescript
// Recommended: Client select with search/create
<div>
  <label>Client</label>
  <ClientSelect
    value={selectedClient}
    onChange={setSelectedClient}
    onCreate={handleCreateNewClient}
  />
</div>

// ClientSelect component should:
// 1. Show searchable dropdown of existing clients
// 2. Have "+ Create New Client" button
// 3. Open modal/dialog to create new client
// 4. Auto-fill client_id after selection
```

### Client Autocomplete Example

```typescript
const [clientSearch, setClientSearch] = useState('')
const [clients, setClients] = useState([])

// Debounced search
useEffect(() => {
  const searchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .or(`name.ilike.%${clientSearch}%,email.ilike.%${clientSearch}%`)
      .limit(10)

    setClients(data || [])
  }

  if (clientSearch.length > 2) {
    searchClients()
  }
}, [clientSearch])
```

---

## Database Schema Changes

### New Column
- `projects.client_id` (UUID, nullable) - References `clients.id`

### Backward Compatibility
- Old text fields (`client_name`, `client_email`, `client_phone`) remain but are now optional
- Projects can use **either** `client_id` (new) **or** `client_name` (legacy)
- Check constraint ensures at least one is provided

### Helper Views
- `projects_with_client_info` - Unified view showing all projects with client data
- `projects_with_unlinked_clients` - Shows projects that need migration

### Helper Functions
- `convert_project_client_to_linked_client(project_id)` - Migrates a project to use linked client
- `link_project_to_existing_client(project_id, client_id)` - Links project to existing client

---

## Best Practices

### ✅ Do:
1. **Always search for existing clients first** before creating new ones
2. **Use client_id for new projects** (not text fields)
3. **Validate client data** before insertion
4. **Show user suggestions** when entering client names (to prevent duplicates)
5. **Migrate old projects gradually** as they're edited

### ❌ Don't:
1. **Don't create duplicate clients** - always search first
2. **Don't use client_name for new projects** - use client_id instead
3. **Don't delete clients** that have projects (foreign key prevents this)
4. **Don't skip validation** when users manually type client names

---

## Testing

### Test Case 1: Create New Client + Project
```typescript
test('create project with new client', async () => {
  const client = await createClient({ name: 'Test Client' })
  const project = await createProject({ client_id: client.id })

  expect(project.client_id).toBe(client.id)
})
```

### Test Case 2: Link to Existing Client
```typescript
test('create project with existing client', async () => {
  const existingClient = await getClient('John Smith')
  const project = await createProject({ client_id: existingClient.id })

  const allClientProjects = await getProjectsByClient(existingClient.id)
  expect(allClientProjects).toContain(project.id)
})
```

### Test Case 3: Update Client Info
```typescript
test('updating client reflects in all projects', async () => {
  const client = await createClient({ name: 'Old Name' })
  const project = await createProject({ client_id: client.id })

  await updateClient(client.id, { name: 'New Name' })

  const updatedProject = await getProjectWithClient(project.id)
  expect(updatedProject.client.name).toBe('New Name')
})
```

---

## FAQ

### Q: What happens to existing projects with text-based client data?
**A:** They continue to work! The migration is backward compatible. The old text fields remain, so existing projects won't break. You can migrate them gradually using the helper functions.

### Q: Can I still use client_name instead of client_id?
**A:** Yes, but it's not recommended for new projects. The system supports both for backward compatibility, but you should use `client_id` for all new projects.

### Q: What if I delete a client that has projects?
**A:** The foreign key is set to `ON DELETE SET NULL`, which means if you delete a client, the `client_id` in projects becomes NULL (but the project remains). The old text fields would still show the data if populated.

### Q: How do I prevent duplicate clients?
**A:** Implement client search in your UI before allowing creation. Show existing matches when user types a client name. Consider adding a unique constraint on client name if needed (though names can legitimately repeat).

### Q: Can I link multiple projects to one client?
**A:** Yes! That's the whole point. One client can have many projects. Use the relationship to generate client-level reports showing all their projects.

---

## Summary

**Old Way (Text):**
```sql
INSERT INTO projects (client_name) VALUES ('John Smith');
```

**New Way (Linked):**
```sql
-- Create client
INSERT INTO clients (name) VALUES ('John Smith') RETURNING id;

-- Create project linked to client
INSERT INTO projects (client_id) VALUES ('client-uuid-here');
```

The new approach gives you:
- ✅ Data integrity
- ✅ Single source of truth
- ✅ Easy reporting
- ✅ Proper relationships
- ✅ Scalability

Use `client_id` for all new projects going forward!
