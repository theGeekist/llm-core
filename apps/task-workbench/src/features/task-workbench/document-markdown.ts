export const displayMarkdown = (content: string): string =>
  content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "").trimStart();
