import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="font-medium text-slate-700">Moodle Question Hub — Schweizer Lehrplan-Fragenpool (EDK / MAR)</p>
        <p className="mt-1 text-xs">
          Open-Source Plattform für Gymnasiallehrpersonen. Austausch veröffentlichter Moodle-XML-Fragensammlungen.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Fragetypen und Voraussetzungen stehen bei jedem Paket.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Alle Fragenpakete stehen unter der beim Paket angegebenen{' '}
          <a href="https://creativecommons.org/licenses/?lang=de" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-700">Creative-Commons-Lizenz</a>{' '}
          (CC BY, CC BY-SA oder CC0). Öffentliche Pakete sind offene Bildungsmaterialien: verwenden, forken und verbessern ausdrücklich erwünscht.
        </p>
      </div>
    </footer>
  );
};
