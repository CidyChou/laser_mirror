---
name: design-taste-frontend
description: Project-local Taste Skill snapshot for redesigning Laser Mirror. Audit-first, anti-slop visual hierarchy, restrained effects, deliberate motion.
---

# Taste Skill — Laser Mirror Project Adapter

Upstream: https://github.com/Leonxlnx/taste-skill
Upstream skill: `skills/taste-skill/SKILL.md` (`design-taste-frontend`)
License: MIT
Installed locally because Agent Skills supports copying a SKILL.md into the project.

## Design Read
Dark-tech premium casual puzzle game for mobile mini-game platforms. The interface must feel polished and energetic, but the puzzle board must remain instantly readable.

- DESIGN_VARIANCE: 5
- MOTION_INTENSITY: 6
- VISUAL_DENSITY: 3

## Redesign Rules Used In This Project

1. **Audit before redesign.** Preserve the strongest parts of the existing/reference UI. Do not rebuild merely to make it different.
2. **One visual job per layer.** If two glow/ring layers communicate the same thing, remove one.
3. **Avoid AI-style concentric decoration.** No stacks of repetitive circles, glass cards, borders, or glow rings without semantic purpose.
4. **Hierarchy first.** The laser is the hero. Mirrors are interactive supports. Board cells and HUD stay quieter.
5. **Color has meaning.** Pink/red = laser energy; cyan = interactive optics; green = successful receiver/switch; gold = inactive target.
6. **Motion must explain state.** Use short charge, launch shockwave, mirror impact, rotation feedback, and victory. Avoid motion everywhere.
7. **Keep the dark-tech atmosphere restrained.** Broad ambient light is preferable to obvious concentric gradients.
8. **Effects must remain readable at small mobile size.** A single strong silhouette beats many faint layers.
9. **Premium means restraint.** Fewer, better-defined highlights; stronger spacing; no decorative clutter.
10. **Performance is part of taste.** Prebuild Graphics geometry; animate transforms/alpha; pool transient effects; avoid rebuilding complex Graphics every frame.
11. **Reference-image priority.** When a supplied previous version looks better, match its visual logic before inventing a new one.
12. **Pre-flight check.** Confirm: hierarchy, contrast, interaction state, idle state, motion purpose, performance, and mobile readability.

## Laser-Specific Direction

- Broad red outer energy halo, not a stack of many pastel layers.
- Strong hot-pink body and thin white-hot core.
- Rounded-looking elbows by adding compact junction energy at reflection points.
- One shockwave + one flash at impacts, not multiple concentric rings.
- A few moving energy streaks are enough; do not fake quality by flooding particles.
- Emitter and target use simple, recognizable wall-mounted silhouettes.
