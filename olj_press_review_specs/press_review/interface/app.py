"""
OLJ Press Review — Streamlit Interface
Editorial interface for journalists to select articles and generate press reviews.
"""

import asyncio
import streamlit as st
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func

# Must be first Streamlit command
st.set_page_config(
    page_title="OLJ — Revue de Presse",
    page_icon="🇱🇧",
    layout="wide",
)

from src.config import get_settings
from src.models.database import Article, MediaSource, get_session_factory
from src.generators.press_review import PressReviewGenerator

settings = get_settings()
session_factory = get_session_factory()


def run_async(coro):
    """Helper to run async functions in Streamlit."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def get_todays_articles(filters: dict) -> list:
    """Fetch today's translated articles with filters."""
    async with session_factory() as db:
        query = (
            select(Article, MediaSource)
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(Article.status.in_(["translated", "formatted"]))
            .where(Article.collected_at >= datetime.now(timezone.utc) - timedelta(days=2))
        )
        
        if filters.get("country"):
            query = query.where(MediaSource.country_code.in_(filters["country"]))
        if filters.get("article_type"):
            query = query.where(Article.article_type.in_(filters["article_type"]))
        if filters.get("language"):
            query = query.where(Article.source_language.in_(filters["language"]))
        if filters.get("min_confidence"):
            query = query.where(
                Article.translation_confidence >= filters["min_confidence"]
            )
        
        query = query.order_by(Article.published_at.desc())
        result = await db.execute(query)
        return result.all()


async def get_stats() -> dict:
    """Get collection statistics."""
    async with session_factory() as db:
        today = datetime.now(timezone.utc) - timedelta(days=1)
        
        total = await db.execute(
            select(func.count(Article.id)).where(Article.collected_at >= today)
        )
        translated = await db.execute(
            select(func.count(Article.id))
            .where(Article.collected_at >= today)
            .where(Article.status == "translated")
        )
        by_country = await db.execute(
            select(MediaSource.country, func.count(Article.id))
            .join(MediaSource, Article.media_source_id == MediaSource.id)
            .where(Article.collected_at >= today)
            .group_by(MediaSource.country)
        )
        
        return {
            "total_collected": total.scalar() or 0,
            "total_translated": translated.scalar() or 0,
            "by_country": dict(by_country.all()),
        }


# ─── SIDEBAR ──────────────────────────────────────────────────────
st.sidebar.title("🇱🇧 OLJ Revue de Presse")
st.sidebar.markdown("---")

# Filters
st.sidebar.subheader("Filtres")

COUNTRIES = {
    "LB": "🇱🇧 Liban", "IL": "🇮🇱 Israël", "IR": "🇮🇷 Iran",
    "AE": "🇦🇪 EAU", "SA": "🇸🇦 Arabie Saoudite", "TR": "🇹🇷 Turquie",
    "IQ": "🇮🇶 Irak", "SY": "🇸🇾 Syrie", "QA": "🇶🇦 Qatar",
    "JO": "🇯🇴 Jordanie", "EG": "🇪🇬 Égypte", "US": "🇺🇸 USA",
    "GB": "🇬🇧 UK", "FR": "🇫🇷 France",
}
selected_countries = st.sidebar.multiselect(
    "Pays", options=list(COUNTRIES.keys()),
    format_func=lambda x: COUNTRIES[x],
    default=[],
)

ARTICLE_TYPES = {
    "opinion": "Opinion", "editorial": "Éditorial", "tribune": "Tribune",
    "analysis": "Analyse", "news": "News", "interview": "Interview",
}
selected_types = st.sidebar.multiselect(
    "Type d'article", options=list(ARTICLE_TYPES.keys()),
    format_func=lambda x: ARTICLE_TYPES[x],
    default=["opinion", "editorial", "tribune", "analysis"],
)

min_confidence = st.sidebar.slider(
    "Confiance traduction min.", 0.0, 1.0, 0.5, 0.05
)

# ─── MAIN AREA ────────────────────────────────────────────────────
st.title("Revue de Presse Régionale")
st.markdown(f"**{datetime.now().strftime('%A %d %B %Y')}**")

# Stats
stats = run_async(get_stats())
col1, col2, col3 = st.columns(3)
col1.metric("Articles collectés (24h)", stats["total_collected"])
col2.metric("Articles traduits", stats["total_translated"])
col3.metric("Pays couverts", len(stats["by_country"]))

st.markdown("---")

# ─── ARTICLE LIST ─────────────────────────────────────────────────
filters = {
    "country": selected_countries if selected_countries else None,
    "article_type": selected_types if selected_types else None,
    "min_confidence": min_confidence,
}

articles_data = run_async(get_todays_articles(filters))

if not articles_data:
    st.info("Aucun article traduit disponible avec ces filtres. Lancez la collecte ou ajustez les filtres.")
else:
    st.subheader(f"📰 {len(articles_data)} articles disponibles")
    
    # Selection state
    if "selected_articles" not in st.session_state:
        st.session_state.selected_articles = []

    for article, source in articles_data:
        confidence_color = (
            "🟢" if (article.translation_confidence or 0) >= 0.8
            else "🟡" if (article.translation_confidence or 0) >= 0.6
            else "🔴"
        )
        
        with st.expander(
            f"{confidence_color} **{article.title_fr or article.title_original}** "
            f"— {source.name} ({COUNTRIES.get(source.country_code, source.country)})"
        ):
            col_a, col_b = st.columns([3, 1])
            
            with col_a:
                if article.thesis_summary_fr:
                    st.markdown(f"**Thèse** : {article.thesis_summary_fr}")
                if article.summary_fr:
                    st.markdown(f"**Résumé** : {article.summary_fr}")
                if article.translation_notes:
                    st.caption(f"⚠️ Notes traduction : {article.translation_notes}")
                st.caption(
                    f"Type : {article.article_type} | "
                    f"Langue : {article.source_language} | "
                    f"Confiance : {article.translation_confidence:.0%}" 
                    if article.translation_confidence else ""
                )
            
            with col_b:
                st.markdown(f"**Auteur** : {article.author or 'N/A'}")
                st.markdown(f"**Publié** : {article.published_at.strftime('%d/%m/%Y') if article.published_at else 'N/A'}")
                st.markdown(f"[Lire l'original]({article.url})")
                
                is_selected = str(article.id) in st.session_state.selected_articles
                if st.button(
                    "✅ Sélectionné" if is_selected else "➕ Sélectionner",
                    key=f"btn_{article.id}",
                    type="primary" if not is_selected else "secondary",
                ):
                    aid = str(article.id)
                    if aid in st.session_state.selected_articles:
                        st.session_state.selected_articles.remove(aid)
                    else:
                        st.session_state.selected_articles.append(aid)
                    st.rerun()

# ─── GENERATION PANEL ─────────────────────────────────────────────
st.markdown("---")
st.subheader("📋 Génération de la revue")

selected = st.session_state.get("selected_articles", [])
st.write(f"**{len(selected)} article(s) sélectionné(s)**")

if selected and st.button("🚀 Générer la revue de presse", type="primary"):
    with st.spinner("Génération en cours avec Claude Sonnet 4.5..."):
        generator = PressReviewGenerator()
        review_text = run_async(generator.generate_full_review(selected))
    
    st.success("Revue générée avec succès !")
    
    # Display and copy
    st.text_area(
        "Revue de presse — Copier-coller dans le CMS",
        value=review_text,
        height=600,
        key="review_output",
    )
    
    # Download button
    st.download_button(
        label="📥 Télécharger (.txt)",
        data=review_text,
        file_name=f"revue_presse_{datetime.now().strftime('%Y%m%d')}.txt",
        mime="text/plain",
    )

elif not selected:
    st.info("Sélectionnez 3 à 5 articles ci-dessus pour générer la revue de presse.")
