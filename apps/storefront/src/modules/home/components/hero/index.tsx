import { Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <section
      aria-label="Storefront introduction"
      className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle"
    >
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6 max-w-4xl mx-auto px-6">
        <Heading
          level="h1"
          className="text-3xl leading-10 text-ui-fg-base font-normal"
        >
          Neutral Ecommerce Theme
        </Heading>
        <Heading
          level="h2"
          className="text-xl leading-8 text-ui-fg-subtle font-normal"
        >
          B9 Design starter storefront — customise branding per client
        </Heading>
        <p className="text-small-regular text-ui-fg-muted max-w-lg">
          Medusa v2 backend with a neutral Next.js shell. Wire products, regions,
          and payments when you spin up a new store.
        </p>
        <LocalizedClientLink
          href="/store"
          className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-base transition-colors duration-b9-fast underline-offset-4 hover:underline"
        >
          Browse the store
        </LocalizedClientLink>
      </div>
    </section>
  )
}

export default Hero
