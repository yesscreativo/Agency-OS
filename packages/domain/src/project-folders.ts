export interface FolderGroup<TFolder, TProject> {
  /** `null` = el grupo "Sin carpeta". */
  folder: TFolder | null;
  projects: TProject[];
}

/** Agrupa `projects` bajo su `folderId`, en el orden de `sortOrder` de cada
 * carpeta, y agrega al final el grupo "Sin carpeta" (folder: null) con los
 * proyectos que no tienen `folderId`. Las carpetas sin proyectos SÍ se
 * incluyen (con `projects: []`) — la UI decide si ocultarlas o no. */
export function groupProjectsByFolder<
  TFolder extends { id: string; sortOrder: number },
  TProject extends { folderId: string | null },
>(folders: TFolder[], projects: TProject[]): FolderGroup<TFolder, TProject>[] {
  const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
  const byFolder = new Map<string, TProject[]>();
  const unfiled: TProject[] = [];
  for (const project of projects) {
    if (project.folderId) {
      const list = byFolder.get(project.folderId);
      if (list) list.push(project);
      else byFolder.set(project.folderId, [project]);
    } else {
      unfiled.push(project);
    }
  }
  const groups: FolderGroup<TFolder, TProject>[] = sortedFolders.map((folder) => ({
    folder,
    projects: byFolder.get(folder.id) ?? [],
  }));
  groups.push({ folder: null, projects: unfiled });
  return groups;
}
