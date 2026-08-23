# Mes instances — gérer plusieurs business sur Mycall

Document interne (Jonathan). Le runbook [CLIENT_ONBOARDING.md](CLIENT_ONBOARDING.md)
décrit les mêmes étapes techniques ; ici on répond aux questions propres à
**plusieurs business qui m'appartiennent** : comptes, domaines, emails, coûts.

---

## 1. Le principe

**1 business = 1 instance.** Une instance, c'est :

| Composant | Rôle | Séparé par business ? |
|---|---|---|
| Projet **Convex** | base de données (leads, RDV, users) | ✅ obligatoire — c'est ce qui isole les données |
| Projet **Vercel** | le site (dashboard + page de réservation) | ✅ un projet par business |
| **Domaine** | `rdv.mon-business.com` | ✅ un sous-domaine par business |
| Compte **Google Cloud** (OAuth) | connexion des agendas | ♻️ mutualisable (un seul suffit) |
| Compte **Resend** | envoi des emails | ♻️ mutualisable (voir §4) |
| Compte **Stripe** | encaissement | ⚠️ selon l'entité qui encaisse (voir §5) |

Les instances ne se parlent **jamais**. Aucun risque de mélanger les leads.

---

## 2. Comptes et connexion — les vraies réponses

**Un seul compte Vercel. Un seul compte Convex. Un seul compte Google.**
Ce sont des projets *à l'intérieur* de ces comptes, pas des comptes séparés.

**Même email admin partout.** `solutiondealmaker@gmail.com` peut être l'admin de
toutes mes instances : les bases sont distinctes, il n'y a aucun conflit. Inutile
de créer des adresses différentes.

**Connexions simultanées.** Chaque instance a son domaine, et les sessions sont
liées au domaine → je peux être connecté à `rdv.business-a.com` et
`rdv.business-b.com` en même temps, dans le même navigateur.
Seule limite : deux comptes différents sur la **même** instance → fenêtre privée.

**Rappel** : le **premier inscrit** d'une instance devient admin. Sur mes propres
instances, je m'inscris donc en premier.

---

## 3. Coûts réels (le point qui prêtait à confusion)

| Service | Situation | Coût |
|---|---|---|
| **Vercel** | plan **Hobby** actuellement → réservé à l'usage **personnel non commercial** (voir encadré) | Pro ≈ **20 $/mois au total** (par membre de l'équipe, **projets illimités**) — pas 20 $ par business |
| **Convex** | free tier **par projet** → chaque business a son propre quota | 0 € tant que les volumes restent modestes |
| **Resend** | 3 000 emails/mois offerts, partagés | 0 € au début |
| **Domaines** | un sous-domaine par business (`rdv.`) | 0 € si je possède déjà les domaines |

➡️ **Un seul abonnement Vercel Pro couvre tous mes business.** C'est le seul coût
fixe à prévoir.

### Ce que dit exactement Vercel sur le plan Hobby

Source : *Fair Use Guidelines* (vercel.com/docs/limits/fair-use-guidelines).

Le plan Hobby est réservé à l'usage **personnel non commercial**. Vercel définit
l'usage commercial comme tout déploiement servant au **gain financier de
quiconque participe au projet** — y compris le développeur payé pour coder.
Exemples cités : demander ou traiter un **paiement des visiteurs**, faire la
promotion d'un produit/service, **être payé pour héberger** le site, l'affiliation,
la publicité. Même les dons comptent.

**Conséquence pour mes instances :** dès qu'un lien de paiement Stripe est actif,
ou dès que je facture un client pour son instance, on est dans la définition —
*le critère est la finalité lucrative, pas le fait que l'accès soit "interne"*.

**Comment c'est détecté :** pas de scan automatique. En pratique : revue manuelle,
signalement, ou dépassement des seuils Hobby (100 Go de transfert, 1M
d'invocations/mois). Vercel indique chercher à contacter avant d'agir.

**Le risque réel n'est pas financier mais opérationnel** : une suspension coupe la
page de réservation → plus aucun prospect ne peut prendre RDV. Pour un outil
d'acquisition, c'est le vrai coût.

➡️ **Position retenue** : Hobby pendant la phase de test (aucun prospect réel).
Passage en **Pro dès que de vrais RDV/paiements transitent** — 20 $/mois pour
couvrir tous les business, vu comme une assurance de disponibilité.

### Et Cloudflare ?
Son offre gratuite autorise le commercial, donc la tentation est réelle. **Mais
pas maintenant** : Next.js 16 y tourne via l'adaptateur `@opennextjs/cloudflare`,
souvent en retard sur les versions de Next ; la route OAuth Google exige le
runtime Node ; et le rendu serveur de la page de réservation nous a déjà donné du
fil à retordre (jsdom, `output: standalone`). Migrer = tout re-tester pour
économiser ~20 $/mois. À réévaluer au-delà de 5-6 business.

---

## 4. Séparer les emails par business

L'adresse d'expédition est **déjà configurable par instance** : la variable
`RESEND_FROM_EMAIL` vit dans l'environnement Convex de chaque instance.

**Option A — un seul compte Resend (recommandé).**
Un compte Resend peut vérifier **plusieurs domaines**. Pour chaque business :
1. Resend → Domains → ajouter `business-b.com` → poser les DNS (SPF/DKIM).
2. Sur l'instance concernée :
   ```bash
   bunx convex env set RESEND_FROM_EMAIL "Business B <rdv@business-b.com>"
   ```
Les prospects reçoivent alors des emails à l'entête du bon business, sans mélange.

**Option B — un compte Resend par business.** Utile seulement si les entités sont
juridiquement séparées ou si je veux des statistiques d'envoi cloisonnées. Il faut
alors une `RESEND_API_KEY` différente par instance.

⚠️ Tant qu'un domaine n'est pas vérifié, l'instance reste en sandbox
(`onboarding@resend.dev`) et **les emails n'arrivent qu'à moi**.

---

## 5. Google et Stripe par business

**Google Calendar** — un seul client OAuth suffit pour toutes mes instances. Pour
chaque nouvelle instance, ajouter son URL dans *Authorized redirect URIs* :
```
https://<son-deployment>.convex.site/google/callback
```
Chaque business connecte ensuite l'agenda Google qu'il veut (le même ou un autre).

⚠️ Garder l'app OAuth **publiée** (pas en mode "Testing"), sinon les tokens
expirent au bout de 7 jours et la synchro d'agenda casse.

**Stripe** — se configure dans l'app (Paramètres → Intégrations), donc par
instance. Si tous mes business encaissent sur **le même compte Stripe**, je peux
réutiliser la même clé. S'ils encaissent sur des **entités différentes**, une clé
par instance. Dans tous les cas : déclarer le webhook avec l'URL propre à chaque
instance.

---

## 6. Créer une nouvelle instance — checklist

```bash
git clone <repo> business-b
cd business-b
bun install
bunx convex dev        # crée le projet Convex (base isolée) → Ctrl+C après "ready"
bun run onboard        # email admin + domaine → configure clés, Google, Resend, allowlist
bunx vercel link       # nouveau projet Vercel (nom en minuscules)
bunx vercel --prod
```

Puis, dans cet ordre :

1. **Google Cloud** → ajouter le redirect URI de cette instance (voir §5).
2. **Vercel → Domains** → ajouter `rdv.business-b.com`
   (jamais la racine du domaine : ça casserait le site et les emails existants).
3. **DNS** → `CNAME rdv → cname.vercel-dns.com`, en **DNS only** (nuage gris chez
   Cloudflare, sinon Vercel affiche "Proxy Detected" et le SSL casse).
4. **Les deux URL doivent concorder** :
   ```bash
   bunx convex env set APP_BASE_URL "https://rdv.business-b.com"
   ```
   et `NEXT_PUBLIC_APP_URL` = même valeur côté Vercel, **puis redéployer**
   (sinon les liens de réservation copiés portent l'URL technique `*.vercel.app`).
5. **M'inscrire en premier** sur `rdv.business-b.com/signup` → je suis admin.
6. **Resend** → vérifier le domaine de ce business et poser `RESEND_FROM_EMAIL` (§4).

---

## 7. Récap des pièges déjà rencontrés

| Symptôme | Cause |
|---|---|
| `record with that host already exists` | j'ajoute la racine au lieu d'un sous-domaine |
| `Proxy Detected` dans Vercel | CNAME en *Proxied* → passer en **DNS only** |
| Le lien copié porte `*.vercel.app` | `NEXT_PUBLIC_APP_URL` absente ou pas redéployée |
| La page de réservation renvoie vers `vercel.com/sso` | Deployment Protection activée sur le projet |
| Emails qui n'arrivent qu'à moi | domaine pas encore vérifié dans Resend |
| Agenda Google qui décroche après 7 jours | app OAuth restée en mode "Testing" |
| Inscription refusée | email absent de `SIGNUP_ALLOWED_EMAILS` |
