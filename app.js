(() => {
  "use strict";
  let records = [];
  let editingId = null;
  let editingVersion = null;
  let recycleView = false;
  let formDirty = false;
  let pollTimer = null;

  const $ = (id) => document.getElementById(id);
  const appPage = $("appPage"), loginScreen = $("loginScreen"), loginForm = $("loginForm");
  const loginError = $("loginError"), editor = $("editor"), form = $("companyForm");
  const listEl = $("companyList"), searchInput = $("searchInput"), countText = $("countText");
  const syncText = $("syncText"), importFile = $("importFile"), viewBanner = $("viewBanner"), viewBannerText = $("viewBannerText");
  const fields = { companyName: $("companyName"), taxNo: $("taxNo"), address: $("address"), phone: $("phone"), bankName: $("bankName"), bankAccount: $("bankAccount"), remark: $("remark") };

  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { showLogin(); throw new Error(payload.error || "登录已失效"); }
    if (!response.ok) { const error = new Error(payload.error || "操作失败"); error.status = response.status; throw error; }
    return payload;
  }

  function showLogin() { clearInterval(pollTimer); appPage.hidden = true; loginScreen.hidden = false; loginScreen.style.display = "grid"; }
  function showApp(actor) { $("currentActor").textContent = `当前成员：${actor}`; loginScreen.hidden = true; loginScreen.style.display = "none"; appPage.hidden = false; startPolling(); }

  async function init() {
    try {
      const session = await api("/api/session", { headers: {} });
      if (session.authenticated) { showApp(session.actor); await loadRecords(); } else showLogin();
    } catch { showLogin(); }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); loginError.textContent = "";
    const button = loginForm.querySelector("button"); button.disabled = true; button.textContent = "正在验证…";
    try {
      const result = await api("/api/login", { method: "POST", body: JSON.stringify({ actor: $("actorInput").value, password: $("passwordInput").value }) });
      $("passwordInput").value = ""; showApp(result.actor); await loadRecords();
    } catch (error) { loginError.textContent = error.message; }
    finally { button.disabled = false; button.textContent = "进入管理工具"; }
  });

  $("logoutBtn").addEventListener("click", async () => { await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {}); showLogin(); });

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) loadRecords(true); }, 10000);
  }
  window.addEventListener("focus", () => { if (!appPage.hidden) loadRecords(true); });

  async function loadRecords(silent = false) {
    if (!silent) syncText.textContent = "正在同步…";
    try {
      const data = await api(`/api/companies?deleted=${recycleView ? 1 : 0}`, { headers: {} });
      records = data.records || []; render();
      syncText.textContent = `已同步 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) { syncText.textContent = "同步失败"; if (!silent) showToast(error.message); }
  }

  function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch])); }
  function normalize(value = "") { return String(value).toLowerCase().replace(/\s+/g, ""); }
  function filteredRecords() { const q = normalize(searchInput.value); return q ? records.filter((r) => normalize([r.companyName,r.taxNo,r.address,r.phone,r.bankName,r.bankAccount,r.remark].join(" ")).includes(q)) : [...records]; }
  function formatTime(value) { if (!value) return ""; return new Date(value).toLocaleString("zh-CN", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }); }

  function render() {
    const filtered = filteredRecords();
    countText.textContent = searchInput.value.trim() ? `找到${filtered.length}家公司` : `${recycleView ? "回收站共" : "共"}${records.length}家公司`;
    viewBanner.hidden = false;
    viewBannerText.textContent = recycleView ? "当前正在查看回收站，删除的数据仍保存在云数据库中。" : "当前正在查看公司列表。";
    $("backBtn").textContent = recycleView ? "返回公司列表" : "查看回收站";
    $("trashBtn").hidden = recycleView; $("addBtn").disabled = recycleView;
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-symbol">票</div><h2 class="empty-title">${recycleView ? "回收站为空" : records.length ? "没有找到匹配的公司" : "还没有录入开票信息"}</h2><p class="empty-desc">${recycleView ? "删除的公司资料会暂时保留在这里。" : records.length ? "请尝试更换公司名称、税号或银行关键词。" : "点击右上角「新增开票信息」开始录入。"}</p></div>`;
      return;
    }
    listEl.innerHTML = filtered.map((item) => `<article class="company-card"><div class="card-head"><div><div class="company-name">${escapeHtml(item.companyName)}</div><div class="record-meta">${escapeHtml(item.updatedBy ? `最近由 ${item.updatedBy} 更新 · ` : "")}${formatTime(item.updatedAt)}</div></div><div class="actions">${recycleView ? `<button class="btn small restore" data-action="restore" data-id="${item.id}">恢复</button>` : `<button class="btn small" data-action="edit" data-id="${item.id}">编辑</button><button class="btn small danger" data-action="delete" data-id="${item.id}">删除</button>`}</div></div><div class="info-list">${row("税号",item.taxNo)}${row("地址",item.address)}${row("电话",item.phone)}${row("开户行",item.bankName)}${row("银行账号",item.bankAccount)}${row("备注",item.remark)}</div>${recycleView ? "" : `<div class="card-footer"><button class="btn small" data-action="copy" data-id="${item.id}">复制全部信息</button></div>`}</article>`).join("");
  }
  function row(label, value) { return `<div class="info-row"><div class="info-label">${label}</div><div class="info-value">${value ? escapeHtml(value) : '<span class="unfilled">未填写</span>'}</div></div>`; }

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]"); if (!button) return;
    const item = records.find((r) => r.id === button.dataset.id); if (!item) return;
    const action = button.dataset.action;
    if (action === "edit") openEditor(item);
    if (action === "delete") deleteRecord(item);
    if (action === "restore") restoreRecord(item);
    if (action === "copy") copyRecord(item);
  });

  function openEditor(record = null) {
    editingId = record?.id || null; editingVersion = record?.version || null; formDirty = false;
    $("modalTitle").textContent = record ? "编辑开票信息" : "新增开票信息";
    Object.keys(fields).forEach((key) => fields[key].value = record?.[key] || "");
    editor.showModal(); setTimeout(() => fields.companyName.focus(), 40);
  }
  function closeEditor() { editor.close(); form.reset(); editingId = null; editingVersion = null; formDirty = false; }
  $("addBtn").addEventListener("click", () => openEditor());
  $("closeBtn").addEventListener("click", () => { if (!formDirty || confirm("当前填写内容尚未保存，确定关闭吗？")) closeEditor(); });
  editor.addEventListener("cancel", (event) => event.preventDefault());
  form.addEventListener("input", () => formDirty = true);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value.trim()]));
    if (editingId) { payload.id = editingId; payload.version = editingVersion; }
    const saveBtn = $("saveBtn"); saveBtn.disabled = true; saveBtn.textContent = "正在保存…";
    try {
      await api("/api/companies", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      closeEditor(); await loadRecords(); showToast("已保存并同步到云端");
    } catch (error) { showToast(error.status === 409 ? `${error.message}，已为你刷新列表` : error.message); if (error.status === 409) await loadRecords(); }
    finally { saveBtn.disabled = false; saveBtn.textContent = "保存信息"; }
  });

  async function deleteRecord(item) {
    if (!confirm(`确定将“${item.companyName}”移入回收站吗？\n资料不会立即永久删除，可在回收站恢复。`)) return;
    try { await api("/api/companies", { method:"DELETE", body:JSON.stringify({ id:item.id, version:item.version }) }); await loadRecords(); showToast("已移入回收站"); } catch (error) { showToast(error.message); await loadRecords(true); }
  }
  async function restoreRecord(item) {
    try { await api("/api/companies", { method:"PATCH", body:JSON.stringify({ id:item.id, version:item.version, action:"restore" }) }); await loadRecords(); showToast("公司资料已恢复"); } catch (error) { showToast(error.message); }
  }
  async function copyRecord(item) {
    const text = [`公司名称：${item.companyName}`,`纳税人识别号：${item.taxNo}`,`注册地址：${item.address}`,`注册电话：${item.phone || ""}`,`开户银行：${item.bankName}`,`银行账号：${item.bankAccount}`,item.remark ? `备注：${item.remark}` : ""].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(text); showToast("已复制全部开票信息"); } catch { showToast("复制失败，请手动选择文本"); }
  }

  searchInput.addEventListener("input", render);
  $("refreshBtn").addEventListener("click", () => loadRecords());
  $("trashBtn").addEventListener("click", async () => { recycleView = true; searchInput.value = ""; await loadRecords(); });
  $("backBtn").addEventListener("click", async () => { recycleView = false; searchInput.value = ""; await loadRecords(); });

  $("exportBtn").addEventListener("click", async () => {
    try { const data = await api("/api/export", { headers: {} }); const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`开票信息云端备份_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); showToast("云端备份已导出"); } catch(error){ showToast(error.message); }
  });
  $("importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file=importFile.files?.[0]; importFile.value=""; if(!file) return;
    try { const data=JSON.parse(await file.text()); const count=Array.isArray(data)?data.length:(data.records?.length||0); if(!confirm(`将导入 ${count} 条资料；相同税号会更新为备份中的内容。是否继续？`)) return; const result=await api("/api/import",{method:"POST",body:JSON.stringify(data)}); recycleView=false; await loadRecords(); showToast(`成功导入 ${result.imported} 条资料`); } catch(error){ showToast(error.message || "导入失败，请检查备份格式"); }
  });

  let toastTimer;
  function showToast(message) { const toast=$("toast"); toast.textContent=message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove("show"),2600); }

  init();
})();
