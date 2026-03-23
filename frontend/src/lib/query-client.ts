import { QueryClient } from "@tanstack/react-query";

/**
 * staleTime par défaut 2 min (listes articles peuvent surcharger localement).
 * Les pages édition / sujets utilisent souvent staleTime 5 min sur leurs clés.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
