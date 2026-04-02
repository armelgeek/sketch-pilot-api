# Rapport de Diagnostic - Bugs Potentiels du Panning

Après un audit approfondi du service `VideoAssembler`, voici les bugs potentiels et points d'amélioration identifiés :

## 1. Discontinuité du "Snap Zoom"
Le calcul dans `buildCinematicSnapZoom` présente un saut brusque.
- **Problème** : La première phase (linéaire) n'atteint que 5% du zoom cible avant de "sauter" directement au pic d'overshoot vers la fin de la séquence.
- **Impact** : L'animation semble figée au début puis se téléporte brutalement, ce qui peut être perçu comme un lag ou un bug de rendu.
- **Correction recommandée** : Utiliser une courbe plus agressive (ease-in) pour la montée vers le pic pour une transition plus fluide.

## 2. Dérive Diagonale dans `createStaticClip`
Certains presets du mode "Static" (utilisé par défaut pour les images fixes sans action caméra spécifique) ont encore des dérives diagonales.
- **Problème** : Les cas 6 et 7 utilisent `CX + offset`.
- **Impact** : Même si c'est voulu pour la variété, cela casse l'aspect "ancré" que vous recherchez peut-être pour toutes les scènes.
- **Correction recommandée** : Harmoniser ces presets pour qu'ils soient purement centrés si l'utilisateur demande une esthétique stable.

## 3. Micro-Jitter (Scintillement) lié à FFmpeg
FFmpeg tronque les coordonnées `x` et `y` du filtre `zoompan` en entiers.
- **Problème** : Sur des zooms très lents, le "crop" saute d'un pixel à l'autre de manière saccadée.
- **État actuel** : Vous utilisez déjà un `ZOOMPAN_SCALE_FACTOR = 4` qui réduit grandement ce problème (en travaillant sur une canvas 4x plus grande).
- **Amélioration possible** : Ajouter un léger décalage sub-pixel dynamique (`+0.001*on`) pour "forcer" une interpolation plus douce de FFmpeg dans certains cas.

## 4. Inefficacité du "Dutch Tilt"
Le Dutch Tilt (inclinaison) se fait en deux passes FFmpeg.
- **Problème** : On génère d'abord un zoom centré, puis on applique une rotation sur la vidéo résultante.
- **Impact** : Temps de rendu multiplié par 1.5 sur ces scènes et légère perte de piqué due au double échantillonnage.
- **Amélioration possible** : Intégrer la rotation directement dans le `complexFilter` de la première passe.

---

### Prochaines Étapes suggérées
1. **Fluidifier le Snap Zoom** pour éviter le saut brutal.
2. **Harmoniser `createStaticClip`** avec le fix de centrage déjà appliqué au mode panning.
3. **Optimiser le Dutch Tilt** en une seule passe.
