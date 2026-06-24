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

## Dateien

| Datei         | Zweck                              |
| ------------- | ---------------------------------- |
| `index.html`  | Struktur / Markup                  |
| `styles.css`  | Styling (Dark Theme)               |
| `app.js`      | Logik, State, Drag & Drop, I/O     |

## JSON-Format

```json
{
  "version": 1,
  "startTime": "09:00",
  "templates": [
    { "id": "…", "name": "Keynote", "duration": 45, "color": "#4f8cff" }
  ],
  "tracks": [
    {
      "id": "…",
      "name": "Track A",
      "blocks": [
        { "id": "…", "templateId": "…", "name": "Keynote", "duration": 45, "color": "#4f8cff" }
      ]
    }
  ]
}
```

Blöcke enthalten eine **Kopie** der Template-Werte. Ein nachträglich geändertes
oder gelöschtes Template lässt bereits platzierte Blöcke daher unangetastet.
