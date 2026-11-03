import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="state" style={{ marginTop: 40 }}>
      <b>Page not found</b>
      <Link className="btn" href="/">Back to Overview</Link>
    </div>
  );
}
