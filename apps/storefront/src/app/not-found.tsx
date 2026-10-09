export const dynamic = "force-dynamic"

export default function NotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <a href="/" className="underline">Go to frontpage</a>
    </div>
  )
}
