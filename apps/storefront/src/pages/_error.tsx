import type { NextPageContext } from "next"

function ErrorPage({ statusCode }: { statusCode: number }) {
  return (
    <main style={{ padding: 48, textAlign: "center" }}>
      <h1>{statusCode}</h1>
      <p>{statusCode === 404 ? "Page not found" : "An error occurred"}</p>
      <a href="/">Go home</a>
    </main>
  )
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404
  return { statusCode }
}

export default ErrorPage
