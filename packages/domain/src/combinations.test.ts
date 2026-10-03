import { describe, expect, it } from 'vitest';
import { CATEGORIES, NO_HIDING, pricing } from './__fixtures__/catalogue';
import { combinationSignature, type LineInput, priceOrderLines } from './combinations';
import { resolveMenu } from './menu';

const orderable = resolveMenu(CATEGORIES, NO_HIDING, pricing()).orderable;
const bowl = orderable.get('bowl')!;

const sel = (groupId: string, optionId: string, portionSizeId?: string) => ({ groupId, optionId, portionSizeId });
const paneerWith = (rice: string, size = 'regular', ...sides: string[]) => [
  sel('protein', 'paneer'),
  sel('rice', rice, size),
  ...sides.map((s) => sel('sides', s)),
];

describe('priceOrderLines — the brief’s example', () => {
  it('10 paneer rice bowls: 6 with brown rice + 4 with jeera rice', () => {
    const result = priceOrderLines(
      [
        {
          dishId: 'bowl',
          quantity: 10,
          combinations: [
            { quantity: 6, selections: paneerWith('brown') },
            { quantity: 4, selections: paneerWith('jeera') },
          ],
        },
      ],
      orderable,
    );
    expect(result.issues).toEqual([]);
    const [line] = result.lines;
    // brown: (650 + 80 + 40) × 6 = 4620 ; jeera: (650 + 80 + 0) × 4 = 2920
    expect(line!.combinations.map((c) => [c.label, c.unitPriceCents, c.totalCents])).toEqual([
      ['Paneer · Brown rice (Regular)', 770, 4620],
      ['Paneer · Jeera rice (Regular)', 730, 2920],
    ]);
    expect(line!.lineTotalCents).toBe(7540);
    expect(result.totalCents).toBe(7540);
  });
});

describe('priceOrderLines — rules', () => {
  const run = (lines: LineInput[]) => priceOrderLines(lines, orderable);
  const codes = (lines: LineInput[]) => run(lines).issues.map((i) => [i.code, i.path.join('.')]);

  it('rejects combination quantities that do not add up (CAT-08)', () => {
    expect(
      codes([{ dishId: 'bowl', quantity: 10, combinations: [{ quantity: 6, selections: paneerWith('brown') }, { quantity: 3, selections: paneerWith('jeera') }] }]),
    ).toEqual([['COMBINATION_QTY_MISMATCH', 'lines.0.combinations']]);
  });

  it('rejects a combination missing a required group (CAT-09)', () => {
    expect(codes([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections: [sel('protein', 'tofu')] }] }])).toEqual([
      ['REQUIRED_GROUP_MISSING', 'lines.0.combinations.0.selections'],
    ]);
  });

  it('allows skipping optional groups and up to max selections in a multi-select group', () => {
    expect(run([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections: paneerWith('jeera', 'large', 'raita', 'chutney') }] }]).issues).toEqual([]);
    expect(codes([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections: paneerWith('jeera', 'large', 'raita', 'chutney', 'salad') }] }])).toEqual([
      ['TOO_MANY_SELECTIONS', 'lines.0.combinations.0.selections'],
    ]);
  });

  it('rejects two options in a single-choice group', () => {
    const selections = [sel('protein', 'paneer'), sel('protein', 'tofu'), sel('rice', 'jeera', 'regular')];
    expect(codes([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections }] }])).toEqual([
      ['TOO_MANY_SELECTIONS', 'lines.0.combinations.0.selections'],
    ]);
  });

  it('rejects options from another group or not offered (e.g. unpriced)', () => {
    const selections = [sel('protein', 'raita'), sel('rice', 'jeera', 'regular'), sel('nope', 'paneer')];
    expect(codes([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections }] }])).toEqual([
      ['OPTION_UNAVAILABLE', 'lines.0.combinations.0.selections.0'],
      ['OPTION_NOT_IN_GROUP', 'lines.0.combinations.0.selections.2'],
      ['REQUIRED_GROUP_MISSING', 'lines.0.combinations.0.selections'],
    ]);
  });

  it('requires a valid size in a portion group and forbids sizes elsewhere (CAT-05)', () => {
    const noSize = [sel('protein', 'paneer'), sel('rice', 'jeera')];
    const badSize = [sel('protein', 'paneer'), sel('rice', 'jeera', 'xl')];
    const sizeOnPlainGroup = [sel('protein', 'paneer', 'large'), sel('rice', 'jeera', 'regular')];
    for (const selections of [noSize, badSize, sizeOnPlainGroup]) {
      expect(run([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections }] }]).issues[0]?.code).toBe('PORTION_INVALID');
    }
  });

  it('adds the portion extra charge to the option price', () => {
    const [line] = run([{ dishId: 'bowl', quantity: 2, combinations: [{ quantity: 2, selections: paneerWith('brown', 'large') }] }]).lines;
    // 650 + 80 + 40 + 120 = 890 per bowl
    expect(line!.combinations[0]).toMatchObject({ unitPriceCents: 890, totalCents: 1780, label: 'Paneer · Brown rice (Large)' });
    expect(line!.combinations[0]!.selections[1]).toMatchObject({ optionUnitPriceCents: 40, portionExtraCents: 120, portionName: 'Large' });
  });

  it('treats the same choices in a different order as the same combination (duplicate)', () => {
    const a = [sel('rice', 'jeera', 'regular'), sel('protein', 'paneer')];
    const b = [sel('protein', 'paneer'), sel('rice', 'jeera', 'regular')];
    expect(combinationSignature(bowl, a)).toBe(combinationSignature(bowl, b));
    expect(codes([{ dishId: 'bowl', quantity: 2, combinations: [{ quantity: 1, selections: a }, { quantity: 1, selections: b }] }])).toEqual([
      ['DUPLICATE_COMBINATION', 'lines.0.combinations.1'],
    ]);
  });

  it('allows one line per dish only', () => {
    const line = { dishId: 'jamun', quantity: 1, combinations: [{ quantity: 1, selections: [] }] };
    expect(codes([line, line])).toEqual([['DUPLICATE_DISH_LINE', 'lines.1.dishId']]);
  });

  it('rejects dishes not on the employee’s menu', () => {
    expect(codes([{ dishId: 'ghost', quantity: 1, combinations: [{ quantity: 1, selections: [] }] }])).toEqual([['NOT_ON_MENU', 'lines.0.dishId']]);
  });

  it('enforces the minimum order quantity per line (A-22)', () => {
    expect(codes([{ dishId: 'biryani', quantity: 1, combinations: [{ quantity: 1, selections: [] }] }])).toEqual([
      ['BELOW_MIN_ORDER_QTY', 'lines.0.quantity'],
    ]);
  });

  it('rejects zero, negative and fractional quantities', () => {
    expect(codes([{ dishId: 'jamun', quantity: 0, combinations: [{ quantity: 0, selections: [] }] }])).toEqual([
      ['VALIDATION_FAILED', 'lines.0.quantity'],
      ['VALIDATION_FAILED', 'lines.0.combinations.0.quantity'],
    ]);
    expect(run([{ dishId: 'jamun', quantity: 1.5, combinations: [{ quantity: 1.5, selections: [] }] }]).issues[0]?.code).toBe('VALIDATION_FAILED');
  });

  it('prices a dish with no option groups as a single combination', () => {
    const [line] = run([{ dishId: 'jamun', quantity: 3, combinations: [{ quantity: 3, selections: [] }] }]).lines;
    expect(line!.combinations[0]).toMatchObject({ signature: '', label: '', unitPriceCents: 180, totalCents: 540 });
  });

  it('combines allergens (union) and dietary tags (intersection)', () => {
    const [tofu] = run([{ dishId: 'bowl', quantity: 1, combinations: [{ quantity: 1, selections: [sel('protein', 'tofu'), sel('rice', 'jeera', 'regular')] }] }]).lines;
    expect(tofu!.combinations[0]!.allergenIds).toEqual(['dairy', 'soy']);
    // Dish is veg+gf (dairy base), so even with vegan options the combination is not vegan.
    expect(tofu!.combinations[0]!.dietaryTagIds).toEqual(['gf', 'veg']);
  });

  it('collects every problem across lines instead of stopping at the first', () => {
    const issues = run([
      { dishId: 'bowl', quantity: 2, combinations: [{ quantity: 1, selections: [] }] },
      { dishId: 'biryani', quantity: 1, combinations: [{ quantity: 1, selections: [] }] },
    ]).issues;
    expect(issues.map((i) => i.message)).toEqual([
      'Combination quantities must add up to 2 (1 allocated).',
      '"Choose your protein" is required.',
      '"Choose your rice" is required.',
      'Hyderabadi Biryani Handi has a minimum order of 2.',
    ]);
  });
});

describe('priceOrderLines — totals always reconcile (property test)', () => {
  // Deterministic pseudo-random generator so the test is reproducible.
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % n;
  };
  const proteins = ['paneer', 'tofu', 'chickpeas'];
  const rices = ['jeera', 'brown'];
  const sizes = ['regular', 'large'];
  const sides = [[], ['raita'], ['chutney'], ['raita', 'salad']];

  it('Σ combinations = line and Σ lines = order for 200 random valid orders', () => {
    for (let run = 0; run < 200; run += 1) {
      const used = new Set<string>();
      const combos = [];
      const count = 1 + rand(4);
      for (let c = 0; c < count; c += 1) {
        const choice = [sel('protein', proteins[rand(3)]!), sel('rice', rices[rand(2)]!, sizes[rand(2)]!), ...sides[rand(4)]!.map((s) => sel('sides', s))];
        const sig = combinationSignature(bowl, choice);
        if (used.has(sig)) continue;
        used.add(sig);
        combos.push({ quantity: 1 + rand(5), selections: choice });
      }
      const qty = combos.reduce((s, c) => s + c.quantity, 0);
      const lines: LineInput[] = [
        { dishId: 'bowl', quantity: qty, combinations: combos },
        { dishId: 'jamun', quantity: 1 + rand(3), combinations: [] },
      ];
      lines[1] = { ...lines[1]!, combinations: [{ quantity: lines[1]!.quantity, selections: [] }] };

      const result = priceOrderLines(lines, orderable);
      expect(result.issues).toEqual([]);
      for (const line of result.lines) {
        expect(line.combinations.reduce((s, c) => s + c.totalCents, 0)).toBe(line.lineTotalCents);
        for (const c of line.combinations) {
          const unit = line.dishUnitPriceCents + c.selections.reduce((s, x) => s + x.optionUnitPriceCents + x.portionExtraCents, 0);
          expect(c.unitPriceCents).toBe(unit);
          expect(c.totalCents).toBe(unit * c.quantity);
          expect(Number.isSafeInteger(c.totalCents)).toBe(true);
        }
      }
      expect(result.lines.reduce((s, l) => s + l.lineTotalCents, 0)).toBe(result.totalCents);
    }
  });
});
