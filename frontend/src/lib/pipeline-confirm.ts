/**
 * Confirmation navigateur avant les lancements lourds (évite les relances accidentelles).
 */

export function confirmHeavyPipelineRun(key: string): boolean {
  if (key === "pipeline") {
    return window.confirm(
      "Lancer le traitement complet ?\n\n" +
        "Collecte, traduction, puis toute la chaîne d’enrichissement. " +
        "C’est long, coûteux en API et le bouton Actualiser reste indisponible tant que le serveur travaille.\n\n" +
        "Confirmer ?",
    );
  }
  if (key === "resumePipeline") {
    return window.confirm(
      "Reprendre le pipeline complet ?\n\n" +
        "Même chaîne que le traitement complet (certaines étapes peuvent être ignorées si déjà journalisées). " +
        "Confirmer ?",
    );
  }
  return true;
}
