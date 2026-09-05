"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Status, type Tone } from "@/components/ui/status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { MoreHorizontal } from "lucide-react";
import type { Invoice, InvoiceStatus } from "@/types";

type AgingBucket = "all" | "current" | "1-30" | "31-60" | "61-90" | "90+";

const BUCKETS: { key: AgingBucket; label: string; overdue: boolean }[] = [
  { key: "all", label: "All", overdue: false },
  { key: "current", label: "Current", overdue: false },
  { key: "1-30", label: "1–30 Days", overdue: true },
  { key: "31-60", label: "31–60 Days", overdue: true },
  { key: "61-90", label: "61–90 Days", overdue: true },
  { key: "90+", label: "90+ Days", overdue: true },
];

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  sent: "info",
  viewed: "info",
  paid: "success",
  partial: "warning",
  overdue: "danger",
  cancelled: "neutral",
  void: "neutral",
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<AgingBucket>("all");
  const supabase = createClient();
  const { toast } = useToast();
  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (profile && !profile.company_id) {
      setLoading(false);
      return;
    }
    if (profile?.company_id) fetchInvoices();
    else if (profile === null) setLoading(false);
  }, [profile?.company_id, profile, authLoading]);

  const fetchInvoices = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
    if (!isAdmin) {
      toast({
        title: "Permission denied",
        description: "Only administrators and project managers can delete invoices.",
        variant: "destructive",
      });
      return;
    }
    const { data, error } = await supabase.from("invoices").delete().eq("id", id).select();
    if (error || !data?.length) {
      toast({
        title: "Could not delete",
        description: error?.message || "The invoice could not be deleted — check the delete policy for your role.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Invoice deleted", variant: "success" });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  const handleStatusChange = async (id: string, newStatus: InvoiceStatus) => {
    const updateData: Partial<Invoice> = { status: newStatus };
    if (newStatus === "sent") updateData.sent_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(updateData).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...updateData } : i)));
    toast({ title: "Status updated", description: `Invoice marked as ${newStatus}.` });
  };

  const getAgingBucket = (invoice: Invoice): AgingBucket => {
    if (invoice.status === "paid") return "current";
    const daysOverdue = Math.floor(
      (Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysOverdue <= 0) return "current";
    if (daysOverdue <= 30) return "1-30";
    if (daysOverdue <= 60) return "31-60";
    if (daysOverdue <= 90) return "61-90";
    return "90+";
  };

  const isOverdue = (invoice: Invoice) =>
    getAgingBucket(invoice) !== "current" && invoice.status !== "paid";

  const filteredInvoices = invoices.filter((invoice) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(term) ||
      invoice.client_name.toLowerCase().includes(term);
    if (!matchesSearch) return false;
    if (activeTab === "all") return true;
    return getAgingBucket(invoice) === activeTab;
  });

  const stats = [
    { label: "Total Invoices", value: String(invoices.length) },
    {
      label: "Outstanding",
      value: formatCurrency(
        invoices
          .filter((i) => !["paid", "cancelled", "void"].includes(i.status))
          .reduce((sum, i) => sum + i.balance_due, 0)
      ),
      accent: true,
    },
    {
      label: "Overdue",
      value: formatCurrency(invoices.filter(isOverdue).reduce((sum, i) => sum + i.balance_due, 0)),
      danger: invoices.some(isOverdue),
    },
    {
      label: "Collected",
      value: formatCurrency(
        invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.total_amount, 0)
      ),
    },
  ];

  const bucketCount = (key: AgingBucket) =>
    key === "all"
      ? invoices.length
      : key === "current"
        ? invoices.filter((i) => getAgingBucket(i) === "current" || i.status === "paid").length
        : invoices.filter((i) => getAgingBucket(i) === key && i.status !== "paid").length;

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      <Header eyebrow="Billing" title="Invoices">
        <Link
          href="/invoices/new"
          className="text-[12px] font-medium text-brand hover:opacity-80 transition-opacity"
        >
          + New Invoice
        </Link>
      </Header>

      <div className="flex-1 p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

        {/* Search + aging filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search invoices..."
            className="flex-1 min-w-[200px] bg-surface-100 border border-border rounded-md px-3 py-2 text-[13px] text-foreground-light placeholder:text-foreground-lighter outline-none focus:border-strong transition-colors"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {BUCKETS.map((b) => {
              const count = bucketCount(b.key);
              const active = activeTab === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setActiveTab(b.key)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wide transition-colors",
                    active
                      ? "bg-surface-300 text-brand border border-strong"
                      : b.overdue && count > 0
                        ? "text-destructive hover:text-destructive"
                        : "text-foreground-lighter hover:text-foreground-light"
                  )}
                >
                  {b.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

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
          ) : filteredInvoices.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-foreground-lighter">
                {searchTerm || activeTab !== "all"
                  ? "No invoices match your filter"
                  : "No invoices yet"}
              </p>
              <Link
                href="/invoices/new"
                className="inline-block mt-3 text-[12px] text-brand hover:opacity-80"
              >
                Create an invoice →
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Invoice #</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Client</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Issued</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Due</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Amount</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Balance</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-mono uppercase tracking-widest text-foreground-lighter">Status</th>
                  <th className="w-12 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((invoice) => {
                  const overdue = isOverdue(invoice);
                  return (
                    <tr key={invoice.id} className="group hover:bg-surface-200 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-[13px] tabular-nums text-foreground-light group-hover:text-foreground transition-colors"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-foreground-lighter max-w-[220px] truncate">
                        {invoice.client_name}
                      </td>
                      <td className="px-5 py-3 text-[11px] tabular-nums text-foreground-lighter">
                        {formatDate(invoice.issue_date)}
                      </td>
                      <td className="px-5 py-3 text-[11px] tabular-nums">
                        <span className={overdue ? "text-destructive" : "text-foreground-lighter"}>
                          {formatDate(invoice.due_date)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums text-foreground-light">
                        {formatCurrency(invoice.total_amount)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums">
                        {invoice.balance_due > 0 ? (
                          <span className={overdue ? "text-destructive" : "text-foreground-light"}>
                            {formatCurrency(invoice.balance_due)}
                          </span>
                        ) : (
                          <span className="text-foreground-lighter">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Status
                          tone={overdue ? "danger" : STATUS_TONE[invoice.status] ?? "neutral"}
                          label={overdue ? "overdue" : invoice.status}
                          muted={!overdue}
                        />
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
                              <Link href={`/invoices/${invoice.id}`}>View details</Link>
                            </DropdownMenuItem>
                            {invoice.status === "draft" && (
                              <>
                                <DropdownMenuItem asChild className="text-[12px] text-foreground-light">
                                  <Link href={`/invoices/${invoice.id}/edit`}>Edit</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[12px] text-foreground-light"
                                  onClick={() => handleStatusChange(invoice.id, "sent")}
                                >
                                  Mark as sent
                                </DropdownMenuItem>
                              </>
                            )}
                            {invoice.balance_due > 0 && invoice.status !== "draft" && (
                              <DropdownMenuItem asChild className="text-[12px] text-foreground-light">
                                <Link href={`/invoices/${invoice.id}?payment=true`}>Record payment</Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[12px] text-destructive"
                              onClick={() => handleDelete(invoice.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
