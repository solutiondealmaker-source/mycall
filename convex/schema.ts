import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================
// iClone — Convex schema V1
// 20 tables (19 métier + users).
//
// Better Auth gère ses propres tables sessions/accounts via l'adapter Convex.
// La table `users` ci-dessous est enrichie des champs métier iClone.
// Colonnes BA standard (sessions, verification_tokens, accounts) sont
// créées automatiquement par l'adapter — ne pas les redéfinir ici.
// ============================================================

export default defineSchema({
	// ===========================================================
	// AUTH (Convex Auth — tables auth standard)
	// ===========================================================
	...authTables,

	// users overrides authTables.users — ajout des champs métier iClone
	users: defineTable({
		// Champs standard Convex Auth (mêmes noms que authTables.users)
		name: v.optional(v.string()),
		image: v.optional(v.string()),
		email: v.optional(v.string()),
		emailVerificationTime: v.optional(v.number()),
		phone: v.optional(v.string()),
		phoneVerificationTime: v.optional(v.number()),
		isAnonymous: v.optional(v.boolean()),

		// Champs métier iClone
		role: v.optional(
			v.union(
				v.literal("closer"),
				v.literal("setter"),
				v.literal("coach"),
				v.literal("head_of_sales"),
				v.literal("ceo"),
				v.literal("ops"),
				v.literal("admin"),
				// Observateur : voit tout (RDV, leads, CA), ne modifie rien. Destiné
				// aux accompagnants externes (coach, consultant, expert-comptable).
				v.literal("viewer"),
			),
		),
		isAdmin: v.optional(v.boolean()),
		defaultTimezone: v.optional(v.string()), // ex: "Europe/Paris"
	}).index("email", ["email"]),

	// Invitations à rejoindre l'instance. Une invitation en attente autorise
	// l'inscription de cet email, en complément de SIGNUP_ALLOWED_EMAILS : c'est
	// ce qui permet d'ajouter un membre sans toucher aux variables d'environnement.
	invitations: defineTable({
		email: v.string(), // normalisé en minuscules
		role: v.union(
			v.literal("closer"),
			v.literal("setter"),
			v.literal("coach"),
			v.literal("head_of_sales"),
			v.literal("ceo"),
			v.literal("ops"),
			v.literal("admin"),
			v.literal("viewer"),
		),
		invitedByUserId: v.id("users"),
		createdAt: v.number(),
		expiresAt: v.number(),
		acceptedAt: v.optional(v.number()),
		revokedAt: v.optional(v.number()),
	})
		.index("by_email", ["email"])
		.index("by_createdAt", ["createdAt"]),

	// ===========================================================
	// BOOKING CORE
	// ===========================================================

	// Configuration d'un type d'événement (page de booking publique)
	events: defineTable({
		name: v.string(),
		slug: v.string(), // identifiant public URL — unique
		description: v.optional(v.string()), // texte affiché sur la page publique (markdown/HTML simple)

		// Durée & buffers
		durationMinutes: v.number(),
		bufferBeforeMinutes: v.optional(v.number()),
		bufferAfterMinutes: v.optional(v.number()),
		slotIncrementMinutes: v.optional(v.number()),

		// Présentation
		timeFormat: v.optional(v.union(v.literal("h12"), v.literal("h24"))),
		timezone: v.string(), // TZ de présentation, ex: "Europe/Paris"
		color: v.optional(v.string()),

		// Fenêtre de disponibilité
		rangeType: v.optional(
			v.union(v.literal("rolling"), v.literal("indefinite")),
		),
		rangeDays: v.optional(v.number()),
		rescheduleRangeDays: v.optional(v.number()),
		// true = tous les jours, number[] = DOW spécifiques bypass fenêtre glissante
		alwaysAvailableDays: v.optional(v.union(v.boolean(), v.array(v.number()))),
		minimumNoticeHours: v.optional(v.number()),
		businessDaysOnly: v.optional(v.boolean()),

		// Comportement booking
		allowReschedule: v.boolean(),
		preventDoubleBooking: v.optional(v.boolean()),
		rescheduleWithSameHost: v.optional(v.boolean()),
		priorityMode: v.union(v.literal("manual"), v.literal("round_robin")),

		// Disqualification
		disqualificationRules: v.optional(
			v.array(
				v.object({
					questionLabel: v.string(),
					answers: v.array(v.string()),
				}),
			),
		),
		disqualificationMessage: v.optional(v.string()),
		disqualificationRedirectUrl: v.optional(v.string()),

		// Attribution setter
		setterId: v.optional(v.id("users")),

		// Templates invitation Google Calendar
		calendarGreeting: v.optional(v.string()),
		calendarBody: v.optional(v.string()),
		calendarSignature: v.optional(v.string()),

		// Page de confirmation
		confirmationTitle: v.optional(v.string()),
		confirmationMessage: v.optional(v.string()),
		confirmationRedirectUrl: v.optional(v.string()),

		// Location
		location: v.optional(v.union(v.literal("googleMeet"), v.literal("custom"))),
		customLocation: v.optional(v.string()),

		// Misc
		reservationTimerMinutes: v.optional(v.number()),
		tagSource: v.optional(v.string()),
		noteInterne: v.optional(v.string()),
		isActive: v.boolean(),
	})
		.index("by_slug", ["slug"])
		.index("by_isActive", ["isActive"])
		.index("by_setterId", ["setterId"]),

	// Hosts (closers) assignés à un événement avec priorité
	eventHosts: defineTable({
		eventId: v.id("events"),
		userId: v.id("users"),
		priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
		createdAt: v.number(),
	})
		.index("by_eventId", ["eventId"])
		.index("by_userId", ["userId"])
		.index("by_eventId_userId", ["eventId", "userId"]),

	// Questions du formulaire de qualification d'un événement
	eventQuestions: defineTable({
		eventId: v.id("events"),
		order: v.number(),
		type: v.union(
			v.literal("email"),
			v.literal("short_text"),
			v.literal("long_text"),
			v.literal("single_select"),
			v.literal("multi_select"),
			v.literal("yes_no"),
			v.literal("number"),
		),
		label: v.string(),
		required: v.boolean(),
		options: v.optional(v.array(v.string())),
		disqualifyingValues: v.optional(v.array(v.string())),
	})
		.index("by_eventId", ["eventId"])
		.index("by_eventId_order", ["eventId", "order"]),

	// Plages de disponibilité hebdomadaire d'un host
	userAvailability: defineTable({
		userId: v.id("users"),
		dayOfWeek: v.number(), // 0=Dim … 6=Sam
		startMinute: v.number(), // minutes depuis minuit (TZ locale du user)
		endMinute: v.number(),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_dayOfWeek", ["userId", "dayOfWeek"]),

	// Capture silencieuse d'un prospect en cours de remplissage du formulaire
	partialLeads: defineTable({
		eventId: v.id("events"),
		eventSlug: v.string(),
		sessionId: v.string(), // clé de dédup session navigateur

		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
		phoneNormalized: v.optional(v.string()), // E.164
		emailNormalized: v.optional(v.string()), // lowercase trimmed

		formAnswers: v.optional(v.string()), // JSON serialisé

		// Liens vers entités promues
		promotedLeadId: v.optional(v.id("leads")),
		bookingId: v.optional(v.id("bookings")),

		abandonedNotifiedAt: v.optional(v.number()),
		firstSeenAt: v.number(),
		lastUpdatedAt: v.number(),
	})
		.index("by_sessionId", ["sessionId"])
		.index("by_eventId", ["eventId"])
		.index("by_eventId_phoneNormalized", ["eventId", "phoneNormalized"])
		.index("by_eventId_emailNormalized", ["eventId", "emailNormalized"]),

	// Prospect qualifié ou converti — source de vérité CRM
	leads: defineTable({
		// Identité
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		phone: v.optional(v.string()),
		email: v.optional(v.string()),
		phoneNormalized: v.optional(v.string()),
		emailNormalized: v.optional(v.string()),

		// Formulaire
		eventId: v.optional(v.id("events")),
		eventSlug: v.optional(v.string()),
		sessionId: v.optional(v.string()),
		formAnswers: v.optional(v.string()), // JSON

		// Pipeline
		status: v.union(
			v.literal("potentiel"),
			v.literal("qualifie"),
			v.literal("rdv_reserve"),
			v.literal("tenu"),
			v.literal("gagne"),
			v.literal("perdu"),
			v.literal("follow_up"),
		),
		phase: v.optional(v.string()), // étiquette affichage libre

		// Attribution
		setterUserId: v.optional(v.id("users")),
		closerUserId: v.optional(v.id("users")),

		// Source & tracking
		tagSource: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		utmSource: v.optional(v.string()),
		utmMedium: v.optional(v.string()),
		utmCampaign: v.optional(v.string()),
		utmTerm: v.optional(v.string()),
		utmContent: v.optional(v.string()),

		// Résultat commercial
		montantContracte: v.optional(v.number()), // en centimes
		convertedAt: v.optional(v.number()),
		// D�sinscription du nurturing. Obligatoire l�galement : un email
		// commercial doit porter un lien de d�sabonnement qui fonctionne.
		emailOptOutAt: v.optional(v.number()),
		unsubToken: v.optional(v.string()),

		lastInteractionAt: v.optional(v.number()),
	})
		.index("by_phoneNormalized", ["phoneNormalized"])
		.index("by_emailNormalized", ["emailNormalized"])
		.index("by_status", ["status"])
		.index("by_closerUserId", ["closerUserId"])
		.index("by_setterUserId", ["setterUserId"])
		.index("by_eventId", ["eventId"]),

	// Réservation concrète d'un créneau
	bookings: defineTable({
		eventId: v.id("events"),
		eventSlug: v.string(),
		hostId: v.id("users"),

		// Liens CRM
		leadId: v.optional(v.id("leads")),
		partialLeadId: v.optional(v.id("partialLeads")),

		// Identité prospect (dénormalisée pour affichage sans join)
		prospectFirstName: v.string(),
		prospectLastName: v.string(),
		prospectName: v.string(),
		prospectEmail: v.optional(v.string()),
		prospectPhone: v.string(),

		// Créneau
		startTime: v.number(), // ms epoch UTC
		endTime: v.number(),
		timezone: v.string(),

		// Google Calendar sync
		googleEventId: v.optional(v.string()),
		googleMeetUrl: v.optional(v.string()),
		googleCalendarId: v.optional(v.string()),
		googleAccountId: v.optional(v.id("userGoogleAccounts")),
		googleSyncStatus: v.union(
			v.literal("pending"), // seat hold 60s
			v.literal("synced"),
			v.literal("failed"),
			v.literal("na"), // location custom, pas de Google
		),
		googleSyncStartedAt: v.optional(v.number()),
		googleSyncedAt: v.optional(v.number()),

		// Statut booking
		status: v.union(
			v.literal("confirmed"),
			v.literal("cancelled"),
			v.literal("rescheduled"),
			v.literal("no_show"),
			v.literal("completed"),
		),

		// Axes outcome (orthogonaux)
		tenue: v.union(
			v.literal("planifie"),
			v.literal("tenu"),
			v.literal("no_show"),
			v.literal("annule"),
		),
		issue: v.union(
			v.literal("en_attente"),
			v.literal("follow_up"),
			v.literal("gagne"),
			v.literal("perdu"),
		),
		issueLossReasonId: v.optional(v.id("lossReasons")),
		issueAmountCents: v.optional(v.number()),
		// Origine du montant : saisi par un closer, ou posé par un paiement Stripe.
		// Un paiement suivant ne cumule que sur un montant d'origine "stripe" —
		// le chiffre d'un closer fait foi et ne doit jamais être gonflé.
		issueAmountSource: v.optional(
			v.union(v.literal("stripe"), v.literal("manual")),
		),
		issueOfferId: v.optional(v.string()), // placeholder — offers hors scope V1

		// Tokens publics (cancel / reschedule sans auth)
		cancelToken: v.string(),
		rescheduleToken: v.string(),

		// Annulation
		cancelReason: v.optional(v.string()),
		cancelledByUserId: v.optional(v.id("users")),
		cancelledAt: v.optional(v.number()),

		// Reschedule
		rescheduledFromBookingId: v.optional(v.id("bookings")),
		rescheduledAt: v.optional(v.number()),

		// Misc
		bookedBySetterId: v.optional(v.id("users")), // outbound manuel
		reminderSentAt: v.optional(v.number()),
	})
		.index("by_hostId_startTime", ["hostId", "startTime"])
		.index("by_eventId_startTime", ["eventId", "startTime"])
		.index("by_cancelToken", ["cancelToken"])
		.index("by_rescheduleToken", ["rescheduleToken"])
		.index("by_eventId_email", ["eventId", "prospectEmail"])
		.index("by_eventId_phone", ["eventId", "prospectPhone"])
		.index("by_googleSyncStatus", ["googleSyncStatus"])
		.index("by_leadId_startTime", ["leadId", "startTime"])
		.index("by_status_startTime", ["status", "startTime"])
		.index("by_partialLeadId", ["partialLeadId"]),

	// Audit log immuable de toutes les mutations sur un booking
	bookingActivityLog: defineTable({
		bookingId: v.id("bookings"),
		leadId: v.optional(v.id("leads")),
		type: v.union(
			v.literal("created"),
			v.literal("cancelled"),
			v.literal("rescheduled"),
			v.literal("status_changed"),
			v.literal("outcome_recorded"),
			v.literal("host_changed"),
			v.literal("contact_updated"),
			v.literal("note_added"),
			v.literal("reminder_sent"),
			v.literal("no_show_marked"),
			v.literal("completed"),
		),
		actorUserId: v.optional(v.id("users")),
		actorType: v.union(
			v.literal("user"),
			v.literal("prospect"),
			v.literal("system"),
			v.literal("google_sync"),
		),
		payload: v.any(), // métadonnées libres : previousStartTime, newStartTime, reason…
		createdAt: v.number(),
	})
		.index("by_booking", ["bookingId"])
		.index("by_booking_type", ["bookingId", "type"])
		.index("by_lead_date", ["leadId", "createdAt"]),

	// Comptage des vues de la page de booking (analytics)
	bookingPageViews: defineTable({
		eventId: v.id("events"),
		sessionId: v.string(),
		viewedAt: v.number(),
		userAgent: v.optional(v.string()),
		referer: v.optional(v.string()),
	}).index("by_event_date", ["eventId", "viewedAt"]),

	// ===========================================================
	// GOOGLE CALENDAR SYNC
	// ===========================================================

	// Comptes Google OAuth connectés par un user (multi-comptes)
	userGoogleAccounts: defineTable({
		userId: v.id("users"),
		googleSub: v.string(), // identifiant stable Google — clé dédup
		googleEmail: v.string(),
		accessToken: v.string(), // clair V1 (Convex chiffre at-rest)
		refreshToken: v.string(), // clair V1
		tokenExpiryMs: v.number(),
		scope: v.string(),
		connectedAt: v.number(),
		lastRefreshedAt: v.optional(v.number()),
		// Renseigné quand Google refuse le refresh token (invalid_grant) :
		// la connexion est morte tant que l'utilisateur ne reconnecte pas.
		invalidSince: v.optional(v.number()),
		invalidReason: v.optional(v.string()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_googleSub", ["userId", "googleSub"]),

	// Configuration writer / conflict-check calendars par user
	userCalendarSettings: defineTable({
		userId: v.id("users"),
		// Compte writer : où créer les events Google + Meet links
		writerAccountId: v.optional(v.id("userGoogleAccounts")),
		writerCalendarId: v.optional(v.string()),
		writerCalendarSummary: v.optional(v.string()),
		// Calendriers de conflict-check (peuvent inclure d'autres comptes)
		conflictCheckCalendars: v.array(
			v.object({
				accountId: v.id("userGoogleAccounts"),
				calendarId: v.string(),
				calendarSummary: v.optional(v.string()),
			}),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_userId", ["userId"]),

	// Canaux webhook Google Calendar (push notifications)
	googleCalendarChannels: defineTable({
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		channelId: v.string(), // UUID généré à la création
		resourceId: v.string(), // renvoyé par Google à la création
		token: v.string(), // shared secret validé dans le webhook handler
		expirationMs: v.number(), // 30 jours max (imposé par Google)
		syncToken: v.optional(v.string()), // pour sync incrémental (null = full resync requis)
		lastRenewedAt: v.optional(v.number()),
		renewAttempts: v.number(), // compteur d'échecs — abandon à 5
	})
		.index("by_userId", ["userId"])
		.index("by_channelId", ["channelId"])
		.index("by_expirationMs", ["expirationMs"]) // pour cron renew < now+48h
		.index("by_calendarId", ["calendarId"]),

	// Cache des blocs d'indisponibilité Google (busy blocks)
	hostBusyBlocks: defineTable({
		userId: v.id("users"),
		accountId: v.id("userGoogleAccounts"),
		calendarId: v.string(),
		googleEventId: v.string(),
		start: v.number(), // ms epoch UTC
		end: v.number(),
		transparency: v.optional(
			v.union(v.literal("opaque"), v.literal("transparent")),
		), // transparent = hôte "libre", à ignorer pour conflict-check
	})
		.index("by_userId_start", ["userId", "start"])
		.index("by_userId_end", ["userId", "end"])
		.index("by_googleEventId", ["googleEventId"])
		.index("by_userId_calendarId", ["userId", "calendarId"]),

	// ===========================================================
	// CRM
	// ===========================================================

	// Notes libres sur un lead (timeline activité)
	leadNotes: defineTable({
		leadId: v.id("leads"),
		body: v.string(),
		authorUserId: v.id("users"),
		createdAt: v.number(),
	})
		.index("by_lead", ["leadId"])
		.index("by_lead_date", ["leadId", "createdAt"]),

	// Follow-ups programmés sur un lead
	leadFollowUps: defineTable({
		leadId: v.id("leads"),
		dueAt: v.number(),
		reason: v.string(),
		channel: v.union(
			v.literal("call"),
			v.literal("sms"),
			v.literal("email"),
			v.literal("other"),
		),
		status: v.union(
			v.literal("pending"),
			v.literal("done"),
			v.literal("missed"),
			v.literal("cancelled"),
		),
		note: v.optional(v.string()),
		closerUserId: v.id("users"),
	})
		.index("by_lead", ["leadId"])
		.index("by_closer_status", ["closerUserId", "status"])
		.index("by_dueAt", ["dueAt"]),

	// ===========================================================
	// CATALOGUES
	// ===========================================================

	// Catalogue des raisons de perte (partagé across events)
	lossReasons: defineTable({
		name: v.string(), // slug normalisé, ex: "prix_trop_eleve"
		label: v.string(), // affiché dans l'UI
		color: v.optional(v.string()),
		order: v.number(),
		archived: v.boolean(),
		usageCount: v.number(), // incrémenté à chaque issue="perdu"
	})
		.index("by_archived", ["archived"])
		.index("by_order", ["order"]),

	// Sources de leads (provenance tracking)
	leadSources: defineTable({
		name: v.string(),
		color: v.optional(v.string()),
		usageCount: v.number(),
	}).index("by_name", ["name"]),

	// Configuration des intégrations — singleton (1 seule row par déploiement).
	// La clé secrète Stripe n'est JAMAIS renvoyée au client : les queries
	// exposent uniquement un aperçu masqué (4 derniers caractères).
	integrationSettings: defineTable({
		singleton: v.literal("default"),
		stripeSecretKey: v.optional(v.string()),
		stripeWebhookSecret: v.optional(v.string()), // whsec_… (signature)
		stripeEnabled: v.optional(v.boolean()),
		stripeCurrency: v.optional(v.string()), // ex: "eur"
		updatedAt: v.number(),
		updatedByUserId: v.optional(v.id("users")),
	}).index("by_singleton", ["singleton"]),

	// Paramètres du pipeline — singleton (1 seule row par déploiement)
	pipelineSettings: defineTable({
		singleton: v.literal("default"), // clé unique du singleton
		silenceAlertDays: v.number(), // alerte si lead silencieux N jours
		silenceAutoLoseDays: v.number(), // perte auto si silencieux N jours
		followUpReminderHour: v.number(), // heure UTC d'envoi des rappels follow-up
		silenceAutoLoseReasonId: v.optional(v.id("lossReasons")),
	}).index("by_singleton", ["singleton"]),

	// ===========================================================
	// AUDIT / NOTIFICATIONS
	// ===========================================================

	// Log de toutes les notifications sortantes (email, etc.)
	// Échéanciers Stripe : un abonnement plafonné à N prélèvements.
	// Stripe ne sait pas limiter le nombre de cycles d'un Payment Link ; on
	// compte donc nous-mêmes et on résilie à la dernière échéance. Le compteur
	// vit ici plutôt que dans les metadata Stripe : c'est notre base qui décide
	// quand s'arrêter, pas une valeur qu'un tiers pourrait modifier.
	// ============================================================
	// NURTURING � s�quences d'emails programm�s
	// ============================================================

	emailSequences: defineTable({
		name: v.string(),
		// Ce qui inscrit un lead. "manual" = bouton dans le CRM.
		trigger: v.union(
			v.literal("manual"),
			v.literal("abandoned_form"),
			v.literal("no_show"),
			v.literal("before_booking"),
		),
		isActive: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_trigger", ["trigger", "isActive"]),

	sequenceSteps: defineTable({
		sequenceId: v.id("emailSequences"),
		order: v.number(),
		// D�calage en minutes par rapport � l'ancre de l'inscription.
		// N�gatif = AVANT (nurturing pr�-RDV : -2880 = 2 jours avant).
		offsetMinutes: v.number(),
		subject: v.string(),
		body: v.string(),
	}).index("by_sequence", ["sequenceId", "order"]),

	sequenceEnrollments: defineTable({
		sequenceId: v.id("emailSequences"),
		leadId: v.id("leads"),
		bookingId: v.optional(v.id("bookings")),
		// Instant de r�f�rence des d�calages : l'inscription, ou le d�but du RDV
		// pour une s�quence pr�-rendez-vous.
		anchorAt: v.number(),
		status: v.union(
			v.literal("active"),
			v.literal("done"),
			v.literal("stopped"),
		),
		stopReason: v.optional(v.string()),
		enrolledAt: v.number(),
	})
		.index("by_status", ["status"])
		.index("by_lead", ["leadId"]),

	// Une ligne par envoi effectu�. C'est la garde qui emp�che qu'un lead
	// re�oive deux fois la m�me �tape si un cron se chevauche.
	sequenceSends: defineTable({
		enrollmentId: v.id("sequenceEnrollments"),
		stepId: v.id("sequenceSteps"),
		sentAt: v.number(),
	}).index("by_enrollment", ["enrollmentId", "stepId"]),

	paymentPlans: defineTable({
		stripeSubscriptionId: v.string(),
		leadId: v.id("leads"),
		installments: v.number(),
		paidCount: v.number(),
		amountPerInstallmentCents: v.number(),
		createdAt: v.number(),
		completedAt: v.optional(v.number()),
	}).index("by_subscription", ["stripeSubscriptionId"]),

	notificationLogs: defineTable({
		type: v.union(
			v.literal("email_confirmation"),
			v.literal("email_reminder"),
			v.literal("email_host_notif"),
			v.literal("email_cancellation"),
			v.literal("email_reschedule"),
			v.literal("email_invitation"),
			v.literal("email_abandoned_lead"),
			v.literal("email_sequence"),
		),
		bookingId: v.optional(v.id("bookings")),
		leadId: v.optional(v.id("leads")),
		recipient: v.string(), // adresse email ou numéro
		status: v.union(v.literal("sent"), v.literal("failed")),
		error: v.optional(v.string()),
		sentAt: v.number(),
	})
		.index("by_date", ["sentAt"])
		.index("by_booking", ["bookingId"])
		.index("by_lead", ["leadId"]),
});
