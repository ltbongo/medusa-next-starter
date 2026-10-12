"use client"

interface TierProps {
  name: string
  price: string
  credits: string
  features: string[]
  popular?: boolean
  cta?: string
}

const tiers: TierProps[] = [
  {
    name: "Free",
    price: "R0",
    credits: "1 design/day",
    features: [
      "1 AI design per day",
      "Basic 2D preview",
      "Standard product range",
      "Pay per product ordered",
    ],
    cta: "Get Started",
  },
  {
    name: "Basic",
    price: "R99",
    credits: "5 designs/day",
    features: [
      "5 AI designs per day",
      "HD quality previews",
      "All products & mugs",
      "Priority support",
      "Design history saved",
    ],
    popular: true,
    cta: "Subscribe Now",
  },
  {
    name: "Pro",
    price: "R299",
    credits: "20 designs/day",
    features: [
      "20 AI designs per day",
      "4K quality previews",
      "All products & mugs",
      "VIP support",
      "Bulk order discounts",
      "Early access to new features",
    ],
    cta: "Subscribe Now",
  },
]

const SubscriptionTier = ({ tier }: { tier: TierProps }) => {
  return (
    <div
      className={`relative rounded-2xl p-6 transition-all duration-200 ${
        tier.popular
          ? "bg-surface-card border-2 border-primary shadow-glow scale-105"
          : "bg-surface-card/80 border border-white/10"
      }`}
    >
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-light text-xs font-bold px-4 py-1 rounded-full font-display">
            Most Popular
          </span>
        </div>
      )}
      
      <div className="text-center mb-6 pt-2">
        <h3 className="text-xl font-bold text-light font-display mb-2">{tier.name}</h3>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-light">{tier.price}</span>
          <span className="text-muted">/month</span>
        </div>
        <p className="text-primary font-semibold mt-2 text-sm">{tier.credits}</p>
      </div>
      
      <ul className="space-y-3 mb-6">
        {tier.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-light/80">
            <span className="text-accent-cyan font-bold shrink-0">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      
      <button
        className={`w-full py-3 rounded-lg font-bold font-display transition-colors ${
          tier.popular
            ? "bg-primary text-light hover:bg-primary-dark"
            : "bg-light/10 text-light hover:bg-light/20"
        }`}
      >
        {tier.cta}
      </button>
    </div>
  )
}

const SubscriptionTiers = () => {
  return (
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {tiers.map((tier) => (
        <SubscriptionTier key={tier.name} tier={tier} />
      ))}
    </div>
  )
}

export default SubscriptionTiers
