import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card">
      <h2>Page not found</h2>
      <p>The page you requested does not exist.</p>
      <Link href="/">Go back home</Link>
    </section>
  );
}
