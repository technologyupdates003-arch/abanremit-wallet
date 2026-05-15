import { createFileRoute } from "@tanstack/react-router";
import { SendMoneyPage } from "@/components/app/SendMoneyPage";

export const Route = createFileRoute("/_app/send")({
  component: SendMoneyPage,
});
