"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Loader2,
  Wallet,
  CreditCard,
  Smartphone,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import type { PaymentInstructionsFormData } from "@/types";
import { formatCurrency } from "@/lib/utils";

export default function PaymentInstructionsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const [formData, setFormData] = useState<PaymentInstructionsFormData>({
    payment_bank_name: "",
    payment_account_name: "",
    payment_account_number: "",
    payment_routing_number: "",
    payment_swift_code: "",
    payment_mobile_money: "",
    payment_instructions: "",
    payment_notes: "",
  });

  useEffect(() => {
    if (profile?.company_id) {
      fetchPaymentInstructions();
    } else {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const fetchPaymentInstructions = async () => {
    if (!profile?.company_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("payment_bank_name, payment_account_name, payment_account_number, payment_routing_number, payment_swift_code, payment_mobile_money, payment_instructions, payment_notes")
        .eq("id", profile.company_id)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          payment_bank_name: data.payment_bank_name || "",
          payment_account_name: data.payment_account_name || "",
          payment_account_number: data.payment_account_number || "",
          payment_routing_number: data.payment_routing_number || "",
          payment_swift_code: data.payment_swift_code || "",
          payment_mobile_money: data.payment_mobile_money || "",
          payment_instructions: data.payment_instructions || "",
          payment_notes: data.payment_notes || "",
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          payment_bank_name: formData.payment_bank_name || null,
          payment_account_name: formData.payment_account_name || null,
          payment_account_number: formData.payment_account_number || null,
          payment_routing_number: formData.payment_routing_number || null,
          payment_swift_code: formData.payment_swift_code || null,
          payment_mobile_money: formData.payment_mobile_money || null,
          payment_instructions: formData.payment_instructions || null,
          payment_notes: formData.payment_notes || null,
        })
        .eq("id", profile.company_id);

      if (error) throw error;

      toast({
        title: "Payment instructions saved",
        description: "Your payment details have been updated successfully.",
        variant: "success",
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchPaymentInstructions();
  };

  const hasAnyPaymentInfo =
    formData.payment_bank_name ||
    formData.payment_account_name ||
    formData.payment_account_number ||
    formData.payment_mobile_money ||
    formData.payment_instructions;

  if (!profile?.company_id) {
    return (
      <div className="flex flex-col h-full overflow-auto bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
            <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Payment Instructions</h1>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-200 hover:border-strong text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Settings
          </button>
        </div>
        <div className="flex-1 p-6">
          <div className="bg-destructive-subtle border border-destructive-border rounded-lg p-4 flex gap-3 text-[12px] text-destructive">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>You need to be part of a company to manage payment instructions.</div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
            <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Payment Instructions</h1>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-200 hover:border-strong text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Settings
          </button>
        </div>
        <div className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Payment Instructions</h1>
        </div>
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </button>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="bg-info-subtle border border-info-border rounded-lg p-4 flex gap-3 text-[12px] text-info">
            <AlertCircle className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
            <div>These payment details will appear on all invoices. All fields are optional.</div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Bank Transfer Details */}
            <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Bank Transfer Details
                </h2>
                <p className="text-[11px] text-foreground-lighter mt-1">Bank account information for receiving customer payments</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="bank_name" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Bank Name</label>
                  <input
                    id="bank_name"
                    placeholder="First Caribbean International Bank"
                    value={formData.payment_bank_name}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_bank_name: e.target.value })
                    }
                    disabled={saving}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="account_name" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Account Name</label>
                  <input
                    id="account_name"
                    placeholder="TropiTech Solutions"
                    value={formData.payment_account_name}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_account_name: e.target.value })
                    }
                    disabled={saving}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="account_number" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Account Number</label>
                <input
                  id="account_number"
                  placeholder="XXXX-XXXX-XXXX"
                  value={formData.payment_account_number}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_account_number: e.target.value })
                  }
                  disabled={saving}
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="routing_number" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">
                    Routing/Transit Number <span className="text-foreground-lighter font-normal font-sans">(Optional)</span>
                  </label>
                  <input
                    id="routing_number"
                    placeholder="123456789"
                    value={formData.payment_routing_number}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_routing_number: e.target.value })
                    }
                    disabled={saving}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="swift_code" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">
                    SWIFT/BIC Code <span className="text-foreground-lighter font-normal font-sans">(Optional)</span>
                  </label>
                  <input
                    id="swift_code"
                    placeholder="FCIBBS12"
                    value={formData.payment_swift_code}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_swift_code: e.target.value })
                    }
                    disabled={saving}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50"
                  />
                  <p className="text-[10px] text-foreground-lighter tabular-nums">For international wire transfers</p>
                </div>
              </div>
            </div>

            {/* Mobile Payment */}
            <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  Mobile Payment <span className="text-foreground-lighter font-normal font-sans uppercase tracking-normal"> (Optional)</span>
                </h2>
                <p className="text-[11px] text-foreground-lighter mt-1">Mobile money or digital wallet information</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="mobile_money" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Mobile Money/Digital Wallet</label>
                <input
                  id="mobile_money"
                  placeholder="242-555-0123"
                  value={formData.payment_mobile_money}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_mobile_money: e.target.value })
                  }
                  disabled={saving}
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50"
                />
                <p className="text-[10px] text-foreground-lighter tabular-nums">e.g., Island Pay, mobile banking number, or digital wallet ID</p>
              </div>
            </div>

            {/* Additional Instructions */}
            <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Additional Instructions <span className="text-foreground-lighter font-normal font-sans uppercase tracking-normal"> (Optional)</span>
                </h2>
                <p className="text-[11px] text-foreground-lighter mt-1">Custom payment instructions or notes for customers</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="instructions" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Payment Instructions</label>
                  <textarea
                    id="instructions"
                    placeholder="Please include invoice number in payment reference. Payment due within 30 days."
                    value={formData.payment_instructions}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_instructions: e.target.value })
                    }
                    disabled={saving}
                    rows={4}
                    className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50 resize-y"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="notes" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Internal Notes</label>
                  <textarea
                    id="notes"
                    placeholder="Internal notes (not shown on invoices)"
                    value={formData.payment_notes}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_notes: e.target.value })
                    }
                    disabled={saving}
                    rows={3}
                    className="w-full px-2.5 py-2 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter disabled:opacity-50 resize-y"
                  />
                  <p className="text-[10px] text-foreground-lighter tabular-nums">These notes are for internal use only and will not appear on invoices</p>
                </div>
              </div>
            </div>

            {/* Preview Section */}
            {showPreview && (
              <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      Preview on Invoice
                    </h2>
                    <p className="text-[11px] text-foreground-lighter mt-1">How payment instructions will appear to customers</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className="flex items-center gap-1 text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                  >
                    <EyeOff className="h-3 w-3" /> Hide Preview
                  </button>
                </div>

                <div className="border border-dashed border-border rounded-lg p-5 bg-background space-y-3">
                  {hasAnyPaymentInfo ? (
                    <div className="space-y-3 text-[13px] text-foreground-light">
                      <h4 className="font-semibold text-[14px] text-foreground font-mono uppercase tracking-wider">Payment Instructions</h4>
                      <p>Please make payment to:</p>

                      {formData.payment_bank_name && (
                        <div className="space-y-1 bg-surface-100 p-3 rounded-md border border-border tabular-nums text-[12px] text-foreground-light">
                          <p><strong className="text-foreground">Bank:</strong> {formData.payment_bank_name}</p>
                          {formData.payment_account_name && (
                            <p><strong className="text-foreground">Account Name:</strong> {formData.payment_account_name}</p>
                          )}
                          {formData.payment_account_number && (
                            <p><strong className="text-foreground">Account Number:</strong> {formData.payment_account_number}</p>
                          )}
                          {formData.payment_routing_number && (
                            <p><strong className="text-foreground">Routing Number:</strong> {formData.payment_routing_number}</p>
                          )}
                          {formData.payment_swift_code && (
                            <p><strong className="text-foreground">SWIFT Code:</strong> {formData.payment_swift_code}</p>
                          )}
                        </div>
                      )}

                      {formData.payment_mobile_money && (
                        <p className="bg-surface-100 p-3 rounded-md border border-border tabular-nums text-[12px] text-foreground-light">
                          <strong className="text-foreground">Or via Mobile Payment:</strong> {formData.payment_mobile_money}
                        </p>
                      )}

                      {formData.payment_instructions && (
                        <div className="border-t border-border pt-3 text-[12px] text-foreground-lighter italic">
                          {formData.payment_instructions}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-foreground-lighter text-[12px]">
                      <p>No payment instructions configured yet.</p>
                      <p className="text-[10px] mt-1 tabular-nums">Fill in the form above to see a preview.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!showPreview && (
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-[11px] font-mono uppercase tracking-wider text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Show Preview
              </button>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-[12px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                Save Payment Instructions
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
