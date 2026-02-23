'use client';

import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', ...props }: CardProps) {
  const classes = [
    'rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm',
    'dark:border-zinc-800 dark:bg-zinc-900/60',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes} {...props} />;
}

