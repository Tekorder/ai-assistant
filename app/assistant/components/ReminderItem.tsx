'use client'
import React from "react";
import { ReminderItemProps } from "../_types/ReminderItemProps";
import { useReminders } from "../_hook/useReminders";
import { FlagIcon } from "../_icons/FlagIcon";
import { InfoIcon } from "../_icons/InfoIcon";

export const ReminderItem: React.FC<ReminderItemProps> = ({ reminder }) => {
  const { toggleReminderComplete } = useReminders();

  const handleCheckboxChange = () => {
    toggleReminderComplete(reminder.id);
  };

  return (
    <div
      className="flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors"
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--assistant-hover-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}
    >
      <input
        type="checkbox"
        className="form-checkbox h-5 w-5 rounded-full mr-3"
        style={{
          accentColor: 'var(--assistant-tone-1)',
          borderColor: 'var(--assistant-border-soft)',
          background: 'var(--assistant-control-bg)',
        }}
        checked={reminder.isCompleted}
        onChange={handleCheckboxChange}
      />
      <span
        className={`flex-1 text-lg ${reminder.isCompleted ? 'line-through' : ''}`}
        style={{ color: reminder.isCompleted ? 'var(--assistant-text-muted)' : 'var(--assistant-text)' }}
      >
        {reminder.text}
      </span>
      {reminder.isFlagged && (
        <span className="ml-2" style={{ color: 'var(--assistant-tone-1)' }}>
          <FlagIcon className="h-5 w-5" />
        </span>
      )}
      <button
        className="ml-2"
        style={{ color: 'var(--assistant-text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--assistant-text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--assistant-text-muted)')}
      >
        <InfoIcon className="h-5 w-5" />
      </button>
    </div>
  );
};
