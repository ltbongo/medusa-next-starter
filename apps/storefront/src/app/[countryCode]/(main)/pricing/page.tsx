import { Metadata } from "next"

import SubscriptionTiers from "@modules/pricing/components/subscription-tiers"

export const metadata: Metadata = {
  title: "Pricing — crazytees",
  description: "Choose the perfect plan for your AI design needs. Free tier includes 1 design per day.",
}

export default async function PricingPage() {
  return (
    <div className="bg-dark min-h-screen">
      <div className="content-container py-16 md:py-24">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-light font-display mb-4">
            Choose Your <span className="text-primary">Plan</span>
          </h1>
          <p className="text-muted text-lg max-w-2xl mx-auto">
            More credits = more creations. Start free and upgrade anytime.
          </p>
        </div>
        <SubscriptionTiers />
        <div className="mt-12 text-center text-sm text-muted">
          <p>All plans include access to ChatGPT Images 2.5 and 2D product previews.</p>
          <p className="mt-2">Products are paid separately via PayFast.</p>
        </div>
      </div>
    </div>
  )
}
