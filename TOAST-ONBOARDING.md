# Toast Websites onboarding

The dedicated client URL is `/toast-onboarding`. This is separate from the site's general booking flow. It is a four-step questionnaire: restaurant, website content, assets, and review/submit. It collects one restaurant's contact and public address, preferred guest action, page copy, active Toast guest links and brand assets. It never asks for Toast credentials. The package copy matches the $499 build-only review draft.

## Required production setup

1. In the **Cloudflare account hosting cogrow.ai**, create a **private** R2 bucket for Toast intake. Do not attach a public bucket URL.
2. On that Pages project, bind the bucket to Pages Functions as `TOAST_INTAKE_BUCKET` in production and preview, then redeploy.
3. Create a Cloudflare Turnstile widget allowed on `cogrow.ai` and any preview hostname used for QA. Add the public site key as `TOAST_TURNSTILE_SITE_KEY` and its secret as a **secret** named `TOAST_TURNSTILE_SECRET` on the Pages project. Redeploy. The endpoint stays disabled until all three bindings exist.
4. Assign an owner to check the private R2 bucket for new `toast-onboarding/<reference>/submission.json` objects and retrieve their sibling `assets/` files. Set an internal retention and deletion practice before collecting real customer files. This version has no staff dashboard or automatic notification.
5. Test an actual upload on the preview hostname using sample files, verify the manifest and file bytes in R2, then test on `cogrow.ai` after release. Update the sales PDF CTA only after the live URL and upload are verified.

The form requires at least one asset file or a shared folder link. It accepts up to 12 PNG, JPG, WebP, PDF or DOCX files, 8 MB each and 30 MB total. Larger photo sets can be supplied through a shared folder link. The endpoint enforces the same limits, checks origin, validates Turnstile server side, and writes a manifest only after files are stored. If a write fails, it returns an error and attempts to remove partial files. This does not include malware scanning; review downloaded files carefully.

Cloudflare references: [Pages R2 bindings](https://developers.cloudflare.com/pages/functions/bindings/) and [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
