"""Virtual machines: each VM is its own tree (beginning -> steps -> blocks)
and owns a private CPU8 (own 256-byte memory, own registers). It reaches the
host only through its own Link. VMs never share memory with each other."""
from cpu8 import CPU8, Link


class VM:
    def __init__(self, vm_id, nodes, program):
        self.vm_id = vm_id
        self.nodes = nodes            # this VM's own tree nodes from tree.json
        self.link = Link(vm_id)
        self.cpu = CPU8(name=f"VM{vm_id}", links={0: self.link}, is_host=False)
        self.cpu.load(program)

    @property
    def halted(self): return self.cpu.halted

    def step(self): return self.cpu.step()
