import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/app/Dashboard";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});
