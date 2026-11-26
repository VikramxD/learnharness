type Child = Node | string | false | undefined | null;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string } & Record<string, string | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((child): child is Node | string => child !== false && child !== undefined && child !== null));
  return node;
}

export const usd = (value: number) => `$${value.toFixed(2)}`;

export function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
