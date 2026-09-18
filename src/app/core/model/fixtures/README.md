# Vendored corpus

The CEDAR artifact corpus, checked in so every checkout runs it. A test must not
become weaker because another repository is missing from the workspace, and a
suite that silently skips its own oracle is worse than one that has none.

`corpus/` holds the 38 canonical JSON templates — real artifacts, authored by
people and by the production Template Editor, so they are the only input in this
repository that the CEDAR model libraries did not produce. That independence is
the point: everything else here feeds CED templates the TypeScript model library
wrote, which cannot show whether CED can open what production already holds.

Source: `metadatacenter/cedar-test-artifacts`, branch `develop`, commit
`912ba203578cbdf1273a45470437333efe81a62c`, directory `artifacts/templates/`.

To refresh, copy `template-NNN.json` from each numbered directory. Do not copy
the `-generated-` or `-original` files: those are library outputs, and comparing
CED against them would put a model library on both sides of the comparison.

CEE vendors the same corpus at an earlier commit, alongside instances and its own
production-derived suite. Templates are all CED needs — it authors templates and
does not fill them in.
