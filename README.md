# 🧩 Track-Tetris – Konferenz-Rahmenzeitplaner

Eine reine Browser-Anwendung (kein Backend), um Konferenz-Rahmenzeitpläne zu
„puzzeln". Zeitslot-Templates definieren, auf beliebig viele Tracks verteilen,
Startzeit setzen – die App berechnet automatisch alle Zeiten. Speichern und
Teilen erfolgt über JSON-Dateien.

## Funktionen

- **Templates** mit Name, Dauer (Minuten) und Farbe anlegen, bearbeiten, löschen.
- **Tracks** beliebig hinzufügen, umbenennen, löschen.
- **Drag & Drop**: Templates aus der Palette in Tracks ziehen, Blöcke zwischen
  und innerhalb von Tracks frei umsortieren.
- **Proportionale Zeitachse**: Blockhöhe entspricht der Dauer; ein gemeinsames
  Zeit-Lineal links und ausgerichtete Track-Spalten machen parallele Slots über
  alle Tracks hinweg vergleichbar. Zoom (px/min) per +/−.
- **Plenum- / Blocking-Blöcke** (`🔒 + Plenum`): Blöcke, die über ALLE Tracks
  laufen (Begrüßung, Keynote, Closing). Sie wirken als Synchronisationspunkt –
  nach einem Plenum starten alle Tracks gemeinsam wieder; ist ein paralleler
  Abschnitt in einem Track kürzer, „wartet" er bis zum nächsten Plenum.
- **Lücken / Pausen**: Leerzeit-Blöcke innerhalb eines Abschnitts einfügen.
- **Blöcke direkt bearbeiten**: Doppelklick (oder ✎ am Block) öffnet einen
  Dialog für Name, Dauer und Farbe – unabhängig vom ursprünglichen Template.
- **Automatische Zeitberechnung** ab einer frei wählbaren Startzeit – pro Block
  und als Track-Gesamtdauer.
- **Export / Import** des gesamten Zustands als JSON.
- **Auto-Speicherung** der laufenden Sitzung im Browser (localStorage); die
  „echte" Persistenz bleibt aber die vom Nutzer verwaltete JSON-Datei.

## Nutzung

Keine Installation, kein Build. Einfach `index.html` im Browser öffnen:

```
# z.B. lokal über einen kleinen Webserver (empfohlen wegen File-Import)
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Oder `index.html` direkt per Doppelklick öffnen.

## Oberflächen

- **Desktop** (`index.html`): Puzzle-Board mit Drag & Drop und proportionaler
  Zeitachse.
- **Mobil** (`mobile.html`): touch-optimiert – Templates antippen zum Hinzufügen,
  Blöcke per ↑/↓ sortieren. Beide teilen denselben localStorage-Stand und dasselbe
  JSON-Format. Umschalten über die Links in der Kopfzeile.
- **Auto-Weiterleitung**: Mobilgeräte landen automatisch auf `mobile.html`. Über
  „🖥 Desktop" (Link `index.html?desktop=1`) lässt sich das pro Sitzung übersteuern.

## Dateien

| Datei         | Zweck                                         |
| ------------- | --------------------------------------------- |
| `index.html`  | Desktop-Markup                                |
| `styles.css`  | Desktop-Styling (Dark Theme)                  |
| `app.js`      | Desktop-UI: Rendering, Drag & Drop, Modal     |
| `mobile.html` | Mobil-Markup                                  |
| `mobile.css`  | Mobil-Styling                                 |
| `mobile.js`   | Mobil-UI (touch-first)                        |
| `core.js`     | Gemeinsame Datenschicht: State, Persistenz, Zeit-Mathematik, Mutationen, Im-/Export |

CSS/JS werden beim Deploy über `?v=<commit-sha>` versioniert (Cache-Busting);
im Markup steht dafür der Platzhalter `__BUILD__`, den der Workflow ersetzt.

## JSON-Format

```json
{
  "version": 1,
  "startTime": "09:00",
  "pxPerMin": 1.8,
  "templates": [
    { "id": "…", "name": "Keynote", "duration": 45, "color": "#4f8cff" }
  ],
  "tracks": [
    {
      "id": "…",
      "name": "Track A",
      "blocks": [
        { "id": "…", "templateId": "…", "name": "Keynote", "duration": 45, "color": "#4f8cff", "isGap": false }
      ]
    }
  ]
}
```

Blöcke enthalten eine **Kopie** der Template-Werte. Ein nachträglich geändertes
oder gelöschtes Template lässt bereits platzierte Blöcke daher unangetastet.
