"use client";

import { useState } from "react";
import { Sparkles, Loader2, Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { AIContentType, GenerateDescriptionResponse } from "@/types";

interface AIDescriptionFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  contentType: AIContentType;
  context: Record<string, unknown>;
  disabled?: boolean;
}

export function AIDescriptionField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
  contentType,
  context,
  disabled,
}: AIDescriptionFieldProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerate = async () => {
    if (!session?.access_token) {
      toast({
        title: "Error",
        description: "You must be logged in to use AI features",
        variant: "destructive",
      });
      return;
    }

    // Check if we have enough context
    const hasContext = Object.values(context).some(
      (v) => v && String(v).trim() !== ""
    );

    if (!hasContext) {
      toast({
        title: "Need more context",
        description: "Please fill in some details first (e.g., title, client name) to generate a better description",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content_type: contentType,
          context,
        }),
      });

      const data: GenerateDescriptionResponse = await response.json();

      if (data.success && data.generated_text) {
        setGeneratedText(data.generated_text);
        setShowPreview(true);
      } else {
        toast({
          title: "Generation failed",
          description: data.error || "Failed to generate description",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Generation error:", err);
      toast({
        title: "Error",
        description: "Failed to connect to AI service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    if (generatedText) {
      onChange(generatedText);
      setShowPreview(false);
      setGeneratedText(null);
      toast({
        title: "Description applied",
        description: "You can edit it further if needed",
      });
    }
  };

  const handleRegenerate = () => {
    handleGenerate();
  };

  const handleCancel = () => {
    setShowPreview(false);
    setGeneratedText(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>
          {label}
          {required && " *"}
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={disabled || loading}
                className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 text-xs font-medium">Auto-Draft</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Generate description with AI</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {showPreview && generatedText ? (
        <div className="relative rounded-md border border-primary/50 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-primary font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            AI Generated Preview
          </div>
          <p className="text-sm whitespace-pre-wrap">{generatedText}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAccept}
              className="h-7"
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={loading}
              className="h-7"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Regenerate
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-7"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          required={required}
          disabled={disabled}
        />
      )}
    </div>
  );
}
