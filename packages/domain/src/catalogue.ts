/**
 * Catalogue save-time rules for a dish's option groups (CAT-04, CAT-05, BR-07). The same
 * constraints are re-checked per order by `validateLines`; checking them when the dish is saved
 * keeps broken configurations out of the menu in the first place.
 */

export interface GroupConfigInput {
  name: string;
  isRequired: boolean;
  maxSelections: number;
  usesPortions: boolean;
  optionIds: readonly string[];
  portionSizeIds: readonly string[];
}

export interface GroupConfigIssue {
  path: (string | number)[];
  code: 'VALIDATION_FAILED' | 'PORTION_INVALID';
  message: string;
}

export interface GroupConfigContext {
  optionName: (optionId: string) => string | undefined;
  sizeName: (portionSizeId: string) => string | undefined;
  /** Sizes an option is sold in (has an OptionPortion row for). */
  optionSizes: (optionId: string) => ReadonlySet<string>;
}

export function validateGroupConfig(groups: readonly GroupConfigInput[], ctx: GroupConfigContext): GroupConfigIssue[] {
  const issues: GroupConfigIssue[] = [];
  const names = new Map<string, number>();
  groups.forEach((g, gi) => {
    const at = (field: string | number, ...rest: (string | number)[]) => ['groups', gi, field, ...rest];
    const name = g.name.trim();
    if (!name) issues.push({ path: at('name'), code: 'VALIDATION_FAILED', message: 'Give the group a name.' });
    const key = name.toLowerCase();
    if (name && names.has(key)) issues.push({ path: at('name'), code: 'VALIDATION_FAILED', message: `Another group is already called "${name}".` });
    names.set(key, gi);

    if (g.optionIds.length === 0) issues.push({ path: at('optionIds'), code: 'VALIDATION_FAILED', message: 'Add at least one option.' });
    if (new Set(g.optionIds).size !== g.optionIds.length) issues.push({ path: at('optionIds'), code: 'VALIDATION_FAILED', message: 'An option is listed twice.' });
    g.optionIds.forEach((id, oi) => {
      if (!ctx.optionName(id)) issues.push({ path: at('optionIds', oi), code: 'VALIDATION_FAILED', message: 'Unknown option.' });
    });

    if (!Number.isInteger(g.maxSelections) || g.maxSelections < 1) {
      issues.push({ path: at('maxSelections'), code: 'VALIDATION_FAILED', message: 'Allow at least one selection.' });
    } else if (g.optionIds.length > 0 && g.maxSelections > g.optionIds.length) {
      issues.push({ path: at('maxSelections'), code: 'VALIDATION_FAILED', message: `At most ${g.optionIds.length} — the group has only ${g.optionIds.length} options.` });
    }

    if (g.usesPortions) {
      if (g.portionSizeIds.length === 0) {
        issues.push({ path: at('portionSizeIds'), code: 'PORTION_INVALID', message: 'Choose the sizes this group is sold in.' });
      }
      if (new Set(g.portionSizeIds).size !== g.portionSizeIds.length) {
        issues.push({ path: at('portionSizeIds'), code: 'PORTION_INVALID', message: 'A size is listed twice.' });
      }
      g.optionIds.forEach((optionId, oi) => {
        const sold = ctx.optionSizes(optionId);
        const missing = g.portionSizeIds.filter((s) => !sold.has(s));
        if (missing.length > 0 && ctx.optionName(optionId)) {
          issues.push({
            path: at('optionIds', oi),
            code: 'PORTION_INVALID',
            message: `${ctx.optionName(optionId)} isn't offered in ${missing.map((s) => ctx.sizeName(s) ?? 'that size').join(', ')}. Add the size on the option first, or remove it from this group.`,
          });
        }
      });
    } else if (g.portionSizeIds.length > 0) {
      issues.push({ path: at('portionSizeIds'), code: 'PORTION_INVALID', message: 'Turn on sizes for this group, or remove the sizes.' });
    }
  });
  return issues;
}

/**
 * Parses a tier multiplier typed by staff: "2.4" or "x2.4" (times) or "+15%" / "-10%"
 * (percent change). Returns basis points (×10 000) or null. No floating-point maths.
 */
export function parseMultiplierToBps(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '').toLowerCase();
  const pct = /^([+-])(\d{1,4})(?:\.(\d{1,2}))?%$/.exec(s);
  if (pct) {
    const hundredths = Number(pct[2]) * 100 + Number((pct[3] ?? '').padEnd(2, '0') || '0'); // percent × 100 = bps
    const bps = pct[1] === '+' ? 10_000 + hundredths : 10_000 - hundredths;
    return bps > 0 ? bps : null;
  }
  const times = /^[x×]?(\d{1,3})(?:\.(\d{1,4}))?$/.exec(s);
  if (times) {
    const bps = Number(times[1]) * 10_000 + Number((times[2] ?? '').padEnd(4, '0') || '0');
    return bps > 0 ? bps : null;
  }
  return null;
}

/** 24000 → "×2.4", 11500 → "×1.15 (+15%)". */
export function formatMultiplierBps(bps: number): string {
  const whole = Math.floor(bps / 10_000);
  const frac = String(bps % 10_000).padStart(4, '0').replace(/0+$/, '');
  const times = `×${whole}${frac ? `.${frac}` : ''}`;
  const pct = bps - 10_000;
  if (pct !== 0 && Math.abs(pct) <= 9_900 && pct % 100 === 0) return `${times} (${pct > 0 ? '+' : '−'}${Math.abs(pct) / 100}%)`;
  return times;
}
