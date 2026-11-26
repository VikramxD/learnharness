import { parseEntryId, type EntryId } from "./domain.ts";

const field = (input: unknown, key: string): unknown => (typeof input === "object" && input !== null ? (input as Record<string, unknown>)[key] : undefined);

export function requiredText(input: unknown, key: string): string {
  const value = field(input, key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}

export function optionalText(input: unknown, key: string): string | undefined {
  const value = field(input, key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requiredEntryId(input: unknown, key = "entryId"): EntryId {
  const value = field(input, key);
  const id = parseEntryId(value);
  if (!id) throw new Error(`${key} must be a Harness entry id, such as paper.2006.11239.`);
  return id;
}
