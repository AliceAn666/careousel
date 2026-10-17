import { ZodError } from "zod";
import { DomainError } from "./services/scheduling";
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  if (error instanceof DomainError)
    return Response.json({ error: error.message }, { status: error.status });
  const failure = error as { name?: string; code?: string; message?: string } | null;
  // Structured diagnostics avoid logging credentials, SQL, request bodies, or patient data.
  console.error("Careousel operation failed:", {
    name: failure?.name ?? "UnknownError",
    code: typeof failure?.code === "string" ? failure.code : "unknown",
    category: failure?.message?.includes("connect") ? "connection" :
      failure?.message?.includes("timeout") ? "timeout" :
      failure?.message?.includes("relation") ? "schema" : "other",
  });
  return Response.json(
    {
      error:
        "Something went wrong. Please retry; no partial booking was saved.",
    },
    { status: 500 },
  );
}
