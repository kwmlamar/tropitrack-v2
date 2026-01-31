import { NextResponse } from "next/server";
import { appendFile } from "fs/promises";

export const runtime = "nodejs";

const DEBUG_ENDPOINT =
  "http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b";

const DEBUG_LOG_PATH =
  "/Users/kwmlamar/TropiTech Solutions/tropitrack-v2/.cursor/debug.log";

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Always write locally so we have runtime evidence even if the collector
    // endpoint is unreachable (e.g. mixed-content blocking in the browser).
    try {
      await appendFile(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`, "utf8");
    } catch {
      // ignore
    }

    // Forward to the local debug collector. Never throw—debug must not break the app.
    await fetch(DEBUG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}

