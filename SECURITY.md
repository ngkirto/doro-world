# Security and asset exposure

This is a public, static browser game. Its JavaScript, textures and GLB files are downloadable by visitors. Minification, disabled source maps and a private source repository do not provide model copy protection. Only web exports are included; Blender source files, authoring scripts, credentials and local hosting configuration remain outside this repository.

The game has no authentication, backend, uploads or user-provided HTML. Only mute and quality preferences are stored in localStorage. Google Fonts is the only third-party resource provider used by the page. Production CSP blocks inline JavaScript, eval, external scripts, frames and remote model requests. Inline styles remain permitted for animation/UI updates. The meta policy is a defense in depth, not a complete security boundary; it does not provide frame-ancestors protection or isolate this project from other sites on the same github.io origin.

CI checks the embedded GLBs, runs behavior tests and dependency audits, and deploys only dist. Actions are pinned to commit hashes. Build jobs have read-only repository access; only deployment gets Pages and OIDC permissions. Dependabot proposes updates; changes still need review. An audit with no advisories is not proof that a dependency is vulnerability-free.

Do not put API secrets or private information in client code or model extras. Adding multiplayer, accounts or uploads requires a separate server-side security review, including authorization, input validation and rate limiting. Gameplay scores currently run locally and are not cheat-resistant.

Preserve third-party attribution and licensing metadata when replacing assets. See the in-game Credits link. No blanket license is granted over third-party characters or artwork.
