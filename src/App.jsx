import { useState, useEffect, useCallback } from "react";

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const WEBHOOK_URL         = import.meta.env.VITE_N8N_WEBHOOK_URL         || "";
const LIBRARY_WEBHOOK_URL = import.meta.env.VITE_N8N_LIBRARY_WEBHOOK_URL || "";
const FILL_URL            = import.meta.env.VITE_N8N_FILL_URL            || "";
const MERGE_URL           = import.meta.env.VITE_N8N_MERGE_URL           || "";
const ILOVEPDF_KEY        = import.meta.env.VITE_ILOVEPDF_KEY            || "";

// ── DATA ───────────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { key:"cover",             label:"Cover Page",                      icon:"📄", aiGenerated:false, manual:false, description:"Submittal cover with project details" },
  { key:"tds",               label:"Technical Data Sheet",            icon:"⚙️",  aiGenerated:true,  manual:false, description:"Full product technical specifications" },
  { key:"warranty",          label:"Draft Warranty Certificate",      icon:"🛡️", aiGenerated:true,  manual:false, description:"Manufacturer warranty terms" },
  { key:"origin",            label:"Country of Origin",               icon:"🌐", aiGenerated:true,  manual:false, description:"Declaration of product manufacturing origin" },
  { key:"compliance",        label:"Compliance Statement",            icon:"✅", aiGenerated:true,  manual:false, description:"Standards & spec compliance declaration" },
  { key:"test_cert",         label:"Test Certificate",                icon:"🧪", aiGenerated:true,  manual:false, description:"Product test results & lab certificate" },
  { key:"material_schedule", label:"Material Schedule",               icon:"📋", aiGenerated:true,  manual:false, description:"Itemized material list for project" },
  { key:"previous_approval", label:"Previous Approval",               icon:"📝", aiGenerated:false, manual:true,  description:"Previous client or consultant approval letter", autoKeywords:["approval","approved"] },
  { key:"trade_license",     label:"Trade License",                   icon:"🏢", aiGenerated:false, manual:true,  description:"Company trade license document",                autoKeywords:["trade license","trade licence"] },
  { key:"msds",              label:"Material Safety Data Sheet",      icon:"⚗️", aiGenerated:false, manual:true,  description:"MSDS / safety data for the product",            autoKeywords:["msds","safety data","sds"] },
  { key:"iso_cert",          label:"ISO Certifications & Licenses",   icon:"🏆", aiGenerated:false, manual:true,  description:"ISO certs, quality or product licences",        autoKeywords:["iso","certification"] },
  { key:"vendor_list",       label:"Vendor List",                     icon:"🗂️", aiGenerated:false, manual:true,  description:"Approved vendor / manufacturer list",           autoKeywords:["vendor","vendor list","supplier list"] },
];

const PRESETS = {
  "Municipality":      ["cover","tds","warranty","origin","compliance","material_schedule","previous_approval","iso_cert"],
  "Private Developer": ["cover","tds","warranty","previous_approval","trade_license"],
  "DEWA / Utility":    ["cover","tds","warranty","origin","compliance","test_cert","material_schedule","iso_cert"],
  "Full Package":      DOC_TYPES.map(d=>d.key),
};

const STEPS = ["Project Info","Select Indexes","Generating","Preview & Export"];

// ── THEME ──────────────────────────────────────────────────────────────────────
const C = {
  bg:"#070d1a", card:"#0d1625", card2:"#0a1120",
  border:"#1a3356", accent:"#f59e0b",
  blue:"#60a5fa", green:"#34d399", purple:"#a78bfa",
  text:"#94a3b8", textBright:"#f1f5f9", textDim:"#4b6280",
};
const FF = "'DM Sans', system-ui, sans-serif";
const inputSt = { background:"#0a111e", border:`1px solid ${C.border}`, borderRadius:6, color:C.textBright, padding:"10px 13px", width:"100%", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:FF };
const btnP = { background:C.accent, color:"#000", border:"none", borderRadius:6, padding:"10px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FF };
const btnG = { background:"transparent", color:C.text, border:`1px solid ${C.border}`, borderRadius:6, padding:"10px 18px", fontSize:13, cursor:"pointer", fontFamily:FF };
const lbl  = { color:C.textDim, fontSize:11, fontWeight:700, letterSpacing:"0.09em", textTransform:"uppercase", marginBottom:6, display:"block" };

// ── LIBRARY MODAL ──────────────────────────────────────────────────────────────
function LibraryModal({ allFiles, loading, error, onPick, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = allFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, width:"min(640px,100%)", maxHeight:"80vh", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:22 }}>🗂️</span>
          <div>
            <div style={{ color:C.textBright, fontWeight:700, fontSize:15 }}>Google Drive Library</div>
            <div style={{ color:C.textDim, fontSize:12 }}>{allFiles.length} PDFs available</div>
          </div>
          <div style={{ flex:1 }}/>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.textDim, fontSize:22, cursor:"pointer", lineHeight:1, padding:"0 4px" }}>×</button>
        </div>

        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${C.border}` }}>
          <input type="text" placeholder="Search files…" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputSt, padding:"8px 12px" }} autoFocus/>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
          {loading && <div style={{ textAlign:"center", padding:"48px", color:C.textDim, fontSize:13 }}>Loading Drive files…</div>}
          {error && <div style={{ padding:"16px", background:"#3b0000", border:"1px solid #ef4444", borderRadius:8, color:"#fca5a5", fontSize:13 }}>⚠ {error}<br/><span style={{ fontSize:11, opacity:.7 }}>Make sure the Library workflow is active and VITE_N8N_LIBRARY_WEBHOOK_URL is set.</span></div>}
          {!loading && !error && filtered.length===0 && (
            <div style={{ textAlign:"center", padding:"48px", color:C.textDim, fontSize:13 }}>
              {allFiles.length===0 ? "No PDFs found. Is the Library workflow active?" : "No files match your search."}
            </div>
          )}
          {filtered.map(file => (
            <div key={file.id} onClick={()=>onPick(file)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, cursor:"pointer", border:"1px solid transparent", marginBottom:4, transition:"all .1s" }}
              onMouseEnter={e=>{ e.currentTarget.style.background=C.card2; e.currentTarget.style.borderColor=C.border; }}
              onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="transparent"; }}
            >
              <div style={{ width:36, height:44, background:"#1a0800", border:"1px solid #7c2d0033", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:20 }}>📄</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:C.textBright, fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{file.name}</div>
                <div style={{ color:C.textDim, fontSize:11, marginTop:2 }}>PDF • Google Drive</div>
              </div>
              <a href={file.webViewLink} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                style={{ color:C.blue, fontSize:11, textDecoration:"none", flexShrink:0, padding:"4px 8px", border:`1px solid ${C.blue}33`, borderRadius:4 }}>
                Preview
              </a>
            </div>
          ))}
        </div>

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.border}`, fontSize:12, color:C.textDim }}>
          Click a file to assign it. <strong style={{ color:C.text }}>Files stay in Google Drive</strong> — only the link is saved.
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────────
export default function SubmittalBuilder() {
  const [step, setStep]               = useState(1);
  const [info, setInfo]               = useState({
    projectName:"", client:"", mainContractor:"", consultant:"", location:"",
    productName:"", supplier:"",
    materialSpec:"", dimensions:"", material:"", finish:"",
    productWarranty:"", productList:"",
    date:new Date().toISOString().split("T")[0],
    additionalInfo:""
  });
  const [selected, setSelected]       = useState(new Set(["cover","tds","warranty"]));
  const [generated, setGenerated]     = useState({});
  const [manualFiles, setManualFiles] = useState({});
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [activeDoc, setActiveDoc]     = useState(null);
  const [activePreset, setActivePreset] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState(null);
  const [allFiles, setAllFiles]       = useState([]);
  const [libLoading, setLibLoading]   = useState(false);
  const [libError, setLibError]       = useState("");

  useEffect(() => {
    if (!LIBRARY_WEBHOOK_URL) return;
    setLibLoading(true);
    fetch(LIBRARY_WEBHOOK_URL)
      .then(r=>r.json())
      .then(d=>{
        if (d.files) {
          setAllFiles(d.files);
          // Auto-match files to doc slots by keyword
          const autoMatched = {};
          DOC_TYPES.filter(dt=>dt.manual && dt.autoKeywords).forEach(dt=>{
            const match = d.files.find(f =>
              dt.autoKeywords.some(kw => f.name.toLowerCase().includes(kw.toLowerCase()))
            );
            if (match) autoMatched[dt.key] = match;
          });
          if (Object.keys(autoMatched).length > 0) {
            setManualFiles(prev=>({ ...autoMatched, ...prev }));
          }
        }
      })
      .catch(e=>setLibError(e.message))
      .finally(()=>setLibLoading(false));
  }, []);

  const set    = (f,v) => setInfo(p=>({...p,[f]:v}));
  const toggle = key => { setSelected(p=>{ const n=new Set(p); n.has(key)?n.delete(key):n.add(key); return n; }); setActivePreset(null); };
  const applyPreset = name => { setSelected(new Set(PRESETS[name])); setActivePreset(name); };
  const openLibrary = useCallback(docKey => { setLibraryTarget(docKey); setLibraryOpen(true); }, []);
  const pickFile    = useCallback(file => { setManualFiles(p=>({...p,[libraryTarget]:file})); setLibraryOpen(false); setLibraryTarget(null); }, [libraryTarget]);

  const [merging, setMerging]   = useState(false);
  const [mergeError, setMergeError] = useState("");

  const handleMerge = async () => {
    if (!MERGE_URL) { setMergeError("VITE_N8N_MERGE_URL not set"); return; }
    setMerging(true); setMergeError("");
    try {
      const filledDocs = DOC_TYPES
        .filter(d => d.aiGenerated && selected.has(d.key) && generated[d.key])
        .map(d => ({ docKey: d.key, viewLink: generated[d.key].viewLink }));
      const driveFileIds = DOC_TYPES
        .filter(d => d.manual && selected.has(d.key) && manualFiles[d.key])
        .map(d => ({ docKey: d.key, fileId: manualFiles[d.key].id }));
      const outputName = (info.projectName || "Submittal").replace(/[^a-zA-Z0-9_-]/g,"_") + "_Submittal";
      const res = await fetch(MERGE_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ filledDocs, driveFileIds, outputName, ilovepdfKey: ILOVEPDF_KEY })
      });
      if (!res.ok) throw new Error(`Merge failed: ${res.status}`);
      const data = await res.json();
      if (!data.success || !data.pdfBase64) throw new Error("No PDF returned");
      const blob = new Blob([Uint8Array.from(atob(data.pdfBase64), c=>c.charCodeAt(0))], { type:"application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outputName + ".pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { setMergeError(e.message); }
    finally { setMerging(false); }
  };

  const step1Valid = info.projectName && info.client && info.productName;

  const handleGenerate = async () => {
    const url = FILL_URL || WEBHOOK_URL;
    if (!url) { setError("Webhook URL not set in .env"); return; }
    setLoading(true); setError(""); setStep(3);
    try {
      const res = await fetch(url, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ projectInfo: info, selectedDocs:[...selected] })
      });
      if (!res.ok) throw new Error(`n8n returned ${res.status}`);
      const data = await res.json();
      if (data.success && data.documents) {
        setGenerated(data.documents); setStep(4);
        const firstAi = DOC_TYPES.find(d=>d.aiGenerated&&selected.has(d.key));
        setActiveDoc(firstAi?.key||"cover");
      } else throw new Error("Unexpected response from n8n");
    } catch(e) { setError(e.message); setStep(2); }
    finally { setLoading(false); }
  };

  const exportPDF = () => {
    const win = window.open("","_blank");
    const ordered = DOC_TYPES.filter(d=>selected.has(d.key));
    let html = `<html><head><title>Submittal – ${info.projectName}</title><style>
*{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#222;background:#fff;margin:0;padding:0}
.page{page-break-after:always;padding:48px 56px;min-height:100vh} .page:last-child{page-break-after:auto}
.cover{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:90vh}
.cover h1{font-size:32px;color:#0a1c3b;margin:0 0 8px} .cover h2{font-size:20px;color:#c47a00;margin:0 0 40px;font-weight:500}
.meta{border-top:1px solid #ddd;padding-top:24px;width:360px;text-align:left}
.meta div{display:flex;gap:12px;margin-bottom:10px;font-size:13px} .meta span:first-child{color:#888;width:90px;flex-shrink:0}
.dh{border-bottom:2px solid #0a1c3b;padding-bottom:8px;margin-bottom:24px;display:flex;align-items:center;gap:10px}
.dh h2{margin:0;font-size:18px;color:#0a1c3b} .dc{white-space:pre-wrap;font-size:13px;line-height:1.75;color:#333}
.dr{border:1px solid #1a56db;border-radius:6px;padding:28px;text-align:center;margin-top:8px}
.dr a{color:#1a56db;font-size:14px;font-weight:600}
.ph{border:2px dashed #ccc;border-radius:6px;padding:40px;text-align:center;color:#999;font-size:13px}
@media print{.page{page-break-after:always}}
</style></head><body>`;
    ordered.forEach(doc => {
      html += `<div class="page">`;
      if (doc.key==="cover") {
        html += `<div class="cover"><div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#666;margin-bottom:20px">MATERIAL SUBMITTAL</div>
          <h1>${info.projectName||"[Project Name]"}</h1><h2>${info.productName||"[Product]"}</h2>
          <div class="meta">${[
            ["Client",info.client],
            ["Main Contractor",info.mainContractor||"—"],
            ["Consultant",info.consultant||"—"],
            ["Supplier",info.supplier||"—"],
            ["Location",info.location||"—"],
            ["Date",info.date]
          ].map(([k,v])=>`<div><span>${k}</span><span>${v}</span></div>`).join("")}</div></div>`;
      } else if (doc.aiGenerated && generated[doc.key]) {
        html += `<div class="dh"><span style="font-size:20px">${doc.icon}</span><h2>${doc.label}</h2></div><div class="dc">${generated[doc.key]}</div>`;
      } else if (doc.manual && manualFiles[doc.key]) {
        const f = manualFiles[doc.key];
        html += `<div class="dh"><span style="font-size:20px">${doc.icon}</span><h2>${doc.label}</h2></div>
          <div class="dr">
            <div style="font-size:13px;color:#666;margin-bottom:10px">Google Drive Document</div>
            <div style="font-size:16px;font-weight:700;color:#222;margin-bottom:18px">${f.name}</div>
            <a href="${f.webViewLink}" target="_blank">Open PDF in Google Drive →</a>
            <div style="font-size:11px;color:#999;margin-top:14px">Merge this PDF at this position before final submission</div>
          </div>`;
      } else {
        html += `<div class="dh"><span style="font-size:20px">${doc.icon}</span><h2>${doc.label}</h2></div><div class="ph">[ ${doc.label} ] — No content assigned</div>`;
      }
      html += `</div>`;
    });
    html += `</body></html>`;
    win.document.write(html); win.document.close();
    setTimeout(()=>win.print(), 600);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:FF, color:C.text }}>

      {libraryOpen && <LibraryModal allFiles={allFiles} loading={libLoading} error={libError} onPick={pickFile} onClose={()=>{ setLibraryOpen(false); setLibraryTarget(null); }}/>}

      {/* TOPBAR */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"14px 28px", display:"flex", alignItems:"center", gap:20 }}>
        <div style={{ fontWeight:800, fontSize:17, letterSpacing:"-0.02em", color:C.textBright }}>
          <span style={{ color:C.accent }}>◈</span> SUBMITTAL<span style={{ color:C.textDim, fontWeight:400 }}>.BUILD</span>
        </div>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {STEPS.map((s,i) => {
            const num=i+1, done=step>num, active=step===num;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 12px", borderRadius:4, background:active?`${C.accent}18`:"transparent", border:active?`1px solid ${C.accent}44`:"1px solid transparent" }}>
                  <div style={{ width:20, height:20, borderRadius:"50%", flexShrink:0, background:done?C.green:active?C.accent:C.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:done||active?"#000":C.textDim }}>
                    {done?"✓":num}
                  </div>
                  <span style={{ fontSize:12, fontWeight:active?700:400, color:active?C.accent:done?C.text:C.textDim }}>{s}</span>
                </div>
                {i<STEPS.length-1 && <div style={{ width:18, height:1, background:C.border }}/>}
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {LIBRARY_WEBHOOK_URL && (
            <div style={{ fontSize:11, color:libLoading?C.textDim:allFiles.length>0?C.green:C.textDim, background:C.card, border:`1px solid ${allFiles.length>0?C.green+"44":C.border}`, borderRadius:20, padding:"4px 12px" }}>
              {libLoading ? "Loading Drive…" : `📁 ${allFiles.length} Drive files`}
            </div>
          )}
          <div style={{ fontSize:12, color:C.textDim, background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:"4px 12px" }}>{selected.size} docs</div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"32px 20px" }}>
        {error && <div style={{ background:"#3b0000", border:"1px solid #ef4444", borderRadius:8, padding:"12px 16px", marginBottom:20, fontSize:13, color:"#fca5a5" }}>⚠ {error}</div>}

        {/* STEP 1 */}
        {step===1 && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ color:C.textBright, fontSize:20, fontWeight:700, margin:"0 0 6px" }}>Project Information</h2>
              <p style={{ color:C.textDim, margin:0, fontSize:13 }}>Used to fill all AI documents and cover page.</p>
            </div>

            {/* PROJECT DETAILS */}
            <div style={{ marginBottom:8 }}>
              <div style={{ color:C.textDim, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>Project Details</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  { f:"projectName",    l:"Project Name *",         p:"e.g. Marina Bay Landscaping Phase 2", span:true },
                  { f:"client",         l:"Client *",               p:"e.g. Al Futtaim Group" },
                  { f:"mainContractor", l:"Main Contractor",        p:"e.g. Al Futtaim Construction LLC" },
                  { f:"consultant",     l:"Consultant",             p:"e.g. Atkins Middle East (optional)" },
                  { f:"location",       l:"Project Location",       p:"e.g. Dubai, UAE" },
                  { f:"date",           l:"Submittal Date",         p:"", type:"date" },
                ].map(({ f,l,p,span,type })=>(
                  <div key={f} style={span?{gridColumn:"1/-1"}:{}}>
                    <label style={lbl}>{l}</label>
                    <input type={type||"text"} value={info[f]} onChange={e=>set(f,e.target.value)} placeholder={p} style={inputSt}/>
                  </div>
                ))}
              </div>
            </div>

            {/* PRODUCT DETAILS */}
            <div style={{ marginTop:24, marginBottom:8 }}>
              <div style={{ color:C.textDim, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>Product / Material Details</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  { f:"productName",    l:"Product Name *",         p:"e.g. Porcelain Outdoor Paving 600×600mm", span:true },
                  { f:"supplier",       l:"Supplier / Manufacturer", p:"e.g. Bluestream Trading LLC" },
                  { f:"materialSpec",   l:"Material Specification",  p:"e.g. EN 13748-2, Class R11 anti-slip" },
                  { f:"dimensions",     l:"Dimensions",              p:"e.g. 600×600×20mm" },
                  { f:"material",       l:"Material",                p:"e.g. Porcelain Stoneware" },
                  { f:"finish",         l:"Finish",                  p:"e.g. Matt, Textured" },
                ].map(({ f,l,p,span })=>(
                  <div key={f} style={span?{gridColumn:"1/-1"}:{}}>
                    <label style={lbl}>{l}</label>
                    <input type="text" value={info[f]} onChange={e=>set(f,e.target.value)} placeholder={p} style={inputSt}/>
                  </div>
                ))}
              </div>
            </div>

            {/* WARRANTY & COO */}
            <div style={{ marginTop:24, marginBottom:8 }}>
              <div style={{ color:C.textDim, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>Warranty & Origin</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <label style={lbl}>Product Warranty</label>
                  <input type="text" value={info.productWarranty} onChange={e=>set("productWarranty",e.target.value)} placeholder="e.g. 10 years manufacturer warranty" style={inputSt}/>
                </div>
                <div>
                  <label style={lbl}>Product List <span style={{ color:C.textDim, fontWeight:400, textTransform:"none", letterSpacing:0 }}>(for COO)</span></label>
                  <input type="text" value={info.productList} onChange={e=>set("productList",e.target.value)} placeholder="e.g. Paving tiles, edging, adhesive" style={inputSt}/>
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={lbl}>Additional Details <span style={{ color:C.textDim, fontWeight:400, textTransform:"none", letterSpacing:0 }}>(optional)</span></label>
                  <textarea value={info.additionalInfo} onChange={e=>set("additionalInfo",e.target.value)} placeholder="Color codes, specific standards, certifications, notes for Gemini…" style={{ ...inputSt, height:72, resize:"vertical" }}/>
                </div>
              </div>
            </div>

            <div style={{ marginTop:28, display:"flex", justifyContent:"flex-end" }}>
              <button onClick={()=>setStep(2)} disabled={!step1Valid} style={{ ...btnP, opacity:step1Valid?1:0.35, cursor:step1Valid?"pointer":"not-allowed" }}>
                Next: Select Indexes →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step===2 && (
          <div>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ color:C.textBright, fontSize:20, fontWeight:700, margin:"0 0 6px" }}>Select Submittal Indexes</h2>
              <p style={{ color:C.textDim, margin:0, fontSize:13 }}>
                <span style={{ color:C.blue, fontWeight:600 }}>AI</span> items → Gemini generates &nbsp;·&nbsp;
                <span style={{ color:C.purple, fontWeight:600 }}>DRIVE</span> items → pick from your library
              </p>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={lbl}>Customer Presets</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {Object.keys(PRESETS).map(name=>(
                  <button key={name} onClick={()=>applyPreset(name)} style={{ background:activePreset===name?`${C.accent}22`:"#0a111e", border:`1px solid ${activePreset===name?C.accent:C.border}`, borderRadius:20, color:activePreset===name?C.accent:C.text, padding:"6px 15px", fontSize:12, cursor:"pointer", fontWeight:activePreset===name?700:400, fontFamily:FF }}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {DOC_TYPES.map(doc=>{
                const on = selected.has(doc.key);
                const assigned = doc.manual && manualFiles[doc.key];
                return (
                  <div key={doc.key} style={{ background:on?`${C.accent}0e`:C.card, border:`1px solid ${on?C.accent:C.border}`, borderRadius:8, overflow:"hidden" }}>
                    <div onClick={()=>toggle(doc.key)} style={{ padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:20, height:20, borderRadius:4, flexShrink:0, border:`2px solid ${on?C.accent:C.border}`, background:on?C.accent:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"#000" }}>
                        {on?"✓":""}
                      </div>
                      <span style={{ fontSize:20, flexShrink:0 }}>{doc.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color:on?C.textBright:C.text, fontWeight:600, fontSize:13 }}>{doc.label}</div>
                        <div style={{ color:C.textDim, fontSize:11, marginTop:2 }}>{doc.description}</div>
                      </div>
                      {doc.aiGenerated && <div style={{ flexShrink:0, background:`${C.blue}18`, border:`1px solid ${C.blue}33`, borderRadius:3, padding:"2px 7px", fontSize:10, fontWeight:700, color:C.blue }}>AI</div>}
                      {doc.manual && <div style={{ flexShrink:0, background:`${C.purple}18`, border:`1px solid ${C.purple}33`, borderRadius:3, padding:"2px 7px", fontSize:10, fontWeight:700, color:C.purple }}>DRIVE</div>}
                    </div>

                    {on && doc.manual && (
                      <div style={{ borderTop:`1px solid ${C.border}`, padding:"8px 14px", display:"flex", alignItems:"center", gap:8, background:assigned?`${C.green}08`:"transparent" }}>
                        {assigned ? (
                          <>
                            <span style={{ fontSize:14 }}>✅</span>
                            <span style={{ flex:1, fontSize:12, color:C.green, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{manualFiles[doc.key].name}</span>
                            <button onClick={()=>openLibrary(doc.key)} style={{ background:"transparent", border:`1px solid ${C.border}`, borderRadius:4, color:C.textDim, fontSize:11, padding:"3px 8px", cursor:"pointer", fontFamily:FF, flexShrink:0 }}>Change</button>
                            <button onClick={()=>setManualFiles(p=>{ const n={...p}; delete n[doc.key]; return n; })} style={{ background:"transparent", border:"none", color:C.textDim, fontSize:16, cursor:"pointer", flexShrink:0, lineHeight:1 }}>×</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex:1, fontSize:12, color:C.textDim }}>No file selected</span>
                            <button onClick={()=>openLibrary(doc.key)} style={{ background:`${C.purple}15`, border:`1px solid ${C.purple}44`, borderRadius:5, color:C.purple, fontSize:11, fontWeight:700, padding:"5px 12px", cursor:"pointer", fontFamily:FF, flexShrink:0 }}>
                              📁 Pick from Drive
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding:"12px 16px", background:`${C.blue}0d`, border:`1px solid ${C.blue}1a`, borderRadius:8, fontSize:13, color:C.textDim, display:"flex", gap:20 }}>
              <span><strong style={{ color:C.blue }}>{DOC_TYPES.filter(d=>d.aiGenerated&&selected.has(d.key)).length}</strong> Gemini</span>
              <span><strong style={{ color:C.purple }}>{DOC_TYPES.filter(d=>d.manual&&selected.has(d.key)).length}</strong> Drive PDFs ({Object.keys(manualFiles).length} assigned)</span>
              <span><strong style={{ color:C.accent }}>{selected.size}</strong> total</span>
            </div>

            <div style={{ marginTop:24, display:"flex", justifyContent:"space-between" }}>
              <button onClick={()=>setStep(1)} style={btnG}>← Back</button>
              <button onClick={handleGenerate} disabled={selected.size===0} style={{ ...btnP, opacity:selected.size>0?1:0.35 }}>
                Generate Submittal →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step===3 && (
          <div style={{ textAlign:"center", padding:"80px 40px" }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
            <div style={{ width:72, height:72, borderRadius:"50%", border:`3px solid ${C.border}`, borderTopColor:C.accent, margin:"0 auto 32px", animation:"spin 1s linear infinite" }}/>
            <h2 style={{ color:C.textBright, fontSize:22, fontWeight:700, margin:"0 0 12px" }}>Filling Your Documents</h2>
            <p style={{ color:C.textDim, fontSize:14, maxWidth:400, margin:"0 auto" }}>n8n copying templates and filling placeholders. ~15–30 seconds.</p>
            <div style={{ marginTop:32, display:"flex", justifyContent:"center", gap:8 }}>
              {DOC_TYPES.filter(d=>d.aiGenerated&&selected.has(d.key)).map((doc,i)=>(
                <div key={doc.key} style={{ fontSize:22, animation:`pulse 1.5s ease-in-out ${i*0.2}s infinite` }} title={doc.label}>{doc.icon}</div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step===4 && (
          <div>
            <div style={{ marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <h2 style={{ color:C.textBright, fontSize:20, fontWeight:700, margin:"0 0 4px" }}>Preview & Export</h2>
                <p style={{ color:C.textDim, margin:0, fontSize:13 }}>{selected.size} documents assembled</p>
              </div>
              <button onClick={exportPDF} style={{ ...btnP, display:"flex", alignItems:"center", gap:7 }}>⬇ Export PDF Package</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:16 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {DOC_TYPES.filter(d=>selected.has(d.key)).map((doc,idx)=>{
                  const ok = doc.key==="cover"||(doc.aiGenerated&&!!generated[doc.key])||(doc.manual&&!!manualFiles[doc.key]);
                  const active = activeDoc===doc.key;
                  return (
                    <div key={doc.key} onClick={()=>setActiveDoc(doc.key)} style={{ background:active?`${C.accent}15`:C.card, border:`1px solid ${active?C.accent:C.border}`, borderRadius:7, padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:22, height:22, borderRadius:4, flexShrink:0, background:active?C.accent:C.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:active?"#000":C.textDim }}>{idx+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color:active?C.accent:C.text, fontSize:12, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{doc.label}</div>
                        <div style={{ fontSize:11, marginTop:2, color:ok?C.green:C.textDim }}>
                          {doc.key==="cover"?"✓ auto"
                            :doc.aiGenerated?(generated[doc.key]
                              ? <><a href={generated[doc.key].viewLink} target="_blank" rel="noreferrer" style={{ color:C.blue, fontSize:11 }}>View</a> · <a href={generated[doc.key].downloadLink} style={{ color:C.green, fontSize:11 }}>Download</a></>
                              : "⚠ not filled")
                            :doc.manual?(manualFiles[doc.key]?"✓ "+manualFiles[doc.key].name.slice(0,16)+"…":"● no file")
                            :"✓"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:520 }}>
                {activeDoc ? (()=>{
                  const doc = DOC_TYPES.find(d=>d.key===activeDoc);
                  const docResult = generated[activeDoc];
                  const driveFile = manualFiles[activeDoc];
                  return (
                    <>
                      <div style={{ padding:"13px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:20 }}>{doc.icon}</span>
                        <span style={{ color:C.textBright, fontWeight:600, fontSize:14 }}>{doc.label}</span>
                        {doc.aiGenerated && <span style={{ fontSize:10, background:`${C.blue}18`, color:C.blue, padding:"2px 8px", borderRadius:3, border:`1px solid ${C.blue}33`, fontWeight:700 }}>TEMPLATE FILLED</span>}
                        {doc.manual && <span style={{ fontSize:10, background:`${C.purple}18`, color:C.purple, padding:"2px 8px", borderRadius:3, border:`1px solid ${C.purple}33`, fontWeight:700 }}>DRIVE PDF</span>}
                        <div style={{ flex:1 }}/>
                        <span style={{ fontSize:11, color:C.textDim }}>{info.projectName}</span>
                      </div>
                      <div style={{ flex:1, padding:"24px", overflowY:"auto", maxHeight:480 }}>
                        {activeDoc==="cover" ? (
                          <div style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"48px 32px", textAlign:"center" }}>
                            <div style={{ fontSize:11, letterSpacing:"0.18em", color:C.textDim, marginBottom:16 }}>MATERIAL SUBMITTAL</div>
                            <div style={{ fontSize:24, fontWeight:800, color:C.textBright, marginBottom:6 }}>{info.projectName||"[Project Name]"}</div>
                            <div style={{ fontSize:16, color:C.accent, marginBottom:32 }}>{info.productName||"[Product]"}</div>
                            <div style={{ display:"inline-block", textAlign:"left" }}>
                              {[
                                ["Client",info.client],
                                ["Main Contractor",info.mainContractor||"—"],
                                ["Consultant",info.consultant||"—"],
                                ["Supplier",info.supplier||"—"],
                                ["Location",info.location||"—"],
                                ["Date",info.date]
                              ].map(([k,v])=>(
                                <div key={k} style={{ display:"flex", gap:16, marginBottom:10, fontSize:13 }}>
                                  <span style={{ color:C.textDim, minWidth:110 }}>{k}</span>
                                  <span style={{ color:C.text }}>{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : docResult ? (
                          <div style={{ textAlign:"center", padding:"48px 32px" }}>
                            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
                            <div style={{ fontWeight:700, fontSize:16, color:C.textBright, marginBottom:8 }}>{doc.label} — Filled</div>
                            <div style={{ fontSize:13, color:C.textDim, marginBottom:28 }}>Template filled and saved to Google Drive</div>
                            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                              <a href={docResult.viewLink} target="_blank" rel="noreferrer" style={{ background:`${C.blue}18`, border:`1px solid ${C.blue}44`, borderRadius:6, color:C.blue, padding:"10px 22px", fontSize:13, fontWeight:600, textDecoration:"none" }}>
                                📄 Open in Drive
                              </a>
                              <a href={docResult.downloadLink} target="_blank" rel="noreferrer" style={{ background:`${C.green}18`, border:`1px solid ${C.green}44`, borderRadius:6, color:C.green, padding:"10px 22px", fontSize:13, fontWeight:600, textDecoration:"none" }}>
                                ⬇ Download DOCX
                              </a>
                            </div>
                          </div>
                        ) : driveFile ? (
                          <div style={{ textAlign:"center", padding:"60px 40px" }}>
                            <div style={{ fontSize:52, marginBottom:16 }}>📄</div>
                            <div style={{ fontWeight:700, fontSize:16, color:C.textBright, marginBottom:8 }}>{driveFile.name}</div>
                            <div style={{ fontSize:13, color:C.textDim, marginBottom:24 }}>PDF from your Google Drive library</div>
                            <a href={driveFile.webViewLink} target="_blank" rel="noreferrer" style={{ background:`${C.blue}18`, border:`1px solid ${C.blue}44`, borderRadius:6, color:C.blue, padding:"10px 22px", fontSize:13, fontWeight:600, textDecoration:"none" }}>
                              Open in Google Drive →
                            </a>
                            <div style={{ marginTop:24, padding:"12px 16px", background:`${C.accent}0a`, border:`1px solid ${C.accent}22`, borderRadius:6, fontSize:12, color:C.textDim }}>
                              ⚠ Merge this PDF at this position before submitting to client.
                            </div>
                          </div>
                        ) : doc.aiGenerated ? (
                          <div style={{ textAlign:"center", padding:"60px 40px", color:C.textDim }}>
                            <div style={{ fontSize:36, marginBottom:12 }}>⚠</div>
                            <div style={{ fontWeight:600, color:C.text }}>Not generated — rebuild to retry.</div>
                          </div>
                        ) : (
                          <div style={{ textAlign:"center", padding:"60px 40px", border:`2px dashed ${C.border}`, borderRadius:8 }}>
                            <div style={{ fontSize:36, marginBottom:12 }}>📁</div>
                            <div style={{ fontWeight:600, color:C.text, marginBottom:8 }}>No Drive file assigned</div>
                            <button onClick={()=>setStep(2)} style={{ ...btnG, fontSize:12, marginTop:8 }}>← Back to pick file</button>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })() : (
                  <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:C.textDim, fontSize:14 }}>← Select a document to preview</div>
                )}
              </div>
            </div>

            <div style={{ marginTop:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
              <button onClick={()=>{ setStep(2); setGenerated({}); setActiveDoc(null); }} style={btnG}>← Rebuild</button>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                {mergeError && <span style={{ fontSize:12, color:"#fca5a5" }}>⚠ {mergeError}</span>}
                <button onClick={exportPDF} style={btnG}>⬇ Export HTML Preview</button>
                <button onClick={handleMerge} disabled={merging} style={{ ...btnP, opacity:merging?0.6:1, display:"flex", alignItems:"center", gap:7 }}>
                  {merging ? "⏳ Merging…" : "📦 Download Merged PDF"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
