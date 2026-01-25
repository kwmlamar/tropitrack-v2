/**
 * AI Agent Chat Endpoint
 * Provides autonomous AI agent with full TropiTrack control
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AIAgent } from "@/lib/ai-agent";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    // Get auth token
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create authenticated Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    // Check rate limit
    const withinLimit = await AIAgent.checkRateLimit(user.id, 200);
    if (!withinLimit) {
      return NextResponse.json(
        {
          error: "Daily message limit reached. Please try again tomorrow.",
          error_code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // Parse request
    const { message, conversation_id } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Create AI agent instance
    const agent = new AIAgent(user.id, profile.company_id, conversation_id);

    // Process message
    const response = await agent.processMessage(message);

    return NextResponse.json({
      success: true,
      message: response.content,
      conversation_id: response.conversationId,
      metadata: {
        tool_calls_executed: response.toolCallsExecuted,
        tokens_used: response.tokensUsed,
        execution_time_ms: response.executionTimeMs,
      },
    });
  } catch (error: unknown) {
    console.error("AI Agent error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "AI agent failed";

    // Check for OpenAI errors
    if (error && typeof error === "object") {
      const status = (error as any).status || (error as any).response?.status;
      const message = (error as any).message || String(error);

      if (status === 429 || message.includes("quota") || message.includes("429")) {
        return NextResponse.json(
          {
            success: false,
            error: "OpenAI API quota exceeded. Please check your OpenAI account.",
            error_code: "QUOTA_EXCEEDED",
          },
          { status: 429 }
        );
      }

      if (status === 401 || message.includes("Invalid API key")) {
        return NextResponse.json(
          {
            success: false,
            error: "OpenAI API key is invalid or expired.",
            error_code: "INVALID_API_KEY",
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "I'm sorry, I encountered an error. Please try again.",
        error_message: errorMessage,
      },
      { status: 500 }
    );
  }
}
