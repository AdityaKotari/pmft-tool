import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export async function POST(req: Request) {
  let body: { name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email } = body;
  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  // Write to .env file
  const envPath = path.join(process.cwd(), ".env");
  const line = `EDGAR_IDENTITY="${name} ${email}"`;

  try {
    let content = "";
    try {
      content = await fs.readFile(envPath, "utf-8");
    } catch {
      // File doesn't exist yet — will be created
    }

    const lines = content.split("\n");
    const idx = lines.findIndex((l) => l.startsWith("EDGAR_IDENTITY="));
    if (idx >= 0) {
      lines[idx] = line;
    } else {
      lines.push(line);
    }

    await fs.writeFile(envPath, lines.filter(Boolean).join("\n") + "\n");

    // Update the runtime env
    process.env.EDGAR_IDENTITY = `${name} ${email}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to write .env:", err);
    return NextResponse.json(
      { error: "Failed to save identity" },
      { status: 500 }
    );
  }
}
