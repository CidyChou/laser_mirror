# Audio system

This build uses an in-project, procedurally generated SFX set. No third-party audio files are bundled.

SFX:
- mirror_rotate: tactile mirror rotation
- laser_charge: 480 ms energy charge matching GameConfig
- laser_fire: laser launch impulse
- mirror_hit: reflective impact / duang
- splitter_hit: prism split impact
- portal: teleport / warp
- target_hit: receiver lock-on
- switch_on: switch activation
- shot_fail: failed test shot
- victory: completion sting
- ui_click: reset / next
- combo-1..6: milestone stings at combos 2, 3, 5, 8, 12, and 20; above 20,
  combo-6 repeats only every five hits so dense late-game paths stay readable

Files are compact mono MP3 at 96 kbps and are played through the platform audio adapter.
