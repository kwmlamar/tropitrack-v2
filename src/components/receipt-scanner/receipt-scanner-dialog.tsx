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
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { parseReceipt, type ParsedReceipt, type ParsedLineItem } from "@/lib/ocr/receipt-parser";
import { formatCurrency } from "@/lib/utils";

interface ReceiptScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: (data: ParsedReceipt, imageFile: File | null) => void;
}

type ScanStatus = "idle" | "loading" | "processing" | "complete" | "error";

export function ReceiptScannerDialog({
  open,
  onOpenChange,
  onScanComplete,
}: ReceiptScannerDialogProps) {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);

  // Editable state for review
  const [vendorName, setVendorName] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [lineItems, setLineItems] = useState<ParsedLineItem[]>([]);
  const [subtotal, setSubtotal] = useState<string>("");
  const [tax, setTax] = useState<string>("");
  const [total, setTotal] = useState<string>("");

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
            setProgress(Math.round(m.progress * 100));
            setProgressMessage("Recognizing text...");
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
    setParsedData(null);
    setVendorName("");
    setReceiptDate("");
    setLineItems([]);
    setSubtotal("");
    setTax("");
    setTotal("");
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
        video: { facingMode: "environment" }, // Prefer back camera
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

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "receipt-capture.jpg", { type: "image/jpeg" });
        setImageFile(file);
        setImagePreview(canvas.toDataURL("image/jpeg"));
        stopCamera();
      }
    }, "image/jpeg", 0.9);
  }, [cameraStream]);

  const processImage = async () => {
    if (!imagePreview || !workerRef.current) {
      setErrorMessage("No image to process");
      return;
    }

    setStatus("processing");
    setProgress(0);
    setProgressMessage("Initializing OCR...");

    try {
      const { data: { text } } = await workerRef.current.recognize(imagePreview);

      if (!text.trim()) {
        setErrorMessage("Could not extract text from image. Please try a clearer image.");
        setStatus("error");
        return;
      }

      // Parse the OCR text
      const parsed = parseReceipt(text);
      setParsedData(parsed);

      // Populate editable fields
      setVendorName(parsed.vendor_name || "");
      setReceiptDate(parsed.date || new Date().toISOString().split("T")[0]);
      setLineItems(parsed.line_items);
      setSubtotal(parsed.subtotal?.toString() || "");
      setTax(parsed.tax?.toString() || "");
      setTotal(parsed.total?.toString() || "");

      setStatus("complete");
    } catch (error) {
      console.error("OCR Error:", error);
      setErrorMessage("Error processing image. Please try again.");
      setStatus("error");
    }
  };

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      { description: "", quantity: 1, unit_price: null, total: 0 },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (
    index: number,
    field: keyof ParsedLineItem,
    value: string | number
  ) => {
    const updated = [...lineItems];
    if (field === "description") {
      updated[index].description = value as string;
    } else if (field === "quantity") {
      updated[index].quantity = parseFloat(value as string) || 1;
    } else if (field === "total") {
      updated[index].total = parseFloat(value as string) || 0;
    }
    setLineItems(updated);
  };

  const handleConfirm = () => {
    const finalData: ParsedReceipt = {
      vendor_name: vendorName || null,
      date: receiptDate || null,
      line_items: lineItems,
      subtotal: subtotal ? parseFloat(subtotal) : null,
      tax: tax ? parseFloat(tax) : null,
      total: total ? parseFloat(total) : null,
      raw_text: parsedData?.raw_text || "",
    };

    onScanComplete(finalData, imageFile);
    onOpenChange(false);
  };

  const renderUploadTab = () => (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          imagePreview ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
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
              className="max-h-64 mx-auto rounded-lg shadow-md"
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
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              Drag and drop a receipt image here, or
            </p>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
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
          <FileText className="h-4 w-4 mr-2" />
          Process Receipt
        </Button>
      )}
    </div>
  );

  const renderCameraTab = () => (
    <div className="space-y-4">
      {!cameraActive && !imagePreview ? (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
          <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">
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
            className="max-h-64 mx-auto rounded-lg shadow-md"
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
          <FileText className="h-4 w-4 mr-2" />
          Process Receipt
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
      <p className="text-sm text-muted-foreground mt-2">{progress}% complete</p>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="vendor_name">Vendor Name</Label>
          <Input
            id="vendor_name"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Store name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receipt_date">Date</Label>
          <DatePicker
            id="receipt_date"
            value={receiptDate}
            onChange={(value) => setReceiptDate(value)}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Line Items</Label>
          <Button variant="outline" size="sm" onClick={handleAddLineItem}>
            <Plus className="h-3 w-3 mr-1" />
            Add Item
          </Button>
        </div>

        {lineItems.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No items detected. Add items manually.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <Card key={index}>
                <CardContent className="p-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        handleLineItemChange(index, "description", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        handleLineItemChange(index, "quantity", e.target.value)
                      }
                      className="w-20"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Total"
                      value={item.total || ""}
                      onChange={(e) =>
                        handleLineItemChange(index, "total", e.target.value)
                      }
                      className="w-24"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveLineItem(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="subtotal">Subtotal (BSD)</Label>
          <Input
            id="subtotal"
            type="number"
            step="0.01"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax">Tax (BSD)</Label>
          <Input
            id="tax"
            type="number"
            step="0.01"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="total">Total (BSD)</Label>
          <Input
            id="total"
            type="number"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0.00"
            className="font-bold"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={() => setStatus("idle")}>
          Re-scan
        </Button>
        <Button onClick={handleConfirm}>
          Confirm & Use
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan Receipt</DialogTitle>
          <DialogDescription>
            {status === "complete"
              ? "Review and edit the extracted data"
              : "Upload or capture a receipt image to extract information"}
          </DialogDescription>
        </DialogHeader>

        {status === "processing" && renderProcessing()}
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
