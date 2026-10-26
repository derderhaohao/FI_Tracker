import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        outline: 'border border-input bg-surface hover:bg-surface-2',
        ghost: 'hover:bg-surface-2',
        destructive: 'bg-critical text-white hover:opacity-90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 touch:h-11',
        // 32 px on desktop, 44 px on touch (UI-4).
        sm: 'h-8 px-2.5 text-xs touch:h-11 touch:px-3',
        icon: 'h-8 w-8 touch:h-11 touch:w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

/** Disabled buttons are faded and say so to assistive tech; `title` can say why (UI-5). */
export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={props.disabled || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
