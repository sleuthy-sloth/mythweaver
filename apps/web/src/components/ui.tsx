import type { ReactNode } from 'react';
import type { Roll as RollRecord } from '@mythweaver/contracts';

const OUTCOME_LABEL: Record<RollRecord['outcome'], string> = {
  strong_hit: 'Strong hit',
  weak_hit: 'Weak hit',
  miss: 'Miss',
};

/** The mark: a chevron above a rule, like a surveyor's sign. Inline so it ships with the app. */
export function Emblem({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0 text-accent"
    >
      <path
        d="M4 18 12 4l8 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 14.5h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="mt-0.5 text-xl leading-tight">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
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
      <label htmlFor={htmlFor} className="eyebrow block">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
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
  className,
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
  className?: string;
}) {
  return (
    <input
      id={id}
      className={className ? `input ${className}` : 'input'}
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
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy ? true : undefined}
      className={`btn btn-${variant}${className ? ` ${className}` : ''}`}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

export function OutcomeMark({ outcome }: { outcome: RollRecord['outcome'] }) {
  return (
    <span className={`outcome outcome-${outcome}`} data-outcome={outcome}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function DiceRow({ roll }: { roll: RollRecord }) {
  // A die of 0 was cancelled by a momentum burn, so it counts as beaten by definition.
  const isBeaten = (die: number) => die === 0 || roll.actionScore > die;

  return (
    <div className="flex items-end gap-3">
      <div className="text-center">
        <div className="die die-action" aria-label={`Action die ${roll.actionDie}`}>
          {roll.actionDie}
        </div>
        <p className="eyebrow mt-1">Action</p>
      </div>

      <span className="mb-6 text-xs text-muted" aria-hidden="true">
        vs
      </span>

      {roll.challenge.map((die, index) => (
        <div key={index} className="text-center">
          <div
            className={`die ${isBeaten(die) ? 'die-beaten' : ''}`}
            aria-label={
              die === 0
                ? `Challenge die ${index + 1} cancelled`
                : `Challenge die ${index + 1}: ${die}`
            }
          >
            {die === 0 ? '—' : die}
          </div>
          <p className="eyebrow mt-1">{die === 0 ? 'Burned' : `Die ${index + 1}`}</p>
        </div>
      ))}

      <div className="ml-auto border-l border-border pl-3 text-right">
        <p className="numeral text-3xl leading-none">{roll.actionScore}</p>
        <p className="eyebrow mt-1">Score</p>
      </div>
    </div>
  );
}

export function StatFigure({ name, value }: { name: string; value: number }) {
  return (
    <div className="stat-figure">
      <p className="value">{value}</p>
      <p className="name">{name}</p>
    </div>
  );
}

/**
 * A five-segment meter. Pips read faster than a numeral alone, and the steppers flank them so the
 * thing you change is the thing you see.
 */
export function PipMeter({
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
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="numeral text-lg leading-none">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          className="stepper"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: max - min }, (_, index) => (
            <span key={index} className={`pip ${index < value - min ? 'pip-on' : ''}`} />
          ))}
        </div>
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

/**
 * Momentum runs −6 to +10 and moves more than any other stat, so it gets its own gauge: a zero
 * mark, a fill that reads at a glance, and the reset value written under the track.
 */
export function MomentumGauge({
  value,
  reset,
  max,
  min,
  onChange,
  disabled,
}: {
  value: number;
  reset: number;
  max: number;
  min: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const steps = max - min + 1;
  const zeroIndex = -min;
  const valueIndex = value - min;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Momentum</span>
        <span className="numeral text-lg leading-none">{value > 0 ? `+${value}` : value}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          className="stepper"
          aria-label="Decrease Momentum"
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>

        <div
          className="flex h-8 flex-1 items-center gap-[3px]"
          role="img"
          aria-label={`Momentum ${value}, reset plus ${reset}, maximum plus ${max}`}
        >
          {Array.from({ length: steps }, (_, index) => {
            const inFill =
              valueIndex >= zeroIndex
                ? index > zeroIndex && index <= valueIndex
                : index >= valueIndex && index < zeroIndex;
            const isZero = index === zeroIndex;
            const tone = inFill
              ? value >= 0
                ? 'bg-accent'
                : 'bg-danger'
              : isZero
                ? 'bg-border-strong'
                : 'bg-border';
            return <span key={index} className={`h-3 flex-1 rounded-[1px] ${tone}`} />;
          })}
        </div>

        <button
          type="button"
          className="stepper"
          aria-label="Increase Momentum"
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>

      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.1em] text-muted">
        <span>−6</span>
        <span>reset +{reset}</span>
        <span>+{max}</span>
      </div>
    </div>
  );
}

export function RollLine({ roll }: { roll: RollRecord }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className={`badge badge-${roll.outcome}`}>
          {roll.outcome === 'strong_hit' ? 'Strong' : roll.outcome === 'weak_hit' ? 'Weak' : 'Miss'}
        </span>
        <span className="text-sm text-ink-soft">
          {roll.stat}
          {roll.adds !== 0 ? ` ${roll.adds > 0 ? '+' : ''}${roll.adds}` : ''}
        </span>
        {roll.match ? <span className="eyebrow">match</span> : null}
      </span>
      <span className="mono-figures shrink-0 text-xs text-muted">
        {roll.actionDie} vs {roll.challenge[0]}/{roll.challenge[1]} · {roll.actionScore}
      </span>
    </li>
  );
}
