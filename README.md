# Hair Simulation

An interactive hair simulation built with [React Three Fiber](https://r3f.docs.pmnd.rs/) and a custom GLSL shader. You draw a region directly on a 3D head model, the app fills that region with surface points, and then grows thousands of GPU‑instanced hair strands from those points, shaded with a GPU curl‑noise field.

![Three.js](https://img.shields.io/badge/three.js-r173-000000?logo=three.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)

> Originally built in 2025; restructured and cleaned up for GitHub in 2026.

## How it works

1. **Draw a region** – Click points on the head model. Each click is raycast onto the mesh surface, and dense, surface‑conforming line segments are interpolated between clicks.
2. **Close the shape** – Click near the first point to close the loop.
3. **Generate surface points** – The closed boundary is projected to a 2D plane, filled with a uniform grid, clipped to the polygon, and each grid point is raycast back onto the head surface to recover its 3D position and normal (`SurfaceMesh`).
4. **Grow hair** – `HairGenerator` instances a thin plane geometry at every surface point, oriented along the surface normal. A `HairMaterial` (custom `RawShaderMaterial`) bends each strand from root to tip. A GPU curl‑noise pass (`CurlPass`) bakes a noise field into a texture once; each strand samples it to get natural, clumped lightness variation (`shadeStrength`).

## Controls

The [Leva](https://github.com/pmndrs/leva) panel (top right) exposes:

- **Reset Drawing** – clear the current drawing (or press `r`)
- **Hair** – toggle hair rendering on/off
- **Hide Shape** – hide the drawn outline and surface points
- **Hair Direction** – Up / Left / Right
- **Hair Density** – multiplier for the number of strands

Orbit / zoom with the mouse. The camera is distance‑ and angle‑limited so the
view stays on the head, and is locked entirely while points are being generated.

## Getting started

```bash
# install dependencies
npm install

# start the dev server
npm run dev

# production build
npm run build

# preview the production build
npm run preview
```

Then open the local URL printed by Vite (default http://localhost:5173).

## Tech stack

- **React 19** + **Vite 6**
- **three.js** (r173)
- **@react-three/fiber**, **@react-three/drei**, **@react-three/postprocessing**
- **leva** for runtime controls
- Custom **GLSL** shaders (hair, curl noise, simplex noise)

## Project structure

```
src/
  main.jsx                 # App entry
  App.jsx                  # Canvas, lights, Leva panel, postprocessing
  components/
    Experience.jsx         # Drawing interaction + scene composition
    SurfaceMesh.jsx        # Surface point generation (plane fit, grid fill, raycast)
    HairGenerator.jsx      # Instanced hair strands + curl pass wiring
    HairMaterial.js        # Custom hair RawShaderMaterial (vertex + fragment)
    CurlPass.js            # GPU curl-noise render pass
    Fibonacci.js           # Even point distribution on a sphere
  shaders/                 # curl + ortho GLSL sources
  modules/                 # math helpers + ShaderTexture (FBO) utility
  context/                 # Configurator (loading state) context
public/
  model3.glb               # Head model
  blade.jpg                # Strand texture
```

## Credits

Curl-noise and simplex-noise GLSL are based on the well-known implementations by Ian McEwan / Ashima Arts ([webgl-noise](https://github.com/ashima/webgl-noise)).
