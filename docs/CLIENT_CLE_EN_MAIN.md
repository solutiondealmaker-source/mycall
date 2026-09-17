# Brancher un client clé en main — sans Stripe

Le client ne crée **aucun compte technique** : tout vit sur mes comptes
(Convex, Resend, Vercel, Google Cloud). Il me donne quelques informations, fait
poser deux ou trois lignes DNS, et passe 15 minutes en visio avec moi.

Durée de mon côté : **45 minutes**, plus l'attente DNS (de 10 minutes à
quelques heures).

Pour un client qui crée lui-même ses comptes : [CLIENT_ONBOARDING.md](CLIENT_ONBOARDING.md).

---

## Avant d'accepter : ce que ce modèle change

| Sujet | Conséquence | Ce que je fais |
|---|---|---|
| Sa base est dans **mon** équipe Convex | J'héberge ses prospects : je suis sous-traitant de ses données au sens du RGPD | Le contrat le dit, avec ce qui se passe s'il part (export complet de sa base) |
| Quotas Convex comptés par équipe | Tous mes clients consomment la même enveloppe | Je surveille l'onglet *Usage* ; au premier dépassement, plan payant |
| Emails envoyés par **mon** compte Resend | Quota d'envoi partagé ; un client qui envoie mal abîme la réputation du compte pour tous | Je vérifie que mon plan Resend accepte un domaine de plus |
| Vercel en plan Hobby | L'usage commercial y est interdit | Passer en Pro avant de facturer |
| Client Google mutualisé, non vérifié | Écran « Google n'a pas validé cette application » à la connexion d'agenda ; 100 utilisateurs au total, tous clients confondus | Je le préviens ; vérification Google à lancer avant d'approcher la limite |

**Stripe : rien à faire.** S'il en veut un jour, il le branche lui-même dans
*Paramètres → Intégrations* ; sa clé ne passe jamais par moi.

---

## 1. Le message à lui envoyer

> Bonjour [Prénom],
>
> Pour mettre en ligne votre outil de prise de rendez-vous, j'ai besoin de :
>
> 1. Le nom de votre activité, tel qu'il doit apparaître à vos prospects.
> 2. L'adresse email administratrice : celle avec laquelle vous vous connecterez. Choisissez une adresse durable, pas celle d'un collaborateur qui pourrait partir.
> 3. Le sous-domaine de vos rendez-vous. Je vous propose rdv.[votre-domaine].
> 4. L'adresse d'envoi des confirmations et rappels, par exemple rdv@[votre-domaine]. Idéalement une adresse qui reçoit les réponses de vos prospects.
> 5. Qui gère votre nom de domaine (OVH, Hostinger, Cloudflare, Google…) et, au choix : un accès à la zone DNS, et je m'occupe de tout ; ou vous ajoutez vous-même les quelques lignes que je vous enverrai (5 minutes).
> 6. Un compte Google pour votre agenda. Une adresse Gmail suffit ; attention, une adresse email chez un hébergeur (OVH, Hostinger…) n'est pas un compte Google.
> 7. 15 minutes en visio une fois l'outil en ligne, pour connecter votre agenda ensemble. Aucun mot de passe ne me sera communiqué.
> 8. Facultatif : la couleur principale de votre marque.
>
> Rien d'autre : pas de compte à créer, rien à installer.

⚠️ **Je ne commence pas avant d'avoir les points 1 à 6.** Monter une instance à
moitié oblige à y revenir, et c'est là qu'une variable s'oublie.

---

## 2. Monter l'instance

Tout se fait depuis le dossier du dépôt Mycall. Aucun dossier par client.

### Étape 1 — La base Convex *(5 min)*

1. dashboard.convex.dev → **Create Project** → le nom du client
2. En haut de l'écran, bascule sur **Production**
3. **Settings** → copie l'**URL de déploiement** (elle se termine par `.convex.cloud`)
4. **Project Settings → Production Deployment Settings → Deploy Keys** → crée une clé :
   - Nom : `Vercel`
   - Expiration : **No expiration**
   - Permissions : **`deployment:deploy`**, et rien d'autre
5. Garde-la de côté : elle ne va que dans Vercel, à l'étape 4

> **Piège n°1.** Une clé *Preview* au lieu de *Production* déploie le site dans
> une base vide : les pages répondent 404 sans que rien n'indique pourquoi.

### Étape 2 — Le fichier du client *(2 min)*

Copie `clients/exemple.json` en `clients/<client>.json` et remplis-le :

| Champ | Exemple |
|---|---|
| `name` | `Cabinet Martin` |
| `convexUrl` | l'URL copiée à l'étape 1 |
| `domain` | `rdv.cabinet-martin.fr` |
| `adminEmail` | son email administrateur |
| `fromEmail` | `Cabinet Martin <rdv@cabinet-martin.fr>` |
| `brandColor` | facultatif — marine Mycall par défaut |

Aucune clé dans ce fichier : il part sur GitHub.

### Étape 3 — Le script *(2 min)*

```bash
bun run onboard clients/<client>.json
```

Il génère ses clés d'authentification, pose les 12 variables de sa base
(`SITE_URL` comprise), reprend Google et Resend depuis Mycall, puis affiche :

- les **7 valeurs à coller dans Vercel**
- l'**adresse de retour** à ajouter dans Google Cloud

Laisse le terminal ouvert. Le relancer est sans risque : il ne remplace jamais
des clés déjà posées.

### Étape 4 — Vercel *(5 min)*

1. vercel.com → **Add New → Project** → importe le dépôt `mycall` → nom : celui du client
2. **Avant** de cliquer sur Deploy, déplie **Environment Variables** et colle les
   7 valeurs du script — `CONVEX_DEPLOY_KEY` étant la clé de l'étape 1
3. **Deploy**
4. Dans le journal de build, la ligne doit être
   `Deployed Convex functions to [REDACTED]`

> `[REDACTED]` est le signal d'une clé de production. Une URL en clair : mauvaise
> clé, retour à l'étape 1.

### Étape 5 — Son domaine d'envoi dans Resend *(5 min)*

1. resend.com → **Domains → Add Domain** → le domaine de son adresse d'envoi
2. Resend affiche les enregistrements DNS à poser (un MX, des TXT)

Ne les envoie pas tout de suite : attends le CNAME de l'étape 6, pour ne lui
écrire **qu'une fois**.

### Étape 6 — Son domaine *(2 min)*

1. Vercel → le projet → **Settings → Domains** → ajoute `rdv.son-domaine.fr`
   (le sous-domaine, jamais le domaine racine)
2. Vercel affiche la cible du CNAME

Maintenant, pose ou envoie **en un seul message** les lignes Resend et celle-ci :

| Type | Nom | Cible | Proxy |
|---|---|---|---|
| CNAME | `rdv` | la valeur donnée par Vercel | **DNS only** — nuage gris sur Cloudflare |

Une fois posées : Resend → **Verify**.

> Sans domaine vérifié dans Resend, aucun email ne part vers ses prospects.

### Étape 7 — Google Cloud *(1 min)*

console.cloud.google.com → **APIs & Services → Credentials** → mon client OAuth
→ **Authorized redirect URIs** → **Add URI** → colle l'adresse affichée par le
script → **Save**.

Oubliée, cette ligne donne une erreur `redirect_uri_mismatch` pendant la visio.

### Étape 8 — Vérifier *(1 min)*

Quand Vercel affiche **Valid Configuration** sur le domaine :

```bash
bun run onboard clients/<client>.json --check
```

Sept contrôles. Je ne propose la visio que s'ils sont tous verts ; chaque échec
affiche sa cause.

> ⚠️ **Ne crée aucun compte sur son instance.** Le premier inscrit devient
> administrateur, et seul son email est autorisé à s'inscrire. C'est lui qui
> ouvre la marche, pendant la visio.

---

## 3. La visio de 15 minutes

Il partage son écran ; je guide, il clique. Aucun mot de passe ne passe par moi.

1. **Son compte** — `rdv.son-domaine.fr/signup`, avec l'email administrateur :
   il devient administrateur
2. **Son agenda** — *Paramètres → Calendrier Google → Connecter*, avec son compte
   Google. L'écran « Google n'a pas validé cette application » apparaît :
   **Paramètres avancés → Accéder à…** C'est attendu.
3. **Ses disponibilités** — *Paramètres → Disponibilités*. Sans elles, aucun
   créneau ne s'affiche : c'est l'oubli le plus fréquent.
4. **Sa page de réservation** — *Événements → Nouvel événement*. Il copie le lien.
5. **Le test** — je réserve un créneau depuis mon téléphone, avec mon adresse :
   - l'email de confirmation arrive, **à son nom**, avec le fichier d'agenda
   - le rendez-vous apparaît dans **son** agenda Google, avec le lien Meet
   - le prospect apparaît dans le CRM
6. J'annule ce rendez-vous depuis le lien de l'email : le lien d'annulation est
   vérifié, et son agenda reste propre
7. Facultatif — *Paramètres → Équipe* pour inviter ses collaborateurs,
   *Paramètres → Séquences* pour ses relances

---

## 4. Après la livraison

- **Commit du fichier client** : il sert à revérifier l'instance à tout moment
  avec `--check`
- **Mises à jour** : `git push` — son instance se met à jour avec les autres
- **S'il part** : export complet de sa base, à lui remettre

  ```bash
  bunx convex export --deployment <sa-base> --path <client>.zip
  ```

---

## 5. Pièges déjà rencontrés

| Symptôme | Cause |
|---|---|
| Page de réservation en 404, tout le reste marche | Clé *Preview* au lieu de *Production*, ou `NEXT_PUBLIC_CONVEX_URL` absente de Vercel |
| `record with that host already exists` | Domaine racine ajouté au lieu du sous-domaine |
| `Proxy Detected` dans Vercel | CNAME en *Proxied* → passer en **DNS only** |
| `redirect_uri_mismatch` en connectant l'agenda | Étape 7 oubliée |
| « Google n'a pas validé cette application » | Normal : **Paramètres avancés → Accéder à…** |
| Mot de passe oublié sans effet | `SITE_URL` absente — relancer le script |
| Aucun email ne part | Domaine pas encore vérifié dans Resend |
| Invitation d'agenda au nom d'un Gmail | Normal sans Google Workspace : nos emails à son nom, avec le fichier d'agenda, prennent le relais |
| Inscription refusée | Email différent de `adminEmail` → corriger le fichier, relancer le script |
| Aucun créneau sur la page | Disponibilités non réglées |
