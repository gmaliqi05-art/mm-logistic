/**
 * Strip markdown to plain text — for display and, especially, for
 * text-to-speech, which otherwise reads "**" and "*" aloud as noise.
 *
 * Handles the common markers a chat model emits: bold/italic (** * __ _),
 * inline code (`), headings (#), block quotes (>), list bullets (-, *, 1.)
 * and links [text](url) -> text. Not a full markdown parser — just enough to
 * make a spoken/plain reply clean.
 */
export function stripMarkdown(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);

  // Links / images: [text](url) -> text ; ![alt](url) -> alt
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Inline code / code fences
  s = s.replace(/```[a-z]*\n?/gi, '').replace(/`([^`]*)`/g, '$1').replace(/`/g, '');
  // Bold / italic markers (leave the inner text)
  s = s.replace(/\*\*/g, '').replace(/__/g, '');
  s = s.replace(/(^|[\s(])[*_]([^*_\n]+)[*_]/g, '$1$2');
  s = s.replace(/[*_]/g, '');
  // Headings, blockquotes at line starts
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s{0,3}>\s?/gm, '');
  // List bullets at line starts: "- ", "* ", "1. "
  s = s.replace(/^\s{0,3}([-•]\s+)/gm, '').replace(/^\s{0,3}\d+\.\s+/gm, '');
  // Collapse leftover excess whitespace
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
