"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ArticleReaderProvider } from "@/contexts/article-reader";
import { PipelineRunnerProvider } from "@/contexts/pipeline-runner";
import { createQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <PipelineRunnerProvider>
        <ArticleReaderProvider>{children}</ArticleReaderProvider>
      </PipelineRunnerProvider>
    </QueryClientProvider>
  );
}
