import type { ChatListItem, GraphChain, PluginLearningData } from "learnharness-plugin-api";
import type { Entry } from "./domain.ts";

export interface SessionSummary { id: string; title: string; kind: string; updatedAt: string }
export interface LinkedSession extends SessionSummary { chains: number }
export interface SuggestedSession extends SessionSummary { mentions: string[] }

const summary = (item: ChatListItem): SessionSummary => ({ id: item.id, title: item.title, kind: item.kind, updatedAt: item.updatedAt });

export function mentionNeedles(entry: Entry, paths: { pdfPath?: string; checkoutPath?: string }): string[] {
  const needles = [entry.id as string];
  if (entry.source.kind === "paper") needles.push(entry.source.arxivId);
  if (paths.pdfPath) needles.push(paths.pdfPath);
  if (paths.checkoutPath) needles.push(paths.checkoutPath);
  return needles;
}

export const chainsFrom = (chains: readonly GraphChain[], chatIds: readonly string[]): GraphChain[] => {
  const wanted = new Set(chatIds);
  return chains.filter(chain => chain.provenance.some(point => wanted.has(point.chatId)));
};

export class SessionReader {
  private texts = new Map<string, { updatedAt: string; text: string }>();

  constructor(private readonly learning: PluginLearningData) {}

  list(): SessionSummary[] {
    return this.learning.listSessions().map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private text(item: ChatListItem): string {
    const cached = this.texts.get(item.id);
    if (cached?.updatedAt === item.updatedAt) return cached.text;
    const record = this.learning.getSession(item.id);
    const text = record ? JSON.stringify(record.messages).toLowerCase() : "";
    this.texts.set(item.id, { updatedAt: item.updatedAt, text });
    return text;
  }

  view(chatIds: readonly string[], needles: readonly string[]): { linked: LinkedSession[]; suggested: SuggestedSession[]; chainIds: string[] } {
    const items = this.learning.listSessions();
    const chains = this.learning.graph().chains;
    const byId = new Map(items.map(item => [item.id, item]));
    const linked = chatIds.map(id => {
      const item = byId.get(id);
      const base = item ? summary(item) : { id, title: "(session not found)", kind: "teach", updatedAt: "" };
      return { ...base, chains: chainsFrom(chains, [id]).length };
    });
    const jsonEscaped = needles.map(n => JSON.stringify(n.toLowerCase()).slice(1, -1));
    const suggested = items
      .filter(item => !chatIds.includes(item.id))
      .flatMap(item => {
        const text = this.text(item);
        const mentions = needles.filter((_, i) => text.includes(jsonEscaped[i]!));
        return mentions.length ? [{ ...summary(item), mentions }] : [];
      });
    return { linked, suggested, chainIds: chainsFrom(chains, chatIds).map(chain => chain.id) };
  }
}
