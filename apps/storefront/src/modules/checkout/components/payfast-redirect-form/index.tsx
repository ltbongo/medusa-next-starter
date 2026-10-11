"use client"

import { useEffect, useRef } from "react"

type Props = {
  action: string
  fields: Array<[string, string]>
}

/** Auto-submit PayFast checkout fields returned from a Medusa payment session. */
export function PayfastRedirectForm({ action, fields }: Props) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.submit()
  }, [action, fields])

  return (
    <form ref={formRef} action={action} method="post">
      {fields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <noscript>
        <button type="submit">Pay with PayFast</button>
      </noscript>
      <p className="text-ui-fg-subtle txt-medium">Redirecting you to PayFast…</p>
    </form>
  )
}
