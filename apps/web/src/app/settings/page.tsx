import { Suspense } from "react";

import { SettingsForm } from "../../components/settings-form";

export default function SettingsPage() {
  return (
    <div className="h-full min-h-0">
      <Suspense fallback={<div className="p-6 text-sm text-ink/60">Loading settings...</div>}>
        <SettingsForm />
      </Suspense>
    </div>
  );
}
