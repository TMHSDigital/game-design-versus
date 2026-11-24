import { z } from 'zod';

export const FLAGS = [
  'has_combat', 'has_melee', 'has_ranged', 'has_stealth', 'has_avatar', 'has_vehicles',
  'has_progression', 'has_economy', 'has_crafting', 'has_building', 'has_survival_needs',
  'has_management', 'has_narrative', 'is_multiplayer', 'is_online', 'is_competitive', 'is_f2p',
  'is_vr', 'is_realtime', 'is_run_based', 'is_strategy', 'is_puzzle', 'is_racing', 'is_fighting',
  'is_sports', 'is_horror', 'is_card', 'is_rhythm', 'is_idle', 'is_party',
] as const;
export const FlagSchema = z.enum(FLAGS);
export type Flag = z.infer<typeof FlagSchema>;

export const MODULES = [
  'frame', 'experience', 'genre', 'camera_controls', 'loop', 'combat', 'movement', 'progression',
  'economy', 'crafting_building_survival', 'management', 'world', 'narrative', 'failure_difficulty',
  'multiplayer', 'presentation', 'meta', 'strategy', 'puzzle', 'racing', 'fighting', 'sports',
  'horror', 'card', 'idle', 'party', 'rhythm',
] as const;
export const ModuleIdSchema = z.enum(MODULES);
export type ModuleId = z.infer<typeof ModuleIdSchema>;

export type Lean = 'A' | 'B' | 'center';
export type Expr = {
  all?: Expr[];
  any?: Expr[];
  not?: Expr;
  flag?: Flag;
  axis?: string;
  in?: string[];
  lean?: Lean;
};
export const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z
    .object({
      all: z.array(ExprSchema).optional(),
      any: z.array(ExprSchema).optional(),
      not: ExprSchema.optional(),
      flag: FlagSchema.optional(),
      axis: z.string().optional(),
      in: z.array(z.string()).optional(),
      lean: z.enum(['A', 'B', 'center']).optional(),
    })
    .strict(),
);

export const AXIS_KINDS = ['bipolar', 'categorical', 'multi', 'rank', 'gate'] as const;
export type AxisKind = (typeof AXIS_KINDS)[number];

export const PoleSchema = z
  .object({ id: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), summary: z.string().min(1), noExemplar: z.boolean().optional() })
  .strict();
export type Pole = z.infer<typeof PoleSchema>;

export const AxisSchema = z
  .object({
    id: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
    module: ModuleIdSchema,
    label: z.string().min(1),
    kind: z.enum(AXIS_KINDS),
    poles: z.array(PoleSchema).min(2).max(25),
    appliesWhen: ExprSchema.optional(),
    sets: z.array(z.object({ flag: FlagSchema, when: ExprSchema }).strict()).optional(),
    importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    tier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    questionTemplate: z.string().min(1),
    header: z.string().min(1).max(12),
    keep: z.number().int().positive().optional(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if ((a.kind === 'bipolar' || a.kind === 'gate') && a.poles.length !== 2) {
      ctx.addIssue({ code: 'custom', message: `${a.id}: ${a.kind} axes need exactly 2 poles` });
    }
    // Spec: categorical and rank axes carry 3 to 12 poles. Multi axes may carry up to 25 because
    // genre.family (18) and genre.form (25) are specified with longer lists.
    const max = a.kind === 'multi' ? 25 : 12;
    if ((a.kind === 'categorical' || a.kind === 'multi' || a.kind === 'rank') && (a.poles.length < 3 || a.poles.length > max)) {
      ctx.addIssue({ code: 'custom', message: `${a.id}: ${a.kind} axes need 3 to ${max} poles` });
    }
    if (a.kind === 'rank' && !a.keep) ctx.addIssue({ code: 'custom', message: `${a.id}: rank axes need keep` });
    if (!a.id.startsWith(a.id.split('.')[0] + '.')) ctx.addIssue({ code: 'custom', message: 'bad id' });
  });
export type Axis = z.infer<typeof AxisSchema>;

export const ModuleSchema = z
  .object({
    id: ModuleIdSchema,
    label: z.string(),
    appliesWhen: ExprSchema.optional(),
    gates: z.array(z.string()).optional(),
  })
  .strict();
export type ModuleDef = z.infer<typeof ModuleSchema>;

export const OntologySchema = z
  .object({ version: z.number().int(), modules: z.array(ModuleSchema), axes: z.array(AxisSchema) })
  .strict();
export type Ontology = z.infer<typeof OntologySchema>;

export const ArchetypeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    label: z.string(),
    genreFlags: z.array(FlagSchema),
    profile: z.record(z.string(), z.union([z.number().int().min(-2).max(2), z.string(), z.array(z.string())])),
    exemplars: z.array(z.string()).min(1),
  })
  .strict();
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const TensionSchema = z
  .object({
    id: z.string(),
    when: ExprSchema,
    severity: z.enum(['info', 'warn', 'risk']),
    message: z.string(),
    probe: z.string(),
  })
  .strict();
export type Tension = z.infer<typeof TensionSchema>;

export const ERAS = ['pre2000', '2000s', '2010s', '2020s'] as const;
export const ComparisonOptionSchema = z
  .object({
    pole: z.string(),
    game: z.string().min(1),
    year: z.number().int().min(1970).max(2030).optional(),
    how: z.string().min(1).max(160),
  })
  .strict();
export const ComparisonSchema = z
  .object({
    id: z.string().regex(/^cmp\.[a-z_]+\.[a-z_]+\.[a-z0-9-]+$/),
    axis: z.string(),
    options: z.array(ComparisonOptionSchema).min(2).max(3),
    tags: z
      .object({
        genres: z.array(z.string()),
        platforms: z.array(z.string()),
        era: z.enum(ERAS),
        indie: z.boolean(),
      })
      .strict(),
    sources: z.array(z.object({ url: z.string().url(), note: z.string().optional() }).strict()).min(1),
    verification: z
      .object({
        status: z.enum(['verified', 'unverified']),
        checkedAt: z.string(),
        by: z.enum(['seed', 'claude-code']),
      })
      .strict(),
    note: z.string().optional(),
  })
  .strict();
export type Comparison = z.infer<typeof ComparisonSchema>;
export type ComparisonOption = z.infer<typeof ComparisonOptionSchema>;

export const BINS = [-2, -1, 0, 1, 2] as const;
export const BLEND_POLE = 'blend';

export function eraOf(year: number): (typeof ERAS)[number] {
  if (year < 2000) return 'pre2000';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return '2020s';
}

export function isBinary(axis: Axis): boolean {
  return axis.kind === 'bipolar' || axis.kind === 'gate';
}
