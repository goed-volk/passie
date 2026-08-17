import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900",
        secondary: "border-transparent bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100",
        destructive: "border-transparent bg-red-600 dark:bg-red-700 text-white",
        outline: "text-slate-950 dark:text-slate-100 border-slate-200 dark:border-slate-800",
        success: "border-transparent bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-transparent dark:border-emerald-800/40",
        warning: "border-transparent bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-transparent dark:border-amber-800/40",
        info: "border-transparent bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-transparent dark:border-blue-800/40",
        gray: "border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
