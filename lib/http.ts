import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from "zod";
import { UnauthorizedError } from "@/lib/auth";

export const REQUEST_ID_HEADER = "x-request-id";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type RouteHandler<TArgs extends unknown[]> = (
  request: Request,
  ...args: TArgs
) => Response | Promise<Response>;

export function resolveRequestId(candidate: string | null) {
  if (candidate && requestIdPattern.test(candidate)) {
    return candidate;
  }

  return globalThis.crypto.randomUUID();
}

function classifyHttpError(status: number) {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server_error";
  if (status === 400 || status === 422) return "request_error";
  return "http_error";
}

function addRequestIdHeader(response: Response, requestId: string) {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}

export function withRequestContext<TArgs extends unknown[]>(handler: RouteHandler<TArgs>): RouteHandler<TArgs> {
  return async (request, ...args) => {
    const startedAt = Date.now();
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    let response: Response;

    try {
      response = await handler(request, ...args);
    } catch (error) {
      response = errorResponse(error);
    }

    const correlatedResponse = addRequestIdHeader(response, requestId);

    if (correlatedResponse.status >= 400) {
      console.error(JSON.stringify({
        event: "api_request_failed",
        requestId,
        route: new URL(request.url).pathname,
        method: request.method,
        status: correlatedResponse.status,
        errorClass: classifyHttpError(correlatedResponse.status),
        durationMs: Date.now() - startedAt
      }));
    }

    return correlatedResponse;
  };
}

export async function parseBody<TSchema extends ZodTypeAny>(request: Request, schema: TSchema): Promise<ZodInfer<TSchema>> {
  const json = await request.json();
  return schema.parse(json);
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return unauthorized(error.message);
  }

  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return badRequest(message || "Invalid request.");
  }

  if (error && typeof error === "object") {
    const structured = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    if (typeof structured.message === "string") {
      const parts = [structured.message];
      if (typeof structured.code === "string") parts.push(`code=${structured.code}`);
      if (typeof structured.details === "string" && structured.details) parts.push(structured.details);
      if (typeof structured.hint === "string" && structured.hint) parts.push(`hint=${structured.hint}`);
      return badRequest(parts.join(" | "));
    }
  }

  const message = error instanceof Error ? error.message : "Bad request";
  return badRequest(message);
}
