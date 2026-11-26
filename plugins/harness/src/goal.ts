import type { Entry, UnderstandStatus } from "./domain.ts";

export interface GoalInput {
  entry: Entry;
  paths: { pdfPath?: string; checkoutPath?: string; vaultNotePath?: string };
  /** Earlier entries of the lineage that are already understood. */
  understoodPrerequisites: Entry[];
  question?: string;
  understand: UnderstandStatus;
}

function materialLines({ entry, paths }: GoalInput): string[] {
  const source = entry.source;
  if (source.kind === "paper") {
    return paths.pdfPath
      ? [`The paper is on disk at ${paths.pdfPath} (arXiv ${source.arxivId}). Read it from there.`]
      : [`The paper is arXiv ${source.arxivId}; its PDF is not downloaded yet.`];
  }
  if (source.kind === "framework") {
    return paths.checkoutPath
      ? [`The source is checked out read-only at ${paths.checkoutPath}, pinned to ${source.repoUrl} at commit ${source.commit}. Read the code from there.`]
      : [`The source is ${source.repoUrl} at commit ${source.commit}; it is not checked out yet.`];
  }
  return [`The material is my own note at ${source.vaultNotePath}.`];
}

/** The goal the learner pastes into a new Teach session. */
export function teachingGoal(input: GoalInput): string {
  const { entry, understoodPrerequisites, question, understand } = input;
  const lines: string[] = [];
  if (understand.state === "reopened") {
    const { gap } = understand;
    lines.push(`Teach me ${gap.concept}, as it applies to ${entry.title} (${entry.id}).`);
    lines.push(`My ${gap.stage} attempt failed because of it: ${gap.why}`);
  } else {
    lines.push(`Teach me ${entry.title} (${entry.id}) until it feels obviously true, down to its derivations or design.`);
  }
  lines.push(...materialLines(input));
  if (understoodPrerequisites.length) {
    lines.push(`Already understood in this lineage: ${understoodPrerequisites.map(p => `${p.title} (${p.id})`).join("; ")}. Build on them.`);
  }
  if (understand.state === "reopened") {
    lines.push(`Central question: what about ${understand.gap.concept} did I get wrong, and what is actually true?`);
  } else if (question) {
    lines.push(`Central question: ${question}`);
  } else {
    lines.push(`Central question: what problem does ${entry.title} solve, and why does its method take the form it does?`);
  }
  return lines.join("\n");
}
