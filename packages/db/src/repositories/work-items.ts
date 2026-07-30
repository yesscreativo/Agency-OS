import type { Enums, Tables, TablesUpdate } from "../types/database";
import type { Db } from "./shared";
import { listStatuses, type StatusRow } from "./work-item-statuses";

export type WorkItemRow = Tables<"work_items">;

export type ProjectClient = Pick<Tables<"clients">, "id" | "name" | "company">;

/** Fila de la lista de proyectos: work_item `type='project'` + cliente + conteo
 * de tareas top-level (no subtareas) y de las que están en un estado "hecho".
 * El conteo se calcula en memoria (ver `countProjectTasks`) porque
 * `work_items.project_id` es una columna plana SIN foreign key declarada
 * (migración 018) — PostgREST no puede embeber una relación que no existe en el
 * esquema, a diferencia de `client_id`/`quote_id`/`status_id` que sí la tienen. */
export type ProjectRow = Tables<"work_items"> & {
  client: ProjectClient | null;
  tasks_count: number;
  tasks_done_count: number;
};

type ProjectListDbRow = Tables<"work_items"> & { client: ProjectClient | null };

const PROJECT_LIST_SELECT = "*, client:clients(id, name, company)";

export interface ListProjectsOpts {
  search?: string;
}

export async function listProjects(
  db: Db,
  orgId: string,
  opts: ListProjectsOpts = {},
): Promise<ProjectRow[]> {
  let query = db
    .from("work_items")
    .select(PROJECT_LIST_SELECT)
    .eq("organization_id", orgId)
    .eq("type", "project")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (opts.search) {
    query = query.ilike("title", `%${opts.search}%`);
  }

  const { data, error } = await query.returns<ProjectListDbRow[]>();
  if (error) throw error;
  const projects = data ?? [];
  if (projects.length === 0) return [];

  const { counts, doneCounts } = await countProjectTasks(
    db,
    projects.map((p) => p.id),
  );

  return projects.map((p) => ({
    ...p,
    tasks_count: counts[p.id] ?? 0,
    tasks_done_count: doneCounts[p.id] ?? 0,
  }));
}

type ProjectTaskCountRow = {
  project_id: string;
  status: Pick<Tables<"work_item_statuses">, "is_done"> | null;
};

/** Cuenta tareas (`type='task'`, no borradas) por proyecto y cuántas están en un
 * estado "hecho" (`status.is_done`). Trae solo project_id + status embebido y
 * cuenta en memoria (mismo patrón que `countQuotesByClient` en clients.ts).
 * Pagina internamente en bloques de 1000, límite de filas de PostgREST (igual que
 * `listPipelineQuotes` en quotes.ts). */
async function countProjectTasks(
  db: Db,
  projectIds: string[],
): Promise<{ counts: Record<string, number>; doneCounts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  const doneCounts: Record<string, number> = {};
  if (projectIds.length === 0) return { counts, doneCounts };

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("work_items")
      .select("project_id, status:work_item_statuses!work_items_status_fk(is_done)")
      .eq("type", "task")
      .is("deleted_at", null)
      .in("project_id", projectIds)
      .range(from, from + pageSize - 1)
      .returns<ProjectTaskCountRow[]>();
    if (error) throw error;
    for (const row of data ?? []) {
      counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
      if (row.status?.is_done) doneCounts[row.project_id] = (doneCounts[row.project_id] ?? 0) + 1;
    }
    if (!data || data.length < pageSize) break;
  }
  return { counts, doneCounts };
}

export type WorkItemAssigneeRow = {
  user_id: string;
  users: {
    id: string;
    person: Pick<Tables<"people">, "full_name" | "email"> | null;
  } | null;
};

export type ProjectTaskRow = Tables<"work_items"> & {
  status: Pick<Tables<"work_item_statuses">, "id" | "label" | "color" | "is_done"> | null;
  assignees: WorkItemAssigneeRow[];
};

export type ProjectDetail = Tables<"work_items"> & {
  client: Tables<"clients"> | null;
  statuses: StatusRow[];
  tasks: ProjectTaskRow[];
};

// El embed de status DEBE desambiguarse con `!work_items_status_fk`: hay dos
// relaciones work_items↔work_item_statuses (status_id→statuses.id, la que
// queremos, y statuses.project_id→work_items.id, la inversa). Sin el nombre del
// FK, PostgREST responde 300 (PGRST201) y la consulta lanza. Igual en countProjectTasks.
const TASKS_SELECT =
  "*, status:work_item_statuses!work_items_status_fk(id, label, color, is_done), assignees:work_item_assignees(user_id, users(id, person:people(full_name, email)))";

/** Proyecto + sus columnas del tablero (`work_item_statuses`, ordenadas por
 * sort_order) + sus tareas/subtareas con assignees embebidos. Las tareas se
 * devuelven en una lista plana ordenada por sort_order — el árbol tarea/subtarea
 * se arma en la UI vía `parent_id` (mismo motivo que el conteo: no hay FK
 * `work_items.project_id -> work_items.id`, así que tampoco hay un embed
 * jerárquico posible por ese lado; `parent_id` sí tiene FK propia). */
export async function getProject(db: Db, id: string): Promise<ProjectDetail | null> {
  const { data: project, error } = await db
    .from("work_items")
    .select("*, client:clients(*)")
    .eq("id", id)
    .eq("type", "project")
    .is("deleted_at", null)
    .maybeSingle<Tables<"work_items"> & { client: Tables<"clients"> | null }>();
  if (error) throw error;
  if (!project) return null;

  const [statuses, tasksResult] = await Promise.all([
    listStatuses(db, id),
    db
      .from("work_items")
      .select(TASKS_SELECT)
      .eq("project_id", id)
      .in("type", ["task", "subtask"])
      .is("deleted_at", null)
      .order("sort_order")
      .returns<ProjectTaskRow[]>(),
  ]);
  if (tasksResult.error) throw tasksResult.error;

  return {
    ...project,
    statuses,
    tasks: tasksResult.data ?? [],
  };
}

export interface CreateProjectInput {
  orgId: string;
  clientId: string;
  quoteId?: string;
  title: string;
  createdBy: string;
}

/** Crea el work_item raíz de un proyecto (`type='project'`). El id se genera en
 * cliente (`crypto.randomUUID()`) para poder setear `project_id` = su propio id
 * en el mismo insert, evitando un update posterior. `project_state` arranca
 * `active` (requerido por el check `work_items_project_has_state`). Tras
 * insertar, siembra las 4 columnas por defecto del tablero vía RPC y devuelve
 * el id del proyecto. */
export async function createProject(db: Db, input: CreateProjectInput): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await db.from("work_items").insert({
    id,
    organization_id: input.orgId,
    type: "project",
    project_id: id,
    title: input.title,
    client_id: input.clientId,
    quote_id: input.quoteId ?? null,
    project_state: "active",
    created_by: input.createdBy,
  });
  if (error) throw error;

  const { error: seedError } = await db.rpc("seed_default_work_item_statuses", {
    p_project_id: id,
    p_org: input.orgId,
  });
  if (seedError) throw seedError;

  return id;
}

export interface CreateWorkItemInput {
  orgId: string;
  projectId: string;
  /** null/omitido en una tarea top-level; el id de la tarea padre en una subtarea. */
  parentId?: string | null;
  type: Extract<Enums<"work_item_type">, "task" | "subtask">;
  title: string;
  statusId?: string | null;
  priority?: Enums<"work_item_priority">;
  dueDate?: string | null;
}

/** Crea una tarea o subtarea dentro de un proyecto. Devuelve el id creado. */
export async function createWorkItem(db: Db, input: CreateWorkItemInput): Promise<string> {
  const { data, error } = await db
    .from("work_items")
    .insert({
      organization_id: input.orgId,
      type: input.type,
      project_id: input.projectId,
      parent_id: input.parentId ?? null,
      title: input.title,
      status_id: input.statusId ?? null,
      priority: input.priority ?? "normal",
      due_date: input.dueDate ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export type WorkItemPatch = Partial<
  Pick<
    TablesUpdate<"work_items">,
    | "title"
    | "description"
    | "priority"
    | "status_id"
    | "start_date"
    | "due_date"
    | "sort_order"
    | "project_state"
  >
>;

export async function updateWorkItem(db: Db, id: string, patch: WorkItemPatch): Promise<void> {
  const { error } = await db.from("work_items").update(patch).eq("id", id);
  if (error) throw error;
}

/** Soft delete (deleted_at), según convención del esquema (igual que
 * softDeleteQuote/softDeleteClient). */
export async function softDeleteWorkItem(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("work_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Reemplaza el set completo de asignados de un work item: borra todas las filas
 * existentes e inserta las nuevas (mismo patrón borrar+insertar de
 * `replaceQuoteItems`). Con `userIds` vacío deja el work item sin asignados. */
export async function setAssignees(
  db: Db,
  workItemId: string,
  orgId: string,
  userIds: string[],
): Promise<void> {
  const { error: deleteError } = await db
    .from("work_item_assignees")
    .delete()
    .eq("work_item_id", workItemId);
  if (deleteError) throw deleteError;

  if (userIds.length === 0) return;

  const { error: insertError } = await db.from("work_item_assignees").insert(
    userIds.map((userId) => ({
      work_item_id: workItemId,
      user_id: userId,
      organization_id: orgId,
    })),
  );
  if (insertError) throw insertError;
}
