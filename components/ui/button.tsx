/**
 * Base Button. shadcn/ui-flavoured but inlined (no CLI install) so we don't
 * pull a runtime dep we don't need. Variants stay small until proven necessary.
 *
 * Use semantic colour tokens (bg-primary etc.) so the dark/light themes work
 * for free.
 */

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  default:
    'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring',
  ghost: 'hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive',
  outline:
    'border border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
