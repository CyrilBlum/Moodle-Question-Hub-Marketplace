import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import 'altcha';

/** ALTCHA strings in Swiss Standard German with the formal «Sie». */
const STRINGS = JSON.stringify({
  ariaLinkLabel: 'Altcha.org besuchen',
  enterCode: 'Code eingeben',
  enterCodeAria: 'Geben Sie den Code ein, den Sie hören. Drücken Sie die Leertaste, um das Audio abzuspielen.',
  error: 'Überprüfung fehlgeschlagen. Bitte versuchen Sie es später erneut.',
  expired: 'Überprüfung abgelaufen. Bitte versuchen Sie es erneut.',
  verificationRequired: 'Überprüfung erforderlich.',
  footer: 'Geschützt durch <a href="https://altcha.org/" target="_blank" rel="noopener" aria-label="Altcha.org besuchen">ALTCHA</a>',
  getAudioChallenge: 'Audio-Aufgabe anfordern',
  label: 'Ich bin kein Roboter',
  loading: 'Wird geladen …',
  reload: 'Neu laden',
  verify: 'Überprüfen',
  verified: 'Überprüft',
  verifying: 'Wird überprüft …',
  waitAlert: 'Überprüfung läuft, bitte warten.',
});

export interface CaptchaHandle {
  /** A solution is valid only once: call after every submit so the widget solves a new challenge. */
  reset: () => void;
}

interface Props {
  onChange: (payload: string | null) => void;
}

/**
 * Self-hosted proof-of-work captcha (ALTCHA, MIT). The browser solves the challenge from /api/v1/auth/captcha
 * as soon as the form is shown; no third party is contacted.
 */
export const Captcha = forwardRef<CaptchaHandle, Props>(({ onChange }, ref) => {
  const widgetRef = useRef<HTMLElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ state: string; payload?: string }>).detail;
      onChangeRef.current(detail?.state === 'verified' && detail.payload ? detail.payload : null);
    };
    widget.addEventListener('statechange', handler);
    return () => widget.removeEventListener('statechange', handler);
  }, []);

  useImperativeHandle(ref, () => ({
    reset: () => {
      const widget = widgetRef.current as any;
      onChangeRef.current(null);
      widget?.reset?.();
      widget?.verify?.();
    },
  }), []);

  // The custom element is inline by default; the block wrapper keeps the form's vertical spacing.
  return (
    <div>
      <altcha-widget
        ref={widgetRef}
        challengeurl="/api/v1/auth/captcha"
        auto="onload"
        strings={STRINGS}
        style={{ '--altcha-max-width': '100%' }}
      />
    </div>
  );
});

Captcha.displayName = 'Captcha';
