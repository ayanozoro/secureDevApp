import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-headline text-headline-lg">Page not found</h1>
      <p className="text-on-surface-variant">That route does not exist.</p>
      <Link href="/" className="rounded bg-indigo px-4 py-2 text-white hover:bg-indigo-hover">
        Back to dashboard
      </Link>
    </div>
  );
}
