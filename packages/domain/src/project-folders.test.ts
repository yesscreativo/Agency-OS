import { describe, expect, it } from "vitest";
import { groupProjectsByFolder } from "./project-folders";

interface TestFolder {
  id: string;
  sortOrder: number;
}

interface TestProject {
  id: string;
  folderId: string | null;
}

describe("groupProjectsByFolder", () => {
  it("agrupa proyectos bajo su carpeta y deja el resto en 'Sin carpeta' (folder: null) al final", () => {
    const folders: TestFolder[] = [
      { id: "f1", sortOrder: 0 },
      { id: "f2", sortOrder: 1 },
    ];
    const projects: TestProject[] = [
      { id: "p1", folderId: "f1" },
      { id: "p2", folderId: null },
      { id: "p3", folderId: "f2" },
      { id: "p4", folderId: "f1" },
    ];
    const groups = groupProjectsByFolder(folders, projects);
    expect(groups).toEqual([
      { folder: folders[0], projects: [projects[0], projects[3]] },
      { folder: folders[1], projects: [projects[2]] },
      { folder: null, projects: [projects[1]] },
    ]);
  });

  it("ordena las carpetas por sortOrder", () => {
    const folders: TestFolder[] = [
      { id: "f2", sortOrder: 1 },
      { id: "f1", sortOrder: 0 },
    ];
    const groups = groupProjectsByFolder(folders, []);
    expect(groups.map((g) => g.folder?.id ?? null)).toEqual(["f1", "f2", null]);
  });

  it("incluye una carpeta vacía (0 proyectos) en vez de omitirla", () => {
    const folders: TestFolder[] = [{ id: "f1", sortOrder: 0 }];
    const groups = groupProjectsByFolder(folders, []);
    expect(groups).toEqual([
      { folder: folders[0], projects: [] },
      { folder: null, projects: [] },
    ]);
  });

  it("sin carpetas, solo devuelve el grupo 'Sin carpeta' con todos los proyectos", () => {
    const projects: TestProject[] = [{ id: "p1", folderId: null }];
    const groups = groupProjectsByFolder([], projects);
    expect(groups).toEqual([{ folder: null, projects }]);
  });
});
