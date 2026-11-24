import type { Metadata } from "next";
import Link from "next/link";
import { StoryScroller } from "@/components/StoryScroller";
import { buildStory } from "@/lib/story";
import { getLakes, getSeries } from "@/lib/server-data";

export const metadata: Metadata = {
  title: "The story so far",
  description: "A guided tour of ten years of Bengaluru's lakes from space: what the record shows, what reports say, and where the method falls short.",
};

export default function StoryPage() {
  const lakes = getLakes();
  const series = Object.fromEntries(lakes.map((l) => [l.id, getSeries(l.id)]));
  const chapters = buildStory();
  return (
    <div>
      <header className="mx-auto max-w-[1400px] px-4 pb-4 pt-8 sm:px-8">
        <h1 className="font-serif text-4xl font-semibold">The story so far</h1>
        <p className="mt-2 max-w-2xl text-muted">
          A short guided tour of the record. The map follows as you scroll. Prefer to explore on your own?{" "}
          <Link className="underline" href="/">Go straight to the map</Link>.
        </p>
      </header>
      <StoryScroller chapters={chapters} lakes={lakes} series={series} />
    </div>
  );
}
