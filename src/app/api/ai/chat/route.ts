import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { openai, OPENAI_MODEL } from "@/lib/openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ASSISTANT_SYSTEM_PROMPT = `You are TropiTrack AI, a helpful and knowledgeable AI assistant for a construction project management system used by Bahamian construction companies.

Your role is to:
- Answer questions about construction project management
- Help users navigate and use the TropiTrack system
- Provide guidance on best practices for construction management
- Assist with understanding project data, reports, and workflows
- Be friendly, professional, and conversational

Key information about TropiTrack:
- It's a construction management system for Bahamian companies
- Manages projects, workers, time tracking, payroll, materials, vendors, estimates, and invoices
- Uses BSD (Bahamian Dollar) currency
- Tracks labor costs, material costs, equipment costs, and overhead
- Supports time tracking with overtime calculations (1.5x rate after 8 hours)
- Includes payroll processing with NIB deductions

When users ask questions:
- If they're asking about data in their system, suggest using the search feature (⌘K) to find specific records
- Provide helpful explanations and guidance
- Be conversational and natural
- If you don't know something specific about their data, acknowledge that and guide them to where they can find it

Keep responses concise but helpful. Be warm and professional.`;

export async function POST(request: NextRequest) {
  try {
    // Get auth token from request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create authenticated Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { message, conversation_history = [] } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Build conversation messages
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
    ];

    // Add conversation history (limit to last 10 messages to avoid token limits)
    const recentHistory = conversation_history.slice(-10);
    for (const msg of recentHistory) {
      if (msg.role && msg.content) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // Call OpenAI
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 500,
      });
    } catch (openaiError: any) {
      // Handle OpenAI-specific errors
      const status = openaiError?.status || openaiError?.response?.status || openaiError?.statusCode;
      const errorMessage = openaiError?.message || openaiError?.error?.message || String(openaiError);
      
      if (status === 429 || errorMessage.includes("quota") || errorMessage.includes("429")) {
        return NextResponse.json(
          {
            success: false,
            message: "OpenAI API quota exceeded. Please check your OpenAI account billing and usage limits. You may need to add credits or upgrade your plan at https://platform.openai.com/account/billing",
            error: "QUOTA_EXCEEDED",
            errorCode: 429,
            details: errorMessage,
          },
          { status: 429 }
        );
      }
      if (status === 401 || errorMessage.includes("Invalid API key") || errorMessage.includes("401")) {
        return NextResponse.json(
          {
            success: false,
            message: "OpenAI API key is invalid or expired. Please check your OPENAI_API_KEY environment variable.",
            error: "INVALID_API_KEY",
            errorCode: 401,
            details: errorMessage,
          },
          { status: 401 }
        );
      }
      // Re-throw to be caught by outer catch
      throw openaiError;
    }

    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      throw new Error("No response from AI");
    }

    return NextResponse.json({
      success: true,
      message: responseText,
      tokens_used: completion.usage?.total_tokens,
    });
  } catch (error: unknown) {
    console.error("Chat error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Chat failed";

    // Check if it's an OpenAI error with status
    if (error && typeof error === "object") {
      const status = (error as any).status || (error as any).response?.status || (error as any).statusCode;
      const errorMessage = (error as any).message || (error as any).error?.message || String(error);
      
      if (status === 429 || errorMessage.includes("quota") || errorMessage.includes("429")) {
        return NextResponse.json(
          {
            success: false,
            message: "OpenAI API quota exceeded. Please check your OpenAI account billing and usage limits at https://platform.openai.com/account/billing",
            error: "QUOTA_EXCEEDED",
            errorCode: 429,
            details: errorMessage,
          },
          { status: 429 }
        );
      }
      if (status === 401 || errorMessage.includes("Invalid API key") || errorMessage.includes("401")) {
        return NextResponse.json(
          {
            success: false,
            message: "OpenAI API key is invalid or expired. Please check your OPENAI_API_KEY environment variable.",
            error: "INVALID_API_KEY",
            errorCode: 401,
            details: errorMessage,
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "I'm sorry, I encountered an error. Please try again.",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
