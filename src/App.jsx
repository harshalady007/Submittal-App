import { useState, useEffect, useCallback } from "react";

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const WEBHOOK_URL         = import.meta.env.VITE_N8N_WEBHOOK_URL         || "";
const LIBRARY_WEBHOOK_URL = import.meta.env.VITE_N8N_LIBRARY_WEBHOOK_URL || "";
const SEARCH_URL          = import.meta.env.VITE_N8N_SEARCH_URL          || "";
const FILL_URL            = import.meta.env.VITE_N8N_FILL_URL            || "";
const MERGE_URL           = import.meta.env.VITE_N8N_MERGE_URL           || "";
const MERGE_FETCH_URL     = import.meta.env.VITE_N8N_MERGE_FETCH_URL     || "";
const PDFCO_KEY           = import.meta.env.VITE_PDFCO_KEY              || "";

const DRIVE_ROOT_FOLDER       = "1dCvVda8iJf8v7Unxmbvwrxn7xmjt8mRs";
const TEST_CERT_FOLDER        = "16ItTnrZPaIBbo6c0oOKntV1tjKFeQXRS";

// preferredFilename = exact filename (case-insensitive) — takes priority over autoKeywords
// autoKeywords = fallback if preferredFilename is missing from Drive
const DOC_TYPES = [
  { key:"cover",             label:"Cover Page (Front Page)",         icon:"📄", aiGenerated:true,  manual:false, description:"AI-filled Front Page from Drive (project + sub-contractor)" },
  { key:"tds",               label:"Technical Data Sheet",            icon:"⚙️",  aiGenerated:true,  manual:false, description:"Full product technical specifications", indexLabel:"TECHNICAL DATA SHEET" },
  { key:"warranty",          label:"Draft Warranty Certificate",      icon:"🛡️", aiGenerated:true,  manual:false, description:"Manufacturer warranty terms", indexLabel:"DRAFT WARRANTY CERTIFICATES & GUARANTEE" },
  { key:"origin",            label:"Country of Origin",               icon:"🌐", aiGenerated:true,  manual:false, description:"Declaration of product manufacturing origin", indexLabel:"COUNTRY OF ORIGIN" },
  { key:"compliance",        label:"Compliance Statement",            icon:"✅", aiGenerated:true,  manual:false, description:"Standards & spec compliance declaration", indexLabel:"TECHNICAL COMPLIANCES" },
  { key:"test_cert",         label:"Test Certificate",                icon:"🧪", aiGenerated:false, manual:true,  description:"Pick test certificate from Drive folder", indexLabel:"TEST REPORT", defaultFolder:TEST_CERT_FOLDER },
  { key:"material_schedule", label:"Material Schedule",               icon:"📋", aiGenerated:true,  manual:false, description:"Itemized material list for project", indexLabel:"MATERIAL SCHEDULE" },
  { key:"previous_approval", label:"Previous Approval",               icon:"📝", aiGenerated:false, manual:true,  description:"Previous client or consultant approval letter", indexLabel:"PREVIOUS MATERIAL APPROVAL", preferredFilename:"PREVIOUS APPROVALS.pdf",          autoKeywords:["approval","approved"] },
  { key:"trade_license",     label:"Trade License",                   icon:"🏢", aiGenerated:false, manual:true,  description:"Company trade license document",                indexLabel:"TRADE LICENSE / COMMERCIAL LICENSE", preferredFilename:"TRADE LICENSE.pdf",        autoKeywords:["trade license","trade licence"] },
  { key:"msds",              label:"Material Safety Data Sheet",      icon:"⚗️", aiGenerated:false, manual:true,  description:"MSDS / safety data for the product",            indexLabel:"MATERIAL SAFETY DATA SHEET (MSDS)", preferredFilename:"10. PROJECT REFERENCE LIST.pdf", autoKeywords:["msds","safety data","sds"] },
  { key:"iso_cert",          label:"ISO Certifications & Licenses",   icon:"🏆", aiGenerated:false, manual:true,  description:"ISO certs, quality or product licences",        indexLabel:"ISO CERTIFICATE",                   preferredFilename:"ISO Certificate.pdf",      autoKeywords:["iso certificate","iso"] },
  { key:"vendor_list",       label:"Vendor List",                     icon:"🗂️", aiGenerated:false, manual:true,  description:"Approved vendor / manufacturer list",           indexLabel:"VENDOR LIST",                                                                       autoKeywords:["vendor","vendor list","supplier list"] },
  { key:"company_profile",   label:"Company Profile",                 icon:"🏛️", aiGenerated:false, manual:true,  description:"Bluestream company profile from Drive",         indexLabel:"COMPANY PROFILE",                   preferredFilename:"Bluestream Company Profile.pdf", autoKeywords:["company profile","bluestream profile"] },
  { key:"project_reference", label:"Project Reference List",          icon:"📚", aiGenerated:false, manual:true,  description:"Project reference list from Drive",             indexLabel:"LIST OF PREVIOUS PROJECTS",         preferredFilename:"10. PROJECT REFERENCE LIST.pdf", autoKeywords:["project reference","reference list"] },
];

const PRESETS = {
  "Municipality":      ["cover","tds","warranty","origin","compliance","material_schedule","previous_approval","iso_cert","company_profile","project_reference"],
  "Private Developer": ["cover","tds","warranty","previous_approval","trade_license","company_profile"],
  "DEWA / Utility":    ["cover","tds","warranty","origin","compliance","test_cert","material_schedule","iso_cert","company_profile","project_reference"],
  "Full Package":      DOC_TYPES.map(d=>d.key),
};

const STEPS = ["Project Info","Select Indexes","Generating","Preview & Export"];

const C = { bg:"#070d1a", card:"#0d1625", card2:"#0a1120", border:"#1a3356", accent:"#f59e0b", blue:"#60a5fa", green:"#34d399", purple:"#a78bfa", text:"#94a3b8", textBright:"#f1f5f9", textDim:"#4b6280" };
const FF = "'DM Sans', system-ui, sans-serif";
const inputSt = { background:"#0a111e", border:`1px solid ${C.border}`, borderRadius:6, color:C.textBright, padding:"10px 13px", width:"100%", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:FF };
const btnP = { background:C.accent, color:"#000", border:"none", borderRadius:6, padding:"10px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FF };
const btnG = { background:"transparent", color:C.text, border:`1px solid ${C.border}`, borderRadius:6, padding:"10px 18px", fontSize:13, cursor:"pointer", fontFamily:FF };
const lbl  = { color:C.textDim, fontSize:11, fontWeight:700, letterSpacing:"0.09em", textTransform:"uppercase", marginBottom:6, display:"block" };

function LibraryModal({ libraryUrl, startFolder, fallbackFiles, fallbackError, onPick, onClose }) {
  const [search, setSearch]   = useState("");
  const [folders, setFolders] = useState([]);
  const [files, setFiles]     = useState([]);
  const [stack, setStack]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const loadFolder = useCallback((folderId, breadcrumb) => {
    if (!libraryUrl) { setFiles(fallbackFiles || []); setFolders([]); setError(fallbackError || ""); return; }
    setLoading(true); setError("");
    const sep = libraryUrl.includes("?") ? "&" : "?";
    const url = folderId ? libraryUrl + sep + "folder=" + encodeURIComponent(folderId) : libraryUrl;
    fetch(url).then(r => r.json()).then(d => {
      setFolders(d.folders || []); setFiles(d.files || []);
      if (breadcrumb) setStack(breadcrumb); setSearch("");
    }).catch(e => setError(e.message || "Failed to load folder")).finally(() => setLoading(false));
  }, [libraryUrl, fallbackFiles, fallbackError]);

  useEffect(() => {
    if (startFolder) loadFolder(startFolder, [{ id: startFolder, name: "Selected Folder" }]);
    else loadFolder(null, []);
  }, [startFolder, loadFolder]);

  const enterFolder = (folder) => loadFolder(folder.id, [...stack, { id: folder.id, name: folder.name }]);
  const goUp = () => { if (stack.length === 0) return; const newStack = stack.slice(0, -1); const parent = newStack[newStack.length - 1]; loadFolder(parent ? parent.id : null, newStack); };
  const goRoot = () => loadFolder(null, []);

  const term = search.trim().toLowerCase();
  const filteredFolders = term ? folders.filter(f => f.name.toLowerCase().includes(term)) : folders;
  const filteredFiles   = term ? files.filter(f => f.name.toLowerCase().includes(term))   : files;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, width:"min(720px,100%)", maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:22 }}>🗂️</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:C.textBright, fontWeight:700, fontSize:15 }}>Google Drive Library</div>
            <div style={{ color:C.textDim, fontSize:12, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              <span style={{ cursor:"pointer", color: stack.length===0 ? C.textBright : C.blue }} onClick={goRoot}>Root</span>
              {stack.map((b, i) => (
                <span key={b.id}>
                  <span style={{ color:C.textDim, margin:"0 6px" }}>›</span>
                  <span style={{ color: i===stack.length-1 ? C.textBright : C.blue, cursor: i===stack.length-1 ? "default" : "pointer" }}
                    onClick={()=>{ if (i!==stack.length-1) loadFolder(b.id, stack.slice(0, i+1)); }}>{b.name}</span>
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.textDim, fontSize:22, cursor:"pointer", lineHeight:1, padding:"0 4px" }}>×</button>
        </div>

        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:8, alignItems:"center" }}>
          {stack.length > 0 && <button onClick={goUp} style={{ ...btnG, padding:"6px 10px", fontSize:12 }}>← Up</button>}
          <input type="text" placeholder="Search this folder…" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inputSt, padding:"8px 12px" }} autoFocus/>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
          {loading && <div style={{ textAlign:"center", padding:"48px", color:C.textDim, fontSize:13 }}>Loading…</div>}
          {error && <div style={{ padding:"16px", background:"#3b0000", border:"1px solid #ef4444", borderRadius:8, color:"#fca5a5", fontSize:13 }}>⚠ {error}</div>}
          {!loading && !error && filteredFolders.length===0 && filteredFiles.length===0 && (
            <div style={{ textAlign:"center", padding:"48px", color:C.textDim, fontSize:13 }}>{term ? "No matches in this folder." : "This folder is empty."}</div>
          )}
          {!loading && filteredFolders.length > 0 && (
            <div style={{ marginBottom:6 }}>
              <div style={{ color:C.textDim, fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", padding:"6px 10px" }}>Folders ({filteredFolders.length})</div>
              {filteredFolders.map(folder => (
                <div key={folder.id} onClick={()=>enterFolder(folder)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, cursor:"pointer", border:"1px solid transparent", marginBottom:4, transition:"all .1s" }}
                  onMouseEnter={e=>{ e.currentTarget.style.background=C.card2; e.currentTarget.style.borderColor=C.border; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="transparent"; }}
                >
                  <div style={{ width:36, height:30, background:`${C.accent}18`, border:`1px solid ${C.accent}44`, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>📁</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:C.textBright, fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{folder.name}</div>
                    <div style={{ color:C.textDim, fontSize:11, marginTop:2 }}>Folder</div>
                  </div>
                  <span style={{ color:C.textDim, fontSize:14 }}>›</span>
                </div>
              ))}
            </div>
          )}
          {!loading && filteredFiles.length > 0 && (
            <div>
              <div style={{ color:C.textDim, fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", padding:"6px 10px" }}>Files ({filteredFiles.length})</div>
              {filteredFiles.map(file => (
                <div key={file.id} onClick={()=>onPick(file)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, cursor:"pointer", border:"1px solid transparent", marginBottom:4, transition:"all .1s" }}
                  onMouseEnter={e=>{ e.currentTarget.style.background=C.card2; e.currentTarget.style.borderColor=C.border; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="transparent"; }}
                >
                  <div style={{ width:36, height:44, background:"#1a0800", border:"1px solid #7c2d0033", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:20 }}>📄</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:C.textBright, fontSize:13, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{file.name}</div>
                    <div style={{ color:C.textDim, fontSize:11, marginTop:2 }}>{(file.mimeType||"").includes("pdf") ? "PDF" : "File"} • Google Drive</div>
                  </div>
                  <a href={file.webViewLink} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                    style={{ color:C.blue, fontSize:11, textDecoration:"none", flexShrink:0, padding:"4px 8px", border:`1px solid ${C.blue}33`, borderRadius:4 }}>Preview</a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.border}`, fontSize:12, color:C.textDim }}>
          Click a file to assign it. <strong style={{ color:C.text }}>Files stay in Google Drive</strong> — only the link is saved.
        </div>
      </div>
    </div>
  );
}

export default function SubmittalBuilder() {
  const [step, setStep] = useState(1);
  const [info, setInfo] = useState({
    projectName:"", client:"", mainContractor:"", subContractor:"", consultant:"", location:"",
    productName:"", supplier:"",
    materialSpec:"", dimensions:"", material:"", finish:"",
    productWarranty:"", productList:"",
    date:new Date().toISOString().split("T")[0],
    quoteNumber:"",
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
  const [libraryStartFolder, setLibraryStartFolder] = useState(null);
  const [allFiles, setAllFiles]       = useState([]);
  const [libLoading, setLibLoading]   = useState(false);
  const [libError, setLibError]       = useState("");
  const [autoMatchCount, setAutoMatchCount] = useState(0);

  // Auto-match Drive files for manual doc types via search webhook.
  // preferredFilename takes priority over autoKeywords (exact filename match).
  useEffect(() => {
    if (LIBRARY_WEBHOOK_URL) {
      fetch(LIBRARY_WEBHOOK_URL)
        .then(r=>r.json())
        .then(d=>setAllFiles(d.files || []))
        .catch(()=>{});
    }

    if (!SEARCH_URL) return;
    setLibLoading(true);
    setLibError("");

    const queries = {};
    const preferredFilenames = {};
    DOC_TYPES.filter(dt => dt.manual && (dt.autoKeywords || dt.preferredFilename)).forEach(dt => {
      if (dt.autoKeywords) queries[dt.key] = dt.autoKeywords;
      if (dt.preferredFilename) preferredFilenames[dt.key] = dt.preferredFilename;
    });

    fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, preferredFilenames })
    })
      .then(r => r.json())
      .then(d => {
        if (d && d.success && d.matches) {
          const autoMatched = {};
          Object.entries(d.matches).forEach(([k, file]) => {
            if (file && file.id) autoMatched[k] = file;
          });
          const n = Object.keys(autoMatched).length;
          setAutoMatchCount(n);
          if (n > 0) setManualFiles(prev => ({ ...autoMatched, ...prev }));
        }
      })
      .catch(e => setLibError(e.message || "Drive search failed"))
      .finally(() => setLibLoading(false));
  }, []);

  const set    = (f,v) => setInfo(p=>({...p,[f]:v}));
  const toggle = key => { setSelected(p=>{ const n=new Set(p); n.has(key)?n.delete(key):n.add(key); return n; }); setActivePreset(null); };
  const applyPreset = name => { setSelected(new Set(PRESETS[name])); setActivePreset(name); };
  const openLibrary = useCallback(docKey => {
    const docDef = DOC_TYPES.find(d=>d.key===docKey);
    setLibraryTarget(docKey); setLibraryStartFolder(docDef?.defaultFolder || null); setLibraryOpen(true);
  }, []);
  const pickFile = useCallback(file => { setManualFiles(p=>({...p,[libraryTarget]:file})); setLibraryOpen(false); setLibraryTarget(null); setLibraryStartFolder(null); }, [libraryTarget]);

  const [merging, setMerging]     = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [mergeStatus, setMergeStatus] = useState("");

  const handleMerge = async () => {
    if (!MERGE_URL)       { setMergeError("VITE_N8N_MERGE_URL not set"); return; }
    if (!MERGE_FETCH_URL) { setMergeError("VITE_N8N_MERGE_FETCH_URL not set"); return; }
    setMerging(true); setMergeError(""); setMergeStatus("Preparing files…");
    try {
      const filledDocs = [];
      const driveFileIds = [];
      const indexItems = [];
      [...selected].forEach((key, idx) => {
        const d = DOC_TYPES.find(x => x.key === key);
        if (!d) return;
        if (d.aiGenerated && generated[key]) {
          filledDocs.push({ docKey: key, viewLink: generated[key].viewLink, orderIndex: idx });
        } else if (d.manual && manualFiles[key]) {
          driveFileIds.push({ docKey: key, fileId: manualFiles[key].id, orderIndex: idx });
        }
        if (d.indexLabel) {
          indexItems.push({ docKey: key, label: d.indexLabel });
        }
      });

      const outputName = (info.projectName || "Submittal").replace(/[^a-zA-Z0-9_-]/g,"_") + "_Submittal";

      setMergeStatus("Uploading documents…");
      const startRes = await fetch(MERGE_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ filledDocs, driveFileIds, indexItems, outputName, pdfcoKey: PDFCO_KEY })
      });
      if (!startRes.ok) throw new Error(`Merge start failed: ${startRes.status}`);
      const startData = await startRes.json();
      if (!startData.success || !startData.jobId) throw new Error(startData.message || "No jobId returned");
      const { jobId, mergedUrl, fileCount } = startData;

      setMergeStatus("Merging PDFs…");
      const sleep = (ms) => new Promise(r=>setTimeout(r, ms));
      const maxAttempts = 150;
      let finalUrl = null;
      let filename = outputName + ".pdf";

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await sleep(attempt <= 3 ? 2500 : 4000);
        const pollRes = await fetch(MERGE_FETCH_URL, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ jobId, mergedUrl, pdfcoKey: PDFCO_KEY, outputName, fileCount })
        });
        if (!pollRes.ok) { if (attempt > 5) throw new Error(`Merge fetch failed: ${pollRes.status}`); continue; }
        const pollData = await pollRes.json();
        if (pollData.error) throw new Error(pollData.message || "Merge job failed");
        if (pollData.ready && pollData.mergedUrl) {
          finalUrl = pollData.mergedUrl;
          filename = pollData.filename || filename;
          setMergeStatus("Downloading…");
          break;
        }
        setMergeStatus(`Merging PDFs… (${attempt * 4}s)`);
      }

      if (!finalUrl) throw new Error("Merge timed out — try again or split into fewer documents");

      const a = document.createElement("a");
      a.href = finalUrl; a.download = filename; a.target = "_blank";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setMergeStatus("");
    } catch(e) { setMergeError(e.message); setMergeStatus(""); }
    finally { setMerging(false); }
  };

  const step1Valid = info.projectName && info.client && info.productName;

  const handleGenerate = async () => {
    const url = FILL_URL || WEBHOOK_URL;
    if (!url) { setError("Webhook URL not set in .env"); return; }
    setLoading(true); setError(""); setStep(3);
    try {
      const res = await fetch(url, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ projectInfo: info, selectedDocs:[...selected] })
      });
      if (!res.ok) throw new Error(`n8n returned ${res.status}`);
      const data = await res.json();
      if (data.success && data.documents) {
        setGenerated(data.documents); setStep(4);
        const firstAiKey = [...selected].find(k => {
          const d = DOC_TYPES.find(x=>x.key===k);
          return d && d.aiGenerated && data.documents[k];
        });
        setActiveDoc(firstAiKey || [...selected][0] || null);
      } else throw new Error("Unexpected response from n8n");
    } catch(e) { setError(e.message); setStep(2); }
    finally { setLoading(false); }
  };

  const selectedInOrder = () => [...selected].map(k=>DOC_TYPES.find(d=>d.key===k)).filter(Boolean);
  const indexCount = () => [...selected].filter(k => { const d = DOC_TYPES.find(x=>x.key===k); return d && d.indexLabel; }).length;

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:FF, color:C.text }}>
      {libraryOpen && <LibraryModal libraryUrl={LIBRARY_WEBHOOK_URL} startFolder={libraryStartFolder} fallbackFiles={allFiles} fallbackError={libError} onPick={pickFile} onClose={()=>{ setLibraryOpen(false); setLibraryTarget(null); setLibraryStartFolder(null); }}/>}

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
                  <div style={{ width:20, height:20, borderRadius:"50%", flexShrink:0, background:done?C.green:active?C.accent:C.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:done||active?"#000":C.textDim }}>{done?"✓":num}</div>
                  <span style={{ fontSize:12, fontWeight:active?700:400, color:active?C.accent:done?C.text:C.textDim }}>{s}</span>
                </div>
                {i<STEPS.length-1 && <div style={{ width:18, height:1, background:C.border }}/>}
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {SEARCH_URL && (
            <div style={{ fontSize:11, color:libLoading?C.textDim:autoMatchCount>0?C.green:C.textDim, background:C.card, border:`1px solid ${autoMatchCount>0?C.green+"44":C.border}`, borderRadius:20, padding:"4px 12px" }}>
              {libLoading ? "Searching Drive…" : `🔎 ${autoMatchCount} auto-matched`}
            </div>
          )}
          <div style={{ fontSize:12, color:C.textDim, background:C.card, border:`1px solid ${C.border}`, borderRadius:20, padding:"4px 12px" }}>{selected.size} docs</div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"32px 20px" }}>
        {error && <div style={{ background:"#3b0000", border:"1px solid #ef4444", borderRadius:8, padding:"12px 16px", marginBottom:20, fontSize:13, color:"#fca5a5" }}>⚠ {error}</div>}

        {step===1 && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h2 style={{ color:C.textBright, fontSize:20, fontWeight:700, margin:"0 0 6px" }}>Project Information</h2>
              <p style={{ color:C.textDim, margin:0, fontSize:13 }}>Used to fill all AI documents and the Front Page cover.</p>
            </div>

            <div style={{ marginBottom:8 }}>
              <div style={{ color:C.textDim, fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>Project Details</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  { f:"projectName",    l:"Project Name *",         p:"e.g. Marina Bay Landscaping Phase 2", span:true },
                  { f:"client",         l:"Client *",               p:"e.g. Al Futtaim Group" },
                  { f:"mainContractor", l:"Main Contractor",        p:"e.g. Al Futtaim Construction LLC" },
                  { f:"subContractor",  l:"Subcontractor",          p:"e.g. Bluestream Environmental Technology LLC" },
                  { f:"consultant",     l:"Consultant",             p:"e.g. Atkins Middle East (optional)" },
                  { f:"location",       l:"Project Location",       p:"e.g. Dubai, UAE" },
                  { f:"date",           l:"Submittal Date",         p:"", type:"date" },
                  { f:"quoteNumber",    l:"Quotation No.",          p:"e.g. Q-2026-001" },
                ].map(({ f,l,p,span,type })=>(
                  <div key={f} style={span?{gridColumn:"1/-1"}:{}}>
                    <label style={lbl}>{l}</label>
                    <input type={type||"text"} value={info[f]} onChange={e=>set(f,e.target.value)} placeholder={p} style={inputSt}/>
                  </div>
                ))}
              </div>
            </div>

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

        {step===2 && (
          <div>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ color:C.textBright, fontSize:20, fontWeight:700, margin:"0 0 6px" }}>Select Submittal Indexes</h2>
              <p style={{ color:C.textDim, margin:0, fontSize:13 }}>
                <span style={{ color:C.blue, fontWeight:600 }}>AI</span> items → Gemini generates &nbsp;·&nbsp;
                <span style={{ color:C.purple, fontWeight:600 }}>DRIVE</span> items → pick from library &nbsp;·&nbsp;
                <span style={{ color:C.accent, fontWeight:600 }}>Selection order = page order</span> in final PDF
              </p>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={lbl}>Customer Presets</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {Object.keys(PRESETS).map(name=>(
                  <button key={name} onClick={()=>applyPreset(name)} style={{ background:activePreset===name?`${C.accent}22`:"#0a111e", border:`1px solid ${activePreset===name?C.accent:C.border}`, borderRadius:20, color:activePreset===name?C.accent:C.text, padding:"6px 15px", fontSize:12, cursor:"pointer", fontWeight:activePreset===name?700:400, fontFamily:FF }}>{name}</button>
                ))}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {DOC_TYPES.map(doc=>{
                const on = selected.has(doc.key);
                const assigned = doc.manual && manualFiles[doc.key];
                const orderPos = on ? [...selected].indexOf(doc.key) + 1 : null;
                return (
                  <div key={doc.key} style={{ background:on?`${C.accent}0e`:C.card, border:`1px solid ${on?C.accent:C.border}`, borderRadius:8, overflow:"hidden" }}>
                    <div onClick={()=>toggle(doc.key)} style={{ padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:20, height:20, borderRadius:4, flexShrink:0, border:`2px solid ${on?C.accent:C.border}`, background:on?C.accent:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"#000" }}>{on?(orderPos||"✓"):""}</div>
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
                            <button onClick={()=>openLibrary(doc.key)} style={{ background:`${C.purple}15`, border:`1px solid ${C.purple}44`, borderRadius:5, color:C.purple, fontSize:11, fontWeight:700, padding:"5px 12px", cursor:"pointer", fontFamily:FF, flexShrink:0 }}>📁 Pick from Drive</button>
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
              <span><strong style={{ color:C.green }}>{indexCount()}</strong> on INDEX page</span>
              <span><strong style={{ color:C.accent }}>{selected.size}</strong> total</span>
            </div>

            <div style={{ marginTop:24, display:"flex", justifyContent:"space-between" }}>
              <button onClick={()=>setStep(1)} style={btnG}>← Back</button>
              <button onClick={handleGenerate} disabled={selected.size===0} style={{ ...btnP, opacity:selected.size>0?1:0.35 }}>Generate Submittal →</button>
            </div>
          </div>
        )}

        {step===3 && (
          <div style={{ textAlign:"center", padding:"80px 40px" }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
            <div style={{ width:72, height:72, borderRadius:"50%", border:`3px solid ${C.border}`, borderTopColor:C.accent, margin:"0 auto 32px", animation:"spin 1s linear infinite" }}/>
            <h2 style={{ color:C.textBright, fontSize:22, fontWeight:700, margin:"0 0 12px" }}>Filling Your Documents</h2>
            <p style={{ color:C.textDim, fontSize:14, maxWidth:400, margin:"0 auto" }}>n8n copying templates and filling placeholders. ~15–30 seconds.</p>
            <div style={{ marginTop:32, display:"flex", justifyContent:"center", gap:8 }}>
              {selectedInOrder().filter(d=>d.aiGenerated).map((doc,i)=>(
                <div key={doc.key} style={{ fontSize:22, animation:`pulse 1.5s ease-in-out ${i*0.2}s infinite` }} title={doc.label}>{doc.icon}</div>
              ))}
            </div>
          </div>
        )}

        {step===4 && (
          <div>
            <div style={{ marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <h2 style={{ color:C.textBright, fontSize:20, fontWeight:700, margin:"0 0 4px" }}>Preview & Export</h2>
                <p style={{ color:C.textDim, margin:0, fontSize:13 }}>{selected.size} documents assembled · INDEX page auto-generated · merged in selection order</p>
              </div>
              <button onClick={handleMerge} disabled={merging} style={{ ...btnP, display:"flex", alignItems:"center", gap:7, opacity:merging?0.6:1 }}>
                {merging ? `⏳ ${mergeStatus || "Working…"}` : "📦 Download Merged PDF"}
              </button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:16 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {selectedInOrder().map((doc,idx)=>{
                  const ok = (doc.aiGenerated && !!generated[doc.key]) || (doc.manual && !!manualFiles[doc.key]);
                  const active = activeDoc===doc.key;
                  return (
                    <div key={doc.key} onClick={()=>setActiveDoc(doc.key)} style={{ background:active?`${C.accent}15`:C.card, border:`1px solid ${active?C.accent:C.border}`, borderRadius:7, padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:22, height:22, borderRadius:4, flexShrink:0, background:active?C.accent:C.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:active?"#000":C.textDim }}>{idx+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color:active?C.accent:C.text, fontSize:12, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{doc.label}</div>
                        <div style={{ fontSize:11, marginTop:2, color:ok?C.green:C.textDim }}>
                          {doc.aiGenerated?(generated[doc.key]
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
                        {docResult ? (
                          <div style={{ textAlign:"center", padding:"48px 32px" }}>
                            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
                            <div style={{ fontWeight:700, fontSize:16, color:C.textBright, marginBottom:8 }}>{doc.label} — Filled</div>
                            <div style={{ fontSize:13, color:C.textDim, marginBottom:28 }}>Template filled and saved to Google Drive</div>
                            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                              <a href={docResult.viewLink} target="_blank" rel="noreferrer" style={{ background:`${C.blue}18`, border:`1px solid ${C.blue}44`, borderRadius:6, color:C.blue, padding:"10px 22px", fontSize:13, fontWeight:600, textDecoration:"none" }}>📄 Open in Drive</a>
                              <a href={docResult.downloadLink} target="_blank" rel="noreferrer" style={{ background:`${C.green}18`, border:`1px solid ${C.green}44`, borderRadius:6, color:C.green, padding:"10px 22px", fontSize:13, fontWeight:600, textDecoration:"none" }}>⬇ Download DOCX</a>
                            </div>
                          </div>
                        ) : activeDoc==="cover" ? (
                          <div style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"48px 32px", textAlign:"center" }}>
                            <div style={{ fontSize:11, letterSpacing:"0.18em", color:C.textDim, marginBottom:16 }}>MATERIAL SUBMITTAL — PREVIEW</div>
                            <div style={{ fontSize:24, fontWeight:800, color:C.textBright, marginBottom:6 }}>{info.projectName||"[Project Name]"}</div>
                            <div style={{ fontSize:16, color:C.accent, marginBottom:32 }}>{info.productName||"[Product]"}</div>
                            <div style={{ display:"inline-block", textAlign:"left" }}>
                              {[
                                ["Client",info.client],
                                ["Main Contractor",info.mainContractor||"—"],
                                ["Subcontractor",info.subContractor||"—"],
                                ["Consultant",info.consultant||"—"],
                                ["Quotation No.",info.quoteNumber||"—"],
                                ["Location",info.location||"—"],
                                ["Date",info.date]
                              ].map(([k,v])=>(
                                <div key={k} style={{ display:"flex", gap:16, marginBottom:10, fontSize:13 }}>
                                  <span style={{ color:C.textDim, minWidth:120 }}>{k}</span>
                                  <span style={{ color:C.text }}>{v}</span>
                                </div>
                              ))}
                            </div>
                            <div style={{ marginTop:20, fontSize:11, color:C.textDim }}>⚠ Front Page template not filled — rebuild to retry.</div>
                          </div>
                        ) : driveFile ? (
                          <div style={{ textAlign:"center", padding:"60px 40px" }}>
                            <div style={{ fontSize:52, marginBottom:16 }}>📄</div>
                            <div style={{ fontWeight:700, fontSize:16, color:C.textBright, marginBottom:8 }}>{driveFile.name}</div>
                            <div style={{ fontSize:13, color:C.textDim, marginBottom:24 }}>PDF from your Google Drive library</div>
                            <a href={driveFile.webViewLink} target="_blank" rel="noreferrer" style={{ background:`${C.blue}18`, border:`1px solid ${C.blue}44`, borderRadius:6, color:C.blue, padding:"10px 22px", fontSize:13, fontWeight:600, textDecoration:"none" }}>Open in Google Drive →</a>
                            <div style={{ marginTop:24, padding:"12px 16px", background:`${C.accent}0a`, border:`1px solid ${C.accent}22`, borderRadius:6, fontSize:12, color:C.textDim }}>
                              Will be merged at position #{[...selected].indexOf(activeDoc)+1} in the final PDF.
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

            <div style={{ marginTop:16, padding:"10px 14px", background:`${C.green}0a`, border:`1px solid ${C.green}22`, borderRadius:8, fontSize:12, color:C.textDim }}>
              📑 An <strong style={{ color:C.green }}>INDEX page</strong> listing {indexCount()} document{indexCount()===1?"":"s"} will be auto-generated and inserted after the cover.
            </div>

            <div style={{ marginTop:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
              <button onClick={()=>{ setStep(2); setGenerated({}); setActiveDoc(null); }} style={btnG}>← Rebuild</button>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                {mergeError && <span style={{ fontSize:12, color:"#fca5a5" }}>⚠ {mergeError}</span>}
                {merging && mergeStatus && !mergeError && <span style={{ fontSize:12, color:C.blue }}>{mergeStatus}</span>}
                <button onClick={handleMerge} disabled={merging} style={{ ...btnP, opacity:merging?0.6:1, display:"flex", alignItems:"center", gap:7 }}>
                  {merging ? `⏳ ${mergeStatus || "Working…"}` : "📦 Download Merged PDF"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
