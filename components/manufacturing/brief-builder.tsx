"use client";
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { categories, suppliers } from '@/lib/manufacturing/catalog';
import { suggestProcesses, suggestedSuppliers, type Brief } from '@/lib/manufacturing/sourcing';
export function LocalAttachment({ file, onRemove }: { file: File; onRemove?:()=>void }) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const u=URL.createObjectURL(file); queueMicrotask(()=>setUrl(u)); return()=>URL.revokeObjectURL(u);},[file]);
  const isImage=/^image\/(png|jpeg|webp)$/.test(file.type);
  return <div className="fab-attachment">{isImage && url ? <img src={url} alt={`Local attachment: ${file.name}`} /> : <Icon name="file" size={25}/>}<div><strong>{file.name}</strong><small>{Math.ceil(file.size/1024)} KB · local to this tab</small></div>{url && <a href={url} download={file.name}>Download</a>}{onRemove && <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}><Icon name="close" size={18}/></button>}</div>;
}
export default function BriefBuilder({ initial, onChange, onCreate }: { initial: Brief; onChange:(b:Brief)=>void; onCreate:(b:Brief)=>void }) {
  const [review,setReview]=useState(false);
  const [error,setError]=useState('');
  const [b,setB]=useState(initial);
  const update=(patch:Partial<Brief>)=>{const next={...b,...patch};setB(next);onChange(next);};
  const suggestions=suggestProcesses(`${b.title} ${b.description} ${b.material}`);
  const suggestionsForSuppliers=suggestedSuppliers(b);
  const matches=suppliers.filter(s=>b.supplierIds.includes(s.id)||suggestionsForSuppliers.some(m=>m.id===s.id));
  const missing=[!b.dimensions && 'Dimensions and tolerances',!b.finish && 'Finish',!b.material && 'Material',b.files.length===0 && 'A drawing or reference image'].filter(Boolean);
  function filesAdded(list:FileList|null) {
    if(!list)return; const next=[...b.files]; const issues:string[]=[];
    for(const f of Array.from(list)) {
      if(!/\.(pdf|png|jpe?g|webp|step|stp|stl|dxf)$/i.test(f.name)){issues.push(`${f.name}: unsupported file type.`);continue;}
      if(!f.size || f.size>10*1024*1024){issues.push(`${f.name}: select a nonempty file under 10 MB.`);continue;}
      if(next.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))continue;
      if(next.length>=5 || next.reduce((sum,x)=>sum+x.size,0)+f.size>25*1024*1024){issues.push('Limit: 5 files and 25 MB total.');continue;}
      next.push(f);
    }
    update({files:next});setError(issues.join(' '));
  }
  return <div className="fab-workspace fab-brief-builder">
    <div className="fab-form-progress"><span className={!review?'active':''}>1. Describe your project</span><span>→</span><span className={review?'active':''}>2. Review & find a fit</span></div>
    {!review ? <form className="fab-form" onSubmit={e=>{e.preventDefault();if(!b.title.trim()||b.description.trim().length<15||!b.destination.trim()){setError('Add a project title, a description of at least 15 characters, and a delivery destination. Blank spaces do not count.');return;}update({title:b.title.trim(),description:b.description.trim(),destination:b.destination.trim()});setError('');setReview(true);}}>
      <label className="fab-full">What would you like to make?<input required maxLength={140} value={b.title} onChange={e=>update({title:e.target.value})} placeholder="e.g. A metal enclosure for my sensor"/></label>
      <label className="fab-full">Describe the result you need<textarea required minLength={15} maxLength={6000} rows={3} value={b.description} onChange={e=>update({description:e.target.value})} placeholder="What will it do? Where will it be used? Plain language is fine."/></label>
      <label>Quantity<input type="number" required min={1} max={10000000} step={1} value={b.quantity||''} onChange={e=>update({quantity:Number(e.target.value)})}/></label>
      <label>Manufacturing process<select value={b.process} onChange={e=>update({process:e.target.value,supplierIds:[]})}><option>Need advice</option>{categories.slice(1).map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Material · optional<input maxLength={160} value={b.material} onChange={e=>update({material:e.target.value})} placeholder="Tell us, or leave open for advice"/></label>
      <label>Finish · optional<input maxLength={160} value={b.finish} onChange={e=>update({finish:e.target.value})} placeholder="e.g. Clear anodized"/></label>
      <label className="fab-full">Dimensions & tolerances · optional<input maxLength={300} value={b.dimensions} onChange={e=>update({dimensions:e.target.value})} placeholder="e.g. 60 × 40 × 3 mm; supplier to advise on tolerance"/></label>
      <label>Delivery destination<input required maxLength={150} value={b.destination} onChange={e=>update({destination:e.target.value})} placeholder="City, state or ZIP"/></label>
      <label>Target delivery · optional<input type="date" value={b.target} min={new Date().toLocaleDateString('en-CA')} onChange={e=>update({target:e.target.value})}/></label>
      <label className="fab-full">Quality or certification requirements · optional<textarea rows={2} maxLength={2000} value={b.requirements} onChange={e=>update({requirements:e.target.value})} placeholder="Testing, inspection, documentation, or other project requirements"/></label>
      <div className="fab-full"><label className="fab-file-zone"><Icon name="file" size={24}/><span>Add drawings, photos, or CAD files</span><small>PDF, PNG, JPG, WEBP, STEP, STL, DXF · 10 MB per file</small><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.step,.stp,.stl,.dxf" onChange={e=>{filesAdded(e.target.files);e.target.value='';}}/></label><p className="fab-muted">Files stay in this tab. They are not uploaded, analyzed, or shared.</p>{error&&<p className="fab-error" role="alert">{error}</p>}{b.files.map((f,i)=><LocalAttachment key={`${f.name}-${f.lastModified}-${i}`} file={f} onRemove={()=>update({files:b.files.filter((_,j)=>j!==i)})}/>)}</div>
      <div className="fab-form-actions fab-full"><span className="fab-muted">No technical vocabulary required.</span><button className="fab-button fab-dark" type="submit">Review my brief <Icon name="chevron-right" size={17}/></button></div>
    </form> : <div className="fab-brief-review">
      <span className="fab-eyebrow">YOUR SOURCING BRIEF</span><h3>{b.title}</h3><p>{b.quantity.toLocaleString()} units · {b.destination}</p><div className="fab-notice"><Icon name="info" size={18}/><span>These suggestions use keywords in your brief. A manufacturer must confirm the right process, feasibility, and pricing.</span></div>
      <h4>Processes to discuss</h4>{b.process!=='Need advice'?<p>You selected <strong>{b.process}</strong>. Confirm it against your drawing with each supplier.</p>:suggestions.length?suggestions.map(s=><div className="fab-suggestion" key={s.category}><div><strong>{s.category}</strong><p>{s.reason}</p></div><button className="fab-button fab-outline" onClick={()=>update({process:s.category,supplierIds:[]})}>Choose</button></div>):<p className="fab-muted">We do not have enough detail to suggest a process. You can still create a draft and ask for guidance.</p>}
      {missing.length>0&&<div className="fab-brief-checklist"><h4>Questions to resolve before a firm quote</h4>{missing.map(x=><p key={String(x)}><Icon name="message" size={15}/>{x}</p>)}</div>}
      <h4>Example manufacturers to consider</h4>{matches.length?matches.map(s=><label key={s.id} className="fab-supplier-choice"><input type="checkbox" checked={b.supplierIds.includes(s.id)} onChange={()=>update({supplierIds:b.supplierIds.includes(s.id)?b.supplierIds.filter(x=>x!==s.id):[...b.supplierIds,s.id]})}/><span><strong>{s.name}</strong><small>{s.category} · {s.location} · {suggestionsForSuppliers.some(m=>m.id===s.id)?'fit not yet confirmed':'outside the suggested process; review or remove'}</small></span></label>):<p className="fab-muted">No matching supplier in the example catalog. Select one later.</p>}
      <div className="fab-form-actions"><button className="fab-button fab-outline" onClick={()=>setReview(false)}>Edit brief</button><button className="fab-button fab-dark" onClick={()=>onCreate(b)}>Create project draft <Icon name="chevron-right" size={17}/></button></div>
    </div>}
  </div>;
}
