"""Absorb an outside open-source project as an Earthenware Computer product.

    python3 absorb.py <owner/repo> [--entry CMD] [--vendor]

Default records a *pinned reference* (repo URL + exact commit) instead of
vendoring code; --vendor additionally shallow-clones into
products/<name>/upstream/ (git-ignored, reproducible from the pin).
Only permissive licenses are accepted."""
import argparse, json, os, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOWED = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"}
MAX_CHILDREN = 3          # ternary product tree
HUB = "P"                 # product hub node, linked to the computer C
FIRST_SLOT = 5            # VM1-4 are the CPU demo VMs


class LicenseError(Exception):
    pass


def check_license(spdx, repo="repo"):
    if not spdx or spdx in ("NOASSERTION", "NONE"):
        raise LicenseError(f"REFUSED {repo}: no recognised license found. "
                           f"Only {', '.join(sorted(ALLOWED))} can be absorbed.")
    if spdx not in ALLOWED:
        raise LicenseError(f"REFUSED {repo}: license {spdx} is not permissive. "
                           f"Allowed: {', '.join(sorted(ALLOWED))}.")
    return spdx


def gh_api(path):
    try:
        out = subprocess.run(["gh", "api", path], capture_output=True, text=True, check=True)
        return json.loads(out.stdout)
    except (FileNotFoundError, subprocess.CalledProcessError):
        req = urllib.request.Request("https://api.github.com/" + path,
                                     headers={"Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req) as r:
            return json.load(r)


def fetch_meta(repo, api=gh_api):
    m = api(f"repos/{repo}")
    branch = m.get("default_branch", "main")
    sha = api(f"repos/{repo}/commits/{branch}")["sha"]
    lic = (m.get("license") or {}).get("spdx_id")
    return {"repo": m["full_name"], "name": m["name"], "url": m["html_url"],
            "owner": m["owner"]["login"], "commit": sha, "license": lic, "branch": branch}


def product_name(name):
    return "Earthenware " + " ".join(p[:1].upper() + p[1:] for p in name.replace("_", "-").split("-"))


def load_tree(path):
    with open(path) as f:
        return json.load(f)


def add_product_node(tree, key):
    """Add (or return existing) product VM node. Products form a ternary tree
    under hub P (P is linked to C); each parent holds at most 3 children."""
    prods = tree.setdefault("products", [])
    links = tree.setdefault("product_links", {})
    for n in prods:
        if n["product"] == key:
            return n
    if not any(n["id"] == HUB for n in prods):
        prods.append({"id": HUB, "kind": "hub", "level": "beginning", "parent": None,
                      "owner": "products", "product": None})
        links[HUB] = "C"
    vms = [n for n in prods if n["kind"] == "vm"]
    i = len(vms)
    parent = HUB if i < MAX_CHILDREN else vms[(i - MAX_CHILDREN) // MAX_CHILDREN]["id"]
    slot = FIRST_SLOT + i
    node = {"id": f"VM{slot}", "kind": "vm", "level": "product", "parent": parent,
            "owner": f"VM{slot}", "product": key, "slot": slot}
    prods.append(node)
    links[node["id"]] = "C"
    return node


def write_product(root, meta, slot, entry, license_text=None):
    d = os.path.join(root, "products", meta["name"])
    os.makedirs(d, exist_ok=True)
    pj = {"name": product_name(meta["name"]), "upstream": meta["url"],
          "commit": meta["commit"], "license": meta["license"], "entry": entry,
          "vm_slot": slot, "source": "pinned-reference"}
    with open(os.path.join(d, "product.json"), "w") as f:
        json.dump(pj, f, indent=1); f.write("\n")
    with open(os.path.join(d, "NOTICE"), "w") as f:
        f.write(f"{pj['name']} is a repackaging of {meta['repo']}\n"
                f"Original author: {meta['owner']}\nUpstream: {meta['url']}\n"
                f"Commit: {meta['commit']}\nLicense: {meta['license']} (see LICENSE, "
                f"copied unmodified from upstream)\n")
    if license_text is not None:
        with open(os.path.join(d, "LICENSE"), "w") as f:
            f.write(license_text)
    return pj


def absorb(repo, root=HERE, api=gh_api, entry=None, vendor=False, license_text=None):
    meta = fetch_meta(repo, api)
    check_license(meta["license"], meta["repo"])
    if license_text is None:
        import base64
        lic = api(f"repos/{meta['repo']}/license")
        license_text = base64.b64decode(lic["content"]).decode()
    tpath = os.path.join(root, "tree.json")
    tree = load_tree(tpath)
    node = add_product_node(tree, meta["name"])
    pj = write_product(root, meta, node["slot"], entry or f"python3 -m {meta['name']}", license_text)
    with open(tpath, "w") as f:
        json.dump(tree, f, indent=1); f.write("\n")
    if vendor:
        up = os.path.join(root, "products", meta["name"], "upstream")
        if not os.path.isdir(up):
            subprocess.run(["git", "clone", "--depth", "1", meta["url"] + ".git", up], check=True)
    return pj


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("repo"); ap.add_argument("--entry"); ap.add_argument("--vendor", action="store_true")
    a = ap.parse_args(argv)
    try:
        pj = absorb(a.repo, entry=a.entry, vendor=a.vendor)
    except LicenseError as e:
        print(e, file=sys.stderr); return 2
    print(f"ABSORBED {a.repo} -> {pj['name']} (VM{pj['vm_slot']}, {pj['license']}, {pj['commit'][:7]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
