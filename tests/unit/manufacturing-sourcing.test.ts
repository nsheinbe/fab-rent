import { describe, expect, it } from 'vitest';
import { briefText, comparable, parseCents, products, productUnitCents, sampleProject, subtotal, suggestedSuppliers } from '@/lib/manufacturing/sourcing';

describe('manufacturing sourcing decisions', () => {
  it('compares the complete quoted subtotal instead of ranking by unit price', () => {
    expect(sampleProject.offers.map(subtotal)).toEqual([556000, 569000, 570000]);
    expect([...sampleProject.offers].sort((a,b)=>a.unitCents-b.unitCents)[0]?.id).toBe('km');
    expect([...sampleProject.offers].sort((a,b)=>subtotal(a)-subtotal(b))[0]?.id).toBe('gl');
  });
  it('excludes mismatched quantities, proposed changes, and extra exclusions from ranking', () => {
    const offer=sampleProject.offers[0]!;
    expect(comparable(offer,1000)).toBe(true);
    expect(comparable({...offer,exclusions:' Taxes excluded '},1000)).toBe(true);
    expect(comparable({...offer,quantity:500},1000)).toBe(false);
    expect(comparable({...offer,specification:'Changes proposed'},1000)).toBe(false);
    expect(comparable({...offer,exclusions:'Shipping and taxes excluded'},1000)).toBe(false);
  });
  it('parses dollars exactly as integer cents and rejects ambiguous amounts', () => {
    expect(['0','0.01','4.25','18.5','1000000'].map(parseCents)).toEqual([0,1,425,1850,100000000]);
    for (const value of ['-1','1.001','1e3','NaN','','1,000']) expect(()=>parseCents(value)).toThrow();
  });
  it('applies wholesale price tiers at their quantity boundaries', () => {
    expect([25,99,100,499,500,2000].map(q=>productUnitCents(products[0]!,q))).toEqual([2200,2200,1850,1850,1620,1620]);
    expect(productUnitCents(products[2]!,1000)).toBe(680);
  });
  it('offers process advice without inventing a supplier for unsupported requirements', () => {
    expect(suggestedSuppliers({...sampleProject.brief,process:'Need advice'}).map(s=>s.id)).toEqual(['precision','metalworks']);
    expect(suggestedSuppliers({title:'New idea',description:'Needs discussion',material:'',process:'Need advice'})).toEqual([]);
  });
  it('exports a draft and lists attachment names without implying file transfer', () => {
    const text=briefText({...sampleProject.brief,files:[{name:'drawing.step'} as File]});
    expect(text).toContain('Not sent. Design preview only.');
    expect(text).toContain('Attachments (not included in this text export): drawing.step');
    expect(text).toContain('Quantity: 1000');
  });
});
