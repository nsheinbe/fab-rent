import { suppliers, type Category } from './catalog';
export type Brief = {
  id: string; title: string; description: string; quantity: number; process: string;
  material: string; dimensions: string; finish: string; destination: string; target: string;
  requirements: string; files: File[]; supplierIds: string[]; kind: 'custom' | 'wholesale';
  catalog?: { productId: string; variant: string; sample: boolean };
};
export type Offer = {
  id: string; supplier: string; quantity: number; unitCents: number; toolingCents: number;
  shippingCents: number; inspectionCents: number; leadDays: number; validUntil: string;
  specification: 'Matches brief' | 'Changes proposed'; exclusions: string; notes: string;
};
export type Question = { id: string; author: string; text: string };
export type Project = { brief: Brief; example: boolean; offers: Offer[]; questions: Question[]; selectedOffer?: string; responses?: Record<string,string> };
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const subtotal = (o: Offer) => o.quantity * o.unitCents + o.toolingCents + o.shippingCents + o.inspectionCents;
export function parseCents(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('Enter a nonnegative dollar amount with up to two decimal places.');
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const comparable = (offer: Offer, quantity: number) => offer.quantity === quantity && offer.specification === 'Matches brief' && offer.exclusions.trim() === 'Taxes excluded';
export const sampleProject: Project = {
  example: true,
  brief: { id: 'sample-brackets', title: 'Anodized aluminum mounting brackets', description: 'A production run of mounting brackets for an indoor sensor enclosure.', quantity: 1000, process: 'Metal fabrication', material: '6061 aluminum', dimensions: '60 × 40 × 3 mm; general tolerance ±0.2 mm', finish: 'Clear anodized', destination: 'Los Angeles, CA', target: '2026-11-13', requirements: 'Finish and dimensional inspection included. Ship the full run together. Quote tooling separately.', files: [], supplierIds: ['precision','metalworks'], kind: 'custom' },
  offers: [
    { id: 'gl', supplier: 'Great Lakes Precision', quantity: 1000, unitCents: 425, toolingCents: 85000, shippingCents: 28000, inspectionCents: 18000, leadDays: 28, validUntil: '2026-10-01', specification: 'Matches brief', exclusions: 'Taxes excluded', notes: 'Anodizing included. First article approval before the production run.' },
    { id: 'km', supplier: 'Keystone Metalworks', quantity: 1000, unitCents: 389, toolingCents: 120000, shippingCents: 42000, inspectionCents: 18000, leadDays: 21, validUntil: '2026-10-01', specification: 'Matches brief', exclusions: 'Taxes excluded', notes: 'Anodizing included. Dedicated fixture included in tooling costs.' },
    { id: 'cm', supplier: 'Cascade Manufacturing · example', quantity: 1000, unitCents: 480, toolingCents: 45000, shippingCents: 25000, inspectionCents: 20000, leadDays: 35, validUntil: '2026-10-01', specification: 'Matches brief', exclusions: 'Taxes excluded', notes: 'Anodizing included. Inspection report supplied with shipment.' },
  ],
  questions: [{ id: 'initial', author: 'Great Lakes Precision · example', text: 'Should we apply the ±0.2 mm tolerance before or after anodizing? We have assumed after finishing in this example quote.' }],
};
export function suggestProcesses(description: string): { category: Category; reason: string }[] {
  const text = description.toLowerCase();
  if (/cotton|fabric|apparel|sew|textile|shirt|linen/.test(text)) return [{ category: 'Textiles & apparel', reason: 'Cut-and-sew partners may suit the fabric or apparel in your brief.' }];
  if (/circuit|pcb|electronic|board/.test(text)) return [{ category: 'Electronics', reason: 'Electronics assembly partners can discuss board and component requirements.' }];
  if (/plastic|nylon|abs|mold/.test(text)) return [{ category: 'Plastics & molding', reason: 'Ask about prototyping versus tooling based on quantity and part geometry.' }];
  if (/box|packag|carton|paper/.test(text)) return [{ category: 'Packaging', reason: 'Packaging suppliers can review structure, print, and sample requirements.' }];
  if (/aluminum|metal|steel|bracket|enclosure|machin/.test(text)) return [{ category: 'Metal fabrication', reason: 'Cutting and bending may suit sheet parts such as brackets and enclosures.' }, { category: 'CNC machining', reason: 'Milling or turning may suit solid parts with detailed features. Drawings determine fit.' }];
  return [];
}
export function suggestedSuppliers(brief: Pick<Brief, 'description'|'process'|'material'|'title'>) {
  const categories = brief.process === 'Need advice' ? suggestProcesses(`${brief.title} ${brief.description} ${brief.material}`).map(s => s.category) : [brief.process];
  return suppliers.filter(s => categories.includes(s.category));
}
export function briefText(b: Brief) {
  return `FAB.RENT — SOURCING DRAFT\nNot sent. Design preview only.\n\nProject: ${b.title}\nType: ${b.kind}\nQuantity: ${b.quantity}\nProcess: ${b.process}\nMaterial: ${b.material || 'Needs advice'}\nDimensions: ${b.dimensions || 'To be confirmed'}\nFinish: ${b.finish || 'To be confirmed'}\nDestination: ${b.destination}\nTarget delivery: ${b.target || 'Flexible'}\n\n${b.description}\n\nRequirements: ${b.requirements || 'To be confirmed'}\n\nAttachments (not included in this text export): ${b.files.map(f => f.name).join(', ') || 'None'}\nExample supplier IDs: ${b.supplierIds.join(', ') || 'Not selected'}\n`;
}
export function downloadDraft(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], {type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export type Product = { id: string; name: string; supplierId: string; category: Category; image: string; description: string; unit: string; minimum: number; stock: number; sampleCents: number; tiers: { minimum: number; cents: number }[]; variants: string[] };
export const products: Product[] = [
 { id: 'aluminum-kit', name: 'Aluminum mounting components', supplierId: 'precision', category: 'CNC machining', image:'metal', description:'Example standard aluminum components for mounting and assembly projects. Confirm the dimensioned drawing before ordering.', unit:'unit', minimum:25, stock:2000, sampleCents:3000, tiers:[{minimum:25,cents:2200},{minimum:100,cents:1850},{minimum:500,cents:1620}], variants:['Natural aluminum','Clear anodized'] },
 { id: 'pcb', name: 'PCB connector boards', supplierId:'circuits', category:'Electronics', image:'circuits', description:'Illustrative connector board catalog. Pinout and electrical specifications must be confirmed with the manufacturer.', unit:'board', minimum:50, stock:5000, sampleCents:1500, tiers:[{minimum:50,cents:890},{minimum:250,cents:725},{minimum:1000,cents:610}], variants:['Standard layout','Compact layout'] },
 { id:'cotton', name:'Cotton canvas fabric', supplierId:'textiles', category:'Textiles & apparel', image:'textiles', description:'Example 10 oz cotton canvas, 60 inches wide, for soft goods and apparel sampling. Colors are illustrative.', unit:'yard', minimum:100, stock:3000, sampleCents:1200, tiers:[{minimum:100,cents:950},{minimum:500,cents:795},{minimum:1000,cents:680}], variants:['Natural','Olive'] },
];
export function productUnitCents(p: Product, quantity: number) { return [...p.tiers].reverse().find(t => quantity >= t.minimum)?.cents ?? p.tiers[0]!.cents; }
export const capacity = (id: string) => ({ accepting: !['polymers'].includes(id), updated: 'Sep 10, 2026', available: id === 'precision' ? 'Prototype slots in 2–3 weeks' : id === 'metalworks' ? 'Small production runs in 3 weeks' : id === 'polymers' ? 'Next opening to be confirmed' : 'New projects considered', note: 'Example supplier-reported availability. Confirm dates during quoting.' });
