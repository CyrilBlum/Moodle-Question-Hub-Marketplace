import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';

/** A button or menu label in Moodle: German, with the English label (Moodles without the German language pack). */
const Ui: React.FC<{ de: string; en?: string }> = ({ de, en }) => (
  <span className="font-medium text-slate-900">«{de}»{en && en !== de && <span className="text-slate-500 font-normal"> (englisch: «{en}»)</span>}</span>
);

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <li className="flex gap-4">
    <span className="shrink-0 w-7 h-7 rounded-full bg-red-600 text-white text-sm font-semibold flex items-center justify-center">{n}</span>
    <div className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  </li>
);

const OpenQuestionHub = () => (
  <>
    <p>
      Moodle 4.5: Kurs › <em>Mehr</em> › <em>Fragensammlung</em>. Moodle 5.0: Kurs › <em>Mehr</em> ›{' '}
      <em>Fragensammlungen</em>, dann die gewünschte Sammlung öffnen.
    </p>
    <p>Wählen Sie im Auswahlmenü oben links <Ui de="Question Hub" />.</p>
  </>
);

/** Step-by-step guides: add a Hub package to Moodle, and publish a package (with OAuth or a Personal Access Token). */
export const GuidePage: React.FC = () => {
  const { hash } = useLocation();
  // Client-side navigation does not scroll to #importieren / #veroeffentlichen by itself.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
    <div>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Anleitung</h1>
      <p className="text-sm text-slate-500 mt-1">So holen Sie Fragenpakete in Ihr Moodle und teilen eigene Fragen mit anderen Lehrpersonen.</p>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        <a href="#importieren" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-red-300">
          <Download className="w-4 h-4 text-red-600" />Paket in Moodle hinzufügen
        </a>
        <a href="#veroeffentlichen" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-red-300">
          <Upload className="w-4 h-4 text-red-600" />Paket veröffentlichen
        </a>
      </nav>
    </div>

    <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
      <h2 className="text-base font-bold text-slate-900">Voraussetzungen</h2>
      <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
        <li>
          In Ihrem Moodle (ab Version 4.5) ist das Plugin <em>Question Hub</em> (<code>qbank_questionhub</code>) installiert.
          Fehlt es, wenden Sie sich an Ihre Moodle-Administration.
        </li>
        <li>
          Sie haben ein Konto im Hub (<Link to="/register" className="text-red-600 hover:underline">registrieren</Link>). Zum
          Durchsuchen öffentlicher Pakete ist es nicht nötig, wohl aber für private Pakete und zum Veröffentlichen.
        </li>
      </ul>
    </section>

    <section id="importieren" className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5 scroll-mt-20">
      <h2 className="text-lg font-bold text-slate-900">Paket in Moodle hinzufügen</h2>
      <ol className="space-y-5">
        <Step n={1} title="Question Hub in Moodle öffnen">
          <OpenQuestionHub />
        </Step>
        <Step n={2} title="Moodle mit Ihrem Hub-Konto verbinden (einmalig)">
          <p>
            Klicken Sie auf <Ui de="Mit Question Hub verbinden" en="Connect Question Hub Account" />, melden Sie sich im Hub
            an und bestätigen Sie die Verbindung. Danach kehren Sie automatisch zu Moodle zurück.
          </p>
          <p>Alternativ verbinden Sie mit einem Personal Access Token, siehe <a href="#pat" className="text-red-600 hover:underline">unten</a>.</p>
        </Step>
        <Step n={3} title="Paket suchen">
          <p>
            Im Reiter <Ui de="Durchsuchen" en="Browse" /> suchen Sie nach Fach, Stufe oder Stichwort. Die Vorschau zeigt die
            Fragen ohne Lösungen. Ein privates Paket öffnen Sie im Hub und klicken dort auf «Zugriff anfragen».
          </p>
        </Step>
        <Step n={4} title="Fragen importieren">
          <p>
            Klicken Sie beim Paket auf <Ui de="Fragen importieren" en="Import Questions" />, wählen Sie die Zielkategorie und
            prüfen Sie mit <Ui de="Änderungen ansehen" en="Preview changes" />, welche Fragen neu dazukommen.
            Mit <Ui de="Diese Änderungen importieren" en="Import these changes" /> übernehmen Sie sie.
          </p>
        </Step>
        <Step n={5} title="Aktuell bleiben">
          <p>
            Die Kategorie bleibt mit dem Paket verknüpft und erscheint im Reiter <Ui de="Meine Bibliothek" en="My library" />.
            Gibt es im Hub eine neue Version, erscheint dort <Ui de="Pull v…" />: Geänderte Fragen werden aktualisiert, Ihre
            eigenen Änderungen bleiben erhalten (bei Konflikten fragt Moodle nach). Unter
            <Ui de="Ältere Version wiederherstellen" en="Restore an older version" /> holen Sie eine frühere Version zurück.
          </p>
          <p>
            <Ui de="Verknüpft" en="Linked" /> heisst: keine lokalen Änderungen seit der verknüpften Version und keine neuere
            Version im Hub. Nichts wird automatisch abgeglichen: Neue Versionen holen Sie mit <Ui de="Pull" />, eigene
            Änderungen veröffentlichen Sie mit <Ui de="Push" />.
          </p>
        </Step>
      </ol>
      <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
        Ohne Plugin: Laden Sie auf der Paketseite die XML-Datei herunter und importieren Sie sie in der Fragensammlung unter
        <em> Import</em> mit dem Format <em>Moodle-XML</em>. Die Kategorie ist dann nicht mit dem Hub verknüpft und erhält keine
        Aktualisierungen.
      </p>
    </section>

    <section id="veroeffentlichen" className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5 scroll-mt-20">
      <h2 className="text-lg font-bold text-slate-900">Paket veröffentlichen</h2>
      <ol className="space-y-5">
        <Step n={1} title="Question Hub in Moodle öffnen und verbinden">
          <OpenQuestionHub />
          <p>Verbinden Sie Moodle wie oben beschrieben mit Ihrem Hub-Konto, per Anmeldung oder mit einem Token.</p>
        </Step>
        <Step n={2} title="Kategorie veröffentlichen">
          <p>
            In der Liste der Kategorien klicken Sie bei der gewünschten Kategorie auf
            <Ui de="Kategorie veröffentlichen" en="Publish category" />. Unterkategorien gehören zum Paket.
          </p>
          <p>
            Geben Sie Titel, Beschreibung, Fach, Kursstufe, Klassen, Lizenz und Sichtbarkeit an. <em>Privat</em> heisst: Nur
            Personen, denen Sie Zugriff geben, sehen die Fragen. Die Vorschau im Hub können Sie ausschalten.
            Mit <Ui de="Auf Question Hub veröffentlichen" en="Publish to Question Hub" /> erscheint das Paket als Version 1.0.0.
          </p>
        </Step>
        <Step n={3} title="Neue Versionen veröffentlichen">
          <p>
            Ändern Sie Fragen in Moodle wie gewohnt. Danach erscheint bei der Kategorie <Ui de="Push" />: Sie sehen die
            geänderten Fragen (rot entfernt, grün neu), schreiben eine kurze Release-Notiz und bestätigen die neue
            Versionsnummer. Wer das Paket importiert hat, kann die neue Version danach holen.
          </p>
        </Step>
        <Step n={4} title="Mitwirkende einladen (optional)">
          <p>
            Auf der Paketseite im Hub, Reiter «Mitwirkende», fügen Sie Kolleginnen und Kollegen mit ihrer Hub-E-Mail-Adresse
            hinzu: <em>Mitglied</em> (sieht ein privates Paket), <em>Bearbeiter/in</em> (veröffentlicht neue Versionen aus
            dem eigenen Moodle) oder <em>Admin</em> (verwaltet zusätzlich Einstellungen, Mitwirkende und Rückzug).
          </p>
        </Step>
        <Step n={5} title="Mit GitHub verknüpfen (optional)">
          <p>
            Wer die Versionen zusätzlich in einem GitHub-Repository haben möchte, verknüpft das Paket damit, siehe{' '}
            <a href="#github" className="text-red-600 hover:underline">unten</a>. Für den Hub ist das nicht nötig.
          </p>
        </Step>
      </ol>

      <div id="pat" className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 scroll-mt-20">
        <h3 className="font-semibold text-slate-900 text-sm">Verbinden mit einem Personal Access Token (PAT)</h3>
        <p className="text-sm text-slate-700">
          Nützlich, wenn die Anmeldung über den Button nicht möglich ist, etwa wegen Browser- oder Netzwerkeinstellungen.
        </p>
        <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
          <li>Im Hub oben rechts auf Ihren Namen klicken, Abschnitt «Personal Access Tokens (PAT)».</li>
          <li>«Neuen Token erstellen», einen Namen vergeben (z.B. den Namen Ihres Moodles) und erstellen.</li>
          <li>Den Token sofort kopieren: Er wird nur einmal angezeigt.</li>
          <li>
            In Moodle auf der Question-Hub-Seite ins Feld <Ui de="Oder Personal Access Token (PAT) eingeben" en="Or enter Personal Access Token (PAT)" />
            einfügen und <Ui de="Token speichern" en="Save Token" /> klicken.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          Behandeln Sie den Token wie ein Passwort. Nicht mehr benötigte Tokens widerrufen Sie im selben Abschnitt.
        </p>
      </div>

      <div id="github" className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 scroll-mt-20">
        <h3 className="font-semibold text-slate-900 text-sm">Paket mit GitHub verknüpfen (optional)</h3>
        <p className="text-sm text-slate-700">
          Jede neue Version wird dann als Datei <code>Paket-ID.xml</code> in das Repository committet, mit den
          Versionshinweisen (Release-Notiz) als Commit-Nachricht, und mit <code>v</code> plus Versionsnummer getaggt
          (z.B. <code>v1.2.0</code>). Das gilt auch für Versionen, die Mitwirkende veröffentlichen.
        </p>
        <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
          <li>
            Auf GitHub unter Settings › Developer settings › Fine-grained tokens einen Token erstellen mit der Berechtigung
            «Contents: Read and write». Damit der Hub neue Repositorys selbst anlegt: «All repositories» und zusätzlich
            «Administration: Read and write». Sonst genügt der Zugriff auf ein bereits bestehendes Repository.
          </li>
          <li>Im Hub oben rechts auf Ihren Namen klicken, Abschnitt «GitHub-Verbindung», Token einfügen und verbinden.</li>
          <li>
            Die Adresse des Repositorys (z.B. <code>git@github.com:konto/fragen.git</code>) beim Veröffentlichen eintragen, im
            Hub unter <Link to="/upload" className="text-red-600 hover:underline">Paket hochladen</Link> oder in Moodle im Feld{' '}
            <Ui de="GitHub-Repository (optional)" en="GitHub repository (optional)" />. Im Hub füllt «Neues Repository
            vorschlagen» die Adresse <code>git@github.com:Ihr-Konto/Paket-ID.git</code> aus. Existiert das Repository noch
            nicht, legt der Hub es als privates Repository an. Bei einem bestehenden Paket tragen Sie die Adresse in den
            Paket-Einstellungen ein: Die aktuelle Version wird dann sofort committet.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          Der Hub speichert den Token verschlüsselt und zeigt ihn nie wieder an. Committet wird mit dem Token der Person, die
          das Repository verknüpft hat. Scheitert ein Commit, bleibt die Version im Hub trotzdem veröffentlicht; den Fehler
          sehen Admins des Pakets im Reiter «Versionen». Ein leeres Feld in den Einstellungen löst die Verknüpfung.
        </p>
      </div>

      <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
        Ohne Plugin: Exportieren Sie die Fragen in Moodle als Moodle-XML und laden Sie die Datei unter{' '}
        <Link to="/upload" className="text-red-600 hover:underline">Paket hochladen</Link> hoch. Neue Versionen müssen Sie dann
        jeweils von Hand exportieren und hochladen.
      </p>
    </section>
  </div>
  );
};
