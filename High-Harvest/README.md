# High Harvest – Leaf Rush

Ein eigenständiger, rein lokaler Browsergame-Prototyp auf Basis der untersuchten Sammler-/Kaskadenmechanik. Verwendet vorhandene HighSociety- und BroCoon-Assets aus dem AI-Art-Workspace.

## Starten

Auf macOS genügt ein Doppelklick auf `High Harvest starten.command`.

Alternativ im Terminal:

```bash
cd High-Harvest
python3 -m http.server 4173
```

Danach `http://localhost:4173` öffnen.

## Spielmathematik

- Ziel-RTP: ca. 92 % über eine große Zahl bezahlter Runden
- Basis-Featurechance: 7,5 % je neuem Symbol
- Featurechance in Free Drops: 1 %; Retrigger über Goldsamen bleibt möglich
- Kalibrierungsfaktor für Blatt- und Brokkoli-Werte: 0,0894
- Erwartungswerttreue Zufallsrundung hält den RTP über alle Einsatzstufen stabil

Die Monte-Carlo-Prüfung lässt sich mit `node tools/simulate-rtp.mjs 200000 1` wiederholen. Die Simulation verwendet einen festen Seed und bildet Sammler, Kaskaden, Meter, Features, Free Drops und Retrigger ohne Animationen nach.

## Enthalten

- 6×6-Grid mit Erweiterung bis 8×8
- vier farbgebundene, animierte Bossfight-Sammler
- Kaskaden, Level 1–7 und wertabhängige Zugreihenfolge
- Harvest Meter mit bis zu drei gleichzeitigen Feature-Releases
- Grinder, Hotbox, Puff-Puff-Pass, Vape Bridge, Rosin Wild, Brokkoli Coins und Grow Burst
- Bonus durch drei Goldsamen mit fünf persistenten Free Drops und Retrigger
- responsive Desktop-/Mobilansicht
- mitgelieferte Phaser-WebGL-Runtime für flüssige Figuren-, Pfad- und Gravity-Animationen
- prozedurale Sounds und Partikeleffekte ohne Netzwerk-Abhängigkeiten
- eigener mit ImageGen erzeugter Growroom-Hintergrund

Es handelt sich bewusst um ein Arcade-Spiel mit Fantasiepunkten, nicht um Echtgeld-Glücksspiel.
