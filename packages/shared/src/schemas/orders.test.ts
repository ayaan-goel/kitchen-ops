import { describe, expect, it } from 'vitest';
import { createOrderSchema, orderListQuerySchema } from './orders';

const id = '01920000-0000-7000-8000-000000000001';

describe('createOrderSchema', () => {
  it('accepts a well-formed order and trims notes', () => {
    const parsed = createOrderSchema.parse({
      intent: 'PLACE',
      employeeId: id,
      deliveryDate: '2026-10-07',
      deliveryTime: '12:30',
      notes: '  ring reception  ',
      lines: [{ dishId: id, quantity: 2, combinations: [{ quantity: 2, selections: [{ groupId: id, optionId: id }] }] }],
    });
    expect(parsed.notes).toBe('ring reception');
  });

  it('rejects bad dates, times and quantities with field paths', () => {
    const result = createOrderSchema.safeParse({
      intent: 'PLACE',
      employeeId: id,
      deliveryDate: '2026-02-30',
      deliveryTime: '25:00',
      lines: [{ dishId: id, quantity: 0, combinations: [] }],
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['deliveryDate', 'deliveryTime', 'lines.0.quantity', 'lines.0.combinations']));
  });
});

describe('orderListQuerySchema', () => {
  it('coerces paging, normalises a single status to a list and parses booleans', () => {
    const q = orderListQuerySchema.parse({ page: '2', status: 'PLACED', invoiced: 'false' });
    expect(q).toMatchObject({ page: 2, pageSize: 25, status: ['PLACED'], invoiced: false, sort: 'deliveryDate:desc' });
  });
});
