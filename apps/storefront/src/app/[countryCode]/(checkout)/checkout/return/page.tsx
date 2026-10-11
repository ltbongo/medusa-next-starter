import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Heading, Text } from "@modules/common/components/ui"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Payment received",
  description: "Your PayFast payment is being confirmed",
}

export default async function PayfastReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams

  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.replace(/\/+$/, "")
  const pk = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim()
  if (ref && backend && pk) {
    try {
      await fetch(`${backend}/store/payfast/reconcile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": pk,
        },
        body: JSON.stringify({ ref }),
        cache: "no-store",
      })
    } catch {
      /* reconciliation is best-effort; ITN may still arrive */
    }
  }

  return (
    <div className="content-container py-16 max-w-lg">
      <Heading level="h1" className="text-2xl-semi">
        Thank you
      </Heading>
      <Text className="text-ui-fg-subtle mt-4">
        Your payment is being confirmed. You will receive an update once PayFast
        notifies our store.
        {ref ? ` Reference: ${ref}.` : ""}
      </Text>
      <LocalizedClientLink
        href="/"
        className="mt-8 inline-block text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
      >
        Back to home
      </LocalizedClientLink>
    </div>
  )
}
