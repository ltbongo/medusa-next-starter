"use client"

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[50vh] p-8">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <button
        type="button"
        className="underline"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  )
}
