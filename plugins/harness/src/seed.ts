import { parseEntryId, type Entry, type EntryId } from "./domain.ts";

export interface Roadmap {
  lineages: { name: string; papers: { arxivId: string; title: string; question: string }[] }[];
  frameworks: {
    id: string; title: string; repoUrl: string; commit: string; question: string;
    parts?: { part: string; title: string; question: string }[];
  }[];
}

export const FRAMEWORK_LINEAGE = "Framework order";

const requireId = (value: string): EntryId => {
  const id = parseEntryId(value);
  if (!id) throw new Error(`Seed has an invalid entry id: ${value}`);
  return id;
};

/** Every seeded entry in roadmap order, with each entry's central question. */
export function seedEntries(roadmap: Roadmap): { entry: Entry; question: string }[] {
  const papers = roadmap.lineages.flatMap(lineage => lineage.papers.map(paper => ({
    entry: { id: requireId(`paper.${paper.arxivId}`), kind: "paper" as const, title: paper.title, lineage: lineage.name, source: { kind: "paper" as const, arxivId: paper.arxivId } },
    question: paper.question,
  })));
  const frameworks = roadmap.frameworks.flatMap(framework => {
    const source = { kind: "framework" as const, repoUrl: framework.repoUrl, commit: framework.commit };
    const parent = { entry: { id: requireId(framework.id), kind: "framework" as const, title: framework.title, lineage: FRAMEWORK_LINEAGE, source }, question: framework.question };
    const parts = (framework.parts ?? []).map(part => ({
      entry: { id: requireId(`${framework.id}.${part.part}`), kind: "framework" as const, title: part.title, parentId: parent.entry.id, source },
      question: part.question,
    }));
    return [parent, ...parts];
  });
  return [...papers, ...frameworks];
}
