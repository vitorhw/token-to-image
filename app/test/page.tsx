"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TEST_CASES, TestCase } from "@/lib/test-cases";
import { Loader2, CheckCircle2, XCircle, Clock, ArrowLeft, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface TestResult {
  testId: string;
  testName: string;
  imageUrl: string;
  pipeline: string;
  enrichedPrompt: string;
  generationTime: number;
  judgeTime: number;
  judgement: {
    overallScore: number;
    overallPass: boolean;
    widgetScores: {
      widget: string;
      instruction: string;
      score: number;
      pass: boolean;
      reasoning: string;
    }[];
    summary: string;
  };
  error?: string;
}

type FilterTag = "all" | "spatial" | "color" | "camera" | "style" | "combined";

const TAG_LABELS: Record<FilterTag, string> = {
  all: "All Tests",
  spatial: "Spatial Position",
  color: "Color",
  camera: "Camera Angle",
  style: "Art Style",
  combined: "Combined",
};

export default function TestPage() {
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterTag>("all");

  const filteredTests = filter === "all"
    ? TEST_CASES
    : TEST_CASES.filter(tc => tc.tags.includes(filter));

  const runTest = useCallback(async (testCase: TestCase) => {
    setRunning(prev => new Set(prev).add(testCase.id));

    try {
      const res = await fetch("/api/test-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: testCase.id }),
      });
      const data = await res.json();
      if (data.error) {
        setResults(prev => {
          const next = new Map(prev);
          next.set(testCase.id, {
            testId: testCase.id,
            testName: testCase.name,
            imageUrl: "",
            pipeline: "",
            enrichedPrompt: "",
            generationTime: 0,
            judgeTime: 0,
            judgement: { overallScore: 0, overallPass: false, widgetScores: [], summary: "" },
            error: data.error,
          });
          return next;
        });
      } else {
        setResults(prev => {
          const next = new Map(prev);
          next.set(testCase.id, data);
          return next;
        });
      }
    } catch (err) {
      setResults(prev => {
        const next = new Map(prev);
        next.set(testCase.id, {
          testId: testCase.id,
          testName: testCase.name,
          imageUrl: "",
          pipeline: "",
          enrichedPrompt: "",
          generationTime: 0,
          judgeTime: 0,
          judgement: { overallScore: 0, overallPass: false, widgetScores: [], summary: "" },
          error: err instanceof Error ? err.message : "Unknown error",
        });
        return next;
      });
    } finally {
      setRunning(prev => {
        const next = new Set(prev);
        next.delete(testCase.id);
        return next;
      });
    }
  }, []);

  // Stats
  const completedResults = Array.from(results.values()).filter(r => !r.error);
  const passCount = completedResults.filter(r => r.judgement.overallPass).length;
  const failCount = completedResults.filter(r => !r.judgement.overallPass).length;
  const avgScore = completedResults.length > 0
    ? (completedResults.reduce((s, r) => s + r.judgement.overallScore, 0) / completedResults.length).toFixed(1)
    : "—";

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Pipeline Test Suite</h1>
          <Badge variant="outline">{TEST_CASES.length} tests</Badge>
        </div>
        <div className="flex items-center gap-4">
          {/* Stats */}
          {completedResults.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                Avg: <span className="font-semibold">{avgScore}/10</span>
              </span>
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {passCount}
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-3.5 w-3.5" />
                {failCount}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Filter tabs */}
      <div className="border-b px-6 py-2 flex gap-1.5">
        {(Object.keys(TAG_LABELS) as FilterTag[]).map(tag => (
          <button
            key={tag}
            onClick={() => setFilter(tag)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filter === tag ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground",
            )}
          >
            {TAG_LABELS[tag]}
            <span className="ml-1 opacity-60">
              ({tag === "all" ? TEST_CASES.length : TEST_CASES.filter(tc => tc.tags.includes(tag)).length})
            </span>
          </button>
        ))}
      </div>

      {/* Test list */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3 max-w-5xl mx-auto">
          {filteredTests.map(tc => {
            const result = results.get(tc.id);
            const isRunning = running.has(tc.id);

            return (
              <div key={tc.id} className="rounded-lg border overflow-hidden">
                {/* Test header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                  <div className="flex items-center gap-2">
                    {result?.error ? (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : result ? (
                      result.judgement.overallPass ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )
                    ) : isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    )}
                    <div>
                      <h3 className="text-sm font-medium">{tc.name}</h3>
                      <p className="text-xs text-muted-foreground">{tc.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tc.tags.filter(t => t !== "combined").map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                    ))}
                    {result && !result.error && (
                      <Badge
                        variant={result.judgement.overallPass ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {result.judgement.overallScore}/10
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => runTest(tc)}
                      disabled={isRunning}
                    >
                      {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run"}
                    </Button>
                  </div>
                </div>

                {/* Test result */}
                {result && !result.error && (
                  <div className="border-t">
                    <div className="flex gap-4 p-4">
                      {/* Generated image */}
                      <div className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.imageUrl}
                          alt={tc.name}
                          className="w-48 h-48 rounded-lg object-cover border"
                        />
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Gen: {(result.generationTime / 1000).toFixed(1)}s
                          &middot; Judge: {(result.judgeTime / 1000).toFixed(1)}s
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Pipeline: {result.pipeline}
                        </p>
                      </div>

                      {/* Judgement details */}
                      <div className="flex-1 space-y-2">
                        <p className="text-sm">{result.judgement.summary}</p>
                        <Separator />
                        {result.judgement.widgetScores.map((ws, i) => (
                          <div key={i} className="flex gap-2 items-start">
                            <div className="shrink-0 mt-0.5">
                              {ws.pass ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">{ws.widget}</span>
                                <Badge
                                  variant={ws.pass ? "default" : "destructive"}
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {ws.score}/10
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{ws.instruction}</p>
                              <p className="text-[11px] mt-0.5">{ws.reasoning}</p>
                            </div>
                          </div>
                        ))}

                        {/* Enriched prompt */}
                        <details className="mt-2">
                          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                            Enriched prompt
                          </summary>
                          <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
                            {result.enrichedPrompt}
                          </pre>
                        </details>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error display */}
                {result?.error && (
                  <div className="border-t p-4 bg-red-50">
                    <p className="text-xs text-red-700">Error: {result.error}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
