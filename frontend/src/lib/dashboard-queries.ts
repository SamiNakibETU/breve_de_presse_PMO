import type { QueryClient } from "@tanstack/react-query";

/** Clés invalidées après une action pipeline (aligné sur la page d’accueil). */
export function invalidateDashboardQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["stats"] });
  void queryClient.invalidateQueries({ queryKey: ["status"] });
  void queryClient.invalidateQueries({ queryKey: ["clusters"] });
  void queryClient.invalidateQueries({ queryKey: ["clusterArticles"] });
  void queryClient.invalidateQueries({ queryKey: ["articles"] });
  void queryClient.invalidateQueries({ queryKey: ["mediaSourcesHealth"] });
  void queryClient.invalidateQueries({ queryKey: ["edition"] });
  void queryClient.invalidateQueries({ queryKey: ["editionTopics"] });
  void queryClient.invalidateQueries({ queryKey: ["editionClustersFallback"] });
  void queryClient.invalidateQueries({ queryKey: ["editionTopicDetail"] });
}
