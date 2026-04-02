# Rapport de Diagnostic - NanoBananaEngine

L'analyse du moteur d'orchestration `NanoBananaEngine` a révélé plusieurs points de friction techniques qui impactent la stabilité du rendu et l'expérience utilisateur.

## 1. Race Condition : Continuité Visuelle (DNA)
Le moteur utilise un `TaskQueue` pour paralléliser la génération des scènes.
- **Problème** : La variable `lastSceneImageBase64` (utilisée pour l'ancrage visuel entre scènes) est partagée entre toutes les tâches asynchrones. 
- **Impact** : Si plusieurs scènes sont générées en même temps (concurrence > 1), une scène peut commencer avec une image de référence périmée ou être écrasée par une scène finissant plus vite. Cela casse la continuité du "Character DNA".
- **Solution recommandée** : Passer l'image de référence explicitement ou forcer une exécution séquentielle pour les scènes dépendantes d'une continuité.

## 2. Jitter du Progress Bar
Le calcul de progression (lignes 1398-1414) dépend de l'ordre de fin des tâches.
- **Problème** : Si la scène 10 finit avant la scène 5 due à la parallélisation, le compteur `completedScenesCount` augmente et la barre de progression fait un bond en avant, pour ensuite sembler stagner.
- **Solution recommandée** : Utiliser un état de progression basé sur des indices fixes ou une map de complétion pour garantir une avance monotone.

## 3. Limite de la Génération Audio Globale
La migration vers ElevenLabs (un seul fichier audio par projet) est une excellente amélioration pour le flow narratif.
- **Risque** : Pour les vidéos très longues (ex: 15-20 min), envoyer le script complet en un seul bloc à l'API peut causer des Timeouts ou dépasser les limites de caractères par requête.
- **Solution recommandée** : Implémenter un système de "Segmentation par Chapitres" (groupes de 5-10 scènes) avec un stitching audio final transparent.

## 4. Gestion des Reprompts Manuels
La logique de reprompt (lignes 1303-1323) est fonctionnelle mais rigide.
- **Observation** : Lors d'un reprompt, on ignore les ancrages de "Location" pour permettre de sortir d'un mauvais style. C'est une bonne décision, mais elle pourrait être rendue optionnelle via l'UI pour plus de contrôle.

## 5. Mutation de l'État Partagé (`locationImageMap`)
Le dictionnaire des images de lieux est muté de manière asynchrone sans verrou.
- **Risque** : Deux scènes se déroulant au même nouvel endroit pourraient lancer deux requêtes de génération de décor identiques au lieu de réutiliser le premier fini.
- **Solution recommandée** : Utiliser des Promises dans la map (Memoization) pour que la deuxième scène attende le résultat de la première.

---

### Résumé des priorités
1. **Sécuriser la continuité visuelle** (Race Condition).
2. **Lisser la progression** pour éviter les sauts.
3. **Préparer la segmentation audio** pour les projets XL.
