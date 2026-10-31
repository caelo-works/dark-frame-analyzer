#!/usr/bin/env python3
"""repro-zip.py <stage-dir> <out.zip>

Zips a staged install tree reproducibly: entries in sorted order, a constant
timestamp, fixed permissions (0644) and a fixed creator system (unix), so the
same content always yields the same archive and the same sha1 - which is how
the update site authenticates a package.

Shared by build-update-package.sh and sign-package.sh: the signed zip is laid
out exactly like the unsigned one it replaces, only with the .xsgn added.

Entries are stored, not deflated: this is the layout every package since 1.0
has shipped with, kept so the archive bytes do not change for reasons other
than its content.
"""
import os
import sys
import zipfile

FIXED_DATE = (2000, 1, 1, 0, 0, 0)  # constant mtime: sha1 depends on content only

stage, out = sys.argv[1], sys.argv[2]

entries = []
for root, _, names in os.walk(stage):
    for name in names:
        full = os.path.join(root, name)
        arc = os.path.relpath(full, stage).replace(os.sep, "/")
        entries.append((arc, full))
entries.sort()
if not entries:
    sys.exit("ERROR: nothing to zip in " + stage)

with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
    for arc, full in entries:
        with open(full, "rb") as f:
            data = f.read()
        info = zipfile.ZipInfo(arc, date_time=FIXED_DATE)
        info.external_attr = 0o644 << 16
        info.create_system = 3  # fixed (unix): CPython defaults to 0 on Windows
        info.compress_type = zipfile.ZIP_STORED
        z.writestr(info, data)
