# RetroDrive Defender

A premium cinematic single-page website that recreates a late-night drive through the mountains in a photorealistic matte olive green Land Rover Defender 110 while classic retro Hindi songs play automatically.

## Features

- **Cinematic Dashboard UI** — Luxury automotive aesthetic with glassmorphism panels, OLED dark theme, and subtle neon green accents
- **Dynamic Playlist** — Streams retro Hindi songs from `songs.csv` via direct Supabase public URLs (no local audio files)
- **START ENGINE Intro** — Cinematic ignition screen with rotating rings, dashboard glow, and Defender silhouette
- **Rich Animations** — Rotating vinyl, cassette wheel, moving road, drifting fog, animated rain, film grain, twinkling stars, headlight beam glow, suspension bounce, reflection shimmer, parallax camera movement
- **Full Player Controls** — Play/Pause, Next/Previous, Shuffle, Repeat, Seek bar, Volume slider
- **Clean Display Titles** — Storage filenames are auto-cleaned in-app (numbering, movie prefixes, `DownloadMing` / `Raag.Me` / `MyMp3Song` / `Mr-Jatt` tags, extensions and underscores are removed, then title-cased)
- **Atmosphere Modes** — Night, Rain, Highway, Golden Hour
- **Keyboard Shortcuts** — Space, Arrow keys, S, R, N, H, M
- **Capture Moment** — Screenshot generator with song info overlay
- **Auto-Skip** — Gracefully handles missing audio files

## Tech Stack

- HTML5 / CSS3 / Vanilla JavaScript
- Web Audio API (visualizer)
- Canvas API (stars, dust, rain, grain, visualizer)
- Google Fonts (Cormorant Garamond, Playfair Display, Inter, Poppins)

No build tools. No frameworks. Open `index.html` and go.

## Deployment

1. Push to a GitHub repository
2. Enable GitHub Pages (Settings → Pages → Source: main branch)
3. Access via `https://<username>.github.io/<repo>/`

## Music Library (`songs.csv`)

`songs.csv` is the only source of truth for the playlist. It ships with the project and is loaded on page load.

| Column      | Type | Description                            |
|-------------|------|----------------------------------------|
| name        | text | Original filename in Supabase Storage  |
| public_url  | text | Direct public URL to the audio file    |

- Files in Supabase Storage are never renamed; `public_url` is used as-is.
- Display titles are generated in the app from `name` (see Features).
- Invalid, empty, or non-audio rows are skipped automatically.

## Supabase Setup

1. Create a public storage bucket (e.g. `music`) in Supabase.
2. Upload the `.mp3` files.
3. Copy the public URL of each file into `songs.csv` next to the original filename.
4. Regenerate `public_url` values whenever files are re-uploaded.

## License

Private project.
