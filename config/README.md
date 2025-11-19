# Firebase Configuration

## Setup Instructions

1. **Download Firebase Service Account JSON**
    - Go to [Firebase Console](https://console.firebase.google.com/)
    - Select your project
    - Go to Project Settings → Service Accounts
    - Click "Generate new private key"
    - Save the JSON file

2. **Place the file in this directory**
    - Rename the downloaded file to: `firebase-service-account.json`
    - Place it in: `Odyssea-backend-nestjs/config/firebase-service-account.json`

3. **File structure should be:**

    ```
    config/
      └── firebase-service-account.json
    ```

4. **Commit to Git:**
    - The file will be committed to Git and deployed to Render automatically
    - Make sure your repository is private or properly secured

## Security Notes

⚠️ **Warning:** This file contains sensitive credentials and will be stored in Git.

- Make sure your Git repository is **private** or properly secured
- Never share this file publicly
- The file contains sensitive credentials for Firebase Admin SDK

## File Format

The JSON should contain:

```json
{
	"type": "service_account",
	"project_id": "your-project-id",
	"private_key_id": "...",
	"private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
	"client_email": "...",
	"client_id": "...",
	"auth_uri": "https://accounts.google.com/o/oauth2/auth",
	"token_uri": "https://oauth2.googleapis.com/token",
	"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
	"client_x509_cert_url": "..."
}
```
