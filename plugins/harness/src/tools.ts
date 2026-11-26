import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { PluginAgentKind } from "learnharness-plugin-api";
import { Type } from "typebox";
import type { Harness } from "./service.ts";

export const TOOL_AGENTS: PluginAgentKind[] = ["prober", "teacher", "practice"];

export const INSTRUCTIONS = [
  "Harness tools are available for the learner's material:",
  "- material_search finds arXiv papers by words or id.",
  "- material_fetch returns local file paths for a paper PDF, a framework checkout or an own-work note. Read those files with your own PDF and file tools.",
  "- ledger_status shows where each Stage ledger entry stands across Understand, Implement, Optimize and Serve.",
].join("\n");

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: value as never });

export function harnessTools(harness: Harness): AgentTool<any>[] {
  const { operations } = harness;
  return [
    {
      name: "material_search",
      label: "Material search",
      description: "Search arXiv for papers by words or by arXiv id. Returns id, title, authors, abstract, publication date and whether the paper is already a Stage ledger entry.",
      parameters: Type.Object({ query: Type.String({ description: "Words, or an arXiv id such as 2407.01392." }) }),
      execute: async (_id, params, signal) => {
        signal?.throwIfAborted();
        const papers = await operations.search(params);
        return text(papers.map(({ id, title, authors, abstract, published, inLedger }) => ({ id, title, authors: authors.slice(0, 6), published, inLedger, abstract })));
      },
    },
    {
      name: "material_fetch",
      label: "Material fetch",
      description: "Return local file paths for material: an arXiv id or paper entry id gives the PDF path (downloading it if needed), a framework entry id gives its read-only checkout, an own-work entry id gives its vault note.",
      parameters: Type.Object({ id: Type.String({ description: "An arXiv id (2006.11239) or an entry id (paper.2006.11239, framework.sglang.radix-cache, own.auteur.architecture)." }) }),
      execute: async (_id, params, signal) => {
        signal?.throwIfAborted();
        return text(await operations.materialFetch(params));
      },
    },
    {
      name: "ledger_status",
      label: "Stage ledger status",
      description: "Read-only. List Stage ledger entries with their Understand, Implement, Optimize and Serve status, or one entry with its local paths.",
      parameters: Type.Object({ entryId: Type.Optional(Type.String({ description: "One entry id; omit for every entry." })) }),
      execute: async (_id, params, signal) => {
        signal?.throwIfAborted();
        return text(await operations.ledgerStatus(params));
      },
    },
  ];
}
