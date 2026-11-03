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


import os as _os
import subprocess as _sp


class ProcessVM:
    """Runs an absorbed product's entry command as an isolated subprocess in
    its own working dir. It talks to the host only via its Link: every stdout
    line becomes one message on link.to_host; messages on link.to_vm are
    written to the process's stdin (one per line)."""
    def __init__(self, vm_id, command, cwd, nodes=None, timeout=30):
        self.vm_id, self.command, self.cwd = vm_id, command, cwd
        self.nodes = nodes or []
        self.link = Link(vm_id)
        self.timeout = timeout
        self.returncode = None

    @property
    def halted(self): return self.returncode is not None

    def run(self):
        stdin = "".join(f"{m}\n" for m in self.link.to_vm)
        self.link.to_vm.clear()
        args = command_args(self.command)
        p = _sp.run(args, cwd=self.cwd, input=stdin, capture_output=True,
                    text=True, timeout=self.timeout)
        for line in p.stdout.splitlines():
            self.link.to_host.append(line)
        self.returncode = p.returncode
        return self.returncode


def command_args(command):
    import shlex, sys
    args = shlex.split(command) if isinstance(command, str) else list(command)
    if args and args[0] in ("python", "python3"):
        args[0] = sys.executable
    return args
