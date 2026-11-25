/**
 * Engine constants. Values marked SPEC come straight from the product spec. Values marked
 * CALIBRATION are documented deviations needed so the stop rule (overall clarity >= 0.80) is reachable
 * within the question budget; see README "Calibration notes".
 */
export const ENGINE = {
  /** SPEC: likelihood of answering A for each bin [-2,-1,0,+1,+2]. B is the mirror. */
  likA: [0.5, 0.3, 0.14, 0.04, 0.02],
  /** SPEC: likelihood of answering blend. */
  likBlend: [0.05, 0.2, 0.5, 0.2, 0.05],
  /** SPEC: Gaussian sigma for an explicit lean 0-100 (center = lean/25 - 2). */
  leanSigma: 0.6,
  /** SPEC: prior = archetypeWeight * archetype profile + uniformWeight * uniform, at the start. */
  uniformWeight: 0.3,
  /** CALIBRATION: the uniform share decays as the archetype posterior concentrates, down to this floor. */
  uniformFloor: 0.02,
  /** CALIBRATION: mass moved from an archetype's profile bin to its neighbors when smoothing the one-hot. */
  profileSmoothing: 0.1,
  /** Categorical profile: probability on the archetype's pole. */
  categoricalProfileMass: 0.7,
  /** Multi and rank profile: probability that a pole the archetype lists is selected (else 1 - this). */
  multiProfileMass: 0.8,
  /** SPEC: importance multiplier for no_pref answers. */
  noPrefImportance: 0.3,
  /** CALIBRATION: an axis the user answered directly counts as at least this clear. */
  decidedClarityFloor: 0.9,
  /**
   * Stop rule ("brief ready"): frame and gates resolved, every core (importance 3) axis at least stopCore clear,
   * and then either overall clarity >= stopOverall or detailQuestions answers spent on secondary axes. Secondary
   * axes still open at that point become open questions in the brief; the user can keep going.
   */
  stopOverall: 0.8,
  stopCore: 0.6,
  /** CALIBRATION: two rounds of secondary questions once the core is settled. */
  detailQuestions: 8,
  /**
   * CALIBRATION: recommended length. From here the stop is recommended once frame and gates are resolved; core axes
   * still open lead the brief's open questions. Hybrid games whose inferences keep shifting would otherwise run long.
   */
  softQuestions: 48,
  /** Hard cap: stop is recommended after this many questions whatever the state. */
  maxQuestions: 60,
  /** SPEC: selection weights. */
  archetypeEigWeight: 0.5,
  gateBonusPerAxis: 0.15,
  familiarityBonus: 0.1,
  recentGamePenalty: 0.2,
  recentGameWindow: 5,
  sameModulePenalty: 0.15,
  /** SPEC: randomesque selection pool. */
  topK: 3,
  /** SPEC: Elo constants. */
  eloK: 24,
  eloStart: 1500,
  /** Lean thresholds on the posterior mean bin. */
  leanThreshold: 0.6,
  /** Questions per page for categorical, multi and rank axes. */
  pageSize: 4,
  /** Multi and rank axes stop paginating after this many pages; unseen poles count as not selected. */
  maxMultiPages: 2,
  /**
   * A multi or rank pole counts as selected only when its inclusion clears 0.5 by this margin. Inclusion of exactly
   * 0.5 means "no information" (no archetype or answer speaks to the pole), and float noise around it must not decide.
   */
  multiSelectMargin: 0.01,
  /** A skipped axis is not offered again for this many answers. */
  skipCooldown: 5,
  /** An axis answered "Not sure / don't know these games" comes back after this many answers ... */
  unsureCooldown: 2,
  /** ... in plain words (no games) once it got this many such answers. */
  unsurePlainAfter: 1,
  /** After this many such answers the axis is set aside: not asked again, an open question in the brief. */
  unsureDeferAfter: 2,
  /** Score penalty for a comparison featuring a game the user said they do not know. */
  unknownGamePenalty: 0.3,
} as const;

export function isDeterministic(): boolean {
  return process.env.GDV_DETERMINISTIC === '1';
}
