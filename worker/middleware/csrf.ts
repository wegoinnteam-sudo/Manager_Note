import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppBindings } from "../types";
import { Errors } from "../lib/errors";

export const CSRF_COOKIE_NAME = "th_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF check. The csrf cookie is NOT HttpOnly so the frontend
 * can read it and echo it back as a header; a cross-site form/script can
 * trigger the cookie to be sent but cannot read its value to put in the
 * header, so the two only match for same-origin requests.
 */
export const csrfMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }
  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
  const headerToken = c.req.header(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw Errors.forbidden("CSRF 검증에 실패했습니다.");
  }
  await next();
});
