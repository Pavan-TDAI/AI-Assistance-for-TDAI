import { Suspense } from "react";

import { AuthEntry } from "../../components/auth-entry";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink/60">Loading signup...</div>}>
      <AuthEntry mode="signup" />
    </Suspense>
  );
}
