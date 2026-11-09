import AuthFrame from "../auth-frame";
import { Forgot } from "../forms";

export const metadata = { title: "Forgot password" };
export default function Page() { return <AuthFrame title="Reset your password"><Forgot /></AuthFrame>; }
