"use client";

import { useState, useCallback, Children, ReactNode, isValidElement } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Individual step ── */

interface WidgetStepProps {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  hidden?: boolean;
  /** Whether this step's required input has been provided. Blocks "Continue" when false. */
  complete?: boolean;
}

export function WidgetStep({ children, className }: WidgetStepProps) {
  return <div className={className}>{children}</div>;
}

/* ── Wizard container ── */

interface WidgetWizardProps {
  children: ReactNode;
  onDone?: () => void;
}

export function WidgetWizard({ children, onDone }: WidgetWizardProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const steps: { step: number; title: string; description?: string; complete: boolean; node: ReactNode }[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<WidgetStepProps>(child) && child.type === WidgetStep && !child.props.hidden) {
      steps.push({
        step: child.props.step,
        title: child.props.title,
        description: child.props.description,
        complete: child.props.complete !== false, // default true
        node: child,
      });
    }
  });

  const totalPages = steps.length;
  const page = Math.min(currentPage, totalPages - 1);
  const current = steps[page];
  const isLastPage = page === totalPages - 1;
  const canAdvance = current?.complete ?? true;

  const goNext = useCallback(() => {
    if (isLastPage) {
      onDone?.();
    } else {
      setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
    }
  }, [isLastPage, onDone, totalPages]);

  if (!current) return null;

  return (
    <div className="space-y-3">
      {/* Top: navigation dots + step title */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s.step}
              onClick={() => i <= page && setCurrentPage(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === page
                  ? "w-6 bg-primary"
                  : i < page
                    ? "w-1.5 bg-primary/40 cursor-pointer"
                    : "w-1.5 bg-muted-foreground/20",
              )}
            />
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
        </div>
        <div>
          <p className="text-xs font-semibold">{current.title}</p>
          {current.description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{current.description}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[100px]">
        {current.node}
      </div>

      {/* Bottom: single CTA */}
      <Button
        className="w-full h-10"
        onClick={goNext}
        disabled={!canAdvance}
      >
        {isLastPage ? "Done" : "Continue"}
      </Button>
    </div>
  );
}
