// A plain link. The framework's <Link> (vinext 1.0.0-beta.5) breaks in production builds: its prefetch and
// click handler throw ("f is not a function", "e is not a function"), the click is swallowed and the page never
// changes. A normal anchor always navigates (a full page load, which these server-rendered pages are built for),
// and in-page anchors (#section) scroll natively.
import type { AnchorHTMLAttributes, ReactNode } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname?: string; hash?: string; query?: Record<string, string> }; prefetch?: boolean; replace?: boolean; scroll?: boolean; children?: ReactNode };

function toHref(href: Props["href"]): string {
  if (typeof href === "string") return href;
  const query = href.query ? `?${new URLSearchParams(href.query).toString()}` : "";
  return `${href.pathname ?? ""}${query}${href.hash ? `#${href.hash.replace(/^#/, "")}` : ""}`;
}

export default function Link({ href, prefetch, replace, scroll, children, ...rest }: Props) {
  void prefetch; void replace; void scroll;
  return <a href={toHref(href)} {...rest}>{children}</a>;
}
