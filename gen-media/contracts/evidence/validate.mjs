export const SCHEMA = "lh-evidence/1";
export const STAGES = ["implement", "optimize", "serve"];

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const ENTRY_ID = /^(paper\.[0-9]{4}\.[0-9]{4,5}(v[0-9]+)?|framework\.[a-z0-9-]+(\.[a-z0-9-]+)*|own\.[a-z0-9-]+\.[a-z0-9-]+)$/;

export function evidenceFileName(producedAt) {
	return `${producedAt.replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "")}.json`;
}

export function validateEvidence(value) {
	const errors = [];
	const need = (ok, message) => {
		if (!ok) errors.push(message);
	};
	if (!isObject(value)) return { ok: false, errors: ["Evidence must be a JSON object."] };

	need(value.schema === SCHEMA, `schema must be "${SCHEMA}".`);
	need(isText(value.entry) && ENTRY_ID.test(value.entry), "entry must be a Harness entry id, such as paper.2006.11239.");
	need(STAGES.includes(value.stage), `stage must be one of ${STAGES.join(", ")}.`);
	need(value.outcome === "pass" || value.outcome === "fail", 'outcome must be "pass" or "fail".');
	need(isText(value.producedAt) && !Number.isNaN(Date.parse(value.producedAt)) && value.producedAt.endsWith("Z"), "producedAt must be an ISO 8601 UTC timestamp.");
	need(isObject(value.source) && isText(value.source.repo) && isText(value.source.commit), "source must have repo and commit.");
	need(isText(value.command), "command must name the exact command that produced the result.");

	if (value.gap !== undefined) {
		need(isObject(value.gap) && isText(value.gap.concept) && isText(value.gap.why), "gap must have concept and why.");
		need(value.outcome === "fail", "gap is allowed only when outcome is fail.");
	}

	if (value.stage === "implement") {
		need(isText(value.reference), "implement needs reference.");
		const t = value.tests;
		const shaped = isObject(t) && isCount(t.passed) && isCount(t.total) && t.passed <= t.total;
		need(shaped, "implement needs tests with passed <= total, both whole numbers.");
		if (shaped && value.outcome === "pass") {
			need(t.total > 0 && t.passed === t.total, "implement passes only when every test passed.");
		}
	}

	if (value.stage === "optimize") {
		need(isText(value.metric) && isText(value.unit) && isText(value.hardware) && isText(value.why), "optimize needs metric, unit, hardware and why.");
		need(value.better === "lower" || value.better === "higher", 'optimize needs better as "lower" or "higher".');
		const shaped = isNumber(value.baseline) && isNumber(value.result);
		need(shaped, "optimize needs numeric baseline and result.");
		if (shaped && value.outcome === "pass") {
			const beats = value.better === "lower" ? value.result < value.baseline : value.result > value.baseline;
			need(beats, "optimize passes only when result beats baseline.");
		}
	}

	if (value.stage === "serve") {
		need(isText(value.endpoint) && isText(value.hardware), "serve needs endpoint and hardware.");
		const latency = isNumber(value.p50Ms) && isNumber(value.p95Ms);
		need(latency, "serve needs numeric p50Ms and p95Ms.");
		need(isObject(value.throughput) && isNumber(value.throughput.value) && isText(value.throughput.unit), "serve needs throughput with value and unit.");
		need(isObject(value.costPer1k) && isNumber(value.costPer1k.usd), "serve needs costPer1k with usd.");
		if (value.outcome === "pass" && latency) {
			need(value.p50Ms > 0 && value.p95Ms >= value.p50Ms, "serve passes only with p50Ms > 0 and p95Ms >= p50Ms.");
			need(isObject(value.throughput) && value.throughput.value > 0, "serve passes only with positive throughput.");
			need(isObject(value.costPer1k) && value.costPer1k.usd >= 0, "serve passes only with a non-negative cost.");
		}
	}

	return errors.length ? { ok: false, errors } : { ok: true, evidence: value };
}
