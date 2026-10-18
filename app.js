/* FSAC four-Masters registration — isolated test frontend.
   Configure config.js with the TEST project's URL and anon key. */
(() => {
  const config = window.FSAC_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const supabaseReady = !!(window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR-TEST") && !config.SUPABASE_ANON_KEY.includes("YOUR_TEST"));
  const db = supabaseReady ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const PAGE_SIZE = 25;
  let conferences = [], participants = [], filtered = [], page = 1, selected = new Set(), editing = null;

  const setMessage = (el, text, type) => { el.textContent = text || ""; el.className = "message " + (type || ""); };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const requireDb = () => { if (!db) throw new Error("Configurez d’abord config.js avec les identifiants du projet Supabase TEST."); };
  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const isTrue = v => v === true || v === 1 || (typeof v === "string" && v.trim().toLowerCase() === "true");
  const conferenceName = id => conferences.find(c => sameId(c.id, id))?.name || "Formation supprimée/inconnue";

  async function loadConferences() {
    requireDb();
    const { data, error } = await db.from("conferences").select("*").order("created_at", {ascending:true});
    if (error) throw error;
    conferences = (data || []).map(c => ({...c, registration_open: isTrue(c.registration_open)}));
    const open = conferences.filter(c => c.registration_open);
    $("filter-conference").innerHTML = '<option value="">Toutes les formations</option>' + conferences.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    const options = conferences.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    $("edit-conference").innerHTML = options;
    $("add-conference").innerHTML = options;
    renderConferences();
    $("stat-open").textContent = open.length;
  }

  async function loadParticipants() {
    requireDb();
    const { data, error } = await db.from("participants").select("*").order("created_at", {ascending:false});
    if (error) throw error;
    participants = data || [];
    applyFilters();
  }

  function applyFilters() {
    const q = $("search").value.trim().toLowerCase(), cid = $("filter-conference").value, presence = $("filter-presence").value;
    filtered = participants.filter(p => {
      const hay = [p.first_name,p.last_name,p.email,p.phone,p.student_code,p.institution].join(" ").toLowerCase();
      return (!q || hay.includes(q)) && (!cid || sameId(p.conference_id, cid)) && (!presence || String(isTrue(p.present)) === presence);
    });
    const ids = new Set(filtered.map(p => String(p.id)));
    selected = new Set([...selected].filter(id => ids.has(String(id))));
    page = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    renderParticipants();
  }

  function renderParticipants() {
    const start = (page - 1) * PAGE_SIZE, rows = filtered.slice(start, start + PAGE_SIZE);
    $("participants-body").innerHTML = rows.length ? rows.map(p => `<tr>
      <td><input class="row-check" type="checkbox" data-select="${esc(p.id)}" ${selected.has(String(p.id)) ? "checked" : ""} aria-label="Sélectionner ${esc(p.first_name)}"></td>
      <td><strong>${esc(p.last_name)} ${esc(p.first_name)}</strong><small>${esc(p.student_code || "Code non renseigné")}</small></td>
      <td>${esc(conferenceName(p.conference_id))}</td><td>${esc(p.email)}<small>${esc(p.phone || "")}</small></td>
      <td><button class="presence ${isTrue(p.present) ? "yes" : "no"}" data-presence="${esc(p.id)}" aria-label="Changer la présence">${isTrue(p.present) ? "Présent" : "Absent"}</button></td>
      <td><div class="row-actions"><button class="mini-action" data-edit="${esc(p.id)}">Modifier</button><button class="mini-action delete" data-delete="${esc(p.id)}">Supprimer</button></div></td>
    </tr>`).join("") : '<tr><td colspan="6" class="empty">Aucun participant trouvé.</td></tr>';
    $("page-label").textContent = `Page ${page} / ${Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))} · ${filtered.length} participant(s)`;
    $("prev-page").disabled = page <= 1; $("next-page").disabled = page >= Math.ceil(filtered.length/PAGE_SIZE);
    const visibleIds = rows.map(p => p.id);
    $("select-all").checked = visibleIds.length > 0 && visibleIds.every(id => selected.has(String(id)));
    $("stat-total").textContent = participants.length;
    $("stat-present").textContent = participants.filter(p => isTrue(p.present)).length;
  }

  function renderConferences() {
    $("conference-list").innerHTML = conferences.length ? conferences.map(c => `<div class="conference-item"><div><strong>${esc(c.name)}</strong><small>${esc(c.description || "Aucune description")}</small></div><div class="conf-actions"><span class="status-pill ${c.registration_open ? "" : "closed"}">${c.registration_open ? "Inscriptions ouvertes" : "Inscriptions fermées"}</span><button class="mini-action" data-toggle-conf="${esc(c.id)}">${c.registration_open ? "Fermer" : "Ouvrir"}</button><button class="mini-action" data-edit-conf="${esc(c.id)}">Modifier</button><button class="mini-action delete" data-delete-conf="${esc(c.id)}">Supprimer</button></div></div>`).join("") : '<p class="muted">Aucune formation. Ajoutez-en une ci-dessus.</p>';
  }

  async function refreshAll() { await loadConferences(); await loadParticipants(); }


  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    setMessage($("login-message"), "Connexion…");
    try {
      requireDb();
      const { error } = await db.auth.signInWithPassword({
        email: $("login-email").value.trim(),
        password: $("login-password").value
      });
      if (error) throw error;
      await showAdmin();
    } catch (err) {
      setMessage($("login-message"), err.message || "Connexion impossible.", "error");
    }
  });

  async function showAdmin() {
    if (!db) return;
    const { data: { user } } = await db.auth.getUser();
    if (!user) { $("login-form").classList.remove("hidden"); $("admin-app").classList.add("hidden"); $("sign-out").classList.add("hidden"); return; }
    // RLS validates admin membership on every query; this query gives a clear error for non-admin accounts.
    const { data, error } = await db.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error || !data) {
      await db.auth.signOut();
      setMessage($("login-message"), "Ce compte n’est pas autorisé comme administrateur.", "error");
      return;
    }
    $("login-form").classList.add("hidden"); $("admin-app").classList.remove("hidden"); $("sign-out").classList.remove("hidden");
    try { await refreshAll(); } catch(err) { alert("Chargement impossible : " + (err.message || err)); }
  }
  $("sign-out").addEventListener("click", async () => { await db.auth.signOut(); $("admin-app").classList.add("hidden"); $("login-form").classList.remove("hidden"); $("sign-out").classList.add("hidden"); });
  $("search").addEventListener("input", applyFilters);
  $("filter-conference").addEventListener("change", applyFilters);
  $("filter-presence").addEventListener("change", applyFilters);
  $("prev-page").addEventListener("click", () => { page = Math.max(1,page-1); renderParticipants(); });
  $("next-page").addEventListener("click", () => { page++; renderParticipants(); });
  $("select-all").addEventListener("change", e => {
    const ids = filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(p=>p.id);
    ids.forEach(id => e.target.checked ? selected.add(String(id)) : selected.delete(String(id))); renderParticipants();
  });
  $("participants-body").addEventListener("change", e => {
    const id = e.target.dataset.select; if (!id) return;
    e.target.checked ? selected.add(String(id)) : selected.delete(String(id)); renderParticipants();
  });
  $("participants-body").addEventListener("click", async e => {
    const presenceId = e.target.dataset.presence, editId = e.target.dataset.edit, deleteId = e.target.dataset.delete;
    try {
      if (presenceId) { const p=participants.find(x=>sameId(x.id,presenceId)); await updateParticipant(p.id,{present:!p.present}); }
      if (editId) openEdit(participants.find(x=>sameId(x.id,editId)));
      if (deleteId) await deleteParticipants([deleteId]);
    } catch(err) { alert(err.message || err); }
  });
  async function updateParticipant(id, changes) {
    const {error}=await db.from("participants").update(changes).eq("id",id); if(error)throw error; await loadParticipants();
  }
  async function deleteParticipants(ids) {
    if (!ids.length) return;
    if (!confirm(`Confirmer la suppression définitive de ${ids.length} participant(s) ? Cette action ne peut pas être annulée.`)) return;
    const {error}=await db.from("participants").delete().in("id",ids); if(error)throw error;
    selected.clear(); await loadParticipants();
  }
  $("bulk-present").addEventListener("click", async()=>{ if(!selected.size)return alert("Sélectionnez au moins un participant."); try { const {error}=await db.from("participants").update({present:true}).in("id",[...selected]);if(error)throw error;selected.clear();await loadParticipants(); }catch(e){alert(e.message||e);} });
  $("bulk-absent").addEventListener("click", async()=>{ if(!selected.size)return alert("Sélectionnez au moins un participant."); try { const {error}=await db.from("participants").update({present:false}).in("id",[...selected]);if(error)throw error;selected.clear();await loadParticipants(); }catch(e){alert(e.message||e);} });
  $("bulk-delete").addEventListener("click", async()=>{ try { await deleteParticipants([...selected]); }catch(e){alert(e.message||e);} });

  function openEdit(p) {
    if (!p) return; editing = p; const f=$("edit-form");
    ["id","last_name","first_name","email","phone","student_code","institution","conference_id","notes"].forEach(k=>{ if(f.elements[k])f.elements[k].value=p[k]??""; });
    f.elements.present.checked=isTrue(p.present); setMessage($("edit-message"),""); $("edit-modal").classList.remove("hidden");
  }
  function closeEdit() { $("edit-modal").classList.add("hidden"); editing=null; }
  $("close-modal").addEventListener("click",closeEdit); $("cancel-edit").addEventListener("click",closeEdit);
  $("edit-modal").addEventListener("click",e=>{if(e.target===$("edit-modal"))closeEdit();});
  $("edit-form").addEventListener("submit",async e=>{
    e.preventDefault(); if(!editing)return;
    try { const f=e.currentTarget, changes={}; ["last_name","first_name","email","phone","student_code","institution","conference_id","notes"].forEach(k=>changes[k]=(f.elements[k].value||"").trim()||null); changes.present=f.elements.present.checked;
      const {error}=await db.from("participants").update(changes).eq("id",editing.id); if(error)throw error;
      closeEdit(); await loadParticipants();
    } catch(err){setMessage($("edit-message"),err.message||"Modification impossible.","error");}
  });

  $("conference-form").addEventListener("submit",async e=>{
    e.preventDefault();try {const name=$("conf-name").value.trim(),description=$("conf-description").value.trim()||null;
      const {error}=await db.from("conferences").insert({name,description,registration_open:$("conf-open").checked});if(error)throw error;
      e.currentTarget.reset();$("conf-open").checked=true;await loadConferences();applyFilters();
    }catch(err){alert(err.message||err);}
  });
  $("conference-list").addEventListener("click",async e=>{
    try {
      const id=e.target.dataset.toggleConf, editId=e.target.dataset.editConf, deleteId=e.target.dataset.deleteConf;
      if(id){const c=conferences.find(x=>sameId(x.id,id));const {error}=await db.from("conferences").update({registration_open:!c.registration_open}).eq("id",id);if(error)throw error;await loadConferences();}
      if(editId){const c=conferences.find(x=>sameId(x.id,editId));const name=prompt("Nom de la formation :",c.name);if(name===null)return;if(!name.trim())return alert("Le nom est obligatoire.");const description=prompt("Description :",c.description||"");if(description===null)return;const {error}=await db.from("conferences").update({name:name.trim(),description:description.trim()||null}).eq("id",editId);if(error)throw error;await loadConferences();applyFilters();}
      if(deleteId){const c=conferences.find(x=>sameId(x.id,deleteId));if(!confirm(`Supprimer la formation « ${c.name} » ? Les participants associés ne seront pas supprimés automatiquement.`))return;const {error}=await db.from("conferences").delete().eq("id",deleteId);if(error)throw error;await refreshAll();}
    }catch(err){alert(err.message||err);}
  });

  $("export-csv").addEventListener("click",()=>{
    const rows=[["ID","Nom","Prénom","Email","Téléphone","Code étudiant","Établissement","Formation","Présence","Remarque","Créé le"],
      ...filtered.map(p=>[p.id,p.last_name,p.first_name,p.email,p.phone,p.student_code,p.institution,conferenceName(p.conference_id),isTrue(p.present)?"Présent":"Absent",p.notes,p.created_at])];
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="fsac-participants.csv";a.click();URL.revokeObjectURL(url);
  });

  // Manual participant creation
  const openAdd = () => { $("add-form").reset(); setMessage($("add-message"), ""); $("add-modal").classList.remove("hidden"); };
  const closeAdd = () => { $("add-modal").classList.add("hidden"); };
  $("add-participant-open").addEventListener("click", openAdd);
  $("close-add-modal").addEventListener("click", closeAdd);
  $("cancel-add").addEventListener("click", closeAdd);
  $("add-modal").addEventListener("click", e => { if (e.target === $("add-modal")) closeAdd(); });
  $("add-form").addEventListener("submit", async e => {
    e.preventDefault();
    setMessage($("add-message"), "Enregistrement en cours…");
    try {
      const f = e.currentTarget, fd = new FormData(f), conferenceId = fd.get("conference_id");
      const conference = conferences.find(c => sameId(c.id, conferenceId));
      if (!conference) throw new Error("Sélectionnez une formation valide.");
      const record = Object.fromEntries(fd.entries());
      ["last_name","first_name","email","phone","student_code","institution","notes"].forEach(k => record[k] = (record[k] || "").trim() || null);
      record.conference_id = conference.id;
      record.present = f.elements.present.checked;
      const { error } = await db.from("participants").insert(record);
      if (error) throw error;
      closeAdd();
      await loadParticipants();
      setMessage($("login-message"), "");
    } catch (err) { setMessage($("add-message"), err.message || "Impossible d’ajouter le participant.", "error"); }
  });

  if (!supabaseReady) {
    setMessage($("login-message"), "Configuration requise : copiez config.example.js en config.js et ajoutez les identifiants Supabase TEST.", "error");
    $("participants-body").innerHTML='<tr><td colspan="6" class="empty">Projet non configuré.</td></tr>';
  } else {
    db.auth.getSession().then(() => showAdmin());
  }
})();