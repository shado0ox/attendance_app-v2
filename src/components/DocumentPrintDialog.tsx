import { useCallback, useEffect, useRef, useState } from 'react';

export function useDocumentPrint(companyId:string) {
  const [html,setHtml]=useState('');
  const printDocument=async(doc:{id:number})=>{
    try {
      const response=await fetch('/api/electronic-documents/'+doc.id+'/print?companyId='+encodeURIComponent(companyId));
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'تعذر تحميل المستند');
      setHtml(result.finalHtml);
    } catch(error:any){alert(error.message||'تعذر تحميل المستند');}
  };
  const closePrint=useCallback(()=>setHtml(''),[]);
  return {html,printDocument,closePrint};
}

export default function DocumentPrintDialog({html,onClose}:{html:string;onClose:()=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    // Android/TWA back closes the preview instead of leaving an orphan print window.
    history.pushState({documentPreview:true},'',location.href);
    const back=()=>onClose();
    window.addEventListener('popstate',back);
    document.addEventListener('keydown',close);
    return ()=>{
      document.body.style.overflow=previous;
      window.removeEventListener('popstate',back);
      document.removeEventListener('keydown',close);
      if(history.state?.documentPreview)history.back();
    };
  },[onClose]);
  const download=async()=>{
    setBusy(true);setError('');
    try {
      const body=frame.current?.contentDocument?.body;
      if(!body)throw new Error('انتظر تحميل المستند');
      await frame.current!.contentDocument!.fonts.ready;
      await Promise.all(Array.from(body.querySelectorAll<HTMLImageElement>('img')).map((img:HTMLImageElement)=>img.decode().catch(()=>undefined)));
      const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
      const canvas=await html2canvas(body,{scale:1.5,backgroundColor:'#ffffff',windowWidth:794,width:794});
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      const width=178, pageHeight=265, sliceHeight=Math.floor(pageHeight*canvas.width/width);
      // Slice the image so long reasons print on multiple A4 pages without truncation.
      for(let top=0,page=0;top<canvas.height;top+=sliceHeight,page++) {
        if(page)pdf.addPage();
        const part=document.createElement('canvas');part.width=canvas.width;part.height=Math.min(sliceHeight,canvas.height-top);
        part.getContext('2d')!.drawImage(canvas,0,top,canvas.width,part.height,0,0,canvas.width,part.height);
        pdf.addImage(part.toDataURL('image/png'),'PNG',16,16,width,part.height*width/part.width);
      }
      pdf.save('permission-document.pdf');
    } catch(e:any){setError(e.message||'تعذر حفظ PDF؛ جرّب زر الطباعة من المتصفح');}
    finally{setBusy(false);}
  };
  return <div role="dialog" aria-modal="true" aria-label="معاينة وطباعة المستند" dir="rtl" className="fixed inset-0 z-[150] bg-slate-100 flex flex-col">
    <header className="shrink-0 bg-white border-b p-3 flex flex-wrap items-center gap-2" style={{paddingTop:'max(12px, env(safe-area-inset-top))'}}>
      <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">رجوع / إغلاق</button>
      <button disabled={!ready||busy} onClick={()=>{frame.current?.contentWindow?.focus();frame.current?.contentWindow?.print();}} className="bg-sky-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">طباعة</button>
      <button disabled={!ready||busy} onClick={()=>void download()} className="border rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy?'جاري إنشاء PDF…':'حفظ PDF'}</button>
      <span className="text-xs text-slate-500">لو الطباعة لا تفتح داخل التطبيق، احفظ PDF ثم اطبعه من الهاتف.</span>
      {error&&<p role="alert" className="w-full text-sm text-rose-600">{error}</p>}
    </header>
    <div className="flex-1 min-h-0 overflow-auto"><iframe ref={frame} title="نسخة المستند للطباعة" sandbox="allow-same-origin allow-modals" srcDoc={html} onLoad={()=>setReady(true)} className="border-0 bg-white h-full min-h-[600px] w-[794px] mx-auto"/></div>
  </div>;
}
