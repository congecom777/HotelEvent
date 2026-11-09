# HotelEvent (Hospitality Demand Map Toronto)

An interactive cartographic platform tracking event-driven hospitality demand across Toronto and the Greater Toronto Area (GTA) for hoteliers, revenue managers, and sales teams.

Live demo: [https://hotelevent.cong-ecom777.workers.dev/](https://hotelevent.cong-ecom777.workers.dev/)

---

## Architecture: Web vs Database

The project decouples frontend application logic from dataset storage, allowing data updates without touching any presentation or application code:

`
HotelEvent/
│
├── index.html              # Lightweight HTML shell
├── style.css               # Application stylesheets & themes
├── app.js                  # Map rendering, Leaflet interactions & filter logic
├── og-image.png            # Social sharing preview image (1200x673)
│
├── data/
│   ├── events.json         # Master event database (1,790+ events)
│   └── README.md           # Database guide & schema documentation
│
├── robots.txt              # AI crawler & search engine policy
└── _headers                # Cloudflare response headers
`

---

## Features

- **Interactive Demand Cartography**: Leaflet-based map with custom layers, district fills, and venue clustering.
- **Dynamic Bubble Scaling**: Event bubbles scale proportional to published/expected attendance numbers.
- **Hotel Proximity & Drive-Time Routing**: Select your property from the master hotel list to calculate driving distance and estimated transit duration to each event (via OSRM).
- **Time Window Slicer**: Filter events across a custom timeline (Jan 2025 – Nov 2027).
- **Segment & Venue Filters**: Slice by demand segment (Conferences, Festivals, Exhibitions, etc.), attendee threshold, and hotel-hosted events.

---

## How to Update the Event Database

1. Open [data/events.json](data/events.json).
2. Add or modify event records according to the [Database Guide](data/README.md).
3. Commit and push:
   `ash
   git add data/events.json
   git commit -m "Update events database"
   git push origin main
   `
4. The web application dynamically fetches data/events.json on page load, automatically rendering the latest data.

---

## Local Development / Testing

Serve the directory with any standard static HTTP server:

`ash
# Using Python
python -m http.server 8000

# Using Node.js (npx)
npx serve .
`

Open http://localhost:8000 in your browser.

---

## License & Copyright

© 2026 [Minh Cong Nguyen](https://www.linkedin.com/in/minhcong/). All rights reserved.
