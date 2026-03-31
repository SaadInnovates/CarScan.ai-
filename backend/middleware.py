# middleware.py
# Request logging + simple in-memory rate limiting
# Runs on every single request before it hits any router

import time
from collections import defaultdict
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# tracks how many requests each IP made in the current window
_request_counts: dict = defaultdict(list)

# max requests per IP per time window
RATE_LIMIT_REQUESTS = 100   # max 100 requests
RATE_LIMIT_WINDOW   = 60    # per 60 seconds

# one-time callback routes should not be blocked by generic IP throttling
RATE_LIMIT_EXEMPT_PATHS = {
    "/health",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/google/login",
    "/api/v1/auth/google/callback",
}


def _get_client_ip(request: Request) -> str:
    """Resolve client IP safely, including common proxy headers."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # x-forwarded-for can be a comma-separated chain; first value is client IP.
        first_ip = forwarded_for.split(",", 1)[0].strip()
        if first_ip:
            return first_ip

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    client = request.client
    if client is None:
        return "unknown"

    client_host = getattr(client, "host", None)
    if isinstance(client_host, str) and client_host:
        return client_host

    return "unknown"


class LoggingMiddleware(BaseHTTPMiddleware):
    """Logs every request: method, path, status code, response time"""

    async def dispatch(self, request: Request, call_next):
        start = time.time()

        # process the actual request
        response = await call_next(request)

        duration_ms = int((time.time() - start) * 1000)

        print(
            f"[{request.method}] {request.url.path} "
            f"→ {response.status_code} ({duration_ms}ms)"
        )

        # add processing time to response headers so frontend can see it
        response.headers["X-Process-Time-Ms"] = str(duration_ms)

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple IP-based rate limiter.
    Blocks an IP that sends more than 100 requests in 60 seconds.
    Protects upload and inference endpoints from abuse.
    """

    async def dispatch(self, request: Request, call_next):
        request_path = request.url.path
        if request_path in RATE_LIMIT_EXEMPT_PATHS:
            return await call_next(request)

        client_ip = _get_client_ip(request)
        now       = time.time()

        # keep only timestamps within the current window
        _request_counts[client_ip] = [
            t for t in _request_counts[client_ip]
            if now - t < RATE_LIMIT_WINDOW
        ]

        if len(_request_counts[client_ip]) >= RATE_LIMIT_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        "Too many requests. "
                        f"Max {RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW}s."
                    )
                },
                headers={
                    "Retry-After": str(RATE_LIMIT_WINDOW)
                },
            )

        _request_counts[client_ip].append(now)

        return await call_next(request)