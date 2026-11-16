import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles =
    variant === 'primary'
      ? 'bg-acid text-bg hover:brightness-110 disabled:bg-line disabled:text-muted'
      : 'border border-line text-ink hover:border-acid-dim hover:text-acid disabled:text-muted disabled:hover:border-line';
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Panel({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface/90 p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'acid' | 'spark' | 'amber' }) {
  const tones = {
    muted: 'border-line text-muted',
    acid: 'border-acid-dim text-acid',
    spark: 'border-spark/50 text-spark',
    amber: 'border-amber/50 text-amber',
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</p>;
}
