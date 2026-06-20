/** Plain text for push notifications and previews (no markdown / HTML formatting). */
export function stripMarkdown(content: string): string {
	if (!content) return '';

	let text = content;
	text = text.replace(/<u>([\s\S]*?)<\/u>/gi, '$1');
	text = text.replace(/\*\*\*([\s\S]*?)\*\*\*/g, '$1');
	text = text.replace(/\*\*([\s\S]*?)\*\*/g, '$1');
	text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
	text = text.replace(/~~([\s\S]*?)~~/g, '$1');
	text = text.replace(/^[\t ]*[-*+]\s+/gm, '');
	text = text.replace(/^[\t ]*\d+[.)]\s+/gm, '');
	text = text.replace(/\*{1,3}/g, '');
	text = text.replace(/\n{3,}/g, '\n\n');
	return text.trim();
}
