# Arc90 Launch Readiness

Updated September 9, 2026. Web release deployed to the existing Arc90 production project; Vercel reports Ready and aliases include https://arc90.vercel.app. Deployment: `dpl_9N5sUfg1rDzLx5vJnBqouN77oNqK`. Native iPhone installation was not updated. Local browser verification is complete for the flows listed below. External-service checks remain. This is not a production-readiness certification.

## September 9 Release

- Published Adaptive Day, Best Window and Focus Ritual, plus a single 240ms directional tab fade. Removed the overlapping browser transition and section stagger. In-place updates no longer animate the whole screen.
- Rapid navigation, reduced motion, stationary in-place updates and mobile/desktop overflow checks passed locally. `check:launch`, `check:adaptive`, `check:navigation` and `git diff --check` passed.
- Deployment inputs checked: 57 files, approximately 12.7 MB; credentials, screenshots, internal content and native build directories excluded. Required web/API assets retained.
- Production environment names inspected, without changing credentials. `OPENAI_API_KEY`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` were absent. Hosted AI coaching remains unavailable until configured. Existing Supabase/Stripe/push setting names are present; valid values and live flows remain unverified.
- Production build/alias status verified through Vercel CLI. Live user flows, payments, notifications and database policy migration were not exercised or changed in this release.

## The 20 Requested Items

| Item | Local implementation and remaining verification |
| --- | --- |
| 1. Privacy policy | Updated to describe actual local storage, optional sign-in, AI, analytics, payments and reminders. Owner/legal review still needed. |
| 2. Terms | Updated with storage, billing and wellness limitations. Owner/legal review still needed. |
| 3. Frontend secrets | Removed persistent AI key entry; added authenticated server AI proxy and public-only auth config. Production credentials/configuration still required. |
| 4. HTTPS | Vercel headers and hosted API HTTPS checks added. Existing production HTTP URL redirected to HTTPS in the earlier check; new configuration is not deployed. |
| 5. Consent | Default-off, acceptance, decline and withdrawal pass module tests and a local browser harness. No third-party analytics was transmitted during testing. |
| 6. Metadata | Titles and descriptions on five public/app pages pass static checks. |
| 7. Social preview | Optimized image and social metadata added. External social crawler preview still unverified. |
| 8. Favicon | Icon references pass local checks. |
| 9. Sitemap/robots | Added using the existing arc90.vercel.app production address. Update if the domain changes. |
| 10. Alt text | Local HTML image checks pass. |
| 11. Compression | Hero converted from 5.7 MB PNG to approximately 50 KB WebP; build excludes unused source media. |
| 12. Load speed | Build approximately 12.6 MB total including optional runtime assets. Uncached local landing test: first contentful paint 464 ms, load 704 ms at 150 ms latency, 200 KB/s download and 4x CPU slowdown. This is a single lab sample, not production Core Web Vitals. |
| 13. Contrast | Small-text contrast improved; light-mode status colors corrected and rendered color checked. Full measured accessibility audit remains. |
| 14. Mobile | Checked 320/390 px viewport settings and 1440 px desktop layout without horizontal overflow on sampled pages. Habit/mood selections, free onboarding, library, sign-in error states and dialog keyboard handling tested. Physical iPhone regression still required. |
| 15. 404 | Custom page added and included in build. Production status behavior must be verified after deployment. |
| 16. Links | Five pages and 58 local references pass automated checks; external destinations not exhaustively checked. |
| 17. Validation | Bounded server JSON, form validation and email-code auth validation added. Core automated checks pass. |
| 18. Spam protection | Honeypot, request backstops, push destination checks and shared AI quota added. Public endpoint distributed rate limits and database policy review remain. |
| 19. Analytics | Consent-gated Vercel page-view integration tested locally; query/hash removed, custom events rejected, withdrawal blocks later events. Dashboard enablement and live delivery remain. |
| 20. Clear action | Public page prioritizes opening the app; email updates remain optional. Removed unsupported email-backup and price-reservation promises from onboarding and upgrade copy. |

## Verification Completed

- `npm run check:launch`: build, 13 security tests, 3 public-auth-configuration tests, 5 privacy tests, authentication checks and HTML/local asset checks pass.
- Authentication includes sign-out during a pending refresh regression coverage.
- `git diff --check` passes.
- API, payment and analytics responses are excluded from service-worker caching. New auth/privacy assets are included in the offline shell.
- Test fixtures mock remote services; no real payments, email sends or AI requests were performed by these tests.
- Build scan checks common private-key formats, service-role tokens and non-public files without printing credential values. It is a guardrail, not a comprehensive secret audit.
- Five pages and 58 local references pass checks. Local server returns 200 for the expected pages and 404 for a missing page.
- Browser test data was isolated at port 5181. The user's existing records at port 5180 were not reset or changed by habit/mood testing.
- Selected habit and mood states survived offline reload. Shift-Tab stays inside dialogs, Escape closes them, and focus returns to the opening control.
- Eight free habits can be selected; trying a ninth opens the upgrade dialog, and declining retains the eight habits.
- Screenshots are saved in `artifacts/launch-check/`. They show synthetic test records, not a live production account.

## Before Production

**Halloween release gate:** set `BUILD_ENABLED = false` in `js/preview-access.js`, rebuild and redeploy before commercial launch. The device-specific `?preview=1` opt-in is a non-secret testing convenience, not authentication. Its fallback cutoff is October 31, 2026 at 00:00 Pacific. Verify fresh and previously enrolled browsers show Free gates when the build flag is off; real paid entitlements must remain intact.

1. Configure and verify server environment: `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public key only), `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, plus existing Stripe and push credentials. Never put private credentials in frontend files.
2. Confirm Supabase email-code delivery/template and redirect settings. Numeric email sign-in requires the appropriate token template: [Supabase passwordless email documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless).
3. Review and apply `supabase/migrations/003_server_only_subscribers.sql` against the existing schema. It enables RLS and removes browser-role table grants; otherwise clients could bypass API validation. The migration is saved, not applied. Add distributed Vercel/WAF rate limits for public signup/push endpoints. The in-memory request limiter is only a per-instance backstop.
4. Enable/verify Vercel Analytics and live delivery. Local consent behavior passed; analytics currently allows only the existing production hostname, not localhost/native or an unconfigured custom domain.
5. Repeat key flows on a physical iPhone and measure live performance, including LCP, INP and CLS. Local screenshots and lab timing do not replace device/field measurements.
6. Verify actual authenticated coach, purchase restoration, webhooks and reminders against configured services. AI intentionally fails closed without authentication and shared quota configuration.
7. Verify native routing separately: new auth/proxy calls use same-origin `/api/` URLs, which do not automatically reach hosted APIs from Capacitor. Native sign-in/AI needs a verified secure API route before claiming it works on iPhone.
8. Review operator/contact and legal text, then deploy and check live headers, 404 responses, sitemap, social preview and account flows. Rebuild/sync/install the native app separately when ready. Policy wording should match actual collection and retention practices; see the [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security). Legal review is still needed for the launch's jurisdictions and audience.

## Resume

Keep existing source edits. Vercel CLI authentication is now restored. Use `.env.example` for the required setting names, then complete the external configuration checks above. Earlier checklist references to deployment pending describe the pre-release audit; the September 9 release section records deployment status. Do not treat the successful deployment as verification of live integrations.
