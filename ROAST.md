# 🔥 ROAST — Sketch Pilot : Autopsie d'un Système

> Ce document est un audit agressif et honnête de la logique globale, des choix techniques et du positionnement marketing de Sketch Pilot. L'objectif n'est pas de détruire, mais de brûler ce qui mérite de l'être pour que ce qui reste soit solide. Toutes les critiques sont actionnables.

---

## 1. 🤦 Le Projet ne Sait pas Qui il Est

Le README s'appelle **"Meko Academy Backend"**. Le domaine du projet dit **"Sketch Pilot"**. Le dossier git se nomme **`sketch-pilot-api`**. La base de données dans les exemples s'appelle **`meko_academy`**. L'email admin par défaut est **`admin@sketch-pilot.com`**.

On a quatre noms différents pour le même produit. C'est le niveau zéro du branding. Avant même d'aller chercher des clients, le produit n'est pas capable de se présenter de façon cohérente à ses propres développeurs.

**À corriger** : Uniformiser le nom partout (README, package.json `name`, variables d'env, emails, commentaires de code, docker-compose, noms de base de données).

---

## 2. 💸 Le Système de Crédits est une Bombe à Retardement

### 2a. Les crédits sont débités mais jamais remboursés en cas d'échec

La génération de vidéo (`GenerateVideoUseCase`) déduit les crédits **avant** l'exécution réelle du job. Si le job plante en cours de route — et il va planter, ffmpeg le fera un jour — l'utilisateur a perdu ses crédits pour rien. Aucun mécanisme de remboursement automatique n'existe.

**À corriger** : Implémenter un remboursement de crédits dans le handler d'échec du worker BullMQ.

### 2b. La grille tarifaire est incohérente

```
pack_100 credits → 3 USD  →  0.03 $/crédit
pack_300 credits → 7 USD  →  0.023 $/crédit
pack_600 credits → 12 USD →  0.02 $/crédit
```

Une génération de script coûte **10 crédits**, soit **0.30 $** au tarif de base. Une exportation 1080p coûte **10 crédits** supplémentaires. Une vidéo complète peut donc coûter entre **0.50 $ et 1.50 $** à l'utilisateur. C'est une fourchette trop large que rien dans l'UI ne va rendre lisible.

En plus, `PLAN_MONTHLY_LIMITS` défini dans le code dit que le plan **creator donne 500 crédits/mois**, mais le plan **starter en donne 1 000**. Le plan supérieur a un plafond **inférieur** au plan de base. C'est soit une erreur, soit le meilleur moyen de rendre furieux les clients qui upgradent.

**À corriger** : Revoir la grille, expliquer le coût total d'une vidéo à l'avance, inverser les limites Creator/Starter, et refactoriser ces valeurs dans une configuration centralisée — pas hardcodées dans le code.

### 2c. Les crédits de bienvenue (`WELCOME_CREDITS = 100`) ne couvrent presque rien

Avec 100 crédits de bienvenue, un nouvel utilisateur peut faire exactement **1 vidéo simple** (script + images + TTS + export ≈ 50-90 crédits). Si cette vidéo rate à cause d'un bug — ce qui arrive — l'utilisateur a zéro crédit et une mauvaise première impression. Génial pour la rétention.

**À corriger** : Augmenter les crédits de bienvenue, ou afficher clairement le coût estimé avant chaque génération.

---

## 3. 🏗️ L'Architecture Hexagonale est Utilisée comme Décoration

L'architecture hexagonale est là, avec ses dossiers bien rangés. Sauf que :

- Les `VideoRepository` et autres sont instanciés **directement dans les contrôleurs** avec `new VideoRepository()`. Il n'y a pas de conteneur d'injection de dépendances. Chaque contrôleur crée ses propres instances — ce qui rend les tests unitaires réels impossibles sans mocks manuels laborieux.
- Les `as any` pullulent : **26+ occurrences** dans le code. À chaque `as any`, TypeScript abdique. Strict mode activé dans `tsconfig.json`, violation partout dans le code. On affiche le panneau "TypeScript strict" à l'entrée et on jette la règle à la poubelle dès qu'on arrive au bureau.
- Les transactions de base de données n'existent pas sur les opérations critiques. Créer une vidéo + déduire des crédits n'est pas atomique. Si le serveur tombe entre les deux opérations, l'utilisateur a une vidéo sans crédits déduits ou des crédits déduits sans vidéo.

**À corriger** :
- Utiliser un service locator ou un micro-container DI (même manuel avec des factories).
- Supprimer tous les `as any` et les remplacer par des génériques ou des assertions typées.
- Wrapper les opérations multi-étapes dans des transactions Drizzle.

---

## 4. 🔧 La Pipeline de Génération Vidéo est un Château de Cartes

Le flux de génération est découpé en 14+ use cases chaînés. C'est bien en théorie. En pratique :

- **Pas de gestion de retry granulaire** : si l'étape 8 sur 14 plante, le job entier est marqué "failed". L'utilisateur doit recommencer depuis le début et payer encore. Il n'y a pas de reprise partielle fiable depuis le bon checkpoint.
- **Un seul worker** traite toute la queue. Une seule instance `video.worker.ts` gère tout. Scalabilité horizontale : inexistante par design.
- **FFmpeg est synchrone et bloquant** dans le process Node/Bun. Une vidéo en cours de rendu bloque le worker entier. Si la queue a 10 vidéos en attente, elles attendent toutes que FFmpeg ait fini.
- Le système de checkpoint a **deux implémentations** (`video-checkpoint.service.ts` et `simple-checkpoint.service.ts`) sans documentation sur lequel utiliser et dans quel contexte. C'est une dette technique qui attend d'exploser.

**À corriger** :
- Implémenter une reprise depuis le dernier checkpoint validé.
- Lancer FFmpeg dans un process enfant pour ne pas bloquer le worker.
- Supprimer ou documenter clairement l'un des deux services de checkpoint.

---

## 5. 📡 Les SSE (Server-Sent Events) Fuient en Mémoire

`sseStreamsByJobId` est une `Map` globale dans le contrôleur vidéo. Les entrées sont supprimées manuellement quand un job se termine avec succès. Mais si un job échoue, est annulé, ou si le serveur redémarre pendant le traitement, la `Map` garde l'entrée **indéfiniment**. En production, après quelques semaines, cette map grossit jusqu'à saturation mémoire.

**À corriger** : Ajouter un TTL sur les entrées SSE, ou nettoyer dans tous les cas de fin de job (succès, échec, annulation, timeout).

---

## 6. 🔐 Sécurité : Le Minimum Vital et Pas Plus

- **Le mot de passe admin est envoyé en clair par email** lors de la création d'un compte admin via l'API. Si votre serveur mail est logué quelque part (et il l'est), le mot de passe admin est dans les logs. Anti-pattern de sécurité classique.
- **Pas de rate limiting** sur les endpoints de génération. N'importe qui avec un compte peut spammer `POST /videos/generate` et exploser la queue ou les coûts API Gemini/ElevenLabs/OpenAI.
- **Pas de validation de l'environnement au démarrage**. Si `STRIPE_SECRET_KEY` est absent, le serveur démarre quand même et crashe en pleine transaction Stripe. Utiliser Zod pour valider l'env au boot est une évidence qui n'a pas été appliquée.
- **Pas d'idempotency keys** sur la génération de vidéo. Un double-clic, un timeout réseau avec retry automatique = deux vidéos générées, deux fois les crédits débités.

**À corriger** :
- Remplacer l'envoi du mot de passe par un lien d'invitation à durée limitée.
- Ajouter un rate limiter middleware sur les endpoints coûteux.
- Valider les variables d'environnement au démarrage avec Zod ou une librairie dédiée.
- Introduire un `idempotency-key` header sur les endpoints de création.

---

## 7. 📋 Les Tests : Un Mensonge Confortable

Le README proclame fièrement : **"Coverage cible : 100%"**. La configuration Vitest le confirme avec des seuils à 100% pour branches, functions, lines, statements.

Mais la coverage est **désactivée** (`enabled: false`) dans `vitest.config.ts`. Et il n'y a pas de tests identifiables dans les dossiers sources. La cible de 100% est donc atteinte par défaut : quand vous ne mesurez rien, vous n'échouez jamais.

Afficher "Tests unitaires Vitest" en feature du projet sans avoir écrit un seul test, c'est du greenwashing de qualité logicielle.

**À corriger** :
- Activer la coverage (`enabled: true`).
- Écrire au moins les tests des use cases critiques (génération de vidéo, déduction de crédits, Stripe webhooks).
- Supprimer la mention "100% coverage" du README jusqu'à ce qu'elle soit vraie.

---

## 8. 📝 La Gestion des Logs est Préhistorique

23+ `console.log` et `console.error` disséminés dans le code. Aucune structure, aucun niveau, aucun corrélation ID pour tracer une requête de bout en bout. En production, le fichier de log est un flux de chaînes de caractères dans lequel il est impossible de retrouver ce qui a causé l'échec de la vidéo de tel utilisateur à telle heure.

**À corriger** : Remplacer tous les `console.*` par un logger structuré (pino, winston) avec niveaux, corrélation IDs, et un format JSON pour l'ingestion par des outils de monitoring.

---

## 9. 🗃️ La Base de Données Sans Index Stratégiques

Les schémas Drizzle définissent les tables, mais sans indexes sur les colonnes massivement interrogées : `video.userId`, `video.status`, `creditTransactions.userId`, `video.jobId`. En développement avec 50 enregistrements, tout va bien. En production avec 100 000 vidéos, chaque requête de liste devient un full table scan.

**À corriger** : Ajouter des indexes sur toutes les colonnes utilisées dans les clauses `WHERE`, `ORDER BY`, et les jointures fréquentes.

---

## 10. 🎬 Les Modèles de Personnages : Une Fausse Fonctionnalité

Les `character-models` sont chargés depuis la base de données en base64 **à chaque requête**. Il n'y a pas de cache. Si le modèle fait 2 Mo, chaque requête qui utilise un personnage charge 2 Mo depuis la BDD, les passe en base64, les envoie à l'API d'image. À 100 utilisateurs simultanés, c'est 200 Mo de données inutilement répétées par cycle.

De plus, l'upload de fichiers de personnages ne valide **ni le type MIME réel du fichier** (uniquement la déclaration du client), ni la taille maximale. Un utilisateur malveillant peut uploader un fichier de 500 Mo ou un exécutable renommé en `.png`.

**À corriger** :
- Mettre en cache les modèles en mémoire ou via Redis avec TTL.
- Valider le contenu réel du fichier (magic bytes) à l'upload, pas seulement son nom.
- Stocker uniquement l'URL S3/MinIO, pas le contenu en BDD.

---

## 11. 💬 Les Erreurs : Deux Formats pour le Prix d'Un

Certains endpoints retournent `{ success: false, error: "..." }`. D'autres retournent `{ success: false, message: "..." }`. Le frontend doit donc tester `error || message` partout. C'est le genre d'incohérence qui génère des bugs silencieux dans les clients API et qui rend les intégrations tierces un cauchemar.

**À corriger** : Standardiser un unique format d'erreur et s'y tenir via un middleware d'erreur centralisé.

---

## 12. 📣 Le Marketing : Invisible

### Positionnement flou

Sketch Pilot génère des vidéos animées style sketch. C'est une niche crédible. Mais nulle part dans le code on ne voit de contenu marketing clair : pas de tagline, pas de use cases types exposés dans l'API publique, pas de page de landing supportée par l'API.

Les plans s'appellent **free**, **starter**, et **creator**. Ces noms sont génériques à l'extrême. Ils ne communiquent rien sur la valeur différenciante de chaque niveau. "Creator" fait 500 crédits/mois contre 1 000 pour "Starter" — c'est l'inverse de ce qu'un utilisateur imaginerait.

### Tracking UTM présent mais sans exploiter les données

Le modèle `User` capture `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`. Ces champs sont en base, mais aucun endpoint admin ne permet de les agréger, analyser, ou exporter. On collecte des données marketing sans jamais les exploiter. C'est du travail de collecte gaspillé.

### Pas de mécanisme de rétention

Il n'y a pas de logique d'email de rétention, de notification de rappel, de "votre vidéo est prête — partagez-la", de lien de partage public pour une vidéo générée. Un utilisateur génère une vidéo, la télécharge, et disparaît. Aucun hook pour le faire revenir ou le transformer en ambassadeur.

### Les "Suggest Topics" existent mais sont invisibles marketing

`SuggestTopicsUseCase` permet de suggérer des sujets de vidéo à l'IA — c'est exactement le type de fonctionnalité qui devrait être mis en avant comme un argument de vente ("L'IA vous aide à trouver votre prochain sujet de contenu"). Elle coûte 5 crédits et est enfouie dans l'API sans documentation utilisateur visible.

**À corriger** :
- Renommer les plans avec des noms qui reflètent leur valeur (ex : Basic, Pro, Studio).
- Créer un endpoint analytics admin pour agréger les données UTM.
- Ajouter un email transactionnel "vidéo prête" avec lien de partage public.
- Mettre en avant la suggestion de topics dans la communication produit.

---

## 13. 🧹 Le Code Mort et les Fichiers Fantômes

À la racine du projet :
- `fix-ass.js` — un script de correction de format de sous-titres ASS laissé à la racine. Ni documenté, ni dans les scripts package.json, ni supprimé.
- `test-prompts.ts` — un fichier de test manuel laissé à la racine. Pas dans le dossier de tests, pas dans .gitignore.
- `data/` — dossier à la racine dont le contenu n'est pas documenté.
- `plugins/` — dossier plugin dont la relation avec l'application principale n'est pas expliquée.

Ces fichiers ne devraient pas être dans un dépôt de production. Ils brouillent la structure pour les nouveaux développeurs et trahissent un manque de rigueur sur ce qui est commité.

**À corriger** : Déplacer les scripts utiles dans `scripts/`, les tests dans `src/`, et ajouter `.gitignore` pour les artefacts temporaires.

---

## Récapitulatif des Priorités

| # | Problème | Sévérité | Effort |
|---|----------|----------|--------|
| 1 | Incohérence du nom du produit | 🔴 Critique | Faible |
| 2a | Pas de remboursement de crédits sur échec | 🔴 Critique | Moyen |
| 2b | Limites Creator < Starter | 🔴 Critique | Faible |
| 3 | `as any` partout / pas de DI réelle | 🟠 Élevé | Élevé |
| 4 | Pas de transactions DB sur opérations critiques | 🔴 Critique | Moyen |
| 5 | Fuite mémoire SSE | 🟠 Élevé | Faible |
| 6a | Mot de passe admin envoyé en clair | 🔴 Critique | Faible |
| 6b | Pas de rate limiting | 🟠 Élevé | Faible |
| 7 | Tests inexistants malgré la promesse de 100% | 🟠 Élevé | Élevé |
| 8 | Logs non structurés | 🟡 Moyen | Moyen |
| 9 | Pas d'indexes DB | 🟠 Élevé | Faible |
| 10 | Character models chargés sans cache | 🟡 Moyen | Faible |
| 11 | Deux formats d'erreurs API | 🟡 Moyen | Faible |
| 12a | Noms de plans incohérents | 🟡 Moyen | Faible |
| 12b | Données UTM collectées mais jamais exploitées | 🟡 Moyen | Moyen |
| 13 | Fichiers morts à la racine | 🟢 Faible | Faible |

---

*Ce document a été généré suite à une analyse du code source de Sketch Pilot. Toutes les critiques visent à améliorer le produit, pas à le dénigrer. Prenez chaque point comme un ticket à ouvrir.*
