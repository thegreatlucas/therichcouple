'use client';

import * as React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400',
  secondary:
    'bg-sky-500 text-white hover:bg-sky-600 focus-visible:ring-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400',
  outline:
    'border border-zinc-300 text-zinc-900 hover:bg-zinc-50 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900',
  ghost:
    'text-zinc-700 hover:bg-zinc-100 focus-visible:ring-zinc-300 dark:text-zinc-100 dark:hover:bg-zinc-900',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center rounded-xl font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    VARIANT_STYLES[variant],
    SIZE_STYLES[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
}

