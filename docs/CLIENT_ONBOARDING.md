# Onboarding d'un client — runbook

Modèle : **une instance isolée par client** (son Convex + son Vercel + son domaine).
Chaque client est **admin de son espace**, ses données sont **100 % cloisonnées** des autres.

Durée : ~15–20 min par client une fois les prérequis (Google, Resend) faits une seule fois.

---

## Prérequis (une seule fois, partagés entre tous les clients)

1. **Resend — domaine vérifié.** En sandbox (`onboarding@resend.dev`), les emails
   n'arrivent qu'à ton compte. Vérifie un domaine dans Resend → Domains (SPF/DKIM)
   pour que confirmations + reset password arrivent à **n'importe quel** client.
2. **Google Cloud — client OAuth.** Réutilise le même client OAuth pour tous, OU
   un par client. Dans les deux cas : **il faudra ajouter l'URL `convex.site` de
   CHAQUE nouvelle instance** dans les *Authorized redirect URIs* (voir étape 4).

---

## Étapes par client

### 1. Nouveau dossier + install
```bash
git clone <repo> client-<nom>
cd client-<nom>
bun install
```

### 2. Wizard de setup
```bash
bun run setup
```
Le wizard :
- provisionne un **nouveau déploiement Convex** (base isolée) ;
- génère les **clés Auth** (JWT/JWKS) ;
- configure **Google OAuth** + **Resend** ;
- demande l'**email admin du client** → le met dans `SIGNUP_ALLOWED_EMAILS`
  (⇒ ce client, et lui seul, pourra s'inscrire et sera **admin**) ;
- écrit `.env.local`.

Note l'URL Convex affichée : `https://<nouveau>.convex.cloud` et sa jumelle
`.convex.site`.

### 3. (Recommandé) Confirmer l'allowlist
```bash
bunx convex env set SIGNUP_ALLOWED_EMAILS "owner-client@domaine.com"
```
Plusieurs emails = séparés par des virgules.

### 4. Google — enregistrer le redirect URI de CETTE instance ⚠️
Chaque Convex a une URL `convex.site` différente. Dans **Google Cloud Console →
Credentials → ton client OAuth → Authorized redirect URIs**, ajoute :
```
https://<nouveau>.convex.site/google/callback
```
Sans ça, la connexion Google Calendar échoue pour ce client.

### 5. Déployer le frontend sur Vercel
```bash
bunx vercel link      # nouveau projet, nom en minuscules
bunx vercel --prod
```
Puis pose les variables d'env du projet Vercel (dashboard → Settings → Env
Variables, ou CLI) — **valeurs prises dans le `.env.local` généré** :

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` |
| `NEXT_PUBLIC_APP_URL` | domaine du client (étape 6) — sinon les liens `/book`<br>copiés portent l'URL technique `*.vercel.app` |
| `GOOGLE_CLIENT_ID` | `.env.local` |
| `GOOGLE_OAUTH_STATE_SECRET` | `.env.local` |

Performance : garde la **région Vercel en Europe** (`vercel.json` → `fra1`, déjà
dans le repo) pour coller au Convex EU.

⚠️ **Deployment Protection** : si le projet Vercel a la protection SSO activée,
l'URL renvoie une redirection vers `vercel.com/sso-api` et **les prospects ne
peuvent pas accéder à la page de réservation**. À désactiver
(Settings → Deployment Protection) pour l'URL publique du client.

### 6. Brancher le domaine du client ⚠️ (les 3 pièges)

**a) Toujours un SOUS-domaine, jamais la racine.** Si le client a déjà un site
sur `client.com`, ajouter la racine dans Vercel entre en conflit avec les
enregistrements existants (erreur *"An A, AAAA, or CNAME record with that host
already exists"*) et casserait son site + ses emails. Utiliser
`rdv.client.com` (ou `app.` / `book.`).

1. **Vercel → projet → Settings → Domains → Add** → `rdv.client.com`
   Vercel affiche alors la cible CNAME à créer (elle porte le nom du
   sous-domaine, pas `@`).
2. **Chez le registrar / Cloudflare → Add record** :
   - Type : **CNAME**
   - Name : **`rdv`** (le sous-domaine seul)
   - Target : la valeur exacte donnée par Vercel (`cname.vercel-dns.com` ou
     équivalent)
   - **b) Proxy status : `DNS only`** (nuage **gris**). En *Proxied* (orange),
     Vercel affiche *"Proxy Detected"* et la gestion SSL/bot casse.
3. Attendre le passage en **Valid Configuration** (SSL automatique, 1–5 min).

**c) Cohérence des URL** — une fois le domaine actif, poser les deux :
```bash
bunx convex env set APP_BASE_URL "https://rdv.client.com"   # liens des emails + retour OAuth
```
et `NEXT_PUBLIC_APP_URL` = la même valeur côté Vercel (étape 5), puis
**redéployer** (`bunx vercel --prod`) pour que la variable soit prise en compte.

Le client doit ensuite **naviguer sur ce domaine** (pas sur l'URL `*.vercel.app`),
sinon la session se perd après l'OAuth Google et les liens copiés portent le
mauvais domaine.

### 7. Le client s'inscrit
Il va sur son URL → `/signup` avec son email (celui de l'allowlist) → **il est
admin** de son instance. Il ajoute ses closers via Settings → Team (chacun devra
être ajouté à `SIGNUP_ALLOWED_EMAILS` pour pouvoir s'inscrire).

---

## Récap des points qui coincent souvent
- **Le lien copié porte `*.vercel.app`** → `NEXT_PUBLIC_APP_URL` absente ou pas
  redéployée après l'avoir posée (étape 5/6).
- **"record with that host already exists"** → tu ajoutes la racine du domaine au
  lieu d'un sous-domaine (étape 6a).
- **"Proxy Detected" dans Vercel** → le CNAME est en *Proxied* chez Cloudflare,
  le passer en **DNS only** (étape 6b).
- **La page de réservation renvoie vers `vercel.com/sso`** → Deployment
  Protection activée sur le projet (étape 5).
- **Emails qui n'arrivent pas** → Resend encore en sandbox (étape prérequis 1).
- **Google Calendar qui échoue** → redirect URI de l'instance pas ajouté (étape 4).
- **Déconnecté après OAuth** → `APP_BASE_URL` ≠ l'URL réellement visitée (étape 6).
- **Lent** → région Vercel hors Europe (garder `fra1`).
- **Inscription impossible** → email pas dans `SIGNUP_ALLOWED_EMAILS`.
