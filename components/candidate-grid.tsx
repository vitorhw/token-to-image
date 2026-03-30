"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CandidateGridProps {
  candidates: string[];
  onSelect: (index: number) => void;
  pipeline: string;
}

export function CandidateGrid({ candidates, onSelect, pipeline }: CandidateGridProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">Pick your favorite</p>
        <Badge variant="outline" className="text-[10px]">{pipeline}</Badge>
      </div>
      <div className={cn(
        "grid gap-3 w-full",
        candidates.length >= 4 ? "grid-cols-2 max-w-2xl" : "grid-cols-1 max-w-md"
      )}>
        {candidates.map((url, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className="group relative overflow-hidden rounded-xl border-2 border-transparent transition-all hover:border-primary hover:shadow-lg hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Candidate ${i + 1}`}
              className="aspect-square w-full object-cover"
            />
            <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              #{i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
