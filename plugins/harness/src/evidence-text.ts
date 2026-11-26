import type { Evidence } from "./domain.ts";

export function evidenceSummary(evidence: Evidence): string {
  switch (evidence.stage) {
    case "implement": return `${evidence.tests.passed}/${evidence.tests.total} tests against ${evidence.reference}`;
    case "optimize": return `${evidence.metric} ${evidence.result} ${evidence.unit} vs baseline ${evidence.baseline} ${evidence.unit} (${evidence.better} is better) on ${evidence.hardware}`;
    case "serve": return `p50 ${evidence.p50Ms} ms, p95 ${evidence.p95Ms} ms, ${evidence.throughput.value} ${evidence.throughput.unit}, $${evidence.costPer1k.usd} per 1k on ${evidence.hardware}`;
  }
}
