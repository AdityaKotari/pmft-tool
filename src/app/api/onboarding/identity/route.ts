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

  // The value is written into .env — reject anything that could corrupt the
  // file format or inject extra lines.
  const clean = (v: string) => v.replace(/[\r\n]/g, " ").replace(/["'=]/g, "").trim();
  const cleanName = clean(name);
  const cleanEmail = clean(email);
  if (!cleanName || cleanName.length > 100 || !cleanEmail || cleanEmail.length > 200) {
    return NextResponse.json(
      { error: "Name and email are required (max 100/200 chars)" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Write to .env file
  const envPath = path.join(process.cwd(), ".env");
  const line = `EDGAR_IDENTITY="${cleanName} ${cleanEmail}"`;

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
    process.env.EDGAR_IDENTITY = `${cleanName} ${cleanEmail}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to write .env:", err);
    return NextResponse.json(
      { error: "Failed to save identity" },
      { status: 500 }
    );
  }
}
