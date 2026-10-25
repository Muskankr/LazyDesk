/* LazyDesk 2.0
 * Browser-only file metadata organizer. Does not upload, move, rename or delete files.
 * Optional AI uses the open-source Transformers.js runtime + MiniLM embeddings.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const categories = ["Documents","Images","Code","Data","Archives","Audio","Video","Presentations","Other"];
  const extCategory = {
    pdf:"Documents",doc:"Documents",docx:"Documents",txt:"Documents",rtf:"Documents",odt:"Documents",md:"Documents",
    png:"Images",jpg:"Images",jpeg:"Images",gif:"Images",webp:"Images",svg:"Images",bmp:"Images",heic:"Images",
    js:"Code",jsx:"Code",ts:"Code",tsx:"Code",py:"Code",java:"Code",c:"Code",cpp:"Code",h:"Code",html:"Code",css:"Code",json:"Code",xml:"Code",yml:"Code",yaml:"Code",sql:"Code",php:"Code",go:"Code",rs:"Code",
    csv:"Data",xls:"Data",xlsx:"Data",ods:"Data",parquet:"Data",db:"Data",sqlite:"Data",
    zip:"Archives",rar:"Archives","7z":"Archives",tar:"Archives",gz:"Archives",
    mp3:"Audio",wav:"Audio",ogg:"Audio",m4a:"Audio",flac:"Audio",
    mp4:"Video",mov:"Video",avi:"Video",mkv:"Video",webm:"Video",
    ppt:"Presentations",pptx:"Presentations",key:"Presentations"
  };
  const categoryWords = {
    Documents:["resume","cv","cover letter","invoice","contract","report","notes","letter","essay","assignment","proposal","meeting","manual","readme","document"],
    Images:["photo","image","screenshot","wallpaper","logo","banner","avatar","picture","design","illustration"],
    Code:["script","source","component","app","index","server","client","package","config","main","test","function","class"],
    Data:["dataset","data","export","backup","records","database","sales","analytics","spreadsheet","budget"],
    Archives:["archive","compressed","bundle","backup","package"],
    Audio:["audio","song","music","recording","podcast","voice"],
    Video:["video","movie","clip","screen recording","footage"],
    Presentations:["slides","presentation","pitch deck","deck"]
  };
  let files = [];
  let activity = [];
  let currentView = "overview";
  let layout = "table";
  let toastTimer;
  let aiExtractor = null;
  let aiReady = false;

  const safeText = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const extension = (name) => (String(name).split(".").pop() || "").toLowerCase().replace(name.includes(".") ? "" : /^/, "");
  const getExt = (name) => { const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1).toLowerCase() : "file"; };
  const formatSize = (bytes) => {
    if (!bytes) return "0 B";
    const units = ["B","KB","MB","GB","TB"], idx = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1);
    return `${(bytes/Math.pow(1024,idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  };
  const iconFor = (ext) => ({pdf:"PDF",doc:"DOC",docx:"DOC",txt:"TXT",md:"MD",png:"IMG",jpg:"IMG",jpeg:"IMG",svg:"SVG",js:"JS",jsx:"JSX",ts:"TS",tsx:"TSX",py:"PY",html:"HTML",css:"CSS",json:"JSON",csv:"CSV",xlsx:"XLS",zip:"ZIP",mp3:"♫",mp4:"▶"}[ext] || ext.slice(0,4).toUpperCase());
  const categoryFromName = (name) => {
    const lower = name.toLowerCase();
    for (const [cat, words] of Object.entries(categoryWords)) if (words.some(w => lower.includes(w))) return cat;
    return null;
  };
  function suggestCategory(file) {
    const ext = getExt(file.name);
    return categoryFromName(file.name) || extCategory[ext] || "Other";
  }
  function addActivity(title, detail, icon = "✦") {
    activity.unshift({id:Date.now()+Math.random(),title,detail,time:new Date(),icon});
    activity = activity.slice(0,100);
    renderActivity();
  }
  function toast(message) {
    $("toastMessage").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3000);
  }
  function duplicateKey(f) { return `${f.name.toLowerCase()}|${f.size}`; }
  function duplicateKeys() {
    const counts = new Map();
    files.forEach(f => counts.set(duplicateKey(f), (counts.get(duplicateKey(f)) || 0) + 1));
    return new Set([...counts].filter(([,count]) => count > 1).map(([key]) => key));
  }
  function renderStats() {
    $("statFiles").textContent = files.length;
    $("statSize").textContent = formatSize(files.reduce((sum,f)=>sum+f.size,0));
    $("statSuggestions").textContent = files.filter(f=>!f.reviewed).length;
    const dup = duplicateKeys();
    $("statDuplicates").textContent = files.filter(f=>dup.has(duplicateKey(f))).length;
    $("navFileCount").textContent = files.length;
    $("navDupCount").textContent = files.filter(f=>dup.has(duplicateKey(f))).length;
    $("tableCount").textContent = files.length;
  }
  function populateCategorySelects() {
    ["categoryFilter","categoryFilterAll"].forEach(id => {
      const el = $(id), previous = el.value || "all";
      el.innerHTML = '<option value="all">All categories</option>' + categories.map(c=>`<option value="${c}">${c}</option>`).join("");
      el.value = categories.includes(previous) ? previous : "all";
    });
  }
  function matchesFilters(f, searchId, categoryId, sortId) {
    const q = $(searchId)?.value.trim().toLowerCase() || "";
    const cat = $(categoryId)?.value || "all";
    return (!q || `${f.name} ${getExt(f.name)} ${f.category}`.toLowerCase().includes(q)) && (cat === "all" || f.category === cat);
  }
  function sorted(items, sortId) {
    const mode = $(sortId)?.value || "name";
    return [...items].sort((a,b) => {
      if(mode==="size-desc") return b.size-a.size;
      if(mode==="size-asc") return a.size-b.size;
      if(mode==="category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      if(mode==="type") return getExt(a.name).localeCompare(getExt(b.name)) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"});
    });
  }
  function fileRow(f, dupSet) {
    const dup = dupSet.has(duplicateKey(f));
    return `<tr data-id="${f.id}">
      <td><div class="file-name-cell"><span class="file-type-icon">${safeText(iconFor(getExt(f.name)))}</span><div class="file-name-text"><strong title="${safeText(f.name)}">${safeText(f.name)}</strong><small>${safeText(f.sourceLabel || "Selected file")}</small></div></div></td>
      <td><span class="type-pill">${safeText(getExt(f.name).toUpperCase())}</span></td>
      <td><select class="category-select" data-category-for="${f.id}" aria-label="Category for ${safeText(f.name)}">${categories.map(c=>`<option ${f.category===c?"selected":""} value="${c}">${c}</option>`).join("")}</select></td>
      <td>${formatSize(f.size)}</td><td><span class="status-pill ${dup?"duplicate":f.reviewed?"reviewed":"suggested"}">${dup?"Possible duplicate":f.reviewed?"Reviewed":"Suggested"}</span></td>
      <td><button class="row-action" data-remove="${f.id}" aria-label="Remove ${safeText(f.name)} from session" title="Remove from session">×</button></td></tr>`;
  }
  function fileCard(f, dupSet) {
    const dup = dupSet.has(duplicateKey(f));
    return `<article class="grid-file" data-id="${f.id}"><div class="grid-file-top"><span class="file-type-icon">${safeText(iconFor(getExt(f.name)))}</span><button class="row-action" data-remove="${f.id}" aria-label="Remove ${safeText(f.name)} from session">×</button></div><div class="file-name-text"><strong title="${safeText(f.name)}">${safeText(f.name)}</strong><small>${safeText(getExt(f.name).toUpperCase())} · ${dup?"Possible duplicate":f.reviewed?"Reviewed":"Suggested"}</small></div><div class="grid-size">${formatSize(f.size)}</div><select class="category-select" data-category-for="${f.id}" aria-label="Category for ${safeText(f.name)}">${categories.map(c=>`<option ${f.category===c?"selected":""} value="${c}">${c}</option>`).join("")}</select></article>`;
  }
  function bindDynamicActions(container) {
    container.querySelectorAll("[data-category-for]").forEach(sel => sel.addEventListener("change", () => {
      const f = files.find(x=>x.id===sel.dataset.categoryFor);
      if(!f) return;
      const old = f.category; f.category = sel.value; f.reviewed = true; f.aiSuggested = false;
      addActivity("Category updated", `${f.name}: ${old} → ${f.category}`, "↗");
      renderAll(); toast("Category updated");
    }));
    container.querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => {
      const f = files.find(x=>x.id===btn.dataset.remove);
      files = files.filter(x=>x.id!==btn.dataset.remove);
      if(f) addActivity("Removed from session", f.name, "−");
      renderAll(); toast("Removed from this session");
    }));
  }
  function renderFilesInto(tbodyId, emptyId, searchId, categoryId, sortId) {
    const tbody = $(tbodyId), empty = $(emptyId);
    if(!tbody || !empty) return;
    const filtered = sorted(files.filter(f=>matchesFilters(f,searchId,categoryId,sortId)),sortId);
    const dup = duplicateKeys();
    tbody.innerHTML = filtered.map(f=>fileRow(f,dup)).join("");
    const noFiles = files.length === 0;
    empty.classList.toggle("visible", filtered.length===0);
    if (tbody.closest(".table-wrap")) tbody.closest(".table-wrap").classList.toggle("hidden", filtered.length===0);
    if (emptyId==="emptyState") {
      $("fileGrid").classList.toggle("hidden", layout!=="grid" || filtered.length===0);
      $("tableWrap").classList.toggle("hidden", layout==="grid" || filtered.length===0);
      $("fileGrid").innerHTML = layout==="grid" ? filtered.map(f=>fileCard(f,dup)).join("") : "";
      bindDynamicActions($("fileGrid"));
      $("showingText").textContent = filtered.length ? `Showing ${filtered.length} of ${files.length} file${files.length===1?"":"s"}` : noFiles ? "No files yet" : "No matching files";
    }
    bindDynamicActions(tbody);
  }
  function renderDuplicateView() {
    const dup = duplicateKeys();
    const list = files.filter(f=>dup.has(duplicateKey(f)));
    $("duplicateTableBody").innerHTML = list.map(f=>`<tr><td><div class="file-name-cell"><span class="file-type-icon">${safeText(iconFor(getExt(f.name)))}</span><div class="file-name-text"><strong>${safeText(f.name)}</strong><small>Same name + size match</small></div></div></td><td>${safeText(getExt(f.name).toUpperCase())}</td><td>${formatSize(f.size)}</td><td><span class="status-pill duplicate">${safeText(duplicateKey(f))}</span></td></tr>`).join("");
    $("duplicateEmptyState").classList.toggle("visible",list.length===0);
    $("duplicateTableBody").closest(".table-wrap").classList.toggle("hidden",list.length===0);
  }
  function renderActivity() {
    $("activityList").innerHTML = activity.map(a=>`<div class="activity-item"><div class="activity-icon">${safeText(a.icon)}</div><div class="activity-copy"><strong>${safeText(a.title)}</strong><p>${safeText(a.detail)}</p><time>${a.time.toLocaleString()}</time></div></div>`).join("");
    $("activityEmptyState").classList.toggle("visible",activity.length===0);
    $("activityList").classList.toggle("hidden",activity.length===0);
  }
  function renderAll() {
    renderStats();
    renderFilesInto("fileTableBody","emptyState","searchInput","categoryFilter","sortSelect");
    renderFilesInto("allFileTableBody","allEmptyState","searchInputAll","categoryFilterAll","sortSelectAll");
    renderDuplicateView();
    renderActivity();
  }
  function addFiles(fileList) {
    const incoming = [...fileList];
    if(!incoming.length) return;
    let added=0, skipped=0;
    for(const file of incoming) {
      const already = files.some(f=>f.name===file.name && f.size===file.size && f.lastModified===file.lastModified);
      if(already){skipped++;continue;}
      files.push({id:`f_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name:file.name,size:file.size,lastModified:file.lastModified,category:suggestCategory(file),reviewed:false,sourceLabel:"Selected from device",file});
      added++;
    }
    if(added) addActivity("Files added", `${added} file${added===1?"":"s"} added to your session`, "＋");
    renderAll();
    toast(`${added} file${added===1?"":"s"} added${skipped?` · ${skipped} already in session`:""}`);
  }
  function exportPlan(format) {
    if(!files.length){toast("Add files before exporting a plan");return;}
    const payload = {app:"LazyDesk",version:"2.0",createdAt:new Date().toISOString(),note:"Preview only. This export does not move or rename files.",files:files.map(f=>({name:f.name,extension:getExt(f.name),sizeBytes:f.size,size:formatSize(f.size),suggestedCategory:f.category,reviewed:f.reviewed,possibleDuplicate:duplicateKeys().has(duplicateKey(f))}))};
    let blob, filename;
    if(format==="json"){blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});filename="lazydesk-organization-plan.json";}
    else {
      const rows=[["name","extension","size_bytes","suggested_category","reviewed","possible_duplicate"],...payload.files.map(f=>[f.name,f.extension,f.sizeBytes,f.suggestedCategory,f.reviewed,f.possibleDuplicate])];
      const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
      blob=new Blob([csv],{type:"text/csv;charset=utf-8"});filename="lazydesk-organization-plan.csv";
    }
    const url=URL.createObjectURL(blob), a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    addActivity("Organization plan exported", `${filename} · ${files.length} file entries`, "↗");
    renderAll();toast(`${format.toUpperCase()} plan exported`);
  }
  function showModal(title, html) {
    $("modalTitle").textContent=title;$("modalContent").innerHTML=html;$("modalBackdrop").classList.remove("hidden");$("modalOk").focus();
  }
  function closeModal() {$("modalBackdrop").classList.add("hidden");}
  function setView(view) {
    currentView=view;
    document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    document.querySelectorAll(".view-panel").forEach(p=>p.classList.remove("active-view"));
    const panel=$(view+"View"); if(panel) panel.classList.add("active-view");
    $("crumbView").textContent=({overview:"Overview",files:"All files",duplicates:"Duplicate candidates",activity:"Activity"})[view]||"Overview";
    $("sidebar").classList.remove("open");
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function setLayout(next) {
    layout=next;
    $("tableViewButton").classList.toggle("selected",layout==="table");
    $("gridViewButton").classList.toggle("selected",layout==="grid");
    renderAll();
  }
  async function enableAI() {
    if(aiReady){toast("Open-source AI is ready");return;}
    const button = $("enableAIButton");
    try {
      toast("Loading open-source AI runtime…");
      // Optional, online dependency: first use downloads the runtime and model.
      const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = true;
      aiExtractor = await mod.pipeline("feature-extraction","Xenova/all-MiniLM-L6-v2",{progress_callback:(p)=>{
        if(p.status==="progress" && p.total) toast(`Downloading AI model: ${Math.round(p.progress||0)}%`);
      }});
      aiReady=true;
      if(button) button.textContent="AI model ready";
      toast("Open-source MiniLM model loaded");
      addActivity("Open-source AI loaded","Transformers.js + all-MiniLM-L6-v2 ready in this browser","✳");
      renderAll();
    } catch(err) {
      console.error(err);
      toast("AI model could not load. Check internet and try again.");
    }
  }
  async function aiCategorize() {
    if(!files.length){toast("Add files first");return;}
    if(!aiExtractor){await enableAI();if(!aiExtractor)return;}
    const descriptionByCategory = {
      Documents:"Documents: PDFs, reports, resumes, letters, notes and text files",
      Images:"Images: photographs, pictures, screenshots, graphics and image files",
      Code:"Code: source code, scripts, programming files and software configuration",
      Data:"Data: datasets, spreadsheets, tables, CSV files and database exports",
      Archives:"Archives: compressed archives, zip files and packaged folders",
      Audio:"Audio: music, sound recordings, voice notes and audio files",
      Video:"Video: movies, video clips, recordings and footage",
      Presentations:"Presentations: slide decks, PowerPoint files and presentations",
      Other:"Other: miscellaneous files that do not fit another category"
    };
    try {
      toast("Comparing file names with category meanings…");
      const labels = await Promise.all(categories.map(async c=>{
        const out = await aiExtractor(descriptionByCategory[c],{pooling:"mean",normalize_embeddings:true});
        return {category:c,vector:Array.from(out.data)};
      }));
      for(const f of files) {
        const out=await aiExtractor(`File name: ${f.name}. File extension: ${getExt(f.name)}.`,{pooling:"mean",normalize_embeddings:true});
        const vec=Array.from(out.data);
        let best={category:f.category,score:-Infinity};
        for(const label of labels) {
          let score=0;for(let i=0;i<Math.min(vec.length,label.vector.length);i++)score+=vec[i]*label.vector[i];
          if(score>best.score)best={category:label.category,score};
        }
        f.category=best.category;f.reviewed=false;f.aiSuggested=true;f.aiScore=best.score;
      }
      addActivity("AI suggestions generated",`MiniLM compared ${files.length} file names with category descriptions`,"✳");
      renderAll();toast("AI category suggestions updated — review before exporting");
    } catch(err) {
      console.error(err);toast("AI categorization failed; your current categories were kept.");
    }
  }
  function setup() {
    $("footerYear").textContent=new Date().getFullYear();
    populateCategorySelects();
    document.querySelectorAll(".nav-item[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
    ["addFilesTop","addFilesAll","emptyAddButton"].forEach(id=>$(id).addEventListener("click",()=>$("fileInput").click()));
    $("fileInput").addEventListener("change",e=>{addFiles(e.target.files);e.target.value="";});
    const drop=$("dropZone");
    ["dragenter","dragover"].forEach(evt=>drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.add("drag-over");}));
    ["dragleave","drop"].forEach(evt=>drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.remove("drag-over");}));
    drop.addEventListener("drop",e=>addFiles(e.dataTransfer.files));
    drop.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("fileInput").click();}});
    ["searchInput","categoryFilter","sortSelect","searchInputAll","categoryFilterAll","sortSelectAll"].forEach(id=>$(id).addEventListener(id.startsWith("search")?"input":"change",renderAll));
    $("exportJson").addEventListener("click",()=>exportPlan("json"));
    $("exportCsv").addEventListener("click",()=>exportPlan("csv"));
    $("clearFiles").addEventListener("click",()=>{
      if(!files.length){toast("Your session is already empty");return;}
      showModal("Clear this session?",'<p>This removes the current file list from LazyDesk. It does <strong>not</strong> delete anything from your device.</p>');
      $("modalOk").onclick=()=>{const n=files.length;files=[];closeModal();addActivity("Session cleared",`${n} file entries removed from the workspace`,"−");renderAll();toast("Workspace cleared");$("modalOk").onclick=closeModal;};
    });
    $("tableViewButton").addEventListener("click",()=>setLayout("table"));
    $("gridViewButton").addEventListener("click",()=>setLayout("grid"));
    $("themeButton").addEventListener("click",()=>{
      const shell=document.querySelector(".app-shell"),light=shell.classList.toggle("light");
      localStorage.setItem("lazydesk-theme",light?"light":"dark");
      $("themeButton").textContent=light?"☾":"☼";
    });
    if(localStorage.getItem("lazydesk-theme")==="light"){document.querySelector(".app-shell").classList.add("light");$("themeButton").textContent="☾";}
    $("menuButton").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
    const how=()=>showModal("How LazyDesk works",'<p><strong>1. Import.</strong> Select files or drag them into the drop zone. The app reads file metadata in your browser.</p><p><strong>2. Review.</strong> Category suggestions use file extensions and filename keywords. Optional open-source AI uses Transformers.js and the MiniLM sentence-embedding model, if you choose to load it online.</p><p><strong>3. Export.</strong> Download a CSV or JSON organization plan. This prototype does not move, rename, upload or delete your files.</p><p><strong>Privacy note:</strong> file contents are not read. The optional model is downloaded from a CDN/Hugging Face when enabled.</p>');
    $("helpButton").addEventListener("click",how);$("aboutButton").addEventListener("click",how);$("footerHow").addEventListener("click",e=>{e.preventDefault();how();});
    $("modalClose").addEventListener("click",closeModal);$("modalOk").addEventListener("click",closeModal);
    $("modalBackdrop").addEventListener("click",e=>{if(e.target===$("modalBackdrop"))closeModal();});
    document.addEventListener("keydown",e=>{
      if(e.key==="Escape"){closeModal();$("sidebar").classList.remove("open");}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("searchInput").focus();}
      if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==="u"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)){$("fileInput").click();}
    });
    $("clearActivity").addEventListener("click",()=>{activity=[];renderActivity();toast("Activity cleared");});
    // Add the optional AI action to the import card, without making it a requirement for the basic app.
    const privacy=$(".privacy-note");
    const aiButton=document.createElement("button");
    aiButton.className="secondary-button ai-enable-button";
    aiButton.id="enableAIButton";
    aiButton.textContent="✳ Load open-source AI";
    aiButton.title="Downloads Transformers.js and the MiniLM model; requires internet";
    aiButton.addEventListener("click",aiCategorize);
    privacy.insertAdjacentElement("afterend",aiButton);
    addActivity("Workspace ready","LazyDesk 2.0 initialized in your browser","✦");
    renderAll();
  }
  setup();
})();
