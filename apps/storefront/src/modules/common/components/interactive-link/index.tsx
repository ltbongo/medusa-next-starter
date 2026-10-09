import { Text } from "@modules/common/components/ui"
import LocalizedClientLink from "../localized-client-link"
type InteractiveLinkProps = {
  href: string
  children?: React.ReactNode
  onClick?: () => void
}

const InteractiveLink = ({
  href,
  children,
  onClick,
  ...props
}: InteractiveLinkProps) => {
  return (
    <LocalizedClientLink
      className="flex gap-x-1 items-center group"
      href={href}
      onClick={onClick}
      {...props}
    >
      <Text className="text-ui-fg-interactive">{children}</Text>
      <span
        className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150"
        aria-hidden
      >
        →
      </span>
    </LocalizedClientLink>
  )
}

export default InteractiveLink
