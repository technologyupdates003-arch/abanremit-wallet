import { createFileRoute } from "@tanstack/react-router";
import { FundWalletPage } from "@/components/app/FundWalletPage";

export const Route = createFileRoute("/_app/fund")({
  component: FundWalletPage,
});
