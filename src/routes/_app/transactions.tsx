import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "@/components/app/TransactionsPage";

export const Route = createFileRoute("/_app/transactions")({
  component: TransactionsPage,
});
