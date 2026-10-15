import React, { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  packageId: string;
  requests: any[];
  onChanged: () => void;
}

const STATUS_LABEL: Record<string, string> = { pending: 'Offen', approved: 'Freigegeben', denied: 'Abgelehnt' };

const RequestRow: React.FC<{ packageId: string; request: any; onDone: (text: string, ok: boolean) => void }> = ({ packageId, request, onDone }) => {
  const pending = request.status === 'pending';
  const [editing, setEditing] = useState(pending);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const name = request.requester.name;

  const decide = async (status: 'approved' | 'denied') => {
    setBusy(true);
    try {
      const result = await api.setPackageAccessRequestStatus(packageId, request.id, status, reply.trim() || undefined);
      const verb = status === 'approved' ? 'freigegeben' : 'abgelehnt';
      onDone(result?.notification_sent
        ? `Anfrage von ${name} ${verb}. ${name} wurde per E-Mail benachrichtigt.`
        : `Anfrage von ${name} ${verb}. Die E-Mail an ${name} konnte nicht gesendet werden.`, !!result?.notification_sent);
      setReply('');
    } catch (err: any) {
      onDone(err.message || 'Zugriffsanfrage konnte nicht aktualisiert werden.', false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-slate-700">
          <div className="font-medium">
            {name}{request.requester.institution ? ` · ${request.requester.institution}` : ''}
          </div>
          {request.requester.email ? (
            <a href={`mailto:${request.requester.email}`} className="text-xs text-slate-500 hover:underline">{request.requester.email}</a>
          ) : (
            <div className="text-xs text-slate-500">Kontaktdaten nicht freigegeben</div>
          )}
          <div className="text-xs text-slate-400">angefragt am {new Date(request.created_at).toLocaleDateString('de-CH')}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border ${
          request.status === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : request.status === 'denied' ? 'bg-slate-50 border-slate-200 text-slate-600'
              : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>{STATUS_LABEL[request.status] || request.status}</span>
      </div>

      {request.message && (
        <blockquote className="text-sm text-slate-700 whitespace-pre-line border-l-2 border-slate-200 pl-3">{request.message}</blockquote>
      )}
      {!pending && request.response_message && (
        <div className="text-xs text-slate-500">
          Ihre Antwort: <span className="whitespace-pre-line text-slate-700">{request.response_message}</span>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600" htmlFor={`reply-${request.id}`}>
            Nachricht an {name} (optional, wird mit dem Entscheid per E-Mail gesendet)
          </label>
          <textarea
            id={`reply-${request.id}`}
            value={reply}
            onChange={e => setReply(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {request.status !== 'approved' && (
              <button disabled={busy} onClick={() => decide('approved')} className="text-xs px-3 py-1.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Freigeben</button>
            )}
            {request.status !== 'denied' && (
              <button disabled={busy} onClick={() => decide('denied')} className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {request.status === 'approved' ? 'Freigabe entziehen' : 'Ablehnen'}
              </button>
            )}
            {!pending && (
              <button disabled={busy} onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:underline">Abbrechen</button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:underline">Entscheid ändern</button>
      )}
    </div>
  );
};

/** Owner-only list of access requests to a private package: approve or deny, each with an optional reply. */
export const AccessRequests: React.FC<Props> = ({ packageId, requests, onChanged }) => {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const sorted = [...requests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
      <h2 className="text-base font-bold text-slate-900">Zugriffsanfragen</h2>
      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 border ${
          message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {message.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Anfragen.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {sorted.map(request => (
            <RequestRow
              key={`${request.id}-${request.status}-${request.updated_at}`}
              packageId={packageId}
              request={request}
              onDone={(text, ok) => { setMessage({ ok, text }); onChanged(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
