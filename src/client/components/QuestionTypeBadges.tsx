import React from 'react';
import {
  ArrowLeftRight,
  CircleHelp,
  Code2,
  ListChecks,
  PenLine,
  Sigma,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';
import codeRunnerLogo from '../assets/question-types/coderunner.jpg';
import stackLogo from '../assets/question-types/stack.png';

type BadgeDefinition = {
  label: string;
  icon: LucideIcon;
  image?: string;
};

const badgeDefinitions: Record<string, BadgeDefinition> = {
  coderunner: { label: 'CodeRunner', icon: Code2, image: codeRunnerLogo },
  stack: { label: 'STACK', icon: Sigma, image: stackLogo },
  cloze: { label: 'Lückentext', icon: TextCursorInput },
  multianswer: { label: 'Lückentext', icon: TextCursorInput },
  multichoice: { label: 'Multiple Choice', icon: ListChecks },
  truefalse: { label: 'Wahr/Falsch', icon: CircleHelp },
  shortanswer: { label: 'Kurzantwort', icon: TextCursorInput },
  numerical: { label: 'Numerisch', icon: Sigma },
  calculated: { label: 'Berechnet', icon: Sigma },
  calculatedsimple: { label: 'Berechnet', icon: Sigma },
  essay: { label: 'Freitext', icon: PenLine },
  matching: { label: 'Zuordnung', icon: ArrowLeftRight },
};

const normalizeType = (type: string) => type.toLowerCase().replace(/[^a-z0-9]/g, '');

const titleFromType = (type: string) => type
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

interface Props {
  breakdown?: Record<string, number>;
  max?: number;
}

export const QuestionTypeBadges: React.FC<Props> = ({ breakdown, max = 5 }) => {
  const types = Object.entries(breakdown || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  if (types.length === 0) return null;

  const visibleTypes = types.slice(0, max);

  return (
    <div className="qh-question-type-badges" aria-label="Fragetypen">
      {visibleTypes.map(([type, count]) => {
        const definition = badgeDefinitions[normalizeType(type)];
        const Icon = definition?.icon || CircleHelp;
        const label = definition?.label || titleFromType(type);
        return (
          <span className="qh-question-type-badge" key={type} title={`${label}: ${count}`}>
            {definition?.image ? (
              <img src={definition.image} alt="" aria-hidden="true" />
            ) : (
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{label}</span>
            <span className="qh-question-type-badge__count">{count}</span>
          </span>
        );
      })}
      {types.length > max && (
        <span className="qh-question-type-badge" title={types.slice(max).map(([type]) => titleFromType(type)).join(', ')}>
          +{types.length - max} weitere
        </span>
      )}
    </div>
  );
};
