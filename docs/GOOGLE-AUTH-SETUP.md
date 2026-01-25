# Google (Gmail) Sign-In Setup

TropiTrack supports "Continue with Google" on the login and signup pages. To enable it:

## 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Open **APIs & Services** → **Credentials**.
4. Click **Create Credentials** → **OAuth client ID**.
5. If prompted, configure the OAuth consent screen (external user type is fine).
6. Choose **Web application**.
7. Add **Authorized redirect URIs**:
   - Development: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   - Production: same value (Supabase handles the redirect).
8. Copy the **Client ID** and **Client Secret**.

## 2. Supabase Dashboard

1. Open your [Supabase project](https://supabase.com/dashboard).
2. Go to **Authentication** → **Providers** → **Google**.
3. Enable Google.
4. Paste the **Client ID** and **Client Secret** from Google Cloud.
5. Save.

## 3. Redirect URL (Supabase)

In **Authentication** → **URL Configuration**, ensure **Redirect URLs** includes your app URLs, for example:

- `http://localhost:3000/auth/callback` (local)
- `https://your-domain.com/auth/callback` (production)

## 4. Test

Visit `/login` or `/signup` and click **Continue with Google**. You should be redirected to Google, then back to the app after signing in.
