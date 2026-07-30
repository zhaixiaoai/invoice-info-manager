(() => {
  "use strict";

  let records = [];
  let editingId = null;
  let editingVersion = null;
  let recycleView = false;
  let formDirty = false;
  let pollTimer = null;
  let currentRole = "viewer";
  let viewObserver = null;
  const viewLoggedIds = new Set();
  let permissionMemberId = null;
  let permissionCompanies = [];
  let permissionSelectedIds = new Set();

  const $ = (id) => document.getElementById(id);
  const appPage = $("appPage"), loginScreen = $("loginScreen"), loginForm = $("loginForm");
  const loginError = $("loginError"), editor = $("editor"), form = $("companyForm"), modalError = $("modalError");
  const listEl = $("companyList"), searchInput = $("searchInput"), countText = $("countText");
  const syncText = $("syncText"), importFile = $("importFile"), viewBanner = $("viewBanner"), viewBannerText = $("viewBannerText");
  const membersDialog = $("membersDialog"), memberForm = $("memberForm"), memberError = $("memberError"), membersList = $("membersList");
  const logsDialog = $("logsDialog"), logsList = $("logsList");
  const permissionsDialog = $("permissionsDialog"), permissionsForm = $("permissionsForm");
  const permissionsError = $("permissionsError"), permissionCompanyPanel = $("permissionCompanyPanel");
  const permissionCompanyList = $("permissionCompanyList"), permissionSearch = $("permissionSearch"), permissionSummary = $("permissionSummary");
  const fields = {
    companyName: $("companyName"), taxNo: $("taxNo"), address: $("address"), phone: $("phone"),
    bankName: $("bankName"), bankAccount: $("bankAccount"), remark: $("remark"),
  };

  function isAdmin() { return currentRole === "admin"; }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      showLogin();
      throw new Error(payload.error || "登录已失效");
    }
    if (!response.ok) {
      const error = new Error(payload.error || "操作失败");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function disconnectViewObserver() {
    if (viewObserver) viewObserver.disconnect();
    viewObserver = null;
  }

  function showLogin() {
    clearInterval(pollTimer);
    disconnectViewObserver();
    currentRole = "viewer";
    recycleView = false;
    records = [];
    viewLoggedIds.clear();
    appPage.hidden = true;
    loginScreen.hidden = false;
    loginScreen.style.display = "grid";
  }

  function applyPermissions() {
    document.querySelectorAll("[data-admin-only]").forEach((element) => { element.hidden = !isAdmin(); });
    if (!isAdmin()) recycleView = false;
  }

  function showApp(actor, role, username = "") {
    currentRole = role === "admin" ? "admin" : "viewer";
    const identity = isAdmin() ? actor : username && username !== actor ? `${actor}（${username}）` : actor;
    $("currentActor").textContent = `当前成员：${identity} · ${isAdmin() ? "管理员" : "只读成员"}`;
    applyPermissions();
    viewLoggedIds.clear();
    loginScreen.hidden = true;
    loginScreen.style.display = "none";
    appPage.hidden = false;
    startPolling();
  }

  async function init() {
    try {
      const session = await api("/api/session", { headers: {} });
      if (session.authenticated) {
        showApp(session.actor, session.role, session.username);
        await loadRecords();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const button = loginForm.querySelector("button");
    button.disabled = true;
    button.textContent = "正在验证…";
    try {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ actor: $("actorInput").value, password: $("passwordInput").value }),
      });
      $("passwordInput").value = "";
      showApp(result.actor, result.role, result.username);
      await loadRecords();
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "进入管理工具";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
    showLogin();
  });

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) loadRecords(true); }, 10000);
  }

  window.addEventListener("focus", () => { if (!appPage.hidden) loadRecords(true); });

  async function loadRecords(silent = false) {
    if (!isAdmin() && recycleView) recycleView = false;
    if (!silent) syncText.textContent = "正在同步…";
    try {
      const data = await api(`/api/companies?deleted=${recycleView ? 1 : 0}`, { headers: {} });
      records = data.records || [];
      render();
      syncText.textContent = `已同步 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) {
      syncText.textContent = "同步失败";
      if (!silent) showToast(error.message);
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
  }

  function normalize(value = "") { return String(value).toLowerCase().replace(/\s+/g, ""); }

  function filteredRecords() {
    const q = normalize(searchInput.value);
    return q ? records.filter((r) => normalize([
      r.companyName, r.taxNo, r.address, r.phone, r.bankName, r.bankAccount, r.remark,
    ].join(" ")).includes(q)) : [...records];
  }

  function formatTime(value, full = false) {
    if (!value) return "—";
    return new Date(value).toLocaleString("zh-CN", full
      ? { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" }
      : { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }

  function render() {
    disconnectViewObserver();
    const filtered = filteredRecords();
    countText.textContent = searchInput.value.trim() ? `找到${filtered.length}家公司` : `${recycleView ? "回收站共" : "共"}${records.length}家公司`;
    viewBanner.hidden = false;
    viewBannerText.textContent = recycleView
      ? "当前正在查看回收站，删除的数据仍保存在云数据库中。"
      : isAdmin()
        ? "当前正在查看公司列表。"
        : "当前正在查看公司列表（只读模式，可查询和复制开票信息）。";
    $("backBtn").textContent = recycleView ? "返回公司列表" : "查看回收站";
    $("backBtn").hidden = !isAdmin();
    $("trashBtn").hidden = !isAdmin() || recycleView;
    $("addBtn").hidden = !isAdmin();

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-symbol">票</div><h2 class="empty-title">${recycleView ? "回收站为空" : records.length ? "没有找到匹配的公司" : "还没有录入开票信息"}</h2><p class="empty-desc">${recycleView ? "删除的公司资料会暂时保留在这里。" : records.length ? "请尝试更换公司名称、税号或银行关键词。" : isAdmin() ? "点击右上角「新增开票信息」开始录入。" : "暂无可查看的开票信息。"}</p></div>`;
      return;
    }

    listEl.innerHTML = filtered.map((item) => {
      const actions = isAdmin()
        ? recycleView
          ? `<button class="btn small restore" data-action="restore" data-id="${item.id}">恢复</button>`
          : `<button class="btn small" data-action="edit" data-id="${item.id}">编辑</button><button class="btn small danger" data-action="delete" data-id="${item.id}">删除</button>`
        : "";
      return `<article class="company-card" data-company-id="${item.id}"><div class="card-head"><div><div class="company-name">${escapeHtml(item.companyName)}</div><div class="record-meta">${escapeHtml(item.updatedBy ? `最近由 ${item.updatedBy} 更新 · ` : "")}${formatTime(item.updatedAt)}</div></div><div class="actions">${actions}</div></div><div class="info-list">${row("税号", item.taxNo)}${row("地址", item.address)}${row("电话", item.phone)}${row("开户行", item.bankName)}${row("银行账号", item.bankAccount)}${row("备注", item.remark)}</div>${recycleView ? "" : `<div class="card-footer"><button class="btn small" data-action="copy" data-id="${item.id}">复制全部信息</button></div>`}</article>`;
    }).join("");

    setupViewTracking();
  }

  function row(label, value) {
    return `<div class="info-row"><div class="info-label">${label}</div><div class="info-value">${value ? escapeHtml(value) : '<span class="unfilled">未填写</span>'}</div></div>`;
  }

  function setupViewTracking() {
    if (isAdmin() || recycleView || !("IntersectionObserver" in window)) return;
    viewObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        const companyId = entry.target.dataset.companyId;
        if (!companyId || viewLoggedIds.has(companyId)) return;
        viewLoggedIds.add(companyId);
        viewObserver.unobserve(entry.target);
        logActivity("view", companyId);
      });
    }, { threshold: [0.5] });
    listEl.querySelectorAll(".company-card[data-company-id]").forEach((card) => viewObserver.observe(card));
  }

  function logActivity(eventType, companyId) {
    api("/api/activity", {
      method: "POST",
      body: JSON.stringify({ eventType, companyId }),
    }).catch(() => {});
  }

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = records.find((r) => r.id === button.dataset.id);
    if (!item) return;
    const action = button.dataset.action;
    if (action === "copy") return copyRecord(item);
    if (!isAdmin()) return showToast("当前账号为只读权限");
    if (action === "edit") openEditor(item);
    if (action === "delete") deleteRecord(item);
    if (action === "restore") restoreRecord(item);
  });

  function clearModalError() {
    modalError.textContent = "";
    modalError.hidden = true;
  }

  function showModalError(message) {
    modalError.textContent = message;
    modalError.hidden = false;
    editor.scrollTop = 0;
    requestAnimationFrame(() => modalError.focus({ preventScroll: true }));
  }

  function openEditor(record = null) {
    if (!isAdmin()) return showToast("当前账号为只读权限");
    editingId = record?.id || null;
    editingVersion = record?.version || null;
    formDirty = false;
    clearModalError();
    $("modalTitle").textContent = record ? "编辑开票信息" : "新增开票信息";
    Object.keys(fields).forEach((key) => { fields[key].value = record?.[key] || ""; });
    editor.showModal();
    editor.scrollTop = 0;
    setTimeout(() => fields.companyName.focus(), 40);
  }

  function closeEditor() {
    editor.close();
    form.reset();
    clearModalError();
    editingId = null;
    editingVersion = null;
    formDirty = false;
  }

  $("addBtn").addEventListener("click", () => openEditor());
  $("closeBtn").addEventListener("click", () => {
    if (!formDirty || confirm("当前填写内容尚未保存，确定关闭吗？")) closeEditor();
  });
  editor.addEventListener("cancel", (event) => event.preventDefault());
  form.addEventListener("input", () => { formDirty = true; clearModalError(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin()) return showModalError("当前账号为只读权限，不能保存信息");
    const payload = Object.fromEntries(Object.entries(fields).map(([key, element]) => [key, element.value.trim()]));
    if (editingId) { payload.id = editingId; payload.version = editingVersion; }
    const saveBtn = $("saveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "正在保存…";
    try {
      clearModalError();
      const result = await api("/api/companies", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeEditor();
      await loadRecords();
      showToast(result.restored ? "已恢复原记录并同步到云端" : "已保存并同步到云端");
    } catch (error) {
      showModalError(error.message);
      if (error.status === 409 && editingId) await loadRecords(true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "保存信息";
    }
  });

  async function deleteRecord(item) {
    if (!isAdmin()) return showToast("当前账号为只读权限");
    if (!confirm(`确定将“${item.companyName}”移入回收站吗？\n资料不会立即永久删除，可在回收站恢复。`)) return;
    try {
      await api("/api/companies", { method:"DELETE", body:JSON.stringify({ id:item.id, version:item.version }) });
      await loadRecords();
      showToast("已移入回收站");
    } catch (error) {
      showToast(error.message);
      await loadRecords(true);
    }
  }

  async function restoreRecord(item) {
    if (!isAdmin()) return showToast("当前账号为只读权限");
    try {
      await api("/api/companies", { method:"PATCH", body:JSON.stringify({ id:item.id, version:item.version, action:"restore" }) });
      await loadRecords();
      showToast("公司资料已恢复");
    } catch (error) {
      showToast(error.message);
    }
  }

  async function copyRecord(item) {
    const text = [
      `公司名称：${item.companyName}`,
      `纳税人识别号：${item.taxNo}`,
      `注册地址：${item.address}`,
      item.phone ? `注册电话：${item.phone}` : "",
      `开户银行：${item.bankName}`,
      `银行账号：${item.bankAccount}`,
      item.remark ? `备注：${item.remark}` : "",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制全部开票信息");
      logActivity("copy", item.id);
    } catch {
      showToast("复制失败，请手动选择文本");
    }
  }

  searchInput.addEventListener("input", render);
  $("refreshBtn").addEventListener("click", () => loadRecords());
  $("trashBtn").addEventListener("click", async () => {
    if (!isAdmin()) return showToast("当前账号为只读权限");
    recycleView = true;
    searchInput.value = "";
    await loadRecords();
  });
  $("backBtn").addEventListener("click", async () => {
    if (!isAdmin()) return showToast("当前账号为只读权限");
    recycleView = !recycleView;
    searchInput.value = "";
    await loadRecords();
  });

  $("exportBtn").addEventListener("click", async () => {
    if (!isAdmin()) return showToast("当前账号为只读权限");
    try {
      const data = await api("/api/export", { headers: {} });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `开票信息云端备份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("云端备份已导出");
    } catch (error) {
      showToast(error.message);
    }
  });

  $("importBtn").addEventListener("click", () => { if (isAdmin()) importFile.click(); });
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file || !isAdmin()) return;
    try {
      const data = JSON.parse(await file.text());
      const count = Array.isArray(data) ? data.length : (data.records?.length || 0);
      if (!confirm(`将检查并导入 ${count} 条资料；完全相同的记录会自动跳过。是否继续？`)) return;
      const result = await api("/api/import", { method:"POST", body:JSON.stringify(data) });
      recycleView = false;
      await loadRecords();
      showToast(`成功导入 ${result.imported} 条，跳过 ${result.skipped || 0} 条完全重复记录`);
    } catch (error) {
      showToast(error.message || "导入失败，请检查备份格式");
    }
  });

  function randomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const values = new Uint32Array(14);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => chars[value % chars.length]).join("");
  }

  function showMemberError(message = "") {
    memberError.textContent = message;
    memberError.hidden = !message;
    if (message) membersDialog.scrollTop = 0;
  }

  $("membersBtn").addEventListener("click", async () => {
    if (!isAdmin()) return;
    showMemberError();
    membersDialog.showModal();
    await loadMembers();
  });
  $("membersCloseBtn").addEventListener("click", () => membersDialog.close());
  membersDialog.addEventListener("cancel", (event) => { event.preventDefault(); membersDialog.close(); });
  $("membersRefreshBtn").addEventListener("click", loadMembers);
  $("generatePasswordBtn").addEventListener("click", () => {
    $("memberPassword").value = randomPassword();
    $("memberPassword").focus();
    $("memberPassword").select();
  });

  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMemberError();
    const submit = memberForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api("/api/members", {
        method: "POST",
        body: JSON.stringify({
          username: $("memberUsername").value,
          displayName: $("memberDisplayName").value,
          password: $("memberPassword").value,
        }),
      });
      memberForm.reset();
      await loadMembers();
      showToast("成员账号已创建，请把账号和初始口令单独发给本人");
    } catch (error) {
      showMemberError(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  async function loadMembers() {
    membersList.innerHTML = '<div class="manage-empty">正在加载成员…</div>';
    try {
      const data = await api("/api/members", { headers: {} });
      renderMembers(data.members || []);
    } catch (error) {
      membersList.innerHTML = `<div class="manage-empty error-text">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderMembers(members) {
    if (!members.length) {
      membersList.innerHTML = '<div class="manage-empty">还没有共享成员，请在上方创建第一个成员账号。</div>';
      return;
    }
    membersList.innerHTML = members.map((member) => {
      const permissionText = member.accessAll ? "全部公司" : `指定 ${member.permissionCount || 0} 家公司`;
      return `<div class="manage-row" data-member-id="${member.id}"><div class="manage-main"><div class="manage-title">${escapeHtml(member.displayName)} <span class="account-text">账号：${escapeHtml(member.username)}</span></div><div class="manage-meta">状态：<span class="status-text ${member.active ? "active" : "disabled"}">${member.active ? "在职可用" : "已停用"}</span> · 查看权限：<strong>${escapeHtml(permissionText)}</strong> · 最近登录：${formatTime(member.lastLoginAt, true)}</div></div><div class="manage-actions"><button class="btn small" data-member-action="permissions" data-id="${member.id}" data-name="${escapeHtml(member.displayName)}">设置查看权限</button><button class="btn small" data-member-action="reset" data-id="${member.id}">重置口令</button><button class="btn small ${member.active ? "danger" : "restore"}" data-member-action="toggle" data-id="${member.id}" data-active="${member.active ? "1" : "0"}">${member.active ? "停用账号" : "重新启用"}</button></div></div>`;
    }).join("");
  }

  membersList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-member-action]");
    if (!button) return;
    const action = button.dataset.memberAction;
    const id = button.dataset.id;
    try {
      if (action === "permissions") {
        await openPermissions(id, button.dataset.name || "成员");
        return;
      }
      if (action === "toggle") {
        const currentlyActive = button.dataset.active === "1";
        const wording = currentlyActive ? "停用后，该成员所有已登录设备会立即失效。确定停用吗？" : "确定重新启用该成员账号吗？";
        if (!confirm(wording)) return;
        await api("/api/members", {
          method: "PATCH",
          body: JSON.stringify({ id, action:"setActive", active:!currentlyActive }),
        });
        await loadMembers();
        showToast(currentlyActive ? "成员账号已停用" : "成员账号已重新启用");
      }
      if (action === "reset") {
        const suggested = randomPassword();
        const password = prompt("请输入新口令（至少8位）。重置后，该成员已登录设备会立即失效。", suggested);
        if (password === null) return;
        await api("/api/members", {
          method: "PATCH",
          body: JSON.stringify({ id, action:"resetPassword", password }),
        });
        showToast("成员口令已重置，请把新口令单独发给本人");
      }
    } catch (error) {
      showMemberError(error.message);
    }
  });


  function showPermissionsError(message = "") {
    permissionsError.textContent = message;
    permissionsError.hidden = !message;
    if (message) permissionsDialog.scrollTop = 0;
  }

  function permissionModeIsAll() {
    return $("permissionAll").checked;
  }

  function normalizePermissionSearch(value = "") {
    return String(value).trim().toLowerCase().replace(/\s+/g, "");
  }

  function filteredPermissionCompanies() {
    const query = normalizePermissionSearch(permissionSearch.value);
    if (!query) return permissionCompanies;
    return permissionCompanies.filter((company) => normalizePermissionSearch([
      company.companyName, company.taxNo, company.address, company.bankName, company.bankAccount,
    ].join(" ")).includes(query));
  }

  function updatePermissionSummary() {
    permissionSummary.textContent = `已选择 ${permissionSelectedIds.size} 家公司，共 ${permissionCompanies.length} 家可分配`;
  }

  function renderPermissionCompanies() {
    const companies = filteredPermissionCompanies();
    updatePermissionSummary();
    if (!companies.length) {
      permissionCompanyList.innerHTML = '<div class="manage-empty">没有找到匹配的公司。</div>';
      return;
    }
    permissionCompanyList.innerHTML = companies.map((company) => `<label class="permission-company-row"><input type="checkbox" data-permission-company-id="${company.id}" ${permissionSelectedIds.has(company.id) ? "checked" : ""} /><span class="permission-company-main"><strong>${escapeHtml(company.companyName)}</strong><small>税号：${escapeHtml(company.taxNo)} · 开户行：${escapeHtml(company.bankName)}</small></span></label>`).join("");
  }

  function applyPermissionMode() {
    permissionCompanyPanel.hidden = permissionModeIsAll();
    if (!permissionModeIsAll()) renderPermissionCompanies();
  }

  async function openPermissions(memberId, displayName) {
    permissionMemberId = memberId;
    permissionCompanies = [];
    permissionSelectedIds = new Set();
    showPermissionsError();
    $("permissionsTitle").textContent = `设置查看权限 · ${displayName}`;
    $("permissionsSubtitle").textContent = "可设置为查看全部公司，或只查看指定公司；保存后立即生效";
    permissionCompanyList.innerHTML = '<div class="manage-empty">正在加载公司权限…</div>';
    permissionSearch.value = "";
    if (membersDialog.open) membersDialog.close();
    permissionsDialog.showModal();
    try {
      const data = await api(`/api/permissions?memberId=${encodeURIComponent(memberId)}`, { headers: {} });
      permissionCompanies = data.companies || [];
      permissionSelectedIds = new Set(data.allowedIds || []);
      $("permissionAll").checked = Boolean(data.accessAll);
      $("permissionSelected").checked = !data.accessAll;
      applyPermissionMode();
      updatePermissionSummary();
    } catch (error) {
      showPermissionsError(error.message);
    }
  }

  async function closePermissions({ reopenMembers = true } = {}) {
    if (permissionsDialog.open) permissionsDialog.close();
    permissionMemberId = null;
    permissionCompanies = [];
    permissionSelectedIds = new Set();
    if (reopenMembers && isAdmin()) {
      membersDialog.showModal();
      await loadMembers();
    }
  }

  $("permissionsCloseBtn").addEventListener("click", () => closePermissions());
  permissionsDialog.addEventListener("cancel", (event) => { event.preventDefault(); closePermissions(); });
  $("permissionAll").addEventListener("change", applyPermissionMode);
  $("permissionSelected").addEventListener("change", applyPermissionMode);
  permissionSearch.addEventListener("input", renderPermissionCompanies);
  permissionCompanyList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-permission-company-id]");
    if (!checkbox) return;
    if (checkbox.checked) permissionSelectedIds.add(checkbox.dataset.permissionCompanyId);
    else permissionSelectedIds.delete(checkbox.dataset.permissionCompanyId);
    updatePermissionSummary();
  });
  $("permissionSelectVisibleBtn").addEventListener("click", () => {
    filteredPermissionCompanies().forEach((company) => permissionSelectedIds.add(company.id));
    renderPermissionCompanies();
  });
  $("permissionClearBtn").addEventListener("click", () => {
    permissionSelectedIds.clear();
    renderPermissionCompanies();
  });

  permissionsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!permissionMemberId) return;
    showPermissionsError();
    const saveButton = $("permissionsSaveBtn");
    saveButton.disabled = true;
    saveButton.textContent = "正在保存…";
    try {
      const accessAll = permissionModeIsAll();
      await api("/api/permissions", {
        method: "PATCH",
        body: JSON.stringify({
          memberId: permissionMemberId,
          accessAll,
          companyIds: accessAll ? [] : [...permissionSelectedIds],
        }),
      });
      showToast(accessAll ? "已设置为可查看全部公司" : `已设置为可查看 ${permissionSelectedIds.size} 家公司`);
      await closePermissions();
    } catch (error) {
      showPermissionsError(error.message);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "保存查看权限";
    }
  });

  $("logsBtn").addEventListener("click", async () => {
    if (!isAdmin()) return;
    logsDialog.showModal();
    await loadLogs();
  });
  $("logsCloseBtn").addEventListener("click", () => logsDialog.close());
  logsDialog.addEventListener("cancel", (event) => { event.preventDefault(); logsDialog.close(); });
  $("logsRefreshBtn").addEventListener("click", loadLogs);

  async function loadLogs() {
    logsList.innerHTML = '<div class="manage-empty">正在加载访问记录…</div>';
    try {
      const data = await api("/api/activity?limit=500", { headers: {} });
      renderLogs(data.logs || []);
    } catch (error) {
      logsList.innerHTML = `<div class="manage-empty error-text">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderLogs(logs) {
    if (!logs.length) {
      logsList.innerHTML = '<div class="manage-empty">暂无访问记录。新版上线后的登录、查看和复制操作会显示在这里。</div>';
      return;
    }
    const labels = { login:"登录系统", view:"查看信息", copy:"复制信息" };
    logsList.innerHTML = logs.map((log) => `<div class="log-row"><div class="log-action ${escapeHtml(log.event_type)}">${labels[log.event_type] || escapeHtml(log.event_type)}</div><div class="log-detail"><div><strong>${escapeHtml(log.actor)}</strong><span class="role-tag">${log.role === "admin" ? "管理员" : "共享成员"}</span>${log.company_name ? ` · ${escapeHtml(log.company_name)}` : ""}</div><div class="manage-meta">${formatTime(log.created_at, true)}</div></div></div>`).join("");
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  init();
})();
