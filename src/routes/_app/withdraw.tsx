import { createFileRoute } from "@tanstack/react-router";
import { WithdrawPage } from "@/components/app/WithdrawPage";

export const Route = createFileRoute("/_app/withdraw")({
  component: WithdrawPage,
});
