import { createFileRoute } from "@tanstack/react-router";
import { AbanCoinPage } from "@/components/app/AbanCoinPage";

export const Route = createFileRoute("/_app/aban")({
  component: AbanCoinPage,
});
