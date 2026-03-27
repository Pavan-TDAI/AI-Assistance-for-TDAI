import { Suspense } from "react";

import { AuthEntry } from "../../components/auth-entry";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink/60">Loading login...</div>}>
      <AuthEntry mode="login" />
    </Suspense>
  );
}
