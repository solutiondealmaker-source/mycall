# Mise en route de votre outil — ce que nous attendons de vous

Ce document liste **uniquement ce qui dépend de vous**. Le reste — installation,
mises à jour, corrections — est de notre côté et ne vous demandera rien.

Comptez **30 à 45 minutes**, en une fois ou en plusieurs.

---

## Avant de commencer, trois décisions

**1. L'adresse email qui sera administratrice.**
La première personne inscrite devient administratrice de l'espace. Choisissez
l'adresse d'une personne durable dans l'entreprise, pas un compte personnel qui
partira avec elle.

**2. Le sous-domaine de vos rendez-vous.**
Vos prospects verront cette adresse. Nous recommandons `rdv.votre-domaine.com`.
Elle doit être un **sous-domaine** : nous ne toucherons jamais à votre domaine
principal ni à vos emails existants.

**3. L'adresse qui enverra vos emails.**
Confirmations, rappels, relances partiront de cette adresse — par exemple
`rdv@votre-domaine.com`. Prévoyez qu'elle puisse **recevoir** les réponses de
vos prospects.

---

## Étape 1 — Votre base de données

Vos rendez-vous, vos prospects et votre chiffre d'affaires vous appartiennent :
ils vivent dans **votre** compte, pas le nôtre. Si notre collaboration s'arrête,
vous les gardez.

1. Créez un compte sur **convex.dev** (gratuit pour démarrer)
2. **New Project** → nommez-le comme votre entreprise
3. Une fois créé, ouvrez **Project Settings → Production Deployment Settings**
4. Section **Deploy Keys** → créez une clé
   - Nom : `Déploiement`
   - Expiration : **No expiration**
   - Permissions : cochez **`deployment:deploy`** et **rien d'autre**
5. Transmettez-nous cette clé

> 🔒 Cette clé nous permet d'installer les mises à jour, **et rien de plus** :
> elle ne donne accès ni à vos données, ni à vos autres réglages. Envoyez-la
> par un canal privé — pas dans un email en clair.

---

## Étape 2 — Vos emails

Sans cette étape, aucune confirmation ne parviendra à vos prospects.

1. Créez un compte sur **resend.com** (gratuit jusqu'à 3 000 emails/mois)
2. **Domains → Add Domain** → votre domaine
3. Resend affiche 3 enregistrements DNS (un MX, deux TXT) → ajoutez-les chez
   votre hébergeur de domaine
   - ⚠️ Si vous utilisez Cloudflare : ces entrées doivent être en **DNS only**
     (nuage **gris**, pas orange)
4. Cliquez **Verify** — comptez quelques minutes
5. **API Keys → Create API Key** → transmettez-la nous

---

## Étape 3 — Votre agenda

L'outil crée les rendez-vous dans votre agenda Google et génère les liens Meet.

Il vous faut un **compte Google** — une simple boîte Gmail suffit. Attention :
une adresse email de votre hébergeur (type OVH, Hostinger) **n'est pas** un
compte Google.

Vous connecterez cet agenda vous-même, depuis l'application, à l'étape 6.

> Si vous voulez que vos invitations partent au nom de votre domaine plutôt que
> d'une adresse Gmail, il faut un **Google Workspace** (environ 6 €/mois). Ce
> n'est pas obligatoire — dites-nous si vous le souhaitez.

---

## Étape 4 — Votre nom de domaine

Nous vous transmettrons **une valeur à copier**. Chez votre hébergeur de
domaine, créez un enregistrement :

| Champ | Valeur |
|---|---|
| Type | **CNAME** |
| Nom | `rdv` |
| Cible | *(la valeur que nous vous donnons)* |
| Proxy / statut | **DNS only** — nuage **gris** si Cloudflare |

C'est tout : votre site principal et vos emails ne sont pas concernés.

---

## Étape 5 — Vos paiements *(optionnel)*

Uniquement si vous voulez encaisser depuis l'outil.

1. Compte **stripe.com**
2. **Développeurs → Clés API** → copiez votre clé secrète
3. Vous la saisirez **vous-même** dans l'application, à l'étape 6 : nous n'avons
   jamais à la voir

---

## Étape 6 — Votre première connexion

Nous vous préviendrons quand l'application sera en ligne. Vous ferez alors :

1. **Créer votre compte** sur `rdv.votre-domaine.com` avec l'adresse choisie au
   départ → vous devenez administrateur
2. **Paramètres → Calendrier** → connectez votre agenda Google
3. **Paramètres → Disponibilités** → vos plages horaires
   *(sans cette étape, aucun créneau ne s'affiche : c'est l'oubli le plus fréquent)*
4. **Événements → Nouveau** → créez votre première page de réservation
5. **Paramètres → Équipe** → invitez vos collaborateurs
6. **Paramètres → Intégrations** → collez votre clé Stripe, si concerné

---

## Récapitulatif de ce que vous nous transmettez

| Élément | Étape |
|---|---|
| Clé de déploiement Convex | 1 |
| Clé API Resend + adresse d'expédition | 2 |
| Le sous-domaine choisi | 3 décisions |
| L'email administrateur | 3 décisions |

Tout le reste, vous le saisissez vous-même dans l'application. Nous ne
manipulons jamais votre clé Stripe ni vos mots de passe.

---

## Questions fréquentes

**Puis-je changer de nom de domaine plus tard ?**
Oui, dites-le nous : c'est un réglage, pas une réinstallation.

**Mes prospects voient-ils que l'outil vient de vous ?**
Non. L'application, la page de réservation et les emails portent votre nom.

**Que se passe-t-il si nous arrêtons de travailler ensemble ?**
Votre base de données est chez vous : vous conservez l'intégralité de vos
prospects et de votre historique.

**Qui a accès à mes données ?**
Elles sont dans votre compte Convex. Nous n'y accédons que si vous nous le
demandez pour une intervention.
