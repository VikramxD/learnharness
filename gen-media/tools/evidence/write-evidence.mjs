#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA, validateEvidence, evidenceFileName } from "../../contracts/evidence/validate.mjs";

const USAGE = `Usage: node write-evidence.mjs --repo <path> --entry <id> --stage <implement|optimize|serve>
  --outcome <pass|fail> --command "<exact command>" [stage flags] [--from-json <file>]
  [--gap-concept <concept> --gap-why <why>]

implement: --reference --tests-passed --tests-total
optimize:  --metric --unit --better <lower|higher> --baseline --result --hardware --why
serve:     --endpoint --hardware --p50-ms --p95-ms --throughput --throughput-unit --cost-per-1k-usd`;

const text = (...at) => ({ at, parse: (v) => v });
const number = (...at) => ({ at, parse: (v) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v) });

const COMMON = {
	entry: text("entry"),
	stage: text("stage"),
	outcome: text("outcome"),
	command: text("command"),
	"gap-concept": text("gap", "concept"),
	"gap-why": text("gap", "why"),
};

const STAGE_FIELDS = {
	implement: {
		reference: text("reference"),
		"tests-passed": number("tests", "passed"),
		"tests-total": number("tests", "total"),
	},
	optimize: {
		metric: text("metric"),
		unit: text("unit"),
		better: text("better"),
		baseline: number("baseline"),
		result: number("result"),
		hardware: text("hardware"),
		why: text("why"),
	},
	serve: {
		endpoint: text("endpoint"),
		hardware: text("hardware"),
		"p50-ms": number("p50Ms"),
		"p95-ms": number("p95Ms"),
		throughput: number("throughput", "value"),
		"throughput-unit": text("throughput", "unit"),
		"cost-per-1k-usd": number("costPer1k", "usd"),
	},
};

const CLI_FILLED = ["schema", "producedAt", "source"];

function parseFlags(argv) {
	const flags = new Map();
	const errors = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			errors.push(`Unexpected argument ${arg}.`);
			continue;
		}
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) {
			errors.push(`${arg} needs a value.`);
			continue;
		}
		flags.set(arg.slice(2), value);
		i++;
	}
	return { flags, errors };
}

function setAt(target, [head, ...rest], value) {
	if (rest.length === 0) {
		target[head] = value;
		return;
	}
	if (typeof target[head] !== "object" || target[head] === null) target[head] = {};
	setAt(target[head], rest, value);
}

function readJson(file, errors) {
	try {
		const value = JSON.parse(fs.readFileSync(file, "utf8"));
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			errors.push(`--from-json ${file} must hold a JSON object.`);
			return {};
		}
		for (const key of CLI_FILLED) {
			if (key in value) errors.push(`--from-json cannot set ${key}; the CLI fills it.`);
		}
		return value;
	} catch (error) {
		errors.push(`--from-json ${file} could not be read: ${error.message}`);
		return {};
	}
}

function gitSource(repo) {
	const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	let root;
	let commit;
	try {
		root = git("rev-parse", "--show-toplevel");
		commit = git("rev-parse", "HEAD");
	} catch {
		return { error: `${repo} is not inside a git repo with a commit.` };
	}
	const dirty = execFileSync("git", ["-C", root, "status", "--porcelain", "--", ".", ":(exclude)evidence"], { encoding: "utf8" }).trim();
	if (dirty) return { error: `${root} has uncommitted changes outside evidence/. Commit the attempt, rerun the command, then record it.` };
	return { root, commit };
}

function buildEvidence(argv, now) {
	const { flags, errors } = parseFlags(argv);
	const repoFlag = flags.get("repo");
	flags.delete("repo");
	const jsonFile = flags.get("from-json");
	flags.delete("from-json");

	const evidence = jsonFile ? readJson(jsonFile, errors) : {};
	const stage = flags.get("stage") ?? evidence.stage;
	const allowed = STAGE_FIELDS[stage] ?? {};
	for (const [name, raw] of flags) {
		const field = COMMON[name] ?? allowed[name];
		if (field) setAt(evidence, field.at, field.parse(raw));
		else if (Object.values(STAGE_FIELDS).some((fields) => name in fields)) errors.push(`--${name} does not belong to stage ${stage}.`);
		else errors.push(`Unknown flag --${name}.`);
	}

	let source = { repo: "(unknown)", commit: "(unknown)" };
	let root;
	if (repoFlag === undefined) errors.push("--repo is required.");
	else {
		const git = gitSource(path.resolve(repoFlag));
		if (git.error) errors.push(git.error);
		else {
			root = git.root;
			source = { repo: git.root, commit: git.commit };
		}
	}

	const producedAt = now.toISOString().replace(/\.\d+Z$/, "Z");
	const header = { schema: SCHEMA, entry: evidence.entry, stage: evidence.stage, outcome: evidence.outcome, producedAt, source, command: evidence.command };
	const filled = { ...header, ...evidence, ...header };
	const result = validateEvidence(filled);
	if (!result.ok) errors.push(...result.errors);
	return { evidence: filled, root, errors };
}

function main(argv) {
	if (argv.length === 0 || argv.includes("--help")) {
		console.log(USAGE);
		return argv.length === 0 ? 1 : 0;
	}
	const { evidence, root, errors } = buildEvidence(argv, new Date());
	if (errors.length) {
		for (const error of errors) console.error(error);
		return 1;
	}
	const dir = path.join(root, "evidence", evidence.entry, evidence.stage);
	const file = path.join(dir, evidenceFileName(evidence.producedAt));
	fs.mkdirSync(dir, { recursive: true });
	try {
		fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		console.error(`${file} already exists. Evidence files are append-only; record again in a second.`);
		return 1;
	}
	console.log(file);
	return 0;
}

process.exitCode = main(process.argv.slice(2));
