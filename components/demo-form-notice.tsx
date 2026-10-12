import { DEMO_MODE, DEMO_MESSAGE } from "@/lib/demo";

export default function DemoFormNotice() {
  return DEMO_MODE ? <p className="demo-form-notice" role="note">{DEMO_MESSAGE}</p> : null;
}
