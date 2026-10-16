import { ZodError } from "zod";
import { DomainError } from "./services/scheduling";
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: "Check the form values and try again." },
      { status: 400 },
    );
  if (error instanceof DomainError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Careousel operation failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Something went wrong. Please retry; no partial booking was saved.",
    },
    { status: 500 },
  );
}
