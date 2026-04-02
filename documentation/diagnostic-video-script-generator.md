# Rapport de Diagnostic - Générateur de Script Vidéo

L'architecture à deux passes (Pass 1: Narration, Pass 2: Structuration) a grandement amélioré la densité, mais plusieurs points de fragilité subsistent pour les contenus longs et complexes.

## 1. Perte de Contexte sur les Longs Formats (Chunking)
Pour les vidéos dépassant 800 mots, le système découpe la narration en "chunks" de 300 mots pour la structuration en scènes (Pass 2).
- **Problème** : Chaque chunk est envoyé à l'IA avec un contexte minimal (`chunkIndex`, `startSceneNumber`). L'IA n'a pas accès aux descriptions visuelles ou aux lieux définis dans les chunks précédents.
- **Impact** : Ruptures de continuité visuelle (changement de décor ou de tenue inexpliqué) entre les scènes charnières (ex: entre la scène 10 et 11).
- **Solution** : Passer un résumé des scènes précédentes (Lieu, Actions en cours) dans le `chunkContext`.

## 2. Pression sur le Word Count (Under-generation)
Bien que le Pass 1 soit dédié au texte, le mécanisme de "retry" (expansion) est limité à une seule tentative.
- **Problème** : Si Gemini produit 60% de la cible, une seule expansion peut ne pas suffire pour atteindre les 100% nécessaires à une vidéo rythmée.
- **Impact** : Vidéos avec des blancs ou des scènes trop lentes car la narration est trop courte pour la durée cible.
- **Solution** : Implémenter une boucle d'expansion plus agressive ou des "scaffolds" (plans) plus détaillés dès le Pass 1.

## 3. Biais du Scoring (Quantité vs Structure)
La fonction `scoreCandidate` accorde 40% au volume de mots mais seulement 10% à la structure (nombre de scènes).
- **Risque** : Une proposition avec le bon nombre de mots mais seulement 2 scènes géantes pour 1 minute de vidéo peut obtenir un score de ~0.85 et être acceptée, créant un résultat visuellement ennuyeux.
- **Solution** : Rééquilibrer le score pour pénaliser plus fortement les écarts au nombre de scènes `ideal`.

## 4. Fragilité du JSON Repair
La méthode `repairJson` est une machine à états manuelle qui tente de fermer les accolades tronquées.
- **Problème** : Si l'IA coupe au milieu d'une chaîne complexe ou d'un objet imbriqué, la réparation peut produire un JSON "valide" mais sémantiquement pauvre (données manquantes).
- **Solution** : Utiliser des techniques de "prompting" pour forcer l'IA à conclure proprement ses blocs JSON, ou utiliser des stream parsers plus robustes.

## 5. Drift de Narration (Consistency)
Le `fixFullNarrationDrift` recalcule la narration globale après coup.
- **Observation** : Si la somme des scènes diffère trop de la narration originale, forcer la cohérence peut créer des sauts logiques.

---

### Résumé des priorités
1. **Rétablir la continuité visuelle** entre les chunks de long format.
2. **Durcir le scoring** sur le nombre de scènes pour garantir le dynamisme.
3. **Optimiser le Pass 1** pour garantir l'atteinte du Word Count cible sans retry systématique.
