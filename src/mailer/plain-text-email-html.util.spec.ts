import { plainTextToHtmlEmail } from './plain-text-email-html.util';

describe('plainTextToHtmlEmail', () => {
	it('converts line breaks and URLs to HTML links', () => {
		const text = `Hello,

iOS: https://apps.apple.com/ua/app/odysseia-app/id6756887777

Android: https://play.google.com/store/search?q=odysseia&c=apps&hl=en`;

		const html = plainTextToHtmlEmail(text);

		expect(html).toContain('Hello,<br>');
		expect(html).toContain(
			'<a href="https://apps.apple.com/ua/app/odysseia-app/id6756887777">https://apps.apple.com/ua/app/odysseia-app/id6756887777</a>',
		);
		expect(html).toContain(
			'<a href="https://play.google.com/store/search?q=odysseia&amp;c=apps&amp;hl=en">https://play.google.com/store/search?q=odysseia&amp;c=apps&amp;hl=en</a>',
		);
	});
});
