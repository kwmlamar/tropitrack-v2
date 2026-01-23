"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PaymentInstructionsFormData } from "@/types";

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
      <div className="flex flex-col min-h-screen">
        <Header title="Payment Instructions" description="Configure payment details">
          <Button variant="outline" onClick={() => router.push("/settings")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
        </Header>
        <div className="flex-1 p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You need to be part of a company to manage payment instructions.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Payment Instructions" description="Loading...">
          <Button variant="outline" onClick={() => router.push("/settings")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Payment Instructions"
        description="Configure how customers should pay you"
      >
        <Button variant="outline" onClick={() => router.push("/settings")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settings
        </Button>
      </Header>

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Alert className="bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-900 dark:text-blue-100">
              These payment details will appear on all invoices. All fields are optional.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Bank Transfer Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Bank Transfer Details
                </CardTitle>
                <CardDescription>
                  Bank account information for receiving customer payments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <Input
                      id="bank_name"
                      placeholder="First Caribbean International Bank"
                      value={formData.payment_bank_name}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_bank_name: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_name">Account Name</Label>
                    <Input
                      id="account_name"
                      placeholder="TropiTech Solutions"
                      value={formData.payment_account_name}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_account_name: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account_number">Account Number</Label>
                  <Input
                    id="account_number"
                    placeholder="XXXX-XXXX-XXXX"
                    value={formData.payment_account_number}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_account_number: e.target.value })
                    }
                    disabled={saving}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="routing_number">
                      Routing/Transit Number <span className="text-muted-foreground">(Optional)</span>
                    </Label>
                    <Input
                      id="routing_number"
                      placeholder="123456789"
                      value={formData.payment_routing_number}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_routing_number: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="swift_code">
                      SWIFT/BIC Code <span className="text-muted-foreground">(Optional)</span>
                    </Label>
                    <Input
                      id="swift_code"
                      placeholder="FCIBBS12"
                      value={formData.payment_swift_code}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_swift_code: e.target.value })
                      }
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      For international wire transfers
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Payment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Mobile Payment <span className="text-sm text-muted-foreground font-normal">(Optional)</span>
                </CardTitle>
                <CardDescription>
                  Mobile money or digital wallet information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mobile_money">Mobile Money/Digital Wallet</Label>
                  <Input
                    id="mobile_money"
                    placeholder="242-555-0123"
                    value={formData.payment_mobile_money}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_mobile_money: e.target.value })
                    }
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g., Island Pay, mobile banking number, or digital wallet ID
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Additional Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Additional Instructions <span className="text-sm text-muted-foreground font-normal">(Optional)</span>
                </CardTitle>
                <CardDescription>
                  Custom payment instructions or notes for customers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="instructions">Payment Instructions</Label>
                  <Textarea
                    id="instructions"
                    placeholder="Please include invoice number in payment reference. Payment due within 30 days."
                    value={formData.payment_instructions}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_instructions: e.target.value })
                    }
                    disabled={saving}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Internal Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Internal notes (not shown on invoices)"
                    value={formData.payment_notes}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_notes: e.target.value })
                    }
                    disabled={saving}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    These notes are for internal use only and will not appear on invoices
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Preview Section */}
            {showPreview && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        Preview on Invoice
                      </CardTitle>
                      <CardDescription>
                        How payment instructions will appear to customers
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview(false)}
                    >
                      Hide Preview
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed rounded-lg p-6 bg-muted/50">
                    {hasAnyPaymentInfo ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-lg">Payment Instructions</h4>
                        <p className="text-sm">Please make payment to:</p>

                        {formData.payment_bank_name && (
                          <div className="space-y-1 text-sm">
                            <p><strong>Bank:</strong> {formData.payment_bank_name}</p>
                            {formData.payment_account_name && (
                              <p><strong>Account Name:</strong> {formData.payment_account_name}</p>
                            )}
                            {formData.payment_account_number && (
                              <p><strong>Account Number:</strong> {formData.payment_account_number}</p>
                            )}
                            {formData.payment_routing_number && (
                              <p><strong>Routing Number:</strong> {formData.payment_routing_number}</p>
                            )}
                            {formData.payment_swift_code && (
                              <p><strong>SWIFT Code:</strong> {formData.payment_swift_code}</p>
                            )}
                          </div>
                        )}

                        {formData.payment_mobile_money && (
                          <p className="text-sm">
                            <strong>Or via Mobile Payment:</strong> {formData.payment_mobile_money}
                          </p>
                        )}

                        {formData.payment_instructions && (
                          <p className="text-sm mt-4 pt-4 border-t">
                            {formData.payment_instructions}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No payment instructions configured yet.</p>
                        <p className="text-sm mt-2">
                          Fill in the form above to see a preview.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {!showPreview && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPreview(true)}
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                Show Preview
              </Button>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={saving}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="flex-1"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Payment Instructions
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
