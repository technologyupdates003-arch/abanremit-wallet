import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/app/SettingsPage";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});
