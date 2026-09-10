export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const base = 'rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-neutral-900 text-white hover:bg-neutral-700',
    secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'red' | 'amber'; children: React.ReactNode }) {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">{children}</div>;
}
