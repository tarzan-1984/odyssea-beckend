const PLAIN_URL_RE =
	/(https?:\/\/[^\s<]+[^\s<.,:;"')\]\s])/gi;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function isAllowedHref(href: string): boolean {
	try {
		const url = new URL(href);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/** Convert plain-text email body to simple HTML with clickable http(s) links. */
export function plainTextToHtmlEmail(text: string): string {
	const parts: string[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(PLAIN_URL_RE)) {
		const index = match.index ?? 0;
		if (index > lastIndex) {
			parts.push(
				escapeHtml(text.slice(lastIndex, index)).replace(/\n/g, '<br>'),
			);
		}

		const url = match[0];
		if (isAllowedHref(url)) {
			const escapedUrl = escapeHtml(url);
			parts.push(`<a href="${escapedUrl}">${escapedUrl}</a>`);
		} else {
			parts.push(escapeHtml(url));
		}

		lastIndex = index + url.length;
	}

	if (lastIndex < text.length) {
		parts.push(escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br>'));
	}

	return parts.join('');
}
