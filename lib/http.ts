import { NextResponse } from "next/server";
import { type ZodTypeAny, type infer as ZodInfer } from "zod";
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

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function errorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return unauthorized(error.message);
  }

  const message = error instanceof Error ? error.message : "Bad request";
  return badRequest(message);
}
