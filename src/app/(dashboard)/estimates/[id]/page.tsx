"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  XCircle,
  ArrowRightCircle,
  Mail,
  Phone,
  MapPin,
  FileText,
  Download,
  Loader2,
  Building2,
  Calendar,
  DollarSign,
} from "lucide-react";
import type { Estimate, EstimateLineItem, EstimateStatus } from "@/types";

export default function EstimateDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { toast } = useToast();
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>([]);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [converting, setConverting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({
    to_email: "",
    subject: "",
    message: "",
  });

  useEffect(() => {
    fetchEstimateData();

    // Open convert dialog if query param present
    if (searchParams.get("convert") === "true") {
      setShowConvertDialog(true);
    }
  }, [estimateId]);

  const fetchEstimateData = async () => {
    setLoading(true);
    try {
      const [estimateRes, itemsRes] = await Promise.all([
        supabase.from("estimates").select("*").eq("id", estimateId).single(),
        supabase
          .from("estimate_line_items")
          .select("*")
          .eq("estimate_id", estimateId)
          .order("order_index"),
      ]);

      if (estimateRes.error) throw estimateRes.error;

      setEstimate(estimateRes.data);
      setLineItems(itemsRes.data || []);
      setProjectName(estimateRes.data.title);
    } catch (error) {
      console.error("Error fetching estimate:", error);
      toast({
        title: "Error",
        description: "Failed to load estimate data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: EstimateStatus) => {
    try {
      const updateData: Partial<Estimate> = { status: newStatus };

      if (newStatus === "sent") updateData.sent_at = new Date().toISOString();
      if (newStatus === "approved") updateData.approved_at = new Date().toISOString();
      if (newStatus === "rejected") updateData.rejected_at = new Date().toISOString();

      const { error } = await supabase
        .from("estimates")
        .update(updateData)
        .eq("id", estimateId);

      if (error) throw error;

      setEstimate({ ...estimate!, ...updateData });
      toast({
        title: "Status updated",
        description: `Estimate marked as ${newStatus}.`,
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = async () => {
    if (!emailForm.to_email) {
      toast({
        title: "Error",
        description: "Email address is required",
        variant: "destructive",
      });
      return;
    }

    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-estimate", {
        body: {
          estimate_id: estimateId,
          to_email: emailForm.to_email,
          subject: emailForm.subject || undefined,
          message: emailForm.message || undefined,
        },
      });

      if (error) throw error;

      toast({
        title: "Email sent",
        description: `Estimate sent to ${emailForm.to_email}`,
      });

      setShowEmailDialog(false);
      setEstimate({ ...estimate!, status: "sent", sent_at: new Date().toISOString() });
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleConvertToProject = async () => {
    if (!projectName || !projectLocation) {
      toast({
        title: "Error",
        description: "Project name and location are required",
        variant: "destructive",
      });
      return;
    }

    setConverting(true);
    try {
      // Create project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          name: projectName,
          description: estimate?.description || null,
          client_name: estimate?.client_name || "",
          client_email: estimate?.client_email || null,
          client_phone: estimate?.client_phone || null,
          location: projectLocation,
          status: "planning",
          start_date: new Date().toISOString().split("T")[0],
          budget: estimate?.total_amount || 0,
          contract_value: estimate?.total_amount || 0,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Update estimate with project reference
      const { error: updateError } = await supabase
        .from("estimates")
        .update({
          project_id: project.id,
          status: "converted",
          converted_at: new Date().toISOString(),
        })
        .eq("id", estimateId);

      if (updateError) throw updateError;

      toast({
        title: "Project created",
        description: `Estimate converted to project "${project.name}".`,
      });

      router.push(`/projects/${project.id}`);
    } catch (error: any) {
      console.error("Error converting to project:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this estimate?")) return;

    try {
      const { error } = await supabase.from("estimates").delete().eq("id", estimateId);
      if (error) throw error;

      toast({
        title: "Estimate deleted",
        description: "The estimate has been removed.",
      });
      router.push("/estimates");
    } catch (error: any) {
      console.error("Error deleting estimate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete estimate",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "converted":
        return "bg-purple-100 text-purple-800";
      case "expired":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Estimate Details" description="Loading...">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Estimate Not Found" description="The requested estimate could not be found">
          <Button variant="outline" onClick={() => router.push("/estimates")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Estimates
          </Button>
        </Header>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={`Estimate ${estimate.estimate_number}`}
        description={estimate.title}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/estimates")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Link href={`/estimates/${estimateId}/preview`}>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Preview PDF
            </Button>
          </Link>
          {estimate.status === "draft" && (
            <>
              <Link href={`/estimates/${estimateId}/edit`}>
                <Button variant="outline">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Button
                onClick={() => {
                  setEmailForm({
                    to_email: estimate.client_email || "",
                    subject: `Estimate ${estimate.estimate_number} from TropiTech Solutions`,
                    message: "",
                  });
                  setShowEmailDialog(true);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
            </>
          )}
          {estimate.status === "sent" && (
            <>
              <Button
                variant="outline"
                className="text-green-600"
                onClick={() => handleStatusChange("approved")}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                variant="outline"
                className="text-red-600"
                onClick={() => handleStatusChange("rejected")}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </>
          )}
          {estimate.status === "approved" && !estimate.project_id && (
            <Button onClick={() => setShowConvertDialog(true)}>
              <ArrowRightCircle className="h-4 w-4 mr-2" />
              Convert to Project
            </Button>
          )}
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Status Banner */}
        <Card
          className={
            estimate.status === "approved"
              ? "border-green-200 bg-green-50"
              : estimate.status === "rejected"
              ? "border-red-200 bg-red-50"
              : estimate.status === "converted"
              ? "border-purple-200 bg-purple-50"
              : ""
          }
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge className={`${getStatusColor(estimate.status)} text-sm px-3 py-1`}>
                  {estimate.status.toUpperCase()}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Created on {formatDate(estimate.created_at)}
                </span>
              </div>
              {estimate.project_id && (
                <Link href={`/projects/${estimate.project_id}`}>
                  <Button variant="link" className="text-purple-600">
                    <Building2 className="h-4 w-4 mr-2" />
                    View Project
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Client & Estimate Info */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="font-medium text-lg">{estimate.client_name}</div>
              {estimate.client_email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${estimate.client_email}`} className="hover:text-primary">
                    {estimate.client_email}
                  </a>
                </div>
              )}
              {estimate.client_phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${estimate.client_phone}`} className="hover:text-primary">
                    {estimate.client_phone}
                  </a>
                </div>
              )}
              {estimate.client_address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {estimate.client_address}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estimate Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(estimate.subtotal)}</span>
              </div>
              {estimate.overhead_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Overhead ({estimate.overhead_markup_percent}%)
                  </span>
                  <span>{formatCurrency(estimate.overhead_amount)}</span>
                </div>
              )}
              {estimate.profit_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Profit ({estimate.profit_margin_percent}%)
                  </span>
                  <span>{formatCurrency(estimate.profit_amount)}</span>
                </div>
              )}
              {estimate.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({estimate.tax_rate}%)</span>
                  <span>{formatCurrency(estimate.tax_amount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatCurrency(estimate.total_amount)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>{lineItems.length} items</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[40%]">Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell>{item.unit || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_rate)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Terms & Notes */}
        {(estimate.terms_and_conditions || estimate.description) && (
          <Card>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {estimate.description && (
                <div>
                  <h4 className="font-medium mb-2">Project Description</h4>
                  <p className="text-muted-foreground">{estimate.description}</p>
                </div>
              )}
              {estimate.terms_and_conditions && (
                <div>
                  <h4 className="font-medium mb-2">Terms</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {estimate.terms_and_conditions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Estimate
          </Button>
        </div>
      </div>

      {/* Convert to Project Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Project</DialogTitle>
            <DialogDescription>
              Create a new project from this estimate. The estimate will be linked to the project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project_name">Project Name *</Label>
              <Input
                id="project_name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project_location">Project Location *</Label>
              <Input
                id="project_location"
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
                placeholder="Enter project location"
              />
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground mb-2">Project Details</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Client:</span>
                  <span className="font-medium">{estimate?.client_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Budget:</span>
                  <span className="font-medium">{formatCurrency(estimate?.total_amount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contract Value:</span>
                  <span className="font-medium">{formatCurrency(estimate?.total_amount || 0)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToProject} disabled={converting}>
              {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ArrowRightCircle className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Estimate via Email</DialogTitle>
            <DialogDescription>
              Send this estimate to {estimate?.client_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="to_email">Recipient Email *</Label>
              <Input
                id="to_email"
                type="email"
                value={emailForm.to_email}
                onChange={(e) => setEmailForm({ ...emailForm, to_email: e.target.value })}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_subject">Subject</Label>
              <Input
                id="email_subject"
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                placeholder="Estimate from TropiTech Solutions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_message">Message (optional)</Label>
              <Textarea
                id="email_message"
                value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                placeholder="Add a personal message..."
                rows={3}
              />
            </div>
            <div className="p-3 bg-muted rounded-lg flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                PDF estimate will be attached to the email
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail}>
              {sendingEmail && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
