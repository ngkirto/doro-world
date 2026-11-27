# Performance controls and measurement

Default: Auto. Select quality in the top bar; preference is stored on this device.

| Mode | Frame cap | DPR cap | Pixel budget | Sun shadow |
| --- | --- | --- | --- | --- |
| Auto | 60 | balanced/low | adaptive | adaptive |
| Power saving | 30 | 1 | 1 million | 512 px |
| Balanced | 60 | 1.5 | 2 million | 1024 px |
| High | 60 | 2 | 4 million | 2048 px |

Actual DPR also respects the device DPR and pixel budget. Auto starts balanced, reduces after sustained slow frames and recovers after sustained headroom; loading and background-tab stalls are excluded. Auto low retains a 60 FPS target to measure recovery. Power saving disables scenery shadow casting while retaining character shadows. Hidden tabs skip rendering.

Repeated static fruit, planks and stepping stones use shared instanced geometry. The crate and nearby props are hidden beyond the fully opaque fog. Character geometry, skinning, morphs and all 29 animation clips are unchanged. Orange support height caches unchanged rotations and reuses temporary math objects.

Append `?stats=1` to show local FPS, frame p95, CPU submission time, draw calls, triangles and drawing resolution. No metrics leave the browser. Development builds additionally expose two benchmark location buttons; production does not.

## Recorded comparison

Local desktop browser, 1280 x 720 CSS, DPR 1.5, settled practice camera, high quality (2048 shadow) for comparison:

| Metric | Before | After |
| --- | --- | --- |
| Draw calls | 120 | 23 |
| Triangles | 78,593 | 79,517 |
| FPS | 60 | 60 |
| CPU frame submission sample | 1.6 ms | 1.1 ms |
| Doro GLB | 3,877,764 bytes | 3,395,028 bytes |

Draw calls fall about 81%. Instanced groups trade slightly coarser culling for fewer calls. CPU values are short samples, not GPU timings or statistical benchmarks. The baseline already reached 60 FPS; this demonstrates more rendering headroom, not a measured FPS gain. Manual power saving measured 30 FPS at 1280 x 720 drawing resolution. Mobile layout was checked at 390 x 844; physical mobile hardware performance remains unmeasured. Local cached load times are not network benchmarks.

Two PNG images are converted to lossless WebP; visible RGBA pixels and dimensions are checked during conversion. All non-image buffer views and mesh/skin/morph/animation descriptors were compared against the original. The export requires EXT_texture_webp support (provided by the bundled Three.js GLTFLoader and modern browsers). Model geometry was not decimated.

Reproduce compression with distinct input and output paths:

```sh
node scripts/optimize-model.mjs original.glb optimized.glb
```

Validation: `node --test`, `npm run build`, `npm audit --audit-level=high`; production preview with CSP, visual texture inspection, and successful practice throw/refill.
