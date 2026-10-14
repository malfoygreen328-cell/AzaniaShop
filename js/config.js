/*
 * Azania Marketplace storefront - PUBLIC frontend configuration.
 *
 * Everything in this file is downloaded by every visitor's browser, so it may
 * only ever contain PUBLIC, non-sensitive values.
 *
 * NEVER put the reCAPTCHA SECRET key, API secrets, payment keys, database
 * credentials or any other secret in this file, in any other file in this
 * repository, or in Netlify's public frontend configuration. The secret belongs
 * in the BACKEND host's environment (e.g. process.env.RECAPTCHA_SECRET).
 *
 * ---------------------------------------------------------------------------
 * Google reCAPTCHA v3 - PUBLIC site key
 * ---------------------------------------------------------------------------
 * Grab the PUBLIC "site key" from https://www.google.com/recaptcha/admin and
 * paste it below. In the same console, add these authorised domains:
 *     azaniashop.co.za
 *     www.azaniashop.co.za
 *     azaniashop.netlify.app
 * (Domain authorisation is done in the Google console - frontend code cannot do
 * it automatically.)
 *
 * Behaviour:
 *   - While `recaptchaSiteKey` is empty (or `recaptchaEnabled` is false) the
 *     storefront skips reCAPTCHA completely, so registration/login keep working
 *     exactly as before. This is the safe state until the backend can verify.
 *   - Once a site key is set, the supported forms request a fresh token
 *     immediately before submitting and send it as `recaptchaToken`.
 *
 * The frontend only *collects* the token. It NEVER decides whether the token is
 * valid - that verification (score, action, hostname) must happen on the
 * backend before the request is trusted.
 */
window.AZANIA_CONFIG = Object.assign(
  {
    // Master on/off switch, independent of the key below.
    recaptchaEnabled: true,

    // PUBLIC reCAPTCHA v3 site key (safe to expose in the browser).
    // Secret key stays in the backend env (RECAPTCHA_SECRET) and is never here.
    recaptchaSiteKey: "6LdoHe8tAAAAAC4a9zWd-b4MAYJACHYDyfQ-QWTP",

    // Network timeout (ms) applied to protected form submissions.
    requestTimeoutMs: 15000,

    // Optional: label shown on the submit button while a request is in flight.
    submitBusyLabel: "Please wait..."
  },
  window.AZANIA_CONFIG || {}
);
