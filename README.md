# RetroDrive Defender

A premium cinematic single-page website that recreates a late-night drive through the mountains in a photorealistic matte olive green Land Rover Defender 110 while classic retro Hindi songs play automatically.

## Features

- **Cinematic Dashboard UI** — Luxury automotive aesthetic with glassmorphism panels, OLED dark theme, and subtle neon green accents
- **Dynamic Playlist** — Streams 331 retro Hindi songs from Supabase Storage (no local files)
- **START ENGINE Intro** — Cinematic ignition screen with rotating rings, dashboard glow, Defender silhouette, and engine rumble effect
- **Rich Animations** — Rotating vinyl, cassette wheel, moving road, drifting fog, animated rain, film grain, twinkling stars, headlight beam glow, suspension bounce, reflection shimmer, parallax camera movement
- **Full Player Controls** — Play/Pause, Next/Previous, Shuffle, Repeat, Seek bar, Volume slider
- **Playlist Search** — Filter songs in real-time
- **Atmosphere Modes** — Night, Rain, Highway, Golden Hour
- **Keyboard Shortcuts** — Space, Arrow keys, S, R, N, H, M
- **Capture Moment** — Screenshot generator with song info overlay
- **Auto-Skip** — Gracefully handles missing audio files

## Tech Stack

- HTML5 / CSS3 / Vanilla JavaScript
- Web Audio API (visualizer + engine rumble)
- Canvas API (stars, dust, rain, grain, visualizer)
- Supabase JS Client v2 (CDN)
- Google Fonts (Cormorant Garamond, Playfair Display, Inter, Poppins)

No build tools. No frameworks. Open `index.html` and go.

## Deployment

1. Push to a GitHub repository
2. Enable GitHub Pages (Settings → Pages → Source: main branch)
3. Access via `https://<username>.github.io/<repo>/`

## Supabase Setup

The app connects to Supabase to fetch the song catalog from the `songs` table and streams audio via `file_url`.

| Column     | Type      | Description               |
|------------|-----------|---------------------------|
| id         | int       | Primary key               |
| title      | text      | Song title                |
| artist     | text      | Artist name               |
| album      | text      | Album name                |
| duration   | float     | Duration in seconds       |
| file_url   | text      | Direct URL to audio file  |
| created_at | timestamp | Auto-generated timestamp  |

## License

Private project.
