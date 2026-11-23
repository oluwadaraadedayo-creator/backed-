# Backed setup, step by step

Words used here: a repo is your project folder on GitHub. A secret is a private value (like a password) you paste into a settings page. Never paste secrets into code or share them in chat.

Replace NAME with your GitHub username and REPO with the repo name you choose (for example backed). Your site will live at https://NAME.github.io/REPO/

## Part 1. Supabase (the database)

1. Go to supabase.com, sign in, click New project. Name it Backed, set a database password and save it somewhere safe, choose the region closest to your buyers (Europe is fine), click Create. Wait about two minutes.
2. Open SQL Editor (left menu), click New query. Open supabase/setup.sql from this zip with any text editor, copy everything, paste it in, click Run. It should say Success. If you see a red error, screenshot it and send it to me.
3. Open Project Settings, then API (or API Keys). Copy and keep: the Project URL, and the anon public key. Open Project Settings, General and copy the Reference ID (a short code, call it REF). Do not copy the service_role key anywhere.
4. Open Authentication, then URL Configuration. Set Site URL to https://NAME.github.io/REPO/ and under Redirect URLs click Add URL and add https://NAME.github.io/REPO/**
5. Open Authentication, then Sign In / Providers, then Email. While testing, turn off Confirm email (Supabase's free email sender only sends a few emails per hour). Turn it back on once you connect your own email sender.
6. Click your profile picture (bottom left), Account preferences, Access Tokens, Generate new token. Name it github, copy it now (you only see it once).

## Part 2. GitHub (the website and backend publishing)

7. On github.com click New repository. Name it REPO. Choose Public (GitHub Pages is free only for public repos, and no secrets are stored in the code). Click Create.
8. Unzip this folder on your computer. In the new repo click uploading an existing file. Drag in everything from inside the unzipped folder, including the hidden .github folder (on Mac press Cmd+Shift+. in Finder to show hidden folders). Click Commit changes.
9. Repo Settings, Secrets and variables, Actions. On the Variables tab click New repository variable and add four: VITE_SUPABASE_URL (your Project URL), VITE_SUPABASE_ANON_KEY (the anon public key), VITE_API_URL (https://REF.supabase.co/functions/v1), SUPABASE_PROJECT_REF (the REF code).
10. On the Secrets tab click New repository secret. Name it SUPABASE_ACCESS_TOKEN and paste the token from step 6.
11. Repo Settings, Pages. Under Build and deployment set Source to GitHub Actions.
12. Open the Actions tab. Run both workflows: click Publish the payment and download backend, then Run workflow. Do the same for Publish the website. Wait for green ticks (a few minutes).

## Part 3. Backend settings in Supabase

13. In Supabase open Edge Functions, then Secrets (or Project Settings, Edge Functions). Add these one by one (name, then value):
PAYSTACK_SECRET_KEY: your Paystack TEST secret key to start.
PLATFORM_FEE_PERCENT: 15
ALLOWED_ORIGIN: https://NAME.github.io
SITE_URL: https://NAME.github.io/REPO
PAYSTACK_CALLBACK_URL: https://NAME.github.io/REPO/
IP_HASH_SALT: any long random text
GUEST_TOKEN_SECRET: a different long random text
ENABLED_CURRENCIES: NGN
Optional for emails: RESEND_API_KEY and EMAIL_FROM (see docs/email-setup.md).

## Part 4. Paystack

14. In the Paystack dashboard open Settings, API Keys and Webhooks. Set Test Webhook URL to https://REF.supabase.co/functions/v1/api/paystack-webhook and save. Go live later by repeating with live keys.

## Part 5. Make yourself the first artist

15. Open your site and create an account. In Supabase open Table Editor, profiles, find your row and set role to artist and verified_artist to true.
16. On the site open For Artists. Accept the uploader terms, open Payouts and add your bank account.

## Part 6. Test before inviting anyone

17. Create a film release: cover, a small video file, a trailer, price. Publish it.
18. Open the site in a private window, buy it as a guest with a Paystack test card (listed in Paystack's docs), and confirm the download works.
19. Fill the placeholders in src/site.ts (company name, email, address, date). On GitHub open the file, click the pencil icon, edit, Commit changes. The site updates itself.

## Later
Films over 50 MB, US dollars, live Paystack keys and emails are in the docs folder.
