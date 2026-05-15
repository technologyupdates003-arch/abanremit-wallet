import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/app/MarketPage";

export const Route = createFileRoute("/_app/market")({
  component: MarketPage,
});
