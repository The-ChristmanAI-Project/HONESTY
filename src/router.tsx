import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function DefaultNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="kicker">Missing page</p>
      <h1 className="mt-3 font-display text-3xl tracking-tight">This desk has no such room.</h1>
      <p className="mt-3 text-sm text-muted">Open Desk, Station, or start Honesty Local.</p>
    </div>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: DefaultNotFound,
  });
}
