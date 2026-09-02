# Livrer une instance à un client

Un client = une instance : son domaine, sa base, ses leads. Rien n'est partagé
entre deux clients, et aucun client ne peut déployer — c'est le point.

---

## 1. Le modèle

```
        Dépôt GitHub privé (moi seul y pousse)
                    │
    ┌───────────────┼───────────────┬───────────────┐
  Mycall       Protocole        Client A        Client B
 projet Vercel  projet Vercel   projet Vercel   projet Vercel   ← chez moi
      │              │               │               │
   sa base        sa base        sa base         sa base        ← chez le client
```

| Composant | Qui possède | Pourquoi |
|---|---|---|
| Le code (GitHub) | **moi** | un client ne déploie pas ; les correctifs partent de chez moi |
| Le projet Vercel | **moi** | je garde la main sur la mise en ligne |
| La base Convex | **le client** | ses données lui appartiennent — et ses coûts aussi |
| Le domaine | le client | il pointe vers mon projet Vercel par un CNAME |

**Une seule poussée sur GitHub met à jour tous les clients.** Chaque projet
Vercel se reconstruit, envoie les fonctions à *sa* base, et se redéploie. Je n'ai
aucun dossier client sur ma machine.

### Ce que le client doit fournir

1. Un **compte Convex** (gratuit pour commencer) et une **clé de déploiement de
   production** générée depuis son tableau de bord.
2. Un **domaine** sur lequel poser un CNAME.
3. Ses clés **Resend** et **Stripe** s'il veut ses propres emails et paiements.

C'est tout. Il ne voit jamais le code.

---

## 2. Créer une instance client

### a. Sa base Convex

Le client, depuis son compte : **Convex → New Project**, puis
**Settings → Deploy keys → Generate production deploy key**. Il me transmet
cette clé — elle ne donne accès qu'à ce projet.

> ⚠️ Une clé de déploiement est un secret. Elle se transmet par un canal privé,
> jamais par email en clair, et jamais dans le dépôt.

### b. Le projet Vercel

Sur mon compte : **Add New → Project → importer le dépôt GitHub**.
Le même dépôt sert tous les clients ; ce sont les variables qui diffèrent.

**Build Command** (à surcharger dans les réglages du projet) :

```
bunx convex deploy --cmd 'bun run build'
```

C'est cette ligne qui envoie les fonctions Convex à la base du client avant de
compiler son site. Elle injecte aussi `NEXT_PUBLIC_CONVEX_URL` toute seule.

**Variables d'environnement du projet** (Production) :

| Variable | Valeur |
|---|---|
| `CONVEX_DEPLOY_KEY` | la clé fournie par le client |
| `NEXT_PUBLIC_APP_URL` | `https://rdv.son-domaine.com` |
| `NEXT_PUBLIC_BRAND_NAME` | le nom de son business |
| `GOOGLE_CLIENT_ID` | mon client OAuth (mutualisé) |
| `GOOGLE_OAUTH_STATE_SECRET` | même valeur que côté Convex |

> `NEXT_PUBLIC_CONVEX_URL` n'est pas à poser : `convex deploy` la fournit au
> build. La poser à la main, c'est risquer qu'elle contredise la vraie base.

### c. Les secrets côté Convex

Sur la base du client (via son tableau de bord, ou en CLI avec sa clé) :

| Variable | Rôle |
|---|---|
| `JWT_PRIVATE_KEY`, `JWKS` | authentification — **à générer, jamais à copier d'une autre instance** |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | connexion des agendas |
| `GOOGLE_OAUTH_STATE_SECRET` | même valeur que côté Vercel |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | envoi des emails |
| `SIGNUP_ALLOWED_EMAILS` | **l'email du client, et lui seul** — le premier inscrit devient admin |
| `APP_BASE_URL`, `SITE_URL` | `https://rdv.son-domaine.com` — les deux, obligatoires |
| `BRAND_NAME`, `BRAND_COLOR` | identité des emails |

### d. Google Cloud

Ajouter l'URL de retour de sa base dans *Credentials → Authorized redirect URIs* :

```
https://<sa-base>.convex.site/google/callback
```

Sans ça, la connexion d'agenda échoue — et l'erreur ne dit pas pourquoi.

### e. Le domaine

Vercel → projet → **Domains** → ajouter `rdv.son-domaine.com`.
Chez son registrar : **CNAME** `rdv` → la cible affichée par Vercel, en
**DNS only** (nuage gris chez Cloudflare).

### f. Première connexion

Le client s'inscrit sur `rdv.son-domaine.com/signup` avec l'adresse mise dans
`SIGNUP_ALLOWED_EMAILS`. Il devient admin. Il invite ensuite son équipe
lui-même depuis *Paramètres → Équipe*.

---

## 3. Mettre à jour tous les clients

```bash
git push
```

C'est tout. Chaque projet Vercel se reconstruit et redéploie sur sa propre base.

Pour ne livrer qu'à certains clients, désactiver le déploiement automatique sur
les projets concernés (Vercel → Settings → Git → Ignored Build Step) et les
redéployer à la main quand voulu.

---

## 4. Ce qu'il faut lui dire, et écrire

**Juridiquement**, si sa base est chez lui et le code chez moi, je suis
prestataire technique, pas hébergeur de ses données. Ça reste à formaliser :
un contrat de prestation qui dit qui héberge quoi, qui répond en cas de panne,
et ce qui se passe s'il part. Le nurturing envoie des emails commerciaux à ses
prospects — le consentement et le désabonnement le concernent, lui.

**S'il part**, il garde sa base Convex : ses données restent les siennes. Le
code, non. À écrire noir sur blanc avant de démarrer, pas après.

---

## 5. Pièges déjà rencontrés

| Symptôme | Cause |
|---|---|
| `record with that host already exists` | ajout du domaine racine au lieu du sous-domaine |
| `Proxy Detected` dans Vercel | CNAME en *Proxied* → passer en **DNS only** |
| Le lien copié porte `*.vercel.app` | `NEXT_PUBLIC_APP_URL` absente ou pas redéployée |
| Réinitialisation de mot de passe sans effet | `SITE_URL` absente côté Convex |
| Emails qui n'arrivent qu'au client | domaine pas encore vérifié dans Resend |
| Agenda Google qui décroche | app OAuth restée en mode "Testing" |
| Inscription refusée | email absent de `SIGNUP_ALLOWED_EMAILS` |
| Paiements Stripe absents du CRM | webhook créé en mode Test, clé passée en Live |
