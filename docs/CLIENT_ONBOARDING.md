# Livrer une instance — client autonome

Le document à envoyer au client est [CLIENT_CHECKLIST.md](CLIENT_CHECKLIST.md).
Celui-ci est le mien : ce que je fais, quand, et ce que j'attends de lui à
chaque moment.

Pour un client qui ne veut rien créer lui-même : [CLIENT_CLE_EN_MAIN.md](CLIENT_CLE_EN_MAIN.md).

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

## TEMPS 1 — Avant tout, je réclame quatre choses

J'envoie [CLIENT_CHECKLIST.md](CLIENT_CHECKLIST.md) et j'attends :

1. sa **clé de déploiement Convex** (production, permission `deployment:deploy`)
2. mon **invitation dans son équipe Convex** — c'est ce qui permet au script
   d'écrire ses variables ; il pourra me retirer ensuite
3. son **domaine vérifié dans Resend**, et sa clé API collée **par lui** dans sa
   base, sous le nom `RESEND_API_KEY`
4. le **sous-domaine**, l'**email administrateur** et l'**adresse d'envoi**

⚠️ **Je ne commence pas avant d'avoir les quatre.** Monter une instance à moitié
oblige à y revenir, et c'est là qu'une variable s'oublie.

---

## TEMPS 2 — Je monte l'instance *(20 minutes)*

### a. Le fichier du client

Copier `clients/exemple.json` en `clients/<client>.json` et le remplir.
Ajouter `"ownResend": true` : le script utilisera la clé Resend que le client a
posée, au lieu de la mienne.

| Champ | Valeur |
|---|---|
| `name` | le nom de son business |
| `convexUrl` | l'URL de sa base de **production** (`…convex.cloud`) |
| `domain` | `rdv.son-domaine.com` |
| `adminEmail` | son email administrateur |
| `fromEmail` | `Son Nom <rdv@son-domaine.com>` |
| `ownResend` | `true` |

### b. Le script

```bash
bun run onboard clients/<client>.json
```

Il génère ses clés d'authentification, pose ses variables (`SITE_URL`
comprise), vérifie la présence de sa clé Resend, puis affiche les valeurs
Vercel et l'adresse de retour Google.

### c. Le projet Vercel

Vercel → **Add New → Project** → importer le dépôt `mycall` → nom : celui du client.

Avant **Deploy**, coller dans **Environment Variables** les 7 valeurs affichées
par le script — `CONVEX_DEPLOY_KEY` étant la clé qu'il m'a transmise.

> **`NEXT_PUBLIC_CONVEX_URL` est indispensable au rendu serveur.** Sans elle, la
> page de réservation répond 404, sans message d'erreur.

### d. Google Cloud

*Credentials* → mon client OAuth → **Authorized redirect URIs** → ajouter
l'adresse affichée par le script.

### e. Le domaine

Vercel → projet → **Settings → Domains** → `rdv.son-domaine.com`.
Je lui transmets la cible CNAME affichée ; c'est lui qui la pose.

---

## TEMPS 3 — Je vérifie avant de livrer

```bash
bun run onboard clients/<client>.json --check
```

Rien n'est livré tant que les sept contrôles ne sont pas verts : variables,
page de connexion à sa marque, base joignable, bonne base déployée, retour
Google vers son domaine, adresse acceptée par Google.

> Dans le journal de build Vercel, `Deployed Convex functions to [REDACTED]`
> signale une clé de production. Une URL en clair : clé *Preview*, le build
> déploie dans une base éphémère et vide.

Puis je le préviens : il fait son étape 6 (compte, agenda, disponibilités,
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
| Le script dit « base inaccessible » | Invitation dans son équipe Convex pas encore acceptée |
| `record with that host already exists` | Domaine racine ajouté au lieu du sous-domaine |
| `Proxy Detected` dans Vercel | CNAME en *Proxied* → passer en **DNS only** |
| Lien copié en `*.vercel.app` | `NEXT_PUBLIC_APP_URL` absente ou pas redéployée |
| Mot de passe oublié sans effet | `SITE_URL` absente — relancer le script |
| Aucun email ne part | Domaine pas vérifié dans Resend, ou `RESEND_API_KEY` pas encore posée |
| Invitation d'agenda au nom d'un Gmail inconnu | Normal sans Google Workspace — nos emails prennent le relais |
| Paiements Stripe absents du CRM | Webhook créé en mode Test, clé passée en Live |
| Inscription refusée | Email absent de `SIGNUP_ALLOWED_EMAILS` → corriger le fichier, relancer |
