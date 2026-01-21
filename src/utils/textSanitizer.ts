
export function sanitizeExtractedText(input: string): string {
	let s = input.replace(/\r/g, "");
	s = s.replace(/\u00A0/g, " ");
	s = s.replace(/^\s*---\s*$/gm, "");
	s = s.replace(/^\*\s{2,}/gm, "* ");
	s = s.replace(/^-\s{2,}/gm, "- ");
	s = s.replace(/^(\d+)\.\s{2,}/gm, (_, n) => `${n}. `);
	s = s.replace(/[ \t]+$/gm, "");
	s = s.replace(/\n{3,}/g, "\n\n");
	s = s.replace(/[ \t]{2,}/g, " ");
	return s.trim();
}
