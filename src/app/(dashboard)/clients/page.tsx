"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Status } from "@/components/ui/status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, MoreHorizontal, Phone } from "lucide-react";
import type { Client, ClientBalance } from "@/types";

const inputClass =
  "w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-brand transition-colors";
const labelClass = "text-[10px] font-mono text-foreground-lighter uppercase tracking-widest";

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    tax_id: "",
    notes: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) {
      setLoading(false);
      return;
    }
    if (profile?.company_id) fetchClients();
    else if (profile === null) setLoading(false);
  }, [profile?.company_id, profile, authLoading]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      if (!profile?.company_id) {
        setClients([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("client_balances")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name");
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
      // The balances view may not exist — fall back to the raw clients table.
      if (!profile?.company_id) {
        setClients([]);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("clients")
          .select("*")
          .eq("company_id", profile.company_id)
          .order("name");
        if (error) throw error;
        setClients(
          (data || []).map((c) => ({
            client_id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            total_invoiced: 0,
            total_paid: 0,
            total_outstanding: 0,
            overdue_invoices: 0,
            open_invoices: 0,
          }))
        );
      } catch (fallbackError) {
        console.error("Error in fallback fetch:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", address: "", city: "", tax_id: "", notes: "" });
    setEditingClient(null);
  };

  const openEditDialog = async (clientId: string) => {
    const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).single();
    if (error) {
      toast({ title: "Error", description: "Failed to load client details", variant: "destructive" });
      return;
    }
    setEditingClient(data);
    setFormData({
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      address: data.address || "",
      city: data.city || "",
      tax_id: data.tax_id || "",
      notes: data.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
        tax_id: formData.tax_id || null,
        notes: formData.notes || null,
      };

      if (editingClient) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editingClient.id);
        if (error) throw error;
        toast({ title: "Client updated" });
      } else {
        if (!profile?.company_id) {
          toast({
            title: "Error",
            description: "You're not associated with a company yet.",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("clients")
          .insert({ company_id: profile.company_id, ...payload });
        if (error) throw error;
        toast({ title: "Client created" });
      }
      setDialogOpen(false);
      resetForm();
      fetchClients();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save client", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Client deleted" });
    setClients((prev) => prev.filter((c) => c.client_id !== clientId));
  };

  const filteredClients = clients.filter((client) => {
    const term = searchTerm.toLowerCase();
    return (
      client.name.toLowerCase().includes(term) ||
      (client.email || "").toLowerCase().includes(term) ||
      (client.phone || "").includes(searchTerm)
    );
  });

  const stats = [
    { label: "Total Clients", value: String(clients.length) },
    {
      label: "Total Outstanding",
      value: formatCurrency(clients.reduce((sum, c) => sum + (c.total_outstanding || 0), 0)),
      accent: true,
    },
    {
      label: "Clients With Overdue",
      value: String(clients.filter((c) => c.overdue_invoices > 0).length),
      danger: clients.some((c) => c.overdue_invoices > 0),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <Header eyebrow="Billing" title="Clients">
        <button
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="text-[12px] font-medium text-brand hover:opacity-80 transition-opacity"
        >
          + New Client
        </button>
      </Header>

      <div className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-surface-100 px-4 py-3.5">
              <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">
                {s.label}
              </p>
              <p
                className={cn(
                  "text-[22px] font-semibold tabular-nums mt-1 leading-none",
                  s.danger ? "text-destructive" : s.accent ? "text-brand" : "text-foreground"
                )}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Search */}
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search clients by name, email, or phone..."
          className="w-full bg-surface-100 border border-border rounded-md px-3 py-2 text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
        />

        {/* Table */}
        <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {Array(6)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="h-[52px] animate-pulse" />
                ))}
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-foreground-lighter">
                {searchTerm ? "No clients match your search" : "No clients yet"}
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
                className="inline-block mt-3 text-[12px] text-brand hover:opacity-80"
              >
                Add a client →
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Client</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Contact</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Invoiced</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Outstanding</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Status</th>
                  <th className="w-12 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredClients.map((client) => (
                  <tr key={client.client_id} className="group hover:bg-surface-200 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/clients/${client.client_id}`}
                        className="text-[13px] text-foreground-light group-hover:text-foreground transition-colors"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-0.5">
                        {client.email && (
                          <div className="flex items-center gap-1.5 text-[11px] text-foreground-lighter">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate max-w-[260px]">{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-foreground-lighter">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            {client.phone}
                          </div>
                        )}
                        {!client.email && !client.phone && (
                          <span className="text-[11px] text-foreground-lighter">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                      {formatCurrency(client.total_invoiced)}
                    </td>
                    <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                      {client.total_outstanding > 0 ? (
                        <span className="text-foreground-light">
                          {formatCurrency(client.total_outstanding)}
                        </span>
                      ) : (
                        <span className="text-foreground-lighter">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {client.overdue_invoices > 0 ? (
                        <Status tone="danger" label={`${client.overdue_invoices} overdue`} />
                      ) : client.open_invoices > 0 ? (
                        <Status tone="info" label={`${client.open_invoices} open`} muted />
                      ) : (
                        <Status tone="success" label="paid up" muted />
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-foreground-lighter hover:text-foreground-light transition-colors opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-surface-100 border-strong">
                          <DropdownMenuItem asChild className="text-[12px] text-foreground-light">
                            <Link href={`/clients/${client.client_id}`}>View details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-[12px] text-foreground-light"
                            onClick={() => openEditDialog(client.client_id)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-[12px] text-destructive"
                            onClick={() => handleDelete(client.client_id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Client form */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-lg bg-surface-100 border-border text-foreground">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-foreground text-[15px]">
                {editingClient ? "Edit client" : "New client"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div className="space-y-1">
                <p className={labelClass}>Client name *</p>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Client or company name"
                  required
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className={labelClass}>Email</p>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="client@example.com"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <p className={labelClass}>Phone</p>
                  <input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(242) 555-0100"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className={labelClass}>Address</p>
                <input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className={labelClass}>City</p>
                  <input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Nassau"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <p className={labelClass}>Tax ID / TIN</p>
                  <input
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="Tax identification number"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className={labelClass}>Notes</p>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this client..."
                  className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-brand transition-colors resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !formData.name}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingClient ? "Update client" : "Add client"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
