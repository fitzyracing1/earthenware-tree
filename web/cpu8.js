/* Earthenware 8-bit CPU + VM model — JS port of cpu8.py / vm.py / main.py.
   Same instruction set (2 bytes: opcode, operand) and same demo programs. */
(function (root) {
  const OPS = { HALT: 0, LOAD: 1, LDI: 2, STORE: 3, ADD: 4, SUB: 5, JMP: 6, JZ: 7, OUT: 8, SEND: 9, RECV: 10 };
  const NAMES = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));

  function assemble(lines) {
    const out = [];
    for (const ins of lines) {
      if (typeof ins === "number") out.push(ins & 255);
      else out.push(OPS[ins[0]], (ins.length > 1 ? ins[1] : 0) & 255);
    }
    return out;
  }

  /* Text assembler: "LDI 200", "label:", "JZ label", "; comment",
     "@0x80 100" (poke data byte at address). Returns {program, data}. */
  function assembleText(src) {
    const labels = {}, items = [], data = {};
    let pc = 0;
    src.split(/\r?\n/).forEach((raw, i) => {
      let line = raw.replace(/[;#].*$/, "").trim();
      if (!line) return;
      const m = line.match(/^([A-Za-z_]\w*):\s*(.*)$/);
      if (m) { labels[m[1].toLowerCase()] = pc; line = m[2].trim(); if (!line) return; }
      if (line[0] === "@") {
        const [a, v] = line.slice(1).split(/[\s,=]+/);
        data[num(a, i)] = num(v, i) & 255; return;
      }
      const [op, arg] = line.split(/\s+/);
      const OP = op.toUpperCase();
      if (!(OP in OPS)) throw new Error(`line ${i + 1}: unknown op ${op}`);
      items.push({ OP, arg, line: i }); pc += 2;
    });
    const program = [];
    for (const it of items) {
      let v = 0;
      if (it.arg !== undefined) v = it.arg.toLowerCase() in labels ? labels[it.arg.toLowerCase()] : num(it.arg, it.line);
      program.push(OPS[it.OP], v & 255);
    }
    if (program.length > 256) throw new Error("program larger than 256 bytes");
    return { program, data };
  }
  function num(s, i) {
    const n = /^0x/i.test(s || "") ? parseInt(s, 16) : parseInt(s, 10);
    if (Number.isNaN(n)) throw new Error(`line ${i + 1}: bad number ${s}`);
    return n;
  }

  class Link { constructor(id) { this.vmId = id; this.toHost = []; this.toVm = []; } }

  class CPU8 {
    constructor(name = "cpu", links = {}, isHost = true) {
      this.name = name; this.isHost = isHost; this.links = links; this.reset();
    }
    reset() { this.mem = new Uint8Array(256); this.a = 0; this.pc = 0; this.z = false; this.halted = false; this.output = []; }
    load(program, base = 0) { program.forEach((b, i) => { this.mem[(base + i) & 255] = b & 255; }); }
    _set(v) { this.a = v & 255; this.z = this.a === 0; }
    step() {
      if (this.halted) return null;
      const op = this.mem[this.pc], arg = this.mem[(this.pc + 1) & 255];
      const name = NAMES[op] || "HALT";
      let nxt = (this.pc + 2) & 255, note = "";
      const pad = (n) => String(n).padStart(3, " ");
      switch (name) {
        case "HALT": this.halted = true; break;
        case "LOAD": this._set(this.mem[arg]); break;
        case "LDI": this._set(arg); break;
        case "STORE": this.mem[arg] = this.a; break;
        case "ADD": this._set(this.a + this.mem[arg]); break;
        case "SUB": this._set(this.a - this.mem[arg]); break;
        case "JMP": nxt = arg; break;
        case "JZ": if (this.z) nxt = arg; break;
        case "OUT": this.output.push(this.a); note = ` -> out ${this.a}`; break;
        case "SEND": {
          const l = this.links[this.isHost ? arg : 0];
          (this.isHost ? l.toVm : l.toHost).push(this.a); note = ` -> link ${l.vmId}: ${this.a}`; break;
        }
        case "RECV": {
          const l = this.links[this.isHost ? arg : 0];
          const q = this.isHost ? l.toHost : l.toVm;
          if (!q.length) return `${this.name} pc=${pad(this.pc)} RECV ${arg} (waiting)`;
          this._set(q.shift()); note = ` <- link ${l.vmId}: ${this.a}`; break;
        }
      }
      const line = `${this.name} pc=${pad(this.pc)} ${name} ${pad(arg)} A=${pad(this.a)} Z=${+this.z}${note}`;
      this.pc = nxt;
      return line;
    }
    run(max = 10000) { for (let i = 0; i < max && !this.halted; i++) this.step(); return this.output; }
  }

  class VM {
    constructor(id, program, data = {}) {
      this.vmId = id; this.link = new Link(id);
      this.cpu = new CPU8(`VM${id}`, { 0: this.link }, false);
      this.program = program; this.data = data; this.reset();
    }
    reset() {
      this.cpu.reset(); this.link.toHost.length = 0; this.link.toVm.length = 0;
      this.cpu.load(this.program);
      for (const [a, v] of Object.entries(this.data)) this.cpu.mem[+a & 255] = v & 255;
    }
    get halted() { return this.cpu.halted; }
    step() { return this.cpu.step(); }
  }

  const PROGRAMS = {
    1: assemble([["LDI", 200], ["ADD", 0x80], ["SEND"], ["HALT"]]),
    2: assemble([["LDI", 10], ["SUB", 0x80], ["SEND"], ["HALT"]]),
    3: assemble([["LDI", 0], ["STORE", 0x81], ["LOAD", 0x81], ["ADD", 0x82], ["STORE", 0x81],
      ["LOAD", 0x82], ["SUB", 0x80], ["STORE", 0x82], ["JZ", 20], ["JMP", 4],
      ["LOAD", 0x81], ["SEND"], ["HALT"]]),
    4: assemble([["LDI", 255], ["ADD", 0x80], ["JZ", 8], ["HALT"], ["LDI", 42], ["SEND"], ["HALT"]]),
  };
  const DATA = { 1: { 0x80: 100 }, 2: { 0x80: 20 }, 3: { 0x80: 1, 0x82: 5 }, 4: { 0x80: 1 } };
  const HOST = assemble([["RECV", 1], ["OUT"], ["STORE", 0x90],
    ["RECV", 2], ["OUT"], ["ADD", 0x90], ["STORE", 0x90],
    ["RECV", 3], ["OUT"], ["ADD", 0x90], ["STORE", 0x90],
    ["RECV", 4], ["OUT"], ["ADD", 0x90], ["OUT"], ["HALT"]]);

  function disassemble(mem, from = 0, to = 256) {
    const out = [];
    for (let i = from; i < to; i += 2) out.push({ addr: i, op: NAMES[mem[i]] || "??", arg: mem[i + 1] });
    return out;
  }

  /* Machine: host + 4 VMs, round-robin one instruction each per round (as main.py). */
  class Machine {
    constructor() {
      this.vms = [1, 2, 3, 4].map((v) => new VM(v, PROGRAMS[v], DATA[v]));
      this.host = new CPU8("HOST", Object.fromEntries(this.vms.map((v) => [v.vmId, v.link])));
      this.reset();
    }
    reset() { this.vms.forEach((v) => v.reset()); this.host.reset(); this.host.load(HOST); this.round = 0; }
    get done() { return this.host.halted && this.vms.every((v) => v.halted); }
    stepRound(log = () => {}) {
      if (this.done) return false;
      for (const u of [...this.vms.map((v) => v.cpu), this.host]) {
        const t = u.step(); if (t) log(`[r${String(this.round).padStart(2, "0")}] ${t}`);
      }
      this.round++; return true;
    }
    run(log, maxRounds = 1000) { for (let r = 0; r < maxRounds && this.stepRound(log); r++); return this.host.output; }
  }

  const api = { OPS, NAMES, assemble, assembleText, disassemble, Link, CPU8, VM, Machine, PROGRAMS, DATA, HOST };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.EW = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
