"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Building2,
  FileText,
  Receipt,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
} from "lucide-react";
import type { Client, Estimate, Invoice, Project } from "@/types";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [balance, setBalance] = useState({
    total_invoiced: 0,
    total_paid: 0,
    total_outstanding: 0,
  });

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    setLoading(true);
    try {
      // Fetch client
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (clientError) throw clientError;
      setClient(clientData);

      // Fetch estimates
      const { data: estimatesData } = await supabase
        .from("estimates")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      setEstimates(estimatesData || []);

      // Fetch invoices
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      setInvoices(invoicesData || []);

      // Calculate balance
      if (invoicesData) {
        const totals = invoicesData.reduce(
          (acc, inv) => ({
            total_invoiced: acc.total_invoiced + (inv.total_amount || 0),
            total_paid: acc.total_paid + (inv.amount_paid || 0),
            total_outstanding: acc.total_outstanding + (inv.balance_due || 0),
          }),
          { total_invoiced: 0, total_paid: 0, total_outstanding: 0 }
        );
        setBalance(totals);
      }

      // Fetch projects where client name matches
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .eq("client_name", clientData.name)
        .order("created_at", { ascending: false });

      setProjects(projectsData || []);
    } catch (error) {
      console.error("Error fetching client data:", error);
      toast({
        title: "Error",
        description: "Failed to load client data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this client? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;

      toast({
        title: "Client deleted",
        description: "Client has been removed successfully.",
      });
      router.push("/clients");
    } catch (error: any) {
      console.error("Error deleting client:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete client",
        variant: "destructive",
      });
    }
  };

  const getEstimateStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
      case "sent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "converted":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "expired":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
    }
  };

  const getInvoiceStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
      case "sent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "viewed":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
      case "paid":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "partial":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "overdue":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "cancelled":
      case "void":
        return "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Client Details" description="Loading...">
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

  if (!client) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Client Not Found" description="The requested client could not be found">
          <Button variant="outline" onClick={() => router.push("/clients")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
        </Header>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header title={client.name} description="Client details and history">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/clients")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Client Info and Balance Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Client Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Client Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {client.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${client.email}`} className="hover:text-primary">
                      {client.email}
                    </a>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${client.phone}`} className="hover:text-primary">
                      {client.phone}
                    </a>
                  </div>
                )}
                {(client.address || client.city) && (
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span>
                      {client.address}
                      {client.address && client.city && ", "}
                      {client.city}
                    </span>
                  </div>
                )}
              </div>
              {client.tax_id && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground">Tax ID / TIN: </span>
                    <span className="font-medium">{client.tax_id}</span>
                  </div>
                </>
              )}
              {client.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p>{client.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Balance Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Account Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Invoiced</span>
                  <span className="font-medium">{formatCurrency(balance.total_invoiced)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(balance.total_paid)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-medium">Outstanding Balance</span>
                  <span
                    className={`font-bold text-lg ${
                      balance.total_outstanding > 0 ? "text-amber-600" : "text-green-600"
                    }`}
                  >
                    {formatCurrency(balance.total_outstanding)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Estimates, Invoices, Projects */}
        <Card>
          <Tabs defaultValue="invoices">
            <CardHeader>
              <TabsList>
                <TabsTrigger value="invoices" className="gap-2">
                  <Receipt className="h-4 w-4" />
                  Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="estimates" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Estimates ({estimates.length})
                </TabsTrigger>
                <TabsTrigger value="projects" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Projects ({projects.length})
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              {/* Invoices Tab */}
              <TabsContent value="invoices" className="m-0">
                {invoices.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {invoice.invoice_number}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                          <TableCell>{formatDate(invoice.due_date)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(invoice.total_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(invoice.balance_due)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getInvoiceStatusColor(invoice.status)}>
                              {invoice.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center">
                    <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No invoices yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Create an invoice for this client
                    </p>
                    <Link href="/invoices/new">
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Invoice
                      </Button>
                    </Link>
                  </div>
                )}
              </TabsContent>

              {/* Estimates Tab */}
              <TabsContent value="estimates" className="m-0">
                {estimates.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estimate #</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estimates.map((estimate) => (
                        <TableRow key={estimate.id}>
                          <TableCell>
                            <Link
                              href={`/estimates/${estimate.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {estimate.estimate_number}
                            </Link>
                          </TableCell>
                          <TableCell>{estimate.title}</TableCell>
                          <TableCell>{formatDate(estimate.issue_date)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(estimate.total_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge className={getEstimateStatusColor(estimate.status)}>
                              {estimate.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No estimates yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Create an estimate for this client
                    </p>
                    <Link href="/estimates/new">
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Estimate
                      </Button>
                    </Link>
                  </div>
                )}
              </TabsContent>

              {/* Projects Tab */}
              <TabsContent value="projects" className="m-0">
                {projects.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project Name</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead className="text-right">Contract Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell>
                            <Link
                              href={`/projects/${project.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {project.name}
                            </Link>
                          </TableCell>
                          <TableCell>{project.location}</TableCell>
                          <TableCell>{formatDate(project.start_date)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(project.contract_value)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                project.status === "completed"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                  : project.status === "active"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                  : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"
                              }
                            >
                              {project.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                    <p className="text-muted-foreground">
                      Projects for this client will appear here
                    </p>
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
