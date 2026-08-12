import { describe, expect, test } from "bun:test";
import { displayMarkdown } from "./document-markdown";

describe("document Markdown", () => {
  test("removes governance front matter from the rendered document", () => {
    expect(displayMarkdown("---\nid: example\nstatus: proposed\n---\n\n# Example\n\nBody\n")).toBe(
      "# Example\n\nBody\n",
    );
  });

  test("preserves an ordinary Markdown document", () => {
    expect(displayMarkdown("# Example\n\nBody\n")).toBe("# Example\n\nBody\n");
  });
});
