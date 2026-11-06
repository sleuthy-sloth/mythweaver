import type { ReactNode } from 'react';
import type { Roll as RollRecord } from '@mythweaver/contracts';

export function Panel({
  title,
  subtitle,
  actions,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="panel" aria-labelledby={id ?? undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-display text-xl leading-tight">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  type = 'text',
  value,
  onChange,
  autoComplete,
  required,
  placeholder,
  inputMode,
  min,
  max,
  describedBy,
}: {
  id: string;
  type?: 'text' | 'email' | 'password' | 'number';
  value: string | number;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'email' | 'numeric';
  min?: number;
  max?: number;
  describedBy?: string | undefined;
}) {
  return (
    <input
      id={id}
      className="input"
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete ?? undefined}
      required={required ?? false}
      placeholder={placeholder ?? undefined}
      inputMode={inputMode ?? undefined}
      min={min ?? undefined}
      max={max ?? undefined}
      aria-describedby={describedBy ?? undefined}
    />
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  disabled,
  busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy ? true : undefined}
      className={`btn btn-${variant}`}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

const OUTCOME_LABEL: Record<RollRecord['outcome'], string> = {
  strong_hit: 'Strong hit',
  weak_hit: 'Weak hit',
  miss: 'Miss',
};

/** Colour is decoration; the word carries the meaning. */
export function OutcomeBadge({ outcome }: { outcome: RollRecord['outcome'] }) {
  return <span className={`badge badge-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>;
}

export function DiceRow({ roll }: { roll: RollRecord }) {
  // A die of 0 was cancelled by a momentum burn, so it counts as beaten by definition.
  const isBeaten = (die: number) => die === 0 || roll.actionScore > die;

  return (
    <div className="flex items-end gap-3" aria-label="Dice">
      <div className="text-center">
        <div className="die die-action">{roll.actionDie === 0 ? '—' : roll.actionDie}</div>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">Action</p>
      </div>
      <span className="pb-5 text-muted" aria-hidden="true">
        vs
      </span>
      {roll.challenge.map((die, index) => (
        <div key={index} className="text-center">
          <div className={`die ${isBeaten(die) ? 'die-beaten' : ''}`}>{die}</div>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
            {die === 0 ? 'Burned' : `Die ${index + 1}`}
          </p>
        </div>
      ))}
      <div className="ml-auto text-right">
        <p className="font-display text-2xl leading-none">{roll.actionScore}</p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">Score</p>
      </div>
    </div>
  );
}

export function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="inset px-2 py-2 text-center">
      <p className="font-display text-xl leading-none">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inset px-2 py-2">
      <p className="text-center text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button
          type="button"
          className="stepper"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <span className="font-display text-xl leading-none" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className="stepper"
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
