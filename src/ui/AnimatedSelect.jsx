import React, { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from './primitives.jsx';
import './AnimatedControls.css';
const textOf = children => Children.toArray(children).map(child => isValidElement(child) ? textOf(child.props.children) : String(child)).join('');
// Popups are anchored locally; no fixed portal or ancestor scrollIntoView.
export default function AnimatedSelect({ children, options, value, defaultValue, onChange, name, id, disabled, className = '', searchable = false, placeholder = 'Choose an option', ...props }) {
  const generatedId=useId(),listId=`${generatedId}-list`,anchor=useRef(null),trigger=useRef(null),panel=useRef(null),search=useRef(null),optionRefs=useRef([]);
  const [internal,setInternal]=useState(defaultValue??''),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0),[geometry,setGeometry]=useState({});
  const items=useMemo(()=>options||Children.toArray(children).filter(isValidElement).map(child=>({value:String(child.props.value??textOf(child.props.children)),label:textOf(child.props.children),disabled:Boolean(child.props.disabled)})),[children,options]);
  const selected=String(value??internal),chosen=items.find(item=>String(item.value)===selected)||items[0];
  const filtered=items.filter(item=>String(item.label).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  useEffect(()=>{if(!open)return;const outside=event=>{if(!anchor.current?.contains(event.target))setOpen(false);};const resize=()=>setOpen(false);document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};},[open]);
  useLayoutEffect(()=>{
    if(!open||!trigger.current)return;
    const box=trigger.current.getBoundingClientRect(),dialog=trigger.current.closest('dialog')?.getBoundingClientRect();
    const topEdge=Math.max(12,dialog?dialog.top+14:12),bottomEdge=Math.min(innerHeight-12,dialog?dialog.bottom-14:innerHeight-12);
    const below=bottomEdge-box.bottom-8,above=box.top-topEdge-8,upward=below<Math.min(180,filtered.length*43+(searchable?52:10))&&above>below;
    const width=Math.min(Math.max(box.width,180),innerWidth-28,dialog?dialog.width-28:Infinity),rightEdge=Math.min(innerWidth-14,dialog?dialog.right-14:innerWidth-14);
    setGeometry({position:'absolute',left:Math.min(0,rightEdge-box.left-width),width,maxHeight:Math.max(88,Math.min(280,upward?above:below)),...(upward?{bottom:'calc(100% + 7px)'}:{top:'calc(100% + 7px)'})});
    setActive(Math.max(0,filtered.findIndex(item=>String(item.value)===String(chosen?.value))));if(searchable)search.current?.focus({preventScroll:true});
  },[open]);
  useEffect(()=>{if(!open)return;const item=optionRefs.current[active],container=panel.current;if(!item||!container)return;const a=item.getBoundingClientRect(),b=container.getBoundingClientRect();if(a.bottom>b.bottom)container.scrollTop+=a.bottom-b.bottom;else if(a.top<b.top)container.scrollTop-=b.top-a.top;},[active,open]);
  function choose(item){if(!item||item.disabled)return;const next=String(item.value);setInternal(next);onChange?.({target:{value:next,name},currentTarget:{value:next,name}});setOpen(false);setQuery('');trigger.current?.focus({preventScroll:true});}
  function move(direction){if(!filtered.length)return;let index=active;for(let count=0;count<filtered.length;count++){index=(index+direction+filtered.length)%filtered.length;if(!filtered[index].disabled)break;}setActive(index);}
  function keydown(event){
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open)setOpen(true);else move(event.key==='ArrowDown'?1:-1);}
    else if(event.key==='Home'&&open&&event.target!==search.current){event.preventDefault();setActive(Math.max(0,filtered.findIndex(item=>!item.disabled)));}
    else if(event.key==='End'&&open&&event.target!==search.current){event.preventDefault();for(let index=filtered.length-1;index>=0;index--)if(!filtered[index].disabled){setActive(index);break;}}
    else if(event.key==='Enter'||(event.key===' '&&event.target!==search.current)){event.preventDefault();if(open)choose(filtered[active]);else setOpen(true);}
    else if(event.key==='Tab')setOpen(false);
    else if(!searchable&&event.key.length===1&&!event.ctrlKey&&!event.metaKey){const index=filtered.findIndex(item=>!item.disabled&&String(item.label).toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));if(index>=0)open?setActive(index):choose(filtered[index]);}
  }
  return <span ref={anchor} className={`animated-select ${open?'select-open':''} ${className}`}><input type="hidden" name={name} value={chosen?.value??''}/><Tooltip content={props['aria-label']||chosen?.label||placeholder} disabled={open}><button {...props} ref={trigger} id={id} type="button" className="animated-select-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} onKeyDown={keydown} onClick={()=>{setQuery('');setOpen(!open);}}><span>{chosen?.label||placeholder}</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></Tooltip>{open&&<div ref={panel} className="animated-select-panel" style={geometry} onKeyDown={keydown}>{searchable&&<div className="animated-select-search"><input ref={search} value={query} placeholder="Search options..." aria-label="Search options" onChange={event=>{setQuery(event.target.value);setActive(0);}}/></div>}<div className="animated-select-options" role="listbox" id={listId} aria-label={props['aria-label']||name||'Options'}>{filtered.length?filtered.map((item,index)=><button key={item.value} ref={element=>{optionRefs.current[index]=element;}} type="button" role="option" aria-selected={String(item.value)===String(chosen?.value)} disabled={item.disabled} tabIndex={index===active?0:-1} className={`animated-select-option ${index===active?'highlighted':''}`} onPointerMove={()=>setActive(index)} onClick={()=>choose(item)}><span>{item.label}</span>{String(item.value)===String(chosen?.value)&&<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>}</button>):<p className="animated-select-empty">No matching options.</p>}</div></div>}</span>;
}
