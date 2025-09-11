export const mainEmailTemplate = (title, innerData) => {
	if (!innerData) return 'error';

	return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">Odyssea</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Freight Management System</p>
        </div>
        ${innerData}
      </body>
      </html>
    `;
};
