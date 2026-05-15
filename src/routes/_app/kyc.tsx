import { createFileRoute } from "@tanstack/react-router";
import { KycPage } from "@/components/app/KycPage";

export const Route = createFileRoute("/_app/kyc")({
  component: KycPage,
});
