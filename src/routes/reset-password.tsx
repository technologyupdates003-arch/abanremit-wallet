import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const Route = createFileRoute("/reset-password")({
  component: () => (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  ),
});
