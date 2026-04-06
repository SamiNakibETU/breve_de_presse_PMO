# Fondations — tokens et conventions

Les valeurs ci-dessous sont une **base de travail** pour le journal dans ce dépôt. Les ajuster après choix de polices réelles et tests d’accessibilité (contraste WCAG).

## Variables CSS suggérées (`:root`)

```css
:root {
  /* Surfaces */
  --color-bg: #f7f5f0;
  --color-bg-elevated: #ffffff;
  --color-bg-muted: #efede8;

  /* Texte */
  --color-text: #141414;
  --color-text-secondary: #4a4a48;
  --color-text-tertiary: #6b6b68;
  --color-text-inverse: #fafaf8;

  /* Bordures & filets */
  --color-border: #e2e0da;
  --color-border-strong: #c9c6bf;

  /* Accent éditorial (rubrique active, lien fort, état sélectionné) */
  --color-accent: #8b1e1e;
  --color-accent-muted: #b33a3a;
  /* Note : l’app Next « revue de presse » utilise aujourd’hui #dd3b31 (voir globals.css / README racine) ; harmoniser tokens doc ↔ code en implémentation. */

  /* États */
  --color-focus-ring: #1a1a18;
  --color-danger: #a42020;

  /* Direct / urgence (à réserver) */
  --color-live: #b42318;

  /* Conversion (CTA secondaire — discret) */
  --color-cta-bg: #e8d9a8;
  --color-cta-text: #141414;

  /* Typo — familles (à brancher sur les fichiers de fontes) */
  --font-display: "...", ui-serif, Georgia, "Times New Roman", serif;
  --font-body: "...", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;

  /* Échelle typo (rem) */
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;
  --text-5xl: 2.75rem;

  /* Interlignage */
  --leading-tight: 1.2;
  --leading-snug: 1.35;
  --leading-normal: 1.5;
  --leading-relaxed: 1.65;

  /* Espacement (échelle 4) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;

  /* Conteneur lecture */
  --prose-width: 40rem;
  --layout-max: 75rem;

  /* Rayons — carrés ou quasi */
  --radius-sm: 2px;
  --radius-md: 4px;

  /* Ombre — quasiment aucune */
  --shadow-float: 0 1px 2px rgb(0 0 0 / 0.06);
}
```

## Mapping Tailwind (indicatif)

- `colors` : référencer les mêmes clés (`bg`, `text`, `border`, `accent`, `live`, `cta`).
- `fontFamily` : `display`, `sans`, `mono`.
- `maxWidth` : `prose` → `--prose-width`, `content` → `--layout-max`.

## Conventions de nommage

- **Sémantique** : `text-secondary` plutôt que `gray-500` dans les composants métier.
- **État** : `is-active`, `data-state=open`, `aria-current` pour la navigation.
