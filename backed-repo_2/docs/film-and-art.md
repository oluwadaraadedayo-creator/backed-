# Films, art and currencies

Backed accepts audio, film (MP4, MOV, WEBM), images (JPG, PNG, WEBP) and PDF files. File type is checked by content, not by name.

## Large films
Supabase free plan caps every upload at 50 MB. To sell longer films:
1. Upgrade the Supabase project to a paid plan.
2. In Supabase, Storage settings, raise the global file size limit.
3. In Storage, open the `audio` bucket and raise its file size limit.
4. Set MAX_FILE_BYTES in your host environment to the same number of bytes, then redeploy.
Until then, artists can sell trailers and short films under 50 MB.

## Currencies
Naira works by default. To sell in US dollars:
1. Confirm in your Paystack dashboard that USD is enabled and that split payments work in USD. This has not been verified.
2. Set ENABLED_CURRENCIES=NGN,USD and redeploy.
3. Test one small USD purchase end to end before telling artists.

## Database
Run supabase/migrations/010 and 011 in the SQL editor. Try them on a non-production project first.
