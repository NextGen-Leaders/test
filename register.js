/* Public registration page. Uses only the public Supabase key and RLS-protected tables. */
(() => {
  const config = window.FSAC_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const ready = !!(window.supabase && config.SUPABASE_URL && config.SUPABASE_ANON_KEY && !config.SUPABASE_URL.includes("YOUR-TEST") && !config.SUPABASE_ANON_KEY.includes("YOUR_TEST"));
  const db = ready ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  let conferences = [];
  const setMessage = (el, text, type) => { el.textContent = text || ""; el.className = "message " + (type || ""); };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sameId = (a,b) => a != null && b != null && String(a) === String(b);
  async function loadConferences() {
    if (!db) throw new Error("Configurez config.js avec les identifiants du projet Supabase TEST.");
    const { data, error } = await db.from("conferences").select("id,name,registration_open").order("created_at", {ascending:true});
    if (error) throw error;
    conferences = (data || []).filter(c => c.registration_open === true || c.registration_open === "true" || c.registration_open === 1);
    $("conference_id").innerHTML = '<option value="">Choisir une formation…</option>' + conferences.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    if (!conferences.length) setMessage($("registration-message"), "Aucune formation n’accepte actuellement les inscriptions.", "error");
  }
  $("registration-form").addEventListener("submit", async (e) => {
    e.preventDefault(); setMessage($("registration-message"), "Envoi en cours…");
    try {
      if (!db) throw new Error("Configuration requise : configurez config.js avec les identifiants Supabase TEST.");
      const form = e.currentTarget, fd = new FormData(form), selectedId = fd.get("conference_id");
      const conference = conferences.find(c => sameId(c.id, selectedId));
      if (!selectedId || !conference) throw new Error("Veuillez sélectionner une formation valide.");
      if (!(conference.registration_open === true || conference.registration_open === "true" || conference.registration_open === 1)) throw new Error("Les inscriptions à cette formation sont fermées.");
      const record = Object.fromEntries(fd.entries());
      ["last_name","first_name","email","phone","student_code","institution","notes"].forEach(k => record[k] = (record[k] || "").trim() || null);
      record.conference_id = conference.id;
      const { error } = await db.from("participants").insert(record);
      if (error) {
        if (error.code === "42501" || /row-level security|permission denied/i.test(error.message || "")) throw new Error("Supabase a refusé l’inscription. Vérifiez la politique INSERT de la table participants dans le projet TEST.");
        throw error;
      }
      form.reset();
      setMessage($("registration-message"), "Inscription envoyée avec succès. Merci !", "success");
    } catch (err) { setMessage($("registration-message"), err.message || "Erreur pendant l’inscription.", "error"); }
  });
  if (!ready) {
    $("conference_id").innerHTML = '<option value="">Configurez Supabase TEST</option>';
    setMessage($("registration-message"), "Configuration requise : copiez config.example.js en config.js et ajoutez les identifiants Supabase TEST.", "error");
  } else loadConferences().catch(err => setMessage($("registration-message"), "Impossible de charger les formations : " + (err.message || err), "error"));
})();