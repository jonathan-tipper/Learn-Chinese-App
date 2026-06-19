import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from "zod";
import { UnauthorizedError } from "@/lib/auth";

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
