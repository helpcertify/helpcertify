import { Link } from 'react-router-dom';

// Landed on from the header's "Help" link (StudentShell). There's no
// support-ticket/live-chat backend in this app, so this stays an honest
// self-serve hub — quick links to the pages a student most often needs
// when they're stuck, rather than a fabricated contact form or email
// address that nothing would actually answer.
export function HelpPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-ink">Help</h1>
      <p className="mb-6 text-sm text-ink-faint">Quick links to the places you'll likely need.</p>

      <div className="space-y-3">
        <HelpLink to="/home/past-quizzes" title="My Attempts" description="Review your past attempts, scores, and explanations." />
        <HelpLink to="/home/purchases" title="Billing & Orders" description="See what you've bought and its access period." />
        <HelpLink to="/home/settings" title="Settings" description="Appearance and other account preferences." />
        <HelpLink to="/home/profile" title="My Profile" description="Your name, email, and password." />
      </div>
    </div>
  );
}

function HelpLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link to={to} className="block rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-brand-400">
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-sm text-ink-faint">{description}</div>
    </Link>
  );
}
