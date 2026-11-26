export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  categories: string[];
}

const ARXIV_ID = /^\d{4}\.\d{4,5}(v\d+)?$/;
export const isArxivId = (value: string) => ARXIV_ID.test(value.trim());
/** The id without its version suffix: entries name a paper, not a revision. */
export const baseArxivId = (value: string) => value.trim().replace(/v\d+$/, "");

const decode = (text: string) => text
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

const tag = (xml: string, name: string) => decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? "");

/** Parse arXiv's Atom feed. Error entries (an unknown id) carry no `/abs/` id and are skipped. */
export function parseAtom(xml: string): ArxivPaper[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry = ""]) => {
    const id = /<id>\s*https?:\/\/arxiv\.org\/abs\/([^<\s]+)\s*<\/id>/.exec(entry)?.[1];
    if (!id) return [];
    return [{
      id: baseArxivId(id),
      title: tag(entry, "title"),
      authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map(m => decode(m[1] ?? "")),
      abstract: tag(entry, "summary"),
      published: tag(entry, "published"),
      categories: [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map(m => m[1]!),
    }];
  });
}

/** Runs tasks one at a time with at least `spacingMs` between starts: arXiv asks for one request per 3 s. */
export class SpacedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private nextStart = 0;

  constructor(private readonly spacingMs: number, private readonly clock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>(r => setTimeout(r, ms)) }) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const go = async () => {
      const wait = this.nextStart - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      this.nextStart = this.clock.now() + this.spacingMs;
      return task();
    };
    const result = this.tail.then(go, go);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

const API = "https://export.arxiv.org/api/query";
const USER_AGENT = "LearnHarness-Harness/0.1";

export class ArxivClient {
  constructor(private readonly queue = new SpacedQueue(3000), private readonly fetcher: typeof fetch = fetch) {}

  private async query(params: Record<string, string>, signal?: AbortSignal): Promise<ArxivPaper[]> {
    return this.queue.run(async () => {
      const response = await this.fetcher(`${API}?${new URLSearchParams(params)}`, { headers: { "user-agent": USER_AGENT }, signal });
      if (!response.ok) throw new Error(`arXiv answered ${response.status}.`);
      return parseAtom(await response.text());
    });
  }

  byIds(ids: readonly string[], signal?: AbortSignal) {
    return this.query({ id_list: ids.join(","), max_results: String(ids.length) }, signal);
  }

  /** An arXiv id looks the paper up directly; anything else is a relevance search over all fields. */
  search(text: string, signal?: AbortSignal, maxResults = 15) {
    const query = text.trim();
    if (isArxivId(query)) return this.byIds([query], signal);
    const terms = query.split(/\s+/).filter(Boolean).map(term => `all:${term.replace(/[^\p{L}\p{N}-]/gu, "")}`).filter(term => term !== "all:");
    return this.query({ search_query: terms.join(" AND "), sortBy: "relevance", max_results: String(maxResults) }, signal);
  }

  /** Newest cs.CV and cs.LG submissions matching any keyword. */
  feed(keywords: readonly string[], signal?: AbortSignal, maxResults = 25) {
    const words = keywords.map(k => `abs:"${k.replace(/"/g, "")}"`).join(" OR ");
    const search = `(cat:cs.CV OR cat:cs.LG)${words ? ` AND (${words})` : ""}`;
    return this.query({ search_query: search, sortBy: "submittedDate", sortOrder: "descending", max_results: String(maxResults) }, signal);
  }

  async pdf(id: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.queue.run(async () => {
      const response = await this.fetcher(`https://arxiv.org/pdf/${id}`, { headers: { "user-agent": USER_AGENT }, signal, redirect: "follow" });
      if (!response.ok) throw new Error(`arXiv PDF for ${id} answered ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error(`arXiv did not return a PDF for ${id}.`);
      return bytes;
    });
  }
}
