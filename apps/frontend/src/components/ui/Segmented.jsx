import './segmented.css';

export default function Segmented({options,value,onChange,label,dark=false,className=''}){
 return <div className={`lg segm ${dark?'segm-dk':''} ${className}`} role="tablist" aria-label={label}>
  {options.map(o=><button key={o.value} type="button" role="tab" aria-selected={o.value===value} tabIndex={o.value===value?0:-1} onKeyDown={e=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const index=options.findIndex(item=>item.value===o.value),next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowRight'?1:-1)+options.length)%options.length;onChange(options[next].value);e.currentTarget.parentElement.querySelectorAll('[role=tab]')[next]?.focus();}} className="seg" style={{flexGrow:o.weight??1}} onClick={()=>onChange(o.value)}>{o.label}</button>)}
 </div>;
}
