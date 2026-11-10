"use client";
import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/** Notes where the visitor came from when they arrive (see lib/attribution.ts). Draws nothing. */
export default function Arrival() {
  useEffect(() => { captureAttribution(); }, []);
  return null;
}
