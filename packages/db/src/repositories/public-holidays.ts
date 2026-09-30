import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type HolidayRow = Tables<"public_holidays">;

export async function listHolidays(db: Db): Promise<HolidayRow[]> {
  const { data, error } = await db.from("public_holidays").select("*").order("date");
  if (error) throw error;
  return data ?? [];
}

export async function createHoliday(db: Db, values: { date: string; name: string }): Promise<HolidayRow> {
  const { data, error } = await db.from("public_holidays").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteHoliday(db: Db, id: string): Promise<void> {
  const { error } = await db.from("public_holidays").delete().eq("id", id);
  if (error) throw error;
}
