/**
 * Reprise d'une demande de mission de développement : logique pure.
 *
 * Le formulaire ne conserve qu'un identifiant de demande par projet, dans
 * `sessionStorage`. Après un rechargement, cet identifiant survit alors que
 * l'état React est reparti de zéro — et c'est exactement là que l'ancien
 * formulaire transformait un envoi en relecture sans le dire.
 *
 * Les trois décisions à ce sujet sont isolées ici, hors React et hors DOM, pour
 * qu'elles soient vérifiables sans navigateur :
 *
 *  1. `classifyTrackingValue` — ce que vaut la valeur stockée.
 *  2. `planIntent` — ce qu'une action de l'opérateur déclenche réellement.
 *  3. `describeReceipt` / `OUTCOME_MESSAGES` — ce qui est annoncé en retour.
 *
 * Invariant central : une intention de création n'est **jamais** convertie en
 * relecture. Si une demande résiduelle existe, le plan est un refus explicite
 * qui demande à l'opérateur de trancher — reprendre ou commencer une nouvelle
 * mission. Aucun contrat serveur n'est modifié ici : les mêmes `GET` et `POST`
 * sont appelés, avec les mêmes charges.
 */

/** RFC 9562, versions 1 à 8 : même forme que l'identifiant émis par le client. */
export const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Le suivi est cloisonné par projet : un autre workspace ne se reprend pas. */
export function developmentMissionTrackingKey(workspaceId: string): string {
  return `hq:development-mission:${workspaceId}`;
}

export type TrackingValueKind = "empty" | "resumable" | "corrupt";

export function classifyTrackingValue(value: string | null | undefined): TrackingValueKind {
  if (value === null || value === undefined || value === "") return "empty";
  return REQUEST_ID_PATTERN.test(value) ? "resumable" : "corrupt";
}

/** `unavailable` : `sessionStorage` a levé — ni lecture ni écriture possibles. */
export type TrackingState = "ok" | "corrupt" | "unavailable";

export type SessionState = {
  tracking: TrackingState;
  /** Identifiant que cette instance possède : émis par une création, ou adopté par une reprise. */
  activeRequestId: string | null;
  /** Identifiant réhydraté du stockage, en attente d'une décision explicite. */
  pendingRequestId: string | null;
  /**
   * Identifiant que l'opérateur a explicitement mis de côté pour commencer une
   * nouvelle mission. Il quitte le suivi de session, mais reste relisible tant
   * que la page vit : c'est la seule voie restante vers son reçu.
   */
  releasedRequestId: string | null;
  /** Une charge a déjà été figée pour l'identifiant actif. */
  hasFrozenPayload: boolean;
  /** Les quatre champs sont remplis. */
  inputComplete: boolean;
};

export type Intent = "create" | "retry" | "read-active" | "read-pending" | "read-released";

export type RefusalReason =
  | "tracking-unavailable"
  | "tracking-corrupt"
  | "resume-decision-required"
  | "submission-already-active"
  | "input-incomplete"
  | "nothing-to-resume";

export type Plan =
  /** Émettre un nouvel identifiant, figer la charge, `POST`. */
  | { kind: "create" }
  /** Réutiliser l'identifiant actif et sa charge, `POST`. */
  | { kind: "retry"; requestId: string }
  /** `GET` sur un identifiant connu. */
  | { kind: "read"; requestId: string }
  /** Rien à relire : répondre `not_found` sans aucune requête. */
  | { kind: "read-empty" }
  | { kind: "refused"; reason: RefusalReason };

/**
 * Ce qu'une action déclenche, sans effet de bord.
 *
 * L'ordre des règles est le contrat : le suivi d'abord (il conditionne toute
 * écriture), la décision de reprise ensuite (elle protège la saisie), puis
 * l'état de la demande.
 */
export function planIntent(state: SessionState, intent: Intent): Plan {
  const reading = intent.startsWith("read-");

  // Une relecture reste possible dès qu'un identifiant est connu : c'est une
  // requête sans écriture, et c'est la seule voie vers le reçu.
  if (reading) {
    const target =
      intent === "read-pending"
        ? state.pendingRequestId
        : intent === "read-released"
          ? state.releasedRequestId
          : (state.activeRequestId ?? state.pendingRequestId);
    if (target) return { kind: "read", requestId: target };
    if (state.tracking === "unavailable") return { kind: "refused", reason: "tracking-unavailable" };
    if (state.tracking === "corrupt") return { kind: "refused", reason: "tracking-corrupt" };
    return { kind: "read-empty" };
  }

  // Écritures : le suivi doit être exploitable, sinon l'identifiant émis serait
  // perdu au premier rechargement et le reçu deviendrait invérifiable.
  if (state.tracking === "unavailable") return { kind: "refused", reason: "tracking-unavailable" };
  if (state.tracking === "corrupt") return { kind: "refused", reason: "tracking-corrupt" };

  // Le défaut corrigé : une demande résiduelle ne détourne plus l'envoi.
  if (state.pendingRequestId !== null && state.activeRequestId === null) {
    return { kind: "refused", reason: "resume-decision-required" };
  }

  if (intent === "create") {
    if (state.activeRequestId !== null) {
      return { kind: "refused", reason: "submission-already-active" };
    }
    if (!state.inputComplete) return { kind: "refused", reason: "input-incomplete" };
    return { kind: "create" };
  }

  // retry
  if (state.activeRequestId === null) return { kind: "refused", reason: "nothing-to-resume" };
  if (!state.hasFrozenPayload && !state.inputComplete) {
    return { kind: "refused", reason: "input-incomplete" };
  }
  return { kind: "retry", requestId: state.activeRequestId };
}

/**
 * Jeton porté par une requête en vol.
 *
 * Le projet actif peut changer pendant un envoi lent. L'état de session est
 * alors réinitialisé, mais la réponse de l'ancien projet arrive après : sans ce
 * jeton elle s'appliquerait au nouveau et afficherait le reçu d'un autre
 * workspace. La requête est donc appariée à la génération de session et à la
 * clé de suivi qui l'ont émise.
 */
export type SessionTicket = { generation: number; trackingKey: string };

export function isResponseApplicable(issued: SessionTicket, current: SessionTicket): boolean {
  return issued.generation === current.generation && issued.trackingKey === current.trackingKey;
}

export const DEVELOPMENT_MISSION_ENDPOINT = "/api/missions/development";

export function developmentReceiptUrl(requestId: string): string {
  return `${DEVELOPMENT_MISSION_ENDPOINT}?requestId=${encodeURIComponent(requestId)}`;
}

/**
 * La méthode HTTP qu'un plan déclenche, ou `null` quand il n'émet aucune
 * requête. C'est ici que se lit l'invariant corrigé : un plan issu d'une
 * intention de création ne vaut jamais `GET`.
 */
export function requestMethodFor(plan: Plan): "GET" | "POST" | null {
  if (plan.kind === "read") return "GET";
  if (plan.kind === "create" || plan.kind === "retry") return "POST";
  return null;
}

/**
 * Charge d'admission. Le jeu de champs est celui que le serveur valide dans
 * `developmentInputSchema` (`src/server/missions/development-mission.ts`) ;
 * aucun contrat n'est ajouté ici.
 */
export type DevelopmentPayload = {
  requestId: string;
  title: string;
  objective: string;
  scope: string;
  acceptanceCriteria: string;
};

/** Les seules valeurs de `status` qu'un corps de réponse peut porter. */
export const ACCEPTED_BODY_STATUSES = [
  "saved",
  "disabled",
  "unavailable",
  "outcome_unknown",
  "not_found",
  "conflict",
];

export type DevelopmentOutcome =
  | {
      status: "saved";
      missionId: string;
      title: string;
      missionStatus: string;
      updatedAt: string;
      executionRequested: false;
    }
  | {
      status:
        | "disabled"
        | "unavailable"
        | "outcome_unknown"
        | "not_found"
        | "conflict"
        | "request_denied"
        | "invalid_request";
    };

/**
 * L'appel réseau et la validation du corps, isolés de React.
 *
 * Toute issue non reconnue devient `unavailable` pour une relecture et
 * `outcome_unknown` pour une écriture : une tentative d'écriture dont l'issue
 * est inconnue ne doit jamais se présenter comme un échec propre.
 */
export async function performDevelopmentRequest(input: {
  method: "GET" | "POST";
  requestId: string;
  payload: DevelopmentPayload | null;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<DevelopmentOutcome> {
  const readOnly = input.method === "GET";
  // Native browser fetch cannot use the transport input as its receiver.
  const fetchImpl = input.fetchImpl;

  try {
    const response = await fetchImpl(
      readOnly ? developmentReceiptUrl(input.requestId) : DEVELOPMENT_MISSION_ENDPOINT,
      {
        method: input.method,
        cache: "no-store",
        signal: input.signal,
        ...(readOnly
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input.payload),
            }),
      },
    );
    const body = await response.json();

    if (
      (response.status === 403 && body?.status === "request_denied") ||
      (response.status === 400 && body?.status === "invalid_request")
    ) {
      return { status: body.status };
    }
    if (!response.ok || !ACCEPTED_BODY_STATUSES.includes(body?.status)) throw Error();
    if (
      body.status === "saved" &&
      (typeof body.missionId !== "string" ||
        typeof body.title !== "string" ||
        body.executionRequested !== false)
    ) {
      throw Error();
    }
    return body as DevelopmentOutcome;
  } catch {
    return { status: readOnly ? "unavailable" : "outcome_unknown" };
  }
}

/** Comment le reçu affiché a été obtenu. */
export type ReceiptOrigin = "created" | "retried" | "read";

/**
 * Un reçu relu et une création ne s'annoncent pas pareil.
 *
 * `retried` ne prétend pas savoir laquelle des deux a eu lieu : l'admission est
 * idempotente par identifiant de demande, donc le client ne peut pas
 * distinguer « créée à l'instant » de « déjà présente ». La formulation couvre
 * les deux sans inventer.
 */
export function describeReceipt(origin: ReceiptOrigin, title: string): string {
  if (origin === "read") return `Reçu existant relu : ${title}. Aucun envoi, aucune création.`;
  if (origin === "retried") {
    return `Enregistrement confirmé sous le même identifiant : ${title}. Aucune seconde mission.`;
  }
  return `Mission enregistrée : ${title}. Aucun agent lancé.`;
}

export const OUTCOME_MESSAGES: Record<string, string> = {
  disabled: "Création durable désactivée sur cette instance.",
  unavailable: "Stockage durable indisponible. Vérifie le reçu avant toute reprise.",
  outcome_unknown:
    "Résultat incertain. Aucun nouvel identifiant ni renvoi automatique : vérifie le reçu.",
  not_found:
    "Aucune mission retrouvée avec cet identifiant. Tu peux réessayer le même contenu explicitement.",
  conflict: "Cet identifiant correspond à une autre intention. Aucun écrasement effectué.",
  request_denied:
    "Origine refusée avant écriture. Corrige la connexion puis réessaie avec le même identifiant.",
  invalid_request: "Requête invalide, aucune écriture demandée.",
};

export const REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  "tracking-unavailable":
    "Suivi de session indisponible : aucun envoi ni reprise. Ta saisie reste à l’écran.",
  "tracking-corrupt":
    "Suivi de session illisible pour ce projet : reprise impossible. Ta saisie n’a pas été envoyée.",
  "resume-decision-required":
    "Une demande de cette session n’est pas clôturée. Choisis de la reprendre ou de commencer une nouvelle mission : ta saisie n’a pas été envoyée.",
  "submission-already-active":
    "Une demande est déjà en cours sous cet identifiant. Aucune seconde création.",
  "input-incomplete": "Complète les quatre champs avant d’envoyer.",
  "nothing-to-resume": "Aucune demande à reprendre pour ce projet.",
};

/** Les seuls états après lesquels un renvoi sous le même identifiant est offert. */
export const RETRYABLE_STATUSES = ["not_found", "request_denied", "invalid_request", "disabled"];
