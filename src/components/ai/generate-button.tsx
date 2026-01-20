"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";
import type { AIContentType, GenerateDescriptionResponse } from "@/types";

interface GenerateButtonProps {
  contentType: AIContentType;
  context: Record<string, unknown>;
  onGenerated: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export function GenerateButton({
  contentType,
  context,
  onGenerated,
  onError,
  disabled,
  className,
}: GenerateButtonProps) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!session?.access_token) {
      onError?.("You must be logged in to use AI features");
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
        onGenerated(data.generated_text);
      } else {
        onError?.(data.error || "Failed to generate description");
      }
    } catch (err) {
      console.error("Generation error:", err);
      onError?.("Failed to generate description");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleGenerate}
            disabled={disabled || loading}
            className={className}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-1.5 text-xs">Auto-Draft</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Generate description with AI</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
