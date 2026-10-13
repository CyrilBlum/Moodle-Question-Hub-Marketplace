# Moodle Question Hub — Marketplace Platform & REST APIs

Community-Plattform und REST-API-Dienst für den Austausch von Moodle-XML-Fragensammlungen gemäss Schweizer Gymnasiallehrplan (EDK Rahmenlehrplan / MAR).

## Features

- **Fastify v4 + TypeScript**: Performante und typsichere REST-API auf Port 8090.
- **Sicherer XML-Parser**:
  - Schutz vor XML External Entity (XXE) und Entity Expansion (Billion Laughs) durch Regex-Vorfilterung und `processEntities: false`.
  - CDATA-Erkennung für Informatik-Fachfragen (z.B. Fragen über `<!DOCTYPE html>`).
  - Umfassende Validierung von 7 Moodle-Fragentypen (`multichoice`, `truefalse`, `shortanswer`, `numerical`, `matching`, `cloze`, `essay`).
  - Diskrete Moodle-Bewertungsstufen gemäss `question_bank::fraction_options_full()`.
  - Erkennung von Base64-Mediendaten mit Magic-Byte-MIME-Prüfung.
- **Schweizer Gymnasial-Taxonomie**:
  - 15 Fächer gemäss EDK RLP / MAR (Informatik, Mathematik, Physik, Biologie, Chemie, etc.).
  - Gymnasialstufen GYM1 bis GYM4 (9. bis 12. Schuljahr).
  - Kursstufen: Grundlagenfach (GF), Schwerpunktfach (SF), Ergänzungsfach (EF), Freifach (FF).
  - 21 Kantone mit kantonalen Lehrplan-Bezeichnungen.
- **Content-Addressable Storage (CAS)**:
  - Unveränderliche Speicherung unter `artifacts/sha256/ab/cd/<hash>.xml`.
  - SHA-256 Deduplizierung und atomare Umbenennung.
  - Streng monoton steigende SemVer-Freigaben (`releases/<id>/<version>/package.xml`).
  - Read-Only Dateirechte (`0o444`).
- **Pädagogische Vorschau**:
  - Vollständiges serverseitiges Bereinigen von Musterlösungen, Punkteanteilen und Feedback.
  - Sichere Visualisierung von mathematischen Formeln und Diagrammen im Web.
- **Authentifizierung & Moodle-Anbindung**:
  - Lehrpersonen-Registrierung und Login (Passwort-Hashing mittels scrypt).
  - Personal Access Tokens (PAT) mit Einmal-Anzeige für die Moodle-Plugin-Konfiguration.
  - RFC 7636 OAuth 2.0 PKCE Authorization Code Flow.
- **Modulare Monetarisierungs-Abstraktion**:
  - `IMonetisationService` Schnittstelle.
  - Standardmässig `MONETISATION_ENABLED=false` (100% kostenlose Community-Nutzung).
- **Eingebettetes Vite React 18 SPA**:
  - Moderne, barrierefreie Oberfläche mit Tailwind CSS.
  - Serviert über `@fastify/static` auf demselben Port (8090).

## Lokale Entwicklung & Tests

```bash
# Abhängigkeiten installieren
npm install

# Datenbank-Migrationen und Seeding (SQLite lokal)
npm run migrate
npm run seed

# Testsuite ausführen (Vitest)
npm test

# Client und Server bauen
npm run build

# Entwicklungsserver starten
npm run dev
```

## Produktion (Hetzner)

- Zielpfad: `/mnt/HC_Volume_100926434/apps/moodle-question-hub-marketplace/`
- Speicherpfad: `/mnt/HC_Volume_100926434/marketplace/packages/`
- MariaDB-Datenbank: `questionhub` (Port 3306)
- Systemd-Dienst: `moodle-question-hub.service` (Port 8090)
- Nginx Reverse Proxy: `https://hub.cblum.ch`
