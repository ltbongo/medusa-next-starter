import { Metadata } from "next"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "404",
  description: "Something went wrong",
}

export default function NotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">Page not found</h1>
      <p className="text-small-regular text-ui-fg-base">
        The page you tried to access does not exist.
      </p>
      <LocalizedClientLink
        href="/"
        className="text-ui-fg-interactive hover:text-ui-fg-base transition-colors"
      >
        Go to frontpage →
      </LocalizedClientLink>
    </div>
  )
}
