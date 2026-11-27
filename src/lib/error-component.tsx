import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={1.75} />
      </span>
      <h1 className="text-xl">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        {(error instanceof Error && error.message) || "An unexpected error occurred. Try reloading the page."}
      </p>
    </main>
  );
}
