# Passerelle Mycall

Une seule adresse et une seule clé pour piloter **tous** les clients Mycall.

## Pourquoi elle existe

Chaque client Mycall tourne sur sa propre base : sa propre adresse, ses propres
clés, ses propres données. Aucune clé ne traverse d'une instance à l'autre, et
c'est cette étanchéité qui protège tes clients les uns des autres.

L'inconvénient, pour un outil externe, est d'avoir à gérer une connexion par
client. La passerelle le règle sans rien céder sur l'étanchéité : elle connaît
les instances, reçoit une requête, reconnaît le client visé, ajoute la clé de
son instance et transmet. Les bases restent séparées.

```
Outil externe ──(1 adresse, 1 clé)──> Passerelle ──┬──> instance Client A
                                                    ├──> instance Client B
                                                    └──> instance Client C
```

## Pour l'intégrateur

### Adresse

```
https://<domaine-passerelle>/api/gateway/v1
```

### Authentification

```
Authorization: Bearer <clé de passerelle>
```

Cette clé n'est pas une clé Mycall : elle ouvre la passerelle, qui détient les
clés des instances. Une clé Mycall n'est jamais transmise à l'extérieur.

### `GET /clients`

```json
{ "clients": [{ "slug": "client-a", "name": "Client A" }] }
```

À appeler au démarrage : un nouveau client apparaît ici sans intervention de
l'intégrateur.

### Toutes les autres adresses

Le chemin de l'API Mycall, préfixé du client :

```
GET  /api/gateway/v1/client-a/leads/list?status=gagne
GET  /api/gateway/v1/client-a/bookings?limit=50
POST /api/gateway/v1/client-a/bookings/outcome
POST /api/gateway/v1/client-b/events/appel-strategique/hosts
```

Les paramètres, les corps de requête et les réponses sont **identiques** à ceux
de l'API Mycall, décrite dans `API.md`. La passerelle ajoute seulement un champ
`client` à chaque réponse. Il n'y a donc qu'une API à apprendre.

### Codes propres à la passerelle

| Code | Sens |
|---|---|
| `401` | Clé de passerelle absente ou invalide |
| `404` | Client inconnu, ou passerelle désactivée |
| `502` | L'instance du client n'a pas répondu. Le champ `error` dit pourquoi |

Tout autre code vient de l'instance elle-même et garde son sens habituel.

## Webhooks

Sans passerelle, un outil externe doit déclarer une adresse de réception par
client. Avec elle, une seule suffit.

Dans **chaque instance**, déclarer comme webhook sortant :

```
https://<domaine-passerelle>/api/gateway/hooks/<slug du client>
```

La passerelle relaie l'événement vers l'adresse unique de l'outil externe, en
ajoutant l'en-tête `X-Mycall-Client`. Les en-têtes de signature d'origine sont
conservés : la vérification reste possible, avec le secret du webhook de
l'instance concernée.

Le code de réponse de l'outil externe est renvoyé tel quel à l'instance : un
refus déclenche donc les réessais habituels, après 1 minute, 10 minutes, puis
1 heure.

## Mise en place

La passerelle fait partie du code de Mycall, mais ne s'active que sur le projet
où elle est explicitement allumée. Sur toutes les autres instances, ses
adresses répondent `404`.

Variables à poser **uniquement** sur le projet qui l'héberge :

| Variable | Rôle |
|---|---|
| `GATEWAY_ENABLED` | `true` pour l'activer. Absente ailleurs |
| `GATEWAY_API_KEY` | Clé attendue de l'outil externe. Plusieurs clés séparées par des virgules, pour en révoquer une sans couper les autres |
| `MYCALL_CLIENTS` | L'annuaire, en JSON (voir ci-dessous) |
| `GATEWAY_WEBHOOK_URL` | Adresse unique de l'outil externe, pour le relais des webhooks |

Format de l'annuaire :

```json
[
  {
    "slug": "client-a",
    "name": "Client A",
    "url": "https://xxx-xxx-123.convex.site/api/v1",
    "key": "mc_..."
  }
]
```

L'annuaire contient les clés de tous les clients. Il vit dans une variable
d'environnement, jamais dans le dépôt ni en base : c'est la pièce la plus
sensible de l'édifice.

Ajouter un client revient à ajouter une entrée, puis à redéployer le projet.
