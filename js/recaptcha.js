/*
 * Azania Marketplace storefront - Google reCAPTCHA v3 helper.
 *
 * Small, dependency-free wrapper around the official reCAPTCHA v3 JS API.
 * It is shared by every protected form (signup, login, contact) and is safe to
 * include on pages that don't submit anything.
 *
 * Responsibilities (frontend only):
 *   - Load https://www.google.com/recaptcha/api.js with the PUBLIC site key.
 *   - Generate a FRESH token immediately before each protected submission.
 *   - Attach the token to the request payload as `recaptchaToken`.
 *   - Provide accessible busy/error UI helpers.
 *   - Fail safely: script/token/network failures surface a usable message and
 *     abort the submission so the user can retry (never silently bypass).
 *
 * NOT its responsibility:
 *   - Verifying the token or its score. That MUST happen server-side via
 *     Google's siteverify endpoint. The frontend never trusts a token.
 */
(function () {
  "use strict";

  var RECAPTCHA_API = "https://www.google.com/recaptcha/api.js";

  function config() {
    return window.AZANIA_CONFIG || {};
  }

  function siteKey() {
    var key = config().recaptchaSiteKey;
    return typeof key === "string" ? key.trim() : "";
  }

  function isEnabled() {
    return config().recaptchaEnabled !== false && siteKey() !== "";
  }

  function timeoutMs() {
    var ms = parseInt(config().requestTimeoutMs, 10);
    return ms > 0 ? ms : 15000;
  }

  function makeError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  var loaderPromise = null;

  // Loads the reCAPTCHA script (idempotent) and resolves once grecaptcha.ready.
  function loadScript() {
    if (window.grecaptcha && typeof window.grecaptcha.execute === "function") {
      return Promise.resolve();
    }
    if (loaderPromise) return loaderPromise;

    loaderPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = RECAPTCHA_API + "?render=" + encodeURIComponent(siteKey());
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (window.grecaptcha && typeof window.grecaptcha.ready === "function") {
          window.grecaptcha.ready(function () {
            resolve();
          });
        } else {
          loaderPromise = null;
          reject(makeError("RECAPTCHA_LOAD_FAILED"));
        }
      };
      script.onerror = function () {
        loaderPromise = null;
        reject(makeError("RECAPTCHA_SCRIPT_ERROR"));
      };
      document.head.appendChild(script);
    });

    return loaderPromise;
  }

  // Warms up the script so the first submit is fast. Safe to call anywhere.
  function preload() {
    if (!isEnabled()) return;
    loadScript().catch(function () {
      /* handled on submit */
    });
  }

  // Returns a Promise resolving to a fresh token for the given action.
  function getToken(action) {
    if (!isEnabled()) {
      return Promise.reject(makeError("RECAPTCHA_DISABLED"));
    }
    if (!action || typeof action !== "string") {
      return Promise.reject(makeError("RECAPTCHA_ACTION_MISSING"));
    }
    return loadScript()
      .then(function () {
        return window.grecaptcha.execute(siteKey(), { action: action });
      })
      .then(function (token) {
        if (!token || typeof token !== "string") {
          throw makeError("RECAPTCHA_TOKEN_EMPTY");
        }
        return token;
      });
  }

  // Adds `recaptchaToken` to a payload (no-op when reCAPTCHA is disabled).
  function withToken(action, payload) {
    var base = payload || {};
    if (!isEnabled()) return Promise.resolve(base);
    return getToken(action).then(function (token) {
      var out = {};
      Object.keys(base).forEach(function (k) {
        out[k] = base[k];
      });
      out.recaptchaToken = token;
      return out;
    });
  }

  // fetch() with an AbortController timeout and normalised error codes.
  function fetchWithTimeout(url, init) {
    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    if (controller) init.signal = controller.signal;

    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, timeoutMs());

    return fetch(url, init).then(
      function (response) {
        clearTimeout(timer);
        return response;
      },
      function (err) {
        clearTimeout(timer);
        if (err && err.name === "AbortError") {
          throw makeError("REQUEST_TIMEOUT");
        }
        throw makeError("NETWORK_ERROR", err && err.message);
      }
    );
  }

  /*
   * Submit a JSON payload to `url`, adding a fresh reCAPTCHA token first.
   * Resolves to { response, data }. Rejects with an Error carrying `.code`.
   *
   * opts: { url, action, payload, method?, headers?, credentials? }
   */
  function submitProtected(opts) {
    var payload =
      typeof opts.payload === "function" ? opts.payload() : opts.payload || {};

    var headers = { "Content-Type": "application/json" };
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (k) {
        headers[k] = opts.headers[k];
      });
    }

    var init = {
      method: opts.method || "POST",
      headers: headers,
      body: JSON.stringify(payload)
    };
    if (opts.credentials) init.credentials = opts.credentials;

    return withToken(opts.action, payload)
      .then(function (bodyWithToken) {
        init.body = JSON.stringify(bodyWithToken);
        return fetchWithTimeout(opts.url, init);
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { response: response, data: data };
          });
      });
  }

  /* ----------------------------- UI helpers ------------------------------ */

  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent;
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = config().submitBusyLabel || "Please wait...";
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.originalLabel) {
        button.textContent = button.dataset.originalLabel;
      }
    }
  }

  function setMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    if (!el.hasAttribute("role")) el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.style.color = isError ? "#b00020" : "#06553d";
  }

  function friendlyError(err) {
    switch (err && err.code) {
      case "RECAPTCHA_SCRIPT_ERROR":
      case "RECAPTCHA_LOAD_FAILED":
        return "We could not load the security check. Please check your connection and try again.";
      case "RECAPTCHA_TOKEN_EMPTY":
        return "The security check did not complete. Please try again.";
      case "RECAPTCHA_ACTION_MISSING":
      case "RECAPTCHA_DISABLED":
        return "The security check is unavailable right now. Please try again later.";
      case "REQUEST_TIMEOUT":
        return "The request timed out. Please check your connection and try again.";
      case "NETWORK_ERROR":
        return "Network error. Please check your connection and try again.";
      default:
        return "Something went wrong. Please try again.";
    }
  }

  window.AzaniaRecaptcha = {
    isEnabled: isEnabled,
    preload: preload,
    getToken: getToken,
    withToken: withToken,
    submitProtected: submitProtected,
    setLoading: setLoading,
    setMessage: setMessage,
    friendlyError: friendlyError
  };
})();
