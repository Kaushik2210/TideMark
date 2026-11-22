import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold">That page is not here</h1>
      <p className="mt-2 text-muted">It may have moved, or the lake id may be wrong.</p>
      <p className="mt-4 flex gap-4">
        <Link className="tap inline-flex items-center underline" href="/">Back to the map</Link>
        <Link className="tap inline-flex items-center underline" href="/lakes/">All lakes</Link>
      </p>
    </div>
  );
}
