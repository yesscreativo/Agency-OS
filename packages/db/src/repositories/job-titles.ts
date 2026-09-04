import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type JobTitleRow = Tables<"job_titles">;

export async function listJobTitles(db: Db, areaId: string): Promise<JobTitleRow[]> {
  const { data, error } = await db.from("job_titles").select("*").eq("area_id", areaId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createJobTitle(
  db: Db,
  values: { organizationId: string; areaId: string; name: string },
): Promise<JobTitleRow> {
  const insert: TablesInsert<"job_titles"> = {
    organization_id: values.organizationId,
    area_id: values.areaId,
    name: values.name,
  };
  const { data, error } = await db.from("job_titles").insert(insert).select("*").single();
  if (error) throw error;
  return data;
}

export async function renameJobTitle(db: Db, id: string, name: string): Promise<void> {
  const { error } = await db
    .from("job_titles")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
