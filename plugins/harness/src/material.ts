import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { baseArxivId, isArxivId, type ArxivClient } from "./arxiv.ts";
import { parseEntryId, type Entry, type EntryId } from "./domain.ts";
import { exists, writeFileAtomic } from "./files.ts";

const run = promisify(execFile);
const USER_AGENT = "LearnHarness-Harness/0.1";

export interface AlphaxivInfo { available: true; citations?: number; bibtex?: string; license?: string; url: string }
export type AlphaxivResult = AlphaxivInfo | { available: false; reason: string };
export interface Reference { title: string; year?: number; arxivId?: string }
export interface OwnWorkNote { path: string; project: string; type: "Decision" | "Experiment" | "Architecture"; topic: string; entryId: EntryId }

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class MaterialDesk {
  constructor(
    private readonly dataDirectory: string,
    private readonly arxiv: ArxivClient,
    private readonly fetcher: typeof fetch = fetch,
    private readonly backoffMs = 1000,
  ) {}

  paperPdfPath(arxivId: string): string {
    return path.join(this.dataDirectory, "papers", baseArxivId(arxivId), "paper.pdf");
  }

  checkoutPath(repoUrl: string, commit: string): string {
    return path.join(this.dataDirectory, "frameworks", `${frameworkName(repoUrl)}@${commit.slice(0, 7)}`);
  }

  async localPaths(entry: Entry): Promise<{ pdfPath?: string; checkoutPath?: string; vaultNotePath?: string }> {
    const source = entry.source;
    if (source.kind === "paper") {
      const pdfPath = this.paperPdfPath(source.arxivId);
      return (await exists(pdfPath)) ? { pdfPath } : {};
    }
    if (source.kind === "framework") {
      const checkoutPath = this.checkoutPath(source.repoUrl, source.commit);
      return (await exists(checkoutPath)) ? { checkoutPath } : {};
    }
    return { vaultNotePath: source.vaultNotePath };
  }

  async ensurePdf(arxivId: string, signal?: AbortSignal): Promise<string> {
    const file = this.paperPdfPath(arxivId);
    if (await exists(file)) return file;
    await writeFileAtomic(file, await this.arxiv.pdf(baseArxivId(arxivId), signal));
    return file;
  }

  /** alphaXiv's metadata endpoint is undocumented, so any failure reads as unavailable. */
  async alphaxiv(arxivId: string, signal?: AbortSignal): Promise<AlphaxivResult> {
    try {
      const response = await this.fetcher(`https://api.alphaxiv.org/papers/v3/${baseArxivId(arxivId)}`, { headers: { "user-agent": USER_AGENT }, signal: signal ?? AbortSignal.timeout(8000) });
      if (!response.ok) return { available: false, reason: `alphaXiv answered ${response.status}.` };
      const body = await response.json() as { citationsCount?: unknown; citationBibtex?: unknown; license?: unknown };
      return {
        available: true,
        citations: typeof body.citationsCount === "number" ? body.citationsCount : undefined,
        bibtex: typeof body.citationBibtex === "string" ? body.citationBibtex : undefined,
        license: typeof body.license === "string" ? body.license : undefined,
        url: `https://www.alphaxiv.org/abs/${baseArxivId(arxivId)}`,
      };
    } catch (error) {
      return { available: false, reason: `alphaXiv is unreachable: ${(error as Error).message}` };
    }
  }

  async references(arxivId: string, signal?: AbortSignal): Promise<Reference[]> {
    const url = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${baseArxivId(arxivId)}/references?fields=title,externalIds,year&limit=100`;
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetcher(url, { headers: { "user-agent": USER_AGENT }, signal });
      if (response.status === 429 && attempt < 4) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoffMs * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Semantic Scholar answered ${response.status}.`);
      const body = await response.json() as { data?: { citedPaper?: { title?: string; year?: number; externalIds?: { ArXiv?: string } } }[] };
      return (body.data ?? []).flatMap(({ citedPaper }) => citedPaper?.title ? [{ title: citedPaper.title, year: citedPaper.year ?? undefined, arxivId: citedPaper.externalIds?.ArXiv }] : []);
    }
  }

  async checkout(repoUrl: string, commitOrRef: string, signal?: AbortSignal): Promise<{ commit: string; path: string }> {
    const commit = /^[0-9a-f]{40}$/.test(commitOrRef) ? commitOrRef : await resolveRef(repoUrl, commitOrRef, signal);
    const target = this.checkoutPath(repoUrl, commit);
    if (await exists(target)) return { commit, path: target };
    const staging = `${target}.partial`;
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const git = (...args: string[]) => run("git", args, { cwd: staging, signal, maxBuffer: 16 * 1024 * 1024 });
    try {
      await git("init", "--quiet");
      await git("remote", "add", "origin", repoUrl);
      await git("fetch", "--quiet", "--depth", "1", "origin", commit);
      await git("checkout", "--quiet", "--detach", "FETCH_HEAD");
      await run("chmod", ["-R", "a-w", staging], { signal });
      await fs.rename(staging, target);
    } catch (error) {
      await run("chmod", ["-R", "u+w", staging]).catch(() => undefined);
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    }
    return { commit, path: target };
  }

  async ownWorkNotes(vaultPath: string): Promise<OwnWorkNote[]> {
    const notes: OwnWorkNote[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const item of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
        if (item.name.startsWith(".") || item.name === "LearnHarness") continue;
        const full = path.join(directory, item.name);
        if (item.isDirectory()) await walk(full);
        else if (item.isFile()) {
          const note = parseOwnWorkName(path.relative(vaultPath, full));
          if (note) notes.push(note);
        }
      }
    };
    await walk(vaultPath);
    return notes.sort((a, b) => a.path.localeCompare(b.path));
  }
}

const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function frameworkName(repoUrl: string): string {
  const name = slug(repoUrl.replace(/\.git$/, "").replace(/\/+$/, "").split(/[/:]/).pop() ?? "");
  if (!name) throw new Error(`Cannot name a framework from ${repoUrl}.`);
  return name;
}

export function parseOwnWorkName(relativePath: string): OwnWorkNote | undefined {
  const match = /^(.+?) - (Decision|Experiment|Architecture)(?: - (.+))?\.md$/.exec(path.basename(relativePath));
  if (!match) return undefined;
  const [, project = "", type, topic = "architecture"] = match;
  const entryId = parseEntryId(`own.${slug(project)}.${slug(topic)}`);
  return entryId ? { path: relativePath, project, type: type as OwnWorkNote["type"], topic, entryId } : undefined;
}

async function resolveRef(repoUrl: string, ref: string, signal?: AbortSignal): Promise<string> {
  const { stdout } = await run("git", ["ls-remote", repoUrl, ref], { signal });
  const commit = stdout.split("\n")[0]?.split("\t")[0];
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${repoUrl} has no ref ${ref}. Give a full commit or a branch or tag name.`);
  return commit;
}

export function paperEntry(arxivId: string, title: string, lineage: string | undefined, pdfPath: string): Entry {
  const id = parseEntryId(`paper.${baseArxivId(arxivId)}`);
  if (!id || !isArxivId(arxivId)) throw new Error(`${arxivId} is not an arXiv id.`);
  return { id, kind: "paper", title, ...(lineage ? { lineage } : {}), source: { kind: "paper", arxivId: baseArxivId(arxivId), pdfPath } };
}
