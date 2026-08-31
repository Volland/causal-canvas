# Releasing

Both registries need credentials that only a human can supply, so publishing is
a manual step. Everything below is verified to work up to the authentication
prompt.

## npm — the CLI and its libraries

Publish in dependency order. npm will prompt for your 2FA one-time password.

```bash
pnpm run build
pnpm run test

cd spec            && pnpm publish --access public && cd ..
cd packages/core   && pnpm publish --access public && cd ../..
cd packages/render && pnpm publish --access public && cd ../..
cd packages/cli    && pnpm publish --access public && cd ../..
```

`@causal-canvas/edits` is not part of the CLI's dependency closure — it is only
consumed by the bundled extension. Publish it only if you want it standalone.

Afterwards:

```bash
npx @causal-canvas/causalc --version
```

## VS Code Marketplace — the extension

Needs an Azure DevOps Personal Access Token with **Marketplace: Manage** scope,
and the `pavlyshyn` publisher must exist and be yours.

Add the release to `apps/vscode/CHANGELOG.md` first. The Marketplace reads that
file out of the published `.vsix` to fill its Changelog tab, so an entry written
after the fact is invisible until the next release.

```bash
npx @vscode/vsce login pavlyshyn     # paste the PAT once
pnpm --filter causal-canvas run package
npx @vscode/vsce publish --no-dependencies --packagePath causal-canvas-0.1.0.vsix
```

If the publisher name should differ, change `publisher` in
`apps/vscode/package.json` first — it must match the account exactly.

## Before either

The namespace URLs baked into every document are:

- `https://causalcanvas.org/schema/0.1.json`
- `https://causalcanvas.org/ns/v1`

Point `causalcanvas.org` at GitHub Pages and enable Pages from `docs/`. The
files are already generated there by `pnpm run build`, and `docs/CNAME` holds
the domain. Verify before or soon after publishing:

```bash
curl -sI https://causalcanvas.org/schema/0.1.json | head -1
```

Nothing breaks while DNS is pending — the schema and context ship bundled inside
the packages, so validation and rendering never touch the network. The URLs are
identifiers.
