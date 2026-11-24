import axesJson from '../data/axes.json';
import archetypesJson from '../data/archetypes.json';
import tensionsJson from '../data/tensions.json';
import { COMPARISON_FILES } from '../data/comparisons/index';
import {
  ArchetypeSchema,
  ComparisonSchema,
  OntologySchema,
  TensionSchema,
  type Archetype,
  type Axis,
  type Comparison,
  type ModuleDef,
  type Ontology,
  type Tension,
} from './ontology';
import { z } from 'zod';

export type Knowledge = {
  ontology: Ontology;
  axes: Axis[];
  axisById: Map<string, Axis>;
  modules: ModuleDef[];
  moduleById: Map<string, ModuleDef>;
  archetypes: Archetype[];
  tensions: Tension[];
  /** Every comparison in the library, verified or not. */
  allComparisons: Comparison[];
  /** Comparisons the server may serve (verified, or all when GDV_ALLOW_UNVERIFIED=1). */
  comparisons: Comparison[];
  comparisonsByAxis: Map<string, Comparison[]>;
  comparisonById: Map<string, Comparison>;
  /** Which file each comparison came from (module file name). */
  fileOf: Map<string, string>;
  /** Comparisons that failed schema validation and were dropped (validate-data reports these). */
  loadErrors: string[];
};

export type RawData = {
  ontology: unknown;
  archetypes: unknown;
  tensions: unknown;
  comparisonFiles: Record<string, unknown>;
};

export function rawData(): RawData {
  return { ontology: axesJson, archetypes: archetypesJson, tensions: tensionsJson, comparisonFiles: COMPARISON_FILES };
}

export function buildKnowledge(raw: RawData, opts: { allowUnverified?: boolean } = {}): Knowledge {
  const ontology = OntologySchema.parse(raw.ontology);
  const archetypes = z.array(ArchetypeSchema).parse(raw.archetypes);
  const tensions = z.array(TensionSchema).parse(raw.tensions);
  const allComparisons: Comparison[] = [];
  const fileOf = new Map<string, string>();
  const loadErrors: string[] = [];
  for (const [file, list] of Object.entries(raw.comparisonFiles)) {
    if (!Array.isArray(list)) {
      loadErrors.push(`comparisons/${file}.json is not an array`);
      continue;
    }
    list.forEach((item, i) => {
      const r = ComparisonSchema.safeParse(item);
      if (!r.success) {
        const id = (item as { id?: unknown })?.id;
        loadErrors.push(`comparisons/${file}.json[${i}] ${typeof id === 'string' ? id : ''}: ${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
        return;
      }
      allComparisons.push(r.data);
      fileOf.set(r.data.id, file);
    });
  }
  const allow = opts.allowUnverified ?? process.env.GDV_ALLOW_UNVERIFIED === '1';
  const comparisons = allComparisons.filter((c) => allow || c.verification.status === 'verified');
  const comparisonsByAxis = new Map<string, Comparison[]>();
  for (const c of comparisons) {
    const list = comparisonsByAxis.get(c.axis) ?? [];
    list.push(c);
    comparisonsByAxis.set(c.axis, list);
  }
  return {
    ontology,
    axes: ontology.axes,
    axisById: new Map(ontology.axes.map((a) => [a.id, a])),
    modules: ontology.modules,
    moduleById: new Map(ontology.modules.map((m) => [m.id, m])),
    archetypes,
    tensions,
    allComparisons,
    comparisons,
    comparisonsByAxis,
    comparisonById: new Map(allComparisons.map((c) => [c.id, c])),
    fileOf,
    loadErrors,
  };
}

let cached: Knowledge | undefined;
export function knowledge(): Knowledge {
  cached ??= buildKnowledge(rawData());
  return cached;
}
