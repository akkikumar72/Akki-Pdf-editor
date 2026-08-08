# Polar Checkout Runbook

AkkiPDF uses a public Polar Checkout Link for optional Supporter contributions. The browser redirects to Polar's
hosted checkout. The app does not embed checkout, create sessions through an API, or hold Polar credentials.

Official references:

- [Sandbox environment](https://polar.sh/docs/integrate/sandbox)
- [Products and pricing models](https://polar.sh/docs/features/products)
- [Persistent Checkout Links](https://polar.sh/docs/features/checkout/links)
- [Current Polar pricing](https://polar.sh/resources/pricing)

## Security boundary

- `VITE_POLAR_SUPPORTER_CHECKOUT_URL` is a public URL, not a secret.
- Never place a Polar access token, webhook secret, or AI-provider key in a `VITE_*` variable.
- The app accepts only HTTPS Checkout Links on explicitly allowed Polar production or sandbox hosts.
- A visit to `/pricing/success` is not proof of payment. Polar's receipt is the customer-facing confirmation.
- Supporter contributions do not unlock Pro features or authorize future hosted AI usage.
- Supporter payments and future Pro subscriptions do not purchase alternative source-code terms. Those require a
  separate written commercial agreement covering only rights AkkiPDF can grant.

## 1. Create the sandbox product

Use [sandbox.polar.sh](https://sandbox.polar.sh). Sandbox accounts, organizations, products, tokens, and orders are
separate from production.

Create one product with these settings:

| Field             | Value                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Name              | `AkkiPDF Supporter (Sandbox)`                                                                          |
| Billing cycle     | One-time                                                                                               |
| Pricing           | Pay what you want                                                                                      |
| Minimum           | `$10 USD`                                                                                              |
| Suggested default | `$29 USD`                                                                                              |
| Benefits          | None                                                                                                   |
| Description       | `Support the open-source, local-first AkkiPDF editor. This contribution does not unlock Pro features.` |

Do not attach licence keys, credits, downloads, or feature flags to this product.

## 2. Create the sandbox Checkout Link

Create a persistent Checkout Link for the Supporter product. Never copy the temporary Checkout Session URL created
after visiting the link.

Configure:

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| Product        | `AkkiPDF Supporter (Sandbox)`               |
| Return URL     | `https://<deployment-host>/pricing`         |
| Success URL    | `https://<deployment-host>/pricing/success` |
| Discount codes | Off initially                               |
| Trial          | None                                        |

The copied URL should use Polar's sandbox API host and contain a `polar_cl_` Checkout Link identifier.

## 3. Configure a local or preview build

Copy `.env.example` to `.env.local` and use the sandbox Checkout Link:

```bash
VITE_POLAR_SUPPORTER_CHECKOUT_URL=https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_REPLACE_ME/redirect
```

Restart Vite after changing the environment variable. Vite reads it at build or server startup.

Run the dedicated real-link verifier on an isolated port:

```bash
PLAYWRIGHT_PORT=5187 \
VITE_POLAR_SUPPORTER_CHECKOUT_URL=https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_REPLACE_ME/redirect \
bun run polar:verify
```

This verifies that the pricing CTA contains the exact persistent link, reaches Polar's hosted checkout, and displays
the Supporter product. It intentionally does not submit payment.

## 4. Sandbox acceptance test

1. Open `/pricing` and confirm **Continue to Polar** replaces the disabled placeholder.
2. Confirm the browser navigates to Polar and shows the exact Supporter product.
3. Confirm the checkout is one-time, pay-what-you-want, and enforces the configured minimum.
4. Complete checkout with `4242 4242 4242 4242`, a future expiry date, and any CVC.
5. Confirm the receipt is generated and the success redirect returns to `/pricing/success`.
6. Use the checkout back control and confirm the return URL opens `/pricing`.
7. Confirm no Polar token, key, document content, or local session data appears in browser requests or logs.

Sandbox confirmation emails are delivered only to members of the sandbox organization.

## 5. Production activation

Create a separate production product and Checkout Link. Do not reuse sandbox identifiers or credentials.

Use these production redirects:

```text
Return:  https://akki-pdf-editor.vercel.app/pricing
Success: https://akki-pdf-editor.vercel.app/pricing/success
```

Set `VITE_POLAR_SUPPORTER_CHECKOUT_URL` in the production deployment to the persistent production Checkout Link,
rebuild, and repeat the acceptance checks without completing an unintended live charge.

In Vercel Project Settings → Environment Variables, enable **Automatically expose System Environment Variables**.
This makes `VERCEL_GIT_COMMIT_SHA` available to the build. If that setting cannot be enabled, explicitly set
`VITE_SOURCE_COMMIT_SHA` to the exact commit being deployed.

Confirm the deployed Legal notice links to `/tree/<VERCEL_GIT_COMMIT_SHA>`. If it links only to the repository root,
stop the rollout because the deployed build has not proved its version-specific Corresponding Source link.

Review Polar's current pricing immediately before launch. The pricing page, rather than older fee documentation, is
the source of truth for a newly created organization.
