# Rapport de Diagnostic - Service de Sous-titres (ASS)

L'analyse du service `AssCaptionService` montre un système très riche en styles (Hormozi, Neon, Animated Background) mais reposant sur des fondations mathématiques fragiles pour le positionnement.

## 1. Fragilité du Layout (Problème de la Table de Chasse)
Le positionnement des mots pour les styles complexes (`scaling`, `bounce`, `hormozi`, `animated-background`) repose sur une table de caractères codée en dur (`CHAR_ADV`).
- **Problème** : Cette table est calibrée pour la police *Montserrat Bold*. Si l'utilisateur change de police ou de graisse, les calculs de `centerX` et de largeur deviennent faux.
- **Impact** : Le fond (Pill) ne cadre pas bien le texte, ou les mots semblent "sauter" lors des zooms.
- **Solution recommandée** : Introduire une mesure plus dynamique ou au moins des tables de rechange pour les polices populaires (Arial, Bebas, Roboto).

## 2. Support Emoji et ZWJ
La gestion des emojis (lignes 620-635) est simpliste.
- **Problème** : Elle utilise un décompte par "grapheme" mais ne gère pas les séquences ZWJ (Zero Width Joiner) complexes (couples, familles, tons de peau).
- **Impact** : Décalage visuel important si des emojis complexes sont utilisés dans les transcriptions.

## 3. Dérive RTL (Right-to-Left)
Le support RTL inverse manuellement les tableaux de mots.
- **Risque** : Sur des textes mixtes (Chiffres/Latin + Arabe), l'ordre d'affichage peut devenir confus car il ne repose pas sur l'algorithme BiDi natif.
- **Solution recommandée** : S'appuyer davantage sur les balises de direction de libass si possible.

## 4. Explosion d'Événements (Performance)
Certains styles comme `scaling` génèrent un nombre massif d'événements `Dialogue` (un par frame de l'animation).
- **Observation** : Bien que limité à 60 frames par mot, sur une vidéo de 10 minutes avec 1500 mots, le fichier `.ass` peut peser plusieurs Mo, ralentissant FFmpeg.
- **Solution recommandée** : Utiliser des fonctions de transition natives ASS (`\t`) plus agressives pour remplacer les keyframes calculés en JS.

## 5. Style "Hormozi" : Rigidité du Layout
Le style Hormozi (lignes 987-1051) force un passage à 3 mots par ligne.
- **Risque** : Sur des mots très longs, cela peut déborder de l'écran car le calcul de `fontSize` automatique ne prend pas ce "forçage" en compte dans ses boucles de test.

---

### Résumé des priorités
1. **Améliorer la précision du Layout** (mesure de largeur).
2. **Optimiser le poids du fichier ASS** via les balises `\t`.
3. **Sécuriser le rendu des Emojis complexes**.
