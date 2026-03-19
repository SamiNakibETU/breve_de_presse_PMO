import { QueryClient } from "@tanstack/react-query";

/** staleTime / gcTime : dashboard et listes restent « frais » 1 min sans re-fetch agressif */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
