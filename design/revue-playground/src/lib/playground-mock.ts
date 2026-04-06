/**
 * Données et réponses HTTP fictives pour le playground Next (`design/revue-playground`).
 * Activé uniquement si NEXT_PUBLIC_PLAYGROUND_MOCK=true.
 */
import type {
  Article,
  AppStatus,
  ClusterListResponse,
  CoverageTargetsResponse,
  Edition,
  EditionSelectionsResponse,
  EditionTopic,
  EditionTopicDetailResponse,
  MediaSourcesHealthResponse,
  OljTopicLabelsResponse,
  PipelineResumeStatus,
  PipelineTaskStatus,
  Stats,
} from "./types";

const NOW = "2026-04-02T10:00:00.000Z";

function editionIdForDate(publishDate: string): string {
  return `play-edition-${publishDate}`;
}

/** Fenêtre d’édition plausible (UTC) pour la démo. */
function editionWindow(publishDate: string): Pick<Edition, "window_start" | "window_end"> {
  const [y, m, d] = publishDate.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 2026, (m ?? 4) - 1, d ?? 2));
  const prev = new Date(day);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const y0 = prev.getUTCFullYear();
  const m0 = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const d0 = String(prev.getUTCDate()).padStart(2, "0");
  return {
    window_start: `${y0}-${m0}-${d0}T15:00:00.000Z`,
    window_end: `${publishDate}T03:00:00.000Z`,
  };
}

const MOCK_ARTICLES_FULL: Article[] = [
  {
    id: "play-a1",
    title_fr: "Tensions commerciales et narratif présidentiel",
    title_original: "Markets react to Gulf rhetoric",
    media_source_id: "ms-olj",
    media_name: "L'Orient-Le Jour",
    country: "Liban",
    country_code: "LB",
    author: "Rédaction",
    published_at: NOW,
    article_type: "opinion",
    source_language: "fr",
    translation_confidence: 0.95,
    translation_notes: null,
    summary_fr:
      "Analyse des mouvements de marché liés aux déclarations sur le détroit et aux réseaux sociaux.",
    thesis_summary_fr: "La rhétorique géopolitique sert de levier aux flux financiers.",
    key_quotes_fr: null,
    url: "https://www.lorientlejour.com/article/example",
    status: "translated",
    word_count: 1200,
    collected_at: NOW,
    editorial_relevance: 0.88,
    analysis_bullets_fr: [
      "Les marchés asiatiques réagissent en premier aux annonces sur les réseaux sociaux.",
      "Le détroit d’Ormuz reste le symbole court-termiste des tensions énergétiques.",
      "La volatilité crée une fenêtre spéculative que les commentateurs relient à l’agenda politique intérieur.",
    ],
    author_thesis_explicit_fr:
      "Le texte suggère que la rhétorique belliciste et les mouvements de capitaux sont liés.",
    factual_context_fr: "Contexte : tensions récurrentes autour du Golfe et du commerce pétrolier.",
    analysis_tone: "analytique",
    fact_opinion_quality: "mostly_opinion",
    analysis_version: "playground",
    analyzed_at: NOW,
    framing_json: {
      actor: "Présidence américaine",
      tone: "neutre",
      prescription: "Aucune",
    },
    content_translated_fr:
      "Premier paragraphe factuel sur les marchés et les volumes échangés.\n\nDeuxième paragraphe : mise en perspective régionale, sans bruit de page web parasite.\n\nTroisième paragraphe : conclusion prudente sur l’incertitude.",
    content_original: "First paragraph in English about markets...",
  },
  {
    id: "play-a2",
    title_fr: "Le Liban et les équilibres régionaux",
    title_original: "Lebanon regional balance",
    media_source_id: "ms-an-nahar",
    media_name: "Annahar",
    country: "Liban",
    country_code: "LB",
    author: "Plume invitée",
    published_at: NOW,
    article_type: "opinion",
    source_language: "ar",
    translation_confidence: 0.82,
    translation_notes: null,
    summary_fr: "Vue d’ensemble sur les alliances et les contraintes locales.",
    thesis_summary_fr: "La stabilité locale dépend des arbitrages extérieurs.",
    key_quotes_fr: null,
    url: "https://example.com/a2",
    status: "translated",
    word_count: 900,
    collected_at: NOW,
    editorial_relevance: 0.72,
    analysis_bullets_fr: ["Point sur les institutions.", "Lecture régionale.", "Risques pour 2026."],
    content_translated_fr: "Paragraphe un.\n\nParagraphe deux.",
  },
  {
    id: "play-a3",
    title_fr: "Tel Aviv : sécurité et opinion publique",
    title_original: "Security and polls",
    media_source_id: "ms-haaretz",
    media_name: "Haaretz",
    country: "Israël",
    country_code: "IL",
    author: null,
    published_at: NOW,
    article_type: "analysis",
    source_language: "he",
    translation_confidence: 0.79,
    translation_notes: null,
    summary_fr: "Synthèse des débats internes après les derniers événements.",
    thesis_summary_fr: null,
    key_quotes_fr: null,
    url: "https://example.com/a3",
    status: "needs_review",
    word_count: 600,
    collected_at: NOW,
    editorial_relevance: 0.65,
  },
  {
    id: "play-a4",
    title_fr: "Ankara et la diplomatie économique",
    title_original: "Turkey economic diplomacy",
    media_source_id: "ms-cumhuriyet",
    media_name: "Cumhuriyet",
    country: "Turquie",
    country_code: "TR",
    author: "Analyse",
    published_at: NOW,
    article_type: "opinion",
    source_language: "tr",
    translation_confidence: 0.91,
    translation_notes: null,
    summary_fr: "Focus sur les accords bilatéraux et le message aux marchés.",
    thesis_summary_fr: "La Turquie cherche un équilibre entre autonomie et intégration.",
    key_quotes_fr: null,
    url: "https://example.com/a4",
    status: "translated",
    word_count: 1100,
    collected_at: NOW,
    editorial_relevance: 0.7,
  },
  {
    id: "play-a5",
    title_fr: "Riyad : vision 2030 et presse",
    title_original: "Vision 2030 commentary",
    media_source_id: "ms-arab-news",
    media_name: "Arab News",
    country: "Arabie saoudite",
    country_code: "SA",
    author: null,
    published_at: NOW,
    article_type: "opinion",
    source_language: "en",
    translation_confidence: 0.88,
    translation_notes: null,
    summary_fr: "Comment la presse anglophone locale cadrée les annonces.",
    thesis_summary_fr: null,
    key_quotes_fr: null,
    url: "https://example.com/a5",
    status: "translated",
    word_count: 800,
    collected_at: NOW,
    editorial_relevance: 0.55,
  },
  {
    id: "play-a6",
    title_fr: "Téhéran : lecture des sanctions",
    title_original: "Sanctions readout",
    media_source_id: "ms-iran",
    media_name: "Média démo",
    country: "Iran",
    country_code: "IR",
    author: null,
    published_at: NOW,
    article_type: "news",
    source_language: "fa",
    translation_confidence: 0.7,
    translation_notes: null,
    summary_fr: "Brève sur les déclarations officielles.",
    thesis_summary_fr: null,
    key_quotes_fr: null,
    url: "https://example.com/a6",
    status: "pending",
    word_count: 400,
    collected_at: NOW,
    editorial_relevance: 0.4,
  },
];

function previewFromArticle(a: Article): import("./types").TopicArticlePreview {
  return {
    id: a.id,
    title_fr: a.title_fr,
    title_original: a.title_original,
    media_name: a.media_name,
    url: a.url,
    thesis_summary_fr: a.thesis_summary_fr,
    country: a.country,
    country_code: a.country_code,
    editorial_relevance: a.editorial_relevance,
    article_type: a.article_type,
    source_language: a.source_language,
    author: a.author,
    editorial_angle: a.editorial_angle,
    is_flagship: a.id === "play-a1",
    analysis_bullets_fr: a.analysis_bullets_fr,
    summary_fr: a.summary_fr,
    has_full_translation_fr: Boolean(a.content_translated_fr && a.content_translated_fr.length > 80),
  };
}

function mockTopics(_editionId: string): EditionTopic[] {
  return [
    {
      id: "play-topic-1",
      rank: 1,
      user_rank: null,
      title_proposed: "Marchés, Golfe et narration politique",
      title_final: "Marchés et rhétorique — lecture régionale",
      status: "ready",
      dominant_angle: "Finance",
      counter_angle: "Géopolitique",
      editorial_note: "Garder le lien avec la revue du matin.",
      angle_summary:
        "Comment les annonces présidentielles et le spectre du Golfe influencent les flux courts terme.",
      country_coverage: { LB: 1, IL: 1, TR: 1 },
      generated_text: null,
      is_multi_perspective: true,
      countries: ["LB", "IL", "TR"],
      article_count: 4,
      article_previews: ["play-a1", "play-a2", "play-a3", "play-a4"].map(
        (id) => previewFromArticle(MOCK_ARTICLES_FULL.find((x) => x.id === id)!),
      ),
    },
    {
      id: "play-topic-2",
      rank: 2,
      user_rank: null,
      title_proposed: "Pétrole et perception des risques",
      title_final: null,
      status: "draft",
      dominant_angle: "Énergie",
      counter_angle: null,
      editorial_note: null,
      angle_summary: "Lecture des risques perception vs fondamentaux.",
      country_coverage: { SA: 1, IR: 1 },
      generated_text: null,
      is_multi_perspective: false,
      countries: ["SA", "IR"],
      article_count: 2,
      article_previews: ["play-a5", "play-a6"].map(
        (id) => previewFromArticle(MOCK_ARTICLES_FULL.find((x) => x.id === id)!),
      ),
    },
  ];
}

function mockStats(): Stats {
  const counts_by_country_code = {
    LB: 40,
    IL: 35,
    TR: 38,
    SA: 24,
    IR: 12,
  };
  const country_labels_fr: Record<string, string> = {
    LB: "Liban",
    IL: "Israël",
    TR: "Turquie",
    SA: "Arabie saoudite",
    IR: "Iran",
  };
  const by_country: Record<string, number> = {};
  for (const [code, n] of Object.entries(counts_by_country_code)) {
    const lab = country_labels_fr[code] ?? code;
    by_country[lab] = (by_country[lab] ?? 0) + n;
  }
  return {
    total_collected_24h: 227,
    total_translated: 155,
    total_needs_review: 49,
    total_errors: 0,
    total_pending: 5,
    total_no_content: 2,
    countries_covered: Object.keys(counts_by_country_code).length,
    by_status: { translated: 155, needs_review: 49, pending: 5, error: 0 },
    by_country,
    counts_by_country_code,
    country_labels_fr,
    by_type: { opinion: 120, analysis: 40, news: 67 },
    by_language: { ar: 80, en: 60, fr: 45, he: 25, tr: 17 },
  };
}

function mockStatus(): AppStatus {
  return {
    status: "ok",
    environment: "playground",
    jobs: [
      {
        id: "edition_daily_create_beirut",
        name: "Création édition (Beyrouth)",
        next_run: "2026-04-03T03:00:00.000Z",
        last_run_at: NOW,
        last_run_ok: true,
      },
    ],
    pipeline_running: false,
    scheduler_enabled: true,
  };
}

function mockClusters(): ClusterListResponse {
  return {
    clusters: [
      {
        id: "play-cluster-1",
        label: "Golfe — perception des risques",
        article_count: 12,
        country_count: 4,
        avg_relevance: 0.71,
        latest_article_at: NOW,
        is_active: true,
        countries: ["LB", "SA", "IR", "AE"],
        is_emerging: false,
        thesis_previews: ["Thèse A", "Thèse B"],
      },
    ],
    total: 1,
    noise_count: 3,
  };
}

async function readJsonBody(init?: RequestInit): Promise<unknown> {
  const raw = init?.body;
  if (raw == null || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function playgroundMockResponse<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const pathKey = (path.split("?")[0] ?? path).split("#")[0] ?? path;
  const method = (init?.method ?? "GET").toUpperCase();
  const body = method !== "GET" ? await readJsonBody(init) : null;

  if (pathKey === "/health") {
    return { status: "ok" } as T;
  }

  if (pathKey === "/api/status") {
    return mockStatus() as T;
  }

  if (pathKey === "/api/stats") {
    return mockStats() as T;
  }

  if (pathKey === "/api/clusters") {
    return mockClusters() as T;
  }

  if (pathKey.startsWith("/api/editions/by-date/")) {
    const publishDate = pathKey
      .replace("/api/editions/by-date/", "")
      .split("/")[0] ?? "2026-04-02";
    const win = editionWindow(publishDate);
    const edition: Edition = {
      id: editionIdForDate(publishDate),
      publish_date: publishDate,
      ...win,
      timezone: "Asia/Beirut",
      target_topics_min: 4,
      target_topics_max: 8,
      status: "open",
      curator_run_id: null,
      pipeline_trace_id: null,
      generated_text: null,
      detection_status: "done",
      corpus_article_count: 35,
      corpus_country_count: 10,
      compose_instructions_fr: null,
    };
    return edition as T;
  }

  const editionTopicsRe = /^\/api\/editions\/([^/]+)\/topics$/;
  const mTopics = editionTopicsRe.exec(pathKey);
  if (mTopics && method === "GET") {
    return mockTopics(mTopics[1]!) as T;
  }

  const editionSelectionsRe = /^\/api\/editions\/([^/]+)\/selections$/;
  if (editionSelectionsRe.test(pathKey) && method === "GET") {
    const res: EditionSelectionsResponse = {
      topics: { "play-topic-1": ["play-a1", "play-a2"] },
      extra_article_ids: [],
      extra_articles: [],
    };
    return res as T;
  }

  const editionClustersFallbackRe = /^\/api\/editions\/([^/]+)\/clusters-fallback$/;
  if (editionClustersFallbackRe.test(pathKey) && method === "GET") {
    return [] as T;
  }

  const topicDetailRe =
    /^\/api\/editions\/([^/]+)\/topics\/([^/]+)$/;
  const mDetail = topicDetailRe.exec(pathKey);
  if (mDetail && method === "GET") {
    const topicId = mDetail[2]!;
    const topic = mockTopics(mDetail[1]!).find((t) => t.id === topicId);
    if (!topic) {
      throw new Error(`Playground: sujet inconnu ${topicId}`);
    }
    const ids = (topic.article_previews ?? []).map((p) => p.id);
    const detail: EditionTopicDetailResponse = {
      topic,
      article_ids: ids,
      article_refs: ids.map((article_id, i) => ({
        article_id,
        is_selected: i < 2,
        is_recommended: i === 0,
        rank_in_topic: i + 1,
        fit_confidence: 0.8,
        perspective_rarity: 0.5,
        display_order: i + 1,
      })),
    };
    return detail as T;
  }

  if (pathKey === "/api/config/coverage-targets") {
    const res: CoverageTargetsResponse = {
      country_codes: ["LB", "IL", "FR", "SA", "TR"],
      labels_fr: {
        LB: "Liban",
        IL: "Israël",
        FR: "France",
        SA: "Arabie saoudite",
        TR: "Turquie",
      },
    };
    return res as T;
  }

  if (pathKey === "/api/config/olj-topic-labels") {
    const res: OljTopicLabelsResponse = {
      version: "playground-1",
      labels_fr: {
        geo_levant: "Proche-Orient",
        theme_economy: "Économie",
      },
    };
    return res as T;
  }

  if (pathKey === "/api/articles" && method === "GET") {
    return {
      articles: MOCK_ARTICLES_FULL,
      total: MOCK_ARTICLES_FULL.length,
      counts_by_country: { LB: 2, IL: 1, TR: 1, SA: 1, IR: 1 },
    } as T;
  }

  if (pathKey === "/api/articles/by-ids" && method === "POST") {
    const ids = (body as { ids?: string[] } | null)?.ids ?? [];
    const set = new Set(ids);
    const articles = MOCK_ARTICLES_FULL.filter((a) => set.has(a.id));
    return { articles, total: articles.length } as T;
  }

  const articleByIdRe = /^\/api\/articles\/([^/?]+)$/;
  const mArt = articleByIdRe.exec(pathKey);
  if (mArt && method === "GET") {
    const id = decodeURIComponent(mArt[1]!);
    const a = MOCK_ARTICLES_FULL.find((x) => x.id === id);
    if (!a) {
      throw new Error(`Playground: article inconnu ${id}`);
    }
    return a as T;
  }

  if (pathKey === "/api/media-sources/health" && method === "GET") {
    const res: MediaSourcesHealthResponse = {
      window_hours: 72,
      critical_p0_sources_down: 0,
      translation_metrics_note_fr: "Données fictives — playground design.",
      sources: [
        {
          id: "ms-olj",
          name: "L'Orient-Le Jour",
          country_code: "LB",
          tier: 1,
          articles_72h: 42,
          last_collected_at: NOW,
          health_status: "ok",
          last_article_ingested_at: NOW,
        },
        {
          id: "ms-haaretz",
          name: "Haaretz",
          country_code: "IL",
          tier: 1,
          articles_72h: 38,
          last_collected_at: NOW,
          health_status: "ok",
          last_article_ingested_at: NOW,
        },
        {
          id: "ms-an-nahar",
          name: "Annahar",
          country_code: "LB",
          tier: 2,
          articles_72h: 15,
          last_collected_at: NOW,
          health_status: "degraded",
          last_article_ingested_at: NOW,
        },
      ],
    };
    return res as T;
  }

  if (pathKey === "/api/media-sources" && method === "GET") {
    return [
      {
        id: "ms-olj",
        name: "L'Orient-Le Jour",
        country: "Liban",
        country_code: "LB",
        tier: 1,
        languages: ["fr", "ar"],
        bias: null,
        collection_method: "rss",
        paywall: "partial",
        is_active: true,
        last_collected_at: NOW,
      },
    ] as T;
  }

  if (pathKey.includes("/detect-topics") && method === "POST") {
    return {
      status: "ok",
      topics_created: 0,
      detection_status: "done",
    } as T;
  }

  if (pathKey.includes("/analyze") && method === "POST") {
    return { status: "ok" } as T;
  }

  if (pathKey === "/api/pipeline/tasks" && method === "POST") {
    return { task_id: "play-task-1" } as T;
  }

  const taskRe = /^\/api\/pipeline\/tasks\/([^/]+)$/;
  const mTask = taskRe.exec(pathKey);
  if (mTask && method === "GET") {
    const st: PipelineTaskStatus = {
      task_id: mTask[1]!,
      kind: "collect",
      status: "done",
      step_key: "done",
      step_label: "Terminé (fictif)",
      result: { status: "ok", stats: {} },
      error: null,
      created_at: NOW,
      updated_at: NOW,
    };
    return st as T;
  }

  if (pathKey === "/api/pipeline/resume-status" && method === "GET") {
    const res: PipelineResumeStatus = {
      edition_id: null,
      has_collect: false,
      has_translate: false,
      has_pipeline_summary: false,
      skip_collect: false,
      skip_translate: false,
      beirut_day: "2026-04-02",
    };
    return res as T;
  }

  if (pathKey.startsWith("/api/regie/analytics/summary")) {
    return {
      period_days: 7,
      since_iso: NOW,
      usage_total: 0,
      usage_by_day: [],
      usage_top_paths: [],
      provider_total_calls: 0,
      provider_total_cost_usd: 0,
      provider_total_input_units: 0,
      provider_total_output_units: 0,
      provider_by_day: [],
      provider_by_operation: [],
      provider_by_provider: [],
      provider_by_model: [],
      provider_recent: [],
      note_fr: "Playground — métriques vides.",
    } as T;
  }

  if (pathKey.startsWith("/api/regie/pipeline-debug-logs")) {
    return { items: [], total: 0 } as T;
  }

  if (pathKey.startsWith("/api/regie/llm-call-logs")) {
    return { items: [], total: 0 } as T;
  }

  if (pathKey.startsWith("/api/regie/dedup-feedback")) {
    if (method === "GET") {
      return [] as T;
    }
    if (method === "POST") {
      const b = body as { article_id?: string; note?: string } | null;
      return {
        id: "play-dedup-1",
        article_id: b?.article_id ?? "play-a1",
        note: b?.note ?? "",
        created_at: NOW,
      } as T;
    }
  }

  if (pathKey === "/api/reviews" && method === "GET") {
    return { reviews: [] } as T;
  }

  const clusterArticlesRe = /^\/api\/clusters\/([^/]+)\/articles$/;
  if (clusterArticlesRe.test(pathKey) && method === "GET") {
    return {
      cluster_id: "play-cluster-1",
      cluster_label: "Golfe",
      articles_by_country: {},
      total_articles: 0,
      countries: [],
    } as T;
  }

  // Mutations fréquentes : succès no-op
  if (method === "POST" || method === "PATCH") {
    return { status: "ok", updated: 0 } as T;
  }

  if (process.env.NODE_ENV === "development") {
    console.warn("[playground-mock] Route non mockée :", method, path);
  }
  return {} as T;
}
