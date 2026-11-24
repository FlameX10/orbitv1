import React from 'react';
import { StatusPill } from './ui';

export default function QualificationBadge({ status, score }) {
  return (
    <div className="inline-flex items-center gap-2">
      <StatusPill status={status} />
      {score !== undefined && score !== null && score > 0 && (
        <span className="pill tone-iris num">Score {score}</span>
      )}
    </div>
  );
}
