import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="font-medium text-slate-700">Moodle Question Hub — Schweizer Lehrplan-Fragenpool (EDK / MAR)</p>
        <p className="mt-1 text-xs">
          Open-Source Plattform für Gymnasiallehrpersonen. Austausch geprüfter Moodle-XML-Fragensammlungen.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Entwickelt für Moodle 4.5 LTS und Moodle 5.x • 100% kostenlose Community-Nutzung
        </p>
      </div>
    </footer>
  );
};
