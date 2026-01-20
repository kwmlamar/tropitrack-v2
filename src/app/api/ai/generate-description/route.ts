import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { openai, OPENAI_MODEL, OPENAI_MAX_TOKENS } from "@/lib/openai";
import { getDescriptionPrompt, formatContextForPrompt } from "@/lib/ai-prompts";
import type { AIContentType, AITone, GenerateDescriptionResponse } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const { content_type, context, tone = "professional" } = await request.json();

    if (!content_type || !context) {
      return NextResponse.json(
        { error: "content_type and context are required" },
        { status: 400 }
      );
    }

    // Validate content type
    const validContentTypes: AIContentType[] = [
      "estimate_description",
      "invoice_description",
      "material_description",
      "line_item",
      "project_description",
    ];

    if (!validContentTypes.includes(content_type)) {
      return NextResponse.json(
        { error: "Invalid content_type" },
        { status: 400 }
      );
    }

    // Validate tone
    const validTones: AITone[] = ["professional", "concise", "detailed"];
    const selectedTone: AITone = validTones.includes(tone) ? tone : "professional";

    // Get user's preferred tone if not specified
    let userTone = selectedTone;
    if (!tone) {
      const { data: preferences } = await supabase
        .from("user_ai_preferences")
        .select("tone")
        .eq("user_id", user.id)
        .single();

      if (preferences?.tone) {
        userTone = preferences.tone as AITone;
      }
    }

    // Get the system prompt for this content type
    const systemPrompt = getDescriptionPrompt(content_type, userTone);

    // Format the context for the prompt
    const formattedContext = formatContextForPrompt(content_type, context);

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a description based on this context:\n\n${formattedContext}`,
        },
      ],
      temperature: 0.7,
      max_tokens: OPENAI_MAX_TOKENS,
    });

    const generatedText = completion.choices[0]?.message?.content?.trim();

    if (!generatedText) {
      throw new Error("No response from AI");
    }

    const tokensUsed = completion.usage?.total_tokens;

    // Save generation to database
    await supabase.from("ai_generations").insert({
      user_id: user.id,
      content_type,
      input_context: context,
      generated_text: generatedText,
      tokens_used: tokensUsed,
    });

    const response: GenerateDescriptionResponse = {
      success: true,
      generated_text: generatedText,
      tokens_used: tokensUsed,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Generate description error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Generation failed";

    return NextResponse.json(
      {
        success: false,
        generated_text: "",
        error: errorMessage,
      } as GenerateDescriptionResponse,
      { status: 500 }
    );
  }
}
