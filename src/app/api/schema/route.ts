import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { COLUMNS, PRESETS, COLUMN_TO_SQL_MAP, COLUMN_TO_TABLE_MAP } from "@/lib/schema";

export async function GET() {
  const db = getDb();

  const columnsWithValues = COLUMNS.map((col) => {
    if (col.type !== "enum") return col;

    const sqlColumn = COLUMN_TO_SQL_MAP[col.key];
    const table = COLUMN_TO_TABLE_MAP[col.key];
    if (!sqlColumn || !table) return col;

    try {
      const rows = db
        .prepare(
          `SELECT DISTINCT ${sqlColumn} as val FROM ${table} WHERE ${sqlColumn} IS NOT NULL AND ${sqlColumn} != '' ORDER BY val`
        )
        .all() as { val: string }[];
      return { ...col, values: rows.map((r) => r.val) };
    } catch {
      return col;
    }
  });

  return NextResponse.json({
    columns: columnsWithValues,
    presets: PRESETS,
  });
}
