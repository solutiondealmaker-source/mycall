# Livrer une instance — mon déroulé

Le document à envoyer au client est [CLIENT_CHECKLIST.md](CLIENT_CHECKLIST.md).
Celui-ci est le mien : ce que je fais, quand, et ce que j'attends de lui à
chaque moment.

Durée réelle de mon côté : **30 minutes**, réparties en trois temps.

---

## Le modèle en une image

```
        Dépôt GitHub privé (moi seul y pousse)
                    │
    ┌───────────────┼───────────────┬───────────────┐
  Mycall       Protocole        Client A        Client B
 projet Vercel  projet Vercel   projet Vercel   projet Vercel   ← mes comptes
      │              │               │               │
   sa base        sa base        sa base         sa base        ← comptes clients
```

| Composant | Qui possède |
|---|---|
| Le code, les projets Vercel | **moi** — un client ne déploie rien |
| La base Convex, le domaine, les clés Resend et Stripe | **le client** |

`git push` met tout le monde à jour. Aucun dossier client sur ma machine.

---

## TEMPS 1 — Avant tout, je réclame trois choses

J'envoie [CLIENT_CHECKLIST.md](CLIENT_CHECKLIST.md) et j'attends :

1. sa **clé de déploiement Convex** (production, permission `deployment:deploy`)
2. sa **clé API Resend** + l'adresse d'expédition, domaine vérifié
3. le **sous-domaine** et l'**email administrateur** qu'il a choisis

⚠️ **Je ne commence pas avant d'avoir les trois.** Monter un projet à moitié
oblige à y revenir, et c'est là qu'on oublie une variable.

---

## TEMPS 2 — Je monte l'instance *(20 minutes)*

### a. Le projet Vercel

Vercel → **Add New → Project** → importer le dépôt `mycall`.
Nom du projet : celui du client.

> Le même dépôt sert tous les clients. Ce sont les variables qui distinguent.

La commande de build vient de `vercel.json`, il n'y a rien à saisir.

### b. Les variables du projet Vercel *(environnement Production)*

| Variable | Valeur |
|---|---|
| `CONVEX_DEPLOY_KEY` | la clé du client |
| `NEXT_PUBLIC_CONVEX_URL` | l'URL de sa base — visible après le premier build |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | la même en `.convex.site` |
| `NEXT_PUBLIC_APP_URL` | `https://rdv.son-domaine.com` |
| `NEXT_PUBLIC_BRAND_NAME` | le nom de son business |
| `GOOGLE_CLIENT_ID` | mon client OAuth mutualisé |
| `GOOGLE_OAUTH_STATE_SECRET` | même valeur que côté Convex |

> **`NEXT_PUBLIC_CONVEX_URL` est indispensable au rendu serveur.** La commande
> de build la fournit à la compilation, mais les pages qui interrogent la base
> côté serveur — la page de réservation en tête — la relisent à l'exécution.
> Sans elle : page de réservation en 404, sans message d'erreur.

### c. Les secrets côté Convex

Sur sa base, via son tableau de bord ou en CLI avec sa clé :

| Variable | Note |
|---|---|
| `JWT_PRIVATE_KEY`, `JWKS` | **à générer pour lui** — jamais recopier d'une autre instance |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | mon client OAuth |
| `GOOGLE_OAUTH_STATE_SECRET` | identique à Vercel |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | ses clés à lui |
| `SIGNUP_ALLOWED_EMAILS` | **son email, et lui seul** |
| `APP_BASE_URL` **et** `SITE_URL` | les deux, même valeur — `SITE_URL` conditionne la réinitialisation de mot de passe |
| `BRAND_NAME`, `BRAND_COLOR` | identité des emails |
| `BRAND_TAGLINE` | seulement s'il en veut un |

### d. Google Cloud

*Credentials* → mon client OAuth → **Authorized redirect URIs** → ajouter :

```
https://<sa-base>.convex.site/google/callback
```

Oublier cette ligne donne une erreur de connexion d'agenda qui ne dit pas d'où
elle vient.

### e. Le domaine

Vercel → projet → **Domains** → `rdv.son-domaine.com`.
Je lui transmets la cible CNAME affichée ; c'est lui qui la pose.

---

## TEMPS 3 — Je vérifie avant de livrer

Rien n'est livré tant que ces cinq points ne sont pas verts.

| Contrôle | Attendu |
|---|---|
| `rdv.son-domaine.com/login` | 200, à **sa** marque |
| `/api/health` | `"convex":"ok"` |
| Journal de build Vercel | `Deployed Convex functions to [REDACTED]` |
| `<sa-base>.convex.site/webhooks/stripe` en POST vide | 400 |
| `<sa-base>.convex.site/google/callback` sans paramètre | 302 vers **son** domaine |

> **`[REDACTED]` dans le journal est le signal d'une clé de production.** Une
> URL en clair signifie une clé *Preview* : le build déploie alors dans une base
> éphémère et vide, et les pages répondent 404 sans que rien n'indique pourquoi.
> C'est arrivé, ça coûte une heure.

Puis je le préviens : il fait ses étapes 6 (compte, agenda, disponibilités,
premier événement).

---

## Mettre à jour tous les clients

```bash
git push
```

Chaque projet Vercel se reconstruit et redéploie sur sa propre base.

Pour exclure un client d'une livraison : Vercel → son projet → *Settings → Git*
→ **Ignored Build Step**.

---

## Le cadre à poser par écrit

Sa base est chez lui, le code chez moi : je suis prestataire technique, pas
hébergeur de ses données. À formaliser **avant** de démarrer :

- qui héberge quoi, qui répond en cas de panne, et sous quel délai
- ce qui se passe s'il part : il garde sa base, pas le code
- le nurturing envoie des emails commerciaux à ses prospects — le consentement
  et le désabonnement relèvent de lui

---

## Pièges déjà rencontrés

| Symptôme | Cause |
|---|---|
| Page de réservation en 404, tout le reste marche | `NEXT_PUBLIC_CONVEX_URL` absente, ou clé Preview au lieu de Production |
| `record with that host already exists` | domaine racine ajouté au lieu du sous-domaine |
| `Proxy Detected` dans Vercel | CNAME en *Proxied* → passer en **DNS only** |
| Lien copié en `*.vercel.app` | `NEXT_PUBLIC_APP_URL` absente ou pas redéployée |
| Mot de passe oublié sans effet | `SITE_URL` absente côté Convex |
| Emails qui n'arrivent qu'au client | domaine pas vérifié dans Resend |
| Invitation d'agenda au nom d'un Gmail inconnu | normal sans Google Workspace — nos emails prennent le relais |
| Paiements Stripe absents du CRM | webhook créé en mode Test, clé passée en Live |
| Inscription refusée | email absent de `SIGNUP_ALLOWED_EMAILS` |
