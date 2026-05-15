import { createFileRoute } from "@tanstack/react-router";
import { WalletsPage } from "@/components/app/WalletsPage";

export const Route = createFileRoute("/_app/wallets")({
  component: WalletsPage,
});
