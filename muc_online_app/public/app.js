const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const pageSizes = Array.from({ length: 9 }, (_, index) => 10 + index * 5);
const ataOptions = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, "0"));
const receiverStatusFilters = ["全部", "未读", "已读", "超期", "收藏"];
const publisherStatusFilters = ["全部", "未读", "已读", "超期", "收藏", "我发布"];
const adminStatusFilters = ["全部", "未读", "已读", "超期", "收藏", "我发布", "作废"];
const LOGIN_STORAGE_KEY = "muc_saved_login_v1";
const AUTO_LOGIN_SKIP_KEY = "muc_skip_auto_login_once";
const tabOptions = [
  ["homePage", "首页"],
  ["infoPage", "信息传达"],
  ["maintenancePage", "维修控制"],
  ["fixedPage", "固化项目"],
  ["hoursPage", "工时统计"],
  ["attendancePage", "考勤管理"],
  ["settingsPage", "系统设置"]
];
const permissionOptions = [
  ["view", "查看"],
  ["favorite", "收藏"],
  ["create", "发布"],
  ["edit", "修改"],
  ["delete", "删除"],
  ["feedback", "反馈"],
  ["remind", "催办"],
  ["export", "导出"],
  ["attachments", "附件"],
  ["admin", "系统管理"],
  ["fixedManage", "固化项目维护"]
];
const roleLabels = { receiver: "接收者", publisher: "发布者", admin: "管理员" };
const statusLabels = { active: "启用", disabled: "停用" };

const demoUsers = [
  { id: "00000001", username: "receiver", password: "123456", name: "接收者", role: "receiver", department: "航线车间", team: "一班", permissions: ["view"], allowedTabs: ["homePage", "infoPage", "maintenancePage"] },
  { id: "u-publisher", username: "publisher", password: "123456", name: "发布者", role: "publisher", department: "质量管理", team: "发布组", permissions: ["view", "create", "edit", "feedback", "remind", "export"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"] },
  { id: "54002010", username: "54002010", password: "muc2026", name: "系统管理员", role: "admin", department: "系统管理", team: "管理员", permissions: ["view", "favorite", "create", "edit", "delete", "feedback", "remind", "export", "admin", "fixedManage", "attachments"], allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage", "settingsPage"] }
];

const fallbackRecords = [
  { date: "2026-05-31 10:05", category: "规定要求", title: "安全生产月与安全大整治活动", original: "请各班组结合安全生产月要求，组织开展风险识别、问题排查和整改闭环，确保宣贯到每名维修人员。", publisher: "赵威", attachments: [{ id: "demo-att-001", name: "安全生产月宣贯材料.txt", type: "text/plain", size: 180, storage: "demo", url: "data:text/plain;charset=utf-8,%E5%AE%89%E5%85%A8%E7%94%9F%E4%BA%A7%E6%9C%88%E5%AE%A3%E8%B4%AF%E6%9D%90%E6%96%99", ownerType: "record", ownerId: "demo-record" }] },
  { date: "2026-05-28 09:30", category: "质量问题", title: "国籍证夹安装方式检查问题", original: "航后检查发现B8648飞机国籍证夹开胶，进一步检查发现该机国籍证夹安装位置不符合EO的要求，现场要求维修人员重新粘贴。", publisher: "黄磊" },
  { date: "2026-05-24 15:10", category: "规定要求", title: "班组考核方案调整", original: "本月班组考核方案调整三方感谢信奖励分配和优秀经验总结报送规则，请各班组按新要求执行。", publisher: "王大伟" },
  { date: "2026-05-21 08:45", category: "质量问题", title: "大翼金属胶带破损连续未处理", original: "6636飞机19/20连续两日在青航后，右大翼金属胶带破损均未处理，后续工作中类似问题要积极处理。", publisher: "黄金山" },
  { date: "2026-05-18 11:20", category: "规定要求", title: "撤锥桶信息及时传递", original: "5月16日有一起机坪违章，125机位撤锥桶时间晚，后续关于风速变化撤摆锥桶请班组长及时通过对讲机通知。", publisher: "盖光启" },
  { date: "2026-05-15 16:40", category: "质量问题", title: "飞机记录本填写要求", original: "CCAR121.701(a)条规定应记录运行中发现的缺陷和维修工作，请大家正确填写记录本，不要漏签。", publisher: "李雪" },
  { date: "2026-05-11 09:00", category: "规定要求", title: "机场督查5月重点检查项", original: "重点检查特殊天气管控、车辆倒车速度及指挥、工作梯等无动力设备状态、接送机保障流程及状态。", publisher: "赵威" },
  { date: "2026-05-01 07:50", category: "规定要求", title: "航前短停更换机轮起落架销提示牌要求", original: "航前短停更换机轮，使用起落架销时必须借用提示牌摆放在机头前。提示牌在外场工具间。", publisher: "王舰艇" },
  { date: "2026-04-24 19:35", category: "规定要求", title: "ARJ送机停止边推边启动", original: "ARJ飞机须立即暂停边推边启动程序，需要推到位停稳后方能启动。务必确保所有C909授权人员知晓。", publisher: "田元鹏" },
  { date: "2026-04-20 13:25", category: "质量问题", title: "工具清点记录不全", original: "检查近期航线工具间回收的工具清单，发现多份工具清单上工具清点记录不全，提醒维修人员规范落实工具三清点。", publisher: "黄金山" },
  { date: "2026-04-17 17:05", category: "规定要求", title: "机坪发动机冷转申请要求", original: "各位班组长，现在机坪发动机冷转也需要申请，请大家知晓。", publisher: "赵威" },
  { date: "2026-04-14 10:18", category: "质量问题", title: "定期水洗发动机反推失效提醒", original: "检查B323C飞机执行定期水洗发动机工作时，发现维修人员打开左发反推包皮后，未及时失效反推。", publisher: "黄磊" }
];

const defaultSettings = {
  categories: ["质量问题", "规定要求", "周例会", "日例会", "其他"],
  reminderDays: 1,
  overdueDays: 3,
  people: [
    { id: "00000001", name: "接收者", department: "未设置", team: "一班" },
    { id: "10000001", name: "王大伟", department: "未设置", team: "一班" },
    { id: "10000002", name: "赵威", department: "未设置", team: "管理组" },
    { id: "10000003", name: "黄金山", department: "未设置", team: "二班" },
    { id: "10000004", name: "黄磊", department: "未设置", team: "检查组" },
    { id: "10000005", name: "田元鹏", department: "未设置", team: "运行组" }
  ],
  rolePermissions: {
    receiver: { allowedTabs: ["homePage", "infoPage", "maintenancePage"], permissions: ["view"] },
    publisher: { allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage"], permissions: ["view", "create", "edit", "feedback", "remind", "export"] },
    admin: { allowedTabs: ["homePage", "infoPage", "maintenancePage", "fixedPage", "hoursPage", "attendancePage", "settingsPage"], permissions: ["view", "create", "edit", "delete", "feedback", "remind", "export", "admin", "fixedManage", "attachments"] }
  },
  securityNotes: "当前为静态演示版。正式上线需改为后端登录认证、数据库权限校验、附件访问鉴权、操作日志、撤回和修改留痕。"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const seedFixedProjects = [
  { id: "fp-001", ata: "32", title: "航前短停更换机轮固定提醒", contentHtml: "<p><b>步骤：</b>确认构型、借用起落架销、摆放提示牌、复核工具三清点。</p><p><b>风险：</b>提示牌遗漏、工具清点记录不完整、维护构型未复核。</p>", references: "AMM 32章；现场工具管理要求", attachments: [], createdAt: "2026-06-01T08:00:00", updatedAt: "2026-06-01T08:00:00" },
  { id: "fp-002", ata: "71", title: "发动机区域航后防护固定提醒", contentHtml: "<p><b>步骤：</b>确认发动机区域工作结束，检查天气条件，雨水天气按要求安装防雨罩。</p><p><b>风险：</b>工作结束后未及时加装防雨罩，造成质量检查问题。</p>", references: "EB-2016-V250-77-202-R5", attachments: [], createdAt: "2026-06-01T08:00:00", updatedAt: "2026-06-01T08:00:00" }
];

const state = {
  user: { id: "guest", username: "guest", name: "访客", role: "guest", permissions: ["view"], allowedTabs: ["homePage", "infoPage"] },
  records: [],
  receipts: [],
  fixedProjects: [],
  users: [],
  selectedUserIds: new Set(),
  settings: clone(defaultSettings),
  favorites: {},
  recordFiles: [],
  fixedFiles: [],
  selectedRecipientIds: new Set(),
  activePage: "homePage",
  activeSubpage: "infoListSubpage",
  selectedCategories: new Set(),
  deferFilterRecordIds: new Set(),
  deferFilterTimers: new Map(),
  statusFilter: "全部",
  statsSearch: "",
  statsTeam: "全部",
  statsStartDate: "",
  statsEndDate: "",
  activeMonth: "全部",
  page: 1,
  pageSize: 15,
  viewerZoom: 1,
  viewerMode: "",
  viewerPdfSrc: "",
  viewerDownloadUrl: "",
  viewerDownloadName: ""
};

const LOCAL_APP_URL = "http://127.0.0.1:8787/";
const API_BASE_URL = window.MUC_API_BASE_URL || (location.protocol === "file:" ? `${LOCAL_APP_URL}api` : `${location.origin}/api`);
const ROUTES = {
  login: "/login",
  dashboard: "/dashboard"
};

function emptyUser() {
  return { id: "guest", username: "", name: "", role: "", permissions: [], allowedTabs: [] };
}

function isLoggedIn() {
  return !!state.user?.id && state.user.id !== "guest";
}

function savedLogin() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistLoginPreference(username, password, rememberPassword, autoLogin) {
  if (!rememberPassword) {
    localStorage.removeItem(LOGIN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({
    username,
    password,
    rememberPassword: true,
    autoLogin: !!autoLogin
  }));
}

function clearAutoLoginPreference() {
  const saved = savedLogin();
  if (!saved.rememberPassword) return;
  localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({ ...saved, autoLogin: false }));
}

function fillLoginForm() {
  const saved = savedLogin();
  $("#loginUser").value = saved.username || "";
  $("#loginPass").value = saved.rememberPassword ? (saved.password || "") : "";
  $("#rememberPassword").checked = !!saved.rememberPassword;
  $("#autoLogin").checked = !!saved.autoLogin && !!saved.rememberPassword;
}

function currentRoute() {
  return location.pathname === ROUTES.dashboard ? ROUTES.dashboard : ROUTES.login;
}

function setRoute(path, replace = false) {
  if (location.pathname === path) return;
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", path);
}

function setAppMode(mode) {
  document.body.classList.remove("app-booting", "app-locked", "app-ready");
  if (mode === "ready") {
    document.body.classList.add("app-ready");
  } else if (mode === "locked") {
    document.body.classList.add("app-locked");
  } else {
    document.body.classList.add("app-booting");
  }
}

function showLoginRoute(message = "", replace = false) {
  setRoute(ROUTES.login, replace);
  showLoginPage(message);
}

async function showDashboardRoute(replace = false) {
  setRoute(ROUTES.dashboard, replace);
  state.activePage = "homePage";
  state.activeSubpage = "infoListSubpage";
  await renderAll();
  window.scrollTo({ top: 0, left: 0 });
}

async function ensureAuthenticated() {
  if (isLoggedIn()) return true;
  try {
    state.user = await authService.current();
    return isLoggedIn();
  } catch (error) {
    if (isAuthExpired(error)) return false;
    throw error;
  }
}

async function guardRoute(message = "") {
  const route = currentRoute();
  if (route === ROUTES.dashboard) {
    const ok = await ensureAuthenticated();
    if (!ok) {
      showLoginRoute(message, true);
      return false;
    }
    await showDashboardRoute(true);
    return true;
  }
  if (isLoggedIn()) {
    await showDashboardRoute(true);
    return true;
  }
  showLoginRoute(message, true);
  return false;
}

async function navigate(path, options = {}) {
  const target = path === ROUTES.dashboard ? ROUTES.dashboard : ROUTES.login;
  setRoute(target, !!options.replace);
  return guardRoute(options.message || "");
}

function showLoginPage(message = "") {
  state.user = emptyUser();
  setAppMode("locked");
  $("#loginPage").hidden = false;
  renderDemoLoginActions();
  $("#pager").hidden = true;
  $("#openEntryBtn").hidden = true;
  $("#openFixedBtn").hidden = true;
  $("#loginBtn").hidden = true;
  $("#logoutBtn").hidden = true;
  fillLoginForm();
  const loginMessage = $("#loginMessage");
  if (loginMessage) {
    loginMessage.hidden = !message;
    loginMessage.textContent = message;
  }
  setTimeout(() => ($("#loginUser").value ? $("#loginPass") : $("#loginUser"))?.focus(), 0);
}

function hideLoginPage() {
  setAppMode("ready");
  $("#loginPage").hidden = true;
  $("#loginBtn").hidden = true;
  const loginMessage = $("#loginMessage");
  if (loginMessage) {
    loginMessage.hidden = true;
    loginMessage.textContent = "";
  }
}

function setLoginBusy(isBusy, message = "") {
  const button = $("#loginSubmit");
  const loginMessage = $("#loginMessage");
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? "正在登录..." : "登录";
  }
  if (loginMessage) {
    loginMessage.hidden = !message;
    loginMessage.textContent = message;
  }
}

function openChangePasswordDialog() {
  $("#changePasswordForm").reset();
  $("#changePasswordUser").value = $("#loginUser").value.trim();
  setChangePasswordBusy(false, "");
  $("#changePasswordDialog").showModal();
  setTimeout(() => ($("#changePasswordUser").value ? $("#changePasswordOld") : $("#changePasswordUser"))?.focus(), 0);
}

function setChangePasswordBusy(isBusy, message = "") {
  const button = $("#changePasswordSubmit");
  const messageBox = $("#changePasswordMessage");
  if (button) {
    button.disabled = isBusy;
    button.textContent = isBusy ? "正在修改..." : "确认修改";
  }
  if (messageBox) {
    messageBox.hidden = !message;
    messageBox.textContent = message;
  }
}

async function submitChangePassword() {
  if ($("#changePasswordSubmit")?.disabled) return;
  const username = $("#changePasswordUser").value.trim();
  const oldPassword = $("#changePasswordOld").value;
  const newPassword = $("#changePasswordNew").value;
  const confirmPassword = $("#changePasswordConfirm").value;
  if (!username || !oldPassword || !newPassword || !confirmPassword) {
    setChangePasswordBusy(false, "请完整填写账号、旧密码和新密码。");
    return;
  }
  if (newPassword.length < 6) {
    setChangePasswordBusy(false, "新密码至少需要6位。");
    return;
  }
  if (newPassword !== confirmPassword) {
    setChangePasswordBusy(false, "两次输入的新密码不一致。");
    return;
  }
  setChangePasswordBusy(true, "正在修改密码...");
  try {
    await authService.changePassword(username, oldPassword, newPassword);
    const saved = savedLogin();
    if (saved.username === username) localStorage.removeItem(LOGIN_STORAGE_KEY);
    sessionStorage.setItem(AUTO_LOGIN_SKIP_KEY, "1");
    $("#changePasswordDialog").close();
    $("#loginPass").value = "";
    $("#rememberPassword").checked = false;
    $("#autoLogin").checked = false;
    setLoginBusy(false, "密码已修改，请使用新密码登录。");
  } catch (error) {
    setChangePasswordBusy(false, error.message || "修改失败，请稍后再试。");
  } finally {
    const button = $("#changePasswordSubmit");
    if (button) {
      button.disabled = false;
      button.textContent = "确认修改";
    }
  }
}

async function performLogin() {
  if ($("#loginSubmit")?.disabled) return;
  const username = $("#loginUser").value.trim();
  const password = $("#loginPass").value;
  if (!username || !password) {
    setLoginBusy(false, "请输入账号和密码。");
    return;
  }
  const rememberPassword = $("#rememberPassword").checked;
  const autoLogin = $("#autoLogin").checked;
  setLoginBusy(true, "正在登录...");
  try {
    const user = await authService.login(username, password);
    state.user = user;
    persistLoginPreference(username, password, rememberPassword, autoLogin);
    sessionStorage.removeItem(AUTO_LOGIN_SKIP_KEY);
    setLoginBusy(true, "登录成功，正在进入系统...");
    await navigate(ROUTES.dashboard);
  } catch (error) {
    state.user = emptyUser();
    setAppMode("locked");
    $("#loginPage").hidden = false;
    $("#pager").hidden = true;
    setLoginBusy(false, `登录失败：${error.message}`);
  } finally {
    const button = $("#loginSubmit");
    if (button) {
      button.disabled = false;
      button.textContent = "登录";
    }
  }
}

function apiUrl(path = "") {
  if (/^(blob:|data:|https?:)/i.test(path || "")) return path;
  if (String(path || "").startsWith("/api/")) return `${API_BASE_URL}${path.slice(4)}`;
  return path || "";
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { credentials: "include", ...options, headers };
  if (options.body && !(options.body instanceof FormData)) {
    init.body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(data?.error || "接口请求失败");
    error.status = response.status;
    throw error;
  }
  return data;
}

function isAuthExpired(error) {
  return error?.status === 401 || /请先登录|登录/.test(error?.message || "");
}

function closeOpenMenus(exceptWrap = null) {
  $$(".more-wrap.open").forEach(item => {
    if (item === exceptWrap) return;
    item.classList.remove("open");
    item.querySelector(".more-menu")?.classList.remove("drop-up", "align-left");
    item.closest(".card")?.classList.remove("menu-open");
  });
}

function positionOpenMenu(wrap) {
  const menu = wrap?.querySelector(".more-menu");
  if (!menu) return;
  menu.classList.remove("drop-up", "align-left");
  menu.style.maxWidth = "";
  const bottomGuard = 76;
  let rect = menu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - bottomGuard) {
    menu.classList.add("drop-up");
    rect = menu.getBoundingClientRect();
  }
  if (rect.right > window.innerWidth - 10) {
    menu.classList.add("align-left");
    rect = menu.getBoundingClientRect();
  }
  if (rect.left < 10 || rect.right > window.innerWidth - 10) {
    menu.style.maxWidth = "calc(100vw - 24px)";
  }
}

async function handleAuthExpired(message = "登录状态已失效，请重新登录。") {
  state.user = emptyUser();
  state.activeSubpage = "infoListSubpage";
  closeOpenMenus();
  ["entryDialog", "fixedDialog", "userDialog", "feedbackDialog", "changePasswordDialog"].forEach(id => {
    const dialog = $("#" + id);
    if (dialog?.open) dialog.close();
  });
  await navigate(ROUTES.login, { replace: true, message });
}

function showReadNote(article, text) {
  const note = article?.querySelector(".read-note");
  if (!note) return;
  note.hidden = false;
  note.textContent = text;
}

async function markRecordReadFromCard(article, record) {
  try {
    const before = readState(record);
    const marked = await receiptService.markRead(record);
    if (marked) {
      const deferred = state.statusFilter === "未读" && ["未读", "即将超期", "已超期"].includes(before) && deferUnreadReclassify(record.id);
      showReadNote(article, deferred ? "已自动记录阅读回执，5分钟后更新筛选归类。" : "已自动记录阅读回执。");
      refreshRecordCard(article, record);
      renderStats();
    } else if (receiptService.get(record.id)?.readAt) {
      showReadNote(article, "该信息已记录阅读回执。");
    }
  } catch (error) {
    if (isAuthExpired(error)) {
      await handleAuthExpired("登录状态已失效，请重新登录。");
      return;
    }
    throw error;
  }
}

const settingsService = {
  async get() {
    const data = await apiRequest("/settings");
    const settings = data.settings || clone(defaultSettings);
    return { ...settings, people: normalizePeople(settings.people || defaultSettings.people) };
  },
  async save(settings) {
    const data = await apiRequest("/settings", { method: "PUT", body: settings });
    return data.settings;
  }
};

const authService = {
  async current() {
    const data = await apiRequest("/me");
    if (!data.user) return null;
    return this.withSettings(data.user);
  },
  withSettings(user) {
    const settings = state.settings || defaultSettings;
    const roleConfig = settings.rolePermissions?.[user.role] || {};
    const tabs = new Set(user.allowedTabs || roleConfig.allowedTabs || []);
    tabs.add("homePage");
    if (["receiver", "publisher", "admin"].includes(user.role)) tabs.add("maintenancePage");
    if (user.role === "admin") tabs.add("settingsPage");
    return { ...user, permissions: user.permissions || roleConfig.permissions || [], allowedTabs: Array.from(tabs) };
  },
  async login(username, password) {
    const data = await apiRequest("/login", { method: "POST", body: { username, password } });
    return this.withSettings(data.user);
  },
  async changePassword(username, oldPassword, newPassword) {
    return await apiRequest("/change-password", { method: "POST", body: { username, oldPassword, newPassword } });
  },
  async logout() {
    await apiRequest("/logout", { method: "POST" });
  }
};

function normalizeRecipients(recipients) {
  const people = [...(state.settings.people || [])];
  demoUsers.forEach(user => {
    if (!people.some(person => person.id === user.id)) {
      people.push({ id: user.id, name: user.name, department: user.department || "未设置", team: user.team || "未设置" });
    }
  });
  const ids = (recipients?.length ? recipients : people.map(person => person.id)).map((id, index) => legacyWorkNo(id, index));
  return ids.map(id => people.find(person => person.id === id)).filter(Boolean);
}

function legacyWorkNo(id, index = 0) {
  const legacyMap = {
    "u-receiver": "00000001",
    "p-001": "10000001",
    "p-002": "10000002",
    "p-003": "10000003",
    "p-004": "10000004",
    "p-005": "10000005"
  };
  if (/^\d{8}$/.test(String(id || ""))) return String(id);
  if (legacyMap[id]) return legacyMap[id];
  return String(id || 90000000 + index).slice(0, 64);
}

function normalizePerson(person, index = 0) {
  if (!person) return null;
  return {
    id: legacyWorkNo(person.id, index),
    username: String(person.username || person.id || "").trim(),
    name: String(person.name || "").trim() || "未命名",
    department: "未设置",
    team: String(person.team || person.department || "未设置").trim() || "未设置"
  };
}

function normalizePeople(people) {
  const seen = new Set();
  return (people || []).map(normalizePerson).filter(person => {
    if (!person || seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

function parsePeopleLines(text) {
  let skipped = 0;
  const people = String(text || "").split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[,，\t]/).map(part => part.trim());
    if (parts.length >= 4 && !/^\d{8}$/.test(parts[0]) && /^\d{8}$/.test(parts[1])) parts.shift();
    const [id, name, team] = parts;
    if (!/^\d{8}$/.test(id || "") || !name || !team) {
      skipped++;
      return null;
    }
    return { id, name, department: "未设置", team };
  }).filter(Boolean);
  return { people: normalizePeople(people), skipped };
}

function hasAttachments(record) {
  return Array.isArray(record.attachments) && record.attachments.length > 0;
}

function demoAttachment(ownerId) {
  return { id: "demo-att-001", name: "安全生产月宣贯材料.txt", type: "text/plain", size: 180, storage: "demo", url: "data:text/plain;charset=utf-8,%E5%AE%89%E5%85%A8%E7%94%9F%E4%BA%A7%E6%9C%88%E5%AE%A3%E8%B4%AF%E6%9D%90%E6%96%99", ownerType: "record", ownerId };
}

function enrichRecord(record, index = 0) {
  const now = new Date();
  const baseDate = parseDate(record.date) || now;
  const overdueDays = Number(state.settings?.overdueDays || 3);
  const deadline = record.deadline || new Date(baseDate.getTime() + 1000 * 60 * 60 * 24 * Math.max(1, overdueDays)).toISOString().slice(0, 16);
  const publisherId = record.publisherId || "u-publisher";
  return {
    id: record.id || `rec-${Date.now()}-${index}`,
    date: record.date || formatDisplayDate(now),
    category: record.category || "规定要求",
    title: record.title || "未命名信息",
    original: record.original || "",
    publisher: record.publisher || "发布者",
    sourceSet: record.sourceSet || "",
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    favorite: record.favorite === true,
    importedRead: record.importedRead === true || record.importedReadComplete === true,
    recipients: Array.isArray(record.recipients) && record.recipients.length ? record.recipients.map((item, itemIndex) => typeof item === "object" ? { id: item.id, name: item.name, department: item.department || "未设置", team: item.team || "未设置" } : normalizeRecipients([item])[0]).filter(Boolean) : normalizeRecipients([]),
    deadline,
    priority: record.priority || (index % 7 === 0 ? "重要" : "普通"),
    publishStatus: record.publishStatus || "已发布",
    publisherId,
    pinned: false,
    remindEnabled: record.remindEnabled !== false,
    allowWithdraw: record.allowWithdraw !== false,
    allowEdit: record.allowEdit !== false,
    createdBy: record.createdBy || publisherId,
    updatedBy: record.updatedBy || publisherId,
    createdAt: record.createdAt || baseDate.toISOString(),
    updatedAt: record.updatedAt || baseDate.toISOString()
  };
}

const recordService = {
  async list() {
    const data = await apiRequest("/records");
    if (data.settings) state.settings = { ...data.settings, people: normalizePeople(data.settings.people || []) };
    state.receipts = data.receipts || [];
    return (data.records || []).map(enrichRecord);
  },
  async create(payload) {
    const data = await apiRequest("/records", { method: "POST", body: payload });
    return enrichRecord(data.record);
  },
  async update(id, payload) {
    const data = await apiRequest(`/records/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    return enrichRecord(data.record);
  },
  async remove(id) {
    await apiRequest(`/records/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async void(id) {
    const data = await apiRequest(`/records/${encodeURIComponent(id)}/void`, { method: "POST" });
    return data.record ? enrichRecord(data.record) : null;
  },
  async restore(id) {
    const data = await apiRequest(`/records/${encodeURIComponent(id)}/restore`, { method: "POST" });
    return data.record ? enrichRecord(data.record) : null;
  },
  async importRows(rows) {
    return await apiRequest("/records/import", { method: "POST", body: { rows } });
  },
};

const receiptService = {
  list() {
    return state.receipts || [];
  },
  saveAll(receipts) {
    state.receipts = receipts;
  },
  get(recordId, userId = state.user.id) {
    return this.list().find(item => item.recordId === recordId && item.userId === userId);
  },
  async markRead(record) {
    if (!state.user.id || state.user.id === "guest") return false;
    const found = this.get(record.id);
    if (found?.readAt) return false;
    const data = await apiRequest(`/records/${encodeURIComponent(record.id)}/read`, { method: "POST" });
    if (!data.receipt) return false;
    state.receipts = state.receipts.filter(item => !(item.recordId === record.id && item.userId === state.user.id));
    state.receipts.push(data.receipt);
    return true;
  },
  remind(record, userIds) {
    return apiRequest(`/records/${encodeURIComponent(record.id)}/remind`, { method: "POST", body: { userIds } }).catch(() => null);
  },
  async updateStatus(recordId, userId, status) {
    const data = await apiRequest(`/records/${encodeURIComponent(recordId)}/receipts/${encodeURIComponent(userId)}`, { method: "PUT", body: { status } });
    state.receipts = state.receipts.filter(item => item.recordId !== recordId).concat(data.receipts || []);
    return data.receipts || [];
  },
  async updateStatusBatch(recordId, userIds, status) {
    const data = await apiRequest(`/records/${encodeURIComponent(recordId)}/receipts`, { method: "PUT", body: { userIds, status } });
    state.receipts = state.receipts.filter(item => item.recordId !== recordId).concat(data.receipts || []);
    return data.receipts || [];
  },
  removeRecord(recordId) {
    state.receipts = this.list().filter(item => item.recordId !== recordId);
  }
};

const fixedProjectService = {
  async list() {
    try {
      const data = await apiRequest("/fixed-projects");
      return data.projects || [];
    } catch {
      return [];
    }
  },
  async create(payload) {
    const data = await apiRequest("/fixed-projects", { method: "POST", body: payload });
    return data.project;
  },
  async update(id, payload) {
    const data = await apiRequest(`/fixed-projects/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    return data.project;
  },
  async remove(id) {
    await apiRequest(`/fixed-projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
};

const favoriteService = {
  isFavorite(recordId) {
    return !!state.records.find(record => record.id === recordId)?.favorite;
  },
  async toggle(recordId) {
    const current = this.isFavorite(recordId);
    const data = await apiRequest(`/records/${encodeURIComponent(recordId)}/favorite`, { method: current ? "DELETE" : "POST" });
    const record = state.records.find(item => item.id === recordId);
    if (record) record.favorite = !!data.favorite;
  }
};

const auditService = {
  add() {}
};

const userService = {
  async list() {
    if (state.user.role !== "admin") return [];
    const data = await apiRequest("/admin/users");
    return data.users || [];
  },
  async create(payload) {
    const data = await apiRequest("/admin/users", { method: "POST", body: payload });
    return data.user;
  },
  async update(id, payload) {
    const data = await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    return data.user;
  },
  async resetPassword(id, password) {
    return await apiRequest(`/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: { password } });
  },
  async remove(id) {
    return await apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async batchUpdate(userIds, updates) {
    return await apiRequest("/admin/users/batch", { method: "PUT", body: { userIds, updates } });
  },
  async importRows(rows) {
    return await apiRequest("/admin/users/import", { method: "POST", body: { rows } });
  }
};

const statsService = {
  rows(records, receipts) {
    return records.flatMap(record => (record.recipients || []).map(person => {
      const receipt = receipts.find(item => item.recordId === record.id && item.userId === person.id);
      const status = this.rowStatus(record, receipt);
      return { record, person, receipt, status };
    }));
  },
  rowStatus(record, receipt) {
    if (receipt?.readAt) return receipt.isOverdue ? "超期已读" : "已读";
    return isPast(record.deadline) ? "超期未读" : "未读";
  },
  blankStat(base = {}) {
    return { ...base, total: 0, read: 0, unread: 0, overdueUnread: 0, overdueRead: 0, totalUnread: 0, readRate: 0, overdueRate: 0 };
  },
  fillStat(stat, row) {
    stat.total++;
    if (row.status === "已读") stat.read++;
    if (row.status === "未读") stat.unread++;
    if (row.status === "超期未读") stat.overdueUnread++;
    if (row.status === "超期已读") stat.overdueRead++;
    return stat;
  },
  finalize(stat) {
    stat.totalUnread = stat.unread + stat.overdueUnread + stat.overdueRead;
    stat.readRate = stat.total ? Math.round((stat.read + stat.overdueRead) / stat.total * 100) : 0;
    stat.overdueRate = stat.total ? Math.round((stat.overdueUnread + stat.overdueRead) / stat.total * 100) : 0;
    return stat;
  },
  statsFromRows(rows, base = {}) {
    return this.finalize(rows.reduce((acc, row) => this.fillStat(acc, row), this.blankStat(base)));
  },
  overviewStats(records, receipts) {
    return this.statsFromRows(this.rows(records, receipts), { publishCount: records.length });
  },
  personStats(records, receipts) {
    const map = new Map();
    this.rows(records, receipts).forEach(row => {
      const key = row.person.id || row.person.name;
      if (!map.has(key)) map.set(key, this.blankStat({ id: row.person.id || "", name: row.person.name || "未知", team: row.person.team || "未设置" }));
      this.fillStat(map.get(key), row);
    });
    return Array.from(map.values()).map(stat => this.finalize(stat)).sort(compareAssessmentStats);
  },
  teamStats(records, receipts, people = []) {
    const map = new Map();
    this.rows(records, receipts).forEach(row => {
      const team = row.person.team || "未设置";
      if (!map.has(team)) map.set(team, this.blankStat({ team, people: new Set() }));
      const stat = map.get(team);
      stat.people.add(row.person.id || row.person.name);
      this.fillStat(stat, row);
    });
    return Array.from(map.values()).map(stat => {
      const knownPeople = people.filter(person => (person.team || "未设置") === stat.team).length;
      return this.finalize({ ...stat, peopleCount: Math.max(stat.people.size, knownPeople), people: undefined });
    }).sort(compareAssessmentStats);
  },
  recordsInDateRange(records, options = {}) {
    const start = options.startDate ? parseDate(options.startDate) : null;
    const endBase = options.endDate ? parseDate(options.endDate) : null;
    const end = endBase ? new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate(), 23, 59, 59, 999) : null;
    return records.filter(record => {
      if (record.publishStatus === "作废") return false;
      const date = parseDate(record.date);
      if (!date) return false;
      return (!start || date >= start) && (!end || date <= end);
    });
  },
  filtered(records, receipts, options = {}) {
    const search = String(options.search || "").trim().toLowerCase();
    const team = options.team || "全部";
    const scopedRecords = this.recordsInDateRange(records, options);
    const allRows = this.rows(scopedRecords, receipts);
    const filteredRows = allRows.filter(row => {
      const text = [row.person.id, row.person.name, row.person.team].join(" ").toLowerCase();
      return (team === "全部" || row.person.team === team) && (!search || text.includes(search));
    });
    const filteredRecordIds = new Set(filteredRows.map(row => row.record.id));
    const personStats = this.personStats(scopedRecords, receipts).filter(row => {
      const text = [row.id, row.name, row.team].join(" ").toLowerCase();
      return (team === "全部" || row.team === team) && (!search || text.includes(search));
    });
    const teamMap = new Map();
    filteredRows.forEach(row => {
      const teamName = row.person.team || "未设置";
      if (!teamMap.has(teamName)) teamMap.set(teamName, this.blankStat({ team: teamName, people: new Set() }));
      const stat = teamMap.get(teamName);
      stat.people.add(row.person.id || row.person.name);
      this.fillStat(stat, row);
    });
    const teamStats = Array.from(teamMap.values()).map(stat => this.finalize({ ...stat, peopleCount: stat.people.size, people: undefined })).sort(compareAssessmentStats);
    return { overview: this.statsFromRows(filteredRows, { publishCount: filteredRecordIds.size }), teams: teamStats, people: personStats, records: scopedRecords };
  },
  exportStatsCsv(records, receipts, options = {}) {
    const data = this.filtered(records, receipts, options);
    const line = values => values.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
    const filterText = statsFilterText(options);
    const lines = [
      line(["筛选条件", filterText]),
      "",
      line(["整体概览"]),
      line(["发布数", "接收人次", "已读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
      line([data.overview.publishCount, data.overview.total, data.overview.read, data.overview.unread, data.overview.overdueUnread, data.overview.overdueRead, `${data.overview.readRate}%`, `${data.overview.overdueRate}%`]),
      "",
      line(["班组统计"]),
      line(["班组", "人数", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
      ...data.teams.map(row => line([row.team, row.peopleCount, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])),
      "",
      line(["个人统计"]),
      line(["姓名", "班组", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"]),
      ...data.people.map(row => line([row.name, row.team, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`]))
    ];
    return lines.join("\n");
  },
  exportTables(records, receipts, options = {}) {
    const data = this.filtered(records, receipts, options);
    const filterText = statsFilterText(options);
    return [
      {
        name: "整体概览",
        rows: [
          ["筛选条件", filterText],
          [],
          ["发布数", "接收人次", "已读", "未读", "超期未读", "超期已读", "已读率", "超期率"],
          [data.overview.publishCount, data.overview.total, data.overview.read, data.overview.unread, data.overview.overdueUnread, data.overview.overdueRead, `${data.overview.readRate}%`, `${data.overview.overdueRate}%`]
        ]
      },
      {
        name: "班组统计",
        rows: [
          ["筛选条件", filterText],
          [],
          ["班组", "人数", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"],
          ...data.teams.map(row => [row.team, row.peopleCount, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])
        ]
      },
      {
        name: "个人统计",
        rows: [
          ["筛选条件", filterText],
          [],
          ["姓名", "班组", "应读", "已读", "总未读", "未读", "超期未读", "超期已读", "已读率", "超期率"],
          ...data.people.map(row => [row.name, row.team, row.total, row.read, row.totalUnread, row.unread, row.overdueUnread, row.overdueRead, `${row.readRate}%`, `${row.overdueRate}%`])
        ]
      }
    ];
  },
  summary(records, receipts) {
    const recipientRows = this.rows(records, receipts);
    const readCount = recipientRows.filter(row => row.status === "已读" || row.status === "超期已读").length;
    const overdueCount = recipientRows.filter(row => row.status === "超期未读").length;
    return {
      publishCount: records.length,
      recipientCount: recipientRows.length,
      readCount,
      unreadCount: recipientRows.length - readCount,
      overdueCount,
      readRate: recipientRows.length ? Math.round(readCount / recipientRows.length * 100) : 0,
      byDepartment: groupCount(recipientRows, row => row.person.department || "未设置"),
      byPublisher: groupCount(records, row => row.publisher || "未知"),
      byCategory: groupCount(records, row => row.category || "未分类")
    };
  }
};

function compareAssessmentStats(a, b) {
  const aRisk = (a.overdueUnread || 0) + (a.overdueRead || 0);
  const bRisk = (b.overdueUnread || 0) + (b.overdueRead || 0);
  return bRisk - aRisk || (b.total || 0) - (a.total || 0) || String(a.name || a.team).localeCompare(String(b.name || b.team), "zh-Hans-CN");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function sanitizeRichHtml(value) {
  const allowedTags = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "SPAN", "A", "DIV"]);
  const allowedStyles = new Set(["color", "background-color"]);
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    const tag = node.tagName.toUpperCase();
    const fragment = document.createDocumentFragment();
    if (!allowedTags.has(tag)) {
      Array.from(node.childNodes).forEach(child => fragment.appendChild(cleanNode(child)));
      return fragment;
    }
    const element = document.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      if (/^(https?:|mailto:|\/(?!\/)|#)/i.test(href)) {
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
    const safeStyles = [];
    String(node.getAttribute("style") || "").split(";").forEach(rule => {
      const [name, rawValue] = rule.split(":").map(part => part?.trim());
      if (!allowedStyles.has(String(name || "").toLowerCase())) return;
      if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i.test(rawValue || "")) safeStyles.push(`${name}:${rawValue}`);
    });
    if (safeStyles.length) element.setAttribute("style", safeStyles.join(";"));
    Array.from(node.childNodes).forEach(child => element.appendChild(cleanNode(child)));
    return element;
  };
  const output = document.createElement("div");
  Array.from(template.content.childNodes).forEach(child => output.appendChild(cleanNode(child)));
  return output.innerHTML;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).replace("T", " ").replace(/[年月/.]/g, "-").replace(/日/g, "").trim();
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), match[4] === undefined ? 12 : Number(match[4]), Number(match[5] || 0));
}

function recordSortValue(record) {
  return parseDate(record?.date)?.getTime()
    || parseDate(record?.updatedAt)?.getTime()
    || parseDate(record?.createdAt)?.getTime()
    || 0;
}

function compareRecordsDesc(a, b) {
  const byDate = recordSortValue(b) - recordSortValue(a);
  if (byDate) return byDate;
  const byUpdated = (parseDate(b?.updatedAt)?.getTime() || 0) - (parseDate(a?.updatedAt)?.getTime() || 0);
  if (byUpdated) return byUpdated;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

function calculateDeadline(value) {
  const start = parseDate(value) || new Date();
  const days = Number(state.settings?.overdueDays || 3);
  return new Date(start.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function formatDisplayDate(value) {
  const date = parseDate(value) || new Date(value || Date.now());
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayDateOnly(value) {
  const date = parseDate(value) || new Date(value || Date.now());
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function inputDateValue(value = new Date()) {
  const date = parseDate(value) || new Date(value || Date.now());
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthLabel(value) {
  const date = parseDate(value);
  return date ? String(date.getMonth() + 1).padStart(2, "0") + "月" : "";
}

function isPast(value) {
  const date = parseDate(value);
  return !!date && date.getTime() < Date.now();
}

function isNearDeadline(record) {
  const deadline = parseDate(record.deadline);
  if (!deadline || isPast(deadline)) return false;
  const limit = Number(state.settings.reminderDays || 1) * 24 * 60 * 60 * 1000;
  return deadline.getTime() - Date.now() <= limit;
}

function inDateRange(value) {
  return state.activeMonth === "全部" || monthLabel(value) === state.activeMonth;
}

function has(permission) {
  return state.user.permissions?.includes(permission);
}

function isRecordOwner(record) {
  if (!record || state.user.id === "guest") return false;
  const publisherName = (record.publisher || "").trim();
  if (publisherName === state.user.name && publisherName !== "发布者") return true;
  if (publisherName && publisherName !== state.user.name) return false;
  return record.publisherId === state.user.id || record.createdBy === state.user.id;
}

function canEditRecord(record) {
  return state.user.role === "admin";
}

function canDeleteRecord(record) {
  return state.user.role === "admin";
}

function canVoidRecord(record) {
  if (!record || record.publishStatus === "作废") return false;
  if (state.user.role === "admin") return true;
  return state.user.role === "publisher" && isRecordOwner(record);
}

function canRestoreRecord(record) {
  return state.user.role === "admin" && record?.publishStatus === "作废";
}

function canManageFeedbackRecord(record) {
  if (state.user.role === "admin") return true;
  return state.user.role === "publisher" && has("feedback") && isRecordOwner(record);
}

function canViewRecord(record) {
  if (state.user.id === "guest") return false;
  if (record?.publishStatus === "作废") return state.user.role === "admin";
  if (state.user.role === "admin") return true;
  if (state.user.role === "publisher") return isRecipient(record) || isRecordOwner(record);
  return isRecipient(record);
}

function canTrackPersonalRead(record) {
  return state.user.id !== "guest" && record?.publishStatus !== "作废" && isRecipient(record);
}

function canFilterReadState(record) {
  return canTrackPersonalRead(record);
}

function canView(tab) {
  if (!isLoggedIn()) return false;
  if (tab === "homePage") return true;
  if (tab === "settingsPage") return state.user.role === "admin";
  return state.user.allowedTabs?.includes(tab);
}

function canOpenSettings() {
  return has("admin");
}

function canViewSubpage(subpage) {
  if (!isLoggedIn()) return false;
  if (subpage === "infoListSubpage") return true;
  if (subpage === "statsSubpage") return state.user.role === "publisher" || state.user.role === "admin";
  return false;
}

function groupCount(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function highlight(value, term) {
  const safe = escapeHtml(value);
  const words = term.split(/\s+/).filter(Boolean).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length ? safe.replace(new RegExp("(" + words.join("|") + ")", "gi"), "<mark>$1</mark>") : safe;
}

function isRecipient(record, userId = state.user.id) {
  return (record.recipients || []).some(person => person.id === userId);
}

function readState(record) {
  const receipt = receiptService.get(record.id);
  if (record.publishStatus === "作废") return "作废";
  if (record.publishStatus === "已撤回") return "已撤回";
  if (record.publishStatus === "已归档") return "已归档";
  if (record.publishStatus === "已完成") return "已完成";
  if (receipt?.readAt) return receipt.isOverdue ? "超期已读" : "已读";
  if (isPast(record.deadline)) return "已超期";
  if (isNearDeadline(record)) return "即将超期";
  return "未读";
}

function recordMetrics(record) {
  const rows = (record.recipients || []).map(person => ({ person, receipt: receiptService.list().find(item => item.recordId === record.id && item.userId === person.id) }));
  const read = rows.filter(row => row.receipt?.readAt).length;
  const overdue = rows.filter(row => !row.receipt?.readAt && isPast(record.deadline)).length;
  return { total: rows.length, read, unread: rows.length - read, overdue, rate: rows.length ? Math.round(read / rows.length * 100) : 0 };
}

function statusTags(record) {
  const tags = [];
  if (canTrackPersonalRead(record)) tags.push(readState(record));
  if (record.publishStatus && !["已发布"].includes(record.publishStatus)) tags.push(record.publishStatus);
  return Array.from(new Set(tags)).map(tag => `<span class="status-tag ${tagClass(tag)}">${escapeHtml(tag)}</span>`).join("");
}

function tagClass(tag) {
  if (["未读"].includes(tag)) return "unread";
  if (["已超期", "超期已读", "已撤回", "作废"].includes(tag)) return "overdue";
  if (tag === "紧急") return "urgent";
  if (tag === "重要") return "important";
  if (["已读", "已完成", "已归档"].includes(tag)) return "done";
  return "";
}

function categoryTag(record) {
  const category = record.category || "未分类";
  return `<span class="tag cat-${escapeHtml(category.slice(0, 2))}">${escapeHtml(category)}</span>`;
}

function categoryColor(record) {
  const category = String(record.category || "其他").trim() || "其他";
  return categoryColorMap().get(category) || fallbackCategoryColor(category);
}

function categoryColorMap() {
  const fixed = new Map([
    ["质量问题", "#D97706"],
    ["规定要求", "#7C3AED"],
    ["周例会", "#2563EB"],
    ["日例会", "#059669"],
    ["其他", "#64748B"]
  ]);
  const palette = ["#0891B2", "#0F766E", "#4F46E5", "#9333EA", "#C2410C", "#BE123C", "#0E7490", "#15803D", "#A16207", "#B45309", "#6D28D9", "#0369A1"];
  const categories = Array.from(new Set((state.settings?.categories || []).map(item => String(item || "").trim()).filter(Boolean)));
  const used = new Set(fixed.values());
  const colors = new Map(fixed);
  let index = 0;
  for (const category of categories) {
    if (colors.has(category)) continue;
    while (index < palette.length && used.has(palette[index])) index++;
    const color = index < palette.length ? palette[index] : fallbackCategoryColor(category);
    colors.set(category, color);
    used.add(color);
    index++;
  }
  return colors;
}

function fallbackCategoryColor(category) {
  const palette = ["#0891B2", "#0F766E", "#4F46E5", "#9333EA", "#C2410C", "#BE123C", "#0E7490", "#15803D", "#A16207", "#B45309", "#6D28D9", "#0369A1"];
  let hash = 0;
  for (const char of category || "默认") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function priorityTag(record) {
  if (!["重要", "紧急"].includes(record.priority)) return "";
  return `<span class="status-tag ${tagClass(record.priority)} priority-title-tag">${escapeHtml(record.priority)}</span>`;
}

function titleMeta(record) {
  const parts = [];
  if (favoriteService.isFavorite(record.id)) parts.push('<span class="badge favorite-badge" title="已收藏">★</span>');
  if (hasAttachments(record)) parts.push('<span class="badge attachment-badge" title="含附件" aria-label="含附件">📎</span>');
  return parts.length ? `<span class="title-meta">${parts.join("")}</span>` : "";
}

function renderAttachments(owner, ownerType) {
  const files = Array.isArray(owner.attachments) ? owner.attachments.filter(Boolean) : [];
  if (!files.length) return "";
  return `<div class="attachments"><strong>附件：</strong>${files.map((file, index) => {
    const id = file.id || file.attachmentId || `${owner.id}-attachment-${index}`;
    const name = file.name || `附件${index + 1}`;
    return `<a href="${escapeHtml(apiUrl(file.url || file.dataUrl || "#"))}" target="_blank" data-attachment="${escapeHtml(id)}" data-owner-type="${ownerType}" data-owner-id="${escapeHtml(owner.id)}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</a>` +
      (has("attachments") ? `<button class="remove-attach" type="button" data-remove-attachment="${escapeHtml(id)}" data-owner-type="${ownerType}" data-owner-id="${escapeHtml(owner.id)}">移除</button>` : "");
  }).join("")}</div>`;
}

function renderExistingRecordAttachments(record) {
  const container = $("#recordExistingAttachments");
  if (!container) return;
  const files = Array.isArray(record?.attachments) ? record.attachments.filter(Boolean) : [];
  container.hidden = !files.length;
  container.innerHTML = files.length ? `<div class="existing-attachment-title">已上传附件</div>${renderAttachments(record, "record")}` : "";
}

function removeAttachmentFromState(attachmentId, ownerType, ownerId) {
  const list = ownerType === "fixedProject" ? state.fixedProjects : state.records;
  const owner = list.find(item => item.id === ownerId);
  if (!owner) return null;
  owner.attachments = (owner.attachments || []).filter(file => (file.id || file.attachmentId) !== attachmentId);
  return owner;
}

function renderShell() {
  if (!isLoggedIn()) {
    showLoginPage();
    $("#pager").hidden = true;
    return;
  }
  hideLoginPage();
  $("#loginBtn").hidden = true;
  $("#logoutBtn").hidden = false;
  $("#openEntryBtn").hidden = !has("create");
  $("#openFixedBtn").hidden = !has("fixedManage");
  if (!canView(state.activePage)) state.activePage = "homePage";
  $$(".subtab").forEach(tab => { tab.hidden = !canViewSubpage(tab.dataset.subpage); });
  $$(".top-tab").forEach(tab => {
    tab.hidden = !canView(tab.dataset.page);
    tab.classList.toggle("active", tab.dataset.page === state.activePage);
  });
  if (!canViewSubpage(state.activeSubpage)) state.activeSubpage = "infoListSubpage";
  $$(".subtab").forEach(tab => tab.classList.toggle("active", tab.dataset.subpage === state.activeSubpage));
  $$(".page").forEach(section => section.classList.toggle("active", section.id === state.activePage));
  $$(".subpage").forEach(section => section.classList.toggle("active", section.id === state.activeSubpage));
  $("#pager").hidden = state.activePage !== "infoPage" || state.activeSubpage !== "infoListSubpage";
  $("#infoFilters").hidden = state.activeSubpage !== "infoListSubpage";
  $("#resultStatus").hidden = state.activeSubpage !== "infoListSubpage";
  closeSubpageMenu();
}

function isDemoMode() {
  return location.protocol === "file:" || ["127.0.0.1", "localhost", ""].includes(location.hostname);
}

function renderDemoLoginActions() {
  const actions = $("#demoLoginActions");
  if (actions) actions.hidden = !isDemoMode();
}

function closeSubpageMenu() {
  const menu = $("#subpageMenu");
  const button = $("#subpageMenuBtn");
  if (!menu || !button) return;
  menu.hidden = true;
  button.classList.remove("active");
  button.setAttribute("aria-expanded", "false");
}

function toggleSubpageMenu() {
  const menu = $("#subpageMenu");
  const button = $("#subpageMenuBtn");
  if (!menu || !button) return;
  const nextOpen = menu.hidden;
  menu.hidden = !nextOpen;
  button.classList.toggle("active", nextOpen);
  button.setAttribute("aria-expanded", String(nextOpen));
}

function renderDateControls() {
  const months = ["全部", ...Array.from(new Set(state.records.map(item => monthLabel(item.date)).filter(Boolean))).sort((a, b) => Number(b.slice(0, 2)) - Number(a.slice(0, 2)))];
  $("#monthSelect").innerHTML = months.map(month => `<option value="${month}" ${month === state.activeMonth ? "selected" : ""}>${month}</option>`).join("");
}

function renderCategoryControls() {
  const categories = ["全部", ...(state.settings.categories || [])];
  $("#categoryChips").innerHTML = categories.map(category => `<button class="chip ${((category === "全部" && !state.selectedCategories.size) || state.selectedCategories.has(category)) ? "active" : ""}" type="button" data-category="${category}">${escapeHtml(category)}</button>`).join("");
}

function renderStatusControls() {
  const filters = state.user.role === "admin" ? adminStatusFilters : state.user.role === "publisher" ? publisherStatusFilters : receiverStatusFilters;
  if (!filters.includes(state.statusFilter)) state.statusFilter = "全部";
  $("#statusChips").innerHTML = filters.map(filter => {
    const active = state.statusFilter === filter && !(filter === "全部" && state.activeMonth !== "全部");
    return `<button class="chip ${active ? "active" : ""}" type="button" data-status="${filter}">${escapeHtml(filter)}</button>`;
  }).join("");
}

function visibleInfoRecords() {
  return state.records.filter(record => canViewRecord(record));
}

function personalReadRecords(records = visibleInfoRecords()) {
  return records.filter(record => canFilterReadState(record));
}

function renderHome() {
  const box = $("#homeInfoMetrics");
  if (!box) return;
  const visible = visibleInfoRecords();
  const personal = personalReadRecords(visible);
  const currentMonth = monthLabel(new Date());
  const currentMonthPersonal = personal.filter(record => monthLabel(record.date) === currentMonth);
  const unread = personal.filter(record => ["未读", "即将超期", "已超期"].includes(readState(record)));
  const overdue = currentMonthPersonal.filter(record => ["已超期", "超期已读"].includes(readState(record)));
  const favorites = visible.filter(record => favoriteService.isFavorite(record.id));
  const overdueRate = currentMonthPersonal.length ? Math.round(overdue.length / currentMonthPersonal.length * 100) : 0;
  const cards = [
    { label: "未读条数", value: unread.length, hint: "查看待阅读信息", filter: "未读", warn: unread.length > 0 },
    { label: `超期率 · ${currentMonth}`, value: `${overdueRate}%`, hint: `${overdue.length}/${currentMonthPersonal.length || 0} 条`, filter: "超期", warn: overdue.length > 0 },
    { label: "信息总条数", value: visible.length, hint: "查看全部可见信息", filter: "全部" },
    { label: "收藏条数", value: favorites.length, hint: "查看我的收藏", filter: "收藏" }
  ];
  box.innerHTML = cards.map(card => `<button class="metric home-metric-btn ${card.warn ? "warn" : ""}" type="button" data-home-info-filter="${card.filter}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.hint)}</small></button>`).join("");
}

function statusPass(record) {
  const filter = state.statusFilter;
  if (record.publishStatus === "作废") return state.user.role === "admin" && (filter === "全部" || filter === "作废");
  if (filter === "作废") return false;
  if (filter === "全部") return record.publishStatus !== "已撤回" || canManageFeedbackRecord(record);
  if (filter === "收藏") return favoriteService.isFavorite(record.id);
  if (filter === "未读" && canFilterReadState(record) && state.deferFilterRecordIds.has(record.id)) return true;
  if (filter === "未读") return canFilterReadState(record) && ["未读", "即将超期", "已超期"].includes(readState(record));
  if (filter === "已读") return canFilterReadState(record) && ["已读", "超期已读"].includes(readState(record));
  if (filter === "超期") return canFilterReadState(record) && ["已超期", "超期已读"].includes(readState(record));
  if (filter === "我发布") return isRecordOwner(record);
  return true;
}

function filteredRecords() {
  const term = $("#searchInput").value.trim().toLowerCase();
  const words = term.split(/\s+/).filter(Boolean);
  const visible = visibleInfoRecords();
  return visible.filter(record => {
    const haystack = [record.date, record.publisher, record.category, record.title, record.original, record.sourceSet, record.priority, record.publishStatus, (record.attachments || []).map(file => file.name).join(" ")].join(" ").toLowerCase();
    return (!state.selectedCategories.size || state.selectedCategories.has(record.category)) && inDateRange(record.date) && statusPass(record) && words.every(word => haystack.includes(word));
  }).sort(compareRecordsDesc);
}

function renderPager(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  $("#pagerText").textContent = `第 ${state.page} / ${totalPages} 页`;
  $("#pageSizeSelect").innerHTML = pageSizes.map(size => `<option value="${size}" ${size === state.pageSize ? "selected" : ""}>${size} 条</option>`).join("");
  const pages = Array.from(new Set([1, state.page - 1, state.page, state.page + 1, totalPages].filter(page => page >= 1 && page <= totalPages)));
  $("#pageButtons").innerHTML = `<button class="page-btn" data-page-action="prev" ${state.page <= 1 ? "disabled" : ""}>上一页</button>` + pages.map(page => `<button class="page-btn ${page === state.page ? "active" : ""}" data-page="${page}">${page}</button>`).join("") + `<button class="page-btn" data-page-action="next" ${state.page >= totalPages ? "disabled" : ""}>下一页</button>`;
}

function recordMetaLine(record, publisherLine = "") {
  const parts = [`<span>${escapeHtml(formatDisplayDateOnly(record.date))}</span>`];
  if (["publisher", "admin"].includes(state.user.role)) {
    parts.push(`<span class="publisher">${escapeHtml(record.publisher || "未知")}</span>`);
  }
  if (publisherLine) parts.push(publisherLine);
  return parts.join("<span>·</span>");
}

function renderRecords() {
  renderDateControls();
  renderCategoryControls();
  renderStatusControls();
  const term = $("#searchInput").value.trim().toLowerCase();
  const filtered = filteredRecords();
  const pageItems = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  $("#cards").innerHTML = pageItems.map(record => {
    const metrics = recordMetrics(record);
    const canManageFeedback = record.publishStatus !== "作废" && canManageFeedbackRecord(record);
    const publisherLine = state.user.role === "admin" && canManageFeedback ? `<span class="record-metrics">接收 ${metrics.total} · 已读 ${metrics.read} · 未读 ${metrics.unread} · 超期 ${metrics.overdue}</span>` : "";
    const menu = state.user.id !== "guest" ? `<div class="more-wrap"><button class="more-btn" type="button" data-more>⋯</button><div class="more-menu">
      <button class="item-btn" type="button" data-favorite="${escapeHtml(record.id)}">${favoriteService.isFavorite(record.id) ? "取消收藏" : "收藏"}</button>
      ${canEditRecord(record) ? `<button class="item-btn" type="button" data-edit-record="${escapeHtml(record.id)}">修改</button>` : ""}
      ${canVoidRecord(record) ? `<button class="item-btn delete" type="button" data-void-record="${escapeHtml(record.id)}">作废</button>` : ""}
      ${canRestoreRecord(record) ? `<button class="item-btn" type="button" data-restore-record="${escapeHtml(record.id)}">恢复发布</button>` : ""}
      ${canDeleteRecord(record) ? `<button class="item-btn delete" type="button" data-delete-record="${escapeHtml(record.id)}">删除</button>` : ""}
      ${canManageFeedback ? `<button class="item-btn" type="button" data-feedback-record="${escapeHtml(record.id)}">反馈明细</button><button class="item-btn" type="button" data-remind-record="${escapeHtml(record.id)}">催办未读</button><button class="item-btn" type="button" data-export-record="${escapeHtml(record.id)}">导出反馈</button>` : ""}
    </div></div>` : "";
    return `<article class="card" data-record-id="${escapeHtml(record.id)}" style="--category-color:${categoryColor(record)}">
      <div class="card-row"><h2 class="title"><span class="title-text">${highlight(record.title, term)}</span>${priorityTag(record)}${titleMeta(record)}</h2>${menu}</div>
      <div class="card-row secondary"><span class="inline-status-tags">${statusTags(record)}</span>${recordMetaLine(record, publisherLine)}<span>·</span><button class="link-btn" type="button" data-toggle-panel>展开原文</button></div>
      <div class="original-panel" hidden><div class="original">${highlight(record.original, term)}</div><div class="read-note" hidden></div><div class="attachment-slot">${renderAttachments(record, "record")}</div></div>
    </article>`;
  }).join("");
  $("#empty").hidden = !!filtered.length;
  $("#resultStatus").textContent = `共 ${state.records.length} 条 · 当前显示 ${filtered.length} 条`;
  renderPager(filtered.length);
}

function refreshRecordCard(article, record) {
  state.receipts = receiptService.list();
  const tags = article.querySelector(".inline-status-tags");
  if (tags) tags.innerHTML = statusTags(record);
  const metricsNode = article.querySelector(".record-metrics");
  if (metricsNode) {
    const metrics = recordMetrics(record);
    metricsNode.textContent = `接收 ${metrics.total} · 已读 ${metrics.read} · 未读 ${metrics.unread} · 超期 ${metrics.overdue}`;
  }
  if (!state.deferFilterRecordIds.has(record.id) && !statusPass(record)) renderRecords();
}

function deferUnreadReclassify(recordId) {
  if (state.statusFilter !== "未读") return false;
  state.deferFilterRecordIds.add(recordId);
  const existingTimer = state.deferFilterTimers.get(recordId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    state.deferFilterRecordIds.delete(recordId);
    state.deferFilterTimers.delete(recordId);
    if (state.statusFilter === "未读") renderRecords();
  }, 5 * 60 * 1000);
  state.deferFilterTimers.set(recordId, timer);
  return true;
}

function clearDeferredReclassify(recordId) {
  const timer = state.deferFilterTimers.get(recordId);
  if (timer) clearTimeout(timer);
  state.deferFilterTimers.delete(recordId);
  state.deferFilterRecordIds.delete(recordId);
}

function clearAllDeferredReclassify() {
  state.deferFilterTimers.forEach(timer => clearTimeout(timer));
  state.deferFilterTimers.clear();
  state.deferFilterRecordIds.clear();
}

function renderStats() {
  const teams = ["全部", ...Array.from(new Set(normalizePeople(state.settings.people || []).map(person => person.team).filter(Boolean)))];
  if (!teams.includes(state.statsTeam)) state.statsTeam = "全部";
  const options = statsOptions();
  const data = statsService.filtered(state.records, state.receipts, options);
  const percent = value => `${Number(value || 0)}%`;
  const num = value => `<span class="stats-num">${escapeHtml(value)}</span>`;
  const risk = value => `<span class="stats-num ${Number(value) ? "stats-bad" : ""}">${escapeHtml(value)}</span>`;
  const riskRate = value => `<span class="stats-num ${Number(value) ? "stats-bad" : ""}">${percent(value)}</span>`;
  const rate = value => `<span class="stats-num ${Number(value) >= 90 ? "stats-good" : ""}">${percent(value)}</span>`;
  const teamRow = row => `<div class="stats-table-row stats-team-row"><span>${escapeHtml(row.team)}</span>${num(row.peopleCount)}${num(row.total)}${num(row.read)}${risk(row.totalUnread)}${num(row.unread)}${risk(row.overdueUnread)}${risk(row.overdueRead)}${rate(row.readRate)}${riskRate(row.overdueRate)}</div>`;
  const personRow = row => `<div class="stats-table-row stats-person-row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.team)}</span>${num(row.total)}${num(row.read)}${risk(row.totalUnread)}${num(row.unread)}${risk(row.overdueUnread)}${risk(row.overdueRead)}${rate(row.readRate)}${riskRate(row.overdueRate)}</div>`;
  $("#statsPanel").innerHTML = `<div class="module-head">
    <div><h1>统计分析</h1><p>按阅读回执统计个人和班组已读、未读、超期情况，用于考核核对。</p></div>
    <div class="stats-actions"><button id="exportStatsExcelBtn" class="btn" type="button">导出 Excel</button><button id="exportStatsCsvBtn" class="btn secondary" type="button">导出 CSV</button></div>
  </div>
  <section class="metric-grid">
    <div class="metric"><span>发布数</span><strong>${data.overview.publishCount}</strong></div>
    <div class="metric"><span>接收人次</span><strong>${data.overview.total}</strong></div>
    <div class="metric"><span>已读人次</span><strong>${data.overview.read + data.overview.overdueRead}</strong></div>
    <div class="metric"><span>整体已读率</span><strong>${percent(data.overview.readRate)}</strong></div>
    <div class="metric"><span>未读</span><strong>${data.overview.unread}</strong></div>
    <div class="metric warn"><span>超期未读</span><strong>${data.overview.overdueUnread}</strong></div>
    <div class="metric warn"><span>超期已读</span><strong>${data.overview.overdueRead}</strong></div>
    <div class="metric warn"><span>超期率</span><strong>${percent(data.overview.overdueRate)}</strong></div>
  </section>
  <section class="data-panel setting-list"><div class="stats-toolbar"><input id="statsSearch" class="search" type="search" placeholder="搜索姓名、班组、工号" value="${escapeHtml(state.statsSearch)}"><label class="select-pill">班组<select id="statsTeamSelect">${teams.map(team => `<option value="${escapeHtml(team)}" ${team === state.statsTeam ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}</select></label><label class="select-pill stats-date">开始<input id="statsStartDate" type="date" value="${escapeHtml(state.statsStartDate)}"></label><label class="select-pill stats-date">结束<input id="statsEndDate" type="date" value="${escapeHtml(state.statsEndDate)}"></label><button id="clearStatsDatesBtn" class="btn secondary" type="button">清除日期</button></div><div class="status-line">${escapeHtml(statsFilterText(options))} · 当前班组 ${data.teams.length} 个 · 当前个人 ${data.people.length} 人</div></section>
  <section class="stats-layout">
    <div class="data-panel"><div class="stats-section-title">班组统计</div><div class="stats-table"><div class="stats-table-row stats-team-row head"><span>班组</span><span class="stats-num">人数</span><span class="stats-num">应读</span><span class="stats-num">已读</span><span class="stats-num">总未读</span><span class="stats-num">未读</span><span class="stats-num">超期未读</span><span class="stats-num">超期已读</span><span class="stats-num">已读率</span><span class="stats-num">超期率</span></div>${data.teams.map(teamRow).join("") || '<div class="status-line" style="padding:12px">暂无班组统计。</div>'}</div></div>
    <div class="data-panel"><div class="stats-section-title">个人统计</div><div class="stats-table"><div class="stats-table-row stats-person-row head"><span>姓名</span><span>班组</span><span class="stats-num">应读</span><span class="stats-num">已读</span><span class="stats-num">总未读</span><span class="stats-num">未读</span><span class="stats-num">超期未读</span><span class="stats-num">超期已读</span><span class="stats-num">已读率</span><span class="stats-num">超期率</span></div>${data.people.map(personRow).join("") || '<div class="status-line" style="padding:12px">暂无个人统计。</div>'}</div></div>
  </section>`;
}

function roleDefaults(role) {
  return state.settings.rolePermissions?.[role] || state.settings.rolePermissions?.receiver || { allowedTabs: ["homePage", "infoPage", "maintenancePage"], permissions: ["view"] };
}

function checkedGroup(name, options, selected = []) {
  const set = new Set(selected);
  return `<div class="check-grid">${options.map(([value, label]) => `<label class="check-option"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${set.has(value) ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`).join("")}</div>`;
}

function selectedChecks(name) {
  return $$(`input[name="${name}"]:checked`).map(input => input.value);
}

function renderUserManagement() {
  const rows = state.users || [];
  const rowIds = new Set(rows.map(user => user.id));
  state.selectedUserIds = new Set([...state.selectedUserIds].filter(id => rowIds.has(id)));
  const selectedCount = state.selectedUserIds.size;
  const allChecked = rows.length > 0 && rows.every(user => state.selectedUserIds.has(user.id));
  return `<div class="data-panel setting-list user-admin-card"><div class="module-head"><div><strong>登录用户管理</strong><div class="status-line">新增账号、配置角色权限、重置密码和启用/停用。</div></div><button id="openUserCreateBtn" class="btn secondary" type="button">新增账号</button></div>
    <div class="import-box"><label>Excel / CSV 批量导入用户<input id="userImportFile" type="file" accept=".xlsx,.xls,.csv"></label><button id="userImportBtn" class="btn secondary" type="button">导入用户</button><div id="userImportResult" class="status-line">列名：账号、姓名、班组、角色、初始密码、页签权限、功能权限、状态。</div></div>
    <div class="user-batch-toolbar"><span id="userBatchCount" class="status-line">已选择 ${selectedCount} 个账号</span><button id="openUserBatchBtn" class="btn secondary" type="button" ${selectedCount ? "" : "disabled"}>批量修改</button></div>
    <div class="user-table admin-user-table"><div class="user-row admin-user-row head"><span><input id="userSelectAll" type="checkbox" ${allChecked ? "checked" : ""} aria-label="全选当前列表"></span><span>账号</span><span>姓名</span><span>角色</span><span>班组</span><span>状态</span><span>页签</span><span>操作</span></div>${rows.map(user => `<div class="user-row admin-user-row"><span><input type="checkbox" data-user-select="${escapeHtml(user.id)}" ${state.selectedUserIds.has(user.id) ? "checked" : ""} aria-label="选择 ${escapeHtml(user.username)}"></span><span>${escapeHtml(user.username)}</span><span>${escapeHtml(user.name)}</span><span>${escapeHtml(roleLabels[user.role] || user.role)}</span><span>${escapeHtml(user.team || "未设置")}</span><span>${escapeHtml(statusLabels[user.status] || user.status || "启用")}</span><span>${escapeHtml((user.allowedTabs || []).map(tab => tabOptions.find(item => item[0] === tab)?.[1] || tab).join("、"))}</span><span class="user-actions"><button class="link-btn" type="button" data-edit-user="${escapeHtml(user.id)}">编辑</button><button class="link-btn" type="button" data-reset-user="${escapeHtml(user.id)}">重置密码</button><button class="link-btn" type="button" data-toggle-user="${escapeHtml(user.id)}">${user.status === "disabled" ? "启用" : "停用"}</button>${user.id !== state.user.id && user.id !== "54002010" ? `<button class="link-btn danger-text" type="button" data-delete-user="${escapeHtml(user.id)}">删除</button>` : ""}</span></div>`).join("") || '<div class="status-line">暂无账号。</div>'}</div></div>`;
}

function openUserDialog(user = null) {
  const isEdit = !!user;
  const defaults = roleDefaults(user?.role || "receiver");
  const allowedTabs = user?.allowedTabs || defaults.allowedTabs;
  const permissions = user?.permissions || defaults.permissions;
  $("#userDialogBody").innerHTML = `<div class="dialog-head"><h2>${isEdit ? "编辑账号" : "新增账号"}</h2><button class="icon-btn" data-close="userDialog" type="button">×</button></div><form id="userForm" class="entry-grid">
    <input id="userId" type="hidden" value="${escapeHtml(user?.id || "")}">
    <label>账号<input id="userUsername" value="${escapeHtml(user?.username || "")}" ${isEdit ? "disabled" : ""} required></label>
    <label>姓名<input id="userName" value="${escapeHtml(user?.name || "")}" required></label>
    <label>班组<input id="userTeam" value="${escapeHtml(user?.team || "")}" placeholder="例如：一班"></label>
    ${isEdit ? "" : '<label>初始密码<input id="userPassword" value="123456" required></label>'}
    <label>角色<select id="userRole"><option value="receiver">接收者</option><option value="publisher">发布者</option><option value="admin">管理员</option></select></label>
    <label>状态<select id="userStatus"><option value="active">启用</option><option value="disabled">停用</option></select></label>
    <div><span class="status-line">可访问页签</span>${checkedGroup("userTabs", tabOptions, allowedTabs)}</div>
    <div><span class="status-line">功能权限</span>${checkedGroup("userPerms", permissionOptions, permissions)}</div>
    <div class="form-actions"><button class="btn secondary" type="button" data-close="userDialog">取消</button><button class="btn" type="submit">保存</button></div>
  </form>`;
  $("#userRole").value = user?.role || "receiver";
  $("#userStatus").value = user?.status || "active";
  $("#userDialog").showModal();
}

function openUserBatchDialog() {
  const selectedUsers = state.users.filter(user => state.selectedUserIds.has(user.id));
  if (!selectedUsers.length) return;
  const defaults = roleDefaults("receiver");
  $("#userBatchDialogBody").innerHTML = `<div class="dialog-head"><h2>批量修改账号</h2><button class="icon-btn" data-close="userBatchDialog" type="button">×</button></div><form id="userBatchForm" class="entry-grid">
    <div class="status-line">已选择 ${selectedUsers.length} 个账号。仅勾选“应用”的项目会被修改；页签和功能权限将完整替换。</div>
    <label class="batch-apply"><input id="batchApplyRole" type="checkbox">应用角色<select id="batchRole"><option value="receiver">接收者</option><option value="publisher">发布者</option><option value="admin">管理员</option></select></label>
    <label class="batch-apply"><input id="batchApplyStatus" type="checkbox">应用状态<select id="batchStatus"><option value="active">启用</option><option value="disabled">停用</option></select></label>
    <label class="batch-apply"><input id="batchApplyTeam" type="checkbox">应用班组<input id="batchTeam" placeholder="例如：一班"></label>
    <div class="batch-section"><label class="login-check"><input id="batchApplyTabs" type="checkbox">应用可访问页签</label>${checkedGroup("batchTabs", tabOptions, defaults.allowedTabs)}</div>
    <div class="batch-section"><label class="login-check"><input id="batchApplyPerms" type="checkbox">应用功能权限</label>${checkedGroup("batchPerms", permissionOptions, defaults.permissions)}</div>
    <div class="form-actions"><button class="btn secondary" type="button" data-close="userBatchDialog">取消</button><button class="btn" type="submit">保存批量修改</button></div>
  </form>`;
  $("#batchRole").value = "receiver";
  $("#userBatchDialog").showModal();
}

function applyRoleDefaults() {
  const defaults = roleDefaults($("#userRole").value);
  $$('input[name="userTabs"]').forEach(input => { input.checked = defaults.allowedTabs.includes(input.value); });
  $$('input[name="userPerms"]').forEach(input => { input.checked = defaults.permissions.includes(input.value); });
}

function applyBatchRoleDefaults() {
  const defaults = roleDefaults($("#batchRole").value);
  $$('input[name="batchTabs"]').forEach(input => { input.checked = defaults.allowedTabs.includes(input.value); });
  $$('input[name="batchPerms"]').forEach(input => { input.checked = defaults.permissions.includes(input.value); });
}

function userPayloadFromForm() {
  return {
    username: $("#userUsername")?.value.trim(),
    name: $("#userName").value.trim(),
    team: $("#userTeam").value.trim() || "未设置",
    department: "未设置",
    password: $("#userPassword")?.value || undefined,
    role: $("#userRole").value,
    status: $("#userStatus").value,
    allowedTabs: selectedChecks("userTabs"),
    permissions: selectedChecks("userPerms")
  };
}

function batchUserUpdatesFromForm() {
  const updates = {};
  if ($("#batchApplyRole")?.checked) updates.role = $("#batchRole").value;
  if ($("#batchApplyStatus")?.checked) updates.status = $("#batchStatus").value;
  if ($("#batchApplyTeam")?.checked) updates.team = $("#batchTeam").value.trim() || "未设置";
  if ($("#batchApplyTabs")?.checked) updates.allowedTabs = selectedChecks("batchTabs");
  if ($("#batchApplyPerms")?.checked) updates.permissions = selectedChecks("batchPerms");
  return updates;
}

function syncUserSelectionUi() {
  const selectedCount = state.selectedUserIds.size;
  const count = $("#userBatchCount");
  if (count) count.textContent = `已选择 ${selectedCount} 个账号`;
  const button = $("#openUserBatchBtn");
  if (button) button.disabled = !selectedCount;
  const boxes = $$("[data-user-select]");
  const all = $("#userSelectAll");
  if (all) all.checked = boxes.length > 0 && boxes.every(box => box.checked);
}

function renderSettings() {
  if (!canOpenSettings()) return;
  const settings = state.settings;
  const peopleRows = normalizePeople(settings.people || []);
  $("#settingsPanel").innerHTML = `<section class="settings-grid">
    <div class="data-panel setting-list"><strong>分类设置</strong><textarea id="settingsCategories" rows="5">${escapeHtml((settings.categories || []).join("\n"))}</textarea><span class="status-line">每行一个分类，保存后会同步到发布表单和筛选。</span></div>
    <div class="data-panel setting-list"><strong>超期门限</strong><label>信息超期门限天数<input id="settingsOverdueDays" type="number" min="1" max="60" value="${escapeHtml(settings.overdueDays || 3)}"></label><label>即将超期提醒天数<input id="settingsReminderDays" type="number" min="1" max="60" value="${escapeHtml(settings.reminderDays || 1)}"></label><span class="status-line">以发布时间为起点，每24小时为一天；只有日期时按当天12:00计算。</span></div>
    <div class="data-panel setting-list"><strong>人员列表</strong><span class="status-line">人员信息由“登录用户管理”的启用账号自动同步，不再单独录入或导入。</span><div class="user-table people-table"><div class="user-row head"><span>账号</span><span>姓名</span><span>班组</span><span>状态</span><span></span><span></span><span></span></div>${peopleRows.map(person => `<div class="user-row"><span>${escapeHtml(person.username || person.id)}</span><span>${escapeHtml(person.name)}</span><span>${escapeHtml(person.team || "未设置")}</span><span>启用</span><span></span><span></span><span></span></div>`).join("") || '<div class="status-line">暂无启用账号。</div>'}</div></div>
    <div class="data-panel setting-list"><strong>信息批量导入</strong><div class="import-box"><label>Excel / CSV 导入信息<input id="settingsBatchImportFile" type="file" accept=".xlsx,.xls,.csv,.txt"></label><button id="settingsBatchImportBtn" class="btn secondary" type="button">批量导入信息</button><div id="settingsBatchImportResult" class="status-line">列名：日期、类别、标题、原文、发布者。导入后默认推送全员并标记已读。</div></div></div>
    ${renderUserManagement()}
    <div class="data-panel setting-list"><strong>权限说明</strong><div class="setting-item">接收者：只读信息传达，展开原文自动形成阅读回执。</div><div class="setting-item">发布者：发布、催办、反馈明细和导出。</div><div class="setting-item">管理员：系统设置、删除、附件管理和固化项目维护。</div><div class="setting-item">${escapeHtml(settings.securityNotes)}</div></div>
  </section><div class="form-actions"><button id="saveSettingsBtn" class="btn" type="button">保存设置</button></div>`;
}

function renderEntryOptions() {
  $("#entryCategory").innerHTML = (state.settings.categories || []).map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  renderRecipientPicker();
}

function selectedRecipientIds() {
  return Array.from(state.selectedRecipientIds);
}

function setRecipientSelection(ids) {
  state.selectedRecipientIds = new Set(ids);
  syncRecipientCheckboxes();
}

function syncRecipientCheckboxes() {
  $$("#recipientOptions input[data-recipient]").forEach(input => {
    input.checked = state.selectedRecipientIds.has(input.dataset.recipient);
  });
}

function visibleRecipientIds() {
  return $$("#recipientOptions input[data-recipient]").map(input => input.dataset.recipient);
}

function renderRecipientPicker() {
  const people = normalizePeople(state.settings.people || []);
  const teams = ["全部", ...Array.from(new Set(people.map(person => person.team).filter(Boolean)))];
  const currentTeam = $("#recipientTeamFilter")?.value || "全部";
  const currentSearch = ($("#recipientSearch")?.value || "").trim().toLowerCase();
  $("#recipientTeamFilter").innerHTML = teams.map(team => `<option value="${escapeHtml(team)}" ${team === currentTeam ? "selected" : ""}>${escapeHtml(team)}</option>`).join("");
  const visible = people.filter(person => {
    const text = [person.id, person.name, person.team].join(" ").toLowerCase();
    return (currentTeam === "全部" || person.team === currentTeam) && (!currentSearch || text.includes(currentSearch));
  });
  $("#recipientOptions").innerHTML = visible.map(person => `<label class="recipient-option"><span class="recipient-name">${escapeHtml(person.name)} · ${escapeHtml(person.team)}</span><input type="checkbox" data-recipient="${escapeHtml(person.id)}" ${state.selectedRecipientIds.has(person.id) ? "checked" : ""}></label>`).join("") || '<div class="status-line">没有匹配人员。</div>';
}

function renderFixedAtaOptions() {
  $("#fixedAta").innerHTML = ataOptions.map(ata => `<option value="${ata}">${ata}</option>`).join("");
  $("#fixedAtaFilter").innerHTML = `<option value="全部">全部</option>` + ataOptions.map(ata => `<option value="${ata}">${ata}</option>`).join("");
}

function filteredFixed() {
  const term = $("#fixedSearch").value.trim().toLowerCase();
  const ata = $("#fixedAtaFilter").value;
  return state.fixedProjects.filter(item => {
    const text = [item.ata, item.title, item.contentHtml, item.references, (item.attachments || []).map(file => file.name).join(" ")].join(" ").toLowerCase();
    return (ata === "全部" || item.ata === ata) && (!term || text.includes(term));
  });
}

function renderFixedProjects() {
  const items = filteredFixed();
  $("#fixedStatus").textContent = `共 ${state.fixedProjects.length} 项 · 当前显示 ${items.length} 项`;
  $("#fixedEmpty").hidden = !!items.length;
  $("#fixedList").innerHTML = items.map(project => `<article class="card fixed-card" data-fixed-id="${escapeHtml(project.id)}">
    <div class="card-row"><span class="tag cat-规定">ATA ${escapeHtml(project.ata)}</span><h2 class="title">${escapeHtml(project.title)}${project.attachments?.length ? '<span class="title-meta"><span class="badge attachment-badge">附件</span></span>' : ""}</h2>
    <div class="more-wrap"><button class="more-btn" type="button" data-more>⋯</button><div class="more-menu">${has("fixedManage") ? `<button class="item-btn" type="button" data-edit-fixed="${escapeHtml(project.id)}">修改</button><button class="item-btn delete" type="button" data-delete-fixed="${escapeHtml(project.id)}">删除</button>` : ""}</div></div></div>
    <div class="card-row secondary"><span>更新 ${escapeHtml((project.updatedAt || "").slice(0, 10))}</span><span>·</span><button class="link-btn" type="button" data-toggle-panel>展开</button><span>·</span><button class="link-btn" type="button" data-print-fixed="${escapeHtml(project.id)}">打印</button></div>
    <div class="fixed-panel" hidden><div class="rich-view">${sanitizeRichHtml(project.contentHtml || "<p>暂无内容</p>")}</div>${project.references ? `<div class="references"><strong>参考资料：</strong>\n${escapeHtml(project.references)}</div>` : ""}${renderAttachments(project, "fixedProject")}</div>
  </article>`).join("");
}

function syncPeopleScopedState() {
  const teams = new Set(["全部", ...normalizePeople(state.settings.people || []).map(person => person.team).filter(Boolean)]);
  if (!teams.has(state.statsTeam)) state.statsTeam = "全部";
}

async function renderAll() {
  if (!isLoggedIn()) {
    renderShell();
    return;
  }
  clearAllDeferredReclassify();
  state.settings = await settingsService.get();
  state.records = await recordService.list();
  state.fixedProjects = await fixedProjectService.list();
  state.users = await userService.list();
  state.receipts = receiptService.list();
  syncPeopleScopedState();
  renderShell();
  renderHome();
  renderEntryOptions();
  renderRecords();
  renderStats();
  renderSettings();
  renderFixedProjects();
}

function showPage(page) {
  state.activePage = canView(page) ? page : "homePage";
  renderAll();
}

function showSubpage(subpage) {
  if (!canViewSubpage(subpage)) subpage = "infoListSubpage";
  state.activeSubpage = subpage;
  renderAll();
}

function openInfoFromHome(filter) {
  clearAllDeferredReclassify();
  state.activePage = canView("infoPage") ? "infoPage" : "homePage";
  state.activeSubpage = "infoListSubpage";
  state.statusFilter = filter || "全部";
  state.activeMonth = "全部";
  state.selectedCategories.clear();
  state.page = 1;
  const search = $("#searchInput");
  if (search) search.value = "";
  renderShell();
  renderRecords();
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function resetRecordForm() {
  $("#entryForm").reset();
  $("#entryId").value = "";
  state.recordFiles.length = 0;
  renderPending(state.recordFiles, $("#recordPending"));
  renderExistingRecordAttachments(null);
  setRecipientSelection(normalizePeople(state.settings.people || []).map(person => person.id));
  renderEntryOptions();
  $("#entryDate").value = inputDateValue();
}

function openRecordForm(record) {
  resetRecordForm();
  $("#entryTitleText").textContent = record ? "修改信息" : "发布信息";
  if (record) {
    $("#entryId").value = record.id;
    $("#entryDate").value = inputDateValue(record.date);
    $("#entryCategory").value = record.category;
    $("#entryTitle").value = record.title;
    $("#entryOriginal").value = record.original;
    $("#entryPriority").value = record.priority || "普通";
    const ids = new Set((record.recipients || []).map(person => person.id));
    setRecipientSelection(Array.from(ids));
    renderExistingRecordAttachments(record);
  }
  $("#entryDialog").showModal();
}

function resetFixedForm() {
  $("#fixedForm").reset();
  $("#fixedId").value = "";
  $("#fixedContent").innerHTML = "";
  state.fixedFiles.length = 0;
  renderPending(state.fixedFiles, $("#fixedPending"));
}

function openFixedForm(project) {
  resetFixedForm();
  $("#fixedDialogTitle").textContent = project ? "修改固化项目" : "新增固化项目";
  $("#fixedId").value = project?.id || "";
  $("#fixedAta").value = project?.ata || "00";
  $("#fixedTitle").value = project?.title || "";
  $("#fixedContent").innerHTML = sanitizeRichHtml(project?.contentHtml || "");
  $("#fixedReferences").value = project?.references || "";
  $("#fixedDialog").showModal();
}

function renderPending(files, container) {
  container.innerHTML = files.map((file, index) => `<div class="pending-file"><span class="pending-file-name">${escapeHtml(file.name)}</span><span>${Math.max(1, Math.round(file.size / 1024))} KB</span><button class="link-btn" type="button" data-remove-pending="${index}">移除</button></div>`).join("");
}

function setupDrop(zone, input, files, list) {
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    files.push(...Array.from(input.files || []));
    input.value = "";
    renderPending(files, list);
  });
  ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
  zone.addEventListener("drop", event => {
    files.push(...Array.from(event.dataTransfer?.files || []));
    renderPending(files, list);
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-pending]");
    if (!button) return;
    files.splice(Number(button.dataset.removePending), 1);
    renderPending(files, list);
  });
}

function readFileAsDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file, ownerType, ownerId) {
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size, ownerType, ownerId, file };
}

async function attachmentsFrom(files, ownerType, ownerId) {
  return Promise.all(files.map(file => fileToAttachment(file, ownerType, ownerId)));
}

async function uploadFiles(ownerType, ownerId, files) {
  if (!files.length) return [];
  const apiType = ownerType === "fixedProject" ? "fixed-projects" : "records";
  const form = new FormData();
  files.forEach(file => form.append("file", file, file.name));
  const data = await apiRequest(`/${apiType}/${encodeURIComponent(ownerId)}/attachments`, { method: "POST", body: form });
  return data.attachments || [];
}

function collectQueuedFiles(queue, input) {
  const files = Array.from(input?.files || []);
  if (files.length) {
    queue.push(...files);
    input.value = "";
  }
  return queue;
}

function allAttachmentOwners() {
  return [...state.records, ...state.fixedProjects];
}

function findAttachment(id, ownerType = "", ownerId = "") {
  const owners = ownerId ? allAttachmentOwners().filter(owner => owner.id === ownerId) : allAttachmentOwners();
  for (const owner of owners) {
    const file = (owner.attachments || []).find(item => item.id === id || item.attachmentId === id || item.name === id);
    if (file) return file;
  }
  return null;
}

async function attachmentSource(file) {
  const blob = await attachmentBlob(file);
  if (blob) return URL.createObjectURL(blob);
  return apiUrl(file?.url || file?.dataUrl || "");
}

async function attachmentBlob(file) {
  if (!file) return "";
  const source = apiUrl(file.url || file.dataUrl || "");
  if (source && source.startsWith("data:")) {
    try {
      return await (await fetch(source)).blob();
    } catch {
      return null;
    }
  }
  if (source) {
    try {
      return await (await fetch(source, { credentials: "include" })).blob();
    } catch {
      return null;
    }
  }
  return null;
}

function isImageAttachment(file, name = "") {
  return String(file?.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || file?.name || "");
}

function attachmentExt(file, name = "") {
  const target = String(name || file?.name || "").toLowerCase();
  return (target.match(/\.([a-z0-9]+)$/) || ["", ""])[1];
}

function isPdfAttachment(file, name = "") {
  return String(file?.type || "") === "application/pdf" || attachmentExt(file, name) === "pdf";
}

function isVideoAttachment(file, name = "") {
  return String(file?.type || "").startsWith("video/") || ["mp4", "mov", "webm", "m4v", "ogg"].includes(attachmentExt(file, name));
}

function isAudioAttachment(file, name = "") {
  return String(file?.type || "").startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "oga", "ogg"].includes(attachmentExt(file, name));
}

function isTextAttachment(file, name = "") {
  return String(file?.type || "").startsWith("text/") || ["txt", "csv", "log", "md"].includes(attachmentExt(file, name));
}

function fileSizeText(size = 0) {
  if (!size) return "未知大小";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function mimeFromPath(path = "") {
  const ext = path.toLowerCase().split(".").pop();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function downloadLink(src, file) {
  return src && src !== "#" ? `<p><a class="link-btn" href="${escapeHtml(src)}" download="${escapeHtml(file?.name || "附件")}" target="_blank">下载 / 外部打开</a></p>` : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setViewerDownload(src, name) {
  state.viewerDownloadUrl = src && src !== "#" ? src : "";
  state.viewerDownloadName = name || "附件";
  const link = $("#viewerDownload");
  if (!link) return;
  if (state.viewerDownloadUrl) {
    link.href = state.viewerDownloadUrl;
    link.download = state.viewerDownloadName;
    link.hidden = false;
  } else {
    link.removeAttribute("href");
    link.hidden = true;
  }
}

function applyViewerZoom() {
  const scale = $("#viewerScale");
  const label = $("#viewerZoomReset");
  if (state.viewerMode === "pdf-html") {
    if (scale) {
      scale.style.transform = "none";
      scale.style.width = "100%";
      scale.style.height = "100%";
    }
    applyPdfHtmlZoom();
    if (label) label.textContent = `${Math.round(state.viewerZoom * 100)}%`;
    return;
  }
  if (scale) {
    scale.style.transform = `scale(${state.viewerZoom})`;
    scale.style.width = `${100 / state.viewerZoom}%`;
    scale.style.height = "";
  }
  if (label) label.textContent = `${Math.round(state.viewerZoom * 100)}%`;
}

function applyPdfHtmlZoom() {
  const frame = $(".pdf-html-frame");
  if (!frame) return;
  try {
    const doc = frame.contentDocument;
    if (!doc) return;
    const html = doc.documentElement;
    const body = doc.body;
    if (!html || !body) return;
    html.style.overflow = "auto";
    body.style.zoom = "";
    body.style.transform = "none";
    body.style.width = "";
    let wrapper = doc.querySelector(".muc-pdf-preview-shell");
    let inner = doc.querySelector(".muc-pdf-preview-inner");
    if (!wrapper || !inner) {
      wrapper = doc.createElement("div");
      inner = doc.createElement("div");
      wrapper.className = "muc-pdf-preview-shell";
      inner.className = "muc-pdf-preview-inner";
      while (body.firstChild) inner.appendChild(body.firstChild);
      wrapper.appendChild(inner);
      body.appendChild(wrapper);
    }
    wrapper.style.position = "relative";
    wrapper.style.overflow = "visible";
    wrapper.style.minWidth = "100%";
    inner.style.display = "inline-block";
    inner.style.minWidth = "100%";
    inner.style.transformOrigin = "top left";
    inner.style.transform = "scale(1)";
    const rect = inner.getBoundingClientRect();
    const naturalWidth = rect.width || inner.scrollWidth || frame.clientWidth || 1;
    const naturalHeight = rect.height || inner.scrollHeight || frame.clientHeight || 1;
    inner.dataset.naturalWidth = inner.dataset.naturalWidth || String(naturalWidth);
    inner.dataset.naturalHeight = inner.dataset.naturalHeight || String(naturalHeight);
    const baseWidth = Number(inner.dataset.naturalWidth) || naturalWidth;
    const baseHeight = Number(inner.dataset.naturalHeight) || naturalHeight;
    inner.style.transform = `scale(${state.viewerZoom})`;
    wrapper.style.width = `${baseWidth * state.viewerZoom}px`;
    wrapper.style.height = `${baseHeight * state.viewerZoom}px`;
  } catch {
    // Same-origin HTML previews can be zoomed directly; fall back silently if a browser blocks access.
  }
}

function setViewerPreview(html, options = {}) {
  state.viewerMode = options.mode || "";
  state.viewerPdfSrc = options.pdfSrc || "";
  $("#viewerContent").innerHTML = `<div id="viewerScale" class="preview-scale${state.viewerMode === "pdf-html" ? " pdf-html-scale" : ""}">${html}</div>`;
  if (state.viewerMode === "pdf-html") {
    const frame = $(".pdf-html-frame");
    if (frame) frame.addEventListener("load", applyPdfHtmlZoom);
  }
  applyViewerZoom();
}

function changeViewerZoom(delta) {
  state.viewerZoom = clamp(Math.round((state.viewerZoom + delta) * 100) / 100, 0.5, 2);
  applyViewerZoom();
}

function resetViewerZoom() {
  state.viewerZoom = 1;
  applyViewerZoom();
}

function renderPreviewFallback(file, src, message = "该文件暂不支持页面内预览。") {
  return `<div class="preview-fallback"><strong>${escapeHtml(file?.name || "附件")}</strong><p>${escapeHtml(message)}</p><p>类型：${escapeHtml(file?.type || "未知")} · 大小：${escapeHtml(fileSizeText(file?.size || 0))}</p>${downloadLink(src, file)}</div>`;
}

async function pdfPreviewInfo(file) {
  const id = file?.id || file?.attachmentId;
  if (!id) return { type: "fallback" };
  try {
    return await apiRequest(`/attachments/${encodeURIComponent(id)}/preview`);
  } catch {
    return { type: "fallback" };
  }
}

function renderSheetPreview(rows) {
  const visibleRows = rows.slice(0, 200);
  const maxCols = Math.min(30, Math.max(1, ...visibleRows.map(row => row.length)));
  const htmlRows = visibleRows.map(row => `<tr>${Array.from({ length: maxCols }, (_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`).join("");
  const note = rows.length > visibleRows.length ? `<div class="status-line">仅预览前 ${visibleRows.length} 行。</div>` : "";
  return `<div class="preview-table-wrap"><table class="preview-table">${htmlRows}</table></div>${note}`;
}

function renderWorkbookPreview(sheets) {
  const safeSheets = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const tabs = safeSheets.map((sheet, index) => `<button class="sheet-tab ${index === 0 ? "active" : ""}" type="button" data-sheet-tab="${index}">${escapeHtml(sheet.name || `Sheet${index + 1}`)}</button>`).join("");
  const panels = safeSheets.map((sheet, index) => `<div class="sheet-panel" data-sheet-panel="${index}" ${index === 0 ? "" : "hidden"}>${renderSheetPreview(sheet.rows || [])}</div>`).join("");
  return `<div class="sheet-preview"><div class="sheet-tabs">${tabs}</div>${panels}</div>`;
}

function relsMap(xmlText) {
  if (!xmlText) return {};
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(xml.getElementsByTagName("Relationship")).reduce((map, item) => {
    map[item.getAttribute("Id")] = item.getAttribute("Target") || "";
    return map;
  }, {});
}

function normalizeZipPath(path = "") {
  const parts = [];
  path.split("/").forEach(part => {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

async function renderDocxPreview(blob, file, src) {
  const files = await readZipEntries(await blob.arrayBuffer()), decoder = new TextDecoder();
  const documentFile = files["word/document.xml"];
  if (!documentFile) throw new Error("未找到 Word 正文");
  const rels = relsMap(files["word/_rels/document.xml.rels"] ? decoder.decode(files["word/_rels/document.xml.rels"]) : "");
  const mediaHtml = rid => {
    const target = rels[rid];
    if (!target) return "";
    const path = normalizeZipPath(target.startsWith("/") ? target.slice(1) : `word/${target}`);
    const bytes = files[path];
    if (!bytes) return "";
    const mime = mimeFromPath(path);
    if (!mime.startsWith("image/")) return "";
    return `<img class="preview-doc-image" src="data:${mime};base64,${bytesToBase64(bytes)}" alt="Word 图片">`;
  };
  const xml = new DOMParser().parseFromString(decoder.decode(documentFile), "application/xml");
  const paragraphs = Array.from(xml.getElementsByTagName("w:p"));
  const html = paragraphs.map(paragraph => {
    const text = Array.from(paragraph.getElementsByTagName("w:t")).map(node => node.textContent || "").join("");
    const blips = Array.from(paragraph.getElementsByTagName("a:blip"));
    const images = blips.map(node => mediaHtml(node.getAttribute("r:embed") || node.getAttribute("r:link"))).filter(Boolean).join("");
    return (text.trim() || images) ? `<p>${escapeHtml(text)}</p>${images}` : "";
  }).filter(Boolean).join("");
  return `<div class="preview-doc"><div class="status-line">当前为基础预览，完整格式请下载或外部打开。</div>${html || "<p>未识别到正文内容。</p>"}${downloadLink(src, file)}</div>`;
}

async function renderAttachmentPreview(file, src) {
  const name = file?.name || "附件";
  const blob = await attachmentBlob(file);
  const hasSource = !!src && src !== "#";
  if (isImageAttachment(file, name) && hasSource) return `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}">`;
  if (isPdfAttachment(file, name) && hasSource) {
    const preview = await pdfPreviewInfo(file);
    if (preview?.type === "html" && preview.url) {
      return `<iframe class="pdf-html-frame" src="${escapeHtml(apiUrl(preview.url))}" title="${escapeHtml(name)}" sandbox="allow-same-origin"></iframe>`;
    }
    return renderPreviewFallback(file, src, "当前 PDF 暂无页面预览，请下载或外部打开。");
  }
  if (isVideoAttachment(file, name) && hasSource) return `<video src="${escapeHtml(src)}" controls></video>`;
  if (isAudioAttachment(file, name) && hasSource) return `<audio src="${escapeHtml(src)}" controls></audio>${downloadLink(src, file)}`;
  if (blob && isTextAttachment(file, name)) return `<pre class="preview-text">${escapeHtml(await blob.text())}</pre>`;
  if (blob && attachmentExt(file, name) === "xlsx") {
    try {
      return renderWorkbookPreview(await parseXlsxWorkbook(blob));
    } catch (error) {
      return renderPreviewFallback(file, src, `Excel 预览失败：${error.message}`);
    }
  }
  if (blob && attachmentExt(file, name) === "docx") {
    try {
      return await renderDocxPreview(blob, file, src);
    } catch (error) {
      return renderPreviewFallback(file, src, `Word 预览失败：${error.message}`);
    }
  }
  return renderPreviewFallback(file, src);
}

function entryPayload(existing) {
  const selectedRecipients = selectedRecipientIds();
  const date = $("#entryDate").value || inputDateValue();
  return {
    date,
    category: $("#entryCategory").value,
    title: $("#entryTitle").value.trim(),
    original: $("#entryOriginal").value.trim(),
    publisher: existing?.publisher || state.user.name,
    recipients: selectedRecipients.length ? normalizeRecipients(selectedRecipients) : [],
    deadline: calculateDeadline(date),
    priority: $("#entryPriority").value,
    pinned: false,
    remindEnabled: true,
    allowEdit: true,
    allowWithdraw: false,
    publisherId: existing?.publisherId || state.user.id,
    createdBy: existing?.createdBy || state.user.id,
    updatedBy: state.user.id,
    publishStatus: existing?.publishStatus || "已发布",
    attachments: existing?.attachments || []
  };
}

function feedbackRows(record) {
  return (record.recipients || []).map(person => {
    const receipt = state.receipts.find(item => item.recordId === record.id && item.userId === person.id);
    const status = receipt?.readAt ? (receipt.isOverdue ? "超期已读" : "已读") : (isPast(record.deadline) ? "已超期" : "未读");
    return { person, receipt, status };
  });
}

function openFeedback(record) {
  $("#feedbackTitle").textContent = `反馈明细：${record.title}`;
  const rows = feedbackRows(record);
  const statusOptions = ["未读", "已读", "已超期", "超期已读"];
  if (state.user.role === "admin" && record.publishStatus !== "作废") {
    $("#feedbackBody").innerHTML = `<div class="feedback-tools"><button class="btn secondary" type="button" data-feedback-select-all>全选</button><button class="btn secondary" type="button" data-feedback-clear>取消选择</button><select id="feedbackBulkStatus">${statusOptions.map(status => `<option>${status}</option>`).join("")}</select><button class="btn" type="button" data-feedback-bulk>批量修改</button></div><div class="feedback-table feedback-admin"><div class="feedback-row head"><span>选择</span><span>姓名</span><span>部门/班组</span><span>状态</span><span>阅读时间</span><span>提醒</span></div>${rows.map(row => `<div class="feedback-row"><span><input type="checkbox" data-feedback-user="${escapeHtml(row.person.id)}"></span><span>${escapeHtml(row.person.name)}</span><span>${escapeHtml(row.person.department)} / ${escapeHtml(row.person.team)}</span><span><select data-feedback-status="${escapeHtml(row.person.id)}">${statusOptions.map(status => `<option value="${status}" ${status === row.status ? "selected" : ""}>${status}</option>`).join("")}</select></span><span>${escapeHtml(row.receipt?.readAt ? formatDisplayDate(row.receipt.readAt) : "-")}</span><span>${escapeHtml(row.receipt?.remindCount || 0)}</span></div>`).join("")}</div>`;
  } else {
    $("#feedbackBody").innerHTML = `<div class="feedback-table"><div class="feedback-row head"><span>姓名</span><span>部门/班组</span><span>状态</span><span>阅读时间</span><span>提醒</span></div>${rows.map(row => `<div class="feedback-row"><span>${escapeHtml(row.person.name)}</span><span>${escapeHtml(row.person.department)} / ${escapeHtml(row.person.team)}</span><span>${escapeHtml(row.status)}</span><span>${escapeHtml(row.receipt?.readAt ? formatDisplayDate(row.receipt.readAt) : "-")}</span><span>${escapeHtml(row.receipt?.remindCount || 0)}</span></div>`).join("")}</div>`;
  }
  const dialog = $("#feedbackDialog");
  dialog.dataset.recordId = record.id;
  if (!dialog.open) dialog.showModal();
}

function exportFeedback(record) {
  const lines = ["姓名,部门,班组,状态,阅读时间,提醒次数"].concat(feedbackRows(record).map(row => [row.person.name, row.person.department, row.person.team, row.status, row.receipt?.readAt || "", row.receipt?.remindCount || 0].map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${record.title}-反馈记录.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function statsOptions() {
  return { search: state.statsSearch, team: state.statsTeam, startDate: state.statsStartDate, endDate: state.statsEndDate };
}

function statsFilterText(options = statsOptions()) {
  const dates = options.startDate || options.endDate ? `${options.startDate || "最早"} 至 ${options.endDate || "最新"}` : "全部日期";
  const team = options.team && options.team !== "全部" ? `班组：${options.team}` : "全部班组";
  const search = options.search ? `搜索：${options.search}` : "全部人员";
  return `${dates} · ${team} · ${search}`;
}

function exportStatsCsv() {
  const csv = statsService.exportStatsCsv(state.records, state.receipts, statsOptions());
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `信息阅读统计-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportStatsExcel() {
  const tables = statsService.exportTables(state.records, state.receipts, statsOptions());
  const blob = buildXlsxWorkbook(tables);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `信息阅读统计-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&'"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char]));
}

function columnName(index) {
  let name = "";
  let number = index + 1;
  while (number > 0) {
    const mod = (number - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    number = Math.floor((number - mod) / 26);
  }
  return name;
}

function worksheetXml(rows) {
  const sheetData = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetData}</sheetData></worksheet>`;
}

function workbookXml(tables) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xmlEscape(table.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
}

function workbookRelsXml(tables) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}</Relationships>`;
}

function contentTypesXml(tables) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function crc32(bytes) {
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  }));
  let crc = 0xffffffff;
  bytes.forEach(byte => { crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8); });
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  files.forEach(file => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, name.length);
    writeUint16(local, 28, 0);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, name.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  });
  const centralStart = offset;
  const centralBytes = concatBytes(centrals);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralBytes.length);
  writeUint32(end, 16, centralStart);
  writeUint16(end, 20, 0);
  return concatBytes([...locals, centralBytes, end]);
}

function buildXlsxWorkbook(tables) {
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(tables) },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: workbookXml(tables) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(tables) },
    ...tables.map((table, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(table.rows) }))
  ];
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function printFixed(project) {
  $("#printArea").innerHTML = `<h1>ATA ${escapeHtml(project.ata)} ${escapeHtml(project.title)}</h1><div class="rich-view">${sanitizeRichHtml(project.contentHtml || "")}</div>${project.references ? `<h2>参考资料</h2><div class="references">${escapeHtml(project.references)}</div>` : ""}${project.attachments?.length ? `<h2>附件</h2><ul>${project.attachments.map(file => `<li>${escapeHtml(file.name)}</li>`).join("")}</ul>` : ""}`;
  $("#printArea").hidden = false;
  window.print();
  $("#printArea").hidden = true;
}

async function saveSettingsFromForm() {
  const categories = $("#settingsCategories").value.split(/\n+/).map(item => item.trim()).filter(Boolean);
  state.settings = await settingsService.save({ ...state.settings, categories, overdueDays: Number($("#settingsOverdueDays").value) || 3, reminderDays: Number($("#settingsReminderDays").value) || 1 });
  alert("设置已保存。人员信息由登录用户管理自动同步。");
  await renderAll();
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(cell); cell = ""; continue; }
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (char !== "\r") cell += char;
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function excelSerialToDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 20000 || number > 80000) return "";
  const utc = Math.round((number - 25569) * 86400 * 1000);
  const date = new Date(utc);
  const pad = item => String(item).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function normalizeBatchDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const serialDate = excelSerialToDate(raw);
  if (serialDate) return serialDate;
  const parsed = parseDate(raw);
  return parsed ? formatDisplayDateOnly(parsed) : raw;
}

function batchRowsFromRows(rows) {
  const filtered = rows.map(row => row.map(cell => String(cell ?? "").trim())).filter(row => row.some(Boolean));
  if (!filtered.length) return { rows: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const dateIndex = indexOf(["日期", "时间", "发布时间"]);
  const categoryIndex = indexOf(["类别", "分类"]);
  const titleIndex = indexOf(["标题", "题目"]);
  const originalIndex = indexOf(["原文", "内容", "正文"]);
  const publisherIndex = indexOf(["发布者", "发布人"]);
  const hasHeader = [dateIndex, categoryIndex, titleIndex, originalIndex].every(index => index >= 0);
  const dataRows = hasHeader ? filtered.slice(1) : filtered;
  let skipped = 0;
  const parsedRows = dataRows.map(row => {
    const draft = hasHeader ? {
      date: row[dateIndex],
      category: row[categoryIndex],
      title: row[titleIndex],
      original: row[originalIndex],
      publisher: publisherIndex >= 0 ? row[publisherIndex] : ""
    } : {
      date: row[0],
      category: row[1],
      title: row[2],
      original: row[3],
      publisher: row[4]
    };
    const item = {
      date: normalizeBatchDate(draft.date),
      category: String(draft.category || "").trim(),
      title: String(draft.title || "").trim(),
      original: String(draft.original || "").trim(),
      publisher: String(draft.publisher || "").trim() || state.user.name
    };
    if (!item.date || !item.category || !item.title || !item.original) {
      skipped++;
      return null;
    }
    return item;
  }).filter(Boolean);
  return { rows: parsedRows, skipped };
}

async function batchRowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) throw new Error("xls 格式请先另存为 xlsx 或 CSV");
  if (name.endsWith(".xlsx")) return batchRowsFromRows(await parseXlsx(file));
  return batchRowsFromRows(parseCsv(await file.text()));
}

function importRecipientPeople() {
  const people = normalizePeople(state.settings.people || []);
  const byId = new Map(people.map(person => [person.id, person]));
  demoUsers.forEach(user => {
    if (!byId.has(user.id)) {
      byId.set(user.id, { id: user.id, name: user.name, department: user.department || "未设置", team: user.team || "未设置" });
    }
  });
  return Array.from(byId.values());
}

function isFullRecipientRecord(record, people) {
  const recipientIds = new Set((record.recipients || []).map(person => person.id));
  const settingPeople = normalizePeople(state.settings.people || []);
  const settingIds = settingPeople.map(person => person.id).filter(Boolean);
  if (!settingIds.length) return false;
  return settingIds.every(id => recipientIds.has(id));
}

function shouldRepairImportedRead(record, people) {
  if (record.importedRead || record.importedReadComplete || record.sourceSet === "batchImport") return true;
  const admin = demoUsers.find(user => user.role === "admin");
  return record.createdBy === admin?.id &&
    record.publisherId === admin?.id &&
    isFullRecipientRecord(record, people);
}

function repairImportedReadReceipts() {
  const people = importRecipientPeople();
  if (!people.length) return;
  const receipts = receiptService.list();
  const now = new Date().toISOString();
  let recordsChanged = false;
  let receiptsChanged = false;
  const nextRecords = state.records.map(record => {
    const shouldRepair = shouldRepairImportedRead(record, people);
    if (!shouldRepair) return record;
    const recipientMap = new Map((record.recipients || []).map(person => [person.id, person]));
    people.forEach(person => {
      if (!recipientMap.has(person.id)) {
        recipientMap.set(person.id, person);
        recordsChanged = true;
      }
      const receipt = receipts.find(item => item.recordId === record.id && item.userId === person.id);
      if (receipt) {
        if (!receipt.readAt || receipt.isOverdue) {
          receipt.readAt = receipt.readAt || now;
          receipt.isOverdue = false;
          receiptsChanged = true;
        }
      } else {
        receipts.push({ recordId: record.id, userId: person.id, readAt: now, isOverdue: false, remindCount: 0, lastRemindedAt: "" });
        receiptsChanged = true;
      }
    });
    if (!record.importedRead) recordsChanged = true;
    return { ...record, importedRead: true, sourceSet: record.sourceSet || "batchImport", recipients: Array.from(recipientMap.values()) };
  });
  if (recordsChanged) {
    state.records = nextRecords;
    recordService.saveAll(nextRecords);
  }
  if (receiptsChanged) receiptService.saveAll(receipts);
}

async function inflateBytes(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("当前浏览器不支持直接解析 xlsx");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(buffer) {
  const data = new Uint8Array(buffer), view = new DataView(buffer);
  let eocd = -1;
  for (let index = data.length - 22; index >= 0; index--) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("未识别到 xlsx 结构");
  const total = view.getUint16(eocd + 10, true), cdOffset = view.getUint32(eocd + 16, true), decoder = new TextDecoder(), files = {};
  let offset = cdOffset;
  for (let count = 0; count < total; count++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true), nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true), localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true), start = localOffset + 30 + localNameLength + localExtraLength, raw = data.slice(start, start + size);
    files[name] = method === 0 ? raw : method === 8 ? await inflateBytes(raw) : raw;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function parseSheetRows(sheetFile, shared, decoder, parser) {
  const sheet = parser.parseFromString(decoder.decode(sheetFile), "application/xml"), rows = [];
  Array.from(sheet.getElementsByTagName("row")).forEach(rowNode => {
    const row = [];
    Array.from(rowNode.getElementsByTagName("c")).forEach(cell => {
      const ref = cell.getAttribute("r") || "", column = (ref.match(/[A-Z]+/) || ["A"])[0].split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1, type = cell.getAttribute("t"), valueNode = cell.getElementsByTagName("v")[0];
      let value = valueNode ? valueNode.textContent || "" : cell.textContent || "";
      if (type === "s") value = shared[Number(value)] || "";
      row[column] = value;
    });
    rows.push(row.map(value => value || ""));
  });
  return rows;
}

async function parseXlsxWorkbook(file) {
  const files = await readZipEntries(await file.arrayBuffer()), decoder = new TextDecoder(), parser = new DOMParser(), shared = [];
  if (files["xl/sharedStrings.xml"]) {
    const sharedXml = parser.parseFromString(decoder.decode(files["xl/sharedStrings.xml"]), "application/xml");
    Array.from(sharedXml.getElementsByTagName("si")).forEach(item => shared.push(item.textContent || ""));
  }
  const workbookFile = files["xl/workbook.xml"];
  if (!workbookFile) {
    const fallback = files["xl/worksheets/sheet1.xml"];
    if (!fallback) throw new Error("未找到第一张工作表");
    return [{ name: "Sheet1", rows: parseSheetRows(fallback, shared, decoder, parser) }];
  }
  const workbook = parser.parseFromString(decoder.decode(workbookFile), "application/xml");
  const rels = relsMap(files["xl/_rels/workbook.xml.rels"] ? decoder.decode(files["xl/_rels/workbook.xml.rels"]) : "");
  const sheets = Array.from(workbook.getElementsByTagName("sheet")).map((sheet, index) => {
    const relId = sheet.getAttribute("r:id");
    const target = rels[relId] || `worksheets/sheet${index + 1}.xml`;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace("xl//", "xl/");
    const sheetFile = files[path];
    return sheetFile ? { name: sheet.getAttribute("name") || `Sheet${index + 1}`, rows: parseSheetRows(sheetFile, shared, decoder, parser) } : null;
  }).filter(Boolean);
  if (!sheets.length) throw new Error("未找到可预览的工作表");
  return sheets;
}

async function parseXlsx(file) {
  const sheets = await parseXlsxWorkbook(file);
  return sheets[0]?.rows || [];
}

function peopleFromRows(rows) {
  const filtered = rows.filter(row => row.some(cell => String(cell || "").trim()));
  if (filtered.length < 2) return { people: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const idIndex = indexOf(["工号", "员工号", "人员工号"]);
  const nameIndex = indexOf(["姓名", "人员", "名字"]);
  const teamIndex = indexOf(["班组", "小组", "组别"]);
  let skipped = 0;
  const people = filtered.slice(1).map(row => {
    const id = String(row[idIndex] || "").trim();
    const name = String(row[nameIndex] || "").trim();
    const team = String(row[teamIndex] || "").trim();
    if (idIndex < 0 || nameIndex < 0 || teamIndex < 0 || !/^\d{8}$/.test(id) || !name || !team) {
      skipped++;
      return null;
    }
    return { id, name, department: "未设置", team };
  }).filter(Boolean);
  return { people: normalizePeople(people), skipped };
}

function userRowsFromRows(rows) {
  const filtered = rows.map(row => row.map(cell => String(cell ?? "").trim())).filter(row => row.some(Boolean));
  if (!filtered.length) return { rows: [], skipped: 0 };
  const headers = filtered[0].map(normalizeHeader);
  const indexOf = names => headers.findIndex(header => names.includes(header));
  const usernameIndex = indexOf(["账号", "用户名", "登录账号"]);
  const nameIndex = indexOf(["姓名", "名称"]);
  const teamIndex = indexOf(["班组", "组别"]);
  const roleIndex = indexOf(["角色"]);
  const passwordIndex = indexOf(["初始密码", "密码"]);
  const tabsIndex = indexOf(["页签权限", "页签"]);
  const permsIndex = indexOf(["功能权限", "权限"]);
  const statusIndex = indexOf(["状态"]);
  const hasHeader = usernameIndex >= 0;
  let skipped = 0;
  const rowsOut = (hasHeader ? filtered.slice(1) : filtered).map(row => {
    const item = hasHeader ? {
      username: row[usernameIndex],
      name: row[nameIndex],
      team: row[teamIndex],
      role: row[roleIndex],
      password: row[passwordIndex],
      allowedTabs: row[tabsIndex],
      permissions: row[permsIndex],
      status: row[statusIndex]
    } : {
      username: row[0],
      name: row[1],
      team: row[2],
      role: row[3],
      password: row[4],
      allowedTabs: row[5],
      permissions: row[6],
      status: row[7]
    };
    if (!String(item.username || "").trim()) {
      skipped++;
      return null;
    }
    return item;
  }).filter(Boolean);
  return { rows: rowsOut, skipped };
}

async function userRowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) throw new Error("xls 格式请先另存为 xlsx 或 CSV");
  if (name.endsWith(".xlsx")) return userRowsFromRows(await parseXlsx(file));
  return userRowsFromRows(parseCsv(await file.text()));
}

async function importUserFile() {
  const input = $("#userImportFile"), result = $("#userImportResult"), file = input?.files?.[0];
  if (!file) {
    result.textContent = "请选择用户 Excel 或 CSV 文件。";
    return;
  }
  try {
    const parsed = await userRowsFromFile(file);
    if (!parsed.rows.length) {
      result.textContent = "未识别到有效账号，请检查列名：账号、姓名、班组、角色、初始密码、页签权限、功能权限、状态。";
      return;
    }
    const response = await userService.importRows(parsed.rows);
    await renderAll();
    const next = $("#userImportResult");
    if (next) next.textContent = `新增 ${response.created} 个，更新 ${response.updated} 个，跳过 ${response.skipped + parsed.skipped} 行。`;
  } catch (error) {
    result.textContent = error.message;
  }
}

async function importPeopleFile() {
  const input = $("#peopleImportFile"), result = $("#peopleImportResult"), file = input?.files?.[0];
  if (!file) { result.textContent = "请选择人员 Excel 或 CSV 文件。"; return; }
  const name = file.name.toLowerCase();
  let rows = [];
  try {
    if (name.endsWith(".xlsx")) rows = await parseXlsx(file);
    else if (name.endsWith(".xls")) { result.textContent = "xls 格式请先另存为 xlsx 或 CSV。"; return; }
    else rows = parseCsv(await file.text());
  } catch (error) {
    result.textContent = `${error.message}。可将 Excel 另存为 CSV 后导入。`;
    return;
  }
  const parsed = peopleFromRows(rows);
  if (!parsed.people.length) {
    result.textContent = "未找到有效人员，请检查列名：工号、姓名、班组。";
    return;
  }
  state.settings = await settingsService.save({ ...state.settings, people: parsed.people });
  await renderAll();
  $("#peopleImportResult").textContent = `已导入 ${parsed.people.length} 人，跳过 ${parsed.skipped} 行。`;
}

async function importBatchRecords() {
  if (state.user.role !== "admin") return;
  const file = $("#settingsBatchImportFile")?.files?.[0];
  const result = $("#settingsBatchImportResult");
  if (!file) {
    result.textContent = "请选择 Excel 或 CSV 文件。";
    return;
  }
  let parsed;
  try {
    parsed = await batchRowsFromFile(file);
  } catch (error) {
    result.textContent = `${error.message}。可将文件另存为 xlsx 或 CSV 后导入。`;
    return;
  }
  const rows = parsed.rows;
  if (!rows.length) {
    result.textContent = "未识别到有效信息，请检查列名：日期、类别、标题、原文、发布者。";
    return;
  }
  const importResult = await recordService.importRows(rows);
  await renderAll();
  const nextResult = $("#settingsBatchImportResult");
  if (nextResult) nextResult.textContent = `已导入 ${importResult.created} 条，跳过 ${parsed.skipped + importResult.skipped} 行，生成已读回执 ${importResult.receiptCount} 人次。`;
}

document.addEventListener("click", event => {
  const close = event.target.closest("[data-close]");
  if (close) {
    const dialog = $("#" + close.dataset.close);
    if (dialog.id === "viewerDialog") {
      $("#viewerContent").innerHTML = "";
      state.viewerMode = "";
      state.viewerPdfSrc = "";
      setViewerDownload("", "");
      resetViewerZoom();
    }
    dialog.close();
  }
  const more = event.target.closest("[data-more]");
  if (more) {
    const wrap = more.closest(".more-wrap");
    const shouldOpen = !wrap.classList.contains("open");
    closeOpenMenus(wrap);
    wrap.classList.toggle("open", shouldOpen);
    wrap.closest(".card")?.classList.toggle("menu-open", shouldOpen);
    if (shouldOpen) positionOpenMenu(wrap);
    event.stopPropagation();
  } else if (!event.target.closest(".more-wrap")) {
    closeOpenMenus();
  }
  if (!event.target.closest(".subpage-menu-wrap")) closeSubpageMenu();
});

$$(".top-tab").forEach(tab => tab.addEventListener("click", () => showPage(tab.dataset.page)));
$$(".subtab").forEach(tab => tab.addEventListener("click", () => showSubpage(tab.dataset.subpage)));
$("#homeInfoMetrics")?.addEventListener("click", event => {
  const button = event.target.closest("[data-home-info-filter]");
  if (!button) return;
  openInfoFromHome(button.dataset.homeInfoFilter);
});
$("#subpageMenuBtn").addEventListener("click", event => {
  event.stopPropagation();
  toggleSubpageMenu();
});
$("#loginBtn").addEventListener("click", () => showLoginPage());
$("#openChangePasswordBtn").addEventListener("click", openChangePasswordDialog);
$("#logoutBtn").addEventListener("click", async () => {
  sessionStorage.setItem(AUTO_LOGIN_SKIP_KEY, "1");
  await authService.logout();
  state.user = emptyUser();
  await navigate(ROUTES.login, { replace: true });
});
$("#openEntryBtn").addEventListener("click", () => openRecordForm());
$("#openFixedBtn").addEventListener("click", () => openFixedForm());
$("#viewerZoomOut").addEventListener("click", () => changeViewerZoom(-0.1));
$("#viewerZoomIn").addEventListener("click", () => changeViewerZoom(0.1));
$("#viewerZoomReset").addEventListener("click", resetViewerZoom);

$$(".demo-login").forEach(button => button.addEventListener("click", () => {
  const user = demoUsers.find(item => item.username === button.dataset.demoUser);
  $("#loginUser").value = user.username;
  $("#loginPass").value = user.password;
  performLogin();
}));

$("#rememberPassword").addEventListener("change", () => {
  if (!$("#rememberPassword").checked) $("#autoLogin").checked = false;
});

$("#autoLogin").addEventListener("change", () => {
  if ($("#autoLogin").checked) $("#rememberPassword").checked = true;
});

$("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  performLogin();
});

$("#changePasswordForm").addEventListener("submit", event => {
  event.preventDefault();
  submitChangePassword();
});

$("#loginForm").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  performLogin();
});

$("#entryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = event.submitter || $("#entryForm .form-actions .btn:not(.secondary)");
  try {
    if (submitButton) submitButton.disabled = true;
    const id = $("#entryId").value;
    const existing = state.records.find(record => record.id === id);
    const payload = entryPayload(existing);
    const queuedFiles = collectQueuedFiles(state.recordFiles, $("#recordFiles"));
    let saved;
    if (id) saved = await recordService.update(id, payload);
    else saved = await recordService.create(payload);
    await uploadFiles("record", saved.id, queuedFiles);
    $("#entryDialog").close();
    resetRecordForm();
    await renderAll();
  } catch (error) {
    if (isAuthExpired(error)) await handleAuthExpired("发布/保存失败：登录状态已失效。");
    else alert(`发布/保存失败：${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("#fixedForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("#fixedId").value;
  const existing = state.fixedProjects.find(project => project.id === id);
  const queuedFiles = collectQueuedFiles(state.fixedFiles, $("#fixedFiles"));
  const payload = { ata: $("#fixedAta").value, title: $("#fixedTitle").value.trim(), contentHtml: sanitizeRichHtml($("#fixedContent").innerHTML), references: $("#fixedReferences").value.trim(), attachments: existing?.attachments || [] };
  const saved = id ? await fixedProjectService.update(id, payload) : await fixedProjectService.create(payload);
  await uploadFiles("fixedProject", saved.id, queuedFiles);
  $("#fixedDialog").close();
  resetFixedForm();
  await renderAll();
});

$("#monthSelect").addEventListener("change", () => {
  clearAllDeferredReclassify();
  state.activeMonth = $("#monthSelect").value;
  state.page = 1;
  renderRecords();
});
$("#categoryChips").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  clearAllDeferredReclassify();
  const category = button.dataset.category;
  if (category === "全部") state.selectedCategories.clear();
  else if (state.selectedCategories.has(category)) state.selectedCategories.delete(category);
  else state.selectedCategories.add(category);
  state.page = 1;
  renderRecords();
});
$("#statusChips").addEventListener("click", event => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  clearAllDeferredReclassify();
  state.statusFilter = button.dataset.status;
  if (state.statusFilter === "全部") state.activeMonth = "全部";
  state.page = 1;
  renderRecords();
});
$("#pageSizeSelect").addEventListener("change", () => { clearAllDeferredReclassify(); state.pageSize = Number($("#pageSizeSelect").value) || 15; state.page = 1; renderRecords(); });
$("#pageButtons").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  clearAllDeferredReclassify();
  if (button.dataset.page) state.page = Number(button.dataset.page);
  if (button.dataset.pageAction === "prev") state.page = Math.max(1, state.page - 1);
  if (button.dataset.pageAction === "next") state.page += 1;
  renderRecords();
});
$("#searchInput").addEventListener("input", () => { clearAllDeferredReclassify(); state.page = 1; renderRecords(); });
$("#fixedSearch").addEventListener("input", renderFixedProjects);
$("#fixedAtaFilter").addEventListener("change", renderFixedProjects);
$("#recipientSearch").addEventListener("input", () => renderRecipientPicker());
$("#recipientTeamFilter").addEventListener("change", () => renderRecipientPicker());
$("#recipientOptions").addEventListener("change", event => {
  const input = event.target.closest("input[data-recipient]");
  if (!input) return;
  if (input.checked) state.selectedRecipientIds.add(input.dataset.recipient);
  else state.selectedRecipientIds.delete(input.dataset.recipient);
});
$("#recipientSelectAll").addEventListener("click", () => {
  visibleRecipientIds().forEach(id => state.selectedRecipientIds.add(id));
  syncRecipientCheckboxes();
});
$("#recipientClearAll").addEventListener("click", () => {
  visibleRecipientIds().forEach(id => state.selectedRecipientIds.delete(id));
  syncRecipientCheckboxes();
});
$("#entryDate").closest("label").addEventListener("click", event => {
  const input = $("#entryDate");
  if (event.target === input) return;
  input.focus({ preventScroll: true });
  if (typeof input.showPicker === "function") {
    try { input.showPicker(); } catch {}
  }
});
$("#entryDate").addEventListener("change", () => {
  const input = $("#entryDate");
  input.blur();
  const body = $("#entryDialog .dialog-body");
  if (body) {
    body.setAttribute("tabindex", "-1");
    body.focus({ preventScroll: true });
  }
});

$("#cards").addEventListener("click", async event => {
  try {
    const article = event.target.closest("[data-record-id]");
    const record = article ? state.records.find(item => item.id === article.dataset.recordId) : null;
    if (!record) return;
    const panelButton = event.target.closest("[data-toggle-panel]");
    if (panelButton) {
      const box = article.querySelector(".original-panel");
      const willCollapse = !box.hidden;
      box.hidden = willCollapse;
      panelButton.textContent = box.hidden ? "展开原文" : "收起原文";
      if (willCollapse && state.deferFilterRecordIds.has(record.id)) {
        clearDeferredReclassify(record.id);
        if (state.statusFilter === "未读") {
          renderRecords();
          return;
        }
        refreshRecordCard(article, record);
      }
      const slot = article.querySelector(".attachment-slot");
      if (!box.hidden && slot) slot.innerHTML = renderAttachments(record, "record");
      if (!box.hidden && canTrackPersonalRead(record)) {
        await markRecordReadFromCard(article, record);
      }
    }
    if (event.target.closest("[data-favorite]")) { await favoriteService.toggle(record.id); renderRecords(); return; }
    if (event.target.closest("[data-edit-record]") && canEditRecord(record)) { openRecordForm(record); return; }
    if (event.target.closest("[data-void-record]") && canVoidRecord(record) && confirm("确定将这条信息标记为作废吗？作废后发布者和接收者将不可见，且不参与阅读统计。")) { await recordService.void(record.id); await renderAll(); return; }
    if (event.target.closest("[data-restore-record]") && canRestoreRecord(record) && confirm("确定恢复这条信息为已发布吗？恢复后将按新发布信息重新流转，原已读记录不再有效。")) { await recordService.restore(record.id); await renderAll(); return; }
    if (event.target.closest("[data-delete-record]") && canDeleteRecord(record) && confirm("确定删除这条信息吗？")) { await recordService.remove(record.id); await renderAll(); return; }
    if (event.target.closest("[data-feedback-record]") && canManageFeedbackRecord(record)) { openFeedback(record); return; }
    if (event.target.closest("[data-remind-record]")) {
      if (!canManageFeedbackRecord(record)) return;
      const unread = feedbackRows(record).filter(row => !row.receipt?.readAt).map(row => row.person.id);
      await receiptService.remind(record, unread);
      alert(`已记录催办 ${unread.length} 人。`);
      await renderAll();
      return;
    }
    if (event.target.closest("[data-export-record]") && canManageFeedbackRecord(record)) exportFeedback(record);
  } catch (error) {
    if (isAuthExpired(error)) await handleAuthExpired("操作失败：登录状态已失效。");
    else alert(`操作失败：${error.message}`);
  }
});

$("#fixedList").addEventListener("click", async event => {
  const article = event.target.closest("[data-fixed-id]");
  const project = article ? state.fixedProjects.find(item => item.id === article.dataset.fixedId) : null;
  if (!project) return;
  const panel = event.target.closest("[data-toggle-panel]");
  if (panel) {
    const box = article.querySelector(".fixed-panel");
    box.hidden = !box.hidden;
    panel.textContent = box.hidden ? "展开" : "收起";
  }
  if (event.target.closest("[data-edit-fixed]")) openFixedForm(project);
  if (event.target.closest("[data-delete-fixed]") && confirm("确定删除这个固化项目吗？")) { await fixedProjectService.remove(project.id); await renderAll(); }
  if (event.target.closest("[data-print-fixed]")) printFixed(project);
});

document.addEventListener("click", async event => {
  const feedbackRecordId = $("#feedbackDialog")?.dataset.recordId;
  const feedbackRecord = feedbackRecordId ? state.records.find(item => item.id === feedbackRecordId) : null;
  if (event.target.closest("[data-feedback-select-all]") && feedbackRecord) {
    $("#feedbackBody").querySelectorAll("input[data-feedback-user]").forEach(input => { input.checked = true; });
    return;
  }
  if (event.target.closest("[data-feedback-clear]") && feedbackRecord) {
    $("#feedbackBody").querySelectorAll("input[data-feedback-user]").forEach(input => { input.checked = false; });
    return;
  }
  if (event.target.closest("[data-feedback-bulk]") && feedbackRecord) {
    try {
      const userIds = Array.from($("#feedbackBody").querySelectorAll("input[data-feedback-user]:checked")).map(input => input.dataset.feedbackUser);
      const status = $("#feedbackBulkStatus")?.value || "已读";
      if (!userIds.length) {
        alert("请先选择需要修改的接收者。");
        return;
      }
      await receiptService.updateStatusBatch(feedbackRecord.id, userIds, status);
      renderRecords();
      renderStats();
      openFeedback(feedbackRecord);
    } catch (error) {
      alert(`修改失败：${error.message}`);
    }
    return;
  }

  const attachment = event.target.closest("[data-attachment]");
  if (attachment) {
    event.preventDefault();
    const file = findAttachment(attachment.dataset.attachment, attachment.dataset.ownerType, attachment.dataset.ownerId);
    const src = await attachmentSource(file) || attachment.getAttribute("href");
    if (!file) {
      alert("未找到附件内容。请重新上传该附件。");
      return;
    }
    $("#viewerTitle").textContent = attachment.dataset.name || "附件";
    resetViewerZoom();
    setViewerDownload(src, file.name || attachment.dataset.name || "附件");
    $("#viewerContent").innerHTML = '<div class="status-line">正在生成预览...</div>';
    $("#viewerDialog").showModal();
    setViewerPreview(await renderAttachmentPreview(file, src), isPdfAttachment(file, file?.name || attachment.dataset.name || "") ? { mode: "pdf-html", pdfSrc: src } : {});
  }
  const sheetTab = event.target.closest("[data-sheet-tab]");
  if (sheetTab) {
    const viewer = $("#viewerContent");
    const index = sheetTab.dataset.sheetTab;
    viewer.querySelectorAll(".sheet-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.sheetTab === index));
    viewer.querySelectorAll(".sheet-panel").forEach(panel => { panel.hidden = panel.dataset.sheetPanel !== index; });
  }
  const remove = event.target.closest("[data-remove-attachment]");
  if (remove && confirm("确定移除这个附件吗？")) {
    const attachmentId = remove.dataset.removeAttachment;
    const ownerType = remove.dataset.ownerType;
    const ownerId = remove.dataset.ownerId;
    await apiRequest(`/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
    const owner = removeAttachmentFromState(attachmentId, ownerType, ownerId);
    if (ownerType === "record") {
      if ($("#entryId")?.value === ownerId) renderExistingRecordAttachments(owner);
      renderRecords();
    } else if (ownerType === "fixedProject") {
      renderFixedProjects();
    } else {
      await renderAll();
    }
  }
  if (event.target.id === "saveSettingsBtn") await saveSettingsFromForm();
  if (event.target.id === "settingsBatchImportBtn") importBatchRecords();
  if (event.target.id === "openUserCreateBtn") openUserDialog();
  if (event.target.id === "userImportBtn") await importUserFile();
  if (event.target.id === "openUserBatchBtn") openUserBatchDialog();
  const editUser = event.target.closest("[data-edit-user]");
  if (editUser) {
    const user = state.users.find(item => item.id === editUser.dataset.editUser);
    if (user) openUserDialog(user);
  }
  const resetUser = event.target.closest("[data-reset-user]");
  if (resetUser) {
    const user = state.users.find(item => item.id === resetUser.dataset.resetUser);
    if (!user) return;
    const password = prompt(`请输入 ${user.name || user.username} 的新密码`, "123456");
    if (!password) return;
    await userService.resetPassword(user.id, password);
    alert("密码已重置。");
  }
  const deleteUser = event.target.closest("[data-delete-user]");
  if (deleteUser) {
    const user = state.users.find(item => item.id === deleteUser.dataset.deleteUser);
    if (!user) return;
    if (!confirm(`确定删除账号 ${user.username} 吗？该人员会同步从接收对象、统计、收藏和阅读记录中移除。`)) return;
    await userService.remove(user.id);
    await renderAll();
  }
  const toggleUser = event.target.closest("[data-toggle-user]");
  if (toggleUser) {
    const user = state.users.find(item => item.id === toggleUser.dataset.toggleUser);
    if (!user) return;
    const nextStatus = user.status === "disabled" ? "active" : "disabled";
    if (!confirm(`确定${nextStatus === "disabled" ? "停用" : "启用"}账号 ${user.username} 吗？`)) return;
    await userService.update(user.id, { ...user, status: nextStatus });
    if (state.user?.id === user.id) state.user = await authService.current();
    await renderAll();
  }
  if (event.target.id === "exportStatsExcelBtn") exportStatsExcel();
  if (event.target.id === "exportStatsCsvBtn") exportStatsCsv();
  if (event.target.id === "clearStatsDatesBtn") {
    state.statsStartDate = "";
    state.statsEndDate = "";
    renderStats();
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "statsSearch") {
    state.statsSearch = event.target.value;
    renderStats();
  }
});

document.addEventListener("submit", event => {
  if (event.target.id === "userBatchForm") {
    event.preventDefault();
    (async () => {
      try {
        const userIds = [...state.selectedUserIds];
        const updates = batchUserUpdatesFromForm();
        if (!userIds.length) throw new Error("请先选择账号");
        if (!Object.keys(updates).length) throw new Error("请至少勾选一个要应用的修改项");
        if (!confirm(`确定批量修改 ${userIds.length} 个账号吗？`)) return;
        const result = await userService.batchUpdate(userIds, updates);
        $("#userBatchDialog").close();
        state.selectedUserIds.clear();
        await renderAll();
        alert(`批量修改完成：已处理 ${result.updated || 0} 个账号${result.skippedProtected ? `，保护项跳过 ${result.skippedProtected} 项` : ""}${result.skipped ? `，不存在 ${result.skipped} 个` : ""}。`);
      } catch (error) {
        alert(error.message);
      }
    })();
    return;
  }
  if (event.target.id !== "userForm") return;
  event.preventDefault();
  (async () => {
    try {
      const id = $("#userId").value;
      const payload = userPayloadFromForm();
      if (id) await userService.update(id, payload);
      else await userService.create(payload);
      $("#userDialog").close();
      if (state.user?.id === id) state.user = await authService.current();
      await renderAll();
    } catch (error) {
      alert(error.message);
    }
  })();
});

document.addEventListener("change", event => {
  if (event.target.id === "userSelectAll") {
    $$("[data-user-select]").forEach(input => {
      input.checked = event.target.checked;
      if (input.checked) state.selectedUserIds.add(input.dataset.userSelect);
      else state.selectedUserIds.delete(input.dataset.userSelect);
    });
    syncUserSelectionUi();
    return;
  }
  const userSelect = event.target.closest("[data-user-select]");
  if (userSelect) {
    if (userSelect.checked) state.selectedUserIds.add(userSelect.dataset.userSelect);
    else state.selectedUserIds.delete(userSelect.dataset.userSelect);
    syncUserSelectionUi();
    return;
  }
  if (event.target.id === "batchRole") {
    applyBatchRoleDefaults();
    return;
  }
  const feedbackStatus = event.target.closest("select[data-feedback-status]");
  if (feedbackStatus) {
    (async () => {
      try {
        const recordId = $("#feedbackDialog")?.dataset.recordId;
        const record = recordId ? state.records.find(item => item.id === recordId) : null;
        if (!record) return;
        await receiptService.updateStatus(record.id, feedbackStatus.dataset.feedbackStatus, feedbackStatus.value);
        renderRecords();
        renderStats();
        openFeedback(record);
      } catch (error) {
        alert(`修改失败：${error.message}`);
      }
    })();
    return;
  }
  if (event.target.id === "userRole") {
    applyRoleDefaults();
  }
  if (event.target.id === "statsTeamSelect") {
    state.statsTeam = event.target.value;
    renderStats();
  }
  if (event.target.id === "statsStartDate") {
    state.statsStartDate = event.target.value;
    renderStats();
  }
  if (event.target.id === "statsEndDate") {
    state.statsEndDate = event.target.value;
    renderStats();
  }
});

$$(".editor-tools [data-cmd]").forEach(button => button.addEventListener("click", () => {
  $("#fixedContent").focus();
  document.execCommand(button.dataset.cmd, false, null);
}));
$("#fontColorSelect").addEventListener("change", event => {
  if (!event.target.value) return;
  $("#fixedContent").focus();
  document.execCommand("foreColor", false, event.target.value);
  event.target.value = "";
});
$("#highlightColorSelect").addEventListener("change", event => {
  if (!event.target.value) return;
  $("#fixedContent").focus();
  const command = document.queryCommandSupported?.("hiliteColor") ? "hiliteColor" : "backColor";
  document.execCommand(command, false, event.target.value);
  event.target.value = "";
});

setupDrop($("#recordDrop"), $("#recordFiles"), state.recordFiles, $("#recordPending"));
setupDrop($("#fixedDrop"), $("#fixedFiles"), state.fixedFiles, $("#fixedPending"));
renderFixedAtaOptions();
window.addEventListener("popstate", () => {
  guardRoute().catch(error => {
    document.body.innerHTML = `<main class="wrap" style="padding:24px"><div class="data-panel"><h1>页面切换失败</h1><p class="status-line">${escapeHtml(error.message)}</p></div></main>`;
  });
});

async function init() {
  setAppMode("booting");
  if (location.protocol === "file:") {
    try {
      const response = await fetch(`${LOCAL_APP_URL}api/health`, { cache: "no-store" });
      if (response.ok) {
        location.replace(LOCAL_APP_URL);
        return;
      }
    } catch {}
    document.body.innerHTML = `<main class="wrap" style="padding:24px"><div class="data-panel"><h1>请使用本地服务地址访问</h1><p>当前是通过文件方式打开，只适合查看源码页面；登录、收藏、发布、阅读回执和附件预览请使用 <a class="link-btn" href="${LOCAL_APP_URL}">${LOCAL_APP_URL}</a>。</p><p class="status-line">如果打不开，请先启动 MUC 本地服务。</p></div></main>`;
    return;
  }
  try {
    if (!Object.values(ROUTES).includes(location.pathname)) setRoute(ROUTES.login, true);
    try {
      state.user = await authService.current();
    } catch (error) {
      if (!isAuthExpired(error)) throw error;
      const saved = savedLogin();
      const skipAutoLogin = sessionStorage.getItem(AUTO_LOGIN_SKIP_KEY) === "1";
      if (saved.autoLogin && saved.rememberPassword && saved.username && saved.password && !skipAutoLogin) {
        try {
          state.user = await authService.login(saved.username, saved.password);
        } catch (loginError) {
          clearAutoLoginPreference();
          await navigate(ROUTES.login, { replace: true, message: `自动登录失败：${loginError.message}` });
          return;
        }
      } else {
        await navigate(ROUTES.login, { replace: true });
        return;
      }
    }
    if (isLoggedIn()) await navigate(ROUTES.dashboard, { replace: true });
    else await navigate(ROUTES.login, { replace: true });
  } catch (error) {
    document.body.innerHTML = `<main class="wrap" style="padding:24px"><div class="data-panel"><h1>无法连接后端服务</h1><p>正式版前端只调用后端 API。请先启动后端服务，或配置 <code>window.MUC_API_BASE_URL</code> 指向可用接口。</p><p class="status-line">${escapeHtml(error.message)}</p></div></main>`;
  }
}

init();
