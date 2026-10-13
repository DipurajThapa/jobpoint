import PublicHeader from "@/components/public-header";
import PublicFooter from "@/components/public-footer";

export default function NotFound() {
  return <><PublicHeader /><main className="privacy-page"><div className="container privacy-content"><span className="eyebrow">PAGE NOT FOUND</span><h1>That page isn’t available.</h1><p>The link may be outdated or a role may have closed. Browse current opportunities or return to the homepage.</p><p><a className="button" href="/#jobs">Browse current roles</a> <a className="text-link" href="/">Go home</a></p></div></main><PublicFooter /></>;
}
