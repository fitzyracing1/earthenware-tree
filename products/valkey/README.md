# Earthenware Valkey (VM7)

Pinned reference to [valkey-io/valkey](https://github.com/valkey-io/valkey) (BSD-3-Clause) — no code vendored.
See `product.json` for the exact commit; `LICENSE` is upstream's, unmodified; `NOTICE` credits the original authors.

Entry: `valkey-server --port 0 --unixsocket valkey.sock --save '' --appendonly no`

`--port 0` disables TCP so the VM opens no network port; clients talk over the
unix socket in the product dir (`valkey-cli -s valkey.sock ping`). No persistence.
For TCP instead, use `--port 6379 --bind 127.0.0.1`.
