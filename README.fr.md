<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <img src="docs/assets/logo-light.png" alt="GoLive" width="260">
  </picture>
</p>

<p align="center">
  <strong>Le feu vert open source avant toute mise en production.</strong><br>
  Décrivez votre projet. GoLive vérifie tout et délivre un feu vert vérifiable, ou la liste exacte de ce qui bloque.
</p>

<p align="center"><a href="README.md">English version</a></p>

---

Chaque jour, des sites, applications et API partent en production sans pages légales, sans sécurité de base, sans sauvegarde, sans supervision ni conformité aux lois sur les données. Les référentiels existent (OWASP, RGPD, WCAG, lois nationales) mais ils sont éparpillés, longs et rarement adaptés au projet réel.

GoLive les transforme en **règles versionnées et déterministes**, confrontées à ce que vous **déclarez** (votre architecture), ce que vous **codez** et ce qui est **en ligne**. Un seul verdict : **Go**, **Go conditionnel** ou **No-Go**.

## L'édition Community

- **Studio** : dessinez votre architecture (composants, technologies, flux, pays d'hébergement). Les problèmes s'affichent sur le schéma pendant que vous dessinez.
- **GoLive Spec** : tout est enregistré dans un `golive.yaml` versionné avec votre code, synchronisé dans les deux sens avec le Studio.
- **Moteur déterministe** : même `golive.yaml`, mêmes versions de packs, même état du site, même verdict, avec une empreinte reproductible. Aucune IA ne décide.
- **Packs de conformité** : Socle, Sécurité web (OWASP), Exploitation, Accessibilité (WCAG 2.2), Paiement, Sénégal (CDP), Union européenne et France (RGPD). Chaque règle cite sa source.
- **Audit du site en ligne** : contrôles passifs d'une URL (TLS, en-têtes, cookies, traceurs avant consentement, pages légales, indexation, accessibilité de base), protégé contre le SSRF.
- **Preuves et dérogations** : ce qu'un robot ne peut pas vérifier (test de restauration, déclaration CDP, contrats de sous-traitance…) est attesté par une personne nommée. Une dérogation signée transforme un bloquant en Go conditionnel jusqu'à son échéance.
- **Kanban de remédiation** : une tâche par écart, sans doublon, fermée automatiquement quand l'audit constate la correction, rouverte en cas de régression.
- **Rapport** Go / No-Go imprimable (PDF) et export JSON.
- **CLI** `golive check` pour la CI, qui sort en erreur sur un No-Go.

## Démarrer

```bash
docker compose up --build
# puis http://localhost:3000
```

Depuis les sources (Node.js 22+, pnpm 11+) :

```bash
pnpm install
pnpm dev
```

En ligne de commande :

```bash
pnpm --filter @golive/cli build
node apps/cli/dist/golive.js init --template public-service
node apps/cli/dist/golive.js check --url https://preprod.exemple.sn --env preprod
```

## Avertissement

Le rapport GoLive atteste d'un contrôle à une date donnée. Il ne constitue ni une garantie de sécurité ni un avis juridique. Les packs légaux (Sénégal, UE) sont communautaires et en attente de revue par des juristes partenaires : leurs exigences sont à valider par un juriste.

## Licences

Serveur, application web, moteur et sonde : AGPL-3.0. Format GoLive Spec, SDK de règles, packs communautaires et CLI : Apache-2.0. Voir [README.md](README.md#license).
