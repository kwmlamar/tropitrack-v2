"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createWorker, Worker } from "tesseract.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  FileText,
  Loader2,
  X,
  Check,
  Trash2,
  Plus,
  AlertCircle,
  Sparkles,
  Store,
  Receipt,
  Package,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  PackagePlus,
  CheckCircle2,
  CircleDot,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import type {
  EnhancedParsedReceipt,
  EnhancedParsedLineItem,
  Vendor,
  MaterialCategory,
} from "@/types";

interface SimpleProject {
  id: string;
  name: string;
  status?: string;
}

interface EnhancedReceiptScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (purchaseOrderId: string) => void;
  vendors: Vendor[];
  projects?: SimpleProject[];
}

type ScanStatus =
  | "idle"
  | "loading"
  | "ocr_processing"
  | "ai_processing"
  | "complete"
  | "error";

interface MaterialMatchInfo {
  existing: {
    id: string;
    name: string;
    last_purchase_price: number | null;
    average_price: number | null;
  } | null;
  confidence: "high" | "medium" | "new";
  price_change?: {
    previous: number;
    current: number;
    percentage: number;
  };
}

interface EditableLineItem extends EnhancedParsedLineItem {
  material_id?: string;
  create_material: boolean;
  material_category: MaterialCategory;
  material_unit: string;
  material_match?: MaterialMatchInfo;
}

const MATERIAL_CATEGORIES: { value: MaterialCategory; label: string }[] = [
  { value: "lumber", label: "Lumber" },
  { value: "concrete", label: "Concrete" },
  { value: "steel", label: "Steel" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "finishing", label: "Finishing" },
  { value: "hardware", label: "Hardware" },
  { value: "tools", label: "Tools" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];

export function EnhancedReceiptScannerDialog({
  open,
  onOpenChange,
  onComplete,
  vendors,
  projects = [],
}: EnhancedReceiptScannerDialogProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const supabase = createClient();

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Parsed data state
  const [parsedReceipt, setParsedReceipt] = useState<EnhancedParsedReceipt | null>(null);

  // Editable fields
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [createNewVendor, setCreateNewVendor] = useState(false);
  const [newVendorAddress, setNewVendorAddress] = useState("");
  const [newVendorPhone, setNewVendorPhone] = useState("");
  const [newVendorTin, setNewVendorTin] = useState("");

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [projectId, setProjectId] = useState("");

  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountLabel, setDiscountLabel] = useState("");
  const [subtotalAfterDiscount, setSubtotalAfterDiscount] = useState(0);
  const [vatRate, setVatRate] = useState(0.1);
  const [vatAmount, setVatAmount] = useState(0);
  const [total, setTotal] = useState(0);

  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Initialize Tesseract worker
  useEffect(() => {
    const initWorker = async () => {
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 50)); // OCR is 0-50%
            setProgressMessage("Extracting text...");
          }
        },
      });
      workerRef.current = worker;
    };

    initWorker();

    return () => {
      workerRef.current?.terminate();
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setStatus("idle");
    setProgress(0);
    setProgressMessage("");
    setErrorMessage("");
    setImagePreview(null);
    setImageFile(null);
    setParsedReceipt(null);
    setVendorId("");
    setVendorName("");
    setCreateNewVendor(false);
    setNewVendorAddress("");
    setNewVendorPhone("");
    setNewVendorTin("");
    setInvoiceNumber("");
    setReceiptDate("");
    setProjectId("");
    setLineItems([]);
    setSubtotal(0);
    setDiscountAmount(0);
    setDiscountLabel("");
    setSubtotalAfterDiscount(0);
    setVatAmount(0);
    setTotal(0);
    setExpandedItems(new Set());
    stopCamera();
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select an image file");
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraStream(stream);
      setCameraActive(true);
    } catch (error) {
      console.error("Error accessing camera:", error);
      setErrorMessage("Could not access camera. Please check permissions.");
    }
  };

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], "receipt-capture.jpg", {
            type: "image/jpeg",
          });
          setImageFile(file);
          setImagePreview(canvas.toDataURL("image/jpeg", 0.9));
          stopCamera();
        }
      },
      "image/jpeg",
      0.9
    );
  }, [cameraStream]);

  const processImage = async () => {
    if (!imagePreview || !workerRef.current) {
      setErrorMessage("No image to process");
      return;
    }

    setStatus("ocr_processing");
    setProgress(0);
    setProgressMessage("Initializing OCR...");

    try {
      // Step 1: OCR extraction
      const {
        data: { text },
      } = await workerRef.current.recognize(imagePreview);

      if (!text.trim()) {
        setErrorMessage(
          "Could not extract text from image. Please try a clearer image."
        );
        setStatus("error");
        return;
      }

      // Step 2: AI processing
      setStatus("ai_processing");
      setProgress(50);
      setProgressMessage("Analyzing receipt with AI...");

      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("/api/receipts/scan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: (() => {
          const formData = new FormData();
          formData.append("ocr_text", text);
          return formData;
        })(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process receipt");
      }

      const data = await response.json();
      setProgress(100);

      // Populate form with parsed data
      const receipt = data.receipt as EnhancedParsedReceipt;
      setParsedReceipt(receipt);

      // Match vendor
      if (data.vendor?.id && !data.vendor.isNew) {
        setVendorId(data.vendor.id);
        setVendorName(data.vendor.name);
        setCreateNewVendor(false);
      } else {
        setVendorName(receipt.vendor.name);
        setNewVendorAddress(receipt.vendor.address || "");
        setNewVendorPhone(receipt.vendor.phone || "");
        setNewVendorTin(receipt.vendor.tin || "");
        setCreateNewVendor(true);

        // Try to find a matching vendor by name
        const matchedVendor = vendors.find(
          (v) => v.name.toLowerCase() === receipt.vendor.name.toLowerCase()
        );
        if (matchedVendor) {
          setVendorId(matchedVendor.id);
          setCreateNewVendor(false);
        }
      }

      setInvoiceNumber(receipt.invoice.number || "");
      setReceiptDate(receipt.invoice.date);
      setSubtotal(receipt.totals.subtotal);
      setDiscountAmount(receipt.totals.discount || 0);
      setDiscountLabel(receipt.totals.discount_label || "");
      setSubtotalAfterDiscount(receipt.totals.subtotal_after_discount || receipt.totals.subtotal);
      setVatRate(receipt.totals.vat_rate);
      setVatAmount(receipt.totals.vat_amount);
      setTotal(receipt.totals.total);

      // Convert line items to editable format
      const editableItems: EditableLineItem[] = receipt.line_items.map(
        (item, index) => ({
          ...item,
          material_id: data.materials?.[index]?.id || undefined,
          create_material: !data.materials?.[index]?.id,
          material_category: inferCategory(item.description),
          material_unit: "each",
        })
      );
      setLineItems(editableItems);

      setStatus("complete");
    } catch (error) {
      console.error("Processing error:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Error processing receipt"
      );
      setStatus("error");
    }
  };

  const inferCategory = (description: string): MaterialCategory => {
    const desc = description.toLowerCase();

    if (desc.includes("pvc") || desc.includes("pipe") || desc.includes("fitting")) {
      return "plumbing";
    }
    if (desc.includes("nail") || desc.includes("screw") || desc.includes("bolt")) {
      return "hardware";
    }
    if (desc.includes("lumber") || desc.includes("wood") || desc.includes("plywood")) {
      return "lumber";
    }
    if (desc.includes("cement") || desc.includes("concrete") || desc.includes("block")) {
      return "concrete";
    }
    if (desc.includes("wire") || desc.includes("outlet") || desc.includes("breaker")) {
      return "electrical";
    }
    if (desc.includes("roof") || desc.includes("shingle")) {
      return "roofing";
    }
    if (desc.includes("paint") || desc.includes("drywall") || desc.includes("trim")) {
      return "finishing";
    }

    return "other";
  };

  // Fetch material matches when vendor changes
  const fetchMaterialMatches = async (selectedVendorId: string) => {
    if (!selectedVendorId || lineItems.length === 0) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) return;

      const response = await fetch("/api/materials/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          line_items: lineItems.map((item) => ({
            product_code: item.product_code,
            description: item.description,
            unit_price: item.unit_price,
          })),
          vendor_id: selectedVendorId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update line items with match info
        const updatedItems = lineItems.map((item, index) => {
          const matchResult = data.matches?.find((m: { index: number }) => m.index === index);
          if (matchResult) {
            return {
              ...item,
              material_match: matchResult.match,
              material_id: matchResult.match.existing?.id || undefined,
              create_material: !matchResult.match.existing,
            };
          }
          return item;
        });
        setLineItems(updatedItems);
      }
    } catch (error) {
      console.error("Error fetching material matches:", error);
    }
  };

  // Get material summary counts
  const getMaterialSummary = () => {
    const toCreate = lineItems.filter(
      (item) => item.create_material && !item.material_id
    ).length;
    const toUpdate = lineItems.filter(
      (item) => item.material_match?.existing && item.create_material
    ).length;
    const existing = lineItems.filter(
      (item) => item.material_id && !item.create_material
    ).length;
    return { toCreate, toUpdate, existing };
  };

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        total: 0,
        create_material: true,
        material_category: "other",
        material_unit: "each",
      },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    const updated = lineItems.filter((_, i) => i !== index);
    setLineItems(updated);
    recalculateTotals(updated);
  };

  const handleLineItemChange = (
    index: number,
    field: keyof EditableLineItem,
    value: unknown
  ) => {
    const updated = [...lineItems];
    (updated[index] as any)[field] = value;

    // Recalculate line total if quantity or unit_price changed
    if (field === "quantity" || field === "unit_price") {
      updated[index].total = updated[index].quantity * updated[index].unit_price;
    }

    setLineItems(updated);

    if (field === "quantity" || field === "unit_price" || field === "total") {
      recalculateTotals(updated);
    }
  };

  const recalculateTotals = (items: EditableLineItem[], discount: number = discountAmount) => {
    const newSubtotal = items.reduce((sum, item) => sum + item.total, 0);
    const newSubtotalAfterDiscount = newSubtotal - discount;
    const newVatAmount = Math.round(newSubtotalAfterDiscount * vatRate * 100) / 100;
    const newTotal = newSubtotalAfterDiscount + newVatAmount;

    setSubtotal(newSubtotal);
    setSubtotalAfterDiscount(newSubtotalAfterDiscount);
    setVatAmount(newVatAmount);
    setTotal(newTotal);
  };

  const handleDiscountChange = (newDiscount: number) => {
    setDiscountAmount(newDiscount);
    recalculateTotals(lineItems, newDiscount);
  };

  const toggleItemExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleSubmit = async () => {
    if (!vendorId && !createNewVendor) {
      toast({
        title: "Error",
        description: "Please select a vendor or create a new one",
        variant: "destructive",
      });
      return;
    }

    if (lineItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one line item",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        throw new Error("Not authenticated");
      }

      let finalVendorId = vendorId;

      // Create new vendor if needed
      if (createNewVendor && !vendorId) {
        const { data: newVendor, error: vendorError } = await supabase
          .from("vendors")
          .insert({
            name: vendorName,
            address: newVendorAddress || null,
            phone: newVendorPhone || null,
            tin: newVendorTin || null,
            status: "active",
            company_id: profile?.company_id,
          })
          .select()
          .single();

        if (vendorError) {
          throw new Error(`Failed to create vendor: ${vendorError.message}`);
        }

        finalVendorId = newVendor.id;
      }

      // Upload receipt image
      let receiptImagePath: string | null = null;
      if (imageFile) {
        const poNumber = `PO-${Date.now().toString().slice(-8)}`;
        const fileName = `receipts/${poNumber}-${Date.now()}.jpg`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, imageFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (!uploadError && uploadData?.path) {
          receiptImagePath = uploadData.path;
        }
      }

      // Create purchase order with items
      const response = await fetch("/api/purchase-orders/from-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          receipt: {
            ...parsedReceipt,
            invoice: {
              ...parsedReceipt?.invoice,
              number: invoiceNumber,
              date: receiptDate,
            },
            line_items: lineItems,
            totals: {
              subtotal,
              discount: discountAmount,
              discount_label: discountLabel,
              subtotal_after_discount: subtotalAfterDiscount,
              vat_rate: vatRate,
              vat_amount: vatAmount,
              total,
            },
          },
          vendor_id: finalVendorId,
          project_id: projectId || null,
          receipt_image_path: receiptImagePath,
          discount_amount: discountAmount,
          discount_label: discountLabel,
          line_items: lineItems.map((item) => ({
            product_code: item.product_code,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            material_id: item.material_id,
            create_material: item.create_material && !item.material_id,
            material_category: item.material_category,
            material_unit: item.material_unit,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create purchase order");
      }

      const data = await response.json();

      toast({
        title: "Success",
        description: `Purchase order ${data.purchase_order.po_number} created successfully`,
        variant: "success",
      });

      onComplete(data.purchase_order.id);
      onOpenChange(false);
    } catch (error) {
      console.error("Submit error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderUploadTab = () => (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          imagePreview
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files?.[0];
          if (file && file.type.startsWith("image/")) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
          }
        }}
      >
        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Receipt preview"
              className="max-h-48 mx-auto rounded-lg shadow-md"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => {
                setImagePreview(null);
                setImageFile(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-2 text-sm">
              Drag and drop a receipt image here, or
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>

      {imagePreview && status === "idle" && (
        <Button className="w-full" onClick={processImage}>
          <Sparkles className="h-4 w-4 mr-2" />
          Process with AI
        </Button>
      )}

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Tips for best results:</p>
        <ul className="list-disc list-inside space-y-0.5 ml-2">
          <li>Lay receipt flat on a contrasting surface</li>
          <li>Ensure good lighting without shadows</li>
          <li>All text should be visible and in focus</li>
          <li>Avoid glare on thermal paper receipts</li>
        </ul>
      </div>
    </div>
  );

  const renderCameraTab = () => (
    <div className="space-y-4">
      {!cameraActive && !imagePreview ? (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
          <Camera className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-3 text-sm">
            Use your device camera to capture a receipt
          </p>
          <Button onClick={startCamera}>
            <Camera className="h-4 w-4 mr-2" />
            Start Camera
          </Button>
        </div>
      ) : cameraActive ? (
        <div className="relative">
          <video
            ref={videoRef}
            className="w-full rounded-lg"
            autoPlay
            playsInline
          />
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-4 border-2 border-white/50 rounded-lg" />
          </div>
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <Button variant="secondary" onClick={stopCamera}>
              Cancel
            </Button>
            <Button onClick={captureFromCamera}>
              <Camera className="h-4 w-4 mr-2" />
              Capture
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <img
            src={imagePreview!}
            alt="Captured receipt"
            className="max-h-48 mx-auto rounded-lg shadow-md"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={() => {
              setImagePreview(null);
              setImageFile(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {imagePreview && !cameraActive && status === "idle" && (
        <Button className="w-full" onClick={processImage}>
          <Sparkles className="h-4 w-4 mr-2" />
          Process with AI
        </Button>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );

  const renderProcessing = () => (
    <div className="py-8 text-center">
      <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
      <p className="text-lg font-medium mb-2">{progressMessage}</p>
      <Progress value={progress} className="w-full max-w-xs mx-auto" />
      <p className="text-sm text-muted-foreground mt-2">
        {status === "ocr_processing"
          ? "Extracting text from image..."
          : "Using AI to structure the data..."}
      </p>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
      {/* Confidence indicator */}
      {parsedReceipt && (
        <div className="flex items-center gap-2 text-sm">
          <Badge
            variant={
              parsedReceipt.confidence > 0.8
                ? "default"
                : parsedReceipt.confidence > 0.5
                ? "secondary"
                : "destructive"
            }
          >
            {Math.round(parsedReceipt.confidence * 100)}% confidence
          </Badge>
          <span className="text-muted-foreground">
            Parsed with {parsedReceipt.parsing_method === "ai" ? "AI" : "regex"}
          </span>
        </div>
      )}

      {/* Vendor Section */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Store className="h-4 w-4" />
            Vendor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {createNewVendor ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  id="existing-vendor"
                  checked={!createNewVendor}
                  onCheckedChange={() => setCreateNewVendor(false)}
                />
                <Label htmlFor="existing-vendor" className="text-sm">
                  Use existing vendor
                </Label>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Vendor Name</Label>
                <Input
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="Vendor name"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={newVendorPhone}
                    onChange={(e) => setNewVendorPhone(e.target.value)}
                    placeholder="(242) 555-1234"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TIN</Label>
                  <Input
                    value={newVendorTin}
                    onChange={(e) => setNewVendorTin(e.target.value)}
                    placeholder="Tax ID"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Input
                  value={newVendorAddress}
                  onChange={(e) => setNewVendorAddress(e.target.value)}
                  placeholder="Address"
                />
              </div>
            </>
          ) : (
            <>
              <Select
                value={vendorId}
                onValueChange={(value) => {
                  setVendorId(value);
                  fetchMaterialMatches(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parsedReceipt?.vendor.name && (
                <p className="text-xs text-muted-foreground">
                  Detected: {parsedReceipt.vendor.name}
                </p>
              )}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setCreateNewVendor(true)}
              >
                + Create new vendor
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Invoice Details */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Invoice Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Invoice #"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <DatePicker
                value={receiptDate}
                onChange={(value) => setReceiptDate(value)}
              />
            </div>
          </div>
          {projects.length > 0 && (
            <div className="mt-3 space-y-1">
              <Label className="text-xs">Assign to Project (Optional)</Label>
              <Select 
                value={projectId || undefined} 
                onValueChange={(value) => setProjectId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" />
            Line Items ({lineItems.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleAddLineItem}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No items detected. Add items manually.
            </p>
          ) : (
            lineItems.map((item, index) => (
              <div
                key={index}
                className="border rounded-lg p-2 space-y-2 bg-muted/20"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        handleLineItemChange(index, "description", e.target.value)
                      }
                      placeholder="Item description"
                      className="text-sm"
                    />
                    {item.product_code && (
                      <p className="text-xs text-muted-foreground">
                        Code: {item.product_code}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleItemExpanded(index)}
                    >
                      {expandedItems.has(index) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleRemoveLineItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-16">
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        handleLineItemChange(
                          index,
                          "quantity",
                          parseFloat(e.target.value) || 1
                        )
                      }
                      className="text-sm text-center"
                      min={1}
                    />
                  </div>
                  <span className="text-muted-foreground">@</span>
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) =>
                        handleLineItemChange(
                          index,
                          "unit_price",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="text-sm"
                    />
                  </div>
                  <span className="text-muted-foreground">=</span>
                  <div className="flex-1 font-medium text-right">
                    {formatCurrency(item.total)}
                  </div>
                </div>

                {/* Material matching status */}
                {item.material_match && (
                  <div className="mt-2 text-xs">
                    {item.material_match.existing ? (
                      <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-900">
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-green-700 dark:text-green-400 font-medium">
                            Matches: {item.material_match.existing.name}
                          </p>
                          {item.material_match.price_change && (
                            <p className="flex items-center gap-1 mt-0.5">
                              <span className="text-muted-foreground">
                                ${item.material_match.price_change.previous.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium">
                                ${item.material_match.price_change.current.toFixed(2)}
                              </span>
                              {item.material_match.price_change.percentage !== 0 && (
                                <span
                                  className={`flex items-center ${
                                    item.material_match.price_change.percentage > 0
                                      ? "text-red-600"
                                      : "text-green-600"
                                  }`}
                                >
                                  {item.material_match.price_change.percentage > 0 ? (
                                    <TrendingUp className="h-3 w-3 mr-0.5" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3 mr-0.5" />
                                  )}
                                  {Math.abs(item.material_match.price_change.percentage)}%
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-900">
                        <PackagePlus className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-blue-700 dark:text-blue-400">
                          Will be added as new material
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {expandedItems.has(index) && (
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`create-material-${index}`}
                        checked={item.create_material}
                        onCheckedChange={(checked) =>
                          handleLineItemChange(
                            index,
                            "create_material",
                            checked === true
                          )
                        }
                      />
                      <Label
                        htmlFor={`create-material-${index}`}
                        className="text-xs"
                      >
                        {item.material_match?.existing
                          ? "Update material pricing"
                          : "Add to materials inventory"}
                      </Label>
                    </div>
                    {item.create_material && !item.material_match?.existing && (
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={item.material_category}
                          onValueChange={(value) =>
                            handleLineItemChange(
                              index,
                              "material_category",
                              value as MaterialCategory
                            )
                          }
                        >
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MATERIAL_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={item.material_unit}
                          onChange={(e) =>
                            handleLineItemChange(
                              index,
                              "material_unit",
                              e.target.value
                            )
                          }
                          placeholder="Unit"
                          className="text-xs h-8"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Materials Summary */}
      {lineItems.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Materials Inventory</span>
              </div>
              <div className="flex gap-3 text-xs">
                {(() => {
                  const summary = getMaterialSummary();
                  return (
                    <>
                      {summary.toCreate > 0 && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <CircleDot className="h-3 w-3" />
                          {summary.toCreate} new
                        </span>
                      )}
                      {summary.toUpdate > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {summary.toUpdate} update
                        </span>
                      )}
                      {summary.existing > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Check className="h-3 w-3" />
                          {summary.existing} existing
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Selected items will be added/updated in your materials inventory with current pricing
            </p>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <Card>
        <CardContent className="py-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {/* Discount Section */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-green-600">Discount</span>
                <Input
                  value={discountLabel}
                  onChange={(e) => setDiscountLabel(e.target.value)}
                  placeholder="e.g., Account Discount"
                  className="h-6 text-xs w-32"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-green-600">-</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
                  className="h-6 text-xs w-20 text-right text-green-600"
                />
              </div>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal after discount</span>
                <span>{formatCurrency(subtotalAfterDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">
                VAT ({Math.round(vatRate * 100)}%)
              </span>
              <span>{formatCurrency(vatAmount)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            setStatus("idle");
            setParsedReceipt(null);
          }}
          className="flex-1"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Re-scan
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Create Purchase Order
        </Button>
      </div>
    </div>
  );

  const renderError = () => (
    <div className="py-8 text-center">
      <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
      <p className="text-lg font-medium text-destructive mb-2">Error</p>
      <p className="text-muted-foreground mb-4">{errorMessage}</p>
      <Button variant="outline" onClick={() => setStatus("idle")}>
        Try Again
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Receipt Scanner
          </DialogTitle>
          <DialogDescription>
            {status === "complete"
              ? "Review the extracted data and create a purchase order"
              : "Upload or capture a receipt to automatically extract data"}
          </DialogDescription>
        </DialogHeader>

        {(status === "ocr_processing" || status === "ai_processing") &&
          renderProcessing()}
        {status === "error" && renderError()}
        {status === "complete" && renderReview()}

        {status === "idle" && (
          <Tabs defaultValue="upload">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="camera">
                <Camera className="h-4 w-4 mr-2" />
                Camera
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-4">
              {renderUploadTab()}
            </TabsContent>
            <TabsContent value="camera" className="mt-4">
              {renderCameraTab()}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
