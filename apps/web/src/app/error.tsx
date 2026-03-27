"use client";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-800 shadow-panel">
      <p className="font-display text-2xl font-semibold">Something went wrong</p>
      <p className="mt-3 text-sm">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
