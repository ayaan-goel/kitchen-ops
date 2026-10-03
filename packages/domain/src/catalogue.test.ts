import { describe, expect, it } from 'vitest';
import { formatMultiplierBps, parseMultiplierToBps, validateGroupConfig, type GroupConfigInput } from './catalogue';

const names: Record<string, string> = { paneer: 'Paneer', chicken: 'Chicken', rice: 'Jeera rice', reg: 'Regular', large: 'Large' };
const sizes: Record<string, string[]> = { rice: ['reg', 'large'], paneer: [], chicken: [] };
const ctx = {
  optionName: (id: string) => names[id],
  sizeName: (id: string) => names[id],
  optionSizes: (id: string) => new Set(sizes[id] ?? []),
};
const group = (over: Partial<GroupConfigInput> = {}): GroupConfigInput => ({
  name: 'Protein',
  isRequired: true,
  maxSelections: 1,
  usesPortions: false,
  optionIds: ['paneer', 'chicken'],
  portionSizeIds: [],
  ...over,
});

describe('validateGroupConfig', () => {
  it('accepts a normal group and a portion group whose options come in every size', () => {
    expect(validateGroupConfig([group(), group({ name: 'Rice', optionIds: ['rice'], usesPortions: true, portionSizeIds: ['reg', 'large'] })], ctx)).toEqual([]);
  });

  it('rejects an option that is not sold in one of the group sizes, naming it', () => {
    const issues = validateGroupConfig([group({ usesPortions: true, portionSizeIds: ['reg'] })], ctx);
    expect(issues[0]).toMatchObject({ code: 'PORTION_INVALID', path: ['groups', 0, 'optionIds', 0] });
    expect(issues[0]!.message).toMatch(/Paneer isn't offered in Regular/);
  });

  it('rejects duplicate names, empty groups, and impossible max selections', () => {
    const codes = validateGroupConfig([group(), group({ name: ' protein ' }), group({ name: 'Empty', optionIds: [] }), group({ name: 'Max', maxSelections: 3 })], ctx).map((i) => i.path.join('.'));
    expect(codes).toEqual(expect.arrayContaining(['groups.1.name', 'groups.2.optionIds', 'groups.3.maxSelections']));
  });

  it('rejects sizes on a group that does not use portions, and a portion group without sizes', () => {
    expect(validateGroupConfig([group({ portionSizeIds: ['reg'] })], ctx)[0]?.code).toBe('PORTION_INVALID');
    expect(validateGroupConfig([group({ name: 'Rice', optionIds: ['rice'], usesPortions: true })], ctx)[0]?.code).toBe('PORTION_INVALID');
  });
});

describe('tier multipliers', () => {
  it.each([
    ['2.4', 24_000],
    ['x2.4', 24_000],
    ['×1.15', 11_500],
    ['+15%', 11_500],
    ['-10%', 9_000],
    ['+12.5%', 11_250],
    ['1', 10_000],
  ])('parses %s as %i bps', (input, bps) => {
    expect(parseMultiplierToBps(input)).toBe(bps);
  });

  it.each(['', 'abc', '-100%', '0', '15%'])('rejects %s', (input) => {
    expect(parseMultiplierToBps(input)).toBeNull();
  });

  it('formats bps for display', () => {
    expect(formatMultiplierBps(24_000)).toBe('×2.4');
    expect(formatMultiplierBps(11_500)).toBe('×1.15 (+15%)');
    expect(formatMultiplierBps(9_000)).toBe('×0.9 (−10%)');
  });
});
