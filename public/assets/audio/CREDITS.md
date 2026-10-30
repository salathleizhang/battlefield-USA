# Audio assets

All files are **CC0 1.0** and redistributable.

- Gunshots, bolt/charger foley, shell handling, footsteps, impacts and explosions:
  **The Free Firearm Sound Library** — CC0
  https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
  (edits: trimmed, pitched and layered per weapon in `src/core/Audio.js`)
- UI clicks/ticks and the remaining impact set: **Kenney Impact Sounds,
  Interface Sounds** — CC0, https://kenney.nl

The files were copied from the reference project (`cktang88/3d-fps`, CC0 audio set) and
are played through the sample-based mixer in `src/core/Audio.js`; a small procedural
synthesiser layers the transient and low punch on top of every gunshot so near/far
reports read differently.
