# Database Update Guide (`data/events.json`)

All event records are decoupled from the webpage code and stored independently in [`events.json`](./events.json). You can update, add, or remove events in this file at any time without touching the website's frontend code (`index.html`, `app.js`, `style.css`).

---

## 1. Event Data Schema

Each event is a JSON object within the main array `[...]`:

```json
{
  "name": "Toronto International Boat Show 2026",
  "start": "2026-01-18",
  "end": "2026-01-26",
  "venue": "Enercare Centre, Exhibition Place",
  "area": "Downtown Toronto",
  "cat": "exhibition",
  "att": 30000,
  "exp": 30000,
  "act": null,
  "hist": false,
  "hotel": false,
  "hn": null,
  "url": "https://example.com/event",
  "urls": [
    "https://example.com/event"
  ],
  "note": null,
  "lat": 43.63532,
  "lng": -79.41058,
  "vlat": 43.63532,
  "vlng": -79.41113
}
```

### Field Definitions

| Field | Type | Required? | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Yes** | Full name of the event. |
| `start` | String (`YYYY-MM-DD`) | **Yes** | Event start date. |
| `end` | String (`YYYY-MM-DD`) | **Yes** | Event end date (same as `start` for single-day events). |
| `venue` | String | **Yes** | Venue / location name. |
| `area` | String | **Yes** | Geographical district (e.g. `Downtown Toronto`, `Airport`, `Markham`, `Mississauga`, `Toronto / GTA`). |
| `cat` | String | **Yes** | Category slug: `conference`, `music`, `exhibition`, `performance`, `festival`, `fan_convention`, `gala`, `sports`, `dining`. |
| `att` | Number \| `null` | No | Effective attendance figure. If `null`, event bubble appears hollow. |
| `exp` | Number \| `null` | No | Expected / projected attendee count. |
| `act` | Number \| `null` | No | Actual verified attendee count. |
| `hist` | Boolean | **Yes** | `true` if event already occurred (displayed with muted styling); `false` if upcoming. |
| `hotel` | Boolean | **Yes** | `true` if hosted at a hotel venue (`Hotel Event Only` filter applies). |
| `hn` | String \| `null` | No | Hotel name (if `hotel: true`, e.g. `"Fairmont Royal York"`). |
| `url` | String \| `null` | No | Primary source / event page URL. |
| `urls` | Array [String] | No | List of all verification/source URLs. |
| `note` | String \| `null` | No | Editorial notes or citation details. |
| `lat`, `lng` | Number | **Yes** | Rendered bubble coordinates (spiraled out if multiple events share a venue). |
| `vlat`, `vlng` | Number | **Yes** | Canonical ground coordinates of the venue. |

---

## 2. How to Add or Update Events

1. Open `data/events.json`.
2. Locate the insertion point or scroll to the end of the array.
3. Paste your new event object (ensure proper comma `,` separation between objects).
4. Save the file.
5. Commit and push:
   ```bash
   git add data/events.json
   git commit -m "Add new events to database"
   git push origin main
   ```
   The live site will immediately fetch and reflect the new data without any code re-compilation or HTML edits.

---

## 3. Data Validation Checklist

Before committing changes to `events.json`:
- [ ] Valid JSON syntax (no trailing comma after the last item).
- [ ] Dates follow `YYYY-MM-DD` format.
- [ ] Category `cat` matches one of the valid category slugs.
- [ ] Numeric coordinates (`lat`, `lng`, `vlat`, `vlng`) are valid floats.
- [ ] Boolean values are lowercase `true` or `false` (not strings).
