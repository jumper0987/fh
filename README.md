# Baufortschritt Semester

Gamification-Tracker für die FH-Vorlesungen (React + Vite + Supabase).
Jede Person trägt einmalig ihren Namen ein und hakt ihre eigenen Termine ab —
alle sehen sich in einer gemeinsamen Bestenliste.

## 1. Supabase einrichten

Du kannst entweder eine **neue Tabelle im bestehenden Poker-Tracker-Projekt**
anlegen oder ein **eigenes neues Supabase-Projekt** verwenden.

1. Supabase-Projekt öffnen → SQL-Editor
2. Inhalt von `supabase/schema.sql` einfügen und ausführen
3. Unter *Project Settings → API* die **Project URL** und den **anon public key** kopieren

## 2. Lokale Konfiguration

```bash
cp .env.example .env
```

`.env` ausfüllen:

```
VITE_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
VITE_SUPABASE_ANON_KEY=DEIN-ANON-KEY
```

## 3. Installieren & lokal testen

```bash
npm install
npm run dev
```

## 4. Auf GitHub Pages deployen

1. In `vite.config.js` die Zeile `base: "/fh-baufortschritt/"` an deinen
   tatsächlichen Repo-Namen anpassen (z.B. `/tracker2/`).
2. Repo auf GitHub anlegen und pushen.
3. Damit die Umgebungsvariablen auch im gebauten Static-Build stecken,
   entweder:
   - lokal bauen & deployen: `npm run deploy` (nutzt deine lokale `.env`), oder
   - GitHub Actions nutzen: Secrets `VITE_SUPABASE_URL` und
     `VITE_SUPABASE_ANON_KEY` im Repo unter *Settings → Secrets* anlegen,
     dann den Workflow in `.github/workflows/deploy.yml` aktivieren
     (Pages-Quelle in den Repo-Settings auf "GitHub Actions" stellen).

```bash
npm run build
npm run deploy
```

Die Seite ist danach unter `https://DEIN-USERNAME.github.io/DEIN-REPO/` erreichbar.

## Hinweise

- Es gibt kein Passwort — wer den Namen eines anderen eingibt, sieht/ändert
  dessen Fortschritt. Für einen Freundeskreis/Studienjahrgang ist das wie
  beim Poker-Tracker bewusst so gehalten.
- Die Vorlesungstermine stecken fix in `src/data/events.js` (Stand: Export vom
  11.09.2026). Bei einem neuen Semester einfach die `RAW`-Liste dort ersetzen.
- `anon`-Key ist bewusst öffentlich lesbar/schreibbar (RLS erlaubt das) —
  nicht für sensible Daten verwenden.
