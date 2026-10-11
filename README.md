# JarByVed

An advanced, responsive web-based Java ME (J2ME) retro gaming emulator platform preserving **1,087 classic mobile games**. Playable across desktops, laptops, tablets, and smartphones with automatic **Google Cloud Save Synchronization**.

Developed by **[Vedant Joliya](https://vedantjoliya.free.nf/)**.

---

## Features

- **1,087 Preserved Games**: Classic titles from Gameloft, Digital Chocolate, EA Mobile, Macrospace, and more.
- **Client-Side WebAssembly Execution**: Powered by CheerpJ and FreeJ2ME to run authentic bytecode in modern browsers.
- **Google Cloud Saves**: Syncs game saves, record stores (RMS), favorites, and recents across devices via Firebase.
- **Fully Responsive**:
  - Desktop & laptop keyboard support (`Arrow keys`, `Enter`, `F1`/`F2`, numeric keypad).
  - Mobile & tablet touch controls with dual virtual keypads (portrait & landscape).
- **Custom Game Uploads**: Upload and save your own `.jar` game archives directly to your personal cloud library.
- **Clean UI**: Modern, minimalist dark interface with zero emojis and sharp SVG vector icons.

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES modules), CSS3, HTML5
- **Bundler & Server**: Vite
- **Emulation Engine**: FreeJ2ME & CheerpJ WebAssembly
- **Cloud & Auth**: Google Firebase (Authentication, Firestore, Storage)
- **Deployment**: Vercel

---

## Local Development

```bash
# Clone the repository
git clone https://github.com/vedantjoliya/Jar-by-Ved.git
cd Jar-by-Ved

# Install dependencies
npm install

# Start local dev server
npm run dev
```

---

## Deployment on Vercel

1. Import the repository `vedantjoliya/Jar-by-Ved` on [Vercel](https://vercel.com).
2. Framework Preset: **Vite**.
3. Build Command: `npm run build`.
4. Output Directory: `dist`.
5. Deploy!

---

## Author

- **Vedant Joliya**
- Portfolio: [vedantjoliya.free.nf](https://vedantjoliya.free.nf/)
- LinkedIn: [linkedin.com/in/vedant-joliya](https://linkedin.com/in/vedant-joliya)
- GitHub: [github.com/vedantjoliya](https://github.com/vedantjoliya)
- Email: `contactsvedant@gmail.com`
