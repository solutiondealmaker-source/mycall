# API Mycall

À transmettre à un intégrateur externe (Atlas, Make, Zapier, un développeur).
Tout est en lecture et écriture sur **une seule instance** : une clé ne donne
jamais accès aux données d'un autre client.

## Adresse de base

```
https://<base-convex>.convex.site/api/v1
```

L'adresse de la base figure dans Paramètres → Intégrations → Automatisations,
sous la liste des clés. Elle se termine par `.convex.site`, jamais `.convex.cloud`.

## Authentification

Une clé est créée dans Paramètres → Intégrations → Automatisations. Elle
s'affiche une seule fois. Les trois formes sont acceptées :

```
Authorization: Bearer mc_xxx
X-API-Key: mc_xxx
?api_key=mc_xxx
```

Sans clé valable, toute requête répond `401`.

**Ce qu'une clé permet :** tout ce qu'un administrateur peut faire sur les
données, sans passer par l'interface. Elle ne connaît aucun cloisonnement par
closer. À traiter comme un mot de passe, et à révoquer dès qu'un prestataire
cesse d'intervenir.

## Lecture

### `GET /me`
Vérifie la clé et renvoie la documentation complète des adresses.

### `GET /leads/list`
Liste les prospects, du plus récent au plus ancien.

| Paramètre | Rôle |
|---|---|
| `status` | `potentiel`, `qualifie`, `rdv_reserve`, `tenu`, `gagne`, `perdu`, `follow_up` |
| `closer_email` | Email exact du closer attribué |
| `event_slug` | Identifiant d'événement, par exemple `appel-strategique` |
| `updated_since` | Millisecondes. Ne renvoie que ce qui a bougé depuis |
| `limit` | 50 par défaut, 200 au maximum |
| `cursor` | Reprend la page suivante, avec la valeur de `next_cursor` |

Réponse : `{ leads: [...], next_cursor: "..." | null, has_more: true }`.
Tant que `has_more` vaut `true`, rappeler l'adresse avec `cursor`.

### `GET /leads?email=|phone=|id=`
Retrouve un prospect unique.

### `GET /bookings`
Rendez-vous d'un prospect, ou d'une période.

| Paramètre | Rôle |
|---|---|
| `id`, `email`, `phone` | Tous les rendez-vous de ce prospect |
| `from`, `to` | Fenêtre en millisecondes. Par défaut : 30 jours en arrière, 90 en avant |
| `event_slug` | Limite à un événement |
| `status` | `confirmed`, `cancelled`, `rescheduled`, `no_show`, `completed` |
| `limit` | 50 par défaut, 200 au maximum |
| `cursor` | Page suivante, avec la valeur de `next_cursor` |

Chaque rendez-vous porte ses dates, son fuseau, le lien de visio, le closer, le
setter, la présence (`attendance`), l'issue (`outcome`), le montant, les liens
d'annulation et de replanification, et :

- `lead_id` : le prospect rattaché, pour recouper avec `/leads/list` ;
- `rescheduled_from` et `rescheduled_at` : date d'origine et moment du
  déplacement, quand le rendez-vous a été replanifié.

Les personnes (`host`, `closer`, `setter`) portent `id`, `name` et `email`.
Le setter est celui attribué au prospect, ou à défaut celui défini sur
l'événement.

**Un curseur ne vaut que pour des filtres identiques.** Changer `status`,
`event_slug` ou la fenêtre de dates invalide la pagination en cours. Sans
`from` ni `to`, la fenêtre par défaut couvre 30 jours en arrière et 91 en
avant, arrondie à la journée.

### `GET /events`
Événements actifs et leurs liens de réservation.

### `GET /events/{slug}`
Réglages complets : durée, marges, préavis, mode d'attribution
(`assignment_mode` vaut `round_robin` ou `manual`), hôtes avec leur priorité
(`high`, `medium`, `low`), et questions du formulaire.

### `GET /team`
Membres (`id`, `name`, `email`, `role`, `is_admin`, `active`) et invitations
en attente, dans `pending_invitations`.

Mycall ne désactive pas un membre : il est présent, ou retiré de l'équipe.
`active` vaut donc toujours `true` aujourd'hui ; le champ existe pour qu'une
désactivation future n'oblige personne à changer son code.

## Écriture

### `POST /leads`
Crée ou complète un prospect. `email` ou `phone` est obligatoire : c'est la clé
de rapprochement, un prospect déjà connu est complété, jamais dupliqué.

Champs acceptés : `first_name`, `last_name`, `email`, `phone`, `status`,
`source`, `tags`, `note`, `closer_email`, `event_slug`, `amount`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`.

Un champ absent n'efface jamais une valeur existante.

### `POST /leads/notes`
Ajoute une note. Champs : `id` | `email` | `phone`, et `body`.

### `POST /leads/status`
Change le statut. Champs : `id` | `email` | `phone`, `status`, et `amount` en
euros pour une vente.

Le corps est accepté en JSON comme en formulaire, en `snake_case` comme en
`camelCase`.

## Événements sortants

Plutôt que d'interroger Mycall en boucle, un outil externe peut recevoir les
événements au moment où ils se produisent. Les webhooks se configurent dans
Paramètres → Intégrations → Automatisations.

| Événement | Déclencheur |
|---|---|
| `lead.created` | Formulaire rempli, réservation, ou création par l'API |
| `lead.status_changed` | Changement de statut, quelle qu'en soit l'origine |
| `booking.created` | Créneau confirmé |
| `booking.rescheduled` | Rendez-vous déplacé |
| `booking.cancelled` | Annulation, par le prospect ou par l'équipe |
| `booking.outcome_updated` | Présence ou issue saisie |
| `payment.succeeded` | Paiement Stripe encaissé |

Chaque envoi porte les blocs `lead` et `booking` au même format que les
adresses de lecture, et les en-têtes `X-Mycall-Event`, `X-Mycall-Timestamp` et
`X-Mycall-Signature`. La signature est un HMAC SHA-256 de
`<timestamp>.<corps>`, avec le secret du webhook.

Un refus durable (code 4xx) n'est pas réessayé. Une panne passagère est
retentée après 1 minute, 10 minutes, puis 1 heure. Un code `410` désactive le
webhook, considéré comme supprimé côté outil.

## Erreurs

| Code | Sens |
|---|---|
| `400` | Paramètre manquant ou invalide. Le champ `error` dit lequel |
| `401` | Clé absente, invalide ou révoquée |
| `404` | Ressource introuvable, ou adresse inconnue |

Toute réponse d'erreur contient un champ `error` rédigé en français.
