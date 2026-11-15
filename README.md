# Doro World

Play: https://ngkirto.github.io/doro-world/

Public source: https://github.com/ngkirto/doro-world

A Three.js website using the textured, skinned, animated Doro model exported from `DoroRigged.blend`.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

`npm run build` creates the production website in `dist/`. `npm run preview` serves that build locally. Deploy the contents of `dist/` to a static host.

## Experience

The 14-second intro starts after the model loads, adapted from Doro's entrance in the supplied [reference video](https://twitter.com/i/status/1933391201568501958): she hides behind a wall, peeks out, jumps out with a spin and raises both hands, cheers, then runs off before the camera swings round into player control.

After the intro, WASD or arrow keys move relative to the camera. Hold Shift to run, press R to cycle the run style (wobbly, panic, arms-back, all fours), and press 1–7 or Space for the dodge moves. Drag the scene to orbit the camera. Touch devices have directional buttons. Skip intro, Replay intro, and Return home are available. Reduced-motion preference starts directly in the playable world.

Approach the orange and press E, tap it, or use the interaction button. Every interaction picks it up directly, without the earlier nudge-and-chase cinematic. Doro leans back, looks slightly upward, and presses her rounded palms against the peel while carrying it with shorter, slower steps. The fruit is roughly half her height, or about two-thirds including the leaves.

The interface calls the fruit 歐潤吉. Press E again to set it down or F to toss it. Dodging releases it first. The orange rolls, bounces, and collides with the wall; Return home resets it nearby.

Press Q or the 驚訝！ button to play the independent shocked expression: a pop-out mouth morph and both hands raised beside her head. It is not triggered automatically by the minigame.

Follow the RPG signpost and stepping stones away from spawn to the pink paw mat beside the overflowing orange crate. Press E or the nearby prompt to enter free practice. A/D or the left/right buttons aim; hold F or the charge button, then release to throw. About 85% power aimed straight ahead is a useful first shot. Hits cheer and pop a few oranges out of the pile. Every throw automatically supplies another orange; there is no time limit. Esc or 返回散步 returns to walking with the orange. The arcade sign is a placeholder, not another playable game.

The environment includes a flat grid, the intro wall, a placeholder wooden signpost, and the orange practice area. Doro has no solid world-prop collision when empty-handed; the carried orange keeps her clear of the wall, and practice throws collide with the crate. All character motion comes from animation clips baked into the model and played through a Three.js `AnimationMixer`; the clips are in place and world travel is handled by the character group.

## Files

- `public/models/doro.glb` contains the mesh, skeleton, weights, textures, and 29 animation clips, including nine orange actions, `Shock`, the `Shocked` mouth morph, and the `OrangeGrip` prop attachment bone.
- `public/models/orange.glb` contains the orange and leaf meshes, normalized to scene scale at load time.
- `src/main.js` contains the scene, clip playback, shot timing, and input handling.
- `src/orange.js` contains the encounter, pickup/carry/place/throw states, prop physics, interaction prompts, and encounter camera.
- `src/world-props.js` builds the placeholder signpost, path, crate, shared orange clones, and pooled celebration effect.
- `src/games/orange-practice.js` manages practice input, camera, scoring, and refill; `orange-practice-physics.js` handles swept crate contacts.
- `src/style.css` contains the responsive interface.

The supplied video is used as a movement reference and is not bundled with the website.

## Verification

The intro, movement, run styles, and dodge controls were checked in the local browser. Orange verification covers the encounter, pickup, set-down, repeated pickup, toss/bounce, release on dodge, wall collision, and reset. The rounded-palm contact was checked across the baked carry and lift animations. Practice browser checks cover entry, misses, hits, refill, and held-button throwing at desktop and 390px portrait sizes. Run `node --test` for collision, bounded launch power, cancelled input, exit cleanup, and once-per-shot scoring checks. `npm run build` passes; Vite reports a bundle-size warning for the Three.js application.

## GitHub Pages

Push to `main` to run tests, build, and deploy through GitHub Actions. GitHub Pages uses the GitHub Actions source. Vite's base URL is `/doro-world/`, including the GLB model paths.

```sh
npm ci
node --test
npm run build
npm run preview
```

Open the preview at `http://127.0.0.1:4173/doro-world/`. The public checkout is separate from the original private working repository.
