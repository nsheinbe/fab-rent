import { describe, expect, it } from 'vitest';
import { filterSuppliers } from '@/lib/manufacturing/catalog';
describe('manufacturing buyer search', () => {
  it('matches production scale and common buyer terms', () => {
    expect(filterSuppliers({ query: 'small batch' }).map(s => s.id)).toEqual(['circuits', 'textiles', 'packaging']);
    expect(filterSuppliers({ query: 'CNC manufacturer' }).map(s => s.id)).toEqual(['precision']);
    expect(filterSuppliers({ query: 'prototype' }).map(s => s.id)).toEqual(['precision', 'metalworks']);
  });
  it('normalizes state names and hyphenated materials', () => {
    expect(filterSuppliers({ query: 'Michigan' }).map(s => s.id)).toEqual(['precision']);
    expect(filterSuppliers({ query: 'North Carolina' }).map(s => s.id)).toEqual(['textiles']);
    expect(filterSuppliers({ query: 'stainless-steel' }).map(s => s.id)).toEqual(['metalworks']);
  });
  it('combines production constraints', () => {
    expect(filterSuppliers({ query: 'aluminum', region: 'West', smallBatch: true }).map(s => s.id)).toEqual(['circuits']);
    expect(filterSuppliers({ category: 'Electronics', fastLead: true })).toEqual([]);
    expect(filterSuppliers({ fastLead: true }).map(s => s.id)).toEqual(['precision', 'metalworks']);
  });
  it('returns an empty state for unsupported requests', () => {
    expect(filterSuppliers({ query: 'semiconductor wafer foundry' })).toEqual([]);
    expect(filterSuppliers({ query: '  ' })).toHaveLength(6);
  });
});
