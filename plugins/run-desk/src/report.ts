import { estimatedCostUsd, type Run } from "./model.ts";
import type { WandbReport } from "./wandb.ts";

type Evidence = Record<string, unknown>;

const usd = (value: number) => `$${value.toFixed(2)}`;
const n = (value: unknown) => (typeof value === "number" ? String(Number(value.toPrecision(6))) : String(value));

export function evidenceSummary(evidence: Evidence): string {
  const head = `${evidence.outcome} ${evidence.stage} evidence for ${evidence.entry}`;
  const gap = typeof evidence.gap === "object" && evidence.gap ? ` Gap: ${(evidence.gap as { concept: string }).concept}.` : "";
  if (evidence.stage === "optimize") {
    return `${head}: ${evidence.metric} ${n(evidence.baseline)} -> ${n(evidence.result)} ${evidence.unit} (${evidence.better} is better) on ${evidence.hardware}. Why: ${evidence.why}${gap}`;
  }
  if (evidence.stage === "implement") {
    const tests = evidence.tests as { passed: number; total: number };
    return `${head}: ${tests.passed}/${tests.total} tests against ${evidence.reference}.${gap}`;
  }
  const throughput = evidence.throughput as { value: number; unit: string };
  const cost = evidence.costPer1k as { usd: number };
  return `${head}: p50 ${n(evidence.p50Ms)} ms, p95 ${n(evidence.p95Ms)} ms, ${n(throughput.value)} ${throughput.unit}, ${usd(cost.usd)} per 1k on ${evidence.hardware}.${gap}`;
}

export function wandbSummary(report: WandbReport | undefined): string[] {
  if (!report) return ["W&B: no W&B run found in this run's logs."];
  if (report.status === "not-configured") return [report.notice];
  if (report.status === "error") return [`W&B: ${report.error}`];
  const metrics = Object.entries(report.summary).slice(0, 12).map(([key, value]) => `${key}=${n(value)}`).join(", ");
  const lines = [`W&B run ${report.path} (${report.state}). Final metrics: ${metrics || "none"}.`];
  const loss = report.loss;
  if (loss) {
    lines.push(`Loss curve (${loss.key}, ${loss.points} samples, steps ${loss.firstStep}-${loss.lastStep}): ${n(loss.first)} -> ${n(loss.last)} (${loss.changePct.toFixed(1)}%), min ${n(loss.min)} at step ${loss.minStep}, ${loss.trend} at the end.`);
  }
  return lines;
}

export function runReport(run: Run, evidence: Evidence | undefined, wandb: WandbReport | undefined, now: Date): string {
  const lines = [
    `Run ${run.id} (${run.template.name}): ${run.status}. ${run.template.entryId}, ${run.template.stage} stage, ${run.template.gpu} at about ${usd(run.template.hourlyUsd)}/h, estimated cost so far ${usd(estimatedCostUsd(run, now))}.`,
  ];
  if (run.error) lines.push(`Note: ${run.error}`);
  lines.push(evidence ? `Evidence: ${evidenceSummary(evidence)}` : "Evidence: none written for this run.");
  lines.push(...wandbSummary(wandb));
  return lines.join("\n");
}
