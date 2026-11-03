/* Earthenware OS — desktop shell for the Earthenware Computer (vanilla JS). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) k.startsWith("on") ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v);
    for (const k of kids.flat()) e.append(k instanceof Node ? k : document.createTextNode(k));
    return e;
  };
  const M = new EW.Machine();
  const logLines = [];
  let tree = null, products = [], runTimer = null;
  const phone = () => matchMedia("(max-width:700px)").matches;

  const DESC = {
    "C": "Control unit (root of the computer). Fetch → decode → execute, one 2-byte instruction per step.",
    "C.alu": "ALU step: ADD / SUB with mod-256 wraparound; sets the zero flag.",
    "C.mem": "Memory controller step: 256 bytes, LOAD / STORE.",
    "C.alu.a": "Register A — the accumulator.",
    "C.alu.z": "Z — zero flag register (set when A == 0). Used by JZ.",
    "C.mem.pc": "PC — program counter register.",
    "C.mem.io": "IO port: the OUT buffer plus one link per VM for SEND / RECV.",
    "P": "Products hub — linked to C. Absorbed open-source products hang off it as a ternary tree.",
  };
  const PROGDESC = { 1: "200 + 100 = 44 (wraps)", 2: "10 − 20 = 246 (wraps)", 3: "loop sum 5+4+3+2+1 = 15", 4: "255 + 1 = 0 → JZ taken → sends 42" };
  function describe(n) {
    if (DESC[n.id]) return DESC[n.id];
    if (n.kind === "vm" && n.level === "product") {
      const p = products.find((p) => p.key === n.product);
      return `${p ? p.name : n.product} — absorbed product in VM slot ${n.slot}, linked to C. Runs natively (not in the browser).`;
    }
    const vm = n.owner.replace("VM", "");
    if (n.level === "beginning") return `Isolated virtual machine ${n.id}: private CPU8, own 256-byte memory, one link to the host. Demo: ${PROGDESC[vm] || ""}.`;
    return `${n.level} of ${n.owner}'s own tree (isolated; reaches the host only via ${n.owner}'s link).`;
  }

  // ---------- data ----------
  async function getJSON(paths) {
    for (const p of paths) { try { const r = await fetch(p); if (r.ok) return await r.json(); } catch (e) {} }
    return null;
  }
  async function loadData() {
    tree = await getJSON(["data/tree.json", "../tree.json"]);
    if (!tree) return;
    for (const n of tree.products || []) {
      if (!n.product) continue;
      const pj = await getJSON([`data/products/${n.product}/product.json`, `../products/${n.product}/product.json`]);
      products.push({ key: n.product, node: n.id, ...(pj || { name: n.product }) });
    }
  }

  // ---------- window manager ----------
  let z = 10, offset = 0;
  const wins = {};
  function openWin(id, title, w, hgt, render, pos) {
    if (wins[id]) { focus(id); wins[id].el.style.display = "flex"; refreshTasks(); return wins[id]; }
    const body = h("div", { class: "body" });
    const el = h("section", { class: "win" },
      h("header", {}, h("b", {}, title), h("button", { title: "Close", onclick: () => closeWin(id) }, "×")), body);
    const W = innerWidth, H = innerHeight - 44;
    const ww = Math.min(w, W - 130), hh = Math.min(hgt, H - 20);
    Object.assign(el.style, { width: ww + "px", height: hh + "px",
      left: Math.max(110, Math.min(W - ww - 10, 120 + offset)) + "px", top: Math.min(H - hh - 10, 14 + offset) + "px" });
    if (pos && !phone()) Object.assign(el.style, { left: pos[0] + "px", top: pos[1] + "px" }); else offset = (offset + 28) % 200;
    el.addEventListener("pointerdown", () => focus(id));
    drag(el, $("header", el));
    $("#windows").append(el);
    wins[id] = { el, body, title, render };
    render(body); focus(id); refreshTasks();
    return wins[id];
  }
  function closeWin(id) { wins[id].el.remove(); delete wins[id]; refreshTasks(); }
  function focus(id) {
    Object.values(wins).forEach((w) => w.el.classList.remove("active"));
    wins[id].el.style.zIndex = ++z; wins[id].el.classList.add("active"); refreshTasks();
  }
  function drag(el, handle) {
    let sx, sy, ox, oy;
    handle.addEventListener("pointerdown", (e) => {
      if (phone() || e.target.tagName === "BUTTON") return;
      sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (sx === undefined) return;
      el.style.left = Math.max(0, ox + e.clientX - sx) + "px"; el.style.top = Math.max(0, oy + e.clientY - sy) + "px";
    });
    handle.addEventListener("pointerup", () => { sx = undefined; });
  }
  function refreshTasks() {
    const t = $("#tasks"); t.innerHTML = "";
    for (const [id, w] of Object.entries(wins))
      t.append(h("button", { class: w.el.classList.contains("active") ? "on" : "", onclick: () => focus(id) }, w.title));
  }
  function refreshAll() { for (const w of Object.values(wins)) w.render(w.body); }

  // ---------- machine control ----------
  function log(line) { logLines.push(line); }
  function stepRound() { M.stepRound(log); refreshAll(); }
  function runAll() {
    stopRun();
    runTimer = setInterval(() => { if (!M.stepRound(log)) stopRun(); refreshAll(); }, 120);
  }
  function stopRun() { clearInterval(runTimer); runTimer = null; }
  function resetAll() { stopRun(); M.reset(); logLines.length = 0; logLines.push("— reset —"); refreshAll(); }
  function stepVM(vm) { const t = vm.step(); if (t) log(`[vm ] ${t}`); refreshAll(); }

  // ---------- apps ----------
  function TreeApp(body) {
    if (!tree) { body.replaceChildren(h("p", { class: "err" }, "tree.json could not be loaded.")); return; }
    if (body.dataset.built) return; body.dataset.built = 1;
    const info = h("div", { id: "info" }, h("span", { class: "note" }, "Tap a node to see what it is."));
    const all = [...tree.nodes, ...(tree.products || [])];
    const kids = (pid) => all.filter((n) => n.parent === pid);
    const item = (n) => {
      const cls = n.kind === "computer" ? "computer" : n.kind === "hub" ? "hub" : n.level === "product" ? "product" : "vm";
      let label = n.id;
      if (n.product) { const p = products.find((p) => p.key === n.product); label += " · " + (p ? p.name : n.product); }
      const b = h("button", { class: "node " + cls, onclick: () => {
        body.querySelectorAll(".node.sel").forEach((x) => x.classList.remove("sel")); b.classList.add("sel");
        info.replaceChildren(h("b", {}, label), h("span", { class: "lvl" }, n.level), h("div", {}, describe(n)),
          n.level === "beginning" && n.kind === "vm" ? h("button", { class: "btn", style: "margin-top:8px", onclick: () => openVM(+n.id.slice(2)) }, `Open ${n.id}`) : "");
      } }, label);
      const c = kids(n.id);
      return h("li", {}, b, h("span", { class: "lvl" }, n.level), c.length ? h("ul", {}, c.map(item)) : "");
    };
    const roots = tree.nodes.filter((n) => !n.parent);
    const C = roots.find((n) => n.id === "C");
    const hub = (tree.products || []).find((n) => !n.parent);
    const cnt = (l) => tree.nodes.filter((n) => n.level === l).length;
    body.replaceChildren(
      h("div", { class: "note" }, `${tree.nodes.length} nodes · ${cnt("beginning")} beginnings / ${cnt("step")} steps / ${cnt("block")} blocks · gold = computer, blue = VMs, green = products`),
      h("div", { class: "tree" }, h("ul", {}, item(C), roots.filter((n) => n !== C).map(item),
        hub ? [h("li", {}, h("span", { class: "note" }, "products (linked to C):")), item(hub)] : "")),
      info);
  }

  function VMApp(id) {
    const vm = M.vms[id - 1];
    return (body) => {
      const c = vm.cpu, pl = vm.program.length;
      const reg = (k, v) => h("div", { class: "reg" }, h("small", {}, k), h("span", {}, String(v)));
      const mem = h("div", { class: "mem" });
      for (let i = 0; i < 256; i++) mem.append(h("i", { class: (i === c.pc || i === c.pc + 1) ? "pc" : c.mem[i] ? "nz" : "", title: `0x${i.toString(16)}` }, c.mem[i].toString(16).padStart(2, "0")));
      const prog = h("div", { class: "prog" });
      for (const d of EW.disassemble(c.mem, 0, Math.max(pl, 2)))
        prog.append(h("div", { class: d.addr === c.pc ? "cur" : "" }, `${String(d.addr).padStart(3, " ")}  ${d.op.padEnd(5)} ${d.arg}`));
      body.replaceChildren(
        h("div", { class: "row" },
          h("button", { class: "btn pri", onclick: () => stepVM(vm) }, "Step"),
          h("button", { class: "btn", onclick: runAll }, "Run all"),
          h("button", { class: "btn", onclick: () => { stopRun(); vm.reset(); log(`— VM${id} reset —`); refreshAll(); } }, "Reset"),
          h("span", { class: "note" }, c.halted ? "HALTED" : "ready")),
        h("div", { class: "regs" }, reg("A", c.a), reg("Z", +c.z), reg("PC", c.pc), reg("HALT", c.halted ? 1 : 0)),
        h("h4", {}, "Program"), prog,
        h("h4", {}, "Link queue (VM ↔ host)"),
        h("div", { class: "q" }, "to host: ", h("b", {}, JSON.stringify(vm.link.toHost)), "   to VM: ", h("b", {}, JSON.stringify(vm.link.toVm))),
        h("h4", {}, "Memory (256 bytes)"), mem,
        h("div", { class: "note" }, PROGDESC[id] ? "Demo: " + PROGDESC[id] : ""));
    };
  }
  const openVM = (id) => openWin("vm" + id, `VM${id}`, 430, 560, VMApp(id));

  function ConsoleApp(body) {
    const pre = h("pre", { id: "console" });
    for (const l of logLines.slice(-400)) pre.append(h("div", { class: l.includes("HOST") ? "host" : "" }, l));
    body.replaceChildren(
      h("div", { class: "row" },
        h("button", { class: "btn pri", onclick: stepRound }, "Step round"),
        h("button", { class: "btn", onclick: runAll }, "Run"),
        h("button", { class: "btn", onclick: resetAll }, "Reset"),
        h("span", { class: "out" }, `HOST OUTPUT: [${M.host.output.join(", ")}]`)),
      pre);
    pre.scrollTop = pre.scrollHeight;
  }

  const SAMPLE = `; Type a program, then Load into a VM.
; ops: HALT LOAD a  LDI n  STORE a  ADD a  SUB a
;      JMP a  JZ a  OUT  SEND  RECV   (labels ok)
; @addr value  pokes a data byte.
start:  LDI 7
        ADD 0x80
        SEND
        HALT
@0x80 35`;
  let asmText = SAMPLE, asmMsg = "";
  function AsmApp(body) {
    if (body.dataset.built) { $(".msg", body).textContent = asmMsg; return; }
    body.dataset.built = 1;
    const ta = h("textarea", { spellcheck: "false", autocapitalize: "off", autocomplete: "off" }); ta.value = asmText;
    ta.addEventListener("input", () => { asmText = ta.value; });
    const sel = h("select", {}, [1, 2, 3, 4].map((i) => h("option", { value: i }, `VM${i}`)));
    const msg = h("div", { class: "msg note" });
    const load = () => {
      try {
        const { program, data } = EW.assembleText(ta.value);
        const vm = M.vms[sel.value - 1]; vm.program = program; vm.data = data; vm.reset();
        asmMsg = `Loaded ${program.length} bytes into VM${sel.value}. Step it, or Run all — host waits on RECV ${sel.value}.`;
        msg.className = "msg note"; openVM(+sel.value);
      } catch (e) { asmMsg = e.message; msg.className = "msg err"; }
      msg.textContent = asmMsg;
    };
    const restore = () => { const i = +sel.value, vm = M.vms[i - 1]; vm.program = EW.PROGRAMS[i]; vm.data = EW.DATA[i]; vm.reset(); asmMsg = `VM${i} demo program restored.`; refreshAll(); };
    body.replaceChildren(ta, h("div", { class: "row", style: "margin-top:8px" }, sel,
      h("button", { class: "btn pri", onclick: load }, "Assemble & load"),
      h("button", { class: "btn", onclick: restore }, "Restore demo")), msg);
  }

  function ProductsApp(body) {
    body.replaceChildren(
      h("p", { class: "note" }, "Absorbed open-source products, each in its own VM slot linked to C. They run natively via absorb.py / ProcessVM — not in the browser."),
      ...(products.length ? products.map((p) => h("div", { class: "card" },
        h("b", {}, p.name), h("span", { class: "tag" }, p.license || "?"),
        h("div", { class: "note" }, `${p.node} · slot ${p.vm_slot ?? "?"} · ${p.source || ""}`),
        p.upstream ? h("div", {}, h("a", { href: p.upstream, target: "_blank", rel: "noopener" }, p.upstream)) : "",
        p.commit ? h("div", { class: "note mono" }, "commit " + p.commit.slice(0, 12)) : "",
        p.entry ? h("div", { class: "mono" }, "$ " + p.entry) : "")) : [h("p", {}, "No products found.")]));
  }

  function AboutApp(body) {
    body.replaceChildren(h("p", {}, "Earthenware OS is a browser front-end for the Earthenware Computer: a tiny 8-bit CPU host with 4 isolated VMs, each linked to the host by its own queue."),
      h("p", { class: "note" }, "The JS CPU is a port of cpu8.py and is tested to produce the same trace and HOST OUTPUT [44, 246, 15, 42, 91] as python3 main.py."));
  }

  // ---------- desktop ----------
  const APPS = [
    ["🌳", "Tree", () => openWin("tree", "Tree · 29 nodes", 460, 600, TreeApp)],
    ["🖥️", "Host console", () => openWin("console", "Host console", 560, 420, ConsoleApp)],
    ...[1, 2, 3, 4].map((i) => ["📦", `VM${i}`, () => openVM(i)]),
    ["⌨️", "Assembler", () => openWin("asm", "Assembler", 440, 420, AsmApp)],
    ["🧩", "Products", () => openWin("products", "Products", 440, 440, ProductsApp)],
    ["ℹ️", "About", () => openWin("about", "About", 360, 220, AboutApp)],
  ];
  for (const [g, l, f] of APPS) $("#icons").append(h("button", { class: "icon", onclick: f }, h("span", { class: "g" }, g), h("span", { class: "l" }, l)));
  setInterval(() => { $("#clock").textContent = new Date().toTimeString().slice(0, 5); }, 1000);
  $("#clock").textContent = new Date().toTimeString().slice(0, 5);

  loadData().then(() => {
    const q = new URLSearchParams(location.search).get("open");
    if (q) q.split(",").forEach((k) => { const a = APPS.find((x) => x[1].toLowerCase().replace(" ", "") === k); a && a[2](); });
    else if (!phone()) {
      openWin("tree", "Tree · 29 nodes", 400, innerHeight - 70, TreeApp, [110, 12]);
      openWin("console", "Host console", innerWidth - 540, 300, ConsoleApp, [520, 12]);
      openWin("vm3", "VM3", 430, innerHeight - 70 - 312, VMApp(3), [520, 324]);
      openWin("products", "Products", innerWidth - 970, innerHeight - 70 - 312, ProductsApp, [960, 324]);
    }
    if (new URLSearchParams(location.search).has("run")) { M.run(log); refreshAll(); }
  });
})();
