import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Heading, Text } from "@modules/common/components/ui"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Payment cancelled",
  description: "PayFast payment was cancelled",
}

export default async function PayfastCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams

  return (
    <div className="content-container py-16 max-w-lg">
      <Heading level="h1" className="text-2xl-semi">
        Payment cancelled
      </Heading>
      <Text className="text-ui-fg-subtle mt-4">
        You cancelled payment on PayFast.
        {ref ? ` Reference: ${ref}.` : ""}
      </Text>
      <LocalizedClientLink
        href="/store"
        className="mt-8 inline-block text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
      >
        Return to store
      </LocalizedClientLink>
    </div>
  )
}
