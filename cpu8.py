"""Tiny 8-bit CPU for the Earthenware Computer.

Computer subtree mapping (7 nodes):
  root  C        -> ControlUnit (fetch/decode/execute, scheduling of the step)
  step  C.alu    -> ALU (ADD/SUB, mod-256 wraparound, zero flag)
  step  C.mem    -> MemoryController (256-byte memory, LOAD/STORE)
  block C.alu.a  -> register A (accumulator)
  block C.alu.z  -> Z flag register
  block C.mem.pc -> PC register
  block C.mem.io -> IO port (OUT buffer + VM links for SEND/RECV)

Every instruction is two bytes: opcode, operand.
"""
from collections import deque

OPS = {"HALT": 0, "LOAD": 1, "LDI": 2, "STORE": 3, "ADD": 4, "SUB": 5,
       "JMP": 6, "JZ": 7, "OUT": 8, "SEND": 9, "RECV": 10}
NAMES = {v: k for k, v in OPS.items()}


def assemble(lines):
    """Assemble [("LDI", 5), ("HALT",), ...] or raw ints (data) into bytes."""
    out = []
    for ins in lines:
        if isinstance(ins, int):
            out.append(ins & 0xFF)
        else:
            out += [OPS[ins[0]], (ins[1] if len(ins) > 1 else 0) & 0xFF]
    return out


class Link:
    """A per-VM bidirectional message queue to the host."""
    def __init__(self, vm_id):
        self.vm_id = vm_id
        self.to_host = deque()
        self.to_vm = deque()


class ALU:
    @staticmethod
    def add(a, b): return (a + b) & 0xFF
    @staticmethod
    def sub(a, b): return (a - b) & 0xFF


class MemoryController:
    def __init__(self):
        self.mem = bytearray(256)
    def read(self, addr): return self.mem[addr & 0xFF]
    def write(self, addr, val): self.mem[addr & 0xFF] = val & 0xFF
    def load(self, program, base=0):
        for i, b in enumerate(program):
            self.write(base + i, b)


class CPU8:
    """Control unit. `links` maps link id -> Link. For the host, SEND/RECV
    operand selects the VM link; inside a VM there is a single link (id 0)."""
    def __init__(self, name="cpu", links=None, is_host=True):
        self.name, self.is_host = name, is_host
        self.memc = MemoryController()
        self.a = self.pc = 0
        self.z = False
        self.halted = False
        self.output = []
        self.links = links or {}

    def load(self, program): self.memc.load(program)

    def _set(self, v):
        self.a = v & 0xFF
        self.z = self.a == 0

    def step(self):
        """Execute one instruction. Returns a trace string (or None if halted)."""
        if self.halted:
            return None
        op, arg = self.memc.read(self.pc), self.memc.read(self.pc + 1)
        name = NAMES.get(op, "HALT")
        nxt = (self.pc + 2) & 0xFF
        note = ""
        if name == "HALT":
            self.halted = True
        elif name == "LOAD": self._set(self.memc.read(arg))
        elif name == "LDI": self._set(arg)
        elif name == "STORE": self.memc.write(arg, self.a)
        elif name == "ADD": self._set(ALU.add(self.a, self.memc.read(arg)))
        elif name == "SUB": self._set(ALU.sub(self.a, self.memc.read(arg)))
        elif name == "JMP": nxt = arg
        elif name == "JZ":
            if self.z: nxt = arg
        elif name == "OUT":
            self.output.append(self.a); note = f" -> out {self.a}"
        elif name == "SEND":
            link = self.links[arg if self.is_host else 0]
            (link.to_vm if self.is_host else link.to_host).append(self.a)
            note = f" -> link {link.vm_id}: {self.a}"
        elif name == "RECV":
            link = self.links[arg if self.is_host else 0]
            q = link.to_host if self.is_host else link.to_vm
            if not q:
                return f"{self.name} pc={self.pc:3d} RECV {arg} (waiting)"
            self._set(q.popleft()); note = f" <- link {link.vm_id}: {self.a}"
        line = f"{self.name} pc={self.pc:3d} {name} {arg:3d} A={self.a:3d} Z={int(self.z)}{note}"
        self.pc = nxt
        return line

    def run(self, max_steps=10000):
        for _ in range(max_steps):
            if self.halted: break
            self.step()
        return self.output
