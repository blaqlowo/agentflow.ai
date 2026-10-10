import type { Metadata } from "next";
import { DemoApp } from "@/components/workflow/DemoApp";
import { DEFAULT_SAMPLE, SAMPLES } from "@/lib/workflow/samples";

export const metadata: Metadata = { title: "Live demo | AgentFlow AI" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  const { sample } = await searchParams;
  const chosen = SAMPLES.find((s) => s.slug === sample) ?? DEFAULT_SAMPLE;
  return <DemoApp initial={structuredClone(chosen.workflow)} />;
}
