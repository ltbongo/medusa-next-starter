// lib/payfast/encoding.ts — PHP urlencode() equivalent (PayFast's reference code is PHP).
// PHP urlencode: every char except A-Z a-z 0-9 - _ . is %XX (UPPERCASE hex), space becomes '+'.
// encodeURIComponent leaves ! ' ( ) * ~ unencoded, so we encode those too. Docs: "URL encoding must be in
// upper case (eg. http%3A%2F%2F), and spaces encoded as '+'". PayFast's own Node sample only swaps %20->'+',
// which differs from PHP for ! ' ( ) * ~ — we follow PHP (verified against the official SDK test vectors).
export function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

/** Decode one application/x-www-form-urlencoded component ('+' = space). */
export function formDecode(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}
