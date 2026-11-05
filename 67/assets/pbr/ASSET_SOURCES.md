# Offline PBR Material Library — GARAGE LIFE 0.3

All 18 PNGs in this directory are **new, original, generated textures**. Generated with NumPy, SciPy and Pillow from the checked-in `scripts/generate-pbr.py` using a reproducible RNG seed. No third-party licensed texture files or photographic assets are included. The source is freely usable in this project.

Families: `garage_tile`, `painted_concrete`, `cast_aluminium`, `powder_steel`, `technical_rubber`, `machined_steel`. Each family has `basecolor`, `normal` (OpenGL convention) and `roughness` maps at 512 × 512. No metallic maps (metalness is assigned per material).

## Limitations

These stylized/procedural maps are an improvement over flat colors, **not equivalent** to scanned CC0 materials from Poly Haven or ambientCG. No 4K photogrammetry or HD model replacements have been downloaded. The car/engine geometry is still procedural, but improved. Actual GPU FPS and gameplay have not been verified in this container due browser navigation restrictions.
