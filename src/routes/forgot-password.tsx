import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const Route = createFileRoute("/forgot-password")({
  component: () => (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  ),
});
